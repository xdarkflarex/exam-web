-- Hoàn tác `20260902_question_audit_incremental.sql`.
--
-- KHÔNG mất dữ liệu: file gốc chỉ thêm một hàm CHỈ ĐỌC.
--
-- THỨ TỰ: deploy code cũ TRƯỚC rồi mới chạy file này. Code từ 2026-09-01 gọi
-- `question_audit_select_scope` ở mọi chế độ quét — xoá hàm trong khi code mới
-- còn chạy sẽ làm nút "Bắt đầu quét" và tab "Gợi ý AI" lỗi hoàn toàn.
--
-- `question_audit_scope_ids` (bản cũ, 6 tham số) không bị đụng tới, nên code cũ
-- chạy lại được ngay.

BEGIN;

DROP FUNCTION IF EXISTS public.question_audit_select_scope(
  text, text, text, text, text, integer, integer, boolean
);

COMMIT;
