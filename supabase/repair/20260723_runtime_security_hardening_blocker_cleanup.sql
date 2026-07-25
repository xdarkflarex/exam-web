-- ONE-TIME DESTRUCTIVE REPAIR before runtime-security-hardening-20260722-r3.
-- Targets confirmed from the live 2026-07-24 preview:
--   published legacy homework exam: D8SSiJZKMEPxvpl8DFE5D
--   unpublished simulation attempt: bdf556d6-b230-45a9-8ece-07681aefeab1
--   attempt exam:                  R35IJgeJa6aLgMo1xXq0_
--
-- Live evidence expected from the 2026-07-23 preflight:
--   exam_has_invalid_runtime_mode = 1
--   in_progress_attempt_unpublished_exam = 1
--   attempt_unsupported_exam_mode = 0
--
-- Run only in a full maintenance window after taking a verified Supabase
-- backup. Freeze student submit/autosave and admin edits until COMMIT.
-- After COMMIT this deletion is recoverable only from that backup.
-- The exact draft attempt loses its answers, review rows, anti-cheat logs and
-- feedback. The invalid exam loses only its exam links/assignments/analytics;
-- shared question-bank rows in questions/answers are never deleted.

BEGIN;

SET LOCAL search_path = pg_temp, pg_catalog, public;
SET LOCAL row_security = off;
SET LOCAL app.exam_grading_trusted = 'on';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TEMP TABLE hardening_expected_targets (
  invalid_exam_id text NOT NULL,
  unpublished_attempt_id text NOT NULL,
  unpublished_attempt_exam_id text NOT NULL
) ON COMMIT DROP;

INSERT INTO hardening_expected_targets (
  invalid_exam_id,
  unpublished_attempt_id,
  unpublished_attempt_exam_id
) VALUES (
  'D8SSiJZKMEPxvpl8DFE5D',
  'bdf556d6-b230-45a9-8ece-07681aefeab1',
  'R35IJgeJa6aLgMo1xXq0_'
);

DO $$
DECLARE
  expected_invalid_exam_id text;
  expected_unpublished_attempt_id text;
  expected_unpublished_attempt_exam_id text;
BEGIN
  SELECT
    invalid_exam_id,
    unpublished_attempt_id,
    unpublished_attempt_exam_id
  INTO
    expected_invalid_exam_id,
    expected_unpublished_attempt_id,
    expected_unpublished_attempt_exam_id
  FROM hardening_expected_targets;

  IF btrim(expected_invalid_exam_id) = ''
     OR btrim(expected_unpublished_attempt_id) = ''
     OR btrim(expected_unpublished_attempt_exam_id) = '' THEN
    RAISE EXCEPTION 'CLEANUP_ABORTED_TARGET_IDS_EMPTY';
  END IF;
END;
$$;

LOCK TABLE
  public.exams,
  public.exam_questions,
  public.exam_attempts,
  public.student_answers
IN SHARE ROW EXCLUSIVE MODE;

