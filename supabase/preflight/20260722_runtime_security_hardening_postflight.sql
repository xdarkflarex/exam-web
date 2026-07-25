-- Run AFTER 20260721_essay_assisted_grading.sql, 20260723_essay_legacy_config_backfill.sql,
-- and PATCH_VERSION runtime-security-hardening-20260722-r4.
-- SQL Editor normally bypasses RLS. These are structural checks; complete the
-- JWT/PostgREST negative tests from docs/RUNBOOK.md afterwards.

-- 1. Policy inventory. Expected: only the policies created by 20260722 on all
-- sixteen hardened tables. Parent ownership/recipient tables are included.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'questions', 'answers', 'exam_questions', 'exam_attempts',
    'student_answers', 'homework_questions', 'homework_answers',
    'homework_attempts', 'question_bookmarks', 'classes', 'exams', 'homeworks',
    'homework_assignments', 'homework_assignment_recipients', 'site_settings'
  )
ORDER BY tablename, policyname;

-- Expected: both must_be_zero values are 0.
WITH expected(table_name, policy_name, command, role_name) AS (
  VALUES
    ('profiles', 'users_read_own_profile', 'SELECT', 'authenticated'),
    ('profiles', 'staff_read_scoped_profiles', 'SELECT', 'authenticated'),
    ('profiles', 'users_insert_own_profile', 'INSERT', 'authenticated'),
    ('profiles', 'admins_insert_profiles', 'INSERT', 'authenticated'),
    ('profiles', 'users_update_own_profile', 'UPDATE', 'authenticated'),
    ('profiles', 'admins_update_profiles', 'UPDATE', 'authenticated'),
    ('profiles', 'admins_delete_profiles', 'DELETE', 'authenticated'),
    ('classes', 'admins_manage_classes', 'ALL', 'authenticated'),
    ('classes', 'teachers_read_own_classes', 'SELECT', 'authenticated'),
    ('exams', 'anon_read_published_simulation_exams', 'SELECT', 'anon'),
    ('exams', 'authenticated_read_scoped_exams', 'SELECT', 'authenticated'),
    ('exams', 'admins_manage_exams', 'ALL', 'authenticated'),
    ('exams', 'teachers_insert_owned_exam_drafts', 'INSERT', 'authenticated'),
    ('exams', 'teachers_update_scoped_exams', 'UPDATE', 'authenticated'),
    ('exams', 'teachers_delete_scoped_exams', 'DELETE', 'authenticated'),
    ('homeworks', 'admins_read_homeworks', 'SELECT', 'authenticated'),
    ('homeworks', 'students_read_assigned_homeworks', 'SELECT', 'authenticated'),
    ('homeworks', 'admins_insert_homeworks', 'INSERT', 'authenticated'),
    ('homeworks', 'admins_update_homeworks', 'UPDATE', 'authenticated'),
    ('homeworks', 'admins_delete_homeworks', 'DELETE', 'authenticated'),
    ('homework_assignments', 'admins_read_homework_assignments', 'SELECT', 'authenticated'),
    ('homework_assignments', 'students_read_assigned_homework_assignments', 'SELECT', 'authenticated'),
    ('homework_assignments', 'admins_insert_homework_assignments', 'INSERT', 'authenticated'),
    ('homework_assignments', 'admins_update_homework_assignments', 'UPDATE', 'authenticated'),
    ('homework_assignments', 'admins_delete_homework_assignments', 'DELETE', 'authenticated'),
    ('homework_assignment_recipients', 'admins_read_homework_recipients', 'SELECT', 'authenticated'),
    ('homework_assignment_recipients', 'students_read_own_homework_recipient_rows', 'SELECT', 'authenticated'),
    ('homework_assignment_recipients', 'admins_insert_homework_recipients', 'INSERT', 'authenticated'),
    ('homework_assignment_recipients', 'admins_delete_homework_recipients', 'DELETE', 'authenticated'),
    ('site_settings', 'public_read_landing_settings', 'SELECT', 'anon'),
    ('site_settings', 'authenticated_read_allowed_settings', 'SELECT', 'authenticated'),
    ('site_settings', 'admins_insert_site_settings', 'INSERT', 'authenticated'),
    ('site_settings', 'admins_update_site_settings', 'UPDATE', 'authenticated'),
    ('question_bookmarks', 'users_read_own_bookmarks', 'SELECT', 'authenticated'),
    ('question_bookmarks', 'users_delete_own_bookmarks', 'DELETE', 'authenticated'),
    ('questions', 'question_bank_admin_manage_questions', 'ALL', 'authenticated'),
    ('questions', 'question_bank_teacher_read_questions', 'SELECT', 'authenticated'),
    ('questions', 'question_bank_teacher_insert_questions', 'INSERT', 'authenticated'),
    ('questions', 'question_bank_teacher_update_questions', 'UPDATE', 'authenticated'),
    ('questions', 'question_bank_teacher_delete_questions', 'DELETE', 'authenticated'),
    ('answers', 'question_bank_admin_manage_answers', 'ALL', 'authenticated'),
    ('answers', 'question_bank_teacher_read_answers', 'SELECT', 'authenticated'),
    ('answers', 'question_bank_teacher_insert_answers', 'INSERT', 'authenticated'),
    ('answers', 'question_bank_teacher_update_answers', 'UPDATE', 'authenticated'),
    ('answers', 'question_bank_teacher_delete_answers', 'DELETE', 'authenticated'),
    ('exam_questions', 'staff_read_scoped_exam_question_links', 'SELECT', 'authenticated'),
    ('exam_questions', 'staff_insert_draft_exam_question_links', 'INSERT', 'authenticated'),
    ('exam_questions', 'staff_update_draft_exam_question_links', 'UPDATE', 'authenticated'),
    ('exam_questions', 'staff_delete_draft_exam_question_links', 'DELETE', 'authenticated'),
    ('homework_questions', 'staff_read_scoped_homework_question_links', 'SELECT', 'authenticated'),
    ('homework_questions', 'staff_insert_draft_homework_question_links', 'INSERT', 'authenticated'),
    ('homework_questions', 'staff_update_draft_homework_question_links', 'UPDATE', 'authenticated'),
    ('homework_questions', 'staff_delete_draft_homework_question_links', 'DELETE', 'authenticated'),
    ('exam_attempts', 'students_read_own_exam_attempts', 'SELECT', 'authenticated'),
    ('exam_attempts', 'staff_read_scoped_exam_attempts', 'SELECT', 'authenticated'),
    ('exam_attempts', 'students_update_own_exam_attempt_progress', 'UPDATE', 'authenticated'),
    ('exam_attempts', 'staff_update_scoped_exam_attempts', 'UPDATE', 'authenticated'),
    ('exam_attempts', 'staff_delete_scoped_exam_attempts', 'DELETE', 'authenticated'),
    ('student_answers', 'students_read_own_practice_drafts', 'SELECT', 'authenticated'),
    ('student_answers', 'staff_read_scoped_exam_answers', 'SELECT', 'authenticated'),
    ('student_answers', 'students_insert_practice_drafts', 'INSERT', 'authenticated'),
    ('student_answers', 'students_update_practice_drafts', 'UPDATE', 'authenticated'),
    ('homework_answers', 'admins_read_homework_answers', 'SELECT', 'authenticated'),
    ('homework_attempts', 'students_read_own_homework_attempts', 'SELECT', 'authenticated'),
    ('homework_attempts', 'students_update_own_homework_attempts', 'UPDATE', 'authenticated'),
    ('homework_attempts', 'admins_manage_homework_attempts', 'ALL', 'authenticated'),
    ('homework_attempts', 'Students create assigned homework attempts', 'INSERT', 'authenticated')
), hardened_tables(table_name) AS (
  VALUES
    ('profiles'), ('classes'), ('questions'), ('answers'), ('exams'),
    ('exam_questions'), ('exam_attempts'), ('student_answers'), ('homeworks'),
    ('homework_questions'), ('homework_assignments'),
    ('homework_assignment_recipients'), ('homework_attempts'),
    ('homework_answers'), ('question_bookmarks'), ('site_settings')
)
SELECT 'missing_expected_policies' AS check_name, COUNT(*) AS must_be_zero
FROM expected
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_policies runtime_policy
  WHERE runtime_policy.schemaname = 'public'
    AND runtime_policy.tablename = expected.table_name
    AND runtime_policy.policyname = expected.policy_name
    AND runtime_policy.cmd = expected.command
    AND runtime_policy.roles = ARRAY[expected.role_name::name]
    AND runtime_policy.permissive = 'PERMISSIVE'
)
UNION ALL
SELECT 'unexpected_policies', COUNT(*)
FROM pg_policies runtime_policy
JOIN hardened_tables ON hardened_tables.table_name = runtime_policy.tablename
WHERE runtime_policy.schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1
    FROM expected
    WHERE expected.table_name = runtime_policy.tablename
      AND expected.policy_name = runtime_policy.policyname
      AND expected.command = runtime_policy.cmd
      AND runtime_policy.roles = ARRAY[expected.role_name::name]
      AND runtime_policy.permissive = 'PERMISSIVE'
  );

