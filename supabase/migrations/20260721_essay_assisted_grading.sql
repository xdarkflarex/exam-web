-- PATCH_VERSION: essay-assisted-grading-20260722-r3
-- Essay grading pilot for simulation exams.
-- Preconditions:
--   - Core tables from the runtime schema already exist.
--   - profiles.role may contain student, teacher, admin.
-- This migration is incremental; it is not a fresh-schema baseline.

BEGIN;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS essay_max_score numeric NOT NULL DEFAULT 1;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')) NOT VALID;
ALTER TABLE public.questions VALIDATE CONSTRAINT questions_question_type_check;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_essay_max_score_check;
ALTER TABLE public.questions
  ADD CONSTRAINT questions_essay_max_score_check
  CHECK (essay_max_score > 0 AND essay_max_score <= 10);

ALTER TABLE public.exam_questions
  DROP CONSTRAINT IF EXISTS exam_questions_question_type_check;
ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')) NOT VALID;
ALTER TABLE public.exam_questions VALIDATE CONSTRAINT exam_questions_question_type_check;

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_question_type_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_question_type_check
  CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')) NOT VALID;
ALTER TABLE public.student_answers VALIDATE CONSTRAINT student_answers_question_type_check;

ALTER TABLE public.student_answers
  ADD COLUMN IF NOT EXISTS max_score numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS grading_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS grading_feedback text,
  ADD COLUMN IF NOT EXISTS grading_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS grading_confidence numeric,
  ADD COLUMN IF NOT EXISTS grading_method text,
  ADD COLUMN IF NOT EXISTS grading_rubric_version integer,
  ADD COLUMN IF NOT EXISTS answer_hash text,
  ADD COLUMN IF NOT EXISTS ai_score numeric,
  ADD COLUMN IF NOT EXISTS ai_feedback text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS graded_by uuid,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

-- The live AFTER INSERT OR UPDATE trigger already calls this function. Replace
-- it before the max_score backfill below so an UPDATE that leaves is_correct
-- unchanged contributes zero analytics delta instead of counting a new answer.
-- The legacy binary analytics table cannot represent partial-credit essays, so
-- trusted essay writes are also excluded from that aggregate.
CREATE OR REPLACE FUNCTION public.update_exam_analytics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam_id text;
  v_total_delta integer;
  v_correct_delta integer;
  v_incorrect_delta integer;
BEGIN
  IF current_setting('app.exam_grading_trusted', true) = 'on'
     AND NEW.question_type = 'essay' THEN
    RETURN NEW;
  END IF;

  SELECT ea.exam_id INTO v_exam_id
  FROM public.exam_attempts ea
  WHERE ea.id = NEW.attempt_id;

  IF TG_OP = 'INSERT' THEN
    v_total_delta := 1;
    v_correct_delta := CASE WHEN NEW.is_correct IS TRUE THEN 1 ELSE 0 END;
    v_incorrect_delta := CASE WHEN NEW.is_correct IS FALSE THEN 1 ELSE 0 END;
  ELSE
    v_total_delta := 0;
    v_correct_delta := CASE WHEN NEW.is_correct IS TRUE THEN 1 ELSE 0 END
      - CASE WHEN OLD.is_correct IS TRUE THEN 1 ELSE 0 END;
    v_incorrect_delta := CASE WHEN NEW.is_correct IS FALSE THEN 1 ELSE 0 END
      - CASE WHEN OLD.is_correct IS FALSE THEN 1 ELSE 0 END;
  END IF;

  UPDATE public.exam_analytics
  SET
    total_attempts = GREATEST(0, COALESCE(total_attempts, 0) + v_total_delta),
    correct_count = GREATEST(0, COALESCE(correct_count, 0) + v_correct_delta),
    incorrect_count = GREATEST(0, COALESCE(incorrect_count, 0) + v_incorrect_delta),
    difficulty_index = (
      GREATEST(0, COALESCE(correct_count, 0) + v_correct_delta)::numeric
      / NULLIF(GREATEST(0, COALESCE(total_attempts, 0) + v_total_delta), 0)
      * 100
    ),
    updated_at = now()
  WHERE exam_id = v_exam_id
    AND question_id = NEW.question_id;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.exam_analytics (
        exam_id, question_id, total_attempts, correct_count, incorrect_count, difficulty_index
      ) VALUES (
        v_exam_id,
        NEW.question_id,
        1,
        CASE WHEN NEW.is_correct IS TRUE THEN 1 ELSE 0 END,
        CASE WHEN NEW.is_correct IS FALSE THEN 1 ELSE 0 END,
        CASE WHEN NEW.is_correct IS TRUE THEN 100 ELSE 0 END
      );
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.exam_analytics
      SET
        total_attempts = GREATEST(0, COALESCE(total_attempts, 0) + v_total_delta),
        correct_count = GREATEST(0, COALESCE(correct_count, 0) + v_correct_delta),
        incorrect_count = GREATEST(0, COALESCE(incorrect_count, 0) + v_incorrect_delta),
        difficulty_index = (
          GREATEST(0, COALESCE(correct_count, 0) + v_correct_delta)::numeric
          / NULLIF(GREATEST(0, COALESCE(total_attempts, 0) + v_total_delta), 0)
          * 100
        ),
        updated_at = now()
      WHERE exam_id = v_exam_id
        AND question_id = NEW.question_id;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Existing rows may contain weighted scores greater than the temporary default.
