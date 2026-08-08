-- 20260807_essay_ocr_snapshots_preflight.sql
--
-- CHỈ ĐỌC. Chạy TRƯỚC `supabase/migrations/20260807_essay_ocr_snapshots.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo` của psql. Chạy trọn file một lần;
-- Editor chỉ hiện kết quả CÂU LỆNH CUỐI, nên bảng kết luận nằm ở cuối file.
--
-- Migration này chỉ tạo mới, không sửa gì đang có, nên preflight nhẹ: xác nhận
-- hai bảng được tham chiếu tồn tại và bảng đích chưa tồn tại.

SELECT '=== A. Bảng phụ thuộc ===' AS muc;

-- Hai FK trỏ tới exam_attempts và questions. Thiếu một trong hai thì
-- CREATE TABLE raise ngay, nhưng biết trước vẫn hơn.
SELECT
  'exam_attempts' AS bang,
  to_regclass('public.exam_attempts') IS NOT NULL AS ton_tai,
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'exam_attempts' AND column_name = 'id') AS kieu_id
UNION ALL
SELECT
  'questions',
  to_regclass('public.questions') IS NOT NULL,
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'id');

SELECT '=== B. Bảng đích ===' AS muc;

-- Kỳ vọng false. true nghĩa là migration đã chạy rồi — chạy lại vẫn an toàn
-- (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS) nhưng nên biết.
SELECT
  'essay_ocr_snapshots_da_ton_tai' AS check_name,
  to_regclass('public.essay_ocr_snapshots') IS NOT NULL AS ket_qua,
  'true = migration đã từng chạy' AS ghi_chu;

-- ---------------------------------------------------------------------------
-- BẢNG KẾT LUẬN — cuối file vì Editor chỉ hiện câu lệnh cuối
-- ---------------------------------------------------------------------------
--
-- Kỳ vọng: mọi must_be_zero = 0.

SELECT 'thieu_bang_exam_attempts' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.exam_attempts') IS NULL) t

UNION ALL
SELECT 'thieu_bang_questions', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.questions') IS NULL) t

UNION ALL
-- FK chỉ nối được khi hai bên cùng kiểu. Cả hai phải là text.
SELECT 'kieu_khoa_khong_phai_text', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'exam_attempts' AND column_name = 'id')
    OR (table_name = 'questions' AND column_name = 'id'))
  AND data_type <> 'text'

ORDER BY check_name;