-- 2. Table-level grants. PUBLIC must have zero rows. Anon has only
-- site_settings SELECT; its exam metadata permission is column-level and is
-- checked separately below.
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'questions', 'answers', 'exam_questions', 'exam_attempts',
    'student_answers', 'homework_questions', 'homework_answers',
    'homework_attempts', 'question_bookmarks', 'classes', 'exams', 'homeworks',
    'homework_assignments', 'homework_assignment_recipients', 'site_settings'
  )
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- Expected: both values are 0. INSERT/UPDATE on exams are deliberately
-- column-level and therefore excluded from this table-level allowlist.
WITH expected_grant_sets(grantee, table_name, privileges) AS (
  VALUES
    ('anon', 'site_settings', ARRAY['SELECT']::text[]),
    ('authenticated', 'profiles', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'classes', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'answers', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'exams', ARRAY['SELECT','DELETE']::text[]),
    ('authenticated', 'exam_questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'exam_attempts', ARRAY['SELECT']::text[]),
    ('authenticated', 'student_answers', ARRAY['SELECT','INSERT','UPDATE']::text[]),
    ('authenticated', 'homeworks', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_assignments', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_assignment_recipients', ARRAY['SELECT','INSERT','DELETE']::text[]),
    ('authenticated', 'homework_attempts', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_answers', ARRAY['SELECT']::text[]),
    ('authenticated', 'question_bookmarks', ARRAY['SELECT','DELETE']::text[]),
    ('authenticated', 'site_settings', ARRAY['SELECT','INSERT','UPDATE']::text[])
), expected AS (
  SELECT grantee, table_name, unnest(privileges) AS privilege_type
  FROM expected_grant_sets
), hardened_tables(table_name) AS (
  VALUES
    ('profiles'), ('classes'), ('questions'), ('answers'), ('exams'),
    ('exam_questions'), ('exam_attempts'), ('student_answers'), ('homeworks'),
    ('homework_questions'), ('homework_assignments'),
    ('homework_assignment_recipients'), ('homework_attempts'),
    ('homework_answers'), ('question_bookmarks'), ('site_settings')
), runtime AS (
  SELECT grantee, table_name, privilege_type, is_grantable
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND table_name IN (SELECT table_name FROM hardened_tables)
)
SELECT 'missing_expected_table_grants' AS check_name, COUNT(*) AS must_be_zero
FROM expected
WHERE NOT EXISTS (
  SELECT 1 FROM runtime
  WHERE runtime.grantee = expected.grantee
    AND runtime.table_name = expected.table_name
    AND runtime.privilege_type = expected.privilege_type
    AND runtime.is_grantable = 'NO'
)
UNION ALL
SELECT 'unexpected_table_grants', COUNT(*)
FROM runtime
  WHERE runtime.is_grantable <> 'NO'
     OR NOT EXISTS (
  SELECT 1 FROM expected
  WHERE expected.grantee = runtime.grantee
    AND expected.table_name = runtime.table_name
    AND expected.privilege_type = runtime.privilege_type
);

-- Expected: exact anon SELECT and authenticated INSERT/UPDATE column grants.
WITH expected_column_grant_sets(grantee, privilege_type, columns) AS (
  VALUES
    ('anon', 'SELECT', ARRAY[
      'id','title','subject','duration','is_published','exam_mode','created_at'
    ]::text[]),
    ('authenticated', 'INSERT', ARRAY[
      'id','title','subject','duration','total_score','passing_score',
      'is_published','source_exam','grade','exam_mode','session_size',
      'created_by','class_id'
    ]::text[]),
    ('authenticated', 'UPDATE', ARRAY[
      'title','description','duration','start_time','end_time','max_attempts',
      'show_results_immediately','allow_review','is_published'
    ]::text[])
), expected AS (
  SELECT grantee, privilege_type, unnest(columns) AS column_name
  FROM expected_column_grant_sets
), runtime AS (
  SELECT grantee, privilege_type, column_name, is_grantable
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'exams'
    AND (
      (grantee = 'anon' AND privilege_type = 'SELECT')
      OR (grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE'))
      OR grantee = 'PUBLIC'
    )
)
SELECT 'missing_expected_exam_column_grants' AS check_name, COUNT(*) AS must_be_zero
FROM expected
WHERE NOT EXISTS (
  SELECT 1 FROM runtime
  WHERE runtime.grantee = expected.grantee
    AND runtime.privilege_type = expected.privilege_type
    AND runtime.column_name = expected.column_name
    AND runtime.is_grantable = 'NO'
)
UNION ALL
SELECT 'unexpected_exam_column_grants', COUNT(*)
FROM runtime
  WHERE runtime.is_grantable <> 'NO'
     OR NOT EXISTS (
  SELECT 1 FROM expected
  WHERE expected.grantee = runtime.grantee
    AND expected.privilege_type = runtime.privilege_type
    AND expected.column_name = runtime.column_name
);

-- 3. Expected: all false except anon_site_settings_select_expected_true.
SELECT
  has_table_privilege('anon', 'public.questions', 'SELECT') AS anon_questions_select,
  has_table_privilege('anon', 'public.profiles', 'SELECT') AS anon_profiles_select,
  has_table_privilege('anon', 'public.answers', 'SELECT') AS anon_answers_select,
  has_table_privilege('anon', 'public.exam_questions', 'SELECT') AS anon_exam_questions_select,
  has_table_privilege('anon', 'public.exam_attempts', 'SELECT') AS anon_attempts_select,
  has_table_privilege('anon', 'public.student_answers', 'SELECT') AS anon_student_answers_select,
  has_table_privilege('anon', 'public.homework_questions', 'SELECT') AS anon_homework_questions_select,
  has_table_privilege('anon', 'public.homework_answers', 'SELECT') AS anon_homework_answers_select,
  has_table_privilege('anon', 'public.question_bookmarks', 'SELECT') AS anon_bookmarks_select,
  has_table_privilege('anon', 'public.site_settings', 'SELECT') AS anon_site_settings_select_expected_true,
  has_table_privilege('authenticated', 'public.exam_attempts', 'INSERT') AS client_attempt_insert,
  has_table_privilege('authenticated', 'public.exam_attempts', 'UPDATE') AS client_attempt_update,
  has_table_privilege('authenticated', 'public.exam_attempts', 'TRUNCATE') AS client_attempt_truncate,
  has_table_privilege('authenticated', 'public.homework_answers', 'INSERT') AS client_homework_answer_insert,
  has_table_privilege('authenticated', 'public.homework_answers', 'UPDATE') AS client_homework_answer_update,
  has_table_privilege('authenticated', 'public.homework_answers', 'DELETE') AS client_homework_answer_delete;

SELECT
  has_table_privilege('authenticated', 'public.question_bookmarks', 'INSERT') AS client_bookmark_insert,
  has_table_privilege('authenticated', 'public.question_bookmarks', 'UPDATE') AS client_bookmark_update;

-- Expected: first four true; remaining values false. Anon receives only the
-- seven landing metadata columns, never ownership/configuration columns.
SELECT
  has_any_column_privilege('anon', 'public.exams', 'SELECT') AS anon_exam_metadata_expected_true,
  has_column_privilege('anon', 'public.exams', 'id', 'SELECT') AS anon_exam_id_expected_true,
  has_column_privilege('anon', 'public.exams', 'is_published', 'SELECT') AS anon_exam_filter_expected_true,
  has_column_privilege('authenticated', 'public.exams', 'title', 'UPDATE') AS exam_title_update_expected_true,
  has_column_privilege('anon', 'public.exams', 'created_by', 'SELECT') AS anon_exam_owner_select,
  has_column_privilege('anon', 'public.exams', 'description', 'SELECT') AS anon_exam_description_select,
  has_table_privilege('authenticated', 'public.exams', 'INSERT') AS authenticated_exam_table_insert,
  has_table_privilege('authenticated', 'public.exams', 'UPDATE') AS authenticated_exam_table_update,
  has_column_privilege('authenticated', 'public.exams', 'id', 'UPDATE') AS exam_id_update,
  has_column_privilege('authenticated', 'public.exams', 'created_by', 'UPDATE') AS exam_owner_update,
  has_column_privilege('authenticated', 'public.exams', 'class_id', 'UPDATE') AS exam_class_update,
  has_column_privilege('authenticated', 'public.exams', 'exam_mode', 'UPDATE') AS exam_mode_update;

-- Expected: every value is false. Public SELECT may remain where an existing
-- published-content policy requires it, but anon must never mutate parents.
SELECT
  has_table_privilege('anon', 'public.classes', 'INSERT')
    OR has_table_privilege('anon', 'public.classes', 'UPDATE')
    OR has_table_privilege('anon', 'public.classes', 'DELETE') AS anon_classes_write,
  has_table_privilege('anon', 'public.exams', 'INSERT')
    OR has_table_privilege('anon', 'public.exams', 'UPDATE')
    OR has_table_privilege('anon', 'public.exams', 'DELETE') AS anon_exams_write,
  has_table_privilege('anon', 'public.homeworks', 'INSERT')
    OR has_table_privilege('anon', 'public.homeworks', 'UPDATE')
    OR has_table_privilege('anon', 'public.homeworks', 'DELETE') AS anon_homeworks_write,
  has_table_privilege('anon', 'public.homework_assignments', 'INSERT')
    OR has_table_privilege('anon', 'public.homework_assignments', 'UPDATE')
    OR has_table_privilege('anon', 'public.homework_assignments', 'DELETE') AS anon_homework_assignments_write,
  has_table_privilege('anon', 'public.homework_assignment_recipients', 'INSERT')
    OR has_table_privilege('anon', 'public.homework_assignment_recipients', 'UPDATE')
    OR has_table_privilege('anon', 'public.homework_assignment_recipients', 'DELETE') AS anon_homework_recipients_write;

SELECT grantee, COUNT(*) AS must_be_zero
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
GROUP BY grantee;

-- 4. Expected: every function exists, security_definer=true, anon_execute=false,
-- authenticated_execute=true.
WITH required(function_name, signature) AS (
  VALUES
    ('is_system_admin', 'public.is_system_admin()'),
    ('is_homework_admin', 'public.is_homework_admin()'),
    ('student_has_feature', 'public.student_has_feature(text)'),
    ('can_manage_profile', 'public.can_manage_profile(uuid)'),
    ('is_question_bank_staff', 'public.is_question_bank_staff()'),
    ('can_manage_exam', 'public.can_manage_exam(text)'),
    ('can_read_exam_metadata', 'public.can_read_exam_metadata(text)'),
    ('can_write_exam_scope', 'public.can_write_exam_scope(uuid,text,text)'),
    ('can_manage_exam_attempt', 'public.can_manage_exam_attempt(text)'),
    ('can_manage_homework', 'public.can_manage_homework(text)'),
    ('can_edit_exam_question_links', 'public.can_edit_exam_question_links(text)'),
    ('can_attach_question_to_exam', 'public.can_attach_question_to_exam(text,text)'),
    ('can_edit_homework_question_links', 'public.can_edit_homework_question_links(text)'),
    ('can_attach_question_to_homework', 'public.can_attach_question_to_homework(text,text)'),
    ('can_access_question_content', 'public.can_access_question_content(text)'),
    ('can_write_practice_draft', 'public.can_write_practice_draft(text,text)'),
    ('can_read_question_bank_question', 'public.can_read_question_bank_question(text)'),
    ('can_mutate_question_bank_question', 'public.can_mutate_question_bank_question(text)'),
    ('can_reveal_question_key', 'public.can_reveal_question_key(text)'),
    ('can_access_homework_assignment', 'public.can_access_homework_assignment(text)'),
    ('can_view_homework_assignment', 'public.can_view_homework_assignment(text)'),
    ('get_exam_preparation', 'public.get_exam_preparation(text)'),
    ('start_exam_attempt', 'public.start_exam_attempt(text)'),
    ('get_exam_attempt_questions', 'public.get_exam_attempt_questions(text)'),
    ('submit_exam_attempt', 'public.submit_exam_attempt(text,jsonb)'),
    ('submit_practice_attempt', 'public.submit_practice_attempt(text,jsonb)'),
    ('get_simulation_leaderboard', 'public.get_simulation_leaderboard(text,timestamptz)'),
    ('get_my_exam_answer_metadata', 'public.get_my_exam_answer_metadata(text)'),
    ('get_homework_attempt_questions', 'public.get_homework_attempt_questions(text)'),
    ('get_my_homework_question_metadata', 'public.get_my_homework_question_metadata()'),
    ('get_my_homework_answer_metadata', 'public.get_my_homework_answer_metadata()'),
    ('can_work_on_homework_assignment', 'public.can_work_on_homework_assignment(text)'),
    ('check_homework_answer', 'public.check_homework_answer(text,text,jsonb)'),
    ('submit_homework_attempt', 'public.submit_homework_attempt(text)'),
    ('get_my_safe_bookmarks', 'public.get_my_safe_bookmarks()')
)
SELECT
  required.function_name,
  function_row.prosecdef AS security_definer,
  has_function_privilege('anon', function_row.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', function_row.oid, 'EXECUTE') AS authenticated_execute
FROM required
LEFT JOIN pg_proc function_row
  ON function_row.oid = to_regprocedure(required.signature)
ORDER BY required.function_name;

-- 5. Expected: seven rows, each enabled (tgenabled = O).
SELECT
  trigger_table.relname AS table_name,
  trigger_row.tgname AS trigger_name,
  trigger_row.tgenabled,
  pg_get_triggerdef(trigger_row.oid, true) AS definition
FROM pg_trigger trigger_row
JOIN pg_class trigger_table ON trigger_table.oid = trigger_row.tgrelid
JOIN pg_namespace table_schema ON table_schema.oid = trigger_table.relnamespace
WHERE table_schema.nspname = 'public'
  AND trigger_row.tgname IN (
    'trg_protect_student_exam_attempt_writes',
    'trg_protect_profile_security_fields',
    'trg_protect_question_ownership',
    'trg_enforce_simulation_submission_deadline',
    'trg_protect_student_exam_answer_writes',
    'trg_protect_student_homework_attempt_writes',
    'trg_protect_student_homework_answer_writes'
  )
ORDER BY trigger_table.relname, trigger_row.tgname;

-- 6. Expected: all true.
SELECT
  has_function_privilege('authenticated', 'public.get_exam_preparation(text)', 'EXECUTE') AS can_prepare,
  has_function_privilege('authenticated', 'public.start_exam_attempt(text)', 'EXECUTE') AS can_start,
  has_function_privilege('authenticated', 'public.get_exam_attempt_questions(text)', 'EXECUTE') AS can_load_exam,
  has_function_privilege('authenticated', 'public.submit_exam_attempt(text,jsonb)', 'EXECUTE') AS can_submit_simulation,
  has_function_privilege('authenticated', 'public.submit_practice_attempt(text,jsonb)', 'EXECUTE') AS can_submit_practice,
  has_function_privilege('authenticated', 'public.check_homework_answer(text,text,jsonb)', 'EXECUTE') AS can_check_homework;

-- Expected: both false. Only the score-filtering wrapper is callable by clients.
SELECT
  has_function_privilege('anon', 'public.submit_exam_attempt_trusted_internal(text,jsonb)', 'EXECUTE') AS anon_internal_submit,
  has_function_privilege('authenticated', 'public.submit_exam_attempt_trusted_internal(text,jsonb)', 'EXECUTE') AS authenticated_internal_submit;

-- 7. Expected: sixteen rows, rls_enabled=true. Also expect both homework feedback
-- columns with default false.
SELECT
  table_row.relname AS table_name,
  table_row.relrowsecurity AS rls_enabled,
  table_row.relforcerowsecurity AS rls_forced
FROM pg_class table_row
JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
WHERE schema_row.nspname = 'public'
  AND table_row.relname IN (
    'profiles', 'questions', 'answers', 'exam_questions', 'exam_attempts',
    'student_answers', 'homework_questions', 'homework_answers',
    'homework_attempts', 'question_bookmarks', 'classes', 'exams', 'homeworks',
    'homework_assignments', 'homework_assignment_recipients', 'site_settings'
  )
ORDER BY table_row.relname;

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'homework_assignments'
  AND column_name IN ('show_feedback_immediately', 'allow_review')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'questions'
  AND column_name = 'created_by';

-- Expected: zero invalid rows and one validated restrictive constraint.
SELECT COUNT(*) AS invalid_exam_modes_must_be_zero
FROM public.exams
WHERE exam_mode IS NULL
   OR exam_mode NOT IN ('simulation', 'practice');

SELECT
  constraint_row.conname,
  constraint_row.convalidated,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
WHERE constraint_row.conrelid = 'public.exams'::regclass
  AND constraint_row.conname = 'exams_runtime_mode_check';

-- 8. Expected: every must_be_zero value is 0. This proves there is no generic
-- student SELECT policy for simulation answers or homework grading rows.
SELECT 'unexpected_student_answer_select_policy' AS check_name, COUNT(*) AS must_be_zero
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'student_answers'
  AND cmd = 'SELECT'
  AND policyname <> 'students_read_own_practice_drafts'
  AND policyname <> 'staff_read_scoped_exam_answers'
UNION ALL
SELECT 'unexpected_homework_answer_select_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'homework_answers'
  AND policyname <> 'admins_read_homework_answers'
UNION ALL
SELECT 'unexpected_bookmark_write_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'question_bookmarks'
  AND cmd IN ('INSERT', 'UPDATE')
UNION ALL
SELECT 'unexpected_homework_attempt_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'homework_attempts'
  AND policyname NOT IN (
    'students_read_own_homework_attempts',
    'students_update_own_homework_attempts',
    'admins_manage_homework_attempts',
    'Students create assigned homework attempts'
  )
UNION ALL
SELECT 'unexpected_exam_question_link_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'exam_questions'
  AND policyname NOT IN (
    'staff_read_scoped_exam_question_links',
    'staff_insert_draft_exam_question_links',
    'staff_update_draft_exam_question_links',
    'staff_delete_draft_exam_question_links'
  )
UNION ALL
SELECT 'unexpected_homework_question_link_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'homework_questions'
  AND policyname NOT IN (
    'staff_read_scoped_homework_question_links',
    'staff_insert_draft_homework_question_links',
    'staff_update_draft_homework_question_links',
    'staff_delete_draft_homework_question_links'
  )
UNION ALL
SELECT 'unexpected_site_settings_policy', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'site_settings'
  AND policyname NOT IN (
    'public_read_landing_settings',
    'authenticated_read_allowed_settings',
    'admins_insert_site_settings',
    'admins_update_site_settings'
  );

-- 9. FINAL STRUCTURAL GATE. Run the whole file; this last grid is the complete
-- structural allowlist for all sixteen hardened tables. Every value must be 0.
-- JWT/PostgREST negative tests are still mandatory afterwards.
WITH
expected_policies(table_name, policy_name, command, role_name) AS (
  VALUES
    ('profiles', 'users_read_own_profile', 'SELECT', 'authenticated'),
    ('profiles', 'staff_read_scoped_profiles', 'SELECT', 'authenticated'),
    ('profiles', 'users_insert_own_profile', 'INSERT', 'authenticated'),
    ('profiles', 'admins_insert_profiles', 'INSERT', 'authenticated'),
    ('profiles', 'users_update_own_profile', 'UPDATE', 'authenticated'),
    ('profiles', 'admins_update_profiles', 'UPDATE', 'authenticated'),
    ('profiles', 'admins_delete_profiles', 'DELETE', 'authenticated'),
    ('classes', 'admins_manage_classes', 'ALL', 'authenticated'),
    ('classes', 'teachers_read_own_classes', 'SELECT', 'authenticated'),
    ('exams', 'anon_read_published_simulation_exams', 'SELECT', 'anon'),
    ('exams', 'authenticated_read_scoped_exams', 'SELECT', 'authenticated'),
    ('exams', 'admins_manage_exams', 'ALL', 'authenticated'),
    ('exams', 'teachers_insert_owned_exam_drafts', 'INSERT', 'authenticated'),
    ('exams', 'teachers_update_scoped_exams', 'UPDATE', 'authenticated'),
    ('exams', 'teachers_delete_scoped_exams', 'DELETE', 'authenticated'),
    ('homeworks', 'admins_read_homeworks', 'SELECT', 'authenticated'),
    ('homeworks', 'students_read_assigned_homeworks', 'SELECT', 'authenticated'),
    ('homeworks', 'admins_insert_homeworks', 'INSERT', 'authenticated'),
    ('homeworks', 'admins_update_homeworks', 'UPDATE', 'authenticated'),
    ('homeworks', 'admins_delete_homeworks', 'DELETE', 'authenticated'),
    ('homework_assignments', 'admins_read_homework_assignments', 'SELECT', 'authenticated'),
    ('homework_assignments', 'students_read_assigned_homework_assignments', 'SELECT', 'authenticated'),
    ('homework_assignments', 'admins_insert_homework_assignments', 'INSERT', 'authenticated'),
    ('homework_assignments', 'admins_update_homework_assignments', 'UPDATE', 'authenticated'),
    ('homework_assignments', 'admins_delete_homework_assignments', 'DELETE', 'authenticated'),
    ('homework_assignment_recipients', 'admins_read_homework_recipients', 'SELECT', 'authenticated'),
    ('homework_assignment_recipients', 'students_read_own_homework_recipient_rows', 'SELECT', 'authenticated'),
    ('homework_assignment_recipients', 'admins_insert_homework_recipients', 'INSERT', 'authenticated'),
    ('homework_assignment_recipients', 'admins_delete_homework_recipients', 'DELETE', 'authenticated'),
    ('site_settings', 'public_read_landing_settings', 'SELECT', 'anon'),
    ('site_settings', 'authenticated_read_allowed_settings', 'SELECT', 'authenticated'),
    ('site_settings', 'admins_insert_site_settings', 'INSERT', 'authenticated'),
    ('site_settings', 'admins_update_site_settings', 'UPDATE', 'authenticated'),
    ('question_bookmarks', 'users_read_own_bookmarks', 'SELECT', 'authenticated'),
    ('question_bookmarks', 'users_delete_own_bookmarks', 'DELETE', 'authenticated'),
    ('questions', 'question_bank_admin_manage_questions', 'ALL', 'authenticated'),
    ('questions', 'question_bank_teacher_read_questions', 'SELECT', 'authenticated'),
    ('questions', 'question_bank_teacher_insert_questions', 'INSERT', 'authenticated'),
    ('questions', 'question_bank_teacher_update_questions', 'UPDATE', 'authenticated'),
    ('questions', 'question_bank_teacher_delete_questions', 'DELETE', 'authenticated'),
    ('answers', 'question_bank_admin_manage_answers', 'ALL', 'authenticated'),
    ('answers', 'question_bank_teacher_read_answers', 'SELECT', 'authenticated'),
    ('answers', 'question_bank_teacher_insert_answers', 'INSERT', 'authenticated'),
    ('answers', 'question_bank_teacher_update_answers', 'UPDATE', 'authenticated'),
    ('answers', 'question_bank_teacher_delete_answers', 'DELETE', 'authenticated'),
    ('exam_questions', 'staff_read_scoped_exam_question_links', 'SELECT', 'authenticated'),
    ('exam_questions', 'staff_insert_draft_exam_question_links', 'INSERT', 'authenticated'),
    ('exam_questions', 'staff_update_draft_exam_question_links', 'UPDATE', 'authenticated'),
    ('exam_questions', 'staff_delete_draft_exam_question_links', 'DELETE', 'authenticated'),
    ('homework_questions', 'staff_read_scoped_homework_question_links', 'SELECT', 'authenticated'),
    ('homework_questions', 'staff_insert_draft_homework_question_links', 'INSERT', 'authenticated'),
    ('homework_questions', 'staff_update_draft_homework_question_links', 'UPDATE', 'authenticated'),
    ('homework_questions', 'staff_delete_draft_homework_question_links', 'DELETE', 'authenticated'),
    ('exam_attempts', 'students_read_own_exam_attempts', 'SELECT', 'authenticated'),
    ('exam_attempts', 'staff_read_scoped_exam_attempts', 'SELECT', 'authenticated'),
    ('exam_attempts', 'students_update_own_exam_attempt_progress', 'UPDATE', 'authenticated'),
    ('exam_attempts', 'staff_update_scoped_exam_attempts', 'UPDATE', 'authenticated'),
    ('exam_attempts', 'staff_delete_scoped_exam_attempts', 'DELETE', 'authenticated'),
    ('student_answers', 'students_read_own_practice_drafts', 'SELECT', 'authenticated'),
    ('student_answers', 'staff_read_scoped_exam_answers', 'SELECT', 'authenticated'),
    ('student_answers', 'students_insert_practice_drafts', 'INSERT', 'authenticated'),
    ('student_answers', 'students_update_practice_drafts', 'UPDATE', 'authenticated'),
    ('homework_answers', 'admins_read_homework_answers', 'SELECT', 'authenticated'),
    ('homework_attempts', 'students_read_own_homework_attempts', 'SELECT', 'authenticated'),
    ('homework_attempts', 'students_update_own_homework_attempts', 'UPDATE', 'authenticated'),
    ('homework_attempts', 'admins_manage_homework_attempts', 'ALL', 'authenticated'),
    ('homework_attempts', 'Students create assigned homework attempts', 'INSERT', 'authenticated')
), hardened_tables(table_name) AS (
  VALUES
    ('profiles'), ('classes'), ('questions'), ('answers'), ('exams'),
    ('exam_questions'), ('exam_attempts'), ('student_answers'), ('homeworks'),
    ('homework_questions'), ('homework_assignments'),
    ('homework_assignment_recipients'), ('homework_attempts'),
    ('homework_answers'), ('question_bookmarks'), ('site_settings')
), expected_table_grant_sets(grantee, table_name, privileges) AS (
  VALUES
    ('anon', 'site_settings', ARRAY['SELECT']::text[]),
    ('authenticated', 'profiles', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'classes', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'answers', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'exams', ARRAY['SELECT','DELETE']::text[]),
    ('authenticated', 'exam_questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'exam_attempts', ARRAY['SELECT']::text[]),
    ('authenticated', 'student_answers', ARRAY['SELECT','INSERT','UPDATE']::text[]),
    ('authenticated', 'homeworks', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_questions', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_assignments', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_assignment_recipients', ARRAY['SELECT','INSERT','DELETE']::text[]),
    ('authenticated', 'homework_attempts', ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]),
    ('authenticated', 'homework_answers', ARRAY['SELECT']::text[]),
    ('authenticated', 'question_bookmarks', ARRAY['SELECT','DELETE']::text[]),
    ('authenticated', 'site_settings', ARRAY['SELECT','INSERT','UPDATE']::text[])
), expected_table_grants AS (
  SELECT grantee, table_name, unnest(privileges) AS privilege_type
  FROM expected_table_grant_sets
), runtime_table_grants AS (
  SELECT grantee, table_name, privilege_type, is_grantable
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND table_name IN (SELECT table_name FROM hardened_tables)
), expected_table_column_grants AS (
  SELECT
    expected.grantee,
    expected.table_name,
    expected.privilege_type,
    runtime_column.column_name
  FROM expected_table_grants expected
  JOIN information_schema.columns runtime_column
    ON runtime_column.table_schema = 'public'
   AND runtime_column.table_name = expected.table_name
  WHERE expected.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
), expected_exam_column_grant_sets(grantee, privilege_type, columns) AS (
  VALUES
    ('anon', 'SELECT', ARRAY[
      'id','title','subject','duration','is_published','exam_mode','created_at'
    ]::text[]),
    ('authenticated', 'INSERT', ARRAY[
      'id','title','subject','duration','total_score','passing_score',
      'is_published','source_exam','grade','exam_mode','session_size',
      'created_by','class_id'
    ]::text[]),
    ('authenticated', 'UPDATE', ARRAY[
      'title','description','duration','start_time','end_time','max_attempts',
      'show_results_immediately','allow_review','is_published'
    ]::text[])
), expected_explicit_exam_column_grants AS (
  SELECT
    grantee,
    'exams'::text AS table_name,
    privilege_type,
    unnest(columns) AS column_name
  FROM expected_exam_column_grant_sets
), expected_column_grants AS (
  SELECT grantee, table_name, privilege_type, column_name
  FROM expected_table_column_grants
  UNION
  SELECT grantee, table_name, privilege_type, column_name
  FROM expected_explicit_exam_column_grants
), runtime_column_grants AS (
  SELECT grantee, table_name, privilege_type, column_name, is_grantable
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND table_name IN (SELECT table_name FROM hardened_tables)
), audited_roles(role_name) AS (
  VALUES ('anon'), ('authenticated')
), table_privilege_types(privilege_type) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
), column_privilege_types(privilege_type) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
), required_functions(signature) AS (
  VALUES
    ('public.is_system_admin()'),
    ('public.is_homework_admin()'),
    ('public.student_has_feature(text)'),
    ('public.can_manage_profile(uuid)'),
    ('public.is_question_bank_staff()'),
    ('public.can_manage_exam(text)'),
    ('public.can_read_exam_metadata(text)'),
    ('public.can_write_exam_scope(uuid,text,text)'),
    ('public.can_manage_exam_attempt(text)'),
    ('public.can_manage_homework(text)'),
    ('public.can_edit_exam_question_links(text)'),
    ('public.can_attach_question_to_exam(text,text)'),
    ('public.can_edit_homework_question_links(text)'),
    ('public.can_attach_question_to_homework(text,text)'),
    ('public.can_read_question_bank_question(text)'),
    ('public.can_mutate_question_bank_question(text)'),
    ('public.can_reveal_question_key(text)'),
    ('public.can_access_question_content(text)'),
    ('public.can_write_practice_draft(text,text)'),
    ('public.can_access_homework_assignment(text)'),
    ('public.can_view_homework_assignment(text)'),
    ('public.can_work_on_homework_assignment(text)'),
    ('public.get_exam_preparation(text)'),
    ('public.start_exam_attempt(text)'),
    ('public.get_exam_attempt_questions(text)'),
    ('public.submit_exam_attempt(text,jsonb)'),
    ('public.submit_practice_attempt(text,jsonb)'),
    ('public.review_essay_answer(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)'),
    ('public.get_simulation_leaderboard(text,timestamptz)'),
    ('public.get_my_exam_answer_metadata(text)'),
    ('public.get_homework_attempt_questions(text)'),
    ('public.get_my_homework_question_metadata()'),
    ('public.get_my_homework_answer_metadata()'),
    ('public.check_homework_answer(text,text,jsonb)'),
    ('public.submit_homework_attempt(text)'),
    ('public.get_my_safe_bookmarks()')
), required_triggers(table_name, trigger_name, function_signature, trigger_type) AS (
  VALUES
    ('exam_attempts', 'trg_protect_student_exam_attempt_writes',
      'public.protect_student_exam_attempt_writes()', 31),
    ('profiles', 'trg_protect_profile_security_fields',
      'public.protect_profile_security_fields()', 23),
    ('questions', 'trg_protect_question_ownership',
      'public.protect_question_ownership()', 23),
    ('exam_attempts', 'trg_enforce_simulation_submission_deadline',
      'public.enforce_simulation_submission_deadline()', 19),
    ('student_answers', 'trg_protect_student_exam_answer_writes',
      'public.protect_student_exam_answer_writes()', 31),
    ('homework_attempts', 'trg_protect_student_homework_attempt_writes',
      'public.protect_student_homework_attempt_writes()', 31),
    ('homework_answers', 'trg_protect_student_homework_answer_writes',
      'public.protect_student_homework_answer_writes()', 31)
), required_columns(
  table_name,
  column_name,
  type_oid,
  not_null,
  expected_default_expr,
  check_default
) AS (
  VALUES
    ('homework_assignments', 'show_feedback_immediately',
      'boolean'::regtype, true, 'false', true),
    ('homework_assignments', 'allow_review',
      'boolean'::regtype, true, 'false', true),
    ('questions', 'created_by',
      'uuid'::regtype, false, 'auth.uid()', true),
    ('exams', 'exam_mode',
      'text'::regtype, true, NULL::text, false),
    ('exam_questions', 'score',
      'numeric'::regtype, true, NULL::text, false),
    ('homework_questions', 'score',
      'numeric'::regtype, true, NULL::text, false)
), runtime_columns AS (
  SELECT
    required.*,
    attribute_row.attnum,
    attribute_row.atttypid,
    attribute_row.attnotnull,
    pg_get_expr(default_row.adbin, default_row.adrelid) AS actual_default_expr
  FROM required_columns required
  LEFT JOIN pg_namespace table_schema
    ON table_schema.nspname = 'public'
  LEFT JOIN pg_class table_row
    ON table_row.relnamespace = table_schema.oid
   AND table_row.relname = required.table_name
   AND table_row.relkind IN ('r', 'p')
  LEFT JOIN pg_attribute attribute_row
    ON attribute_row.attrelid = table_row.oid
   AND attribute_row.attname = required.column_name
   AND attribute_row.attnum > 0
   AND NOT attribute_row.attisdropped
  LEFT JOIN pg_attrdef default_row
    ON default_row.adrelid = table_row.oid
   AND default_row.adnum = attribute_row.attnum
), question_created_by_fk AS (
  SELECT EXISTS (
    SELECT 1
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
      AND constraint_row.convalidated
      AND constraint_row.confdeltype = 'n'
      AND constraint_row.conkey = ARRAY[source_attribute.attnum]::smallint[]
      AND constraint_row.confkey = ARRAY[target_attribute.attnum]::smallint[]
  ) AS is_valid
), required_indexes(table_name, index_name, column_name) AS (
  VALUES
    ('questions', 'idx_questions_created_by', 'created_by'),
    ('classes', 'idx_classes_teacher_id', 'teacher_id'),
    ('exams', 'idx_exams_created_by', 'created_by'),
    ('exams', 'idx_exams_class_id', 'class_id')
), required_score_constraints(table_name, constraint_name) AS (
  VALUES
    ('exam_questions', 'exam_questions_positive_score'),
    ('homework_questions', 'homework_questions_positive_score')
), required_trust_reset_functions(signature, setting_name) AS (
  VALUES
    ('public.submit_exam_attempt(text,jsonb)',
      'app.exam_grading_trusted'),
    ('public.submit_practice_attempt(text,jsonb)',
      'app.exam_grading_trusted'),
    ('public.review_essay_answer(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)',
      'app.exam_grading_trusted'),
    ('public.check_homework_answer(text,text,jsonb)',
      'app.homework_grading_trusted'),
    ('public.submit_homework_attempt(text)',
      'app.homework_grading_trusted')
), required_internal_functions(signature) AS (
  VALUES
    ('public.submit_exam_attempt_trusted_internal(text,jsonb)'),
    ('public.review_essay_answer_trusted_internal(text,text,integer,numeric,text,numeric,numeric,text,jsonb,text)')
)
SELECT 'missing_or_wrong_policy_set' AS check_name,
  (
    SELECT COUNT(*)
    FROM expected_policies expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies runtime_policy
      WHERE runtime_policy.schemaname = 'public'
        AND runtime_policy.tablename = expected.table_name
        AND runtime_policy.policyname = expected.policy_name
        AND runtime_policy.cmd = expected.command
        AND runtime_policy.roles = ARRAY[expected.role_name::name]
        AND runtime_policy.permissive = 'PERMISSIVE'
    )
  ) + (
    SELECT COUNT(*)
    FROM pg_policies runtime_policy
    JOIN hardened_tables
      ON hardened_tables.table_name = runtime_policy.tablename
    WHERE runtime_policy.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM expected_policies expected
        WHERE expected.table_name = runtime_policy.tablename
          AND expected.policy_name = runtime_policy.policyname
          AND expected.command = runtime_policy.cmd
          AND runtime_policy.roles = ARRAY[expected.role_name::name]
          AND runtime_policy.permissive = 'PERMISSIVE'
      )
  ) AS must_be_zero
UNION ALL
SELECT 'policies_with_bare_true', COUNT(*)
FROM pg_policies runtime_policy
JOIN hardened_tables
  ON hardened_tables.table_name = runtime_policy.tablename
WHERE runtime_policy.schemaname = 'public'
  AND (
    regexp_replace(COALESCE(runtime_policy.qual, ''), '\s', '', 'g')
      IN ('true', '(true)')
    OR regexp_replace(COALESCE(runtime_policy.with_check, ''), '\s', '', 'g')
      IN ('true', '(true)')
  )
UNION ALL
SELECT 'missing_or_unexpected_table_grants',
  (
    SELECT COUNT(*)
    FROM expected_table_grants expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM runtime_table_grants runtime
      WHERE runtime.grantee = expected.grantee
        AND runtime.table_name = expected.table_name
        AND runtime.privilege_type = expected.privilege_type
        AND runtime.is_grantable = 'NO'
    )
  ) + (
    SELECT COUNT(*)
    FROM runtime_table_grants runtime
    WHERE runtime.is_grantable <> 'NO'
       OR NOT EXISTS (
         SELECT 1
         FROM expected_table_grants expected
         WHERE expected.grantee = runtime.grantee
           AND expected.table_name = runtime.table_name
           AND expected.privilege_type = runtime.privilege_type
       )
  )