-- The live analytics trigger treats an UPDATE as answer activity. Disable only
-- that named trigger around this metadata backfill so historical aggregates are
-- not changed. Refuse an unexpected pre-existing trigger state instead of
-- silently changing DISABLED/REPLICA/ALWAYS to ordinary enabled.
DO $$
DECLARE
  v_trigger_state text;
BEGIN
  SELECT trigger_row.tgenabled::text
  INTO v_trigger_state
  FROM pg_trigger trigger_row
  JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
  JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
  WHERE schema_row.nspname = 'public'
    AND table_row.relname = 'student_answers'
    AND trigger_row.tgname = 'update_analytics_on_answer'
    AND NOT trigger_row.tgisinternal;

  IF v_trigger_state IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_TRIGGER_MISSING: public.student_answers.update_analytics_on_answer';
  END IF;
  IF v_trigger_state <> 'O' THEN
    RAISE EXCEPTION 'UNEXPECTED_TRIGGER_STATE: public.student_answers.update_analytics_on_answer=%',
      v_trigger_state;
  END IF;
END;
$$;

-- Both trigger state changes below are transactional in PostgreSQL.
ALTER TABLE public.student_answers
  DISABLE TRIGGER update_analytics_on_answer;

UPDATE public.student_answers sa
SET max_score = GREATEST(
  COALESCE((
    SELECT eq.score
    FROM public.exam_attempts ea
    JOIN public.exam_questions eq
      ON eq.exam_id = ea.exam_id
     AND eq.question_id = sa.question_id
    WHERE ea.id = sa.attempt_id
    LIMIT 1
  ), sa.max_score, 1),
  COALESCE(sa.score, 0),
  0.0001
);

ALTER TABLE public.student_answers
  ENABLE TRIGGER update_analytics_on_answer;

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_grading_status_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_grading_status_check
  CHECK (grading_status IN ('not_required', 'auto_graded', 'pending_review', 'approved', 'failed'));

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_grading_confidence_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_grading_confidence_check
  CHECK (grading_confidence IS NULL OR (grading_confidence >= 0 AND grading_confidence <= 1));

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_max_score_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_max_score_check
  CHECK (max_score > 0 AND (score IS NULL OR (score >= 0 AND score <= max_score))) NOT VALID;
ALTER TABLE public.student_answers VALIDATE CONSTRAINT student_answers_max_score_check;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS grading_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS objective_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS essay_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_grading_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submission_hash text,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

ALTER TABLE public.exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_grading_status_check;
ALTER TABLE public.exam_attempts
  ADD CONSTRAINT exam_attempts_grading_status_check
  CHECK (grading_status IN ('not_required', 'pending_review', 'completed', 'failed'));

-- Preserve visibility/statistics for attempts completed before this pilot.
UPDATE public.exam_attempts
SET
  grading_status = 'completed',
  graded_at = COALESCE(graded_at, submit_time, updated_at, now())
WHERE status IN ('submitted', 'graded')
  AND grading_status = 'not_required';

CREATE TABLE IF NOT EXISTS public.question_grading_configs (
  question_id text PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  reference_answer text NOT NULL,
  rubric jsonb NOT NULL,
  rubric_version integer NOT NULL DEFAULT 1,
  minimum_confidence numeric NOT NULL DEFAULT 0.75,
  ai_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_grading_configs_rubric_array_check CHECK (jsonb_typeof(rubric) = 'array'),
  CONSTRAINT question_grading_configs_version_check CHECK (rubric_version > 0),
  CONSTRAINT question_grading_configs_confidence_check CHECK (minimum_confidence >= 0 AND minimum_confidence <= 1)
);

