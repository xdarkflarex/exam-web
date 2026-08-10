-- =====================================================================
-- NHÁNH SGK CHO LÝ THUYẾT — BẢN GỘP, CHẠY MỘT LẦN
-- =====================================================================
--
-- File này THAY THẾ hai file trước:
--   docs/sql/20260809_nhanh_sgk_cho_ly_thuyet.sql
--   docs/sql/20260809b_chuyen_3_bai_cu_sang_sgk.sql
-- Đừng chạy hai file đó nữa.
--
-- VÌ SAO PHẢI VIẾT LẠI
-- Hai file trước mở `BEGIN;` nhưng để `COMMIT;` ở dạng chú thích, chờ người
-- chạy đọc hậu kiểm rồi tự bỏ comment. Supabase SQL Editor chạy hết script mà
-- không gặp `COMMIT` thì HUỶ TOÀN BỘ — nên câu `select count(*)` trả về 8 chỉ
-- là kết quả bên trong transaction chưa chốt, và sau đó mọi thứ biến mất.
-- Triệu chứng: "Key (category_id)=(sgk-l12-c01) is not present in table
-- categories". Đây là lỗi thiết kế của file cũ, không phải lỗi người chạy.
--
-- Bản này không dùng transaction tường minh. Mọi lệnh đều idempotent
-- (`ON CONFLICT DO NOTHING`, `UPDATE ... WHERE`), nên chạy lại nhiều lần vẫn
-- an toàn và không nhân bản dữ liệu.
--
-- =====================================================================
-- PHẦN 1 — BA TOPIC = BA LỚP
-- =====================================================================
-- Prefix 'sgk-' để tách hẳn khỏi topic của ngân hàng câu hỏi (Đại số, Giải
-- tích, Hình học...). Topic ở nhánh này mang nghĩa LỚP, nhờ đó lý thuyết có
-- chỗ lưu lớp — thứ trước nay không được mô hình hoá — mà không phải đụng
-- `profiles.grade` (đang dính vấn đề phân quyền thi).

INSERT INTO public.topics (id, name, description, order_index) VALUES
  ('sgk-lop10', 'Toán 10', 'Lý thuyết theo sách giáo khoa lớp 10', 110),
  ('sgk-lop11', 'Toán 11', 'Lý thuyết theo sách giáo khoa lớp 11', 111),
  ('sgk-lop12', 'Toán 12', 'Lý thuyết theo sách giáo khoa lớp 12', 112)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- PHẦN 2 — TÁM CHƯƠNG
-- =====================================================================
-- Khớp 1:1 với thư mục trong HethongtrithucToanTHPT/chapters.
-- Tên chương do khôi phục dấu từ tên thư mục — đọc lại một lượt, chúng hiện
-- thẳng lên màn hình học sinh.