UNION ALL
SELECT 'missing_or_unexpected_column_grants',
  (
    SELECT COUNT(*)
    FROM expected_column_grants expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM runtime_column_grants runtime
      WHERE runtime.grantee = expected.grantee
        AND runtime.table_name = expected.table_name
        AND runtime.privilege_type = expected.privilege_type
        AND runtime.column_name = expected.column_name
        AND runtime.is_grantable = 'NO'
    )
  ) + (
    SELECT COUNT(*)
    FROM runtime_column_grants runtime
    WHERE runtime.is_grantable <> 'NO'
       OR NOT EXISTS (
         SELECT 1
         FROM expected_column_grants expected
         WHERE expected.grantee = runtime.grantee
           AND expected.table_name = runtime.table_name
           AND expected.privilege_type = runtime.privilege_type
           AND expected.column_name = runtime.column_name
       )
  )
UNION ALL
SELECT 'effective_table_privilege_mismatches', COUNT(*)
FROM audited_roles
CROSS JOIN hardened_tables
CROSS JOIN table_privilege_types
WHERE has_table_privilege(
        audited_roles.role_name,
        'public.' || quote_ident(hardened_tables.table_name),
        table_privilege_types.privilege_type
      )
      IS DISTINCT FROM EXISTS (
        SELECT 1
        FROM expected_table_grants expected
        WHERE expected.grantee = audited_roles.role_name
          AND expected.table_name = hardened_tables.table_name
          AND expected.privilege_type = table_privilege_types.privilege_type
      )