-- Lock every known optional dependent relation that exists on this deployment.
DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'essay_grading_reviews',
    'mastery_evidence',
    'anti_cheat_logs',
    'question_feedbacks',
    'assignment_knowledge_targets',
    'exam_analytics',
    'exam_assignments'
  ]
  LOOP
    IF to_regclass('public.' || relation_name) IS NOT NULL THEN
      EXECUTE format(
        'LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Fail closed if any inbound FK to any relation directly deleted below is not
-- in the reviewed allowlist, including unexpected CASCADE/SET NULL actions.
DO $$
DECLARE
  unexpected_foreign_keys text;
BEGIN
  WITH allowed(
    child_schema,
    child_table,
    child_columns,
    parent_schema,
    parent_table,
    parent_columns,
    delete_action
  ) AS (
    VALUES
      ('public', 'student_answers', ARRAY['attempt_id']::text[], 'public', 'exam_attempts', ARRAY['id']::text[], 'c'),
      ('public', 'essay_grading_reviews', ARRAY['attempt_id']::text[], 'public', 'exam_attempts', ARRAY['id']::text[], 'c'),
      ('public', 'mastery_evidence', ARRAY['attempt_id']::text[], 'public', 'exam_attempts', ARRAY['id']::text[], 'c'),
      ('public', 'anti_cheat_logs', ARRAY['attempt_id']::text[], 'public', 'exam_attempts', ARRAY['id']::text[], 'c'),
      ('public', 'question_feedbacks', ARRAY['attempt_id']::text[], 'public', 'exam_attempts', ARRAY['id']::text[], 'c'),
      ('public', 'essay_grading_reviews', ARRAY['student_answer_id']::text[], 'public', 'student_answers', ARRAY['id']::text[], 'c'),
      ('public', 'mastery_evidence', ARRAY['student_answer_id']::text[], 'public', 'student_answers', ARRAY['id']::text[], 'c'),
      ('public', 'exam_questions', ARRAY['exam_id']::text[], 'public', 'exams', ARRAY['id']::text[], 'c'),
      ('public', 'exam_attempts', ARRAY['exam_id']::text[], 'public', 'exams', ARRAY['id']::text[], 'c'),
      ('public', 'exam_analytics', ARRAY['exam_id']::text[], 'public', 'exams', ARRAY['id']::text[], 'c'),
      ('public', 'exam_assignments', ARRAY['exam_id']::text[], 'public', 'exams', ARRAY['id']::text[], 'c'),
      ('public', 'assignment_knowledge_targets', ARRAY['exam_id']::text[], 'public', 'exams', ARRAY['id']::text[], 'c')
  ), inbound AS (
    SELECT
      constraint_row.conname AS constraint_name,
      child_schema.nspname AS child_schema,
      child_table.relname AS child_table,
      ARRAY(
        SELECT child_attribute.attname::text
        FROM unnest(constraint_row.conkey)
          WITH ORDINALITY AS child_key(attnum, ordinality)
        JOIN pg_attribute child_attribute
          ON child_attribute.attrelid = constraint_row.conrelid
         AND child_attribute.attnum = child_key.attnum
        ORDER BY child_key.ordinality
      ) AS child_columns,
      parent_schema.nspname AS parent_schema,
      parent_table.relname AS parent_table,
      ARRAY(
        SELECT parent_attribute.attname::text
        FROM unnest(constraint_row.confkey)
          WITH ORDINALITY AS parent_key(attnum, ordinality)
        JOIN pg_attribute parent_attribute
          ON parent_attribute.attrelid = constraint_row.confrelid
         AND parent_attribute.attnum = parent_key.attnum
        ORDER BY parent_key.ordinality
      ) AS parent_columns,
      constraint_row.confdeltype::text AS delete_action
    FROM pg_constraint constraint_row
    JOIN pg_class child_table ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace child_schema ON child_schema.oid = child_table.relnamespace
    JOIN pg_class parent_table ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace parent_schema ON parent_schema.oid = parent_table.relnamespace
    WHERE constraint_row.contype = 'f'
      AND parent_schema.nspname = 'public'
      AND parent_table.relname IN (
        'student_answers',
        'exam_attempts',
        'exams',
        'exam_questions',
        'essay_grading_reviews',
        'mastery_evidence',
        'anti_cheat_logs',
        'question_feedbacks',
        'assignment_knowledge_targets',
        'exam_analytics',
        'exam_assignments'
      )
  )
  SELECT string_agg(
    format(
      '%I.%I(%s) -> %I.%I(%s), delete_action=%s, constraint=%I',
      inbound.child_schema,
      inbound.child_table,
      array_to_string(inbound.child_columns, ','),
      inbound.parent_schema,
      inbound.parent_table,
      array_to_string(inbound.parent_columns, ','),
      inbound.delete_action,
      inbound.constraint_name
    ),
    '; '
  )
  INTO unexpected_foreign_keys
  FROM inbound
  WHERE NOT EXISTS (
    SELECT 1
    FROM allowed
    WHERE allowed.child_schema = inbound.child_schema
      AND allowed.child_table = inbound.child_table
      AND allowed.child_columns = inbound.child_columns
      AND allowed.parent_schema = inbound.parent_schema
      AND allowed.parent_table = inbound.parent_table
      AND allowed.parent_columns = inbound.parent_columns
      AND allowed.delete_action = inbound.delete_action
  );

  IF unexpected_foreign_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_UNEXPECTED_INBOUND_FOREIGN_KEYS: %',
      unexpected_foreign_keys;
  END IF;
END;
$$;

-- Non-internal DELETE triggers can mutate data outside FK semantics. The live
-- inventory has exactly these two protection triggers on directly deleted
-- relations; abort on any additional DELETE-capable trigger.
DO $$
DECLARE
  unexpected_delete_triggers text;
BEGIN
  WITH allowed(
    table_schema,
    table_name,
    trigger_name,
    function_schema,
    function_name
  ) AS (
    VALUES
      (
        'public',
        'student_answers',
        'trg_protect_simulation_answer_grades',
        'public',
        'protect_simulation_answer_grades'
      ),
      (
        'public',
        'exam_attempts',
        'trg_protect_simulation_attempt_grades',
        'public',
        'protect_simulation_attempt_grades'
      )
  ), delete_triggers AS (
    SELECT
      table_schema.nspname AS table_schema,
      table_row.relname AS table_name,
      trigger_row.tgname AS trigger_name,
      function_schema.nspname AS function_schema,
      function_row.proname AS function_name
    FROM pg_trigger trigger_row
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace table_schema ON table_schema.oid = table_row.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    JOIN pg_namespace function_schema ON function_schema.oid = function_row.pronamespace
    WHERE NOT trigger_row.tgisinternal
      AND (trigger_row.tgtype::integer & 8) = 8
      AND table_schema.nspname = 'public'
      AND table_row.relname IN (
        'student_answers',
        'exam_attempts',
        'exams',
        'exam_questions',
        'essay_grading_reviews',
        'mastery_evidence',
        'anti_cheat_logs',
        'question_feedbacks',
        'assignment_knowledge_targets',
        'exam_analytics',
        'exam_assignments'
      )
  )
  SELECT string_agg(
    format(
      '%I.%I trigger=%I function=%I.%I',
      delete_triggers.table_schema,
      delete_triggers.table_name,
      delete_triggers.trigger_name,
      delete_triggers.function_schema,
      delete_triggers.function_name
    ),
    '; '
  )
  INTO unexpected_delete_triggers
  FROM delete_triggers
  WHERE NOT EXISTS (
    SELECT 1
    FROM allowed
    WHERE allowed.table_schema = delete_triggers.table_schema
      AND allowed.table_name = delete_triggers.table_name
      AND allowed.trigger_name = delete_triggers.trigger_name
      AND allowed.function_schema = delete_triggers.function_schema
      AND allowed.function_name = delete_triggers.function_name
  );

  IF unexpected_delete_triggers IS NOT NULL THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_UNEXPECTED_DELETE_TRIGGERS: %',
      unexpected_delete_triggers;
  END IF;
END;
$$;

CREATE TEMP TABLE hardening_invalid_exams
ON COMMIT DROP
AS
SELECT exam.id
FROM public.exams exam
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice');

CREATE TEMP TABLE hardening_unpublished_attempts
ON COMMIT DROP
AS
SELECT attempt.id, attempt.exam_id
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE attempt.status = 'in_progress'
  AND NOT COALESCE(exam.is_published, false);

DO $$
DECLARE
  expected_invalid_exam_id text;
  expected_unpublished_attempt_id text;
  expected_unpublished_attempt_exam_id text;
  actual_invalid_exam_id text;
  actual_unpublished_attempt_id text;
  actual_unpublished_attempt_exam_id text;
BEGIN
  SELECT
    invalid_exam_id,
    unpublished_attempt_id,
    unpublished_attempt_exam_id
  INTO
    expected_invalid_exam_id,
    expected_unpublished_attempt_id,
    expected_unpublished_attempt_exam_id
  FROM hardening_expected_targets;

  IF (SELECT COUNT(*) FROM hardening_invalid_exams) <> 1 THEN
    RAISE EXCEPTION 'CLEANUP_ABORTED_INVALID_EXAM_COUNT_CHANGED';
  END IF;

  IF (SELECT COUNT(*) FROM hardening_unpublished_attempts) <> 1 THEN
    RAISE EXCEPTION 'CLEANUP_ABORTED_UNPUBLISHED_ATTEMPT_COUNT_CHANGED';
  END IF;

  SELECT id INTO actual_invalid_exam_id FROM hardening_invalid_exams;
  SELECT id, exam_id
  INTO actual_unpublished_attempt_id, actual_unpublished_attempt_exam_id
  FROM hardening_unpublished_attempts;

  IF actual_invalid_exam_id IS DISTINCT FROM expected_invalid_exam_id THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_INVALID_EXAM_ID_CHANGED: expected %, found %',
      expected_invalid_exam_id,
      actual_invalid_exam_id;
  END IF;

  IF actual_unpublished_attempt_id IS DISTINCT FROM expected_unpublished_attempt_id THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_UNPUBLISHED_ATTEMPT_ID_CHANGED: expected %, found %',
      expected_unpublished_attempt_id,
      actual_unpublished_attempt_id;
  END IF;

  IF actual_unpublished_attempt_exam_id IS DISTINCT FROM expected_unpublished_attempt_exam_id THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_UNPUBLISHED_ATTEMPT_EXAM_CHANGED: expected %, found %',
      expected_unpublished_attempt_exam_id,
      actual_unpublished_attempt_exam_id;
  END IF;

  -- This exact public legacy homework row was explicitly approved for deletion.
  IF NOT EXISTS (
    SELECT 1
    FROM public.exams exam
    JOIN hardening_invalid_exams invalid_exam ON invalid_exam.id = exam.id
    WHERE exam.exam_mode = 'homework'
      AND exam.is_published IS TRUE
  ) THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_PUBLISHED_LEGACY_HOMEWORK_TARGET_CHANGED';
  END IF;

  -- Enforce the supplied attempt_unsupported_exam_mode=0 invariant. The invalid
  -- exam must have no attempt history at all.
  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts attempt
    JOIN hardening_invalid_exams invalid_exam ON invalid_exam.id = attempt.exam_id
  ) THEN
    RAISE EXCEPTION 'CLEANUP_ABORTED_INVALID_EXAM_HAS_ATTEMPTS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM hardening_unpublished_attempts unpublished_attempt
    JOIN public.exams exam ON exam.id = unpublished_attempt.exam_id
    WHERE exam.exam_mode IS DISTINCT FROM 'simulation'
  ) THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_UNPUBLISHED_ATTEMPT_NOT_SIMULATION';
  END IF;

  -- Preview confirmed zero saved answers. Abort instead of deleting new work if
  -- any autosave/write happened before the maintenance lock was acquired.
  IF EXISTS (
    SELECT 1
    FROM public.student_answers answer
    JOIN hardening_unpublished_attempts unpublished_attempt
      ON unpublished_attempt.id = answer.attempt_id
  ) THEN
    RAISE EXCEPTION 'CLEANUP_ABORTED_TARGET_ATTEMPT_NOW_HAS_ANSWERS';
  END IF;
