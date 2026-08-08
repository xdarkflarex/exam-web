-- 20260808_essay_ocr_snapshots_lock_preflight.sql
--
-- CHỈ ĐỌC. Chạy TRƯỚC
-- `supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo`. Chạy trọn file một lần; Editor chỉ
-- hiện kết quả CÂU LỆNH CUỐI, nên bảng kết luận nằm ở cuối file.
--
-- Preflight này khác thường ở một điểm: nó xác nhận **lỗi đang tồn tại**.
-- Migration 20260808 sinh ra để gỡ quyền thừa mà postflight 20260807 phát hiện;
-- nếu quyền thừa đó không có thật thì migration là no-op và cần xem lại chẩn
-- đoán trước khi chạy bất cứ thứ gì.
--
-- Preflight này KHÔNG có bảng `must_be_zero` theo nghĩa thường. Xem mục D.

SELECT '=== A. Bảng đích tồn tại chưa ===' AS muc;

-- Phải là true. false nghĩa là 20260807 chưa áp — dừng, áp 20260807 trước.
SELECT
  'essay_ocr_snapshots_ton_tai' AS check_name,
  to_regclass('public.essay_ocr_snapshots') IS NOT NULL AS ket_qua,
  'false = áp 20260807 trước, đừng chạy 20260808' AS ghi_chu;

SELECT '=== B. ACL thô và chủ sở hữu ===' AS muc;

-- Đọc bằng mắt. Ký hiệu quyền trong `relacl`:
--   r = SELECT   a = INSERT   w = UPDATE   d = DELETE
--   D = TRUNCATE x = REFERENCES  t = TRIGGER
-- Kỳ vọng TRƯỚC migration: service_role có `arwdDxt` (tức ALL).
-- Kỳ vọng SAU migration:   service_role chỉ còn `ar`.
--
-- `relowner` quan trọng: chủ sở hữu bảng luôn có đủ quyền và `REVOKE` KHÔNG gỡ
-- được. Nếu chủ sở hữu là `service_role` thì migration 20260808 sẽ raise
-- REVOKE_KHONG_AN và cần cách khác (đổi owner) — không phải REVOKE.
SELECT
  c.relowner::regrole AS chu_so_huu,
  c.relrowsecurity    AS rls_bat,
  c.relforcerowsecurity AS rls_force,
  c.relacl            AS acl_tho
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass;

SELECT '=== C. Quyền theo từng role, từng thao tác ===' AS muc;

-- Bảng chi tiết để biết chính xác cái gì sẽ đổi. `has_table_privilege` tính cả
-- quyền thừa hưởng qua vai trò, nên đây là sự thật hiệu lực, không phải ACL thô.
SELECT
  r.role_name,
  p.priv,
  has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv) AS co_quyen
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role_name)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                        'REFERENCES', 'TRIGGER']) AS p(priv)
ORDER BY r.role_name, p.priv;

SELECT '=== D. Default privileges của schema public ===' AS muc;

-- Đây là NGUYÊN NHÂN GỐC. Nếu bảng này có dòng cho `service_role` với `arwdDxt`
-- thì mọi bảng tạo mới trong `public` đều sinh ra với ALL, và migration nào viết
-- "cố ý không grant UPDATE" cũng sẽ mắc lại đúng lỗi của 20260807.
--
-- Migration 20260808 KHÔNG sửa chỗ này (đổi nó là đổi hành vi mọi bảng tương
-- lai, cần chủ dự án quyết). Đọc để biết cái bẫy còn đó.
SELECT
  d.defaclrole::regrole AS nguoi_dat,
  n.nspname             AS schema_name,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'bảng'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'hàm'
    WHEN 'T' THEN 'kiểu'
    WHEN 'n' THEN 'schema'
    ELSE d.defaclobjtype::text
  END                   AS loai_doi_tuong,
  d.defaclacl           AS quyen_mac_dinh
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR n.nspname IS NULL
ORDER BY d.defaclobjtype, nguoi_dat;

