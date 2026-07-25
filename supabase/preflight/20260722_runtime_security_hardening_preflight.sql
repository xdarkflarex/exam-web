-- READ ONLY. Preflight for PATCH_VERSION runtime-security-hardening-20260722-r4.
-- Run AFTER 20260721_essay_assisted_grading.sql and 20260723_essay_legacy_config_backfill.sql; run each
-- numbered block separately in Supabase SQL Editor.
-- Stop if block 1 returns rows or any count marked must_be_zero is not zero.
-- This script does not prove RLS behavior because SQL Editor normally runs as postgres.

-- 1. Required relations. Expected: Success. No rows returned.
WITH required(relation_name) AS (
  VALUES
    ('profiles'), ('classes'), ('questions'), ('answers'), ('exams'),
    ('exam_questions'), ('exam_attempts'), ('student_answers'),
    ('question_taxonomy'), ('topics'), ('categories'), ('sections'),
    ('question_bookmarks'), ('homeworks'), ('homework_questions'),
    ('homework_assignments'), ('homework_assignment_recipients'),
    ('homework_attempts'), ('homework_answers'), ('site_settings')
)
SELECT relation_name AS missing_relation
FROM required
WHERE to_regclass('public.' || relation_name) IS NULL
ORDER BY relation_name;

-- 2. Required columns. Expected: Success. No rows returned.
WITH required(table_name, column_name) AS (
  VALUES
    ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'class_id'),
    ('profiles', 'full_name'), ('profiles', 'email'), ('profiles', 'school'),
    ('profiles', 'avatar_url'), ('profiles', 'grade'),
    ('profiles', 'access_tier'), ('profiles', 'must_change_password'),
    ('profiles', 'source_enrollment_id'), ('profiles', 'created_at'),
    ('profiles', 'updated_at'),
    ('classes', 'id'), ('classes', 'teacher_id'),
    ('questions', 'id'), ('questions', 'content'),
    ('questions', 'question_type'), ('questions', 'difficulty'),
    ('questions', 'cognitive_level'), ('questions', 'explanation'),
    ('questions', 'solution'), ('questions', 'tikz_image_url'),
    ('answers', 'id'), ('answers', 'question_id'),
    ('answers', 'content'), ('answers', 'is_correct'),
    ('answers', 'order_index'),
    ('exams', 'id'), ('exams', 'title'), ('exams', 'description'), ('exams', 'duration'),
    ('exams', 'source_exam'), ('exams', 'total_score'),
    ('exams', 'passing_score'), ('exams', 'grade'),
    ('exams', 'session_size'), ('exams', 'created_at'),
    ('exams', 'subject'), ('exams', 'exam_mode'), ('exams', 'is_published'),
    ('exams', 'max_attempts'), ('exams', 'allow_review'),
    ('exams', 'show_results_immediately'),
    ('exams', 'created_by'), ('exams', 'class_id'),
    ('exams', 'start_time'), ('exams', 'end_time'),
    ('exam_questions', 'id'), ('exam_questions', 'exam_id'),
    ('exam_questions', 'question_id'), ('exam_questions', 'question_type'),
    ('exam_questions', 'score'), ('exam_questions', 'part_number'),
    ('exam_questions', 'order_in_part'),
    ('exam_attempts', 'id'), ('exam_attempts', 'exam_id'),
    ('exam_attempts', 'student_id'), ('exam_attempts', 'status'),
    ('exam_attempts', 'score'), ('exam_attempts', 'attempt_number'),
    ('exam_attempts', 'grading_status'), ('exam_attempts', 'submission_hash'),
    ('exam_attempts', 'start_time'), ('exam_attempts', 'submit_time'),
    ('exam_attempts', 'time_spent'), ('exam_attempts', 'total_questions'),
    ('exam_attempts', 'correct_answers'), ('exam_attempts', 'created_at'),
    ('exam_attempts', 'updated_at'), ('exam_attempts', 'ip_address'),
    ('exam_attempts', 'user_agent'), ('exam_attempts', 'tab_switches'),
    ('exam_attempts', 'dev_tools_opened'),
    ('exam_attempts', 'suspicious_activities'), ('exam_attempts', 'is_flagged'),
    ('exam_attempts', 'flag_reason'), ('exam_attempts', 'objective_points'),
    ('exam_attempts', 'essay_points'), ('exam_attempts', 'earned_points'),
    ('exam_attempts', 'max_points'),
    ('exam_attempts', 'pending_grading_count'), ('exam_attempts', 'graded_at'),
    ('student_answers', 'id'), ('student_answers', 'attempt_id'),
    ('student_answers', 'question_id'), ('student_answers', 'question_type'),
    ('student_answers', 'is_correct'), ('student_answers', 'score'),
    ('student_answers', 'max_score'), ('student_answers', 'grading_status'),
    ('student_answers', 'selected_answer'),
    ('student_answers', 'selected_answers'), ('student_answers', 'text_answer'),
    ('student_answers', 'shown_feedback'), ('student_answers', 'answered_at'),
    ('student_answers', 'grading_feedback'),
    ('student_answers', 'grading_breakdown'),
    ('student_answers', 'grading_confidence'),
    ('student_answers', 'grading_method'),
    ('student_answers', 'grading_rubric_version'),
    ('student_answers', 'answer_hash'), ('student_answers', 'ai_score'),
    ('student_answers', 'ai_feedback'), ('student_answers', 'ai_model'),
    ('student_answers', 'graded_by'), ('student_answers', 'graded_at'),
    ('question_taxonomy', 'question_id'), ('question_taxonomy', 'topic_id'),
    ('question_taxonomy', 'category_id'), ('question_taxonomy', 'section_id'),
    ('topics', 'id'), ('topics', 'name'),
    ('categories', 'id'), ('categories', 'name'),
    ('sections', 'id'), ('sections', 'name'),
    ('question_bookmarks', 'id'), ('question_bookmarks', 'user_id'),
    ('question_bookmarks', 'question_id'), ('question_bookmarks', 'note'),
    ('question_bookmarks', 'created_at'),
    ('homeworks', 'id'), ('homeworks', 'created_by'),
    ('homeworks', 'title'), ('homeworks', 'session_size'),
    ('homeworks', 'is_published'),
    ('homework_questions', 'id'), ('homework_questions', 'homework_id'),
    ('homework_questions', 'question_id'),
    ('homework_questions', 'score'), ('homework_questions', 'order_index'),
    ('homework_assignments', 'id'), ('homework_assignments', 'homework_id'),
    ('homework_assignments', 'assigned_by'),
    ('homework_assignments', 'title'), ('homework_assignments', 'deadline'),
    ('homework_assignments', 'status'),
    ('homework_assignment_recipients', 'assignment_id'),
    ('homework_assignment_recipients', 'student_id'),
    ('homework_assignment_recipients', 'class_id'),
    ('homework_attempts', 'id'), ('homework_attempts', 'assignment_id'),
    ('homework_attempts', 'student_id'), ('homework_attempts', 'status'),
    ('homework_attempts', 'current_session_index'),
    ('homework_attempts', 'started_at'), ('homework_attempts', 'submitted_at'),
    ('homework_attempts', 'total_questions'),
    ('homework_attempts', 'answered_questions'),
    ('homework_attempts', 'correct_answers'), ('homework_attempts', 'score'),
    ('homework_attempts', 'created_at'), ('homework_attempts', 'updated_at'),
    ('homework_answers', 'id'), ('homework_answers', 'attempt_id'),
    ('homework_answers', 'question_id'), ('homework_answers', 'question_type'),
    ('homework_answers', 'selected_answer'),
    ('homework_answers', 'selected_answers'), ('homework_answers', 'text_answer'),
    ('homework_answers', 'shown_feedback'), ('homework_answers', 'is_correct'),
    ('homework_answers', 'score'), ('homework_answers', 'answered_at'),
    ('homework_answers', 'updated_at'),
    ('site_settings', 'key'), ('site_settings', 'value')
)
SELECT required.table_name, required.column_name AS missing_column
FROM required
LEFT JOIN information_schema.columns runtime_column
  ON runtime_column.table_schema = 'public'
 AND runtime_column.table_name = required.table_name
 AND runtime_column.column_name = required.column_name