UNION ALL
SELECT 'effective_column_privilege_mismatches', COUNT(*)
FROM audited_roles
CROSS JOIN hardened_tables
JOIN information_schema.columns runtime_column
  ON runtime_column.table_schema = 'public'
 AND runtime_column.table_name = hardened_tables.table_name
CROSS JOIN column_privilege_types
WHERE has_column_privilege(
        audited_roles.role_name,
        'public.' || quote_ident(hardened_tables.table_name),
        runtime_column.column_name,
        column_privilege_types.privilege_type
      )
      IS DISTINCT FROM EXISTS (
        SELECT 1
        FROM expected_column_grants expected
        WHERE expected.grantee = audited_roles.role_name
          AND expected.table_name = hardened_tables.table_name
          AND expected.privilege_type = column_privilege_types.privilege_type
          AND expected.column_name = runtime_column.column_name
      )
UNION ALL
SELECT 'missing_or_wrong_security_functions', COUNT(*)
FROM required_functions required
LEFT JOIN pg_proc function_row
  ON function_row.oid = to_regprocedure(required.signature)
LEFT JOIN pg_roles owner_role
  ON owner_role.oid = function_row.proowner
WHERE function_row.oid IS NULL
   OR NOT function_row.prosecdef
   OR NOT COALESCE(owner_role.rolbypassrls, false)
   OR NOT (
     'search_path=public, pg_temp'
       = ANY(COALESCE(function_row.proconfig, ARRAY[]::text[]))
   )
   OR has_function_privilege('anon', function_row.oid, 'EXECUTE')
        IS DISTINCT FROM false
   OR has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
         IS DISTINCT FROM true
