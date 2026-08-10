-- =====================================================================
-- Chuyển 3 bài lý thuyết cũ vào nhánh SGK chương 1 lớp 12
-- =====================================================================
--
-- BỐI CẢNH
-- Ba theory dưới đây được soạn từ tháng 6/2026, đang gắn vào section
-- 'b18c1975-e269-4b10-bca5-5fa25de4d9ef' ("Tính đơn điệu và cực trị của hàm
-- số") — một section kiểu RỔ GỘP của taxonomy câu hỏi cũ, dùng chung cho nhiều
-- bài khác nhau, không phải 1 section = 1 bài như SGK.
--
-- Tên của cả ba khớp thẳng với 3 file trong
-- HethongtrithucToanTHPT/chapters/lop12/chuong01-ung-dung-dao-ham/:
--   ÔN TẬP ĐẠO HÀM                                -> bai01-on-tap-dao-ham.tex
--   CỰC TRỊ CỦA HÀM SỐ                            -> bai03-cuc-tri-cua-ham-so.tex
--   GIÁ TRỊ LỚN NHẤT, GIÁ TRỊ NHỎ NHẤT CỦA HÀM SỐ -> bai04-gia-tri-lon-nhat-nho-nhat.tex
--
-- Nếu nạp lại 3 file này qua trang import, sẽ tạo ra 3 theory MỚI trùng nội
-- dung — học sinh thấy hai bài "Cực trị của hàm số" ở hai chỗ khác nhau.
--
-- GIẢI PHÁP: chuyển `section_id` của 3 theory hiện có sang 3 section mới
-- trong nhánh 'sgk-l12-c01' (Chương 1. Ứng dụng đạo hàm), GIỮ NGUYÊN nội
-- dung/đánh giá/ngày tạo. Sau đó KHÔNG nạp lại 3 file trên — chỉ nạp
-- bai02, bai05, bai06, bai07.
--
-- AN TOÀN: `question_knowledge_links` nối theo `theory_id`, không theo
-- `section_id`, nên việc chuyển này không ảnh hưởng liên kết câu hỏi nào.
--
-- =====================================================================
-- TRƯỚC KHI CHẠY
-- =====================================================================
-- Yêu cầu bước 1 (tạo topics/categories nhánh SGK) đã COMMIT — kiểm bằng:
--   select count(*) from categories where id like 'sgk-%';   -- phải ra 8
--
-- Chạy trong transaction. Đọc kỹ hậu kiểm ở cuối trước khi COMMIT.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Ba section mới, đúng vị trí thứ tự bài trong chương (order_index
--    khớp số bài: 01, 03, 04) để chương hiện đúng thứ tự SGK.
-- ---------------------------------------------------------------------
INSERT INTO public.sections (id, name, category_id, topic_id, order_index) VALUES
  ('sgk-l12-c01-bai01', 'Bài 1. Ôn tập đạo hàm',                             'sgk-l12-c01', 'sgk-lop12', 1),
  ('sgk-l12-c01-bai03', 'Bài 3. Cực trị của hàm số',                          'sgk-l12-c01', 'sgk-lop12', 3),
  ('sgk-l12-c01-bai04', 'Bài 4. Giá trị lớn nhất, giá trị nhỏ nhất của hàm số', 'sgk-l12-c01', 'sgk-lop12', 4)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Chuyển 3 theory hiện có sang section mới. Chỉ đổi `section_id`,
--    không đổi title/content_md/slug/created_at — giữ nguyên nội dung
--    và ngày tạo tháng 6.
-- ---------------------------------------------------------------------
UPDATE public.theories SET section_id = 'sgk-l12-c01-bai01'
  WHERE id = 'd9365410-eb48-4351-ac6f-1522d4f73b04';   -- ÔN TẬP ĐẠO HÀM

UPDATE public.theories SET section_id = 'sgk-l12-c01-bai03'
  WHERE id = 'd880b731-d9f4-46c1-8e05-3099c77a418a';   -- CỰC TRỊ CỦA HÀM SỐ

UPDATE public.theories SET section_id = 'sgk-l12-c01-bai04'
  WHERE id = '522d6e67-fe21-49a9-9a67-fc9081af1f3d';   -- GIÁ TRỊ LỚN NHẤT, NHỎ NHẤT

-- ---------------------------------------------------------------------
-- 3. Hậu kiểm. Phải ra đúng 3 dòng, mỗi dòng section_id bắt đầu bằng
--    'sgk-l12-c01-bai'.
-- ---------------------------------------------------------------------
SELECT id, title, section_id FROM public.theories
WHERE id IN (
  'd9365410-eb48-4351-ac6f-1522d4f73b04',
  'd880b731-d9f4-46c1-8e05-3099c77a418a',
  '522d6e67-fe21-49a9-9a67-fc9081af1f3d'
);

-- Đọc kết quả xong: đúng thì COMMIT, sai thì ROLLBACK.
-- COMMIT;
-- ROLLBACK;

-- =====================================================================
-- SAU KHI COMMIT — CHỈ NẠP 4 FILE CÒN LẠI QUA TRANG IMPORT
-- =====================================================================
-- /admin/theories/import -> "Chọn chương — tự tạo bài theo file"
-- -> Toán 12 > Chương 1. Ứng dụng đạo hàm
-- -> chọn 4 file:
--      bai02-tinh-don-dieu-cua-ham-so.tex
--      bai05-duong-tiem-can-cua-do-thi-ham-so.tex
--      bai06-khao-sat-su-bien-thien-va-ve-do-thi-ham-so.tex
--      bai07-ung-dung-dao-ham-giai-bai-toan-thuc-te.tex
--
-- KHÔNG chọn bai01-on-tap-dao-ham.tex, bai01-on-tap-dao-ham-chuan.tex,
-- bai03-cuc-tri-cua-ham-so.tex, bai04-gia-tri-lon-nhat-nho-nhat.tex —
-- bốn file này đã có theory tương ứng, nạp lại sẽ tạo trùng.
--
-- Xong bước này, Chương 1 có đủ 7 bài (01,02,03,04,05,06,07) dưới một
-- nhánh SGK duy nhất.
