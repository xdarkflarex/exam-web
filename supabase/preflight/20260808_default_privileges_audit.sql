-- 20260808_default_privileges_audit.sql
--
-- CHỈ ĐỌC. Chạy độc lập, không gắn với migration nào. Chạy lại bất cứ lúc nào.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo`. Chạy trọn file một lần; Editor chỉ hiện
-- kết quả CÂU LỆNH CUỐI, nên bảng tổng nằm ở cuối file.
--
-- VÌ SAO CÓ FILE NÀY. Postflight `20260807` phát hiện `service_role` có
-- UPDATE/DELETE/TRUNCATE trên `essay_ocr_snapshots` dù migration cố ý không
-- grant. Nguyên nhân không nằm ở migration đó mà ở cấu hình cấp schema:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
--
-- Supabase đặt sẵn dòng này. Nó nghĩa là **mọi bảng tạo mới trong `public` sinh
-- ra đã có ALL cho bốn role**, trước khi bất cứ câu `GRANT` nào chạy. Migration
-- nào dựa vào lập luận "tôi không grant UPDATE nên nó không có UPDATE" đều sai,
-- và sai một cách im lặng — không lỗi, không cảnh báo, chỉ là một bảng mở hơn ý
-- định của người viết.
--
-- `20260808_essay_ocr_snapshots_lock_append_only.sql` sửa một bảng. File này trả
-- lời câu hỏi rộng hơn: **còn bảng nào nữa?**
--
-- ĐỌC KẾT QUẢ THẾ NÀO. File này KHÔNG có bảng `must_be_zero`, vì phần lớn bảng
-- trong `public` *đúng* là nên cho `authenticated` đọc ghi — đó là cách app hoạt
-- động. Không có ngưỡng máy móc nào phân biệt "quyền rộng hợp lý" với "quyền
-- rộng do sơ suất"; việc đó cần đọc từng bảng. File này thu hẹp danh sách cần
-- đọc và xếp theo mức đáng ngờ.
--
-- KHÔNG SỬA GÌ. Đổi `ALTER DEFAULT PRIVILEGES` ảnh hưởng mọi bảng tương lai của
-- mọi migration sau này — quyết định của chủ dự án, không phải của một script rà.
--
-- CỔNG CHẶN: `has_table_privilege('anon', ...)` raise nếu role không tồn tại, và
-- script này gọi nó hàng trăm lần. Kiểm trước bằng `to_regrole` (trả NULL thay vì
-- raise) để lỗi nói được nguyên nhân thật.
DO $$
DECLARE
  thieu text[];
BEGIN
  SELECT array_agg(r.role_name ORDER BY r.role_name) INTO thieu
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role_name)
  WHERE to_regrole(r.role_name) IS NULL;

  IF thieu IS NOT NULL THEN
    RAISE EXCEPTION 'KHONG_CO_ROLE: thiếu vai trò %', array_to_string(thieu, ', ')
      USING DETAIL =
        'Script này giả định bộ role chuẩn của Supabase (anon, authenticated, '
        || 'service_role). Đang chạy trên database khác, hoặc role đã bị đổi tên.';
  END IF;
END;
$$;

SELECT '=== A. Nguyên nhân gốc: default privileges đang có hiệu lực ===' AS muc;

-- Ký hiệu quyền: r=SELECT a=INSERT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER
-- `arwdDxt` = ALL.
--
-- Nếu thấy dòng `service_role=arwdDxt/postgres` cho loại `bảng` ở schema public
-- thì cái bẫy của 20260807 vẫn còn nguyên cho mọi migration sau.
SELECT
  COALESCE(n.nspname, '(toàn cục)') AS schema_name,
  d.defaclrole::regrole             AS nguoi_dat,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'bảng'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'hàm'
    WHEN 'T' THEN 'kiểu'
    WHEN 'n' THEN 'schema'
    ELSE d.defaclobjtype::text
  END                               AS loai_doi_tuong,
  d.defaclacl                       AS quyen_mac_dinh
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY schema_name, loai_doi_tuong, nguoi_dat;

SELECT '=== B. Bảng có RLS bật nhưng KHÔNG policy nào ===' AS muc;

-- ĐÂY LÀ NHÓM ĐÁNG NGỜ NHẤT, và là lý do chính file này tồn tại.
--
-- "RLS bật + không policy" là một mẫu thiết kế có chủ ý trong repo này
-- (`essay_ai_usage` 20260805, `essay_ocr_snapshots` 20260807): nó nghĩa là
-- "bảng này đóng hoàn toàn với client, chỉ service_role dùng". Người viết chọn
-- mẫu đó CHÍNH VÌ muốn khoá chặt.
--
-- Vậy nên nếu một bảng thuộc nhóm này mà `authenticated` hoặc `anon` vẫn có
-- quyền, thì gần như chắc chắn là sơ suất chứ không phải chủ ý — hai điều đó
-- mâu thuẫn nhau. RLS không policy đã chặn ở lớp hàng, nhưng quyền còn sót là
-- lớp phòng thủ bị mất: chỉ cần ai đó thêm một policy tưởng là vô hại về sau,
-- dữ liệu mở ra ngay.
SELECT
  c.relname                          AS bang,
  c.relowner::regrole                AS chu_so_huu,
  c.relforcerowsecurity              AS rls_force,
  has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
  has_table_privilege('service_role', c.oid, 'UPDATE')  AS svc_update,
  has_table_privilege('service_role', c.oid, 'DELETE')  AS svc_delete,
  has_table_privilege('service_role', c.oid, 'TRUNCATE') AS svc_truncate
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;

SELECT '=== C. Bảng KHÔNG bật RLS ===' AS muc;

-- Nhóm này nguy hiểm theo cách khác: không RLS nghĩa là quyền cấp bảng là lớp
-- bảo vệ DUY NHẤT. Với default privileges cấp ALL, một bảng không RLS mà chưa ai
-- REVOKE là bảng mà mọi người dùng đăng nhập đọc ghi xoá được toàn bộ.
--
-- Có bảng nằm đây một cách hợp lý (dữ liệu công khai như `site_settings`), nên
-- cột `co_the_hop_ly` không có ở đây — phải đọc từng bảng.
SELECT
  c.relname                                             AS bang,
  has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select,
  has_table_privilege('anon', c.oid, 'UPDATE')          AS anon_update,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
  has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth_truncate
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

SELECT '=== D. Bảng RLS bật nhưng chưa FORCE ===' AS muc;

-- Thiếu `relforcerowsecurity` nghĩa là kết nối bằng vai trò **sở hữu bảng** bỏ
-- qua được RLS. Supabase SQL Editor chạy bằng vai trò đó, nên một bảng thiếu
-- FORCE trông vẫn "có RLS" mà thực tế mở với đường truy cập đó.
--
-- Đây là mặc định của Postgres, không phải lỗi Supabase — và phần lớn bảng trong
-- repo này chưa FORCE. Danh sách để biết, không phải để sửa hàng loạt.
SELECT
  c.relname AS bang,
  COUNT(p.policyname)::bigint AS so_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT c.relforcerowsecurity
GROUP BY c.relname
ORDER BY c.relname;

SELECT '=== E. ACL thô của mọi bảng — tra cứu khi cần chi tiết ===' AS muc;

-- `relacl` NULL nghĩa là "quyền mặc định của chủ sở hữu", tức chưa ai GRANT hay
-- REVOKE gì trên bảng. Với default privileges của Supabase, NULL thường không
-- xảy ra vì chính default privileges đã ghi ACL vào lúc CREATE TABLE.
SELECT
  c.relname           AS bang,
  c.relowner::regrole AS chu_so_huu,
  c.relacl            AS acl_tho
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- BẢNG TỔNG — cuối file vì Editor chỉ hiện câu lệnh cuối
-- ---------------------------------------------------------------------------
--
-- Xếp theo mức đáng ngờ giảm dần. `muc_do` là đánh giá theo mẫu thiết kế của
-- repo này, KHÔNG phải kết luận — cột cuối nói phải kiểm gì.
--
-- CẦN ĐỌC TAY: một dòng `CAO` không tự động là lỗi. Ví dụ `essay_ai_usage`
-- (20260805) cố ý grant UPDATE/DELETE cho service_role vì worker cập nhật bản
-- ghi chi phí — đúng chủ ý, sẽ hiện ở đây, và không phải sửa. Ngược lại
-- `essay_ocr_snapshots` trước 20260808 trông y hệt nhưng là lỗi thật. Phân biệt
-- được chỉ bằng cách đọc migration tạo bảng và call-site dùng nó.

WITH bang_public AS (
  SELECT
    c.oid,
    c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
    ) AS co_policy
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
danh_gia AS (
  SELECT
    b.relname AS bang,
    b.relrowsecurity AS rls,
    b.co_policy,
    -- Quyền ghi của client là thứ đáng lo nhất: đây là đường một học sinh đã
    -- đăng nhập có thể đi, chỉ cần RLS không chặn kịp.
    (SELECT COUNT(*) FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
     WHERE has_table_privilege('authenticated', b.oid, p.priv))::bigint AS auth_quyen_ghi,
    (SELECT COUNT(*) FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
     WHERE has_table_privilege('anon', b.oid, p.priv))::bigint AS anon_quyen_ghi,
    (SELECT COUNT(*) FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
     WHERE has_table_privilege('service_role', b.oid, p.priv))::bigint AS svc_quyen_sua
  FROM bang_public b
)
SELECT
  bang,
  rls,
  co_policy,
  anon_quyen_ghi,
  auth_quyen_ghi,
  svc_quyen_sua,
  CASE
    -- Mâu thuẫn rõ: chọn mẫu "đóng hoàn toàn" nhưng client vẫn ghi được.
    WHEN rls AND NOT co_policy AND (auth_quyen_ghi > 0 OR anon_quyen_ghi > 0)
      THEN 'CAO'
    -- Không RLS + anon ghi được = ai cũng ghi được, kể cả chưa đăng nhập.
    WHEN NOT rls AND anon_quyen_ghi > 0
      THEN 'CAO'
    -- Không RLS + authenticated ghi được: quyền cấp bảng là lớp duy nhất.
    WHEN NOT rls AND auth_quyen_ghi > 0
      THEN 'TRUNG_BINH'
    -- Bảng chỉ-service_role còn quyền sửa: có thể chủ ý (essay_ai_usage), có thể
    -- là sơ suất y như essay_ocr_snapshots. Phải đọc migration.
    WHEN rls AND NOT co_policy AND svc_quyen_sua > 0
      THEN 'TRUNG_BINH'
    ELSE 'THAP'
  END AS muc_do,
  CASE
    WHEN rls AND NOT co_policy AND (auth_quyen_ghi > 0 OR anon_quyen_ghi > 0)
      THEN 'RLS bật + không policy = ý định đóng hoàn toàn, nhưng client vẫn có quyền ghi. Gần chắc là thiếu REVOKE. Đọc migration tạo bảng.'
    WHEN NOT rls AND anon_quyen_ghi > 0
      THEN 'Không RLS và anon ghi được: người chưa đăng nhập sửa được dữ liệu. Kiểm ngay.'
    WHEN NOT rls AND auth_quyen_ghi > 0
      THEN 'Không RLS: quyền cấp bảng là lớp bảo vệ duy nhất. Xác nhận mọi đường ghi đều qua RPC/route server, không phải client trực tiếp.'
    WHEN rls AND NOT co_policy AND svc_quyen_sua > 0
      THEN 'Bảng chỉ-service_role còn UPDATE/DELETE/TRUNCATE. Đọc migration: có chủ ý (như essay_ai_usage) hay sót REVOKE (như essay_ocr_snapshots trước 20260808)?'
    ELSE 'Không thấy dấu hiệu bất thường theo các mẫu đã biết.'
  END AS phai_kiem_gi
FROM danh_gia
ORDER BY
  CASE
    WHEN rls AND NOT co_policy AND (auth_quyen_ghi > 0 OR anon_quyen_ghi > 0) THEN 1
    WHEN NOT rls AND anon_quyen_ghi > 0 THEN 1
    WHEN NOT rls AND auth_quyen_ghi > 0 THEN 2
    WHEN rls AND NOT co_policy AND svc_quyen_sua > 0 THEN 2
    ELSE 3
  END,
  bang;
