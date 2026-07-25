-- Fail-closed rollback for 20260723_essay_legacy_config_backfill.sql.
-- Use only before any target question is linked, answered or reviewed.
-- Corrected max scores, wording and the curved-wall solution are intentionally
-- retained because they fix source-data errors independently of AI grading.

BEGIN;

DO $rollback$
DECLARE
  v_question_ids text[] := ARRAY[
    'Q_1771832119893_8ZJSD0J',
    'Q_1771832119894_DIPQPB5',
    'Q_1771832119895_OOZJE8P',
    'Q_1784633634868_2RH17R6',
    'Q_1784633634869_87EILC8',
    'Q_1784633634873_2XVUW0R'
  ];
  v_deleted integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.exam_questions row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.homework_questions row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.student_answers row_item
    WHERE row_item.question_id = ANY(v_question_ids)
  ) OR EXISTS (
    SELECT 1
    FROM public.essay_grading_reviews review_row
    JOIN public.student_answers answer_row
      ON answer_row.id = review_row.student_answer_id
    WHERE answer_row.question_id = ANY(v_question_ids)
  ) THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONFIG_ROLLBACK_BLOCKED_BY_USAGE';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.question_grading_configs grading_config
    WHERE grading_config.question_id = ANY(v_question_ids)
      AND grading_config.created_by IS NULL
      AND grading_config.rubric_version = 1
  ) <> 6 THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONFIG_ROLLBACK_SOURCE_CHANGED';
  END IF;

  DELETE FROM public.question_grading_configs grading_config
  WHERE grading_config.question_id = ANY(v_question_ids)
    AND grading_config.created_by IS NULL
    AND grading_config.rubric_version = 1;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 6 THEN
    RAISE EXCEPTION 'LEGACY_ESSAY_CONFIG_ROLLBACK_COUNT_MISMATCH';
  END IF;
END;
$rollback$;

COMMIT;
