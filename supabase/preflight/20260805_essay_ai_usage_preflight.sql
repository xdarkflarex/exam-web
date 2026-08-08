-- READ ONLY. Chạy TRƯỚC 20260805_essay_ai_usage.sql.
-- Kỳ vọng: mọi must_be_zero đều bằng 0.
--
-- Nếu có dòng khác 0, DỪNG LẠI và đọc kỹ trước khi chạy migration.

-- 1. Bảng tham chiếu phải tồn tại (FK sẽ fail nếu thiếu).
SELECT 'student_answers_missing' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_answers'
  )
) t

UNION ALL

SELECT 'exam_attempts_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'exam_attempts'
  )
) t

UNION ALL

-- 2. Kiểu khoá chính của hai bảng tham chiếu phải là text.
--    FK khai báo text; nếu thực tế là uuid thì migration fail giữa chừng.
SELECT 'referenced_pk_not_text', COUNT(*)::bigint
FROM (
  VALUES ('student_answers'), ('exam_attempts')
) AS expected(tbl)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = expected.tbl
    AND c.column_name = 'id'
    AND c.data_type = 'text'
)

UNION ALL

-- 3. Tên bảng chưa bị chiếm (nếu có nghĩa là migration đã chạy rồi).
SELECT 'usage_table_already_exists', COUNT(*)::bigint
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'essay_ai_usage'

UNION ALL

-- 4. Tên hàm chưa bị chiếm bởi định nghĩa khác.
SELECT 'function_name_conflict', COUNT(*)::bigint
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'essay_ai_month_to_date_cost'

UNION ALL

-- 5. gen_random_uuid() phải dùng được (pgcrypto hoặc PG13+ built-in).
SELECT 'gen_random_uuid_unavailable', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid'
  )
) t

UNION ALL

-- 6. service_role phải tồn tại; không có nó thì GRANT fail và worker không
--    bao giờ ghi được nhật ký.
SELECT 'service_role_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
  )
) t

UNION ALL

-- 7. Múi giờ Asia/Ho_Chi_Minh phải được database nhận. Hàm tính chi phí tháng
--    dùng tên này; sai tên thì hàm raise lỗi lúc chạy chứ không phải lúc tạo.
SELECT 'timezone_name_unknown', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = 'Asia/Ho_Chi_Minh'
  )
) t;

-- THÔNG TIN, không phải blocker: số bài essay đang chờ chấm. Đây là hàng chờ
-- mà worker sẽ xử lý ngay lần chạy đầu. Bằng 0 nghĩa là chưa có gì để kiểm thử.
--   SELECT COUNT(*) AS pending_essays FROM public.student_answers
--   WHERE question_type = 'essay' AND grading_status = 'pending_review';
