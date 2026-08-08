-- 20260809_essay_answer_uploads_rollback.sql
--
-- ĐỌC HẾT PHẦN NÀY TRƯỚC KHI CHẠY. File này XOÁ DỮ LIỆU, khác hẳn rollback của
-- 20260808 (chỉ đổi ACL).
--
-- CÁI GÌ MẤT VĨNH VIỄN:
--
--   1. Mọi dòng `essay_answer_uploads` — metadata của ảnh bài làm: đường dẫn,
--      hash, ai xoá lúc nào. Đây là chuỗi bằng chứng của mọi bài đã chấm bằng
--      ảnh kể từ khi migration chạy.
--   2. Mọi giá trị `essay_ocr_snapshots.upload_id` — sau rollback, không còn
--      biết snapshot nào đọc ảnh nào. Bảng snapshot append-only nên các dòng
--      còn nguyên, nhưng liên kết tới ảnh thì mất và không dựng lại được.
--   3. File ảnh trong bucket thì file này KHÔNG xoá (xem mục 4 bên dưới), nhưng
--      sau khi mất metadata thì chúng thành file mồ côi: còn tốn dung lượng, và
--      không còn cách nào biết file nào của bài nào.
--
-- VÌ SAO GẦN NHƯ LUÔN LÀ QUYẾT ĐỊNH SAI. Migration 20260809 chỉ THÊM: một
-- bucket, một bảng, một cột nullable, mấy policy. Nó không sửa hàm chấm, không
-- đổi dữ liệu cũ, không chạm `student_answers`. Luồng nộp bài và luồng chấm chạy
-- y như trước cho tới khi source được sửa để dùng bảng này. Nghĩa là: nếu có gì
-- hỏng sau khi áp, nguyên nhân gần như chắc chắn ở chỗ khác.
--
-- MUỐN DỪNG TÍNH NĂNG THÌ ĐỪNG DÙNG FILE NÀY. Cách đúng, không mất gì:
--   - Tắt nút chụp ảnh ở UI, hoặc
--   - Đặt `ESSAY_AI_ENABLED=false` (dừng cả OCR và chấm), hoặc
--   - `UPDATE storage.buckets SET file_size_limit = 1 WHERE id = 'essay-uploads';`
--     để chặn upload mới mà giữ nguyên ảnh cũ.
--
-- CHỈ chạy file này khi thật sự cần gỡ hẳn cấu trúc, và đã sao lưu:
--
--   CREATE TABLE backup_20260809.essay_answer_uploads AS
--     SELECT * FROM public.essay_answer_uploads;
--   CREATE TABLE backup_20260809.snapshot_upload_link AS
--     SELECT id, upload_id FROM public.essay_ocr_snapshots WHERE upload_id IS NOT NULL;
--
-- (Tạo schema trước: `CREATE SCHEMA IF NOT EXISTS backup_20260809;`)

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn — buộc người chạy nhìn thấy con số mình đang xoá
-- ---------------------------------------------------------------------------
--
-- Rollback im lặng xoá dữ liệu là cách tệ nhất để một quyết định sai trở thành
-- không cứu được. Cổng này raise khi có dữ liệu thật mà chưa có bản sao lưu.

DO $$
DECLARE
  v_so_upload integer := 0;
  v_so_link   integer := 0;
BEGIN
  IF to_regclass('public.essay_answer_uploads') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.essay_answer_uploads' INTO v_so_upload;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'essay_ocr_snapshots'
      AND column_name = 'upload_id'
  ) THEN
    EXECUTE 'SELECT COUNT(*) FROM public.essay_ocr_snapshots WHERE upload_id IS NOT NULL'
      INTO v_so_link;
  END IF;

  IF (v_so_upload > 0 OR v_so_link > 0)
     AND to_regclass('backup_20260809.essay_answer_uploads') IS NULL THEN
    RAISE EXCEPTION
      'CHUA_SAO_LUU: sắp xoá % dòng ảnh và % liên kết snapshot', v_so_upload, v_so_link
      USING DETAIL =
        'Tạo backup_20260809.essay_answer_uploads trước (câu lệnh ở đầu file). '
        || 'Nếu thật sự muốn xoá không sao lưu, tạo một bảng rỗng cùng tên để '
        || 'vượt cổng này — làm vậy là quyết định có ý thức, không phải sơ suất.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Policy trên storage.objects