END;
$$;

CREATE TEMP TABLE hardening_target_attempts
ON COMMIT DROP
AS
SELECT unpublished_attempt.id, unpublished_attempt.exam_id
FROM hardening_unpublished_attempts unpublished_attempt;

-- Legacy mastery aggregates require a domain-specific refresh after evidence
-- deletion. The ordered migrations removed that subsystem; fail closed if a
-- drifted live deployment still has evidence for this draft attempt.
DO $$
BEGIN
  IF to_regclass('public.mastery_evidence') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.mastery_evidence evidence
      WHERE evidence.attempt_id IN (
        SELECT target_attempt.id FROM hardening_target_attempts target_attempt
      )
         OR evidence.student_answer_id IN (
           SELECT answer.id
           FROM public.student_answers answer
           WHERE answer.attempt_id IN (
             SELECT target_attempt.id FROM hardening_target_attempts target_attempt
           )
         )
    ) THEN
      RAISE EXCEPTION
        'CLEANUP_ABORTED_TARGET_HAS_LEGACY_MASTERY_EVIDENCE';
    END IF;
  END IF;
END;
$$;

CREATE TEMP TABLE hardening_affected_analytics
ON COMMIT DROP
AS
SELECT DISTINCT attempt.exam_id, answer.question_id
FROM hardening_target_attempts target_attempt
JOIN public.exam_attempts attempt ON attempt.id = target_attempt.id
JOIN public.student_answers answer ON answer.attempt_id = attempt.id;

