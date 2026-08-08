-- 20260809_essay_answer_uploads_preflight.sql
--
-- Chạy TRƯỚC supabase/migrations/20260809_essay_answer_uploads.sql.
-- Chỉ đọc, không đổi gì.
--
-- CÁCH ĐỌC: bảng kết luận là câu lệnh CUỐI file — Supabase SQL Editor chỉ hiện
-- kết quả câu cuối. Mọi dòng `must_be_zero` phải bằng 0. Khác 0 là dừng, không
-- chạy migration.
--
-- Muốn xem các bảng ảnh chụp ở giữa file thì bôi đen riêng từng câu rồi Run,
-- hoặc chạy toàn file bằng psql.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: các bảng migration phụ thuộc
-- ---------------------------------------------------------------------------

SELECT
  'phu_thuoc' AS muc,
  t.bang,
  to_regclass(t.bang) IS NOT NULL AS ton_tai,
  (SELECT data_type
   FROM information_schema.columns
   WHERE table_schema = split_part(t.bang, '.', 1)
     AND table_name = split_part(t.bang, '.', 2)
     AND column_name = 'id') AS kieu_id
FROM (VALUES
  ('public.exam_attempts'),
  ('public.questions'),
  ('public.profiles'),
  ('public.essay_ocr_snapshots'),
  ('storage.buckets'),
  ('storage.objects')
) AS t(bang);

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: bucket đã tồn tại chưa, và nếu có thì có đang public không
-- ---------------------------------------------------------------------------
--
-- Nếu bucket đã có từ một lần thử tay và `public = true`, migration sẽ ép nó về
-- private (câu `ON CONFLICT DO UPDATE`). Biết trước để không bất ngờ.

SELECT
  'bucket' AS muc,
  id,
  public AS dang_public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'essay-uploads';

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: policy hiện có trên storage.objects
-- ---------------------------------------------------------------------------
--
-- Migration `DROP POLICY IF EXISTS` bốn policy của riêng nó rồi tạo lại. Nếu ở
-- đây đã có policy tên khác cấp quyền rộng trên bucket này, migration KHÔNG gỡ
-- giúp — phải xử lý bằng tay.

SELECT
  'policy_storage_hien_co' AS muc,
  policyname,
  cmd,
  roles::text,
  qual IS NOT NULL AS co_using,
  with_check IS NOT NULL AS co_with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 4: dữ liệu snapshot hiện có sẽ thành `upload_id IS NULL`
-- ---------------------------------------------------------------------------
--
-- Những dòng này ghi trước khi có bảng ảnh, nên sau migration chúng mang
-- `upload_id IS NULL` và worker phải fail-closed với chúng. Ghi lại con số để
-- đối chiếu ở postflight: nó phải KHÔNG đổi.

SELECT
  'snapshot_khong_co_anh' AS muc,
  COUNT(*)::bigint AS so_dong,
  MIN(created_at) AS cu_nhat,
  MAX(created_at) AS moi_nhat
FROM public.essay_ocr_snapshots;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 5: giá trị `status` đang thật sự có trong exam_attempts
-- ---------------------------------------------------------------------------
--
-- Cả trigger lẫn 4 policy đều so `status = 'in_progress'`. Nếu database dùng
-- giá trị khác (hoa/thường, tên khác) thì học sinh không nộp được ảnh nào và
-- nguyên nhân sẽ rất khó tìm.

SELECT
  'gia_tri_status' AS muc,
  status,
  COUNT(*)::bigint AS so_attempt
FROM public.exam_attempts
GROUP BY status
ORDER BY so_attempt DESC;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 6: giá trị `role` đang thật sự có trong profiles
-- ---------------------------------------------------------------------------
--
-- Policy admin so `p.role = 'admin'` (exact, không nhận `teacher`). AGENTS.md
-- mục 4 ghi rõ đây là điểm chưa thống nhất của dự án; kiểm để biết ai sẽ mất
-- quyền xem ảnh.

SELECT
  'gia_tri_role' AS muc,
  role,
  COUNT(*)::bigint AS so_nguoi
FROM public.profiles
GROUP BY role
ORDER BY so_nguoi DESC;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'thieu_exam_attempts' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.exam_attempts') IS NULL) t
UNION ALL
SELECT 'thieu_questions', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.questions') IS NULL) t
UNION ALL
SELECT 'thieu_profiles', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.profiles') IS NULL) t
UNION ALL
-- Mục 8 của migration thêm cột vào bảng này. Chưa có bảng là chạy sai thứ tự.
SELECT 'thieu_essay_ocr_snapshots', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.essay_ocr_snapshots') IS NULL) t
UNION ALL
SELECT 'thieu_schema_storage', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('storage.buckets') IS NULL
                     OR to_regclass('storage.objects') IS NULL) t
UNION ALL
-- Bảng đã tồn tại nghĩa là migration đã chạy (hoặc có bảng trùng tên). Chạy lại
-- phần lớn là idempotent, nhưng phải biết trước chứ không phát hiện giữa đường.
SELECT 'bang_da_ton_tai', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.essay_answer_uploads') IS NOT NULL) t
UNION ALL
SELECT 'cot_upload_id_da_ton_tai', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_ocr_snapshots'
  AND column_name = 'upload_id'
UNION ALL
-- Không có attempt nào ở 'in_progress' thì không test được luồng nộp ảnh sau
-- migration. Không phải blocker của migration, nhưng là blocker của việc xác
-- minh nó — và migration không được coi là xong khi chưa xác minh.
SELECT 'khong_co_attempt_in_progress', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_attempts WHERE status = 'in_progress'
  )
) t
UNION ALL
-- Không có ai `role = 'admin'` thì sau migration không ai xem được ảnh của học
-- sinh — policy admin sẽ không khớp dòng nào.
SELECT 'khong_co_admin', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin'
  )
) t
UNION ALL
-- `essay_answer_uploads` là chủ sở hữu FK của `essay_ocr_snapshots.upload_id`.
-- Nếu service_role sở hữu bảng snapshot thì nó có đủ quyền bất chấp REVOKE của
-- 20260808, và append-only chỉ là quy ước.
SELECT 'service_role_so_huu_snapshot', COUNT(*)::bigint
FROM pg_class
WHERE oid = to_regclass('public.essay_ocr_snapshots')
  AND relowner = to_regrole('service_role')
ORDER BY check_name;
