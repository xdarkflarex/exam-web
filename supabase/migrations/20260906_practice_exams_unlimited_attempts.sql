-- =====================================================================
-- ĐỀ ÔN TẬP: MỞ SỐ LƯỢT LÀM THÀNH KHÔNG GIỚI HẠN
-- =====================================================================
--
-- Yêu cầu chủ dự án 2026-09-03, ngay sau khi gỡ đồng hồ đếm ngược khỏi đề ôn tập
-- (`20260905_practice_exams_no_timer.sql`). Cùng một lý lẽ: ôn tập theo chương
-- là để học sinh luyện tới khi chắc, không phải để thi lấy điểm. Chỉ cho làm một
-- lần thì trái với chính mục đích của nó.
--
-- QUY ƯỚC ĐÃ CÓ SẴN, FILE NÀY KHÔNG ĐẶT RA CÁI MỚI
--   `max_attempts = 0` nghĩa là không giới hạn. Đây là quy ước đã dùng từ
--   `20260722` (`start_exam_attempt` chỉ chặn khi
--   `COALESCE(max_attempts, 1) > 0 AND completed >= max_attempts`) và
--   `20260803` (trả `attempts_remaining = NULL` khi không giới hạn).
--   Giao diện học sinh cũng đã đúng: trang chuẩn bị thi bỏ phần "/N lượt" khi
--   `max_attempts <= 0`. Nghĩa là KHÔNG cần đổi một dòng SQL runtime nào —
--   chỉ cần dữ liệu mang đúng giá trị.
--
-- Chỗ hỏng là trang cấu hình, y hệt lỗi `duration` đã sửa ở `20260905`:
-- `setMaxAttempts(data.max_attempts || 1)` nuốt mất số 0, ô nhập đặt `min={1}`
-- nên không gõ 0 vào được, và `handleSave` ghi lại vô điều kiện. Bản sửa source
-- đi kèm commit này chặn đường đó; file này dọn dữ liệu đã ghi.
--
-- PHẠM VI: chỉ `exam_mode = 'practice'`. Không đụng `simulation` — giới hạn lượt
-- của đề thi là ràng buộc thật, và `start_exam_attempt` đọc nó để từ chối lượt
-- làm thứ hai.
--
-- KHÔNG CÓ ĐƯỜNG LÙI theo nghĩa khôi phục số cũ: giá trị cũ hầu hết là DEFAULT 1
-- của cột chứ không phải lựa chọn của giáo viên. Muốn giữ dấu vết thì chạy TIỀN
-- KIỂM và lưu kết quả trước.
--
-- ẢNH HƯỞNG: đây là NỚI LỎNG. Học sinh đã dùng hết lượt ở một đề ôn tập sẽ vào
-- làm lại được. Không lượt làm nào bị xoá, không điểm nào đổi, và không attempt
-- đang dở nào bị đụng tới.

-- ---------------------------------------------------------------------------
-- TIỀN KIỂM — chạy TRƯỚC, xem sẽ đụng vào những đề nào
-- ---------------------------------------------------------------------------
--
-- SELECT id, title, max_attempts, is_published
-- FROM public.exams
-- WHERE exam_mode = 'practice' AND COALESCE(max_attempts, 1) <> 0
-- ORDER BY is_published DESC, title;

BEGIN;

UPDATE public.exams
SET max_attempts = 0
WHERE exam_mode = 'practice'
  AND COALESCE(max_attempts, 1) <> 0;

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT, cả hai cột phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM public.exams
--     WHERE exam_mode = 'practice'
--       AND COALESCE(max_attempts, 1) <> 0)      AS must_be_zero_on_tap_con_gioi_han,
--   (SELECT count(*) FROM public.exams
--     WHERE exam_mode = 'simulation'
--       AND COALESCE(max_attempts, 1) = 0)       AS must_be_zero_de_thi_mat_gioi_han;
--
-- Cột thứ hai là chốt theo hướng ngược lại: đề THI mà không giới hạn lượt nghĩa
-- là câu UPDATE trên đã chạy sai phạm vi, hoặc dữ liệu vốn đã lệch. Cả hai đều
-- phải dừng lại xem — đề thi cho làm lại vô hạn là hỏng cả việc chấm.
--
-- Và một phép kiểm bằng mắt: mở một đề ôn tập ở `/admin/exams/<id>/publish`.
-- Ô "Số lần làm tối đa" phải hiện chữ "Không giới hạn", không phải ô nhập số.
