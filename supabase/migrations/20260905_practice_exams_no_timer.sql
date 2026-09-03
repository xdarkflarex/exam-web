-- =====================================================================
-- ĐỀ ÔN TẬP KHÔNG ĐẾM NGƯỢC — dọn dữ liệu đã bị trang xuất bản ghi đè
-- =====================================================================
--
-- VẤN ĐỀ (chủ dự án phát hiện 2026-09-03)
-- Đề ôn tập theo chương hiện ra như đề thi: có thời gian làm bài tính bằng phút.
-- Ôn tập chỉ cần khung NGÀY để thúc học sinh làm xong, không cần đồng hồ.
--
-- Runtime vốn đã hiểu đúng: `duration = 0` là không giới hạn, và trigger chốt
-- hạn nộp của `20260722` chỉ chạy khi `exam_mode = 'simulation'`. Trang tạo đề
-- cũng ghi đúng 0 cho đề ôn tập.
--
-- Chỗ hỏng là `/admin/exams/[examId]/publish`: nó hiện ô "Thời gian làm bài" cho
-- MỌI đề, prefill bằng `data.duration || 90` (số 0 falsy nên hiện thành 90), rồi
-- ghi `duration: duration` vô điều kiện. Mà muốn xuất bản thì BẮT BUỘC qua trang
-- đó — nên mọi đề ôn tập từng được xuất bản đều đã bị đóng dấu 90 phút, im lặng.
-- Bản sửa source đi kèm commit này chặn đường ghi đó lại; file này dọn phần đã
-- ghi rồi.
--
-- PHẠM VI: chỉ `exam_mode = 'practice'`. Không đụng `simulation` dưới bất kỳ
-- hình thức nào — `duration` của đề thi là ràng buộc thật và trigger server đọc
-- nó để từ chối bài nộp muộn.
--
-- KHÔNG CÓ ĐƯỜNG LÙI, và nói thẳng thay vì giả vờ có: giá trị cũ là rác do lỗi
-- sinh ra, không phải lựa chọn của giáo viên. Muốn giữ dấu vết thì chạy phần
-- TIỀN KIỂM bên dưới và lưu kết quả lại trước.
--
-- ẢNH HƯỞNG TỚI BÀI ĐANG LÀM DỞ: đây là NỚI LỎNG, không phải siết. Học sinh
-- đang làm dở một đề ôn tập bị đóng dấu 90 phút sẽ mất đồng hồ đếm ngược và
-- không còn bị tự động nộp. Không có bài nào bị chấm lại và không có điểm nào
-- đổi.

-- ---------------------------------------------------------------------------
-- TIỀN KIỂM — chạy TRƯỚC, xem sẽ đụng vào những đề nào
-- ---------------------------------------------------------------------------
--
-- SELECT id, title, duration, is_published, start_time, end_time
-- FROM public.exams
-- WHERE exam_mode = 'practice' AND COALESCE(duration, 0) <> 0
-- ORDER BY is_published DESC, title;

BEGIN;

UPDATE public.exams
SET duration = 0
WHERE exam_mode = 'practice'
  AND COALESCE(duration, 0) <> 0;

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT, cả hai cột phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM public.exams
--     WHERE exam_mode = 'practice'
--       AND COALESCE(duration, 0) <> 0)          AS must_be_zero_on_tap_con_dong_ho,
--   (SELECT count(*) FROM public.exams
--     WHERE exam_mode = 'simulation'
--       AND COALESCE(duration, 0) = 0
--       AND is_published)                        AS must_be_zero_de_thi_mat_gio;
--
-- Cột thứ hai là chốt an toàn theo hướng ngược lại: nếu một đề THI đã xuất bản
-- mà `duration = 0` thì hoặc câu UPDATE trên đã chạy sai phạm vi, hoặc dữ liệu
-- vốn đã lệch từ trước. Cả hai trường hợp đều phải dừng lại xem, vì đề thi mất
-- đồng hồ là mất luôn cả phép chặn nộp muộn phía server.
--
-- Và một phép kiểm bằng mắt, không phải bằng SQL: mở một đề ôn tập ở
-- `/admin/exams/<id>/publish`. Phải thấy "Hạn làm bài" với hai ô NGÀY, không
-- thấy ô "Thời gian làm bài (phút)" nào.