WHERE runtime_column.column_name IS NULL
ORDER BY required.table_name, required.column_name;

-- 2b. Required unique keys used by idempotent writes. Expected: no rows.
WITH required(table_name, column_names) AS (
  VALUES
    ('exam_attempts', ARRAY['exam_id', 'student_id', 'attempt_number']::text[]),
    ('student_answers', ARRAY['attempt_id', 'question_id']::text[]),
    ('homework_attempts', ARRAY['assignment_id', 'student_id']::text[]),
    ('homework_answers', ARRAY['attempt_id', 'question_id']::text[])
)
SELECT required.table_name, required.column_names AS missing_unique_key
FROM required
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint constraint_row
  JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
  JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
  WHERE schema_row.nspname = 'public'
    AND table_row.relname = required.table_name
    AND constraint_row.contype IN ('p', 'u')
    AND (
      SELECT array_agg(attribute_row.attname::text ORDER BY key_row.ordinality)
      FROM unnest(constraint_row.conkey)
        WITH ORDINALITY AS key_row(attnum, ordinality)
      JOIN pg_attribute attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = key_row.attnum
    ) = required.column_names
);

-- 2c. Existing optional columns that 20260722 will normalize. A missing row is
-- allowed because the migration adds it; an existing incompatible row is a
-- blocker. Expected: no rows.
WITH expected(table_name, column_name, udt_name) AS (
  VALUES
    ('homework_assignments', 'show_feedback_immediately', 'bool'),
    ('homework_assignments', 'allow_review', 'bool'),
    ('questions', 'created_by', 'uuid'),
    ('exam_questions', 'score', 'numeric'),
    ('homework_questions', 'score', 'numeric')
)
SELECT
  expected.table_name,
  expected.column_name,
  runtime_column.udt_name AS actual_udt_name,
  expected.udt_name AS expected_udt_name