CREATE TABLE IF NOT EXISTS public.essay_grading_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_answer_id text NOT NULL REFERENCES public.student_answers(id) ON DELETE CASCADE,
  attempt_id text NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  review_hash text NOT NULL,
  answer_hash text NOT NULL,
  rubric_version integer NOT NULL,
  ai_score numeric,
  ai_confidence numeric,
  ai_feedback text,
  ai_breakdown jsonb,
  ai_model text,
  final_score numeric NOT NULL,
  final_feedback text,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT essay_grading_reviews_version_check CHECK (rubric_version > 0),
  CONSTRAINT essay_grading_reviews_ai_score_check CHECK (ai_score IS NULL OR ai_score >= 0),
  CONSTRAINT essay_grading_reviews_confidence_check CHECK (
    ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
  ),
  CONSTRAINT essay_grading_reviews_final_score_check CHECK (final_score >= 0),
  CONSTRAINT essay_grading_reviews_idempotency_key UNIQUE (student_answer_id, review_hash)
);

CREATE INDEX IF NOT EXISTS idx_student_answers_pending_essay
  ON public.student_answers (attempt_id, grading_status)
  WHERE question_type = 'essay';
CREATE INDEX IF NOT EXISTS idx_essay_grading_reviews_answer
  ON public.essay_grading_reviews (student_answer_id, created_at DESC);

ALTER TABLE public.question_grading_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_grading_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and teacher read grading configs" ON public.question_grading_configs;
CREATE POLICY "Admin and teacher read grading configs"
  ON public.question_grading_configs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (
            p.role = 'teacher'
            AND (
              question_grading_configs.created_by = p.id
              OR EXISTS (
                SELECT 1
                FROM public.exam_questions eq
                JOIN public.exams e ON e.id = eq.exam_id
                LEFT JOIN public.classes c ON c.id = e.class_id
                WHERE eq.question_id = question_grading_configs.question_id
                  AND (e.created_by = p.id OR c.teacher_id = p.id)
              )
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Admin and teacher read grading reviews" ON public.essay_grading_reviews;
CREATE POLICY "Admin and teacher read grading reviews"
  ON public.essay_grading_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.exam_attempts ea ON ea.id = essay_grading_reviews.attempt_id
      JOIN public.exams e ON e.id = ea.exam_id
      LEFT JOIN public.classes c ON c.id = e.class_id
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'teacher' AND (e.created_by = p.id OR c.teacher_id = p.id))
        )
    )
  );

REVOKE ALL ON TABLE public.question_grading_configs, public.essay_grading_reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.question_grading_configs, public.essay_grading_reviews FROM authenticated;
GRANT SELECT ON TABLE public.question_grading_configs, public.essay_grading_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.create_essay_question(
  p_question_id text,
  p_content text,
  p_source_exam text,
  p_difficulty integer,
  p_max_score numeric,
  p_reference_answer text,
  p_rubric jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_rubric_total numeric;
  v_rubric_count integer;
  v_distinct_criterion_count integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_question_id IS NULL OR btrim(p_question_id) = '' THEN
    RAISE EXCEPTION 'INVALID_QUESTION_ID';
  END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) < 5 OR char_length(p_content) > 20000 THEN
    RAISE EXCEPTION 'INVALID_CONTENT';
  END IF;
  IF p_reference_answer IS NULL OR char_length(btrim(p_reference_answer)) < 3 OR char_length(p_reference_answer) > 30000 THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_ANSWER';
  END IF;
  IF p_max_score IS NULL OR p_max_score <= 0 OR p_max_score > 10 THEN
    RAISE EXCEPTION 'INVALID_MAX_SCORE';
  END IF;
  IF p_rubric IS NULL OR jsonb_typeof(p_rubric) <> 'array' OR jsonb_array_length(p_rubric) = 0 THEN
    RAISE EXCEPTION 'INVALID_RUBRIC';
  END IF;

  IF jsonb_array_length(p_rubric) > 20 OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rubric) AS criterion
    WHERE jsonb_typeof(criterion) IS DISTINCT FROM 'object'
       OR jsonb_typeof(criterion -> 'criterion_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(criterion -> 'title') IS DISTINCT FROM 'string'
       OR jsonb_typeof(criterion -> 'description') IS DISTINCT FROM 'string'
       OR jsonb_typeof(criterion -> 'max_score') IS DISTINCT FROM 'number'
       OR char_length(btrim(criterion ->> 'criterion_id')) NOT BETWEEN 1 AND 100
       OR char_length(btrim(criterion ->> 'title')) NOT BETWEEN 1 AND 300
       OR char_length(criterion ->> 'description') > 4000
       OR (criterion ->> 'max_score')::numeric <= 0
       OR (criterion ->> 'max_score')::numeric > p_max_score
  ) THEN
    RAISE EXCEPTION 'INVALID_RUBRIC_CRITERION';
  END IF;

  SELECT
    COUNT(*),
    COUNT(DISTINCT btrim(criterion ->> 'criterion_id')),
    COALESCE(SUM((criterion ->> 'max_score')::numeric), 0)
  INTO v_rubric_count, v_distinct_criterion_count, v_rubric_total
  FROM jsonb_array_elements(p_rubric) AS criterion;

  IF v_rubric_count <> v_distinct_criterion_count THEN
    RAISE EXCEPTION 'DUPLICATE_RUBRIC_CRITERION';
  END IF;
  IF abs(v_rubric_total - p_max_score) > 0.0001 THEN
    RAISE EXCEPTION 'RUBRIC_TOTAL_MISMATCH';
  END IF;

  INSERT INTO public.questions (
    id, content, question_type, difficulty, source_exam, essay_max_score
  ) VALUES (
    p_question_id,
    btrim(p_content),
    'essay',
    LEAST(5, GREATEST(1, COALESCE(p_difficulty, 3))),
    NULLIF(btrim(p_source_exam), ''),
    p_max_score
  );

  INSERT INTO public.question_grading_configs (
    question_id, reference_answer, rubric, rubric_version, created_by
  ) VALUES (
    p_question_id, btrim(p_reference_answer), p_rubric, 1, auth.uid()
  );

  RETURN p_question_id;
