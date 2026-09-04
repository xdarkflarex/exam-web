-- =====================================================================
-- HỒ SƠ HỌC SINH: ĐƯA class_id RÁC VỀ KHOÁ LỚP THẬT
-- =====================================================================
--
-- VẤN ĐỀ (chủ dự án phát hiện 2026-09-04)
-- Form đăng ký cũ hỏi "Lớp" bằng một ô CHỮ TỰ DO ("VD: 12A1") và ghi thẳng thứ
-- người dùng gõ vào `profiles.class_id`. Nhưng cột đó là KHOÁ trỏ tới
-- `classes.id`, mà `classes.id` có dạng `class_1781517811246`.
--
-- `profiles.class_id` KHÔNG có FOREIGN KEY sang `classes.id`, nên database nhận
-- tuốt. Đo trên Primary ngày 2026-09-04: 5 hồ sơ mang `"10a1"`, `"12"`, `"9/1"`,
-- `"10"`, `"10A5"` — không giá trị nào trỏ tới lớp nào.
--
-- HỎNG Ở ĐÂU, VÀ VÌ SAO KHÔNG AI THẤY
-- Không có màn hình nào báo lỗi. Nhìn hồ sơ vẫn thấy có lớp. Cái mất là:
--   * bài tập giao theo lớp không tới được học sinh đó —
--     `homework_assignment_recipients` khớp bằng `class_id`;
--   * họ biến mất khỏi bộ lọc lớp ở `/admin/students` và `/admin/analytics`;
--   * `classes.student_count` đếm thiếu.
-- Toàn là hỏng theo kiểu VẮNG MẶT, nên nó không kêu.
--
-- FILE NÀY CHỈ SỬA KHỐI 10, 11, 12 và chỉ khi khối đó CÓ ĐÚNG MỘT lớp. Mọi ca
-- còn lại để nguyên cho người quyết định — xem PHẦN 3.
--
-- KHÔNG THÊM FOREIGN KEY ở đây. Thêm FK là một quyết định khác, đụng cả luồng
-- ghi, và phải làm khi dữ liệu đã sạch — không phải cùng lúc với việc dọn.
-- Xem ghi chú cuối file.
--
-- HOÀN TÁC: giá trị cũ là chữ học sinh tự gõ, không phải khoá. Muốn giữ thì
-- chạy PHẦN 1 và lưu kết quả lại TRƯỚC khi chạy PHẦN 2.

-- ---------------------------------------------------------------------------
-- PHẦN 1 — TIỀN KIỂM. Chạy trước, đọc kỹ, rồi mới chạy PHẦN 2.
-- ---------------------------------------------------------------------------
--
-- Mọi hồ sơ có class_id không trỏ tới lớp nào:
--
-- SELECT p.id, p.full_name, p.class_id, p.grade
-- FROM public.profiles p
-- LEFT JOIN public.classes c ON c.id = p.class_id
-- WHERE p.class_id IS NOT NULL AND c.id IS NULL
-- ORDER BY p.class_id;
--
-- Các lớp hiện có, và khối nào có nhiều hơn một lớp (những khối đó PHẦN 2 bỏ qua):
--
-- SELECT grade, count(*) AS so_lop, string_agg(name, ', ') AS ten_lop
-- FROM public.classes GROUP BY grade ORDER BY grade;

BEGIN;

-- ---------------------------------------------------------------------------
-- PHẦN 2 — ĐỔI class_id RÁC THÀNH KHOÁ THẬT
-- ---------------------------------------------------------------------------
--
-- Suy khối từ chữ học sinh gõ: lấy CỤM SỐ ĐẦU TIÊN. "10a1" -> 10, "12" -> 12,
-- "10A5" -> 10, "9/1" -> 9.
--
-- Vì sao là cụm số đầu tiên chứ không phải "hai ký tự đầu": "9/1" cho ra 9 chứ
-- không phải 9/1 hay 91, và đó là điều cần thiết để nó KHÔNG khớp vào lớp nào
-- rồi bị xếp bừa vào lớp 10.
--
-- Ba điều kiện dưới đây đều là ĐIỀU KIỆN AN TOÀN, không phải chi tiết vụn:
--   * `c.id IS NULL`      — chỉ đụng dòng đang HỎNG, không đụng ai đã có lớp đúng;
--   * khối phải thuộc (10,11,12) — "9/1" tự rơi ra ngoài;
--   * khối phải có ĐÚNG MỘT lớp — hai lớp cùng khối thì không có cách nào biết
--     học sinh thuộc lớp nào, và đoán bừa còn tệ hơn để trống.

