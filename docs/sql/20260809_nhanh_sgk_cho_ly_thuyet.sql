-- =====================================================================
-- Nhánh SGK cho lý thuyết — phương án B (chốt ngày 2026-08-09)
-- =====================================================================
--
-- MỤC ĐÍCH
-- Tạo một nhánh taxonomy RIÊNG cho lý thuyết, hình dạng bám sách giáo khoa
-- (lớp → chương → bài), để cây kỹ năng hiện đúng cái tên học sinh thấy trong
-- sách. Ngân hàng câu hỏi KHÔNG bị đụng tới.
--
-- VÌ SAO CẦN
-- `topics/categories/sections` hiện có là taxonomy của NGÂN HÀNG CÂU HỎI, không
-- phải SGK. Kiểm ngày 2026-08-09: "Bài tập tổng hợp (TN Đúng / Sai)" xuất hiện
-- làm `section` dưới nhiều `category` khác nhau — đó là rổ phân loại câu hỏi.
-- Nạp lý thuyết vào đó thì cây kỹ năng sẽ hiện "Bài tập tổng hợp" thay vì
-- "Bài 2. Tính đơn điệu của hàm số", đúng thứ chủ dự án lo cho học sinh yếu.
--
-- LỢI ÍCH KÈM THEO
-- `topic` ở đây là LỚP, nên lý thuyết có chỗ lưu lớp — thứ trước nay không được
-- mô hình hoá ở nhánh `theories` (xem docs/DESIGN_OVERHAUL_2026-08-09.md).
-- Không đụng `profiles.grade`, nên không chạm vào chuyện phân quyền thi.
--
-- =====================================================================
-- TRƯỚC KHI CHẠY — ĐỌC HẾT PHẦN NÀY
-- =====================================================================
--
-- 1. File này CHƯA được chạy. Nó là bản đề xuất để chủ dự án soát rồi tự chạy.
--
-- 2. TÊN CHƯƠNG bên dưới do tôi khôi phục dấu tiếng Việt từ tên thư mục
--    (`chuong01-ung-dung-dao-ham` → "Chương 1. Ứng dụng đạo hàm"). Đây là tên
--    chương SGK chuẩn nên khả năng sai thấp, NHƯNG hãy đọc lại một lượt —
--    chúng sẽ hiện thẳng lên giao diện học sinh.
--
-- 3. KHÔNG tạo sẵn `sections` (bài) ở đây. Tiêu đề bài thật nằm trong file
--    `.tex` và do parser đọc lúc nhập; tôi tạo sẵn thì sẽ có hai nguồn tên
--    lệch nhau. Tạo bài ở bước 2 (xem cuối file).
--
-- 4. Chạy trong transaction. Nếu số dòng không như mong đợi thì ROLLBACK.
--
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Ba topic = ba lớp. Prefix `sgk-` để không lẫn với topic của câu hỏi.
-- ---------------------------------------------------------------------
INSERT INTO public.topics (id, name, description, order_index) VALUES
  ('sgk-lop10', 'Toán 10', 'Lý thuyết theo sách giáo khoa lớp 10', 110),
  ('sgk-lop11', 'Toán 11', 'Lý thuyết theo sách giáo khoa lớp 11', 111),
  ('sgk-lop12', 'Toán 12', 'Lý thuyết theo sách giáo khoa lớp 12', 112)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Tám chương, khớp 1:1 với thư mục trong
--    D:\ToanTHPT\LATEX\HethongtrithucToanTHPT\chapters
-- ---------------------------------------------------------------------
INSERT INTO public.categories (id, topic_id, name, order_index) VALUES
  -- Lớp 10
  ('sgk-l10-c01', 'sgk-lop10', 'Chương 1. Mệnh đề và tập hợp', 1),
  ('sgk-l10-c02', 'sgk-lop10', 'Chương 2. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 2),
  -- Lớp 11
  ('sgk-l11-c01', 'sgk-lop11', 'Chương 1. Hàm số lượng giác và phương trình lượng giác', 1),
  ('sgk-l11-c02', 'sgk-lop11', 'Chương 2. Dãy số. Cấp số cộng và cấp số nhân', 2),
  -- Lớp 12
  ('sgk-l12-c01', 'sgk-lop12', 'Chương 1. Ứng dụng đạo hàm', 1),
  ('sgk-l12-c02', 'sgk-lop12', 'Chương 2. Vectơ và hệ trục toạ độ trong không gian', 2),
  ('sgk-l12-c03', 'sgk-lop12', 'Chương 3. Thống kê', 3),
  -- Phụ lục: kiến thức nền lớp dưới, gom riêng để không lẫn vào chương chính.
  -- Đây chính là chỗ dành cho phần "ôn lại nền tảng lớp 10/11" mà chủ dự án lo.
  ('sgk-l12-pl', 'sgk-lop12', 'Phụ lục. Kiến thức nền', 90)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Hậu kiểm. Cả hai phải trả đúng số dưới đây, nếu không thì ROLLBACK.
-- ---------------------------------------------------------------------
-- Mong đợi: 3
SELECT count(*) AS so_topic_sgk FROM public.topics WHERE id LIKE 'sgk-%';
-- Mong đợi: 8
SELECT count(*) AS so_chuong_sgk FROM public.categories WHERE id LIKE 'sgk-%';

-- Đọc số xong: đúng thì COMMIT, sai thì ROLLBACK.
-- COMMIT;
-- ROLLBACK;

-- =====================================================================
-- BƯỚC 2 — TẠO BÀI (sections), LÀM SAU KHI BƯỚC 1 ĐÃ COMMIT
-- =====================================================================
--
-- 30 file .tex trong `chapters/`, phân bố:
--   lop10/chuong01  2 bài      lop12/chuong01  8 bài  (có 1 file trùng, xem dưới)
--   lop10/chuong02  2 bài      lop12/chuong02  4 bài
--   lop11/chuong01  4 bài      lop12/chuong03  3 bài
--   lop11/chuong02  4 bài      lop12/phu-luc   3 bài
--
-- CẢNH BÁO FILE TRÙNG: `chuong01-ung-dung-dao-ham` có CẢ HAI
--   bai01-on-tap-dao-ham.tex
--   bai01-on-tap-dao-ham-chuan.tex
-- Chỉ nạp MỘT. Nạp cả hai là có hai node "Ôn tập đạo hàm" cạnh nhau trên cây.
--
-- Trang `/admin/theories/import` hiện chỉ ĐỌC `categories`/`sections`, không tạo
-- mới (đã kiểm: chỉ có `.select()`, không có `.insert()`). Nên có hai đường:
--
--   (a) Tạo `sections` bằng SQL trước, lấy tên bài đúng như trong file .tex.
--   (b) Nhờ tôi thêm khả năng "tạo bài mới ngay khi nhập" vào trang import —
--       an toàn hơn vì tên bài lấy thẳng từ parser, không phải gõ tay hai lần.
--
-- Đề nghị (b): nó bỏ hẳn nguy cơ tên bài trong taxonomy lệch với tiêu đề
-- lý thuyết, và bạn không phải soạn thêm 30 dòng INSERT.
