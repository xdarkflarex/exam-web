-- READ ONLY. Diagnose essay questions that predate question_grading_configs.
-- Does not return student identity, student answer text, or reference answers.

SELECT
  question_row.id AS question_id,
  left(
    regexp_replace(question_row.content, E'[\\n\\r\\t]+', ' ', 'g'),
    160
  ) AS content_preview,
  question_row.source_exam,
  question_row.essay_max_score,
  NULLIF(btrim(question_row.solution), '') IS NOT NULL AS has_solution_candidate,
  char_length(COALESCE(question_row.solution, '')) AS solution_length,
  COUNT(DISTINCT answer_row.id) AS legacy_answer_rows,
  COUNT(DISTINCT answer_row.id) FILTER (WHERE answer_row.is_correct IS TRUE)
    AS legacy_correct_answer_rows,
  COUNT(DISTINCT exam_question.id) AS exam_link_count,
  COUNT(DISTINCT exam_question.id) FILTER (WHERE exam.exam_mode = 'simulation')
    AS simulation_link_count,
  COUNT(DISTINCT exam_question.id) FILTER (WHERE exam.exam_mode = 'practice')
    AS practice_link_count,
  COUNT(DISTINCT exam_question.id) FILTER (WHERE exam.exam_mode = 'homework')
    AS legacy_homework_exam_link_count,
  COUNT(DISTINCT homework_question.id) AS homework_link_count,
  COUNT(DISTINCT student_answer.id) AS existing_student_answer_count,
  COUNT(DISTINCT student_answer.id) FILTER (
    WHERE student_answer.question_type IS DISTINCT FROM 'essay'
  ) AS student_answer_type_mismatch_count,
  question_row.created_at
FROM public.questions question_row
LEFT JOIN public.question_grading_configs grading_config
  ON grading_config.question_id = question_row.id
LEFT JOIN public.answers answer_row
  ON answer_row.question_id = question_row.id
LEFT JOIN public.exam_questions exam_question
  ON exam_question.question_id = question_row.id
LEFT JOIN public.exams exam
  ON exam.id = exam_question.exam_id
LEFT JOIN public.homework_questions homework_question
  ON homework_question.question_id = question_row.id
LEFT JOIN public.student_answers student_answer
  ON student_answer.question_id = question_row.id
WHERE question_row.question_type = 'essay'
  AND grading_config.question_id IS NULL
GROUP BY
  question_row.id,
  question_row.content,
  question_row.source_exam,
  question_row.essay_max_score,
  question_row.solution,
  question_row.created_at
ORDER BY question_row.created_at, question_row.id;
