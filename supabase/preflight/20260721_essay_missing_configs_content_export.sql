-- READ ONLY. Export only legacy essay question-bank content needed to author
-- reference answers and rubrics. No student identity or student answer is read.

SELECT
  question_row.id AS question_id,
  question_row.content,
  question_row.solution,
  question_row.essay_max_score,
  question_row.source_exam
FROM public.questions question_row
LEFT JOIN public.question_grading_configs grading_config
  ON grading_config.question_id = question_row.id
WHERE question_row.question_type = 'essay'
  AND grading_config.question_id IS NULL
ORDER BY question_row.created_at, question_row.id;
