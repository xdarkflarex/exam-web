-- =====================================================================
-- THÊM CHƯƠNG "DÃY SỐ" VÀO CÂY PHÂN LOẠI CŨ
-- =====================================================================
--
-- VẤN ĐỀ (đo trên ngân hàng thật ngày 2026-09-04)
-- Cây phân loại đang dùng có chương "Cấp số cộng" và "Cấp số nhân" dưới chủ đề
-- "Đại số", nhưng KHÔNG có chương "Dãy số". Trong khi đó ngân hàng có 112 câu
-- thuộc mạch này, phần lớn từ bộ đề OCR giữa kì lớp 11 (`GK1-Toan11-CTM-De01`
-- … `De15`).
--
-- Không có chỗ để xếp, chúng bị đẩy đi nơi khác:
--   52 câu → "Tổ hợp và nhị thức Newton"
--   36 câu → "Thống kê liên tục"
--    8 câu → "Lượng giác (Lớp 11)"
--    0 câu → đúng chương
--
-- Sau khi thêm chương này, lớp luật (`src/lib/questions/classify.ts`) tự quyết
-- được các câu "dãy số" thuần — hiện chúng không khớp được nhánh nào nên rơi
-- xuống AI, và AI thì đoán.
--
-- VÌ SAO THÊM VÀO CÂY CŨ CHỨ KHÔNG CHUYỂN SANG CÂY SGK
-- Quyết định của chủ dự án 2026-09-04: giữ cây cũ, vì 1324 câu đã phân loại
-- theo nó và chuyển hết sang cây `sgk-*` là làm lại từ đầu. Hai cây vẫn tồn tại
-- song song — cây cũ cho ngân hàng câu hỏi, cây `sgk-*` cho lý thuyết và
-- `/learn`. Đây là nợ kỹ thuật đã biết, ghi ở `VIEC_DANG_MO.md`.
--
-- BA MỤC CON đặt theo đúng khuôn của hai chương hàng xóm ("Cấp số cộng", "Cấp
-- số nhân"): một mục lý thuyết, một mục Đúng/Sai, một mục vận dụng. Lệch khuôn
-- thì màn chọn câu hiện ba chương cạnh nhau với ba kiểu chia khác nhau.
--
-- CHẠY LẠI ĐƯỢC: dùng `WHERE NOT EXISTS` theo tên, nên chạy hai lần không tạo
-- bản trùng. Id cố định để lần chạy sau vẫn trỏ đúng chỗ.
--
-- HOÀN TÁC:
--   DELETE FROM sections WHERE category_id = 'cat-day-so';
--   DELETE FROM categories WHERE id = 'cat-day-so';
-- Không mất dữ liệu câu hỏi: `question_taxonomy` trỏ tới chương, nên phải gỡ
-- phân loại của các câu đang trỏ vào đây trước khi xoá (FK sẽ chặn nếu còn).

BEGIN;

-- ---------------------------------------------------------------------------
-- TIỀN ĐIỀU KIỆN
-- ---------------------------------------------------------------------------
-- Chủ đề "Đại số" phải tồn tại. Không có nó thì chương mới thành chương mồ côi:
-- `question_taxonomy` sẽ có `category_id` mà `topic_id` trỏ vào hư không, và
-- lớp luật cố ý bỏ qua chương mồ côi (xem `suggestTopics`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.topics WHERE name = 'Đại số') THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: không tìm thấy chủ đề "Đại số"';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- CHƯƠNG
-- ---------------------------------------------------------------------------
-- `order_index = 0` để nó đứng cùng cụm với "Cấp số cộng" (cũng đang 0). Thứ tự
-- trong cụm là tuỳ ý — dữ liệu hiện có đã có ba chương cùng mang 0, nên không
-- đánh số lại ở đây: đổi `order_index` của các chương khác là thay đổi ngoài
-- phạm vi, và nó xáo trộn màn chọn câu mà giáo viên đã quen.
INSERT INTO public.categories (id, topic_id, name, description, order_index)
SELECT
  'cat-day-so',
  t.id,
  'Dãy số',
  'Khái niệm dãy số, số hạng tổng quát, dãy tăng/giảm, dãy bị chặn (Lớp 11)',
  0
FROM public.topics t
WHERE t.name = 'Đại số'
  AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = 'cat-day-so');

-- ---------------------------------------------------------------------------
-- BA MỤC CON
-- ---------------------------------------------------------------------------
-- `topic_id` phải ghi kèm: bảng `sections` giữ cả `category_id` lẫn `topic_id`,
-- và các truy vấn lọc theo chủ đề đọc thẳng cột này chứ không join ngược lên
-- `categories`. Bỏ trống là mục con biến mất khỏi bộ lọc theo chủ đề.
INSERT INTO public.sections (id, category_id, topic_id, name, order_index)
SELECT v.id, 'cat-day-so', c.topic_id, v.name, v.ord
FROM (VALUES
  ('sec-day-so-ly-thuyet', 'Khái niệm dãy số, số hạng tổng quát, cách cho một dãy số (Lý thuyết)', 0),
  ('sec-day-so-dung-sai',  'Bài tập tổng hợp (TN Đúng / Sai)', 1),
  ('sec-day-so-tang-giam', 'Dãy số tăng, dãy số giảm, dãy số bị chặn', 2)
) AS v(id, name, ord)
CROSS JOIN public.categories c
WHERE c.id = 'cat-day-so'
  AND NOT EXISTS (SELECT 1 FROM public.sections s WHERE s.id = v.id);

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT, mọi cột `must_be_zero` phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM public.categories WHERE id = 'cat-day-so') - 1
--                                                        AS must_be_zero_thieu_chuong,
--   (SELECT count(*) FROM public.sections WHERE category_id = 'cat-day-so') - 3
--                                                        AS must_be_zero_thieu_muc_con,
--   (SELECT count(*) FROM public.sections s
--      JOIN public.categories c ON c.id = s.category_id
--     WHERE s.category_id = 'cat-day-so'
--       AND s.topic_id IS DISTINCT FROM c.topic_id)       AS must_be_zero_muc_con_lac_chu_de,
--   (SELECT count(*) FROM public.categories c
--     WHERE c.id = 'cat-day-so'
--       AND NOT EXISTS (SELECT 1 FROM public.topics t WHERE t.id = c.topic_id))
--                                                        AS must_be_zero_chuong_mo_coi;
--
-- Sau đó vào `/admin/questions`, lọc theo chương "Dãy số" — lúc này còn 0 câu.
-- Bước phân loại lại 112 câu là việc riêng, làm bằng tab "Gợi ý AI" trong
-- `BulkTaxonomyDialog`; lớp luật giờ tự quyết được phần lớn nên phần AI phải
-- chạy còn rất ít.