-- ---------------------------------------------------------------------------
--
-- Gỡ trước bảng: policy tham chiếu `public.exam_attempts` và `public.profiles`,
-- không tham chiếu bảng bị xoá, nên thứ tự không bắt buộc — nhưng gỡ quyền
-- trước khi gỡ dữ liệu là thói quen đúng.

DROP POLICY IF EXISTS essay_uploads_student_read ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_write ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_delete ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_admin_read ON storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Cột nối snapshot
-- ---------------------------------------------------------------------------
--
-- Phải gỡ TRƯỚC khi DROP bảng uploads: cột này có FK trỏ tới nó. Không gỡ thì
-- câu DROP TABLE ở mục 3 đổ, hoặc phải dùng CASCADE và CASCADE sẽ âm thầm gỡ
-- thêm những thứ không liệt kê ở đây.
--
-- Bảng snapshot là append-only đối với service_role, nhưng ALTER TABLE là DDL
-- của chủ sở hữu nên chạy được. Các dòng snapshot KHÔNG bị xoá, chỉ mất cột.
ALTER TABLE public.essay_ocr_snapshots DROP COLUMN IF EXISTS upload_id;

-- Index có `WHERE upload_id IS NOT NULL` nên đã bị xoá cùng cột. Câu dưới đây
-- là để đủ ý định, không phải vì cần thiết.
DROP INDEX IF EXISTS public.essay_ocr_snapshots_upload_idx;

-- ---------------------------------------------------------------------------
-- 3. Bảng metadata, trigger và hàm
-- ---------------------------------------------------------------------------
--
-- DROP TABLE tự gỡ policy, index, constraint và trigger của bảng. Hàm thì không
-- — nó nằm ở `public`, không thuộc bảng.

DROP TABLE IF EXISTS public.essay_answer_uploads;
DROP FUNCTION IF EXISTS public.essay_answer_uploads_guard();

-- ---------------------------------------------------------------------------
-- 4. Bucket — CỐ Ý KHÔNG XOÁ
-- ---------------------------------------------------------------------------
--
-- `DELETE FROM storage.buckets WHERE id = 'essay-uploads'` đổ nếu bucket còn
-- object, và nếu ép xoá thì mất toàn bộ ảnh bài làm — thứ mà cả migration này
-- sinh ra để giữ. Rollback cấu trúc không được kèm huỷ hồ sơ học sinh.
--
-- Bucket ở lại private, không policy nào, nên không ai qua PostgREST đọc được:
-- an toàn khi để đó. Muốn xoá hẳn thì làm bằng tay, sau khi đã tự trả lời được
-- "những ảnh này có còn cần cho tranh chấp điểm nào không":
--
--   DELETE FROM storage.objects WHERE bucket_id = 'essay-uploads';
--   DELETE FROM storage.buckets WHERE id = 'essay-uploads';

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Source phải quay về trạng thái không dùng bảng này, nếu không mọi lần chụp
-- ảnh sẽ lỗi:
--
--   - `POST /api/essay-ai/upload-url` phải trả 503 hoặc bị gỡ.
--   - `POST /api/essay-ai/ocr` quay về nhận base64 trực tiếp.
--   - `fetchOcrProvenance` bỏ phần JOIN sang `essay_answer_uploads`.
--   - UI quay lại câu "Ảnh không được lưu lại" — và lúc đó câu ấy lại đúng.
--
-- Kiểm bằng: chạy lại postflight, mọi dòng `thieu_*` sẽ khác 0 (đúng như mong
-- đợi sau rollback), và `npm test` phải vẫn 0 fail.
