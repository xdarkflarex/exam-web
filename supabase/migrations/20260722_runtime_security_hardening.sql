-- PATCH_VERSION: runtime-security-hardening-20260722-r4
-- Runtime hardening after the live-policy audit on 2026-07-22.
-- Apply AFTER 20260721_essay_assisted_grading.sql.
--
-- Goals:
--   * remove public/anonymous access to question keys and student attempts;
--   * make student question payloads capability-based (attempt id, not question ids);
--   * create/submit practice attempts and homework grading on the server;
--   * keep teacher/admin access compatible with the current shared question bank;
--   * rebuild all sixteen audited RLS policy sets from a closed baseline.

BEGIN;

DO $$
DECLARE
  required_relation text;
BEGIN
  FOREACH required_relation IN ARRAY ARRAY[
    'profiles', 'classes', 'questions', 'answers', 'exams', 'exam_questions',
    'exam_attempts', 'student_answers', 'question_taxonomy', 'topics',
    'categories', 'sections', 'question_bookmarks', 'homeworks',
    'homework_questions', 'homework_assignments',
    'homework_assignment_recipients', 'homework_attempts', 'homework_answers',
    'site_settings'
  ]
  LOOP
    IF to_regclass('public.' || required_relation) IS NULL THEN
      RAISE EXCEPTION 'HARDENING_PRECONDITION_MISSING_RELATION: public.%', required_relation;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exam_attempts'
      AND column_name = 'grading_status'
  ) THEN
    RAISE EXCEPTION 'APPLY_20260721_ESSAY_MIGRATION_FIRST';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'allow_review'
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_MISSING_COLUMN: public.exams.allow_review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exams exam
    WHERE exam.exam_mode IS NULL
       OR exam.exam_mode NOT IN ('simulation', 'practice')
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_INVALID_EXAM_MODE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns runtime_column
    WHERE runtime_column.table_schema = 'public'
      AND runtime_column.table_name = 'homework_assignments'
      AND runtime_column.column_name IN ('show_feedback_immediately', 'allow_review')
      AND runtime_column.udt_name <> 'bool'
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_INCOMPATIBLE_HOMEWORK_FEEDBACK_COLUMN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns runtime_column
    WHERE runtime_column.table_schema = 'public'
      AND runtime_column.table_name = 'questions'
      AND runtime_column.column_name = 'created_by'
      AND runtime_column.udt_name <> 'uuid'
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_INCOMPATIBLE_QUESTION_OWNER_COLUMN';
  END IF;
END;
$$;

-- Homework has its own domain. Keep the legacy broader constraint in place if
-- its name drifted, but add a stable restrictive runtime constraint whose
-- intersection prevents new exams.exam_mode = 'homework' rows.
ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_runtime_mode_check;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_runtime_mode_check
  CHECK (exam_mode IN ('simulation', 'practice')) NOT VALID;
ALTER TABLE public.exams
  VALIDATE CONSTRAINT exams_runtime_mode_check;
ALTER TABLE public.exams
  ALTER COLUMN exam_mode SET NOT NULL;

ALTER TABLE public.homework_assignments
  ADD COLUMN IF NOT EXISTS show_feedback_immediately boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_review boolean NOT NULL DEFAULT false;

UPDATE public.homework_assignments
SET
  show_feedback_immediately = COALESCE(show_feedback_immediately, false),
  allow_review = COALESCE(allow_review, false)
WHERE show_feedback_immediately IS NULL
   OR allow_review IS NULL;

ALTER TABLE public.homework_assignments
  ALTER COLUMN show_feedback_immediately SET DEFAULT false,
  ALTER COLUMN show_feedback_immediately SET NOT NULL,
  ALTER COLUMN allow_review SET DEFAULT false,
  ALTER COLUMN allow_review SET NOT NULL;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
    DEFAULT auth.uid();

ALTER TABLE public.questions
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DO $$
DECLARE
  owner_constraint_name name;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.questions question
    LEFT JOIN public.profiles owner_profile ON owner_profile.id = question.created_by
    WHERE question.created_by IS NOT NULL
      AND owner_profile.id IS NULL
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_ORPHAN_QUESTION_OWNER';
  END IF;

  SELECT constraint_row.conname
  INTO owner_constraint_name
  FROM pg_constraint constraint_row
  JOIN pg_attribute source_attribute
    ON source_attribute.attrelid = constraint_row.conrelid
   AND source_attribute.attname = 'created_by'
   AND source_attribute.attnum > 0
   AND NOT source_attribute.attisdropped
  JOIN pg_attribute target_attribute
    ON target_attribute.attrelid = constraint_row.confrelid
   AND target_attribute.attname = 'id'
   AND target_attribute.attnum > 0
   AND NOT target_attribute.attisdropped
  WHERE constraint_row.conrelid = 'public.questions'::regclass
    AND constraint_row.confrelid = 'public.profiles'::regclass
    AND constraint_row.contype = 'f'
    AND constraint_row.confdeltype = 'n'
    AND constraint_row.conkey = ARRAY[source_attribute.attnum]::smallint[]
    AND constraint_row.confkey = ARRAY[target_attribute.attnum]::smallint[]
  ORDER BY constraint_row.oid
  LIMIT 1;

  IF owner_constraint_name IS NULL THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_created_by_profiles_runtime_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL
      NOT VALID;
    owner_constraint_name := 'questions_created_by_profiles_runtime_fkey';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.questions VALIDATE CONSTRAINT %I',
    owner_constraint_name
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.exam_questions exam_question
    WHERE exam_question.score IS NULL
       OR exam_question.score <= 0
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_INVALID_EXAM_QUESTION_SCORE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.homework_questions homework_question
    WHERE homework_question.score IS NULL
       OR homework_question.score <= 0
  ) THEN
    RAISE EXCEPTION 'HARDENING_PRECONDITION_INVALID_HOMEWORK_QUESTION_SCORE';
  END IF;
END;
$$;

ALTER TABLE public.exam_questions
  ALTER COLUMN score SET DEFAULT 1,
  ALTER COLUMN score SET NOT NULL,
  DROP CONSTRAINT IF EXISTS exam_questions_positive_score;
ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_positive_score
  CHECK (score > 0) NOT VALID;
ALTER TABLE public.exam_questions
  VALIDATE CONSTRAINT exam_questions_positive_score;

ALTER TABLE public.homework_questions
  ALTER COLUMN score SET DEFAULT 1,
  ALTER COLUMN score SET NOT NULL,
  DROP CONSTRAINT IF EXISTS homework_questions_positive_score;
ALTER TABLE public.homework_questions
  ADD CONSTRAINT homework_questions_positive_score
  CHECK (score > 0) NOT VALID;
ALTER TABLE public.homework_questions
  VALIDATE CONSTRAINT homework_questions_positive_score;

WITH owner_candidates AS (
  SELECT
    exam_question.question_id,
    COALESCE(exam.created_by, class.teacher_id) AS owner_id
  FROM public.exam_questions exam_question
  JOIN public.exams exam ON exam.id = exam_question.exam_id
  LEFT JOIN public.classes class ON class.id = exam.class_id
  WHERE COALESCE(exam.created_by, class.teacher_id) IS NOT NULL

  UNION ALL

  SELECT
    homework_question.question_id,
    homework.created_by AS owner_id
  FROM public.homework_questions homework_question
  JOIN public.homeworks homework ON homework.id = homework_question.homework_id
  WHERE homework.created_by IS NOT NULL
), inferred_owner AS (
  SELECT
    owner_candidate.question_id,
    min(owner_candidate.owner_id::text)::uuid AS owner_id
  FROM owner_candidates owner_candidate
  GROUP BY owner_candidate.question_id
  HAVING COUNT(DISTINCT owner_candidate.owner_id) = 1
)
UPDATE public.questions question
SET created_by = inferred_owner.owner_id
FROM inferred_owner
WHERE question.id = inferred_owner.question_id
  AND question.created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_created_by
  ON public.questions(created_by);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_id
  ON public.classes(teacher_id);

CREATE INDEX IF NOT EXISTS idx_exams_created_by
  ON public.exams(created_by);

CREATE INDEX IF NOT EXISTS idx_exams_class_id
  ON public.exams(class_id);

CREATE OR REPLACE FUNCTION public.is_question_bank_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_homework_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_system_admin();
$$;