END;
$$;

-- The historical trigger with this function name recomputes a raw score when an
-- attempt changes to submitted. Preserve that legacy behavior for old flows, but
-- never overwrite the normalized/pending result produced by the trusted RPC below.
CREATE OR REPLACE FUNCTION public.calculate_exam_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.exam_grading_trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted' AND OLD.status = 'in_progress' THEN
    SELECT
      COALESCE(SUM(CASE WHEN is_correct THEN score ELSE 0 END), 0),
      COUNT(*),
      COUNT(*) FILTER (WHERE is_correct = true)
    INTO NEW.score, NEW.total_questions, NEW.correct_answers
    FROM public.student_answers
    WHERE attempt_id = NEW.id;

    NEW.time_spent = GREATEST(
      0,
      EXTRACT(EPOCH FROM (COALESCE(NEW.submit_time, now()) - NEW.start_time))::integer
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id text,
  p_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam_mode text;
  v_question record;
  v_option record;
  v_payload jsonb;
  v_selected_answer text;
  v_selected_answers jsonb;
  v_text_answer text;
  v_is_correct boolean;
  v_answer_valid boolean;
  v_score numeric;
  v_max_score numeric;
  v_objective_points numeric := 0;
  v_essay_points numeric := 0;
  v_earned_points numeric := 0;
  v_max_points numeric := 0;
  v_correct_count integer := 0;
  v_total_count integer := 0;
  v_pending_count integer := 0;
  v_tf_total integer;
  v_tf_correct integer;
  v_tf_value boolean;
  v_rubric_version integer;
  v_rubric_total numeric;
  v_submission_hash text;
  v_final_score numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ANSWERS';
  END IF;
  IF jsonb_array_length(p_answers) > 500 OR octet_length(p_answers::text) > 2000000 THEN
    RAISE EXCEPTION 'ANSWERS_PAYLOAD_TOO_LARGE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item -> 'question_id') IS DISTINCT FROM 'string'
       OR char_length(item ->> 'question_id') NOT BETWEEN 1 AND 200
       OR (item - ARRAY['question_id', 'selected_answer', 'selected_answers', 'text_answer']) <> '{}'::jsonb
       OR (item ? 'selected_answer' AND jsonb_typeof(item -> 'selected_answer') NOT IN ('string', 'null'))
       OR (item ? 'selected_answers' AND jsonb_typeof(item -> 'selected_answers') NOT IN ('object', 'null'))
       OR (item ? 'text_answer' AND jsonb_typeof(item -> 'text_answer') NOT IN ('string', 'null'))
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    GROUP BY item ->> 'question_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_ANSWERS_PAYLOAD';
  END IF;
  v_submission_hash := md5(p_answers::text);

  SELECT ea.*
  INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id
  FOR UPDATE OF ea;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT e.exam_mode
  INTO v_exam_mode
  FROM public.exams e
  WHERE e.id = v_attempt.exam_id;

  IF v_exam_mode IS DISTINCT FROM 'simulation' THEN
    RAISE EXCEPTION 'UNSUPPORTED_EXAM_MODE';
  END IF;

  IF v_attempt.status IN ('submitted', 'graded') THEN
    IF v_attempt.submission_hash IS NOT NULL
       AND v_attempt.submission_hash IS DISTINCT FROM v_submission_hash THEN
      RAISE EXCEPTION 'SUBMISSION_PAYLOAD_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'grading_status', v_attempt.grading_status,
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_STATUS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.exam_questions eq
      WHERE eq.exam_id = v_attempt.exam_id
        AND eq.question_id = item ->> 'question_id'
    )
  ) THEN
    RAISE EXCEPTION 'ANSWER_QUESTION_NOT_IN_EXAM';
  END IF;

  PERFORM set_config('app.exam_grading_trusted', 'on', true);
  DELETE FROM public.student_answers WHERE attempt_id = p_attempt_id;

  FOR v_question IN
    SELECT
      eq.question_id,
      eq.question_type,
      eq.score::numeric AS max_score
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_attempt.exam_id
    ORDER BY eq.part_number, eq.order_in_part
  LOOP
    v_total_count := v_total_count + 1;
    IF v_question.max_score IS NULL OR v_question.max_score <= 0 THEN
      RAISE EXCEPTION 'INVALID_EXAM_QUESTION_SCORE';
    END IF;
    v_max_score := v_question.max_score;
    v_max_points := v_max_points + v_max_score;
    v_payload := NULL;
    v_selected_answer := NULL;
    v_selected_answers := '{}'::jsonb;
    v_text_answer := NULL;
    v_is_correct := false;
    v_score := 0;
    v_rubric_version := NULL;
    v_rubric_total := NULL;

    SELECT item INTO v_payload
    FROM jsonb_array_elements(p_answers) AS item
    WHERE item ->> 'question_id' = v_question.question_id
    LIMIT 1;
    v_payload := COALESCE(v_payload, '{}'::jsonb);

    IF v_question.question_type = 'multiple_choice' THEN
      v_selected_answer := NULLIF(v_payload ->> 'selected_answer', '');
      SELECT
        COALESCE(bool_or(a.id = v_selected_answer), false),
        COALESCE(bool_or(a.id = v_selected_answer AND a.is_correct), false)
      INTO v_answer_valid, v_is_correct
      FROM public.answers a
      WHERE a.question_id = v_question.question_id;

      IF NOT v_answer_valid THEN
        v_selected_answer := NULL;
        v_is_correct := false;
      END IF;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;

    ELSIF v_question.question_type = 'true_false' THEN
      IF jsonb_typeof(v_payload -> 'selected_answers') = 'object' THEN
        v_selected_answers := v_payload -> 'selected_answers';
      END IF;
      v_tf_total := 0;
      v_tf_correct := 0;
      FOR v_option IN
        SELECT order_index, is_correct
        FROM public.answers
        WHERE question_id = v_question.question_id
        ORDER BY order_index
      LOOP
        v_tf_total := v_tf_total + 1;
        v_tf_value := NULL;
        IF jsonb_typeof(v_selected_answers -> (v_option.order_index::text)) = 'boolean' THEN
          v_tf_value := (v_selected_answers ->> (v_option.order_index::text))::boolean;
        END IF;
        IF v_tf_value IS NOT NULL AND v_tf_value = v_option.is_correct THEN
          v_tf_correct := v_tf_correct + 1;
        END IF;
      END LOOP;
      v_is_correct := v_tf_total > 0 AND v_tf_correct = v_tf_total;
      v_score := CASE WHEN v_tf_total > 0
        THEN round(v_max_score * v_tf_correct / v_tf_total, 4)
        ELSE 0 END;

    ELSIF v_question.question_type = 'short_answer' THEN
      v_text_answer := NULLIF(btrim(COALESCE(v_payload ->> 'text_answer', '')), '');
      SELECT EXISTS (
        SELECT 1
        FROM public.answers a
        WHERE a.question_id = v_question.question_id
          AND a.is_correct
          AND regexp_replace(lower(btrim(a.content)), '\s+', '', 'g') =
              regexp_replace(lower(COALESCE(v_text_answer, '')), '\s+', '', 'g')
      ) INTO v_is_correct;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;

    ELSIF v_question.question_type = 'essay' THEN
      v_text_answer := NULLIF(btrim(COALESCE(v_payload ->> 'text_answer', '')), '');
      IF char_length(COALESCE(v_text_answer, '')) > 20000 THEN
        RAISE EXCEPTION 'ESSAY_TOO_LONG';
      END IF;
      SELECT
        config.rubric_version,
        COALESCE(SUM((criterion ->> 'max_score')::numeric), 0)
      INTO v_rubric_version, v_rubric_total
      FROM public.question_grading_configs config
      CROSS JOIN LATERAL jsonb_array_elements(config.rubric) AS criterion
      WHERE config.question_id = v_question.question_id
      GROUP BY config.rubric_version;
      IF v_rubric_version IS NULL THEN
        RAISE EXCEPTION 'ESSAY_GRADING_CONFIG_MISSING';
      END IF;
      IF abs(v_rubric_total - v_max_score) > 0.0001 THEN
        RAISE EXCEPTION 'ESSAY_RUBRIC_SCORE_MISMATCH';
      END IF;
      v_is_correct := NULL;
      v_score := CASE WHEN v_text_answer IS NULL THEN 0 ELSE NULL END;
      IF v_text_answer IS NOT NULL THEN
        v_pending_count := v_pending_count + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_QUESTION_TYPE';
    END IF;

    IF v_question.question_type <> 'essay' THEN
      v_objective_points := v_objective_points + COALESCE(v_score, 0);
      IF v_is_correct THEN v_correct_count := v_correct_count + 1; END IF;
    END IF;
    v_earned_points := v_earned_points + COALESCE(v_score, 0);

    INSERT INTO public.student_answers (
      attempt_id,
      question_id,
      question_type,
      selected_answer,
      selected_answers,
      text_answer,
      is_correct,
      score,
      max_score,
      grading_status,
      grading_method,
      grading_rubric_version,
      answer_hash,
      graded_at
    ) VALUES (
      p_attempt_id,
      v_question.question_id,
      v_question.question_type,
      v_selected_answer,
      CASE WHEN v_question.question_type = 'true_false' THEN v_selected_answers ELSE NULL END,
      v_text_answer,
      v_is_correct,
      v_score,
      v_max_score,
      CASE
        WHEN v_question.question_type <> 'essay' THEN 'auto_graded'
        WHEN v_text_answer IS NULL THEN 'approved'
        ELSE 'pending_review'
      END,
      CASE
        WHEN v_question.question_type <> 'essay' THEN 'server_rule'
        WHEN v_text_answer IS NULL THEN 'blank_answer'
        ELSE NULL
      END,
      v_rubric_version,
      md5(COALESCE(v_text_answer, '')),
      CASE WHEN v_question.question_type <> 'essay' OR v_text_answer IS NULL THEN now() ELSE NULL END
    );
  END LOOP;

  v_final_score := CASE WHEN v_pending_count = 0 AND v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE NULL END;

  UPDATE public.exam_attempts
  SET
    status = 'submitted',
    submit_time = now(),
    time_spent = GREATEST(0, EXTRACT(EPOCH FROM (now() - start_time))::integer),
    total_questions = v_total_count,
    correct_answers = v_correct_count,
    score = v_final_score,
    grading_status = CASE WHEN v_pending_count > 0 THEN 'pending_review' ELSE 'completed' END,
    objective_points = v_objective_points,
    essay_points = v_essay_points,
    earned_points = v_earned_points,
    max_points = v_max_points,
    pending_grading_count = v_pending_count,
    submission_hash = v_submission_hash,
    graded_at = CASE WHEN v_pending_count = 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'grading_status', CASE WHEN v_pending_count > 0 THEN 'pending_review' ELSE 'completed' END,
    'score', v_final_score,
    'pending_grading_count', v_pending_count,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_essay_answer(
  p_student_answer_id text,
  p_answer_hash text,
  p_rubric_version integer,
  p_final_score numeric,
  p_final_feedback text DEFAULT NULL,
  p_ai_score numeric DEFAULT NULL,
  p_ai_confidence numeric DEFAULT NULL,
  p_ai_feedback text DEFAULT NULL,
  p_ai_breakdown jsonb DEFAULT NULL,
  p_ai_model text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_answer public.student_answers%ROWTYPE;
  v_attempt_id text;
  v_attempt_status text;
  v_exam_mode text;
  v_exam_created_by uuid;
  v_class_teacher_id uuid;
  v_pending_count integer;
  v_correct_count integer;
  v_earned_points numeric;
  v_objective_points numeric;
  v_essay_points numeric;
  v_max_points numeric;
  v_final_exam_score numeric;
  v_review_hash text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT sa.attempt_id INTO v_attempt_id
  FROM public.student_answers sa
  WHERE sa.id = p_student_answer_id;
  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'ESSAY_ANSWER_NOT_FOUND';
  END IF;

  -- Lock the parent first. This serializes aggregate updates when two different
  -- essay answers from the same attempt are reviewed concurrently.
  SELECT ea.status, e.exam_mode, e.created_by, c.teacher_id
  INTO v_attempt_status, v_exam_mode, v_exam_created_by, v_class_teacher_id
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  LEFT JOIN public.classes c ON c.id = e.class_id
  WHERE ea.id = v_attempt_id
  FOR UPDATE OF ea;

  SELECT sa.* INTO v_answer
  FROM public.student_answers sa
  WHERE sa.id = p_student_answer_id
    AND sa.attempt_id = v_attempt_id
  FOR UPDATE OF sa;

  IF v_answer.id IS NULL OR v_answer.question_type <> 'essay' THEN
    RAISE EXCEPTION 'ESSAY_ANSWER_NOT_FOUND';
  END IF;
  IF v_answer.text_answer IS NULL OR btrim(v_answer.text_answer) = '' THEN
    RAISE EXCEPTION 'BLANK_ESSAY_ALREADY_FINAL';
  END IF;
  IF v_exam_mode IS DISTINCT FROM 'simulation' OR v_attempt_status <> 'submitted' THEN
    RAISE EXCEPTION 'ESSAY_REVIEW_NOT_ALLOWED';
  END IF;
  IF v_role = 'teacher'
     AND v_exam_created_by IS DISTINCT FROM v_user_id
     AND v_class_teacher_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_answer.answer_hash IS DISTINCT FROM p_answer_hash THEN
    RAISE EXCEPTION 'ANSWER_VERSION_MISMATCH';
  END IF;
  IF v_answer.grading_rubric_version IS DISTINCT FROM p_rubric_version THEN
    RAISE EXCEPTION 'RUBRIC_VERSION_MISMATCH';
  END IF;
  IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > v_answer.max_score THEN
    RAISE EXCEPTION 'INVALID_FINAL_SCORE';
  END IF;
  IF p_ai_score IS NOT NULL AND (p_ai_score < 0 OR p_ai_score > v_answer.max_score) THEN
    RAISE EXCEPTION 'INVALID_AI_SCORE';
  END IF;
  IF p_ai_confidence IS NOT NULL AND (p_ai_confidence < 0 OR p_ai_confidence > 1) THEN
    RAISE EXCEPTION 'INVALID_AI_CONFIDENCE';
  END IF;
  IF p_ai_breakdown IS NOT NULL AND octet_length(p_ai_breakdown::text) > 100000 THEN
    RAISE EXCEPTION 'AI_BREAKDOWN_TOO_LARGE';
  END IF;

  v_review_hash := md5(jsonb_build_object(
    'answer_hash', p_answer_hash,
    'rubric_version', p_rubric_version,
    'final_score', p_final_score,
    'final_feedback', NULLIF(btrim(COALESCE(p_final_feedback, '')), ''),
    'ai_score', p_ai_score,
    'ai_confidence', p_ai_confidence,
    'ai_feedback', NULLIF(btrim(COALESCE(p_ai_feedback, '')), ''),
    'ai_breakdown', p_ai_breakdown,
    'ai_model', NULLIF(btrim(COALESCE(p_ai_model, '')), '')
  )::text);

  IF EXISTS (
    SELECT 1
    FROM public.essay_grading_reviews review_row
    WHERE review_row.student_answer_id = p_student_answer_id
      AND review_row.review_hash = v_review_hash
  ) THEN
    RETURN (
      SELECT jsonb_build_object(
        'attempt_id', attempt_row.id,
        'grading_status', attempt_row.grading_status,
        'score', attempt_row.score,
        'pending_grading_count', attempt_row.pending_grading_count,
        'idempotent', true
      )
      FROM public.exam_attempts attempt_row
      WHERE attempt_row.id = v_attempt_id
    );
  END IF;

  PERFORM set_config('app.exam_grading_trusted', 'on', true);

  UPDATE public.student_answers
  SET
    score = p_final_score,
    is_correct = (p_final_score = max_score),
    grading_status = 'approved',
    grading_method = CASE WHEN p_ai_score IS NULL THEN 'teacher_manual' ELSE 'ai_assisted_teacher_review' END,
    grading_feedback = NULLIF(left(btrim(COALESCE(p_final_feedback, '')), 4000), ''),
    grading_breakdown = p_ai_breakdown,
    grading_confidence = p_ai_confidence,
    ai_score = p_ai_score,
    ai_feedback = NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 8000), ''),
    ai_model = NULLIF(left(btrim(COALESCE(p_ai_model, '')), 200), ''),
    graded_by = v_user_id,
    graded_at = now()
  WHERE id = p_student_answer_id;

  INSERT INTO public.essay_grading_reviews (
    student_answer_id,
    attempt_id,
    review_hash,
    answer_hash,
    rubric_version,
    ai_score,
    ai_confidence,
    ai_feedback,
    ai_breakdown,
    ai_model,
    final_score,
    final_feedback,
    reviewer_id
  ) VALUES (
    p_student_answer_id,
    v_answer.attempt_id,
    v_review_hash,
    p_answer_hash,
    p_rubric_version,
    p_ai_score,
    p_ai_confidence,
    NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 8000), ''),
    p_ai_breakdown,
    NULLIF(left(btrim(COALESCE(p_ai_model, '')), 200), ''),
    p_final_score,
    NULLIF(left(btrim(COALESCE(p_final_feedback, '')), 4000), ''),
    v_user_id
  );

  SELECT
    COUNT(*) FILTER (WHERE question_type = 'essay' AND grading_status <> 'approved'),
    COALESCE(SUM(score), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type <> 'essay'), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type = 'essay'), 0),
    COALESCE(SUM(max_score), 0),
    COUNT(*) FILTER (WHERE is_correct IS TRUE)
  INTO v_pending_count, v_earned_points, v_objective_points, v_essay_points, v_max_points, v_correct_count
  FROM public.student_answers
  WHERE attempt_id = v_answer.attempt_id;

  v_final_exam_score := CASE WHEN v_pending_count = 0 AND v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE NULL END;

  UPDATE public.exam_attempts
  SET
    score = v_final_exam_score,
    grading_status = CASE WHEN v_pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
    objective_points = v_objective_points,
    essay_points = v_essay_points,
    earned_points = v_earned_points,
    max_points = v_max_points,
    correct_answers = v_correct_count,
    pending_grading_count = v_pending_count,
    graded_at = CASE WHEN v_pending_count = 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_answer.attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_answer.attempt_id,
    'grading_status', CASE WHEN v_pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
    'score', v_final_exam_score,
    'pending_grading_count', v_pending_count,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_simulation_answer_grades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
  v_role text;
  v_attempt_id text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.exam_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_attempt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id ELSE NEW.attempt_id END;
  SELECT e.exam_mode, p.role
  INTO v_mode, v_role
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE ea.id = v_attempt_id;

  IF v_mode = 'simulation' AND v_role = 'student' THEN
    -- Simulation answers are immutable from the browser. The trusted submit and
    -- review RPCs are the only writers, so raw content cannot be changed after submit.
    RAISE EXCEPTION 'DIRECT_SIMULATION_ANSWER_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_simulation_attempt_grades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.exam_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT e.exam_mode, p.role
  INTO v_mode, v_role
  FROM public.exams e
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE e.id = OLD.exam_id;

  IF v_mode = 'simulation' AND v_role = 'student' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'DIRECT_SIMULATION_ATTEMPT_DELETE_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF NEW.exam_id IS DISTINCT FROM OLD.exam_id OR
       NEW.student_id IS DISTINCT FROM OLD.student_id OR
       NEW.start_time IS DISTINCT FROM OLD.start_time OR
       NEW.submit_time IS DISTINCT FROM OLD.submit_time OR
       NEW.time_spent IS DISTINCT FROM OLD.time_spent OR
       NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR
       NEW.status IS DISTINCT FROM OLD.status OR
       NEW.score IS DISTINCT FROM OLD.score OR
       NEW.total_questions IS DISTINCT FROM OLD.total_questions OR
       NEW.correct_answers IS DISTINCT FROM OLD.correct_answers OR
       NEW.grading_status IS DISTINCT FROM OLD.grading_status OR
       NEW.objective_points IS DISTINCT FROM OLD.objective_points OR
       NEW.essay_points IS DISTINCT FROM OLD.essay_points OR
       NEW.earned_points IS DISTINCT FROM OLD.earned_points OR
       NEW.max_points IS DISTINCT FROM OLD.max_points OR
       NEW.pending_grading_count IS DISTINCT FROM OLD.pending_grading_count OR
       NEW.submission_hash IS DISTINCT FROM OLD.submission_hash OR
       NEW.graded_at IS DISTINCT FROM OLD.graded_at THEN
      RAISE EXCEPTION 'CLIENT_GRADING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_simulation_answer_grades ON public.student_answers;
