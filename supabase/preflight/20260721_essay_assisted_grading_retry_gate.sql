-- READ ONLY. Run before retrying 20260721_essay_assisted_grading.sql after a
-- failed transaction. Every must_be_zero value must be 0.

SELECT 'invalid_question_types' AS check_name, COUNT(*) AS must_be_zero
FROM public.questions
WHERE question_type IS NOT NULL
  AND question_type NOT IN ('multiple_choice', 'true_false', 'short_answer', 'essay')

UNION ALL

SELECT 'negative_student_answer_scores', COUNT(*)
FROM public.student_answers
WHERE score < 0

UNION ALL

SELECT
  'analytics_trigger_missing_or_not_origin_enabled',
  CASE
    WHEN COUNT(*) = 1 AND bool_and(trigger_row.tgenabled = 'O') THEN 0
    ELSE 1
  END::bigint
FROM pg_trigger trigger_row
JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
WHERE schema_row.nspname = 'public'
  AND table_row.relname = 'student_answers'
  AND trigger_row.tgname = 'update_analytics_on_answer'
  AND NOT trigger_row.tgisinternal;