UNION ALL
SELECT 'missing_or_wrong_trust_guc_resets', COUNT(*)
FROM required_trust_reset_functions required
LEFT JOIN pg_proc function_row
  ON function_row.oid = to_regprocedure(required.signature)
WHERE function_row.oid IS NULL
   OR position(
     format('set_config(''%s'',''off'',true)', required.setting_name)
     IN regexp_replace(lower(pg_get_functiondef(function_row.oid)), '\s+', '', 'g')
   ) = 0
   OR position(
     'exceptionwhenothersthen'
     IN regexp_replace(lower(pg_get_functiondef(function_row.oid)), '\s+', '', 'g')
   ) = 0
UNION ALL
SELECT 'missing_or_wrong_triggers', COUNT(*)
FROM required_triggers required
LEFT JOIN pg_namespace table_schema
  ON table_schema.nspname = 'public'
LEFT JOIN pg_class table_row
  ON table_row.relnamespace = table_schema.oid
 AND table_row.relname = required.table_name
 AND table_row.relkind IN ('r', 'p')
LEFT JOIN pg_trigger trigger_row
  ON trigger_row.tgrelid = table_row.oid
 AND trigger_row.tgname = required.trigger_name
 AND NOT trigger_row.tgisinternal
WHERE trigger_row.oid IS NULL
   OR trigger_row.tgenabled <> 'O'
   OR trigger_row.tgfoid IS DISTINCT FROM to_regprocedure(required.function_signature)
   OR trigger_row.tgtype <> required.trigger_type::smallint
