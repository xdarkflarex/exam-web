-- NO PERSISTENT WRITES. Resolve the two 2026-07-23 hardening-preflight
-- blockers to stable identifiers and review the complete dependent-row blast
-- radius before running the destructive cleanup sibling.
-- Do not share profile/email/class/answer content; this output contains only
-- identifiers, booleans, relation names and aggregate counts.

BEGIN ISOLATION LEVEL REPEATABLE READ;

SET LOCAL search_path = pg_temp, pg_catalog, public;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '1min';

CREATE TEMP TABLE hardening_preview_invalid_exams
ON COMMIT DROP
AS
SELECT exam.id
FROM public.exams exam
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice');

CREATE TEMP TABLE hardening_preview_unpublished_attempts
ON COMMIT DROP
AS
SELECT attempt.id, attempt.exam_id
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE attempt.status = 'in_progress'
  AND NOT COALESCE(exam.is_published, false);

SELECT
  exam.id AS invalid_exam_id,
  exam.exam_mode,
  exam.is_published,
  COUNT(DISTINCT attempt.id) AS linked_attempt_count,
  COUNT(DISTINCT answer.id) AS linked_answer_count
FROM hardening_preview_invalid_exams target
JOIN public.exams exam ON exam.id = target.id
LEFT JOIN public.exam_attempts attempt ON attempt.exam_id = exam.id
LEFT JOIN public.student_answers answer ON answer.attempt_id = attempt.id
GROUP BY exam.id, exam.exam_mode, exam.is_published
ORDER BY exam.id;

SELECT
  attempt.id AS unpublished_attempt_id,
  attempt.exam_id,
  exam.exam_mode,
  exam.is_published,
  attempt.status,
  COUNT(answer.id) AS saved_answer_count
FROM hardening_preview_unpublished_attempts target
JOIN public.exam_attempts attempt ON attempt.id = target.id
JOIN public.exams exam ON exam.id = attempt.exam_id
LEFT JOIN public.student_answers answer ON answer.attempt_id = attempt.id
GROUP BY
  attempt.id,
  attempt.exam_id,
  exam.exam_mode,
  exam.is_published,
  attempt.status
ORDER BY attempt.id;

CREATE TEMP TABLE hardening_preview_affected_rows (
  target_type text NOT NULL,
  target_id text NOT NULL,
  relation_name text NOT NULL,
  relation_present boolean NOT NULL,
  action text NOT NULL,
  affected_rows bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO hardening_preview_affected_rows
SELECT
  'invalid_exam',
  target.id::text,
  'exam_questions',
  true,
  'delete',
  (
    SELECT COUNT(*)
    FROM public.exam_questions dependency
    WHERE dependency.exam_id = target.id
  )
FROM hardening_preview_invalid_exams target;

INSERT INTO hardening_preview_affected_rows
SELECT
  'in_progress_attempt',
  target.id::text,
  'student_answers',
  true,
  'delete',
  (
    SELECT COUNT(*)
    FROM public.student_answers dependency
    WHERE dependency.attempt_id = target.id
  )
FROM hardening_preview_unpublished_attempts target;

DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'assignment_knowledge_targets',
    'exam_analytics',
    'exam_assignments'
  ]
  LOOP
    IF to_regclass('public.' || relation_name) IS NULL THEN
      INSERT INTO hardening_preview_affected_rows
      SELECT
        'invalid_exam',
        target.id::text,
        relation_name,
        false,
        'delete',
        0
      FROM hardening_preview_invalid_exams target;
    ELSE
      EXECUTE format(
        $sql$
          INSERT INTO hardening_preview_affected_rows
          SELECT
            'invalid_exam',
            target.id::text,
            %L,
            true,
            'delete',
            (
              SELECT COUNT(*)
              FROM public.%I dependency
              WHERE dependency.exam_id = target.id
            )
          FROM hardening_preview_invalid_exams target
        $sql$,
        relation_name,
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'anti_cheat_logs',
    'question_feedbacks'
  ]
  LOOP
    IF to_regclass('public.' || relation_name) IS NULL THEN
      INSERT INTO hardening_preview_affected_rows
      SELECT
        'in_progress_attempt',
        target.id::text,
        relation_name,
        false,
        'delete',
        0
      FROM hardening_preview_unpublished_attempts target;
    ELSE
      EXECUTE format(
        $sql$
          INSERT INTO hardening_preview_affected_rows
          SELECT
            'in_progress_attempt',
            target.id::text,
            %L,
            true,
            'delete',
            (
              SELECT COUNT(*)
              FROM public.%I dependency
              WHERE dependency.attempt_id = target.id
            )
          FROM hardening_preview_unpublished_attempts target
        $sql$,
        relation_name,
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  relation_name text;
  relation_action text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'essay_grading_reviews',
    'mastery_evidence'
  ]
  LOOP
    relation_action := CASE
      WHEN relation_name = 'mastery_evidence' THEN 'cleanup_requires_zero'
      ELSE 'delete'
    END;

    IF to_regclass('public.' || relation_name) IS NULL THEN
      INSERT INTO hardening_preview_affected_rows
      SELECT
        'in_progress_attempt',
        target.id::text,
        relation_name,
        false,
        relation_action,
        0
      FROM hardening_preview_unpublished_attempts target;
    ELSE
      EXECUTE format(
        $sql$
          INSERT INTO hardening_preview_affected_rows
          SELECT
            'in_progress_attempt',
            target.id::text,
            %L,
            true,
            %L,
            (
              SELECT COUNT(*)
              FROM public.%I dependency
              WHERE dependency.attempt_id = target.id
                 OR dependency.student_answer_id IN (
                   SELECT answer.id
                   FROM public.student_answers answer
                   WHERE answer.attempt_id = target.id
                 )
            )
          FROM hardening_preview_unpublished_attempts target
        $sql$,
        relation_name,
        relation_action,
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.exam_analytics') IS NULL THEN
    INSERT INTO hardening_preview_affected_rows
    SELECT
      'in_progress_attempt',
      target.id::text,
      'exam_analytics',
      false,
      'recompute',
      0
    FROM hardening_preview_unpublished_attempts target;
  ELSE
    EXECUTE $sql$
      INSERT INTO hardening_preview_affected_rows
      SELECT
        'in_progress_attempt',
        target.id::text,
        'exam_analytics',
        true,
        'recompute',
        (
          SELECT COUNT(*)
          FROM public.exam_analytics analytics
          WHERE analytics.exam_id = target.exam_id
            AND analytics.question_id IN (
              SELECT answer.question_id
              FROM public.student_answers answer
              WHERE answer.attempt_id = target.id
            )
        )
      FROM hardening_preview_unpublished_attempts target
    $sql$;
  END IF;
END;
$$;

SELECT
  target_type,
  target_id,
  relation_name,
  relation_present,
  action,
  affected_rows
FROM hardening_preview_affected_rows
ORDER BY target_type, target_id, action, relation_name;

-- This is the actual preflight block 6, which was missing from the supplied
-- output (block 6b appeared twice). Save and review all three aggregate values.
SELECT
  COUNT(*) FILTER (
    WHERE status = 'in_progress'
      AND (score IS NOT NULL OR submit_time IS NOT NULL)
  ) AS in_progress_with_final_fields,
  COUNT(*) FILTER (
    WHERE status IN ('submitted', 'graded') AND score IS NULL
  ) AS submitted_without_score,
  COUNT(*) FILTER (
    WHERE attempt_number IS NULL OR attempt_number < 1
  ) AS invalid_attempt_number
FROM public.exam_attempts;

COMMIT;
