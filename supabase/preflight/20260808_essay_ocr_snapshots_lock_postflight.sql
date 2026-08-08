-- 20260808_essay_ocr_snapshots_lock_postflight.sql
--
-- CHỈ ĐỌC. Chạy SAU
-- `supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo`. Chạy trọn file một lần.
--
-- Bảng kết luận `must_be_zero` là CÂU LỆNH CUỐI có chủ ý: Supabase SQL Editor
-- chỉ hiện kết quả của câu cuối cùng khi chạy nhiều câu. Bài học từ postflight
-- 20260806.
--
-- KHÁC postflight 20260807 ở hai điểm, và cả hai đều là lỗ mà 20260807 bỏ sót:
--   1. Kiểm cả TRUNCATE, REFERENCES, TRIGGER — không chỉ UPDATE/DELETE.
--      `REVOKE ALL` bỏ sót TRUNCATE thì nhật ký vẫn xoá sạch được bằng một câu.
--   2. Kiểm chủ sở hữu bảng. Chủ sở hữu có đủ quyền bất chấp mọi `REVOKE`, nên
--      một bảng "đã REVOKE sạch" mà service_role là owner thì vẫn mở toang.

-- ---------------------------------------------------------------------------
-- CỔNG CHẶN
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.essay_ocr_snapshots') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_CHAY_QUA_SOM: bảng essay_ocr_snapshots không tồn tại'
      USING DETAIL =
        'Thứ tự đúng: 20260807 (tạo bảng) → 20260808 (siết quyền) → postflight này.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ảnh chụp ACL — đọc bằng mắt
-- ---------------------------------------------------------------------------
--
-- Ký hiệu: r=SELECT a=INSERT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER
-- Kỳ vọng: service_role chỉ còn `ar`. Không dòng nào cho anon/authenticated.
SELECT
  c.relowner::regrole   AS chu_so_huu,
  c.relrowsecurity      AS rls_bat,
  c.relforcerowsecurity AS rls_force,
  c.relacl              AS acl_tho
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass;

-- Chi tiết từng role × từng thao tác. Đối chiếu với cùng bảng trong preflight
-- để thấy đúng ba ô UPDATE/DELETE/TRUNCATE của service_role đã chuyển sang false
-- và không ô nào khác đổi.
SELECT
  r.role_name,
  p.priv,
  has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv) AS co_quyen
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role_name)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                        'REFERENCES', 'TRIGGER']) AS p(priv)
ORDER BY r.role_name, p.priv;

-- ---------------------------------------------------------------------------
-- BẢNG KẾT LUẬN — cuối file có chủ ý
-- ---------------------------------------------------------------------------
--
-- Kỳ vọng: MỌI dòng must_be_zero = 0.

SELECT 'thieu_bang' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.essay_ocr_snapshots') IS NULL) t

UNION ALL
-- MỤC ĐÍCH CHÍNH CỦA MIGRATION NÀY. Cả năm quyền phải sạch.
-- TRUNCATE có mặt ở đây vì nó xoá sạch bảng mà không cần DELETE — đúng cái
-- postflight 20260807 bỏ sót. REFERENCES/TRIGGER cho phép gắn FK và trigger vào
-- một bảng chỉ-ghi-thêm.
SELECT 'service_role_thua_quyen_ghi', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- service_role vẫn phải đọc ghi được. Siết quá tay thì route OCR không ghi được
-- snapshot và worker coi mọi bài có ảnh là mất dấu vết → chặn auto-chốt toàn bộ.
-- Fail-closed nên không sai điểm, nhưng nghĩa là tính năng ngừng hoạt động.
SELECT 'service_role_thieu_quyen_doc_ghi', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['SELECT', 'INSERT']) AS p(priv)
  WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Chủ sở hữu bảng có đủ quyền bất chấp REVOKE. Nếu service_role là owner thì
-- mọi dòng `service_role_thua_quyen_ghi` ở trên vẫn ra 0 được (has_table_privilege
-- trả true cho owner) — nên dòng này phải tồn tại riêng, không suy được từ dòng kia.
SELECT 'service_role_la_chu_so_huu', COUNT(*)::bigint
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass
  AND c.relowner = to_regrole('service_role')

UNION ALL
-- anon/authenticated không được có quyền nào. Kiểm cả 7 thao tác: GRANT sót một
-- thao tác cũng là lỗ, và TRUNCATE cho client là xoá được nhật ký của người khác.
SELECT 'quyen_ro_ri_cho_client', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                          'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Migration này chỉ đổi ACL. Cấu trúc bảng phải y nguyên — RLS vẫn BẬT và FORCE.
SELECT 'rls_bi_thay_doi', COUNT(*)::bigint
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)

UNION ALL
-- Vẫn không được có policy nào. `REVOKE` không sinh policy, nhưng kiểm lại rẻ và
-- đây là bất biến của bảng, không phải của một migration.
SELECT 'co_policy_khong_duoc_phep', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_ocr_snapshots'

UNION ALL
-- Index và CHECK constraint của 20260807 phải còn nguyên. Migration này không
-- chạm DDL; mất chúng nghĩa là có người chạy thứ khác giữa hai lần.
SELECT 'mat_index_tra_cuu', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'essay_ocr_snapshots'
      AND indexname = 'essay_ocr_snapshots_answer_idx'
  )
) t

UNION ALL
SELECT 'mat_check_constraint', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE (
    SELECT COUNT(*)
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'essay_ocr_snapshots'
      AND c.contype = 'c'
      AND c.convalidated
  ) < 2
) t

ORDER BY check_name;

-- ---------------------------------------------------------------------------
-- PHÉP THỬ RUNTIME — postflight này KHÔNG chứng minh được
-- ---------------------------------------------------------------------------
--
-- Bảng trên chỉ đọc catalog. `AGENTS.md` mục 8 đòi negative test thật. Bằng một
-- kết nối dùng **service key** (không phải SQL Editor — Editor chạy bằng vai trò
-- sở hữu, luôn qua được), chạy:
--
--   UPDATE public.essay_ocr_snapshots SET confidence = 0.99;   -- phải: permission denied
--   DELETE FROM public.essay_ocr_snapshots;                    -- phải: permission denied
--   TRUNCATE public.essay_ocr_snapshots;                       -- phải: permission denied
--   SELECT COUNT(*) FROM public.essay_ocr_snapshots;           -- phải: chạy được
--
-- Ba câu đầu qua được nghĩa là REVOKE không có hiệu lực runtime dù catalog nói
-- đúng. Câu cuối lỗi nghĩa là siết quá tay — rollback ngay, worker đang chặn
-- auto-chốt mọi bài.