-- ---------------------------------------------------------------------------
-- BẢNG KẾT LUẬN — cuối file vì Editor chỉ hiện câu lệnh cuối
-- ---------------------------------------------------------------------------
--
-- ĐỌC KHÁC VỚI CÁC PREFLIGHT TRƯỚC. Ở đây có hai loại dòng:
--
--   * `chan_*`  → phải bằng 0. Khác 0 là DỪNG, đừng chạy migration.
--   * `xac_nhan_loi_*` → kỳ vọng **KHÁC 0** (mong đợi 2 hoặc 3). Bằng 0 nghĩa là
--     quyền thừa không có thật: migration sẽ chỉ là no-op vô hại, nhưng chẩn
--     đoán ban đầu sai ở đâu đó và đáng tìm hiểu trước khi tin postflight.
--
-- Cột `ky_vong` nói rõ từng dòng mong đợi gì, để không phải nhớ.

SELECT
  'chan_thieu_bang' AS check_name,
  COUNT(*)::bigint AS gia_tri,
  'phải = 0' AS ky_vong
FROM (SELECT 1 WHERE to_regclass('public.essay_ocr_snapshots') IS NULL) t

UNION ALL
-- Chủ sở hữu bảng có đủ quyền bất chấp REVOKE. Nếu service_role là owner thì
-- REVOKE của migration không ăn và cổng tự kiểm sẽ raise — biết trước thì tốt
-- hơn là để migration rollback rồi mới đi tìm nguyên nhân.
SELECT
  'chan_service_role_la_chu_so_huu',
  COUNT(*)::bigint,
  'phải = 0'
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass
  AND c.relowner = to_regrole('service_role')

UNION ALL
-- service_role phải đang có SELECT và INSERT. Thiếu từ trước nghĩa là ACL đã bị
-- ai đó sửa tay và trạng thái không như 20260807 để lại — dừng để xem lại.
SELECT
  'chan_service_role_thieu_quyen_doc_ghi',
  COUNT(*)::bigint,
  'phải = 0'
FROM (
  SELECT 1 WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', 'SELECT')
  UNION ALL
  SELECT 1 WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', 'INSERT')
) t

UNION ALL
-- anon/authenticated phải đã sạch từ 20260807. Khác 0 ở đây là lỗ hổng nghiêm
-- trọng hơn hẳn cái đang sửa: học sinh đọc được cờ chất lượng bài mình.
SELECT
  'chan_client_con_quyen',
  COUNT(*)::bigint,
  'phải = 0'
FROM (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
  WHERE has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- ĐÂY LÀ LỖI CẦN SỬA. Kỳ vọng 3 (UPDATE + DELETE + TRUNCATE) nếu default
-- privileges cấp ALL. Postflight 20260807 báo 2 vì nó chỉ đếm UPDATE/DELETE —
-- TRUNCATE là cái nó bỏ sót, và TRUNCATE một mình đủ xoá sạch nhật ký.
SELECT
  'xac_nhan_loi_service_role_thua_quyen',
  COUNT(*)::bigint,
  'kỳ vọng 3 (UPDATE+DELETE+TRUNCATE); 0 = không có gì để sửa'
FROM (
  SELECT 1
  FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
  WHERE has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Nguyên nhân gốc còn nguyên hay không. KHÁC 0 = default privileges vẫn cấp
-- quyền ghi cho service_role trên bảng mới → bẫy vẫn còn cho migration sau.
--
-- GIÁ TRỊ LÀ SỐ *NGƯỜI ĐẶT*, KHÔNG PHẢI 0/1. Khoá của `pg_default_acl` là
-- `(defaclrole, defaclnamespace, defaclobjtype)`, nên mỗi role từng chạy
-- `ALTER DEFAULT PRIVILEGES` trên `public` là một dòng riêng. Trên Supabase
-- thường có 2 (`postgres` và `supabase_admin`) — xem mục D ở trên để biết chính
-- xác là ai. Con số này KHÔNG ảnh hưởng migration 20260808 (nó `REVOKE` trực
-- tiếp trên bảng, không qua default privileges); nó chỉ cho biết sau này muốn
-- sửa tận gốc thì phải sửa **mấy** chỗ — bỏ một cái vẫn còn cái kia.
SELECT
  'xac_nhan_loi_default_privileges_con_rong',
  COUNT(*)::bigint,
  'kỳ vọng >= 1, là SỐ người đặt (Supabase thường 2); nguyên nhân gốc, 20260808 không sửa'
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
  AND d.defaclobjtype = 'r'
  AND EXISTS (
    SELECT 1
    FROM aclexplode(d.defaclacl) AS a
    WHERE a.grantee = to_regrole('service_role')
      AND a.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
  )

ORDER BY check_name;