FROM expected
JOIN information_schema.columns runtime_column
  ON runtime_column.table_schema = 'public'
 AND runtime_column.table_name = expected.table_name
 AND runtime_column.column_name = expected.column_name
WHERE runtime_column.udt_name IS DISTINCT FROM expected.udt_name
ORDER BY expected.table_name, expected.column_name;

-- 2d. Existing question ownership must already point to a real profile. This
-- block is safe when questions.created_by is not present yet. Expected: Success.
DO $$
DECLARE
  has_owner_column boolean;
  has_orphan_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns runtime_column
    WHERE runtime_column.table_schema = 'public'
      AND runtime_column.table_name = 'questions'
      AND runtime_column.column_name = 'created_by'
  )
  INTO has_owner_column;

  IF has_owner_column THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1
        FROM public.questions question
        LEFT JOIN public.profiles owner_profile ON owner_profile.id = question.created_by
        WHERE question.created_by IS NOT NULL
          AND owner_profile.id IS NULL
      )
    $sql$
    INTO has_orphan_owner;

    IF has_orphan_owner THEN
      RAISE EXCEPTION 'HARDENING_PREFLIGHT_ORPHAN_QUESTION_OWNER';
    END IF;
  END IF;
END;
$$;

-- 2e. Existing parent/trust-anchor RLS inventory. Save this output for the
-- deployment record. A false value is not by itself a blocker: 20260722 enables
-- RLS and rebuilds every listed policy set atomically from a closed baseline.
SELECT
  table_row.relname AS table_name,
  table_row.relrowsecurity AS rls_enabled,
  table_row.relforcerowsecurity AS rls_forced
FROM pg_class table_row
JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
WHERE schema_row.nspname = 'public'
  AND table_row.relname IN (
    'classes', 'exams', 'homeworks', 'homework_assignments',
    'homework_assignment_recipients', 'site_settings'
  )
ORDER BY table_row.relname;

-- 3. Current audited policies. Save this output with the deployment record.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'classes', 'questions', 'answers', 'exams', 'exam_questions',
    'exam_attempts', 'student_answers', 'homeworks', 'homework_questions',
    'homework_assignments', 'homework_assignment_recipients',
    'homework_answers', 'homework_attempts', 'question_bookmarks', 'site_settings'
  )
