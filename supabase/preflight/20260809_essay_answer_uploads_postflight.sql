-- 20260809_essay_answer_uploads_postflight.sql
--
-- Chạy SAU supabase/migrations/20260809_essay_answer_uploads.sql. Chỉ đọc.
--
-- CÁCH ĐỌC: bảng kết luận là câu lệnh CUỐI file. Mọi dòng `must_be_zero` phải
-- bằng 0.
--
-- GIỚI HẠN PHẢI BIẾT: file này đọc catalog, nên nó chứng minh *cấu hình* đúng,
-- KHÔNG chứng minh *runtime* chặn. Bước xác minh runtime nằm ở
-- `docs/RUNBOOK.md` mục 20260809 — và với bảng có policy thật như bảng này thì
-- nó quan trọng hơn hẳn so với các bảng chỉ-service_role: một policy sai vế
-- `USING` vẫn hiện ra đầy đủ trong `pg_policies` mà cấp quyền cho sai người.
--
-- ĐẶC BIỆT: đừng dùng Supabase SQL Editor để thử "học sinh A đọc được ảnh của B
-- không". Editor chạy bằng vai trò chủ sở hữu, `auth.uid()` là NULL và
-- `FORCE ROW LEVEL SECURITY` không áp cho chủ sở hữu — mọi policy sẽ trông như
-- bị bỏ qua. Dùng JWT học sinh thật qua PostgREST.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: bucket
-- ---------------------------------------------------------------------------

SELECT
  'bucket' AS muc,
  id,
  public AS dang_public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'essay-uploads';

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: quyền role x thao tác trên bảng metadata
-- ---------------------------------------------------------------------------
--
-- Đối chiếu với bảng cùng dạng ở preflight. Trạng thái mong đợi:
--   anon           : false hết
--   authenticated  : SELECT/INSERT/UPDATE true, DELETE/TRUNCATE false
--   service_role   : SELECT/INSERT/UPDATE true, DELETE/TRUNCATE false

SELECT
  'quyen_bang' AS muc,
  r.role,
  p.priv,
  has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv) AS co_quyen
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
ORDER BY r.role, p.priv;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: policy trên bảng metadata
-- ---------------------------------------------------------------------------

SELECT
  'policy_bang' AS muc,
  policyname,
  cmd,
  roles::text,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 4: policy trên storage.objects của bucket này
-- ---------------------------------------------------------------------------
--
-- Đọc kỹ `using_expr`: đây là chỗ một lỗi đánh máy biến "ảnh của tôi" thành
-- "ảnh của mọi người". Cả bốn policy phải có điều kiện
-- `bucket_id = 'essay-uploads'` VÀ một điều kiện về `auth.uid()`.

SELECT
  'policy_storage' AS muc,
  policyname,
  cmd,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 5: snapshot cũ phải KHÔNG đổi
-- ---------------------------------------------------------------------------
--
-- Migration chỉ thêm cột nullable, không chạm dữ liệu. Con số ở đây phải giống
-- hệt preflight, và `so_co_upload_id` phải bằng 0 (chưa route nào ghi cột mới).

SELECT
  'snapshot_sau_migration' AS muc,
  COUNT(*)::bigint AS so_dong,
  COUNT(upload_id)::bigint AS so_co_upload_id,
  MIN(created_at) AS cu_nhat,
  MAX(created_at) AS moi_nhat
FROM public.essay_ocr_snapshots;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 6: ràng buộc và index của bảng mới
-- ---------------------------------------------------------------------------

SELECT
  'rang_buoc' AS muc,
  conname,
  pg_get_constraintdef(oid) AS dinh_nghia
FROM pg_constraint
WHERE conrelid = to_regclass('public.essay_answer_uploads')
ORDER BY conname;

SELECT
  'index' AS muc,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
ORDER BY indexname;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

-- Bucket phải tồn tại và phải private. Dòng thứ hai là dòng quan trọng nhất của
-- cả file: bucket public nghĩa là ai có URL cũng tải được ảnh bài làm.
SELECT 'thieu_bucket' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'essay-uploads')) t
UNION ALL
SELECT 'bucket_dang_public', COUNT(*)::bigint
FROM storage.buckets WHERE id = 'essay-uploads' AND public IS DISTINCT FROM false
UNION ALL
SELECT 'thieu_bang', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regclass('public.essay_answer_uploads') IS NULL) t
UNION ALL
SELECT 'rls_chua_bat_hoac_chua_force', COUNT(*)::bigint
FROM pg_class
WHERE oid = to_regclass('public.essay_answer_uploads')
  AND (relrowsecurity = false OR relforcerowsecurity = false)
UNION ALL
-- anon không được chạm gì. Bảng này chứa đường dẫn ảnh bài làm của học sinh.
SELECT 'quyen_ro_ri_cho_anon', COUNT(*)::bigint
FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
WHERE has_table_privilege('anon', 'public.essay_answer_uploads', p.priv)
UNION ALL
-- Không role nào được xoá cứng. Bảng này chỉ xoá mềm.
SELECT 'quyen_xoa_con_sot', COUNT(*)::bigint
FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['DELETE', 'TRUNCATE']) AS p(priv)
WHERE has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
UNION ALL
-- Siết quá tay theo hướng ngược: học sinh không nộp được ảnh nào.
SELECT 'thieu_quyen_lam_viec', COUNT(*)::bigint
FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS p(priv)
WHERE NOT has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
UNION ALL
-- Bốn policy của bảng metadata.
SELECT 'thieu_policy_bang', GREATEST(0, 4 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
UNION ALL
-- Bốn policy của bucket. Thiếu policy SELECT thì không ai xem được ảnh; thừa
-- một policy lạ thì có đường vòng.
SELECT 'so_policy_storage_khac_4', ABS(4 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
UNION ALL
-- Mọi policy của bucket phải có điều kiện lọc theo bucket. Thiếu là policy đó
-- áp cho MỌI bucket khác trong project.
SELECT 'policy_storage_khong_loc_bucket', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
  AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%essay-uploads%'
UNION ALL
-- Cột nối snapshot.
SELECT 'thieu_cot_upload_id', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'essay_ocr_snapshots'
    AND column_name = 'upload_id')) t
UNION ALL
-- Cột phải nullable: dòng snapshot cũ không có ảnh để trỏ tới, đặt NOT NULL là
-- không migration được.
SELECT 'cot_upload_id_not_null', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_ocr_snapshots'
  AND column_name = 'upload_id'
  AND is_nullable = 'NO'
UNION ALL
-- Trigger giữ ba bất biến mà RLS không diễn đạt được. Thiếu nó thì một dòng có
-- `student_id` lệch làm policy cấp quyền cho sai người.
SELECT 'thieu_trigger_guard', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgrelid = to_regclass('public.essay_answer_uploads')
    AND tgname = 'essay_answer_uploads_guard_trg'
    AND NOT tgisinternal)) t
UNION ALL
-- 20260808 vẫn phải còn hiệu lực: migration này không được nới quyền bảng
-- snapshot khi thêm cột vào nó.
SELECT 'snapshot_mat_tinh_append_only', COUNT(*)::bigint
FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
WHERE has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
ORDER BY check_name;