-- Identifier-only audit output of the exact pinned targets. The sibling
-- *_preview.sql is the operator checkpoint; this batch does not pause here.
SELECT 'invalid_exam' AS target_type, invalid_exam.id AS target_id
FROM hardening_invalid_exams invalid_exam
UNION ALL
SELECT 'in_progress_attempt', target_attempt.id
FROM hardening_target_attempts target_attempt
ORDER BY target_type, target_id;

DO $$
BEGIN
  IF to_regclass('public.essay_grading_reviews') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.essay_grading_reviews
      WHERE attempt_id IN (SELECT id FROM hardening_target_attempts)
    $sql$;
  END IF;

  IF to_regclass('public.mastery_evidence') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.mastery_evidence
      WHERE attempt_id IN (SELECT id FROM hardening_target_attempts)
    $sql$;
  END IF;

  IF to_regclass('public.anti_cheat_logs') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.anti_cheat_logs
      WHERE attempt_id IN (SELECT id FROM hardening_target_attempts)
    $sql$;
  END IF;

  IF to_regclass('public.question_feedbacks') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.question_feedbacks
      WHERE attempt_id IN (SELECT id FROM hardening_target_attempts)
    $sql$;
  END IF;
END;
$$;

DELETE FROM public.student_answers answer
WHERE answer.attempt_id IN (
  SELECT target_attempt.id FROM hardening_target_attempts target_attempt
);