CREATE OR REPLACE FUNCTION public.student_has_feature(p_feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_access_tier text;
  v_settings jsonb;
  v_default boolean;
BEGIN
  IF auth.uid() IS NULL OR p_feature NOT IN ('practice', 'simulation', 'homework') THEN
    RETURN false;
  END IF;

  SELECT profile.role, profile.access_tier
  INTO v_role, v_access_tier
  FROM public.profiles profile
  WHERE profile.id = auth.uid();

  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN false;
  END IF;
  IF v_access_tier = 'full' THEN
    RETURN true;
  END IF;

  v_default := CASE p_feature
    WHEN 'practice' THEN true
    WHEN 'simulation' THEN false
    WHEN 'homework' THEN true
    ELSE false
  END;

  SELECT setting.value
  INTO v_settings
  FROM public.site_settings setting
  WHERE setting.key = 'access.feature_flags'
  LIMIT 1;

  IF jsonb_typeof(v_settings -> p_feature) = 'boolean' THEN
    RETURN (v_settings ->> p_feature)::boolean;
  END IF;
  RETURN v_default;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.profiles target ON target.id = p_profile_id
    LEFT JOIN public.classes class ON class.id = target.class_id
    WHERE actor.id = auth.uid()
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND (target.id = actor.id OR class.teacher_id = actor.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_exam(p_exam_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.exams e ON e.id = p_exam_id
    LEFT JOIN public.classes c ON c.id = e.class_id
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR (
          p.role = 'teacher'
          AND (e.created_by = p.id OR c.teacher_id = p.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_exam_metadata(p_exam_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams exam
    JOIN public.profiles actor ON actor.id = auth.uid()
    LEFT JOIN public.classes class ON class.id = exam.class_id
    WHERE exam.id = p_exam_id
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND (
            exam.created_by = actor.id
            OR class.teacher_id = actor.id
          )
        )
        OR (
          actor.role = 'student'
          AND (
            (
              COALESCE(exam.is_published, false)
              AND exam.exam_mode IN ('simulation', 'practice')
              AND (
                exam.class_id IS NULL
                OR exam.class_id IS NOT DISTINCT FROM actor.class_id
              )
              AND public.student_has_feature(exam.exam_mode)
            )
            OR EXISTS (
              SELECT 1
              FROM public.exam_attempts attempt
              WHERE attempt.exam_id = exam.id
                AND attempt.student_id = actor.id
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_exam_scope(
  p_created_by uuid,
  p_class_id text,
  p_exam_mode text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    WHERE actor.id = auth.uid()
      AND p_exam_mode IN ('simulation', 'practice')
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND p_created_by = actor.id
          AND (
            p_class_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.classes class
              WHERE class.id = p_class_id
                AND class.teacher_id = actor.id
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_exam_attempt(p_attempt_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_manage_exam(ea.exam_id)
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_homework(p_homework_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.homeworks homework ON homework.id = p_homework_id
    WHERE actor.id = auth.uid()
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND homework.created_by = actor.id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_exam_question_links(p_exam_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_manage_exam(p_exam_id)
    AND EXISTS (
      SELECT 1
      FROM public.exams exam
      WHERE exam.id = p_exam_id
        AND NOT COALESCE(exam.is_published, false)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts attempt
      WHERE attempt.exam_id = p_exam_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_attach_question_to_exam(
  p_exam_id text,
  p_question_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_edit_exam_question_links(p_exam_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      JOIN public.exams exam ON exam.id = p_exam_id
      JOIN public.questions question ON question.id = p_question_id
      WHERE actor.id = auth.uid()
        AND exam.exam_mode IN ('simulation', 'practice')
        AND question.question_type IN (
          'multiple_choice', 'true_false', 'short_answer', 'essay'
        )
        AND (exam.exam_mode = 'simulation' OR question.question_type <> 'essay')
        AND (
          actor.role = 'admin'
          OR (
            actor.role = 'teacher'
            AND question.created_by = actor.id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_homework_question_links(p_homework_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_manage_homework(p_homework_id)
    AND EXISTS (
      SELECT 1
      FROM public.homeworks homework
      WHERE homework.id = p_homework_id
        AND NOT COALESCE(homework.is_published, false)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.homework_assignments assignment
      WHERE assignment.homework_id = p_homework_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.homework_attempts attempt
      JOIN public.homework_assignments assignment
        ON assignment.id = attempt.assignment_id
      WHERE assignment.homework_id = p_homework_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_attach_question_to_homework(
  p_homework_id text,
  p_question_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_edit_homework_question_links(p_homework_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      JOIN public.questions question ON question.id = p_question_id
      WHERE actor.id = auth.uid()
        AND question.question_type IN ('multiple_choice', 'true_false', 'short_answer')
        AND (
          actor.role = 'admin'
          OR (
            actor.role = 'teacher'
            AND question.created_by = actor.id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_question_bank_question(p_question_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.questions question ON question.id = p_question_id
    WHERE actor.id = auth.uid()
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND (
            question.created_by = actor.id
            OR EXISTS (
              SELECT 1
              FROM public.exam_questions exam_question
              WHERE exam_question.question_id = question.id
                AND public.can_manage_exam(exam_question.exam_id)
            )
            OR EXISTS (
              SELECT 1
              FROM public.homework_questions homework_question
              WHERE homework_question.question_id = question.id
                AND public.can_manage_homework(homework_question.homework_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_question_bank_question(p_question_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.questions question ON question.id = p_question_id
    WHERE actor.id = auth.uid()
      AND (
        actor.role = 'admin'
        OR (
          actor.role = 'teacher'
          AND question.created_by = actor.id
          AND NOT EXISTS (
            SELECT 1
            FROM public.exam_questions exam_question
            WHERE exam_question.question_id = question.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.homework_questions homework_question
            WHERE homework_question.question_id = question.id
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_reveal_question_key(p_question_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- A bookmark has no attempt/domain context. Only staff with question-bank
  -- capability may reveal a key here; student result RPCs decide per attempt.
  SELECT public.can_read_question_bank_question(p_question_id);
$$;

CREATE OR REPLACE FUNCTION public.can_access_homework_assignment(p_assignment_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.homework_assignment_recipients recipient
    JOIN public.profiles student ON student.id = auth.uid()
    WHERE recipient.assignment_id = p_assignment_id
      AND student.role = 'student'
      AND (
        recipient.student_id = auth.uid()
        OR (
          recipient.student_id IS NULL
          AND recipient.class_id IS NOT NULL
          AND recipient.class_id = student.class_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_homework_assignment(p_assignment_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles actor
    JOIN public.homework_assignments assignment
      ON assignment.id = p_assignment_id
    JOIN public.homeworks homework
      ON homework.id = assignment.homework_id
    WHERE actor.id = auth.uid()
      AND actor.role = 'student'
      AND public.student_has_feature('homework')
      AND assignment.status = 'published'
      AND homework.is_published
      AND public.can_access_homework_assignment(assignment.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_work_on_homework_assignment(p_assignment_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_access_homework_assignment(p_assignment_id)
    AND public.student_has_feature('homework')
    AND EXISTS (
      SELECT 1
      FROM public.homework_assignments assignment
      JOIN public.homeworks homework ON homework.id = assignment.homework_id
      WHERE assignment.id = p_assignment_id
        AND assignment.status = 'published'
        AND homework.is_published
        AND (assignment.deadline IS NULL OR assignment.deadline >= now())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_question_content(p_question_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.can_read_question_bank_question(p_question_id)
    OR EXISTS (
      SELECT 1
      FROM public.exam_attempts attempt
      JOIN public.exams exam ON exam.id = attempt.exam_id
      JOIN public.exam_questions exam_question
        ON exam_question.exam_id = attempt.exam_id
       AND exam_question.question_id = p_question_id
      WHERE attempt.student_id = auth.uid()
        AND exam.exam_mode IN ('simulation', 'practice')
    )
    OR EXISTS (
      SELECT 1
      FROM public.homework_attempts attempt
      JOIN public.homework_assignments assignment
        ON assignment.id = attempt.assignment_id
      JOIN public.homework_questions homework_question
        ON homework_question.homework_id = assignment.homework_id
       AND homework_question.question_id = p_question_id
      WHERE attempt.student_id = auth.uid()
        AND public.can_access_homework_assignment(assignment.id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_practice_draft(
  p_attempt_id text,
  p_question_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_attempts attempt
    JOIN public.exams exam ON exam.id = attempt.exam_id
    JOIN public.exam_questions exam_question
      ON exam_question.exam_id = attempt.exam_id
     AND exam_question.question_id = p_question_id
    JOIN public.profiles student ON student.id = auth.uid()
    WHERE attempt.id = p_attempt_id
      AND attempt.student_id = auth.uid()
      AND attempt.status = 'in_progress'
      AND exam.exam_mode = 'practice'
      AND student.role = 'student'
      AND public.student_has_feature('practice')
      AND (
        exam.class_id IS NULL
        OR exam.class_id IS NOT DISTINCT FROM student.class_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_exam_preparation(p_exam_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam record;
  v_existing record;
  v_question_count integer;
  v_attempt_count integer;
  v_best_score numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    exam.id,
    exam.title,
    exam.description,
    exam.subject,
    exam.duration,
    exam.exam_mode,
    exam.is_published,
    exam.class_id,
    exam.show_results_immediately,
    profile.role AS user_role,
    profile.class_id AS user_class_id
  INTO v_exam
  FROM public.exams exam
  JOIN public.profiles profile ON profile.id = auth.uid()
  WHERE exam.id = p_exam_id;

  IF v_exam.id IS NULL
     OR v_exam.user_role IS DISTINCT FROM 'student'
     OR v_exam.exam_mode IS DISTINCT FROM 'simulation'
     OR NOT COALESCE(v_exam.is_published, false)
     OR (
       v_exam.class_id IS NOT NULL
       AND v_exam.class_id IS DISTINCT FROM v_exam.user_class_id
     )
     OR NOT public.student_has_feature('simulation') THEN
    RAISE EXCEPTION 'EXAM_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_question_count
  FROM public.exam_questions exam_question
  WHERE exam_question.exam_id = p_exam_id;

  SELECT attempt.id, attempt.start_time
  INTO v_existing
  FROM public.exam_attempts attempt
  WHERE attempt.exam_id = p_exam_id
    AND attempt.student_id = auth.uid()
    AND attempt.status = 'in_progress'
  ORDER BY attempt.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE attempt.status IN ('submitted', 'graded'))::integer,
    CASE
      WHEN COALESCE(v_exam.show_results_immediately, false) THEN
        MAX(attempt.score) FILTER (
          WHERE attempt.status IN ('submitted', 'graded')
            AND attempt.grading_status = 'completed'
        )
      ELSE NULL
    END
  INTO v_attempt_count, v_best_score
  FROM public.exam_attempts attempt
  WHERE attempt.exam_id = p_exam_id
    AND attempt.student_id = auth.uid();

  RETURN jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'description', v_exam.description,
      'subject', v_exam.subject,
      'duration', v_exam.duration,
      'question_count', COALESCE(v_question_count, 0)
    ),
    'existing_attempt', CASE
      WHEN v_existing.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_existing.id,
        'start_time', v_existing.start_time
      )
    END,
    'attempt_count', COALESCE(v_attempt_count, 0),
    'best_score', v_best_score
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_exam_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_exam record;
  v_existing public.exam_attempts%ROWTYPE;
  v_attempt_id text;
  v_next_attempt integer;
  v_completed_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    e.id,
    e.exam_mode,
    e.is_published,
    e.max_attempts,
    e.start_time,
    e.end_time,
    e.class_id,
    p.role AS user_role,
    p.class_id AS user_class_id
  INTO v_exam
  FROM public.exams e
  JOIN public.profiles p ON p.id = v_user_id
  WHERE e.id = p_exam_id;

  IF v_exam.id IS NULL OR NOT COALESCE(v_exam.is_published, false) THEN
    RAISE EXCEPTION 'EXAM_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_exam.exam_mode NOT IN ('simulation', 'practice') THEN
    RAISE EXCEPTION 'UNSUPPORTED_EXAM_MODE';
  END IF;
  IF v_exam.user_role <> 'student' THEN
    RAISE EXCEPTION 'STUDENT_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.student_has_feature(v_exam.exam_mode) THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_exam.class_id IS NOT NULL
     AND v_exam.class_id IS DISTINCT FROM v_exam.user_class_id THEN
    RAISE EXCEPTION 'EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS' USING ERRCODE = '42501';
  END IF;
  IF v_exam.start_time IS NOT NULL AND now() < v_exam.start_time THEN
    RAISE EXCEPTION 'EXAM_NOT_STARTED' USING ERRCODE = '42501';
  END IF;
  IF v_exam.end_time IS NOT NULL AND now() > v_exam.end_time THEN
    RAISE EXCEPTION 'EXAM_ENDED' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_exam_id), hashtext(v_user_id::text));

  SELECT ea.* INTO v_existing
  FROM public.exam_attempts ea
  WHERE ea.exam_id = p_exam_id
    AND ea.student_id = v_user_id
    AND ea.status = 'in_progress'
  ORDER BY ea.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attempt_id', v_existing.id,
      'status', v_existing.status,
      'created', false
    );
  END IF;

  SELECT
    COALESCE(MAX(ea.attempt_number), 0) + 1,
    COUNT(*) FILTER (WHERE ea.status IN ('submitted', 'graded'))
  INTO v_next_attempt, v_completed_count
  FROM public.exam_attempts ea
  WHERE ea.exam_id = p_exam_id
    AND ea.student_id = v_user_id;

  IF v_exam.exam_mode = 'simulation'
     AND COALESCE(v_exam.max_attempts, 1) > 0
     AND v_completed_count >= v_exam.max_attempts THEN
    RAISE EXCEPTION 'MAX_ATTEMPTS_REACHED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.exam_attempts (
    exam_id, student_id, attempt_number, start_time, status
  ) VALUES (
    p_exam_id, v_user_id, v_next_attempt, now(), 'in_progress'
  )
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'status', 'in_progress',
    'created', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exam_attempt_questions(p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_result_released boolean;
  v_reveal boolean;
  v_questions jsonb;
  v_student_answers jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    ea.id,
    ea.exam_id,
    ea.student_id,
    ea.status,
    ea.grading_status,
    e.title,
    e.duration,
    e.subject,
    e.exam_mode,
    e.allow_review,
    e.show_results_immediately,
    ea.total_questions,
    ea.correct_answers,
    ea.score,
    ea.pending_grading_count,
    ea.objective_points,
    ea.essay_points,
    ea.earned_points,
    ea.max_points,
    ea.start_time,
    ea.submit_time
  INTO v_attempt
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  WHERE ea.id = p_attempt_id;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.exam_mode NOT IN ('simulation', 'practice') THEN
    RAISE EXCEPTION 'UNSUPPORTED_EXAM_MODE';
  END IF;
  IF v_attempt.status = 'in_progress'
     AND NOT public.student_has_feature(v_attempt.exam_mode) THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  v_result_released := v_attempt.status IN ('submitted', 'graded')
    AND (
      v_attempt.exam_mode = 'practice'
      OR (
        v_attempt.exam_mode = 'simulation'
        AND v_attempt.grading_status = 'completed'
        AND COALESCE(v_attempt.show_results_immediately, false)
      )
    );
  v_reveal := v_result_released
    AND (
      v_attempt.exam_mode = 'practice'
      OR COALESCE(v_attempt.allow_review, false)
    );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'content', q.content,
        'question_type', q.question_type,
        'part_number', eq.part_number,
        'order_in_part', eq.order_in_part,
        'tikz_image_url', q.tikz_image_url,
        'explanation', CASE WHEN v_reveal THEN q.explanation ELSE NULL END,
        'solution', CASE WHEN v_reveal THEN q.solution ELSE NULL END,
        'answers', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'question_id', a.question_id,
              'content', a.content,
              'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE false END,
              'order_index', a.order_index
            )
            ORDER BY a.order_index, a.id
          )
          FROM public.answers a
          WHERE a.question_id = q.id
            AND (
              v_reveal
              OR q.question_type IN ('multiple_choice', 'true_false')
            )
        ), '[]'::jsonb)
      )
      ORDER BY eq.part_number, eq.order_in_part, eq.id
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = v_attempt.exam_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'question_id', sa.question_id,
      'selected_answer', sa.selected_answer,
      'selected_answers', sa.selected_answers,
      'text_answer', sa.text_answer,
      'is_correct', CASE WHEN v_reveal THEN sa.is_correct ELSE NULL END,
      'score', CASE WHEN v_reveal THEN sa.score ELSE NULL END,
      'max_score', CASE WHEN v_reveal THEN sa.max_score ELSE NULL END,
      'grading_status', sa.grading_status,
      'grading_feedback', CASE WHEN v_reveal THEN sa.grading_feedback ELSE NULL END,
      'grading_confidence', CASE WHEN v_reveal THEN sa.grading_confidence ELSE NULL END,
      'grading_rubric_version', CASE WHEN v_reveal THEN sa.grading_rubric_version ELSE NULL END,
      'answer_hash', NULL
    ) ORDER BY sa.answered_at, sa.id
  ), '[]'::jsonb)
  INTO v_student_answers
  FROM public.student_answers sa
  WHERE sa.attempt_id = v_attempt.id;

  RETURN jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_attempt.exam_id,
      'title', v_attempt.title,
      'duration', v_attempt.duration,
      'subject', v_attempt.subject,
      'exam_mode', v_attempt.exam_mode
    ),
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'grading_status', v_attempt.grading_status,
      'total_questions', CASE WHEN v_result_released THEN v_attempt.total_questions ELSE NULL END,
      'correct_answers', CASE WHEN v_result_released THEN v_attempt.correct_answers ELSE NULL END,
      'score', CASE WHEN v_result_released THEN v_attempt.score ELSE NULL END,
      'pending_grading_count', v_attempt.pending_grading_count,
      'objective_points', CASE WHEN v_result_released THEN v_attempt.objective_points ELSE NULL END,
      'essay_points', CASE WHEN v_result_released THEN v_attempt.essay_points ELSE NULL END,
      'earned_points', CASE WHEN v_result_released THEN v_attempt.earned_points ELSE NULL END,
      'max_points', CASE WHEN v_result_released THEN v_attempt.max_points ELSE NULL END,
      'start_time', v_attempt.start_time,
      'submit_time', v_attempt.submit_time,
      'result_released', v_result_released,
      'answer_key_revealed', v_reveal
    ),
    'questions', v_questions,
    'student_answers', v_student_answers
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.submit_exam_attempt_trusted_internal(text,jsonb)') IS NULL THEN
    IF to_regprocedure('public.submit_exam_attempt(text,jsonb)') IS NULL THEN
      RAISE EXCEPTION 'APPLY_20260721_ESSAY_MIGRATION_FIRST';
    END IF;
    ALTER FUNCTION public.submit_exam_attempt(text, jsonb)
      RENAME TO submit_exam_attempt_trusted_internal;
  END IF;
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
  v_result jsonb;
  v_release_score boolean;
BEGIN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  v_result := public.submit_exam_attempt_trusted_internal(p_attempt_id, p_answers);
  PERFORM set_config('app.exam_grading_trusted', 'off', true);

  SELECT
    attempt.student_id = auth.uid()
      AND attempt.status IN ('submitted', 'graded')
      AND attempt.grading_status = 'completed'
      AND COALESCE(exam.show_results_immediately, false)
  INTO v_release_score
  FROM public.exam_attempts attempt
  JOIN public.exams exam ON exam.id = attempt.exam_id
  WHERE attempt.id = p_attempt_id;

  IF NOT COALESCE(v_release_score, false) THEN
    v_result := jsonb_set(v_result, '{score}', 'null'::jsonb, true);
  END IF;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_practice_attempt(
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
  v_earned_points numeric := 0;
  v_max_points numeric := 0;
  v_correct_count integer := 0;
  v_total_count integer := 0;
  v_tf_total integer;
  v_tf_correct integer;
  v_tf_value boolean;
  v_submission_hash text;
  v_final_score numeric;
BEGIN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
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

  IF v_exam_mode <> 'practice' THEN
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
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_STATUS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_attempt.exam_id
      AND eq.question_type = 'essay'
  ) THEN
    RAISE EXCEPTION 'ESSAY_NOT_ALLOWED_IN_PRACTICE';
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

  FOR v_question IN
    SELECT eq.question_id, eq.question_type, eq.score::numeric AS max_score
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
      IF char_length(COALESCE(v_text_answer, '')) > 20000 THEN
        RAISE EXCEPTION 'ANSWER_TOO_LONG';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.answers a
        WHERE a.question_id = v_question.question_id
          AND a.is_correct
          AND regexp_replace(lower(btrim(a.content)), '\s+', '', 'g') =
              regexp_replace(lower(COALESCE(v_text_answer, '')), '\s+', '', 'g')
      ) INTO v_is_correct;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_PRACTICE_QUESTION_TYPE';
    END IF;

    v_earned_points := v_earned_points + COALESCE(v_score, 0);
    IF v_is_correct THEN v_correct_count := v_correct_count + 1; END IF;

    INSERT INTO public.student_answers (
      attempt_id, question_id, question_type, selected_answer,
      selected_answers, text_answer, is_correct, score, max_score,
      grading_status, grading_method, answer_hash, graded_at, answered_at
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
      'auto_graded',
      'server_rule',
      md5(COALESCE(v_text_answer, v_selected_answer, v_selected_answers::text, '')),
      now(),
      now()
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      question_type = EXCLUDED.question_type,
      selected_answer = EXCLUDED.selected_answer,
      selected_answers = EXCLUDED.selected_answers,
      text_answer = EXCLUDED.text_answer,
      is_correct = EXCLUDED.is_correct,
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      grading_status = EXCLUDED.grading_status,
      grading_method = EXCLUDED.grading_method,
      answer_hash = EXCLUDED.answer_hash,
      graded_at = EXCLUDED.graded_at,
      answered_at = EXCLUDED.answered_at;
  END LOOP;

  v_final_score := CASE WHEN v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE 0 END;

  UPDATE public.exam_attempts
  SET
    status = 'submitted',
    submit_time = now(),
    time_spent = GREATEST(0, EXTRACT(EPOCH FROM (now() - start_time))::integer),
    total_questions = v_total_count,
    correct_answers = v_correct_count,
    score = v_final_score,
    grading_status = 'completed',
    objective_points = v_earned_points,
    essay_points = 0,
    earned_points = v_earned_points,
    max_points = v_max_points,
    pending_grading_count = 0,
    submission_hash = v_submission_hash,
    graded_at = now(),
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.exam_grading_trusted', 'off', true);

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'grading_status', 'completed',
    'score', v_final_score,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_simulation_leaderboard(
  p_exam_id text DEFAULT NULL,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  student_key text,
  student_name text,
  avg_score numeric,
  total_attempts bigint,
  best_score numeric,
  is_current_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT profile.role, profile.class_id
  INTO v_actor
  FROM public.profiles profile
  WHERE profile.id = auth.uid();

  IF v_actor.role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'student'
     AND NOT public.student_has_feature('simulation') THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    md5(ea.student_id::text) AS student_key,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Học sinh') AS student_name,
    AVG(ea.score)::numeric AS avg_score,
    COUNT(*)::bigint AS total_attempts,
    MAX(ea.score)::numeric AS best_score,
    bool_or(ea.student_id = auth.uid()) AS is_current_user
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  JOIN public.profiles p ON p.id = ea.student_id
  WHERE e.exam_mode = 'simulation'
    AND COALESCE(e.is_published, false)
    AND ea.status IN ('submitted', 'graded')
    AND ea.grading_status = 'completed'
    AND COALESCE(e.show_results_immediately, false)
    AND ea.score IS NOT NULL
    AND (p_exam_id IS NULL OR ea.exam_id = p_exam_id)
    AND (p_since IS NULL OR ea.created_at >= p_since)
    AND (
      v_actor.role = 'admin'
      OR (
        v_actor.role = 'teacher'
        AND public.can_manage_exam(e.id)
      )
      OR (
        v_actor.role = 'student'
        AND (e.class_id IS NULL OR e.class_id IS NOT DISTINCT FROM v_actor.class_id)
        AND p.class_id IS NOT DISTINCT FROM v_actor.class_id
      )
    )
  GROUP BY ea.student_id, p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_exam_answer_metadata(p_attempt_id text DEFAULT NULL)
RETURNS TABLE (
  attempt_id text,
  question_id text,
  is_correct boolean,
  difficulty integer,
  cognitive_level text,
  topic_id text,
  topic_name text,
  category_id text,
  category_name text,
  section_id text,
  section_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    sa.attempt_id,
    sa.question_id,
    sa.is_correct,
    q.difficulty,
    q.cognitive_level,
    taxonomy.topic_id,
    taxonomy.topic_name,
    taxonomy.category_id,
    taxonomy.category_name,
    taxonomy.section_id,
    taxonomy.section_name
  FROM public.student_answers sa
  JOIN public.exam_attempts ea ON ea.id = sa.attempt_id
  JOIN public.exams e ON e.id = ea.exam_id
  JOIN public.questions q ON q.id = sa.question_id
  LEFT JOIN LATERAL (
    SELECT
      t.id AS topic_id,
      t.name AS topic_name,
      c.id AS category_id,
      c.name AS category_name,
      s.id AS section_id,
      s.name AS section_name
    FROM public.question_taxonomy qt
    LEFT JOIN public.topics t ON t.id = qt.topic_id
    LEFT JOIN public.categories c ON c.id = qt.category_id
    LEFT JOIN public.sections s ON s.id = qt.section_id
    WHERE qt.question_id = sa.question_id
    ORDER BY qt.question_id
    LIMIT 1
  ) taxonomy ON true
  WHERE auth.uid() IS NOT NULL
    AND ea.student_id = auth.uid()
    AND ea.status IN ('submitted', 'graded')
    AND (
      e.exam_mode = 'practice'
      OR (
        e.exam_mode = 'simulation'
        AND ea.grading_status = 'completed'
        AND COALESCE(e.show_results_immediately, false)
        AND COALESCE(e.allow_review, false)
      )
    )
    AND (p_attempt_id IS NULL OR ea.id = p_attempt_id);
$$;

CREATE OR REPLACE FUNCTION public.get_homework_attempt_questions(p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_reveal boolean;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    hta.id,
    hta.assignment_id,
    hta.student_id,
    hta.status,
    hta.current_session_index,
    hwa.homework_id,
    COALESCE(NULLIF(hwa.title, ''), h.title) AS title,
    h.session_size,
    hwa.show_feedback_immediately,
    hwa.allow_review
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  JOIN public.homeworks h ON h.id = hwa.homework_id
  WHERE hta.id = p_attempt_id;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'in_progress'
     AND NOT public.student_has_feature('homework') THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  v_reveal := v_attempt.status IN ('submitted', 'graded')
    AND COALESCE(v_attempt.allow_review, false);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'content', q.content,
        'question_type', q.question_type,
        'order_index', hq.order_index,
        'tikz_image_url', q.tikz_image_url,
        'explanation', CASE WHEN v_reveal THEN q.explanation ELSE NULL END,
        'solution', CASE WHEN v_reveal THEN q.solution ELSE NULL END,
        'answers', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'content', a.content,
              'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE false END,
              'order_index', a.order_index
            )
            ORDER BY a.order_index, a.id
          )
          FROM public.answers a
          WHERE a.question_id = q.id
            AND (v_reveal OR q.question_type IN ('multiple_choice', 'true_false'))
        ), '[]'::jsonb),
        'saved_answer', CASE WHEN saved.id IS NULL THEN NULL ELSE jsonb_build_object(
          'selected_answer', saved.selected_answer,
          'selected_answers', saved.selected_answers,
          'text_answer', saved.text_answer,
          'is_correct', CASE
            WHEN COALESCE(v_attempt.show_feedback_immediately, false) OR v_reveal
              THEN saved.is_correct
            ELSE NULL
          END,
          'shown_feedback', saved.shown_feedback
        ) END
      )
      ORDER BY hq.order_index, hq.id
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  LEFT JOIN public.homework_answers saved
    ON saved.attempt_id = p_attempt_id
   AND saved.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'current_session_index', v_attempt.current_session_index
    ),
    'homework', jsonb_build_object(
      'title', v_attempt.title,
      'session_size', v_attempt.session_size,
      'show_feedback_immediately', v_attempt.show_feedback_immediately,
      'allow_review', v_attempt.allow_review
    ),
    'questions', v_questions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_homework_question_metadata()
RETURNS TABLE (
  homework_id text,
  question_id text,
  cognitive_level text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT hq.homework_id, hq.question_id, q.cognitive_level
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  JOIN public.homework_assignments assignment
    ON assignment.homework_id = hq.homework_id
  WHERE auth.uid() IS NOT NULL
    AND public.student_has_feature('homework')
    AND public.can_access_homework_assignment(assignment.id);
$$;

CREATE OR REPLACE FUNCTION public.get_my_homework_answer_metadata()
RETURNS TABLE (
  attempt_id text,
  question_id text,
  is_correct boolean,
  answered_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    answer.attempt_id,
    answer.question_id,
    CASE
      WHEN assignment.show_feedback_immediately
        OR (
          attempt.status IN ('submitted', 'graded')
          AND assignment.allow_review
        )
      THEN answer.is_correct
      ELSE NULL
    END,
    answer.answered_at
  FROM public.homework_answers answer
  JOIN public.homework_attempts attempt ON attempt.id = answer.attempt_id
  JOIN public.homework_assignments assignment ON assignment.id = attempt.assignment_id
  WHERE auth.uid() IS NOT NULL
    AND attempt.student_id = auth.uid()
    AND public.student_has_feature('homework');
$$;

CREATE OR REPLACE FUNCTION public.check_homework_answer(
  p_attempt_id text,
  p_question_id text,
  p_answer jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_question record;
  v_option record;
  v_selected_answer text;
  v_selected_answers jsonb := '{}'::jsonb;
  v_text_answer text;
  v_is_correct boolean := false;
  v_answer_valid boolean;
  v_tf_total integer := 0;
  v_tf_correct integer := 0;
  v_tf_value boolean;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_answers jsonb;
  v_existing_answer public.homework_answers%ROWTYPE;
BEGIN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_answer IS NULL OR jsonb_typeof(p_answer) <> 'object'
     OR octet_length(p_answer::text) > 100000 THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ANSWER';
  END IF;

  SELECT
    hta.id,
    hta.assignment_id,
    hta.student_id,
    hta.status,
    hwa.homework_id,
    hwa.show_feedback_immediately
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  WHERE hta.id = p_attempt_id
  FOR UPDATE OF hta;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT q.id, q.question_type, q.explanation, q.solution, hq.score
  INTO v_question
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id
    AND hq.question_id = p_question_id;

  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'QUESTION_NOT_IN_HOMEWORK';
  END IF;

  SELECT hwa.*
  INTO v_existing_answer
  FROM public.homework_answers hwa
  WHERE hwa.attempt_id = p_attempt_id
    AND hwa.question_id = p_question_id
  FOR UPDATE;

  IF v_existing_answer.id IS NOT NULL THEN
    SELECT
      COUNT(*),
      COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
      COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct)
    INTO v_total, v_answered, v_correct
    FROM public.homework_questions hq
    LEFT JOIN public.homework_answers hwa
      ON hwa.attempt_id = p_attempt_id
     AND hwa.question_id = hq.question_id
    WHERE hq.homework_id = v_attempt.homework_id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'content', a.content,
        'is_correct', false,
        'order_index', a.order_index
      ) ORDER BY a.order_index, a.id
    ), '[]'::jsonb)
    INTO v_answers
    FROM public.answers a
    WHERE a.question_id = p_question_id
      AND v_question.question_type IN ('multiple_choice', 'true_false');

    RETURN jsonb_build_object(
      'question_id', p_question_id,
      'is_correct', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false)
          THEN v_existing_answer.is_correct
        ELSE NULL
      END,
      'score', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false)
          THEN v_existing_answer.score
        ELSE NULL
      END,
      'answers', v_answers,
      'explanation', NULL,
      'solution', NULL,
      'answered_questions', v_answered,
      'correct_answers', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
        ELSE NULL
      END,
      'total_questions', v_total,
      'idempotent', true
    );
  END IF;

  IF NOT public.can_work_on_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ATTEMPT_STATUS';
  END IF;

  IF v_question.question_type = 'multiple_choice' THEN
    v_selected_answer := NULLIF(p_answer ->> 'selected_answer', '');
    SELECT
      COALESCE(bool_or(a.id = v_selected_answer), false),
      COALESCE(bool_or(a.id = v_selected_answer AND a.is_correct), false)
    INTO v_answer_valid, v_is_correct
    FROM public.answers a
    WHERE a.question_id = p_question_id;
    IF NOT v_answer_valid THEN
      RAISE EXCEPTION 'INVALID_SELECTED_ANSWER';
    END IF;
  ELSIF v_question.question_type = 'true_false' THEN
    IF jsonb_typeof(p_answer -> 'selected_answers') = 'object' THEN
      v_selected_answers := p_answer -> 'selected_answers';
    END IF;
    FOR v_option IN
      SELECT order_index, is_correct
      FROM public.answers
      WHERE question_id = p_question_id
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
  ELSIF v_question.question_type = 'short_answer' THEN
    v_text_answer := NULLIF(btrim(COALESCE(p_answer ->> 'text_answer', '')), '');
    IF v_text_answer IS NULL OR char_length(v_text_answer) > 20000 THEN
      RAISE EXCEPTION 'INVALID_TEXT_ANSWER';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.answers a
      WHERE a.question_id = p_question_id
        AND a.is_correct
        AND replace(regexp_replace(lower(btrim(a.content)), '\s+', '', 'g'), ',', '.') =
            replace(regexp_replace(lower(v_text_answer), '\s+', '', 'g'), ',', '.')
    ) INTO v_is_correct;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_HOMEWORK_QUESTION_TYPE';
  END IF;

  PERFORM set_config('app.homework_grading_trusted', 'on', true);

  INSERT INTO public.homework_answers (
    attempt_id, question_id, question_type, selected_answer,
    selected_answers, text_answer, is_correct, score,
    shown_feedback, answered_at, updated_at
  ) VALUES (
    p_attempt_id,
    p_question_id,
    v_question.question_type,
    v_selected_answer,
    CASE WHEN v_question.question_type = 'true_false' THEN v_selected_answers ELSE NULL END,
    v_text_answer,
    v_is_correct,
    CASE WHEN v_is_correct THEN v_question.score ELSE 0 END,
    true,
    now(),
    now()
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    question_type = EXCLUDED.question_type,
    selected_answer = EXCLUDED.selected_answer,
    selected_answers = EXCLUDED.selected_answers,
    text_answer = EXCLUDED.text_answer,
    is_correct = EXCLUDED.is_correct,
    score = EXCLUDED.score,
    shown_feedback = true,
    answered_at = EXCLUDED.answered_at,
    updated_at = now();

  SELECT
    COUNT(*),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct)
  INTO v_total, v_answered, v_correct
  FROM public.homework_questions hq
  LEFT JOIN public.homework_answers hwa
    ON hwa.attempt_id = p_attempt_id
   AND hwa.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  UPDATE public.homework_attempts
  SET
    total_questions = v_total,
    answered_questions = v_answered,
    correct_answers = CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.homework_grading_trusted', 'off', true);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'content', a.content,
      'is_correct', false,
      'order_index', a.order_index
    ) ORDER BY a.order_index, a.id
  ), '[]'::jsonb)
  INTO v_answers
  FROM public.answers a
  WHERE a.question_id = p_question_id
    AND v_question.question_type IN ('multiple_choice', 'true_false');

  RETURN jsonb_build_object(
    'question_id', p_question_id,
    'is_correct', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_is_correct
      ELSE NULL
    END,
    'score', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false)
        THEN CASE WHEN v_is_correct THEN v_question.score ELSE 0 END
      ELSE NULL
    END,
    'answers', v_answers,
    'explanation', NULL,
    'solution', NULL,
    'answered_questions', v_answered,
    'correct_answers', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
      ELSE NULL
    END,
    'total_questions', v_total,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_homework_attempt(p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_earned_points numeric;
  v_max_points numeric;
  v_score numeric;
BEGIN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT hta.id, hta.assignment_id, hta.student_id, hta.status, hwa.homework_id, hta.score
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  WHERE hta.id = p_attempt_id
  FOR UPDATE OF hta;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status IN ('submitted', 'graded') THEN
    RETURN jsonb_build_object(
      'attempt_id', p_attempt_id,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ATTEMPT_STATUS';
  END IF;
  IF NOT public.can_work_on_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  SELECT
    COUNT(*),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct),
    COALESCE(SUM(hwa.score) FILTER (WHERE hwa.shown_feedback), 0),
    COALESCE(SUM(hq.score), 0)
  INTO v_total, v_answered, v_correct, v_earned_points, v_max_points
  FROM public.homework_questions hq
  LEFT JOIN public.homework_answers hwa
    ON hwa.attempt_id = p_attempt_id
   AND hwa.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'HOMEWORK_HAS_NO_QUESTIONS';
  END IF;
  IF v_answered <> v_total THEN
    RAISE EXCEPTION 'HOMEWORK_INCOMPLETE';
  END IF;

  IF v_max_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_QUESTION_SCORE';
  END IF;
  v_score := round(v_earned_points / v_max_points * 10, 2);
  PERFORM set_config('app.homework_grading_trusted', 'on', true);

  UPDATE public.homework_attempts
  SET
    status = 'submitted',
    submitted_at = now(),
    total_questions = v_total,
    answered_questions = v_answered,
    correct_answers = v_correct,
    score = v_score,
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.homework_grading_trusted', 'off', true);

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'score', v_score,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_safe_bookmarks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  bookmark_row record;
  v_reveal boolean;
  v_answers jsonb;
  v_taxonomy jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  FOR bookmark_row IN
    SELECT
      qb.id AS bookmark_id,
      qb.question_id,
      qb.note,
      qb.created_at,
      q.content,
      q.question_type,
      q.explanation
    FROM public.question_bookmarks qb
    JOIN public.questions q ON q.id = qb.question_id
    WHERE qb.user_id = auth.uid()
    ORDER BY qb.created_at DESC, qb.id
  LOOP
    IF NOT public.can_access_question_content(bookmark_row.question_id) THEN
      CONTINUE;
    END IF;
    v_reveal := public.can_reveal_question_key(bookmark_row.question_id);

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'content', a.content,
        'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE false END,
        'order_index', a.order_index
      ) ORDER BY a.order_index, a.id
    ), '[]'::jsonb)
    INTO v_answers
    FROM public.answers a
    WHERE a.question_id = bookmark_row.question_id
      AND (v_reveal OR bookmark_row.question_type IN ('multiple_choice', 'true_false'));

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'topic', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id', t.id, 'name', t.name) END,
      'category', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name) END
    )), '[]'::jsonb)
    INTO v_taxonomy
    FROM public.question_taxonomy qt
    LEFT JOIN public.topics t ON t.id = qt.topic_id
    LEFT JOIN public.categories c ON c.id = qt.category_id
    WHERE qt.question_id = bookmark_row.question_id;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', bookmark_row.bookmark_id,
      'question_id', bookmark_row.question_id,
      'note', bookmark_row.note,
      'created_at', bookmark_row.created_at,
      'question', jsonb_build_object(
        'id', bookmark_row.question_id,
        'content', bookmark_row.content,
        'explanation', CASE WHEN v_reveal THEN bookmark_row.explanation ELSE NULL END,
        'answers', v_answers,
        'taxonomy', v_taxonomy,
        'answer_key_revealed', v_reveal
      )
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

-- Supabase managed roles reject persistent custom GUC entries in pg_proc.proconfig.
-- Keep the trusted flag transaction-local and reset it at function entry, normal
-- return and exception. Wrap the already-live essay review RPC for the same rule.
DO $$
BEGIN
  IF to_regprocedure(
    'public.review_essay_answer_trusted_internal(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)'
  ) IS NULL THEN
    IF to_regprocedure(
      'public.review_essay_answer(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)'
    ) IS NULL THEN
      RAISE EXCEPTION 'APPLY_20260721_ESSAY_MIGRATION_FIRST';
    END IF;

    ALTER FUNCTION public.review_essay_answer(
      text, text, integer, numeric, text, numeric, numeric, text, jsonb, text
    ) RENAME TO review_essay_answer_trusted_internal;
  END IF;
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
  v_result jsonb;
BEGIN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);

  v_result := public.review_essay_answer_trusted_internal(
    p_student_answer_id,
    p_answer_hash,
    p_rubric_version,
    p_final_score,
    p_final_feedback,
    p_ai_score,
    p_ai_confidence,
    p_ai_feedback,
    p_ai_breakdown,
    p_ai_model
  );

  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile.role
  INTO v_actor_role
  FROM public.profiles profile
  WHERE profile.id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF v_actor_role = 'admin' THEN
      RETURN NEW;
    END IF;
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'PROFILE_INSERT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    NEW.role := 'student';
    NEW.access_tier := 'basic';
    NEW.class_id := NULL;
    SELECT auth_user.email INTO NEW.email
    FROM auth.users auth_user
    WHERE auth_user.id = auth.uid();
    NEW.must_change_password := false;
    NEW.source_enrollment_id := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_actor_role = 'admin' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF OLD.id IS DISTINCT FROM auth.uid() OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'PROFILE_UPDATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.access_tier IS DISTINCT FROM OLD.access_tier
     OR NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.grade IS DISTINCT FROM OLD.grade
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source_enrollment_id IS DISTINCT FROM OLD.source_enrollment_id
     OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'PROFILE_SECURITY_FIELD_UPDATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_question_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT profile.role INTO v_actor_role
  FROM public.profiles profile
  WHERE profile.id = auth.uid();

  IF v_actor_role = 'admin' THEN
    RETURN NEW;
  END IF;
  IF v_actor_role <> 'teacher' THEN
    RAISE EXCEPTION 'QUESTION_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'QUESTION_OWNERSHIP_CHANGE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_student_exam_attempt_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_exam_mode text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND TG_OP = 'UPDATE'
     AND OLD.student_id = auth.uid()
     AND OLD.status = 'in_progress'
     AND NEW.status IN ('submitted', 'graded') THEN
    SELECT exam.exam_mode
    INTO v_exam_mode
    FROM public.exams exam
    WHERE exam.id = OLD.exam_id;
    IF NOT public.student_has_feature(v_exam_mode) THEN
      RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF auth.uid() IS NULL OR current_setting('app.exam_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role <> 'student' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.student_id IS DISTINCT FROM auth.uid()
       OR NEW.status <> 'in_progress'
       OR NEW.submit_time IS NOT NULL
       OR NEW.score IS NOT NULL
       OR COALESCE(NEW.total_questions, 0) <> 0
       OR COALESCE(NEW.correct_answers, 0) <> 0
       OR NEW.grading_status <> 'not_required'
       OR COALESCE(NEW.objective_points, 0) <> 0
       OR COALESCE(NEW.essay_points, 0) <> 0
       OR COALESCE(NEW.earned_points, 0) <> 0
       OR COALESCE(NEW.max_points, 0) <> 0
       OR COALESCE(NEW.pending_grading_count, 0) <> 0
       OR NEW.submission_hash IS NOT NULL
       OR NEW.graded_at IS NOT NULL THEN
      RAISE EXCEPTION 'DIRECT_ATTEMPT_INSERT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DIRECT_ATTEMPT_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NEW.exam_id IS DISTINCT FROM OLD.exam_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.start_time IS DISTINCT FROM OLD.start_time
     OR NEW.submit_time IS DISTINCT FROM OLD.submit_time
     OR NEW.time_spent IS DISTINCT FROM OLD.time_spent
     OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.total_questions IS DISTINCT FROM OLD.total_questions
     OR NEW.correct_answers IS DISTINCT FROM OLD.correct_answers
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.ip_address IS DISTINCT FROM OLD.ip_address
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.tab_switches IS DISTINCT FROM OLD.tab_switches
     OR NEW.dev_tools_opened IS DISTINCT FROM OLD.dev_tools_opened
     OR NEW.suspicious_activities IS DISTINCT FROM OLD.suspicious_activities
     OR NEW.is_flagged IS DISTINCT FROM OLD.is_flagged
     OR NEW.flag_reason IS DISTINCT FROM OLD.flag_reason
     OR NEW.grading_status IS DISTINCT FROM OLD.grading_status
     OR NEW.objective_points IS DISTINCT FROM OLD.objective_points
     OR NEW.essay_points IS DISTINCT FROM OLD.essay_points
     OR NEW.earned_points IS DISTINCT FROM OLD.earned_points
     OR NEW.max_points IS DISTINCT FROM OLD.max_points
     OR NEW.pending_grading_count IS DISTINCT FROM OLD.pending_grading_count
     OR NEW.submission_hash IS DISTINCT FROM OLD.submission_hash
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at THEN
    RAISE EXCEPTION 'CLIENT_ATTEMPT_GRADING_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_simulation_submission_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam record;
  v_role text;
  v_deadline timestamptz;
BEGIN
  IF OLD.status = 'in_progress' AND NEW.status IN ('submitted', 'graded')
     AND auth.uid() IS NOT NULL THEN
    SELECT p.role INTO v_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_role = 'student' THEN
      SELECT e.exam_mode, e.duration, e.end_time
      INTO v_exam
      FROM public.exams e
      WHERE e.id = OLD.exam_id;

      IF v_exam.exam_mode = 'simulation' THEN
        v_deadline := NULL;
        IF v_exam.duration IS NOT NULL AND v_exam.duration > 0 THEN
          v_deadline := OLD.start_time + make_interval(mins => v_exam.duration);
        END IF;
        IF v_exam.end_time IS NOT NULL THEN
          v_deadline := CASE
            WHEN v_deadline IS NULL THEN v_exam.end_time
            ELSE LEAST(v_deadline, v_exam.end_time)
          END;
        END IF;
        IF v_deadline IS NOT NULL
           AND now() > v_deadline + interval '30 seconds' THEN
          RAISE EXCEPTION 'SUBMISSION_DEADLINE_EXCEEDED' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_student_exam_answer_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_attempt_id text;
  v_question_id text;
  v_mode text;
  v_status text;
  v_owner uuid;
  v_expected_type text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.exam_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role <> 'student' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_attempt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id ELSE NEW.attempt_id END;
  v_question_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_id ELSE NEW.question_id END;

  SELECT e.exam_mode, ea.status, ea.student_id, eq.question_type
  INTO v_mode, v_status, v_owner, v_expected_type
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  LEFT JOIN public.exam_questions eq
    ON eq.exam_id = ea.exam_id
   AND eq.question_id = v_question_id
  WHERE ea.id = v_attempt_id;

  IF v_owner IS DISTINCT FROM auth.uid() OR v_expected_type IS NULL THEN
    RAISE EXCEPTION 'ANSWER_QUESTION_NOT_IN_OWN_ATTEMPT' USING ERRCODE = '42501';
  END IF;
  IF v_mode = 'simulation' THEN
    RAISE EXCEPTION 'DIRECT_SIMULATION_ANSWER_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_mode <> 'practice' OR v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'DIRECT_ANSWER_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DIRECT_ANSWER_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NEW.question_type IS DISTINCT FROM v_expected_type THEN
    RAISE EXCEPTION 'QUESTION_TYPE_MISMATCH';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.score IS NOT NULL
       OR NEW.is_correct IS TRUE
       OR NEW.max_score <> 1
       OR NEW.grading_status <> 'not_required'
       OR NEW.grading_feedback IS NOT NULL
       OR NEW.grading_breakdown IS NOT NULL
       OR NEW.grading_confidence IS NOT NULL
       OR NEW.grading_method IS NOT NULL
       OR NEW.grading_rubric_version IS NOT NULL
       OR NEW.answer_hash IS NOT NULL
       OR NEW.ai_score IS NOT NULL
       OR NEW.ai_feedback IS NOT NULL
       OR NEW.ai_model IS NOT NULL
       OR NEW.graded_by IS NOT NULL
       OR NEW.graded_at IS NOT NULL
       OR COALESCE(NEW.shown_feedback, false) THEN
      RAISE EXCEPTION 'CLIENT_ANSWER_GRADING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    NEW.is_correct := NULL;
    NEW.score := NULL;
  ELSE
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.question_type IS DISTINCT FROM OLD.question_type
       OR NEW.is_correct IS DISTINCT FROM OLD.is_correct
       OR NEW.score IS DISTINCT FROM OLD.score
       OR NEW.max_score IS DISTINCT FROM OLD.max_score
       OR NEW.grading_status IS DISTINCT FROM OLD.grading_status
       OR NEW.grading_feedback IS DISTINCT FROM OLD.grading_feedback
       OR NEW.grading_breakdown IS DISTINCT FROM OLD.grading_breakdown
       OR NEW.grading_confidence IS DISTINCT FROM OLD.grading_confidence
       OR NEW.grading_method IS DISTINCT FROM OLD.grading_method
       OR NEW.grading_rubric_version IS DISTINCT FROM OLD.grading_rubric_version
       OR NEW.answer_hash IS DISTINCT FROM OLD.answer_hash
       OR NEW.ai_score IS DISTINCT FROM OLD.ai_score
       OR NEW.ai_feedback IS DISTINCT FROM OLD.ai_feedback
       OR NEW.ai_model IS DISTINCT FROM OLD.ai_model
       OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
       OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
       OR NEW.shown_feedback IS DISTINCT FROM OLD.shown_feedback THEN
      RAISE EXCEPTION 'CLIENT_ANSWER_GRADING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF char_length(COALESCE(NEW.text_answer, '')) > 20000
     OR octet_length(COALESCE(NEW.selected_answers, '{}'::jsonb)::text) > 100000 THEN
    RAISE EXCEPTION 'ANSWER_PAYLOAD_TOO_LARGE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_student_homework_attempt_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.homework_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role <> 'student' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.student_id IS DISTINCT FROM auth.uid()
       OR NEW.status <> 'in_progress'
       OR NEW.submitted_at IS NOT NULL
       OR NEW.score IS NOT NULL
       OR COALESCE(NEW.total_questions, 0) <> 0
       OR COALESCE(NEW.answered_questions, 0) <> 0
       OR COALESCE(NEW.correct_answers, 0) <> 0 THEN
      RAISE EXCEPTION 'DIRECT_HOMEWORK_ATTEMPT_INSERT_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    NEW.started_at := now();
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DIRECT_HOMEWORK_ATTEMPT_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.total_questions IS DISTINCT FROM OLD.total_questions
     OR NEW.answered_questions IS DISTINCT FROM OLD.answered_questions
     OR NEW.correct_answers IS DISTINCT FROM OLD.correct_answers
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.current_session_index < 0 THEN
    RAISE EXCEPTION 'CLIENT_HOMEWORK_GRADING_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_student_homework_answer_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.homework_grading_trusted', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role = 'student' THEN
    RAISE EXCEPTION 'DIRECT_HOMEWORK_ANSWER_WRITE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_exam_attempt_writes ON public.exam_attempts;
CREATE TRIGGER trg_protect_student_exam_attempt_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.protect_student_exam_attempt_writes();

DROP TRIGGER IF EXISTS trg_protect_profile_security_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_security_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

DROP TRIGGER IF EXISTS trg_protect_question_ownership ON public.questions;
CREATE TRIGGER trg_protect_question_ownership
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.protect_question_ownership();

DROP TRIGGER IF EXISTS trg_enforce_simulation_submission_deadline ON public.exam_attempts;
CREATE TRIGGER trg_enforce_simulation_submission_deadline
  BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_simulation_submission_deadline();

DROP TRIGGER IF EXISTS trg_protect_student_exam_answer_writes ON public.student_answers;
CREATE TRIGGER trg_protect_student_exam_answer_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.student_answers
  FOR EACH ROW EXECUTE FUNCTION public.protect_student_exam_answer_writes();

DROP TRIGGER IF EXISTS trg_protect_student_homework_attempt_writes ON public.homework_attempts;
CREATE TRIGGER trg_protect_student_homework_attempt_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.homework_attempts
  FOR EACH ROW EXECUTE FUNCTION public.protect_student_homework_attempt_writes();

DROP TRIGGER IF EXISTS trg_protect_student_homework_answer_writes ON public.homework_answers;
CREATE TRIGGER trg_protect_student_homework_answer_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.homework_answers
  FOR EACH ROW EXECUTE FUNCTION public.protect_student_homework_answer_writes();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_assignment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'questions', 'answers', 'exam_questions', 'exam_attempts',
        'student_answers', 'homework_questions', 'homework_answers',
        'homework_attempts', 'question_bookmarks', 'classes', 'exams',
        'homeworks', 'homework_assignments',
        'homework_assignment_recipients', 'site_settings'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY users_read_own_profile
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY staff_read_scoped_profiles
  ON public.profiles FOR SELECT TO authenticated
  USING (public.can_manage_profile(id));

CREATE POLICY users_insert_own_profile
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY admins_insert_profiles
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY users_update_own_profile
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY admins_update_profiles
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY admins_delete_profiles
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_system_admin());

CREATE POLICY admins_manage_classes
  ON public.classes FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY teachers_read_own_classes
  ON public.classes FOR SELECT TO authenticated
  USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'teacher'
    )
  );

CREATE POLICY anon_read_published_simulation_exams
  ON public.exams FOR SELECT TO anon
  USING (
    COALESCE(is_published, false)
    AND exam_mode = 'simulation'
  );

CREATE POLICY authenticated_read_scoped_exams
  ON public.exams FOR SELECT TO authenticated
  USING (public.can_read_exam_metadata(id));

CREATE POLICY admins_manage_exams
  ON public.exams FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY teachers_insert_owned_exam_drafts
  ON public.exams FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND NOT COALESCE(is_published, false)
    AND public.can_write_exam_scope(created_by, class_id, exam_mode)
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'teacher'
    )
  );

CREATE POLICY teachers_update_scoped_exams
  ON public.exams FOR UPDATE TO authenticated
  USING (public.can_manage_exam(id))
  WITH CHECK (
    public.can_write_exam_scope(created_by, class_id, exam_mode)
    AND (
      NOT COALESCE(is_published, false)
      OR class_id IS NOT NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'teacher'
    )
  );

CREATE POLICY teachers_delete_scoped_exams
  ON public.exams FOR DELETE TO authenticated
  USING (
    public.can_manage_exam(id)
    AND NOT COALESCE(is_published, false)
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts attempt
      WHERE attempt.exam_id = exams.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles actor
      WHERE actor.id = auth.uid()
        AND actor.role = 'teacher'
    )
  );

CREATE POLICY admins_read_homeworks
  ON public.homeworks FOR SELECT TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY students_read_assigned_homeworks
  ON public.homeworks FOR SELECT TO authenticated
  USING (
    is_published
    AND EXISTS (
      SELECT 1
      FROM public.homework_assignments assignment
      WHERE assignment.homework_id = homeworks.id
        AND public.can_view_homework_assignment(assignment.id)
    )
  );

CREATE POLICY admins_insert_homeworks
  ON public.homeworks FOR INSERT TO authenticated
  WITH CHECK (
    public.is_homework_admin()
    AND created_by = auth.uid()
  );

CREATE POLICY admins_update_homeworks
  ON public.homeworks FOR UPDATE TO authenticated
  USING (public.is_homework_admin())
  WITH CHECK (public.is_homework_admin());

CREATE POLICY admins_delete_homeworks
  ON public.homeworks FOR DELETE TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY admins_read_homework_assignments
  ON public.homework_assignments FOR SELECT TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY students_read_assigned_homework_assignments
  ON public.homework_assignments FOR SELECT TO authenticated
  USING (public.can_view_homework_assignment(id));

CREATE POLICY admins_insert_homework_assignments
  ON public.homework_assignments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_homework_admin()
    AND assigned_by = auth.uid()
  );

CREATE POLICY admins_update_homework_assignments
  ON public.homework_assignments FOR UPDATE TO authenticated
  USING (public.is_homework_admin())
  WITH CHECK (public.is_homework_admin());

CREATE POLICY admins_delete_homework_assignments
  ON public.homework_assignments FOR DELETE TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY admins_read_homework_recipients
  ON public.homework_assignment_recipients FOR SELECT TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY students_read_own_homework_recipient_rows
  ON public.homework_assignment_recipients FOR SELECT TO authenticated
  USING (
    public.can_view_homework_assignment(assignment_id)
    AND (
      student_id = auth.uid()
      OR (
        student_id IS NULL
        AND class_id IS NOT NULL
        AND class_id = (
          SELECT actor.class_id
          FROM public.profiles actor
          WHERE actor.id = auth.uid()
            AND actor.role = 'student'
        )
      )
    )
  );

CREATE POLICY admins_insert_homework_recipients
  ON public.homework_assignment_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_homework_admin()
    AND EXISTS (
      SELECT 1
      FROM public.homework_assignments assignment
      WHERE assignment.id = homework_assignment_recipients.assignment_id
    )
    AND (
      (
        class_id IS NOT NULL
        AND student_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.classes class
          WHERE class.id = homework_assignment_recipients.class_id
        )
      )
      OR (
        class_id IS NULL
        AND student_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.profiles target
          WHERE target.id = homework_assignment_recipients.student_id
            AND target.role = 'student'
        )
      )
    )
  );

CREATE POLICY admins_delete_homework_recipients
  ON public.homework_assignment_recipients FOR DELETE TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY public_read_landing_settings
  ON public.site_settings FOR SELECT TO anon
  USING (key LIKE 'landing.%');

CREATE POLICY authenticated_read_allowed_settings
  ON public.site_settings FOR SELECT TO authenticated
  USING (
    key LIKE 'landing.%'
    OR key = 'access.feature_flags'
    OR public.is_system_admin()
  );

CREATE POLICY admins_insert_site_settings
  ON public.site_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

CREATE POLICY admins_update_site_settings
  ON public.site_settings FOR UPDATE TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

CREATE POLICY users_read_own_bookmarks
  ON public.question_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY users_delete_own_bookmarks
  ON public.question_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY question_bank_admin_manage_questions
  ON public.questions FOR ALL TO authenticated
  USING (public.is_question_bank_staff())
  WITH CHECK (public.is_question_bank_staff());

CREATE POLICY question_bank_teacher_read_questions
  ON public.questions FOR SELECT TO authenticated
  USING (public.can_read_question_bank_question(id));

CREATE POLICY question_bank_teacher_insert_questions
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles actor
      WHERE actor.id = auth.uid() AND actor.role = 'teacher'
    )
  );

CREATE POLICY question_bank_teacher_update_questions
  ON public.questions FOR UPDATE TO authenticated
  USING (public.can_mutate_question_bank_question(id))
  WITH CHECK (created_by = auth.uid());

CREATE POLICY question_bank_teacher_delete_questions
  ON public.questions FOR DELETE TO authenticated
  USING (public.can_mutate_question_bank_question(id));

CREATE POLICY question_bank_admin_manage_answers
  ON public.answers FOR ALL TO authenticated
  USING (public.is_question_bank_staff())
  WITH CHECK (public.is_question_bank_staff());

CREATE POLICY question_bank_teacher_read_answers
  ON public.answers FOR SELECT TO authenticated
  USING (public.can_read_question_bank_question(question_id));

CREATE POLICY question_bank_teacher_insert_answers
  ON public.answers FOR INSERT TO authenticated
  WITH CHECK (public.can_mutate_question_bank_question(question_id));

CREATE POLICY question_bank_teacher_update_answers
  ON public.answers FOR UPDATE TO authenticated
  USING (public.can_mutate_question_bank_question(question_id))
  WITH CHECK (public.can_mutate_question_bank_question(question_id));

CREATE POLICY question_bank_teacher_delete_answers
  ON public.answers FOR DELETE TO authenticated
  USING (public.can_mutate_question_bank_question(question_id));

CREATE POLICY staff_read_scoped_exam_question_links
  ON public.exam_questions FOR SELECT TO authenticated
  USING (public.can_manage_exam(exam_id));

CREATE POLICY staff_insert_draft_exam_question_links
  ON public.exam_questions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_attach_question_to_exam(exam_id, question_id)
    AND exam_questions.question_type = (
      SELECT question.question_type
      FROM public.questions question
      WHERE question.id = exam_questions.question_id
    )
  );

CREATE POLICY staff_update_draft_exam_question_links
  ON public.exam_questions FOR UPDATE TO authenticated
  USING (public.can_edit_exam_question_links(exam_id))
  WITH CHECK (
    public.can_attach_question_to_exam(exam_id, question_id)
    AND exam_questions.question_type = (
      SELECT question.question_type
      FROM public.questions question
      WHERE question.id = exam_questions.question_id
    )
  );

CREATE POLICY staff_delete_draft_exam_question_links
  ON public.exam_questions FOR DELETE TO authenticated
  USING (public.can_edit_exam_question_links(exam_id));

CREATE POLICY staff_read_scoped_homework_question_links
  ON public.homework_questions FOR SELECT TO authenticated
  USING (public.can_manage_homework(homework_id));

CREATE POLICY staff_insert_draft_homework_question_links
  ON public.homework_questions FOR INSERT TO authenticated
  WITH CHECK (public.can_attach_question_to_homework(homework_id, question_id));

CREATE POLICY staff_update_draft_homework_question_links
  ON public.homework_questions FOR UPDATE TO authenticated
  USING (public.can_edit_homework_question_links(homework_id))
  WITH CHECK (public.can_attach_question_to_homework(homework_id, question_id));

CREATE POLICY staff_delete_draft_homework_question_links
  ON public.homework_questions FOR DELETE TO authenticated
  USING (public.can_edit_homework_question_links(homework_id));

CREATE POLICY students_read_own_exam_attempts
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    AND (
      status = 'in_progress'
      OR EXISTS (
        SELECT 1
        FROM public.exams e
        WHERE e.id = exam_attempts.exam_id
          AND (
            e.exam_mode = 'practice'
            OR (
              e.exam_mode = 'simulation'
              AND exam_attempts.grading_status = 'completed'
              AND COALESCE(e.show_results_immediately, false)
            )
          )
      )
    )
  );

