-- 20260812_announcements_policy_fix_postflight.sql
--
-- Chạy SAU migration. Chỉ đọc. Mọi `must_be_zero` phải bằng 0.
--
-- GIỚI HẠN: file này đọc catalog nên chỉ chứng minh policy đã được VIẾT LẠI đúng,
-- KHÔNG chứng minh khách xem được thông báo. Phép thử thật bằng anon key nằm ở
-- cuối file migration và ở `docs/RUNBOOK.md` mục 8quinquies. Không bỏ — chính lỗi
-- này là loại mà catalog không thấy.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: policy sau khi sửa
-- ---------------------------------------------------------------------------
--
-- Đối chiếu với ảnh chụp 1 của preflight. Trạng thái mong đợi:
--   announcements_public_read  SELECT  {anon,authenticated}  biểu thức không chạm bảng khác
--   announcements_admin_all    ALL     {authenticated}       gọi viewer_is_admin()
-- Không dòng nào còn `{public}` ở cột role.

SELECT
  'policy_sau_khi_sua' AS muc,
  policyname,
  cmd,
  roles::text AS ap_cho_role,
  qual AS bieu_thuc_using,
  with_check AS bieu_thuc_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: hàm quyền
-- ---------------------------------------------------------------------------

SELECT
  'ham_quyen' AS muc,
  p.proname,
  p.prosecdef AS la_security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_goi_duoc,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_goi_duoc
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'viewer_is_admin';

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: dữ liệu KHÔNG được đổi
-- ---------------------------------------------------------------------------
--
-- Migration chỉ đổi policy. Con số phải giống hệt preflight.

SELECT
  'pham_vi_du_lieu' AS muc,
  COUNT(*)::bigint AS tong_thong_bao,
  COUNT(*) FILTER (
    WHERE is_active = true
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
  )::bigint AS se_hien_cho_khach,
  COUNT(*) FILTER (WHERE is_active = false)::bigint AS bi_an_vi_tat
FROM public.announcements;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'so_policy_khac_2' AS check_name, ABS(2 - COUNT(*))::bigint AS must_be_zero
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
UNION ALL
-- KIỂM CỐT LÕI 1: không policy nào còn áp cho mọi vai trò. Còn dòng nào thì `anon`
-- vẫn phải đánh giá nó và lỗi vẫn nguyên đó.
SELECT 'con_policy_khong_gioi_han_role', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
  AND 'public' = ANY (roles)
UNION ALL
-- KIỂM CỐT LÕI 2: không policy nào còn đọc `profiles` trực tiếp.
SELECT 'con_policy_doc_profiles', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%'
UNION ALL
-- Policy đọc công khai phải tồn tại và phải áp cho `anon`; thiếu nó thì khách vẫn
-- không thấy gì, chỉ khác mã lỗi.
SELECT 'thieu_policy_doc_cho_anon', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'announcements'
    AND policyname = 'announcements_public_read'
    AND 'anon' = ANY (roles))) t
UNION ALL
-- Policy admin KHÔNG được áp cho anon — đó chính là dòng sửa lỗi.
SELECT 'policy_admin_van_ap_cho_anon', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
  AND policyname = 'announcements_admin_all'
  AND 'anon' = ANY (roles)
UNION ALL
SELECT 'thieu_ham_viewer_is_admin', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regprocedure('public.viewer_is_admin()') IS NULL) t
UNION ALL
SELECT 'ham_khong_security_definer', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'viewer_is_admin'
  AND NOT p.prosecdef
UNION ALL
-- SECURITY DEFINER không cố định search_path là đường leo quyền kinh điển.
SELECT 'ham_thieu_search_path', COUNT(*)::bigint
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'viewer_is_admin'
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS c(v)
    WHERE c.v LIKE 'search_path=%'
  )
UNION ALL
SELECT 'authenticated_thieu_execute', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT has_function_privilege(
  'authenticated', to_regprocedure('public.viewer_is_admin()'), 'EXECUTE')) t
UNION ALL
SELECT 'anon_goi_duoc_ham', COUNT(*)::bigint
FROM (SELECT 1 WHERE has_function_privilege(
  'anon', to_regprocedure('public.viewer_is_admin()'), 'EXECUTE')) t
UNION ALL
SELECT 'rls_bi_tat', COUNT(*)::bigint
FROM pg_class
WHERE oid = to_regclass('public.announcements') AND relrowsecurity = false
ORDER BY check_name;