DO $$
DECLARE
  expected_attempt_count integer;
  deleted_attempt_count integer;
BEGIN
  SELECT COUNT(*) INTO expected_attempt_count FROM hardening_target_attempts;

  DELETE FROM public.exam_attempts attempt
  WHERE attempt.id IN (
    SELECT target_attempt.id FROM hardening_target_attempts target_attempt
  );
  GET DIAGNOSTICS deleted_attempt_count = ROW_COUNT;

  IF deleted_attempt_count <> expected_attempt_count THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_ATTEMPT_DELETE_COUNT: expected %, deleted %',
      expected_attempt_count,
      deleted_attempt_count;
  END IF;
END;
$$;

-- The live analytics trigger has no DELETE branch. Recompute each touched
-- objective row from remaining answers, using exam_questions as the canonical
-- type source; essay remains excluded from the legacy binary aggregate.
DO $$
BEGIN
  IF to_regclass('public.exam_analytics') IS NOT NULL THEN
    EXECUTE $sql$
      WITH stats AS (
        SELECT
          affected.exam_id,
          affected.question_id,
          COUNT(answer.id)::integer AS total_attempts,
          COUNT(answer.id) FILTER (WHERE answer.is_correct IS TRUE)::integer AS correct_count,
          COUNT(answer.id) FILTER (WHERE answer.is_correct IS FALSE)::integer AS incorrect_count
        FROM hardening_affected_analytics affected
        LEFT JOIN public.exam_attempts attempt
          ON attempt.exam_id = affected.exam_id
        LEFT JOIN public.student_answers answer
          ON answer.attempt_id = attempt.id
         AND answer.question_id = affected.question_id
         AND EXISTS (
           SELECT 1
           FROM public.exam_questions canonical_question
           WHERE canonical_question.exam_id = affected.exam_id
             AND canonical_question.question_id = affected.question_id
             AND canonical_question.question_type IN (
               'multiple_choice', 'true_false', 'short_answer'
             )
         )
        GROUP BY affected.exam_id, affected.question_id
      )
      UPDATE public.exam_analytics analytics
      SET
        total_attempts = stats.total_attempts,
        correct_count = stats.correct_count,
        incorrect_count = stats.incorrect_count,
        difficulty_index = (
          stats.correct_count::numeric
          / NULLIF(stats.total_attempts, 0)
          * 100
        ),
        updated_at = now()
      FROM stats
      WHERE analytics.exam_id = stats.exam_id
        AND analytics.question_id = stats.question_id
    $sql$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.assignment_knowledge_targets') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.assignment_knowledge_targets
      WHERE exam_id IN (SELECT id FROM hardening_invalid_exams)
    $sql$;
  END IF;

  IF to_regclass('public.exam_analytics') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.exam_analytics
      WHERE exam_id IN (SELECT id FROM hardening_invalid_exams)
    $sql$;
  END IF;

  IF to_regclass('public.exam_assignments') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.exam_assignments
      WHERE exam_id IN (SELECT id FROM hardening_invalid_exams)
    $sql$;
  END IF;
