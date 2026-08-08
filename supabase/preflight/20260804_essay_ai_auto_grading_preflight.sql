-- READ ONLY. Chạy TRƯỚC 20260804_essay_ai_auto_grading.sql.
-- Kỳ vọng: mọi must_be_zero đều bằng 0.
--
-- Nếu có dòng khác 0, DỪNG LẠI và đọc kỹ trước khi chạy migration.

-- 1. Migration nền 20260721 phải đã được áp.
SELECT 'base_migration_missing' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'essay_grading_reviews'
  )
) t

UNION ALL

SELECT 'grading_configs_table_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'question_grading_configs'
  )
) t

UNION ALL

-- 2. Các cột migration sẽ đụng tới phải tồn tại đúng tên.
SELECT 'expected_columns_missing', COUNT(*)::bigint
FROM (
  VALUES
    ('student_answers', 'grading_status'),
    ('student_answers', 'grading_method'),
    ('student_answers', 'answer_hash'),
    ('student_answers', 'grading_rubric_version'),
    ('student_answers', 'max_score'),
    ('student_answers', 'ai_model'),
    ('student_answers', 'graded_by'),
    ('essay_grading_reviews', 'reviewer_id'),
    ('essay_grading_reviews', 'review_hash'),
    ('exam_attempts', 'pending_grading_count'),
    ('exam_attempts', 'grading_status')
) AS expected(tbl, col)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = expected.tbl
    AND c.column_name = expected.col
)

UNION ALL

-- 3. actor_kind chưa tồn tại (nếu có nghĩa là migration đã chạy rồi).
SELECT 'actor_kind_already_exists', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_grading_reviews'
  AND column_name = 'actor_kind'

UNION ALL

-- 4. Chưa có answer nào mang trạng thái ai_graded (constraint hiện chưa cho).
SELECT 'unexpected_ai_graded_rows', COUNT(*)::bigint
FROM public.student_answers
WHERE grading_status = 'ai_graded'

UNION ALL

-- 5. Bản ghi review hiện tại đều phải có reviewer_id, nếu không thì
--    constraint actor_consistency sẽ fail khi tạo.
SELECT 'reviews_without_reviewer', COUNT(*)::bigint
FROM public.essay_grading_reviews
WHERE reviewer_id IS NULL

UNION ALL

-- 6. Tên hàm mới chưa bị chiếm bởi định nghĩa khác.
SELECT 'function_name_conflict', COUNT(*)::bigint
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ai_finalize_essay_answer',
    'get_essay_grading_package',
    'recount_attempt_grading'
  )

UNION ALL

-- 7. Vai trò service_role phải tồn tại (Supabase mặc định có).
SELECT 'service_role_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
  )
) t

UNION ALL

-- 8. THÔNG TIN, không phải blocker: số bài đang chờ chấm. Ghi lại con số này
--    để so sánh sau khi bật AI. Nếu bằng 0 thì chưa có gì để kiểm thử.
SELECT 'info_pending_essays_now', 0::bigint
WHERE (SELECT COUNT(*) FROM public.student_answers
       WHERE question_type = 'essay' AND grading_status = 'pending_review') >= 0;

-- Xem riêng con số ở trên:
-- SELECT COUNT(*) AS pending_essays FROM public.student_answers
-- WHERE question_type = 'essay' AND grading_status = 'pending_review';
