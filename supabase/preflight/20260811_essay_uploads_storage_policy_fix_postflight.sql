-- 20260811_essay_uploads_storage_policy_fix_postflight.sql
--
-- Chạy SAU migration. Chỉ đọc. Bảng kết luận là câu lệnh CUỐI file; mọi
-- `must_be_zero` phải bằng 0.
--
-- GIỚI HẠN PHẢI BIẾT, và ở migration này nó lớn hơn bình thường: file này đọc
-- catalog, nên nó chứng minh policy đã được VIẾT LẠI đúng, KHÔNG chứng minh học
-- sinh xem lại được ảnh. Chính lỗi mà migration này sửa là loại lỗi mà catalog
-- không thấy — `20260809` có postflight đạt toàn bộ mà policy vẫn hỏng.
--
-- Phép thử thật nằm ở `docs/RUNBOOK.md` mục 8quater. Không bỏ.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: policy sau khi sửa
-- ---------------------------------------------------------------------------
--
-- Cả bốn `bieu_thuc` phải chỉ còn `bucket_id = 'essay-uploads'` và một lời gọi
-- `public.essay_upload_*`. Không còn `exam_attempts` hay `profiles` nào.

SELECT
  'policy_sau_khi_sua' AS muc,
  policyname,
  cmd,
  COALESCE(qual, with_check) AS bieu_thuc
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: ba hàm quyền
-- ---------------------------------------------------------------------------

SELECT
  'ham_quyen' AS muc,
  p.proname,
  p.prosecdef AS la_security_definer,
  p.provolatile AS volatility,
  pg_get_function_identity_arguments(p.oid) AS tham_so,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_goi_duoc,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_goi_duoc
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'essay_upload_%'
ORDER BY p.proname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: policy trên bảng metadata
-- ---------------------------------------------------------------------------
--
-- `essay_answer_uploads_admin_all` phải dùng hàm. Ba policy học sinh giữ nguyên
-- như 20260809 — chúng đúng vì lý do đúng, không phải tình cờ.

SELECT
  'policy_bang_metadata' AS muc,
  policyname,
  cmd,
  COALESCE(qual, with_check) AS bieu_thuc
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'so_policy_bucket_khac_4' AS check_name, ABS(4 - COUNT(*))::bigint AS must_be_zero
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
UNION ALL
-- KIỂM CỐT LÕI. Còn tham chiếu trực tiếp nghĩa là lỗi vẫn nguyên đó.
SELECT 'policy_bucket_con_doc_exam_attempts', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%exam_attempts%'
UNION ALL
SELECT 'policy_bucket_con_doc_profiles', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%'
UNION ALL
-- Mọi policy vẫn phải lọc theo bucket. Thiếu là policy áp cho MỌI bucket khác.
SELECT 'policy_bucket_khong_loc_bucket', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%essay-uploads%'
UNION ALL
SELECT 'thieu_ham', COUNT(*)::bigint
FROM unnest(ARRAY[
  'public.essay_upload_is_owner(text)',
  'public.essay_upload_viewer_is_admin()',
  'public.essay_upload_attempt_active(text)'
]) AS f(sig)
WHERE to_regprocedure(f.sig) IS NULL
UNION ALL
-- Không SECURITY DEFINER thì hàm lại chạy dưới RLS người gọi và không sửa gì cả.
SELECT 'ham_khong_security_definer', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'essay_upload_%'
  AND NOT p.prosecdef
UNION ALL
-- SECURITY DEFINER không cố định search_path là đường leo quyền kinh điển.
SELECT 'ham_thieu_search_path', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'essay_upload_%'
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS c(v)
    WHERE c.v LIKE 'search_path=%'
  )
UNION ALL
-- Thiếu EXECUTE thì truy vấn chạm bucket sẽ LỖI, không phải trả 0 dòng.
SELECT 'authenticated_thieu_execute', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'essay_upload_%'
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
UNION ALL
-- anon không được gọi hàm SECURITY DEFINER về ảnh học sinh.
SELECT 'anon_goi_duoc_ham', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE 'essay_upload_%'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
UNION ALL
-- Bảng metadata: 4 policy như 20260809, và admin policy đã dùng hàm.
SELECT 'so_policy_metadata_khac_4', ABS(4 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
UNION ALL
SELECT 'admin_policy_metadata_con_doc_profiles', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_answer_uploads'
  AND policyname = 'essay_answer_uploads_admin_all'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%'
UNION ALL
-- Bucket vẫn phải private. Migration không chạm bucket, kiểm để chắc.
SELECT 'bucket_dang_public', COUNT(*)::bigint
FROM storage.buckets WHERE id = 'essay-uploads' AND public IS DISTINCT FROM false
ORDER BY check_name;