CREATE POLICY staff_read_scoped_exam_attempts
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (public.can_manage_exam(exam_id));

CREATE POLICY students_update_own_exam_attempt_progress
  ON public.exam_attempts FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY staff_update_scoped_exam_attempts
  ON public.exam_attempts FOR UPDATE TO authenticated
  USING (public.can_manage_exam(exam_id))
  WITH CHECK (public.can_manage_exam(exam_id));

CREATE POLICY staff_delete_scoped_exam_attempts
  ON public.exam_attempts FOR DELETE TO authenticated
  USING (public.can_manage_exam(exam_id));

CREATE POLICY students_read_own_practice_drafts
  ON public.student_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      JOIN public.exams e ON e.id = ea.exam_id
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.status = 'in_progress'
        AND e.exam_mode = 'practice'
    )
  );

CREATE POLICY staff_read_scoped_exam_answers
  ON public.student_answers FOR SELECT TO authenticated
  USING (public.can_manage_exam_attempt(attempt_id));

CREATE POLICY admins_read_homework_answers
  ON public.homework_answers FOR SELECT TO authenticated
  USING (public.is_homework_admin());

CREATE POLICY students_read_own_homework_attempts
  ON public.homework_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY students_update_own_homework_attempts
  ON public.homework_attempts FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY admins_manage_homework_attempts
  ON public.homework_attempts FOR ALL TO authenticated
  USING (public.is_homework_admin())
  WITH CHECK (public.is_homework_admin());