ORDER BY tablename, policyname;

-- 4. Current grants. The live audit found dangerous ALL-like grants here.
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'classes', 'questions', 'answers', 'exams', 'exam_questions',
    'exam_attempts', 'student_answers', 'homeworks', 'homework_questions',
    'homework_assignments', 'homework_assignment_recipients',
    'homework_answers', 'homework_attempts', 'question_bookmarks', 'site_settings'
  )
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 5. Data invariants. Every value except existing_homework_attempts_without_recipient
-- must be zero. The recipient count must also be zero unless you explicitly repair
-- those legacy assignments before applying the hardening migration.
SELECT 'duplicate_attempt_question' AS check_name, COUNT(*) AS must_be_zero
FROM (
  SELECT attempt_id, question_id
  FROM public.student_answers
  GROUP BY attempt_id, question_id
  HAVING COUNT(*) > 1
) duplicate_rows
UNION ALL
SELECT 'student_answer_question_not_in_exam', COUNT(*)
FROM public.student_answers sa
JOIN public.exam_attempts ea ON ea.id = sa.attempt_id
LEFT JOIN public.exam_questions eq
  ON eq.exam_id = ea.exam_id
 AND eq.question_id = sa.question_id
WHERE eq.id IS NULL
UNION ALL
SELECT 'practice_contains_essay', COUNT(*)
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.exam_mode = 'practice'
  AND eq.question_type = 'essay'
UNION ALL
SELECT 'exam_has_invalid_runtime_mode', COUNT(*)
FROM public.exams exam
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice')
UNION ALL
SELECT 'exam_question_type_mismatch', COUNT(*)
FROM public.exam_questions exam_question
JOIN public.questions question ON question.id = exam_question.question_id
WHERE exam_question.question_type IS DISTINCT FROM question.question_type
UNION ALL
SELECT 'homework_contains_unsupported_question_type', COUNT(*)
FROM public.homework_questions homework_question
JOIN public.questions question ON question.id = homework_question.question_id
WHERE question.question_type IS NULL
   OR question.question_type NOT IN ('multiple_choice', 'true_false', 'short_answer')
UNION ALL
SELECT 'invalid_exam_question_score', COUNT(*)
FROM public.exam_questions exam_question
WHERE exam_question.score IS NULL
   OR exam_question.score <= 0
UNION ALL
SELECT 'invalid_homework_question_score', COUNT(*)
FROM public.homework_questions homework_question
WHERE homework_question.score IS NULL
   OR homework_question.score <= 0
UNION ALL
SELECT 'existing_homework_attempts_without_recipient', COUNT(*)
FROM public.homework_attempts hta
LEFT JOIN public.profiles student ON student.id = hta.student_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.homework_assignment_recipients recipient
  WHERE recipient.assignment_id = hta.assignment_id
    AND (
      recipient.student_id = hta.student_id
      OR (
        recipient.class_id IS NOT NULL
        AND recipient.class_id = student.class_id
      )
    )
)
UNION ALL
SELECT 'orphan_question_bookmarks', COUNT(*)
FROM public.question_bookmarks bookmark
LEFT JOIN public.questions q ON q.id = bookmark.question_id
WHERE q.id IS NULL
UNION ALL
SELECT 'in_progress_attempt_wrong_class', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
JOIN public.profiles student ON student.id = attempt.student_id
WHERE attempt.status = 'in_progress'
  AND exam.class_id IS NOT NULL
  AND student.class_id IS DISTINCT FROM exam.class_id
UNION ALL
SELECT 'in_progress_attempt_non_student_owner', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.profiles owner_profile ON owner_profile.id = attempt.student_id
WHERE attempt.status = 'in_progress'
  AND owner_profile.role IS DISTINCT FROM 'student'
UNION ALL
SELECT 'attempt_unsupported_exam_mode', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE exam.exam_mode IS NULL
   OR exam.exam_mode NOT IN ('simulation', 'practice')
