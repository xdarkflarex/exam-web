-- READ ONLY. Run after 20260721_essay_assisted_grading.sql commits.
-- Expected: exactly one result set and every must_be_zero value is 0.
-- This proves catalog/data invariants only. SQL Editor normally runs as postgres,
-- so complete the JWT/RLS negative tests in docs/RUNBOOK.md before rollout.

WITH
required_relations(relation_name) AS (
  VALUES
    ('question_grading_configs'),
    ('essay_grading_reviews')
),
required_columns(table_name, column_name, udt_name, is_nullable) AS (
  VALUES
    ('questions', 'essay_max_score', 'numeric', 'NO'),
    ('student_answers', 'max_score', 'numeric', 'NO'),
    ('student_answers', 'grading_status', 'text', 'NO'),
    ('student_answers', 'grading_feedback', 'text', 'YES'),
    ('student_answers', 'grading_breakdown', 'jsonb', 'YES'),
    ('student_answers', 'grading_confidence', 'numeric', 'YES'),
    ('student_answers', 'grading_method', 'text', 'YES'),
    ('student_answers', 'grading_rubric_version', 'int4', 'YES'),
    ('student_answers', 'answer_hash', 'text', 'YES'),
    ('student_answers', 'ai_score', 'numeric', 'YES'),
    ('student_answers', 'ai_feedback', 'text', 'YES'),
    ('student_answers', 'ai_model', 'text', 'YES'),
    ('student_answers', 'graded_by', 'uuid', 'YES'),
    ('student_answers', 'graded_at', 'timestamptz', 'YES'),
    ('exam_attempts', 'grading_status', 'text', 'NO'),
    ('exam_attempts', 'objective_points', 'numeric', 'NO'),
    ('exam_attempts', 'essay_points', 'numeric', 'NO'),
    ('exam_attempts', 'earned_points', 'numeric', 'NO'),
    ('exam_attempts', 'max_points', 'numeric', 'NO'),
    ('exam_attempts', 'pending_grading_count', 'int4', 'NO'),
    ('exam_attempts', 'submission_hash', 'text', 'YES'),
    ('exam_attempts', 'graded_at', 'timestamptz', 'YES'),
    ('question_grading_configs', 'question_id', 'text', 'NO'),
    ('question_grading_configs', 'reference_answer', 'text', 'NO'),
    ('question_grading_configs', 'rubric', 'jsonb', 'NO'),
    ('question_grading_configs', 'rubric_version', 'int4', 'NO'),
    ('question_grading_configs', 'minimum_confidence', 'numeric', 'NO'),
    ('question_grading_configs', 'ai_enabled', 'bool', 'NO'),
    ('question_grading_configs', 'created_by', 'uuid', 'YES'),
    ('question_grading_configs', 'created_at', 'timestamptz', 'NO'),
    ('question_grading_configs', 'updated_at', 'timestamptz', 'NO'),
    ('essay_grading_reviews', 'id', 'uuid', 'NO'),
    ('essay_grading_reviews', 'student_answer_id', 'text', 'NO'),
    ('essay_grading_reviews', 'attempt_id', 'text', 'NO'),
    ('essay_grading_reviews', 'review_hash', 'text', 'NO'),
    ('essay_grading_reviews', 'answer_hash', 'text', 'NO'),
    ('essay_grading_reviews', 'rubric_version', 'int4', 'NO'),
    ('essay_grading_reviews', 'ai_score', 'numeric', 'YES'),
    ('essay_grading_reviews', 'ai_confidence', 'numeric', 'YES'),
    ('essay_grading_reviews', 'ai_feedback', 'text', 'YES'),
    ('essay_grading_reviews', 'ai_breakdown', 'jsonb', 'YES'),
    ('essay_grading_reviews', 'ai_model', 'text', 'YES'),
    ('essay_grading_reviews', 'final_score', 'numeric', 'NO'),
    ('essay_grading_reviews', 'final_feedback', 'text', 'YES'),
    ('essay_grading_reviews', 'reviewer_id', 'uuid', 'NO'),
    ('essay_grading_reviews', 'created_at', 'timestamptz', 'NO')
),
required_constraints(table_name, constraint_name) AS (
  VALUES
    ('questions', 'questions_question_type_check'),
    ('questions', 'questions_essay_max_score_check'),
    ('exam_questions', 'exam_questions_question_type_check'),
    ('student_answers', 'student_answers_question_type_check'),
    ('student_answers', 'student_answers_grading_status_check'),
    ('student_answers', 'student_answers_grading_confidence_check'),
    ('student_answers', 'student_answers_max_score_check'),
    ('exam_attempts', 'exam_attempts_grading_status_check'),
    ('question_grading_configs', 'question_grading_configs_pkey'),
    ('question_grading_configs', 'question_grading_configs_question_id_fkey'),
    ('question_grading_configs', 'question_grading_configs_created_by_fkey'),
    ('question_grading_configs', 'question_grading_configs_rubric_array_check'),
    ('question_grading_configs', 'question_grading_configs_version_check'),
    ('question_grading_configs', 'question_grading_configs_confidence_check'),
    ('essay_grading_reviews', 'essay_grading_reviews_pkey'),
    ('essay_grading_reviews', 'essay_grading_reviews_student_answer_id_fkey'),
    ('essay_grading_reviews', 'essay_grading_reviews_attempt_id_fkey'),
    ('essay_grading_reviews', 'essay_grading_reviews_reviewer_id_fkey'),
    ('essay_grading_reviews', 'essay_grading_reviews_version_check'),
    ('essay_grading_reviews', 'essay_grading_reviews_ai_score_check'),
    ('essay_grading_reviews', 'essay_grading_reviews_confidence_check'),
    ('essay_grading_reviews', 'essay_grading_reviews_final_score_check'),
    ('essay_grading_reviews', 'essay_grading_reviews_idempotency_key')
),
essay_type_constraints(table_name, constraint_name) AS (
  VALUES
    ('questions', 'questions_question_type_check'),
    ('exam_questions', 'exam_questions_question_type_check'),
    ('student_answers', 'student_answers_question_type_check')
),
required_functions(signature, security_definer) AS (
  VALUES
    ('public.update_exam_analytics()', false),
    ('public.calculate_exam_score()', false),
    ('public.create_essay_question(text,text,text,integer,numeric,text,jsonb)', true),
    ('public.submit_exam_attempt(text,jsonb)', true),
    ('public.review_essay_answer(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)', true),
    ('public.protect_simulation_answer_grades()', true),
    ('public.protect_simulation_attempt_grades()', true)
),
client_functions(signature) AS (
  VALUES
    ('public.create_essay_question(text,text,text,integer,numeric,text,jsonb)'),
    ('public.submit_exam_attempt(text,jsonb)'),
    ('public.review_essay_answer(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)')
),
required_triggers(table_name, trigger_name) AS (
  VALUES
    ('student_answers', 'update_analytics_on_answer'),
    ('student_answers', 'trg_protect_simulation_answer_grades'),
    ('exam_attempts', 'trg_protect_simulation_attempt_grades')
),
required_indexes(index_name) AS (
  VALUES
    ('idx_student_answers_pending_essay'),
    ('idx_essay_grading_reviews_answer')
),
expected_policies(table_name, policy_name) AS (
  VALUES
    ('question_grading_configs', 'Admin and teacher read grading configs'),
    ('essay_grading_reviews', 'Admin and teacher read grading reviews')
),
new_tables(table_name) AS (
  VALUES
    ('question_grading_configs'),
    ('essay_grading_reviews')
)
SELECT 'missing_required_relations' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM required_relations
WHERE to_regclass('public.' || relation_name) IS NULL