END;
$$;

DELETE FROM public.exam_questions exam_question
WHERE exam_question.exam_id IN (
  SELECT invalid_exam.id FROM hardening_invalid_exams invalid_exam
);

DO $$
DECLARE
  deleted_exam_count integer;
BEGIN
  DELETE FROM public.exams exam
  WHERE exam.id IN (
    SELECT invalid_exam.id FROM hardening_invalid_exams invalid_exam
  );
  GET DIAGNOSTICS deleted_exam_count = ROW_COUNT;

  IF deleted_exam_count <> 1 THEN
    RAISE EXCEPTION
      'CLEANUP_ABORTED_EXAM_DELETE_COUNT: expected 1, deleted %',
      deleted_exam_count;
  END IF;
END;
$$;

SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.exams exam
    WHERE exam.exam_mode IS NULL
       OR exam.exam_mode NOT IN ('simulation', 'practice')
  ) THEN
    RAISE EXCEPTION 'CLEANUP_POSTCHECK_INVALID_EXAM_MODE_REMAINS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts attempt
    JOIN public.exams exam ON exam.id = attempt.exam_id
    WHERE attempt.status = 'in_progress'
      AND NOT COALESCE(exam.is_published, false)
  ) THEN
    RAISE EXCEPTION 'CLEANUP_POSTCHECK_UNPUBLISHED_ATTEMPT_REMAINS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts attempt
    JOIN public.exams exam ON exam.id = attempt.exam_id
    WHERE exam.exam_mode IS NULL
       OR exam.exam_mode NOT IN ('simulation', 'practice')
  ) THEN
    RAISE EXCEPTION 'CLEANUP_POSTCHECK_UNSUPPORTED_ATTEMPT_MODE_REMAINS';
  END IF;
END;
$$;

SELECT 'exam_has_invalid_runtime_mode' AS check_name, COUNT(*) AS must_be_zero
FROM public.exams exam
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice')
UNION ALL
SELECT 'in_progress_attempt_unpublished_exam', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE attempt.status = 'in_progress'
  AND NOT COALESCE(exam.is_published, false)
UNION ALL
SELECT 'attempt_unsupported_exam_mode', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice');

COMMIT;