CREATE POLICY students_insert_practice_drafts
  ON public.student_answers FOR INSERT TO authenticated
  WITH CHECK (public.can_write_practice_draft(attempt_id, question_id));

CREATE POLICY students_update_practice_drafts
  ON public.student_answers FOR UPDATE TO authenticated
  USING (public.can_write_practice_draft(attempt_id, question_id))
  WITH CHECK (public.can_write_practice_draft(attempt_id, question_id));

DROP POLICY IF EXISTS "Students create own homework attempts" ON public.homework_attempts;
CREATE POLICY "Students create assigned homework attempts"
  ON public.homework_attempts FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_work_on_homework_assignment(assignment_id)
  );

REVOKE ALL ON TABLE public.profiles, public.questions, public.answers,
  public.exam_questions, public.exam_attempts, public.student_answers,
  public.homework_questions, public.homework_answers,
  public.question_bookmarks, public.homework_attempts, public.classes,
  public.exams, public.homeworks, public.homework_assignments,
  public.homework_assignment_recipients, public.site_settings
  FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

-- These SECURITY DEFINER RPCs are legacy snapshot artifacts with no runtime
-- call-site. Revoke every overload if one survived on the live database.
DO $$
DECLARE
  legacy_routine record;
BEGIN
  FOR legacy_routine IN
    SELECT
      routine_schema.nspname AS schema_name,
      routine_row.proname AS routine_name,
      pg_get_function_identity_arguments(routine_row.oid) AS identity_arguments
    FROM pg_proc routine_row
    JOIN pg_namespace routine_schema ON routine_schema.oid = routine_row.pronamespace
    WHERE routine_schema.nspname = 'public'
      AND routine_row.proname IN (
        'get_available_exams',
        'get_exam_questions_by_part',
        'get_exam_results_summary'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      legacy_routine.schema_name,
      legacy_routine.routine_name,
      legacy_routine.identity_arguments
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.questions, public.answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.exam_questions, public.homework_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.classes TO authenticated;
GRANT SELECT (
  id, title, subject, duration, is_published, exam_mode, created_at
) ON TABLE public.exams TO anon;
GRANT SELECT ON TABLE public.exams TO authenticated;
GRANT INSERT (
  id, title, subject, duration, total_score, passing_score, is_published,
  source_exam, grade, exam_mode, session_size, created_by, class_id
) ON TABLE public.exams TO authenticated;
GRANT UPDATE (
  title, description, duration, start_time, end_time, max_attempts,
  show_results_immediately, allow_review, is_published
) ON TABLE public.exams TO authenticated;
GRANT DELETE ON TABLE public.exams TO authenticated;
GRANT SELECT ON TABLE public.exam_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.student_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.homeworks, public.homework_assignments TO authenticated;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.homework_assignment_recipients TO authenticated;
GRANT SELECT ON TABLE public.homework_answers TO authenticated;
GRANT SELECT, DELETE ON TABLE public.question_bookmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.homework_attempts TO authenticated;
GRANT SELECT ON TABLE public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.site_settings TO authenticated;

REVOKE ALL ON FUNCTION public.is_system_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_homework_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_has_feature(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_question_bank_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_exam(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_exam_metadata(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_exam_scope(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_exam_attempt(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_homework(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_exam_question_links(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_attach_question_to_exam(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_homework_question_links(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_attach_question_to_homework(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_question_bank_question(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_mutate_question_bank_question(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_reveal_question_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_question_content(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_practice_draft(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_homework_assignment(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_homework_assignment(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_work_on_homework_assignment(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_preparation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_exam_attempt(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_attempt_questions(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exam_attempt_trusted_internal(text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_essay_answer_trusted_internal(
  text, text, integer, numeric, text, numeric, numeric, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_practice_attempt(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_essay_answer(
  text, text, integer, numeric, text, numeric, numeric, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_simulation_leaderboard(text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_exam_answer_metadata(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_homework_attempt_questions(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_homework_question_metadata() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_homework_answer_metadata() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_homework_answer(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_homework_attempt(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_safe_bookmarks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_question_ownership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_simulation_submission_deadline() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_student_exam_attempt_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_student_exam_answer_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_student_homework_attempt_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_student_homework_answer_writes() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_homework_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_question_bank_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_exam(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_exam_metadata(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_exam_scope(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_exam_attempt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_homework(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_exam_question_links(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_attach_question_to_exam(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_homework_question_links(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_attach_question_to_homework(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_question_bank_question(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_mutate_question_bank_question(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_reveal_question_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_question_content(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_practice_draft(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_homework_assignment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_homework_assignment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_work_on_homework_assignment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_preparation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_questions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_practice_attempt(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_essay_answer(
  text, text, integer, numeric, text, numeric, numeric, text, jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_simulation_leaderboard(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_exam_answer_metadata(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_homework_attempt_questions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_homework_question_metadata() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_homework_answer_metadata() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_homework_answer(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_homework_attempt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_safe_bookmarks() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
