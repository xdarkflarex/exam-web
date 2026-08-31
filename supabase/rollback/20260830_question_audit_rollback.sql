-- Hoàn tác `20260830_question_audit.sql`.
--
-- AN TOÀN VỚI NGÂN HÀNG CÂU HỎI: file này chỉ xoá hai bảng kết quả quét và hai
-- hàm. Nó KHÔNG hoàn tác những bản sửa đã áp dụng vào `answers`/`questions` —
-- những bản sửa đó là quyết định của người duyệt, và giá trị cũ nằm ở cột
-- `question_audit_findings.gia_tri_cu`.
--
-- => Nếu cần lần lại các bản sửa đã áp, XUẤT dữ liệu ra trước khi chạy file này:
--
--   SELECT question_id, ket_luan, de_xuat_dap_an, de_xuat_loi_giai, gia_tri_cu,
--          xu_ly_boi, xu_ly_luc
--     FROM public.question_audit_findings
--    WHERE trang_thai = 'da_ap_dung';

BEGIN;

DROP FUNCTION IF EXISTS public.apply_question_audit_finding(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.question_audit_affected_attempts(text);

-- CASCADE trên `runs` cuốn theo `findings` qua khoá ngoại; vẫn xoá tường minh
-- bảng con trước cho rõ ý.
DROP TABLE IF EXISTS public.question_audit_findings;
DROP TABLE IF EXISTS public.question_audit_runs;

COMMIT;