INSERT INTO public.categories (id, topic_id, name, order_index) VALUES
  ('sgk-l10-c01', 'sgk-lop10', 'Chương 1. Mệnh đề và tập hợp', 1),
  ('sgk-l10-c02', 'sgk-lop10', 'Chương 2. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 2),
  ('sgk-l11-c01', 'sgk-lop11', 'Chương 1. Hàm số lượng giác và phương trình lượng giác', 1),
  ('sgk-l11-c02', 'sgk-lop11', 'Chương 2. Dãy số. Cấp số cộng và cấp số nhân', 2),
  ('sgk-l12-c01', 'sgk-lop12', 'Chương 1. Ứng dụng đạo hàm', 1),
  ('sgk-l12-c02', 'sgk-lop12', 'Chương 2. Vectơ và hệ trục toạ độ trong không gian', 2),
  ('sgk-l12-c03', 'sgk-lop12', 'Chương 3. Thống kê', 3),
  -- Phụ lục: kiến thức nền lớp dưới. Gom riêng để phần ôn lại nền tảng không
  -- chen ngang các chương chính của lớp 12.
  ('sgk-l12-pl',  'sgk-lop12', 'Phụ lục. Kiến thức nền', 90)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- PHẦN 3 — BA BÀI CHO 3 THEORY ĐÃ SOẠN TỪ THÁNG 6
-- =====================================================================
-- Ba theory này đang gắn vào section 'b18c1975-...' ("Tính đơn điệu và cực trị
-- của hàm số") — kiểu RỔ GỘP của taxonomy câu hỏi cũ, một section chứa nhiều
-- bài. Tên của chúng khớp thẳng với 3 file trong chuong01-ung-dung-dao-ham.
--
-- order_index đặt theo đúng số bài trong SGK (1, 3, 4) để chương hiện đúng
-- thứ tự kể cả khi bài 2 được nạp sau.

INSERT INTO public.sections (id, name, category_id, topic_id, order_index) VALUES
  ('sgk-l12-c01-bai01', 'Bài 1. Ôn tập đạo hàm',                                 'sgk-l12-c01', 'sgk-lop12', 1),
  ('sgk-l12-c01-bai03', 'Bài 3. Cực trị của hàm số',                             'sgk-l12-c01', 'sgk-lop12', 3),
  ('sgk-l12-c01-bai04', 'Bài 4. Giá trị lớn nhất, giá trị nhỏ nhất của hàm số',  'sgk-l12-c01', 'sgk-lop12', 4)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- PHẦN 4 — CHUYỂN 3 THEORY CŨ SANG NHÁNH SGK
-- =====================================================================
-- Chỉ đổi `section_id`. Không đụng title/content_md/slug/created_at, nên giữ
-- nguyên nội dung, đánh giá sao và ngày tạo tháng 6.
--
-- AN TOÀN: `question_knowledge_links` nối theo `theory_id`, KHÔNG theo
-- `section_id` — nên việc chuyển này không làm đứt liên kết câu hỏi nào.

UPDATE public.theories SET section_id = 'sgk-l12-c01-bai01'
  WHERE id = 'd9365410-eb48-4351-ac6f-1522d4f73b04';   -- ÔN TẬP ĐẠO HÀM

UPDATE public.theories SET section_id = 'sgk-l12-c01-bai03'
  WHERE id = 'd880b731-d9f4-46c1-8e05-3099c77a418a';   -- CỰC TRỊ CỦA HÀM SỐ

UPDATE public.theories SET section_id = 'sgk-l12-c01-bai04'
  WHERE id = '522d6e67-fe21-49a9-9a67-fc9081af1f3d';   -- GIÁ TRỊ LỚN NHẤT, NHỎ NHẤT

-- =====================================================================
-- PHẦN 5 — HẬU KIỂM
-- =====================================================================
-- Chạy xong, đọc bảng cuối cùng. Phải thấy ĐÚNG 3 dòng, cột `chuong` đều là
-- "Chương 1. Ứng dụng đạo hàm". Nếu ra 0 dòng thì có gì đó chưa vào — báo lại
-- kèm thông báo lỗi.

SELECT
  c.name  AS chuong,
  s.name  AS bai,
  t.title AS ten_ly_thuyet,
  s.order_index AS thu_tu
FROM public.theories t
JOIN public.sections   s ON s.id = t.section_id
JOIN public.categories c ON c.id = s.category_id
WHERE c.id = 'sgk-l12-c01'
ORDER BY s.order_index;

-- =====================================================================
-- SAU KHI CHẠY XONG — NẠP 4 FILE CÒN THIẾU
-- =====================================================================
-- /admin/theories/import
--   -> tab "Import LaTeX"
--   -> nút "Chọn chương — tự tạo bài theo file"
--   -> Toán 12 > Chương 1. Ứng dụng đạo hàm
--   -> chọn ĐÚNG 4 file:
--        bai02-tinh-don-dieu-cua-ham-so.tex
--        bai05-duong-tiem-can-cua-do-thi-ham-so.tex
--        bai06-khao-sat-su-bien-thien-va-ve-do-thi-ham-so.tex
--        bai07-ung-dung-dao-ham-giai-bai-toan-thuc-te.tex
--
-- KHÔNG chọn bai01-on-tap-dao-ham.tex, bai01-on-tap-dao-ham-chuan.tex,
-- bai03-cuc-tri-cua-ham-so.tex, bai04-gia-tri-lon-nhat-nho-nhat.tex —
-- bốn file này đã có theory tương ứng ở Phần 4, nạp lại sẽ tạo bài trùng.
