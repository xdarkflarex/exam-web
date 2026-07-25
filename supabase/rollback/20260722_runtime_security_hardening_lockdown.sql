-- Emergency fail-closed action after 20260722 has committed.
-- This intentionally disables student exam/homework operations while preserving
-- the closed RLS baseline. It does NOT restore the insecure policies found live.
-- Use only during maintenance while restoring a known-good database backup or
-- applying a corrected forward migration.

BEGIN;

REVOKE ALL ON TABLE public.profiles, public.questions, public.answers,
  public.exam_questions, public.exam_attempts, public.student_answers,
  public.homework_questions, public.homework_attempts, public.homework_answers,
  public.question_bookmarks, public.classes, public.exams, public.homeworks,
  public.homework_assignments, public.homework_assignment_recipients,
  public.site_settings
  FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.is_system_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_homework_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.student_has_feature(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_question_bank_staff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_exam(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_exam_metadata(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_write_exam_scope(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_exam_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_homework(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_edit_exam_question_links(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_attach_question_to_exam(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_edit_homework_question_links(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_attach_question_to_homework(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_question_bank_question(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_mutate_question_bank_question(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_reveal_question_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_question_content(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_write_practice_draft(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_homework_assignment(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_homework_assignment(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_work_on_homework_assignment(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exam_preparation(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_exam_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exam_attempt_questions(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_attempt_trusted_internal(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_practice_attempt(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_simulation_leaderboard(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_exam_answer_metadata(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_homework_attempt_questions(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_homework_question_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_homework_answer_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_homework_answer(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_homework_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_safe_bookmarks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_essay_question(text, text, text, integer, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_essay_answer(text, text, integer, numeric, text, numeric, numeric, text, jsonb, text) FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