UNION ALL
SELECT 'hardened_tables_without_rls', COUNT(*)
FROM hardened_tables required
LEFT JOIN pg_namespace table_schema
  ON table_schema.nspname = 'public'
LEFT JOIN pg_class table_row
  ON table_row.relnamespace = table_schema.oid
 AND table_row.relname = required.table_name
 AND table_row.relkind IN ('r', 'p')
WHERE table_row.oid IS NULL
   OR NOT table_row.relrowsecurity
UNION ALL
SELECT 'missing_or_wrong_required_columns', COUNT(*)
FROM runtime_columns runtime
WHERE runtime.attnum IS NULL
   OR runtime.atttypid <> runtime.type_oid::oid
   OR runtime.attnotnull IS DISTINCT FROM runtime.not_null
   OR (
     runtime.check_default
     AND regexp_replace(
       COALESCE(runtime.actual_default_expr, ''),
       '\s',
       '',
       'g'
     ) <> regexp_replace(runtime.expected_default_expr, '\s', '', 'g')
   )
UNION ALL
SELECT 'missing_or_wrong_question_created_by_fk',
  CASE WHEN question_created_by_fk.is_valid THEN 0 ELSE 1 END
FROM question_created_by_fk
UNION ALL
SELECT 'invalid_exam_modes', COUNT(*)
FROM public.exams
WHERE exam_mode IS NULL
   OR exam_mode NOT IN ('simulation', 'practice')
