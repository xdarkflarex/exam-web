-- ROLLBACK cho 20260805_essay_ai_usage.sql
--
-- CÁCH NHẸ HƠN, THỬ TRƯỚC: đặt ESSAY_AI_ENABLED=false rồi restart server.
-- Việc đó dừng mọi lời gọi provider mà không mất nhật ký. Chỉ chạy file này
-- khi cần gỡ hẳn cấu trúc.
--
-- CẢNH BÁO: file này XOÁ toàn bộ nhật ký chi phí và kết quả AI. Hệ quả:
--   - Trần chi phí tháng mất mốc tính, worker sẽ coi chi phí đã dùng = 0.
--   - Mất chống gọi trùng theo input_hash: worker chạy lại trên hàng chờ cũ
--     sẽ gọi provider và trả tiền lại từ đầu.
--   - Mất dữ liệu đo tỷ lệ giáo viên chấm đè — tức là mất căn cứ để quyết định
--     có được bật ESSAY_AI_AUTO_FINALIZE hay không.
--
-- Sao lưu trước nếu còn cần số liệu:
--   CREATE TABLE essay_ai_usage_backup AS SELECT * FROM public.essay_ai_usage;
--
-- Migration này KHÔNG đụng tới điểm hay trạng thái bài làm. Rollback nó không
-- làm học sinh mất điểm; bài đã ai_graded vẫn nguyên (xem rollback của
-- 20260804 nếu cần gỡ phần đó).

BEGIN;

-- 1. Thu hồi quyền trước, để worker không ghi thêm trong lúc đang gỡ.
REVOKE ALL ON TABLE public.essay_ai_usage FROM service_role;
REVOKE ALL ON FUNCTION public.essay_ai_month_to_date_cost() FROM service_role;

-- 2. Gỡ hàm chi phí.
DROP FUNCTION IF EXISTS public.essay_ai_month_to_date_cost();

-- 3. Gỡ bảng (index và FK đi theo).
DROP TABLE IF EXISTS public.essay_ai_usage;

COMMIT;

-- Hậu kiểm rollback: cả hai phải trả 0.
--   SELECT COUNT(*) FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'essay_ai_usage';
--   SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'essay_ai_month_to_date_cost';
