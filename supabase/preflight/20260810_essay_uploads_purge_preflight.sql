-- 20260810_essay_uploads_purge_preflight.sql
--
-- Chạy TRƯỚC supabase/migrations/20260810_essay_uploads_purge.sql. Chỉ đọc.
-- Bảng kết luận là câu lệnh CUỐI file; mọi `must_be_zero` phải bằng 0.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: dữ liệu hiện có, và bao nhiêu ảnh đã quá 365 ngày
-- ---------------------------------------------------------------------------
--
-- Con số `qua_han` là số ảnh job TTL sẽ dọn ở lần chạy đầu. Nếu nó lớn hơn 0 ngay
-- lúc này thì có ảnh cũ hơn dự kiến — đọc lại trước khi bật job theo lịch, vì
-- xoá tệp là việc không hoàn lại.

SELECT
  'anh_hien_co' AS muc,
  COUNT(*)::bigint AS tong,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)::bigint AS con_song,
  COUNT(*) FILTER (WHERE created_at < now() - INTERVAL '365 days')::bigint AS qua_han,
  MIN(created_at) AS cu_nhat,
  pg_size_pretty(COALESCE(SUM(byte_size), 0)) AS tong_dung_luong
FROM public.essay_answer_uploads;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: định nghĩa trigger hiện tại
-- ---------------------------------------------------------------------------
--
-- Migration `CREATE OR REPLACE` cả hàm này. Lưu lại bản hiện tại để đối chiếu:
-- sau migration nó phải giống hệt, cộng đúng hai khối `purged_at`.

SELECT
  'ham_trigger' AS muc,
  pg_get_functiondef(to_regprocedure('public.essay_answer_uploads_guard()')) AS dinh_nghia;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: quyền hiện tại, để chứng minh migration không đổi gì
-- ---------------------------------------------------------------------------

SELECT
  'quyen_bang' AS muc,
  r.role,
  p.priv,
  has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv) AS co_quyen
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
ORDER BY r.role, p.priv;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'thieu_bang_20260809' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.essay_answer_uploads') IS NULL) t
UNION ALL
-- Migration `CREATE OR REPLACE` hàm này; thiếu nó nghĩa là 20260809 chưa chạy
-- đủ, và bản thay thế sẽ tạo một hàm không có trigger nào gọi.
SELECT 'thieu_ham_guard', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regprocedure('public.essay_answer_uploads_guard()') IS NULL) t
UNION ALL
SELECT 'thieu_trigger_guard', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgrelid = to_regclass('public.essay_answer_uploads')
    AND tgname = 'essay_answer_uploads_guard_trg'
    AND NOT tgisinternal)) t
UNION ALL
-- Cột đã có nghĩa là migration đã chạy. Chạy lại vô hại nhưng phải biết trước.
SELECT 'cot_purged_at_da_ton_tai', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_answer_uploads'
  AND column_name = 'purged_at'
UNION ALL
-- Quyền `DELETE` xuất hiện trước migration nghĩa là có ai đã nới quyền sau
-- 20260809; migration sẽ raise ở cổng tự kiểm, biết trước thì đỡ mất một vòng.
SELECT 'quyen_xoa_da_xuat_hien', COUNT(*)::bigint
FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
WHERE has_table_privilege(r.role, 'public.essay_answer_uploads', 'DELETE')
ORDER BY check_name;