UNION ALL
SELECT 'missing_or_wrong_exam_mode_constraint', COUNT(*)
FROM (SELECT 1) singleton
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid = 'public.exams'::regclass
    AND constraint_row.conname = 'exams_runtime_mode_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated
    AND pg_get_constraintdef(constraint_row.oid, true) LIKE '%exam_mode%'
    AND pg_get_constraintdef(constraint_row.oid, true) LIKE '%simulation%'
    AND pg_get_constraintdef(constraint_row.oid, true) LIKE '%practice%'
    AND pg_get_constraintdef(constraint_row.oid, true) NOT LIKE '%homework%'
)
UNION ALL
SELECT 'invalid_question_link_scores', COUNT(*)
FROM public.exam_questions exam_question
WHERE exam_question.score IS NULL
   OR exam_question.score <= 0
UNION ALL
SELECT 'invalid_homework_question_link_scores', COUNT(*)
FROM public.homework_questions homework_question
WHERE homework_question.score IS NULL
   OR homework_question.score <= 0
UNION ALL
SELECT 'missing_or_wrong_positive_score_constraints', COUNT(*)
FROM required_score_constraints required
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint constraint_row
  JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
  JOIN pg_namespace table_schema ON table_schema.oid = table_row.relnamespace
  WHERE table_schema.nspname = 'public'
    AND table_row.relname = required.table_name
    AND constraint_row.conname = required.constraint_name
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated
    AND regexp_replace(
      pg_get_constraintdef(constraint_row.oid, true),
      '\s',
      '',
      'g'
    ) ~ 'score.*>.*0'
)
UNION ALL
SELECT 'missing_or_wrong_password_change_flag_guard',
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_proc function_row
    WHERE function_row.oid = to_regprocedure(
      'public.protect_profile_security_fields()'
    )
      AND pg_get_functiondef(function_row.oid) LIKE
        '%NEW.must_change_password IS DISTINCT FROM OLD.must_change_password%'
  ) THEN 0 ELSE 1 END