UNION ALL
SELECT 'in_progress_attempt_unpublished_exam', COUNT(*)
FROM public.exam_attempts attempt
JOIN public.exams exam ON exam.id = attempt.exam_id
WHERE attempt.status = 'in_progress'
  AND NOT COALESCE(exam.is_published, false)
UNION ALL
SELECT 'class_teacher_not_staff', COUNT(*)
FROM public.classes class
JOIN public.profiles owner_profile ON owner_profile.id = class.teacher_id
WHERE owner_profile.role NOT IN ('admin', 'teacher')
UNION ALL
SELECT 'exam_creator_not_staff', COUNT(*)
FROM public.exams exam
JOIN public.profiles owner_profile ON owner_profile.id = exam.created_by
WHERE owner_profile.role NOT IN ('admin', 'teacher')
UNION ALL
SELECT 'homework_creator_not_staff', COUNT(*)
FROM public.homeworks homework
JOIN public.profiles owner_profile ON owner_profile.id = homework.created_by
WHERE owner_profile.role NOT IN ('admin', 'teacher')
UNION ALL
SELECT 'homework_assigner_not_staff', COUNT(*)
FROM public.homework_assignments assignment
JOIN public.profiles owner_profile ON owner_profile.id = assignment.assigned_by
WHERE owner_profile.role NOT IN ('admin', 'teacher')
UNION ALL
SELECT 'homework_recipient_not_student', COUNT(*)
FROM public.homework_assignment_recipients recipient
JOIN public.profiles target_profile ON target_profile.id = recipient.student_id
WHERE target_profile.role IS DISTINCT FROM 'student';

-- 6. Suspicious pre-existing attempt rows. Review manually; this block is evidence,
-- not an automatic proof of fraud.
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

-- 6b. Trust-anchor audit. Verify every returned UUID is a legitimate teacher or
-- system admin. Do not paste names/emails or other PII into an external AI chat.
SELECT id, role, class_id, access_tier
FROM public.profiles
WHERE role IN ('teacher', 'admin')
ORDER BY role, id;

-- 6c. Role-domain drift. The supplied schema export only allowed admin|student.
-- Review this definition; do not silently widen it as part of hardening.
SELECT
  constraint_row.conname AS constraint_name,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
WHERE schema_row.nspname = 'public'
  AND table_row.relname = 'profiles'
  AND constraint_row.contype = 'c'
ORDER BY constraint_row.conname;

-- 7. Existing triggers/functions whose behavior the hardening migration replaces
-- or composes with. Save the complete output, not only the truncated grid preview.
SELECT
  trigger_table.relname AS table_name,
  trigger_row.tgname AS trigger_name,
  function_row.proname AS function_name,
  pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition
FROM pg_trigger trigger_row
JOIN pg_class trigger_table ON trigger_table.oid = trigger_row.tgrelid
JOIN pg_namespace table_schema ON table_schema.oid = trigger_table.relnamespace
JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
WHERE table_schema.nspname = 'public'
  AND NOT trigger_row.tgisinternal
  AND trigger_table.relname IN (
    'exam_attempts', 'student_answers', 'homework_attempts', 'homework_answers'
  )
ORDER BY trigger_table.relname, trigger_row.tgname;

-- Required legacy helper is replaced deterministically by 20260722. This output
-- records the prior signature/body; a non-boolean same-signature object is a blocker.


-- 7b. Save this inventory. 20260722 revokes every overload of the three legacy
-- SECURITY DEFINER RPC names; no row under these names may remain callable after
-- the postflight gate.
SELECT
  routine_row.proname AS function_name,
  pg_get_function_identity_arguments(routine_row.oid) AS identity_arguments,
  routine_row.prosecdef AS security_definer,
  has_function_privilege('anon', routine_row.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', routine_row.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc routine_row
JOIN pg_namespace routine_schema ON routine_schema.oid = routine_row.pronamespace
WHERE routine_schema.nspname = 'public'
  AND routine_row.proname IN (
    'get_available_exams',
    'get_exam_questions_by_part',
    'get_exam_results_summary'
  )
ORDER BY routine_row.proname, pg_get_function_identity_arguments(routine_row.oid);