UNION ALL

SELECT 'missing_or_incompatible_columns', COUNT(*)::bigint
FROM required_columns required
LEFT JOIN information_schema.columns runtime
  ON runtime.table_schema = 'public'
 AND runtime.table_name = required.table_name
 AND runtime.column_name = required.column_name
WHERE runtime.column_name IS NULL
   OR runtime.udt_name IS DISTINCT FROM required.udt_name
   OR runtime.is_nullable IS DISTINCT FROM required.is_nullable

UNION ALL

SELECT 'missing_or_unvalidated_constraints', COUNT(*)::bigint
FROM required_constraints required
LEFT JOIN pg_constraint constraint_row
  ON constraint_row.conrelid = to_regclass('public.' || required.table_name)
 AND constraint_row.conname = required.constraint_name
WHERE constraint_row.oid IS NULL
   OR constraint_row.convalidated IS DISTINCT FROM true

UNION ALL

SELECT 'question_type_constraints_without_essay', COUNT(*)::bigint
FROM essay_type_constraints required
LEFT JOIN pg_constraint constraint_row
  ON constraint_row.conrelid = to_regclass('public.' || required.table_name)
 AND constraint_row.conname = required.constraint_name
WHERE constraint_row.oid IS NULL
   OR position('essay' IN pg_get_constraintdef(constraint_row.oid, true)) = 0

UNION ALL

SELECT 'missing_or_wrong_security_functions', COUNT(*)::bigint
FROM required_functions required
LEFT JOIN pg_proc function_row
  ON function_row.oid = to_regprocedure(required.signature)::oid
WHERE function_row.oid IS NULL
   OR function_row.prosecdef IS DISTINCT FROM required.security_definer

UNION ALL

SELECT 'client_functions_not_granted_to_authenticated', COUNT(*)::bigint
FROM client_functions required
WHERE NOT COALESCE(
  has_function_privilege('authenticated', to_regprocedure(required.signature)::oid, 'EXECUTE'),
  false
)