UNION ALL
SELECT 'missing_or_wrong_required_indexes', COUNT(*)
FROM required_indexes required
LEFT JOIN pg_namespace table_schema
  ON table_schema.nspname = 'public'
LEFT JOIN pg_class table_row
  ON table_row.relnamespace = table_schema.oid
 AND table_row.relname = required.table_name
 AND table_row.relkind IN ('r', 'p')
LEFT JOIN pg_class index_row
  ON index_row.relnamespace = table_schema.oid
 AND index_row.relname = required.index_name
 AND index_row.relkind = 'i'
LEFT JOIN pg_index index_metadata
  ON index_metadata.indexrelid = index_row.oid
 AND index_metadata.indrelid = table_row.oid
WHERE index_metadata.indexrelid IS NULL
   OR NOT index_metadata.indisvalid
   OR NOT index_metadata.indisready
   OR NOT index_metadata.indislive
   OR index_metadata.indisunique
   OR index_metadata.indnkeyatts <> 1
   OR index_metadata.indnatts <> 1
   OR index_metadata.indpred IS NOT NULL
   OR index_metadata.indexprs IS NOT NULL
   OR pg_get_indexdef(index_metadata.indexrelid, 1, true)
        <> required.column_name
UNION ALL
SELECT 'missing_internal_grading_functions', COUNT(*)
FROM required_internal_functions required
WHERE to_regprocedure(required.signature) IS NULL
UNION ALL
SELECT 'internal_grading_functions_executable_by_clients', COUNT(*)
FROM required_internal_functions required
JOIN pg_proc function_row
  ON function_row.oid = to_regprocedure(required.signature)
WHERE has_function_privilege('anon', function_row.oid, 'EXECUTE')
   OR has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
UNION ALL
SELECT 'legacy_exam_routines_executable_by_clients', COUNT(*)
FROM pg_proc routine_row
JOIN pg_namespace routine_schema ON routine_schema.oid = routine_row.pronamespace
WHERE routine_schema.nspname = 'public'
  AND routine_row.proname IN (
    'get_available_exams',
    'get_exam_questions_by_part',
    'get_exam_results_summary'
  )
  AND (
    has_function_privilege('anon', routine_row.oid, 'EXECUTE')
    OR has_function_privilege('authenticated', routine_row.oid, 'EXECUTE')
  )
ORDER BY check_name;
