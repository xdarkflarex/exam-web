-- 20260810_essay_uploads_purge_postflight.sql
--
-- Chạy SAU supabase/migrations/20260810_essay_uploads_purge.sql. Chỉ đọc.
-- Bảng kết luận là câu lệnh CUỐI file; mọi `must_be_zero` phải bằng 0.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: dữ liệu phải KHÔNG đổi
-- ---------------------------------------------------------------------------
--
-- Migration chỉ thêm cột nullable. Đối chiếu với cùng bảng ở preflight: `tong`,
-- `con_song`, `cu_nhat` phải giống hệt, và `da_don` phải bằng 0 — chưa job nào chạy.

SELECT
  'anh_sau_migration' AS muc,
  COUNT(*)::bigint AS tong,
  COUNT(*) FILTER (WHERE deleted_at IS NULL)::bigint AS con_song,
  COUNT(purged_at)::bigint AS da_don,
  MIN(created_at) AS cu_nhat,
  pg_size_pretty(COALESCE(SUM(byte_size), 0)) AS tong_dung_luong
FROM public.essay_answer_uploads;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: hàm trigger sau khi thay
-- ---------------------------------------------------------------------------
--
-- Đối chiếu với ảnh chụp 2 của preflight. Phải giống hệt bản cũ, CỘNG đúng hai
-- khối mới: `UPLOAD_PURGED_ON_INSERT` và `UPLOAD_UNPURGE_FORBIDDEN`. Thiếu bất kỳ
-- khối cũ nào nghĩa là `CREATE OR REPLACE` đã làm mất một bất biến — đó là rủi ro
-- cố hữu của việc chép lại cả hàm, và đây là chỗ bắt nó.

SELECT
  'ham_trigger' AS muc,
  pg_get_functiondef(to_regprocedure('public.essay_answer_uploads_guard()')) AS dinh_nghia;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: index mới
-- ---------------------------------------------------------------------------

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

SELECT 'thieu_cot_purged_at' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'essay_answer_uploads'
    AND column_name = 'purged_at')) t
UNION ALL
-- Ảnh còn xem được phải có `purged_at` NULL, nên cột bắt buộc nullable.
SELECT 'cot_purged_at_not_null', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_answer_uploads'
  AND column_name = 'purged_at'
  AND is_nullable = 'NO'
UNION ALL
SELECT 'thieu_index_purge', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'essay_answer_uploads'
    AND indexname = 'essay_answer_uploads_purge_idx')) t
UNION ALL
SELECT 'thieu_trigger_guard', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgrelid = to_regclass('public.essay_answer_uploads')
    AND tgname = 'essay_answer_uploads_guard_trg'
    AND NOT tgisinternal)) t
UNION ALL
-- Sáu bất biến phải CÒN NGUYÊN trong thân hàm sau `CREATE OR REPLACE`. Đây là
-- kiểm quan trọng nhất của file: chép lại cả hàm để thêm hai khối là cách dễ nhất
-- để đánh rơi một khối cũ, và đánh rơi thì không có lỗi nào báo.
SELECT 'mat_bat_bien_trong_ham', COUNT(*)::bigint
FROM unnest(ARRAY[
  'UPLOAD_OWNER_MISMATCH',
  'UPLOAD_PATH_MISMATCH',
  'ATTEMPT_NOT_ACTIVE',
  'UPLOAD_IMMUTABLE',
  'UPLOAD_UNDELETE_FORBIDDEN',
  'ATTEMPT_FROZEN'
]) AS m(ma)
WHERE position(m.ma IN COALESCE(
  pg_get_functiondef(to_regprocedure('public.essay_answer_uploads_guard()')), '')) = 0
UNION ALL
-- Hai bất biến MỚI phải có mặt, nếu không migration đã chạy nhưng không làm gì.
SELECT 'thieu_bat_bien_moi', COUNT(*)::bigint
FROM unnest(ARRAY['UPLOAD_PURGED_ON_INSERT', 'UPLOAD_UNPURGE_FORBIDDEN']) AS m(ma)
WHERE position(m.ma IN COALESCE(
  pg_get_functiondef(to_regprocedure('public.essay_answer_uploads_guard()')), '')) = 0
UNION ALL
-- Migration không grant gì; quyền phải y như preflight.
SELECT 'quyen_xoa_con_sot', COUNT(*)::bigint
FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['DELETE', 'TRUNCATE']) AS p(priv)
WHERE has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
UNION ALL
SELECT 'thieu_quyen_lam_viec', COUNT(*)::bigint
FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS p(priv)
WHERE NOT has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
UNION ALL
-- Chưa job nào chạy nên chưa ảnh nào được đánh dấu đã dọn.
SELECT 'da_co_anh_bi_don', COUNT(*)::bigint
FROM public.essay_answer_uploads
WHERE purged_at IS NOT NULL
ORDER BY check_name;
