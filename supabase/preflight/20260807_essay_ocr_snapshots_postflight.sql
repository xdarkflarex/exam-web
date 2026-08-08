-- 20260807_essay_ocr_snapshots_postflight.sql
--
-- CHỈ ĐỌC. Chạy SAU `supabase/migrations/20260807_essay_ocr_snapshots.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo`. Chạy trọn file một lần.
--
-- Bảng kết luận `must_be_zero` là CÂU LỆNH CUỐI có chủ ý: Supabase SQL Editor
-- chỉ hiện kết quả của câu cuối cùng khi chạy nhiều câu, nên phần quyết định
-- đạt/không đạt phải nằm ở đó. Bài học từ postflight 20260806.
--
-- ĐÃ BIẾT: `service_role_thua_quyen_sua` báo 2 khi chạy trên Primary Database
-- ngày 2026-08-07. KHÔNG phải false positive — `20260807` không REVOKE khỏi
-- service_role, mà default privileges của Supabase đã cấp ALL cho mọi bảng mới
-- trong `public`. Chi tiết ở comment của chính dòng đó phía dưới.
-- Bản sửa: `supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`.
-- Sau khi áp 20260808, chạy lại file này thì dòng đó về 0.

-- ---------------------------------------------------------------------------
-- CỔNG CHẶN: migration đã áp chưa?
-- ---------------------------------------------------------------------------
--
-- Bảng kết luận dưới đây tham chiếu `public.essay_ocr_snapshots`. Nếu bảng chưa
-- tồn tại, cả khối chết cùng lúc với một lỗi "relation does not exist" không nói
-- được nguyên nhân. Cổng này raise trước, bằng tên lỗi nói thẳng phải làm gì.
DO $$
BEGIN
  IF to_regclass('public.essay_ocr_snapshots') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_CHAY_QUA_SOM: chưa áp 20260807_essay_ocr_snapshots.sql'
      USING DETAIL =
        'Bảng public.essay_ocr_snapshots không tồn tại. Thứ tự đúng: '
        || 'preflight → migration → postflight. Postflight chỉ đọc, '
        || 'chạy sớm không hỏng gì.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ảnh chụp cấu hình — đọc bằng mắt
-- ---------------------------------------------------------------------------

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'essay_ocr_snapshots'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- BẢNG KẾT LUẬN — cuối file có chủ ý
-- ---------------------------------------------------------------------------
--
-- Kỳ vọng: MỌI dòng must_be_zero = 0.

SELECT 'thieu_bang' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.essay_ocr_snapshots') IS NULL) t

UNION ALL
-- RLS phải BẬT và FORCE. Thiếu relforcerowsecurity thì kết nối bằng vai trò sở
-- hữu bảng đọc được toàn bộ — đúng thứ migration cố ý chặn.
SELECT 'rls_chua_bat_hoac_chua_force', COUNT(*)::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'essay_ocr_snapshots'
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)

UNION ALL
-- KHÔNG được có policy nào. Bảng này đóng hoàn toàn với anon/authenticated;
-- một policy lọt vào là mở đường cho học sinh đọc cờ chất lượng bài mình.
SELECT 'co_policy_khong_duoc_phep', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_ocr_snapshots'

UNION ALL
-- anon và authenticated không được có quyền nào. Kiểm cả 7 thao tác vì GRANT
-- theo cột hoặc GRANT sót một thao tác đều là lỗ thủng. TRUNCATE có mặt vì nó
-- xoá sạch bảng mà KHÔNG cần quyền DELETE.
SELECT 'quyen_ro_ri_cho_client', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                          'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- service_role phải đọc ghi được, nếu không worker và route OCR đứng hình.
SELECT 'service_role_thieu_quyen', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', 'SELECT')
  UNION ALL
  SELECT 1 WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', 'INSERT')
) t

UNION ALL
-- Nhật ký không được sửa sau khi ghi.
--
-- DÒNG NÀY ĐÃ BÁO 2 TRÊN PRIMARY DATABASE (2026-08-07) — và nó báo đúng.
-- `20260807` chỉ `REVOKE ... FROM PUBLIC, anon, authenticated` rồi
-- `GRANT SELECT, INSERT TO service_role`, tin rằng "không grant UPDATE/DELETE"
-- nghĩa là không có. Nhưng project Supabase mặc định có
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ...
-- service_role`, nên bảng mới sinh ra ĐÃ CÓ ALL và câu GRANT là no-op.
-- service_role không nằm trong danh sách REVOKE nên giữ nguyên ALL.
--
-- Bản sửa: `20260808_essay_ocr_snapshots_lock_append_only.sql`.
-- Sau khi áp nó, dòng này phải về 0.
--
-- TRUNCATE nằm trong danh sách vì `ALL` gồm cả TRUNCATE, và TRUNCATE xoá sạch
-- bảng mà KHÔNG cần quyền DELETE — bản đầu của postflight này chỉ soi
-- UPDATE/DELETE nên sẽ báo "xanh" trong khi nhật ký vẫn xoá được bằng một câu
-- lệnh. REFERENCES/TRIGGER cho phép gắn FK và trigger vào một bảng chỉ-ghi-thêm.
SELECT 'service_role_thua_quyen_sua', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Chủ sở hữu bảng có đủ quyền bất chấp mọi `REVOKE`, và `has_table_privilege`
-- trả true cho chủ sở hữu — nên nếu service_role là owner thì dòng
-- `service_role_thua_quyen_sua` ở trên vẫn ra khác 0 nhưng REVOKE sẽ không gỡ
-- được. Dòng này phân biệt hai nguyên nhân: quyền do GRANT (gỡ được) hay do
-- quyền sở hữu (phải đổi owner).
SELECT 'service_role_la_chu_so_huu', COUNT(*)::bigint
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass
  AND c.relowner = to_regrole('service_role')

UNION ALL
-- Hai FK phải tồn tại và đều ON DELETE CASCADE: xoá attempt phải dọn sạch dấu
-- vết OCR của nó, không để lại dòng mồ côi trỏ vào bài đã xoá.
SELECT 'thieu_fk_hoac_khong_cascade', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE (
    SELECT COUNT(*)
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'essay_ocr_snapshots'
      AND c.contype = 'f'
      AND c.confdeltype = 'c'
  ) <> 2
) t

UNION ALL
-- Index đường truy vấn của worker. Thiếu nó thì mỗi bài chấm là một seq scan.
SELECT 'thieu_index_tra_cuu', COUNT(*)::bigint
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
-- CHECK confidence trong [0,1] và text_length >= 0 phải tồn tại và đã validate.
SELECT 'thieu_check_constraint', COUNT(*)::bigint
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