WITH lop_duy_nhat AS (
  SELECT grade, min(id) AS class_id
  FROM public.classes
  WHERE grade IN (10, 11, 12)
  GROUP BY grade
  HAVING count(*) = 1
),
can_sua AS (
  SELECT
    p.id AS profile_id,
    (substring(p.class_id FROM '[0-9]+'))::int AS khoi
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.class_id
  WHERE p.class_id IS NOT NULL
    AND c.id IS NULL
    AND p.class_id ~ '[0-9]'
)
UPDATE public.profiles p
SET class_id = l.class_id,
    updated_at = now()
FROM can_sua s
JOIN lop_duy_nhat l ON l.grade = s.khoi
WHERE p.id = s.profile_id;

COMMIT;

-- =====================================================================
-- PHẦN 3 — CÒN LẠI GÌ, VÀ AI QUYẾT
-- =====================================================================
--
-- Chạy lại truy vấn ở PHẦN 1. Dòng nào còn sót là dòng máy KHÔNG được phép tự
-- quyết. Trên dữ liệu ngày 2026-09-04 sẽ còn đúng một ca:
--
--   "9/1" — học sinh lớp 9. Hệ thống chưa có chỗ cho khối 9:
--           `classes.grade` và `profiles.grade` đều CHECK IN (10, 11, 12).
--           Ba đường đi, chọn một, ĐỪNG để nguyên:
--             a) học sinh khai nhầm  -> sửa tay ở `/admin/classes`;
--             b) đúng là lớp 9       -> phải nới hai CHECK và tạo lớp 9 trước,
--                                       đó là một migration riêng;
--             c) chưa quyết          -> đặt `class_id = NULL` để hồ sơ nói thật
--                                       là "chưa có lớp", thay vì mang một khoá
--                                       hỏng trông như đã có lớp.
--
-- =====================================================================
-- HẬU KIỂM — cột phải bằng 0 SAU KHI đã xử lý xong PHẦN 3
-- =====================================================================
--
-- SELECT count(*) AS must_be_zero_class_id_khong_khop
-- FROM public.profiles p
-- LEFT JOIN public.classes c ON c.id = p.class_id
-- WHERE p.class_id IS NOT NULL AND c.id IS NULL;
--
-- Chạy ngay sau PHẦN 2 thì cột này CHƯA về 0 — còn đúng số ca ở PHẦN 3. Đó là
-- đúng, không phải lỗi.
--
-- =====================================================================
-- VỀ FOREIGN KEY — việc còn nợ, cố ý không làm ở đây
-- =====================================================================
--
-- Gốc của lỗi này là `profiles.class_id` không có FK sang `classes.id`. Bản sửa
-- source (form đăng ký giờ là ô CHỌN 10/11/12, server tra ra khoá thật) đóng
-- đường ghi rác đang biết. FK sẽ đóng MỌI đường ghi rác, kể cả đường chưa ai
-- nghĩ ra.
--
-- Chưa thêm ở đây vì ba lý do, và cả ba phải xử trước:
--   1. Dữ liệu chưa sạch — còn ca lớp 9. FK sẽ không tạo được.
--   2. `ON DELETE` phải chọn có chủ ý. Xoá một lớp mà CASCADE là xoá luôn hồ sơ
--      học sinh — tuyệt đối không. Phải là `ON DELETE SET NULL`, khớp với việc
--      `/admin/classes` đã tự gỡ `class_id` trước khi xoá lớp.
--   3. Phải kiểm cả đường ghi của `/admin/classes` và `/api/admin/create-account`
--      dưới ràng buộc mới, bằng JWT thật, trước khi khoá.