UNION ALL

SELECT 'client_functions_executable_by_anon', COUNT(*)::bigint
FROM client_functions required
WHERE COALESCE(
  has_function_privilege('anon', to_regprocedure(required.signature)::oid, 'EXECUTE'),
  false
)

UNION ALL

SELECT 'missing_or_disabled_triggers', COUNT(*)::bigint
FROM required_triggers required
LEFT JOIN pg_trigger trigger_row
  ON trigger_row.tgrelid = to_regclass('public.' || required.table_name)
 AND trigger_row.tgname = required.trigger_name
 AND NOT trigger_row.tgisinternal
WHERE trigger_row.oid IS NULL
   OR trigger_row.tgenabled IS DISTINCT FROM 'O'

UNION ALL

SELECT 'missing_required_indexes', COUNT(*)::bigint
FROM required_indexes required
WHERE to_regclass('public.' || required.index_name) IS NULL

UNION ALL

SELECT 'new_tables_without_rls', COUNT(*)::bigint
FROM new_tables required
LEFT JOIN pg_class table_row
  ON table_row.oid = to_regclass('public.' || required.table_name)
WHERE table_row.oid IS NULL
   OR table_row.relrowsecurity IS DISTINCT FROM true

UNION ALL

SELECT 'missing_or_wrong_read_policies', COUNT(*)::bigint
FROM expected_policies required
LEFT JOIN pg_policies policy_row
  ON policy_row.schemaname = 'public'
 AND policy_row.tablename = required.table_name
 AND policy_row.policyname = required.policy_name
WHERE policy_row.policyname IS NULL
   OR policy_row.cmd IS DISTINCT FROM 'SELECT'
   OR NOT ('authenticated' = ANY(policy_row.roles))

UNION ALL

SELECT 'unexpected_policies_on_new_tables', COUNT(*)::bigint
FROM pg_policies policy_row
WHERE policy_row.schemaname = 'public'
  AND policy_row.tablename IN ('question_grading_configs', 'essay_grading_reviews')
  AND NOT EXISTS (
    SELECT 1
    FROM expected_policies expected
    WHERE expected.table_name = policy_row.tablename
      AND expected.policy_name = policy_row.policyname
  )

UNION ALL

SELECT 'new_tables_missing_authenticated_select', COUNT(*)::bigint
FROM new_tables required
WHERE NOT COALESCE(
  has_table_privilege(
    'authenticated',
    to_regclass('public.' || required.table_name)::oid,
    'SELECT'
  ),
  false
)

UNION ALL

SELECT 'new_tables_with_anon_privileges', COUNT(*)::bigint
FROM new_tables required
WHERE COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'SELECT'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'INSERT'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'UPDATE'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'DELETE'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'TRUNCATE'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'REFERENCES'), false)
   OR COALESCE(has_table_privilege('anon', to_regclass('public.' || required.table_name)::oid, 'TRIGGER'), false)

UNION ALL

SELECT 'new_tables_with_authenticated_mutation', COUNT(*)::bigint
FROM new_tables required
WHERE COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'INSERT'), false)
   OR COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'UPDATE'), false)
   OR COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'DELETE'), false)
   OR COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'TRUNCATE'), false)
   OR COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'REFERENCES'), false)
   OR COALESCE(has_table_privilege('authenticated', to_regclass('public.' || required.table_name)::oid, 'TRIGGER'), false)

UNION ALL

SELECT 'invalid_question_types', COUNT(*)::bigint
FROM (
  SELECT question_type FROM public.questions
  UNION ALL
  SELECT question_type FROM public.exam_questions
  UNION ALL
  SELECT question_type FROM public.student_answers
) runtime_types
WHERE question_type IS NOT NULL
  AND question_type NOT IN ('multiple_choice', 'true_false', 'short_answer', 'essay')

UNION ALL

SELECT 'invalid_student_answer_scores', COUNT(*)::bigint
FROM public.student_answers
WHERE max_score <= 0
   OR score < 0
   OR score > max_score

UNION ALL

SELECT 'invalid_student_answer_grading_statuses', COUNT(*)::bigint
FROM public.student_answers
WHERE grading_status NOT IN ('not_required', 'auto_graded', 'pending_review', 'approved', 'failed')

UNION ALL

SELECT 'invalid_exam_attempt_grading_statuses', COUNT(*)::bigint
FROM public.exam_attempts
WHERE grading_status NOT IN ('not_required', 'pending_review', 'completed', 'failed')

UNION ALL

SELECT 'essay_questions_without_grading_config', COUNT(*)::bigint
FROM public.questions question_row
LEFT JOIN public.question_grading_configs grading_config
  ON grading_config.question_id = question_row.id
WHERE question_row.question_type = 'essay'
  AND grading_config.question_id IS NULL

ORDER BY check_name;
