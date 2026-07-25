-- READ ONLY. Run after 20260723_essay_legacy_config_backfill.sql.
-- Expected: every must_be_zero value is 0.

WITH expected(question_id, max_score, criterion_count) AS (
  VALUES
    ('Q_1771832119893_8ZJSD0J'::text, 1::numeric, 4),
    ('Q_1771832119894_DIPQPB5'::text, 1::numeric, 4),
    ('Q_1771832119895_OOZJE8P'::text, 1::numeric, 4),
    ('Q_1784633634868_2RH17R6'::text, 1.5::numeric, 6),
    ('Q_1784633634869_87EILC8'::text, 1::numeric, 4),
    ('Q_1784633634873_2XVUW0R'::text, 0.5::numeric, 2)
),
rubric_totals AS (
  SELECT
    grading_config.question_id,
    COUNT(*)::integer AS criterion_count,
    COUNT(DISTINCT criterion ->> 'criterion_id')::integer AS distinct_criterion_count,
    SUM((criterion ->> 'max_score')::numeric) AS rubric_total
  FROM public.question_grading_configs grading_config
  CROSS JOIN LATERAL jsonb_array_elements(grading_config.rubric) criterion
  WHERE grading_config.question_id IN (SELECT question_id FROM expected)
  GROUP BY grading_config.question_id
)
SELECT 'missing_or_wrong_question_rows' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM expected
LEFT JOIN public.questions question_row
  ON question_row.id = expected.question_id
WHERE question_row.id IS NULL
   OR question_row.question_type IS DISTINCT FROM 'essay'
   OR question_row.essay_max_score IS DISTINCT FROM expected.max_score

UNION ALL

SELECT 'missing_or_wrong_grading_configs', COUNT(*)::bigint
FROM expected
LEFT JOIN public.question_grading_configs grading_config
  ON grading_config.question_id = expected.question_id
WHERE grading_config.question_id IS NULL
   OR NULLIF(btrim(grading_config.reference_answer), '') IS NULL
   OR grading_config.rubric_version IS DISTINCT FROM 1
   OR grading_config.minimum_confidence IS DISTINCT FROM 0.75::numeric
   OR grading_config.ai_enabled IS DISTINCT FROM true

UNION ALL

SELECT 'invalid_rubric_shapes_or_totals', COUNT(*)::bigint
FROM expected
LEFT JOIN rubric_totals rubric_total
  ON rubric_total.question_id = expected.question_id
WHERE rubric_total.question_id IS NULL
   OR rubric_total.criterion_count IS DISTINCT FROM expected.criterion_count
   OR rubric_total.distinct_criterion_count IS DISTINCT FROM expected.criterion_count
   OR abs(rubric_total.rubric_total - expected.max_score) > 0.0001

UNION ALL

SELECT 'criterion_scores_not_quarter_points', COUNT(*)::bigint
FROM public.question_grading_configs grading_config
CROSS JOIN LATERAL jsonb_array_elements(grading_config.rubric) criterion
WHERE grading_config.question_id IN (SELECT question_id FROM expected)
  AND (criterion ->> 'max_score')::numeric IS DISTINCT FROM 0.25::numeric

UNION ALL

SELECT 'curved_wall_content_or_solution_missing', COUNT(*)::bigint
FROM public.questions question_row
WHERE question_row.id = 'Q_1771832119895_OOZJE8P'
  AND (
    position('thiết diện vuông góc với $AB$ không đổi' IN question_row.content) = 0
    OR NULLIF(btrim(question_row.solution), '') IS NULL
    OR position('20\ \text{m}^3' IN question_row.solution) = 0
  )

UNION ALL

SELECT 'graph_online_instruction_missing', COUNT(*)::bigint
FROM public.questions question_row
WHERE question_row.id = 'Q_1784633634868_2RH17R6'
  AND position('Khi làm bài trực tuyến' IN question_row.content) = 0

UNION ALL

SELECT 'motion_wording_not_corrected', COUNT(*)::bigint
FROM public.questions question_row
WHERE question_row.id = 'Q_1784633634873_2XVUW0R'
  AND (
    position('$s$ là tọa độ của vật' IN question_row.content) = 0
    OR position('$s$ là quãng đường vật đi được' IN question_row.content) > 0
  )

UNION ALL

SELECT 'repaired_marking_guides_do_not_match_reference', COUNT(*)::bigint
FROM public.questions question_row
JOIN public.question_grading_configs grading_config
  ON grading_config.question_id = question_row.id
WHERE question_row.id IN (
  'Q_1784633634868_2RH17R6',
  'Q_1784633634869_87EILC8'
)
  AND question_row.solution IS DISTINCT FROM grading_config.reference_answer

ORDER BY check_name;
