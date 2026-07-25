-- READ-ONLY preflight for the essay-assisted grading pilot.
-- Run this on a disposable/staging Supabase project BEFORE applying
-- ../migrations/20260721_essay_assisted_grading.sql.
-- Do not paste output containing secrets or student data into an AI/chat.

-- 1. Required relations must exist.
SELECT required.relation_name, to_regclass('public.' || required.relation_name) AS runtime_relation
FROM unnest(ARRAY[
  'questions',
  'answers',
  'profiles',
  'classes',
  'exams',
  'exam_questions',
  'exam_attempts',
  'student_answers',
  'exam_analytics'
]) AS required(relation_name)
ORDER BY required.relation_name;

-- 2. Confirm the runtime types/defaults used by the migration and RPC signatures.
SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'questions' AND column_name IN ('id', 'question_type'))
    OR (table_name = 'answers' AND column_name IN ('id', 'question_id', 'is_correct'))
    OR (table_name = 'profiles' AND column_name IN ('id', 'role'))
    OR (table_name = 'classes' AND column_name IN ('id', 'teacher_id'))
    OR (table_name = 'exams' AND column_name IN ('id', 'class_id', 'created_by', 'exam_mode', 'duration'))
    OR (table_name = 'exam_questions' AND column_name IN ('exam_id', 'question_id', 'question_type', 'score'))
    OR (table_name = 'exam_attempts' AND column_name IN ('id', 'exam_id', 'student_id', 'status', 'score'))
    OR (table_name = 'student_answers' AND column_name IN ('id', 'attempt_id', 'question_id', 'question_type', 'score'))
  )
ORDER BY table_name, ordinal_position;

-- 3. Constraint names and definitions can drift from repository snapshots.
SELECT
  constraint_table.relname AS table_name,
  constraint_row.conname AS constraint_name,
  constraint_row.contype AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
JOIN pg_class constraint_table ON constraint_table.oid = constraint_row.conrelid
JOIN pg_namespace table_schema ON table_schema.oid = constraint_table.relnamespace
WHERE table_schema.nspname = 'public'
  AND constraint_table.relname IN ('questions', 'exam_questions', 'exam_attempts', 'student_answers')
ORDER BY constraint_table.relname, constraint_row.conname;

-- 4. Inspect legacy score/analytics triggers before the migration replaces their functions.
SELECT
  trigger_table.relname AS table_name,
  trigger_row.tgname AS trigger_name,
  trigger_row.tgenabled AS enabled_state,
  pg_get_triggerdef(trigger_row.oid, true) AS definition
FROM pg_trigger trigger_row
JOIN pg_class trigger_table ON trigger_table.oid = trigger_row.tgrelid
JOIN pg_namespace table_schema ON table_schema.oid = trigger_table.relnamespace
WHERE table_schema.nspname = 'public'
  AND NOT trigger_row.tgisinternal
  AND trigger_table.relname IN ('exam_attempts', 'student_answers')
ORDER BY trigger_table.relname, trigger_row.tgname;

-- Required for the guarded max_score backfill: update_analytics_on_answer must
-- exist on student_answers and enabled_state must be O (ordinary/origin enabled).

SELECT
  function_row.proname,
  pg_get_function_identity_arguments(function_row.oid) AS arguments,
  function_row.prosecdef AS security_definer,
  pg_get_functiondef(function_row.oid) AS definition
FROM pg_proc function_row
JOIN pg_namespace function_schema ON function_schema.oid = function_row.pronamespace
WHERE function_schema.nspname = 'public'
  AND function_row.proname IN ('calculate_exam_score', 'update_exam_analytics', 'submit_exam_attempt')
ORDER BY function_row.proname, arguments;

-- 5. Verify RLS and grants, especially direct student access to answer keys/solutions.
SELECT
  relation.relname AS table_name,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced
FROM pg_class relation
JOIN pg_namespace table_schema ON table_schema.oid = relation.relnamespace
WHERE table_schema.nspname = 'public'
  AND relation.relname IN ('questions', 'answers', 'exam_attempts', 'student_answers')
ORDER BY relation.relname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('questions', 'answers', 'exam_attempts', 'student_answers')
ORDER BY tablename, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('questions', 'answers', 'exam_attempts', 'student_answers')
ORDER BY table_name, grantee, privilege_type;

-- 6. Aggregate-only data checks; these do not return student answers or identities.
SELECT role, COUNT(*) AS profile_count
FROM public.profiles
GROUP BY role
ORDER BY role;

SELECT
  COUNT(*) AS answer_count,
  COUNT(*) FILTER (WHERE score < 0) AS negative_score_count,
  COUNT(*) FILTER (WHERE score > 1) AS score_over_one_count
FROM public.student_answers;

SELECT COUNT(*) AS orphan_answer_count
FROM public.student_answers student_answer
LEFT JOIN public.exam_attempts attempt ON attempt.id = student_answer.attempt_id
LEFT JOIN public.questions question_row ON question_row.id = student_answer.question_id
WHERE attempt.id IS NULL OR question_row.id IS NULL;

SELECT COUNT(*) AS duplicate_attempt_question_groups
FROM (
  SELECT attempt_id, question_id
  FROM public.student_answers
  GROUP BY attempt_id, question_id
  HAVING COUNT(*) > 1
) duplicate_group;

-- Stop and compare the output with docs/ESSAY_GRADING.md and docs/RUNBOOK.md.
-- Do not apply the migration if a required relation/type is missing, question-type
-- constraints have unexpected names, legacy function semantics differ materially,
-- or student answer-key access has not been understood.
