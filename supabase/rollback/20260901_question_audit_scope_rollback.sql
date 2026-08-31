-- Hoàn tác `20260901_question_audit_scope.sql`.
--
-- KHÔNG mất dữ liệu: file gốc chỉ thêm một hàm CHỈ ĐỌC và một index.
--
-- LƯU Ý THỨ TỰ: xoá hàm này trong khi code mới còn đang chạy sẽ làm nút "Bắt
-- đầu quét" lỗi ở MỌI chế độ, không riêng hai chế độ mới — route start gọi hàm
-- này cho cả chế độ theo chương. Deploy code cũ trước, rồi mới chạy file này.

BEGIN;

DROP FUNCTION IF EXISTS public.question_audit_scope_ids(text, text, text, text, text, integer);

DROP INDEX IF EXISTS public.questions_type_id_idx;

COMMIT;
