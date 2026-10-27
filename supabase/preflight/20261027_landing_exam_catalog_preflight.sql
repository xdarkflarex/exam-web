-- 20261027_landing_exam_catalog_preflight.sql
--
-- Chạy TRƯỚC migration. Chỉ đọc. Bảng kết luận là câu lệnh CUỐI file.
--
-- CÁCH ĐỌC: `chan_*` phải bằng 0. `xac_nhan_loi_*` kỳ vọng KHÁC 0 — chúng
-- chứng minh trạng thái "chưa mở" có thật; bằng 0 nghĩa là ai đó đã cấp quyền
-- ngoài quy trình và cần hiểu vì sao trước khi tin postflight.
--
-- ẢNH CHỤP 3 LÀ PHẦN QUAN TRỌNG NHẤT: nó in ra toàn bộ `description` sẽ trở
-- thành NỘI DUNG CÔNG KHAI sau khi chạy migration. Đọc hết trước khi chạy.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: quyền theo cột của `anon` trên `exams`
-- ---------------------------------------------------------------------------

SELECT
  'quyen_cot_anon_tren_exams' AS muc,
  c.column_name AS cot,
  has_column_privilege('anon', 'public.exams', c.column_name, 'SELECT') AS anon_doc_duoc
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'exams'
ORDER BY anon_doc_duoc DESC, c.column_name;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: policy hiện tại của `exams` và `exam_questions`
-- ---------------------------------------------------------------------------

SELECT
  'policy_truoc_khi_sua' AS muc,
  tablename AS bang,
  policyname,
  cmd,
  roles::text AS ap_cho_role,
  qual AS bieu_thuc_using
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('exams', 'exam_questions')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: những dòng chữ SẼ THÀNH CÔNG KHAI
-- ---------------------------------------------------------------------------
--
-- Sau migration, `description` của mọi đề đã xuất bản đọc được bởi người chưa
-- đăng nhập. Đọc từng dòng dưới đây. Có ghi chú nội bộ ("đề của lớp thầy B",
-- "chưa sửa xong", tên học sinh...) thì sửa TRƯỚC, đừng chạy rồi sửa.

SELECT
  'description_se_cong_khai' AS muc,
  id,
  title,
  exam_mode,
  grade,
  left(COALESCE(description, ''), 300) AS description
FROM public.exams
WHERE COALESCE(is_published, false)
  AND exam_mode IN ('simulation', 'practice')
  AND COALESCE(description, '') <> ''
ORDER BY created_at DESC;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 4: trang chủ sẽ hiện ra cái gì
-- ---------------------------------------------------------------------------
--
-- `grade IS NULL` nghĩa là ĐỀ CHO MỌI LỚP — nó hiện ở mọi tab lớp, không phải
-- đề lỗi. Số ở đây là số chip lọc sẽ hiện trên trang chủ.

SELECT
  'de_cong_khai_theo_phan_loai' AS muc,
  exam_mode,
  COALESCE(grade::text, 'mọi lớp') AS lop,
  COUNT(*)::bigint AS so_de
FROM public.exams
WHERE COALESCE(is_published, false)
  AND exam_mode IN ('simulation', 'practice')
GROUP BY exam_mode, grade
ORDER BY exam_mode, grade NULLS FIRST;

SELECT
  'de_on_tap_se_xuat_hien_lan_dau' AS muc,
  id, title, grade, duration
FROM public.exams
WHERE COALESCE(is_published, false) AND exam_mode = 'practice'
ORDER BY created_at DESC;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'chan_thieu_bang_exams' AS check_name, COUNT(*)::bigint AS gia_tri, 'phải = 0' AS ky_vong
FROM (SELECT 1 WHERE to_regclass('public.exams') IS NULL) t
UNION ALL
SELECT 'chan_thieu_bang_exam_questions', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regclass('public.exam_questions') IS NULL) t
UNION ALL
SELECT 'chan_thieu_cot_grade', COUNT(*)::bigint, 'phải = 0'
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'grade'
  )
) t
UNION ALL
-- Trạng thái "chưa mở" của hôm nay. Kỳ vọng 1 cho cả hai.
SELECT 'xac_nhan_anon_chua_doc_duoc_grade', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exams', 'grade', 'SELECT')) t
UNION ALL
SELECT 'xac_nhan_anon_chua_doc_duoc_description', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exams', 'description', 'SELECT')) t
UNION ALL
SELECT 'xac_nhan_policy_cu_chi_cho_simulation', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'exams'
  AND policyname = 'anon_read_published_simulation_exams'
UNION ALL
SELECT 'xac_nhan_anon_chua_dem_duoc_cau_hoi', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exam_questions', 'exam_id', 'SELECT')) t
UNION ALL
-- Số đề ôn tập sẽ xuất hiện lần đầu trên trang chủ. 0 nghĩa là migration chạy
-- xong vẫn chưa thấy gì mới ở tab "Ôn tập" — không phải lỗi, chỉ là chưa có đề.
SELECT 'so_de_on_tap_se_hien_ra', COUNT(*)::bigint, 'xem ảnh chụp 4'
FROM public.exams
WHERE COALESCE(is_published, false) AND exam_mode = 'practice'
UNION ALL
SELECT 'so_description_se_cong_khai', COUNT(*)::bigint, 'đọc hết ảnh chụp 3 trước khi chạy'
FROM public.exams
WHERE COALESCE(is_published, false)
  AND exam_mode IN ('simulation', 'practice')
  AND COALESCE(description, '') <> ''
ORDER BY check_name;