CREATE TRIGGER trg_protect_simulation_answer_grades
  BEFORE INSERT OR UPDATE OR DELETE ON public.student_answers
  FOR EACH ROW EXECUTE FUNCTION public.protect_simulation_answer_grades();

DROP TRIGGER IF EXISTS trg_protect_simulation_attempt_grades ON public.exam_attempts;
CREATE TRIGGER trg_protect_simulation_attempt_grades
  BEFORE UPDATE OR DELETE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.protect_simulation_attempt_grades();

REVOKE ALL ON FUNCTION public.create_essay_question(text, text, text, integer, numeric, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_essay_answer(text, text, integer, numeric, text, numeric, numeric, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_essay_question(text, text, text, integer, numeric, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.review_essay_answer(text, text, integer, numeric, text, numeric, numeric, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_essay_question(text, text, text, integer, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_essay_answer(text, text, integer, numeric, text, numeric, numeric, text, jsonb, text) TO authenticated;

COMMIT;

-- Verify after applying in a disposable/staging Supabase project:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name IN ('exam_attempts','student_answers')
-- ORDER BY table_name, ordinal_position;
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('create_essay_question','submit_exam_attempt','review_essay_answer');

-- Rollback outline (only before production data depends on essay):
-- DROP TRIGGER/FUNCTION objects above, then drop the two new tables and added columns.
-- Do not remove the 'essay' constraint value while essay rows exist.
