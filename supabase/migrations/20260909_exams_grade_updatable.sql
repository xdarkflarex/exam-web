-- =====================================================================
-- CHO PHÉP SỬA LỚP CỦA ĐỀ SAU KHI ĐÃ TẠO
-- =====================================================================
--
-- VẤN ĐỀ
-- Chủ dự án muốn đề thi thử chỉ hiện với học sinh lớp 12; lớp 10 và 11 chỉ cần
-- ôn tập, bài tập về nhà và thi học kì. Cột `exams.grade` chính là chỗ để nói
-- điều đó, và bản sửa đi kèm commit này làm cho bộ lọc theo lớp ở
-- `AssessmentListPage` chạy thật (trước nay nó chết vì đọc `profiles.grade`,
-- cột NULL ở 23/24 hồ sơ).
--
-- Nhưng `20260722:3346` grant UPDATE trên `exams` theo DANH SÁCH CỘT ĐÓNG, và
-- `grade` KHÔNG có trong danh sách đó:
--
--   GRANT UPDATE (title, description, duration, start_time, end_time,
--                 max_attempts, show_results_immediately, allow_review,
--                 is_published) ON TABLE public.exams TO authenticated;
--
-- Nên lớp chỉ đặt được đúng một lần, lúc tạo đề. Hai đề đã xuất bản đang mang
-- `grade = NULL` ("Test", "Đề thi thử TN THPT Bãi Cháy lần 1") không có đường
-- nào sửa ngoài việc xoá đi tạo lại — mà tạo lại thì mất hết lượt làm của học
-- sinh đã nộp.
--
-- CÙNG HỌ VỚI LỖI ĐÃ GẶP NGÀY 2026-09-03: thêm `max_attempts` vào câu INSERT làm
-- cả trang tạo đề đứt với "permission denied for table exams", vì cột đó cũng
-- ngoài danh sách. Danh sách cột đóng là một quyết định đúng, nhưng nó đòi mỗi
-- cột mới phải được cấp quyền một cách tường minh. Xem `RUNBOOK.md` mục 9.
--
-- VÌ SAO CHỈ UPDATE, KHÔNG ĐỤNG GÌ KHÁC
-- `grade` đã có trong danh sách INSERT nên trang tạo đề vẫn ghi được như cũ.
-- File này chỉ mở thêm đường SỬA.
--
-- KHÔNG LÀM CHO `scoring_profile`. `20260806` cố ý không grant UPDATE cho cột đó
-- — đổi hồ sơ điểm của đề đã có câu hỏi làm mọi trọng số hiện có thành sai thang.
-- `grade` thì khác hẳn: nó chỉ quyết định AI NHÌN THẤY đề, không đụng tới điểm.
--
-- HOÀN TÁC: `REVOKE UPDATE (grade) ON TABLE public.exams FROM authenticated;`

BEGIN;

GRANT UPDATE (grade) ON TABLE public.exams TO authenticated;

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema = 'public' AND table_name = 'exams'
--       AND column_name = 'grade' AND privilege_type = 'UPDATE'
--       AND grantee = 'authenticated') - 1                    AS must_be_zero_chua_cap_quyen,
--   (SELECT count(*) FROM information_schema.column_privileges
--     WHERE table_schema = 'public' AND table_name = 'exams'
--       AND column_name = 'scoring_profile' AND privilege_type = 'UPDATE'
--       AND grantee = 'authenticated')                        AS must_be_zero_lo_cap_scoring_profile;
--
-- Cột thứ hai là chốt ngược: nếu `scoring_profile` bỗng nhiên UPDATE được thì có
-- ai đó đã nới quá tay, và điểm của các đề cũ đang treo trên một thang có thể bị
-- đổi dưới chân.
--
-- Và một phép kiểm hành vi: mở `/admin/exams/<id>/publish` của một đề đang
-- `grade = NULL`, chọn lớp, bấm Lưu. Không có migration này thì bước đó trả
-- "permission denied for table exams" — và thông báo đó KHÔNG nói cột nào sai.
