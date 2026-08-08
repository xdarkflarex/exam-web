-- 20260812_announcements_policy_fix_preflight.sql
--
-- Chạy TRƯỚC migration. Chỉ đọc. Bảng kết luận là câu lệnh CUỐI file.
--
-- CÁCH ĐỌC: cột `ky_vong` nói rõ từng dòng. Dòng `chan_*` phải bằng 0. Dòng
-- `xac_nhan_loi_*` kỳ vọng KHÁC 0 — chúng xác nhận lỗi có thật; nếu bằng 0 thì
-- migration chỉ là no-op và cần tìm hiểu trước khi tin postflight.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: hai policy hiện tại — đây là thứ migration sẽ thay
-- ---------------------------------------------------------------------------
--
-- Đọc cột `roles`: `{public}` nghĩa là policy KHÔNG có mệnh đề `TO`, tức áp cho
-- mọi vai trò kể cả `anon`. Đó là nửa đầu của nguyên nhân. Nửa sau nằm ở `qual`
-- của policy admin: nó đọc `profiles`.

SELECT
  'policy_truoc_khi_sua' AS muc,
  policyname,
  cmd,
  roles::text AS ap_cho_role,
  qual AS bieu_thuc_using
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: dữ liệu sẽ hiện ra cho khách sau khi sửa
-- ---------------------------------------------------------------------------
--
-- Bản sửa NỚI quyền đọc cho người chưa đăng nhập, nên phải biết trước chính xác
-- bao nhiêu dòng sẽ lộ ra. `se_hien_cho_khach` là con số đó; `bi_an` phải tiếp
-- tục không xem được sau migration.

SELECT
  'pham_vi_du_lieu' AS muc,
  COUNT(*)::bigint AS tong_thong_bao,
  COUNT(*) FILTER (
    WHERE is_active = true
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
  )::bigint AS se_hien_cho_khach,
  COUNT(*) FILTER (WHERE is_active = false)::bigint AS bi_an_vi_tat,
  COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date < now())::bigint AS bi_an_vi_het_han
FROM public.announcements;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: anon có quyền gì trên profiles
-- ---------------------------------------------------------------------------
--
-- `false` ở cột SELECT chính là lý do policy admin không đánh giá nổi khi người
-- gọi là `anon`.

SELECT
  'quyen_anon_tren_profiles' AS muc,
  p.priv,
  has_table_privilege('anon', 'public.profiles', p.priv) AS anon_co_quyen
FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS p(priv);

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'chan_thieu_bang_announcements' AS check_name, COUNT(*)::bigint AS gia_tri, 'phải = 0' AS ky_vong
FROM (SELECT 1 WHERE to_regclass('public.announcements') IS NULL) t
UNION ALL
SELECT 'chan_thieu_bang_profiles', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regclass('public.profiles') IS NULL) t
UNION ALL
SELECT 'chan_rls_chua_bat', COUNT(*)::bigint, 'phải = 0'
FROM pg_class
WHERE oid = to_regclass('public.announcements') AND relrowsecurity = false
UNION ALL
-- XÁC NHẬN LỖI, nửa thứ nhất: policy không giới hạn vai trò.
-- Kỳ vọng 2 (cả hai policy gốc đều thiếu `TO`).
SELECT 'xac_nhan_loi_policy_khong_co_TO', COUNT(*)::bigint, 'kỳ vọng = 2'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
  AND 'public' = ANY (roles)
UNION ALL
-- XÁC NHẬN LỖI, nửa thứ hai: có policy đọc `profiles`. Kỳ vọng 1.
SELECT 'xac_nhan_loi_policy_doc_profiles', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'announcements'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%'
UNION ALL
-- XÁC NHẬN LỖI, nguyên nhân gốc: anon không đọc được profiles. Kỳ vọng 1.
SELECT 'xac_nhan_loi_anon_khong_doc_duoc_profiles', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM (SELECT 1 WHERE NOT has_table_privilege('anon', 'public.profiles', 'SELECT')) t
UNION ALL
-- Hàm chưa tồn tại là bình thường trước migration.
SELECT 'ham_da_ton_tai', COUNT(*)::bigint, 'thường = 0; khác 0 = đã chạy rồi'
FROM (SELECT 1 WHERE to_regprocedure('public.viewer_is_admin()') IS NOT NULL) t
ORDER BY check_name;
