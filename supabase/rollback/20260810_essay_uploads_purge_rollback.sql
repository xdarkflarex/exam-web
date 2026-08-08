-- 20260810_essay_uploads_purge_rollback.sql
--
-- Gỡ `purged_at` và trả hàm trigger về bản `20260809`.
--
-- CÁI GÌ MẤT: giá trị `purged_at` của những ảnh đã bị job TTL dọn. Sau rollback,
-- không còn cách nào biết ảnh nào đã hết hạn lưu và ảnh nào chỉ đang lỗi — UI sẽ
-- hiện ảnh lỗi cho cả hai. Tệp đã xoá khỏi Storage thì rollback KHÔNG dựng lại
-- được; đây chỉ là gỡ dấu, không phải phục hồi.
--
-- Nếu chưa job nào chạy (`purged_at` toàn NULL) thì rollback này không mất gì.
-- Kiểm trước:
--   SELECT COUNT(purged_at) FROM public.essay_answer_uploads;
--
-- MUỐN DỪNG JOB TTL THÌ ĐỪNG DÙNG FILE NÀY. Cách đúng, không mất gì: bỏ lịch gọi
-- `POST /api/essay-ai/uploads-ttl`, hoặc đặt `ESSAY_UPLOAD_TTL_DAYS` rất lớn.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn — không im lặng xoá dấu vết đã dọn
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_da_don integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'essay_answer_uploads'
      AND column_name = 'purged_at'
  ) THEN
    EXECUTE 'SELECT COUNT(purged_at) FROM public.essay_answer_uploads' INTO v_da_don;
  END IF;

  IF v_da_don > 0 AND to_regclass('backup_20260810.purged_marks') IS NULL THEN
    RAISE EXCEPTION 'CHUA_SAO_LUU: % ảnh đã bị dọn tệp, sắp mất dấu', v_da_don
      USING DETAIL =
        'Lưu lại trước: CREATE SCHEMA IF NOT EXISTS backup_20260810; '
        || 'CREATE TABLE backup_20260810.purged_marks AS SELECT id, purged_at '
        || 'FROM public.essay_answer_uploads WHERE purged_at IS NOT NULL;';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Trả hàm trigger về bản 20260809
-- ---------------------------------------------------------------------------
--
-- Phải làm TRƯỚC khi gỡ cột: bản 20260810 của hàm tham chiếu `NEW.purged_at`, và
-- một hàm tham chiếu cột không tồn tại sẽ đổ ở lần INSERT tiếp theo — tức là học
-- sinh không nộp được ảnh nào, và lỗi hiện ra ở chỗ chẳng liên quan gì tới
-- rollback này.
CREATE OR REPLACE FUNCTION public.essay_answer_uploads_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner  uuid;
  v_status text;
  v_role   text;
BEGIN
  SELECT a.student_id, a.status INTO v_owner, v_status
  FROM public.exam_attempts a
  WHERE a.id = NEW.attempt_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND: attempt % không tồn tại', NEW.attempt_id;
  END IF;

  IF NEW.student_id <> v_owner THEN
    RAISE EXCEPTION 'UPLOAD_OWNER_MISMATCH: student_id không khớp chủ attempt'
      USING DETAIL =
        'Đặt student_id = exam_attempts.student_id. Giá trị lệch sẽ khiến policy '
        || 'RLS cấp quyền đọc cho người không phải chủ bài.';
  END IF;

  IF NEW.storage_path <> NEW.attempt_id || '/' || NEW.question_id || '/' || NEW.id::text THEN
    RAISE EXCEPTION 'UPLOAD_PATH_MISMATCH: storage_path không khớp khoá dòng'
      USING DETAIL =
        'Bắt buộc dạng {attempt_id}/{question_id}/{id}. Policy trên '
        || 'storage.objects đọc attempt_id từ đoạn đầu đường dẫn, nên đường dẫn '
        || 'lệch là một đường vòng qua kiểm quyền.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_status <> 'in_progress' THEN
      RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE: bài thi đã kết thúc, không thêm được ảnh'
        USING DETAIL = 'Chỉ attempt ở trạng thái in_progress mới nhận ảnh mới.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id
     OR NEW.attempt_id <> OLD.attempt_id
     OR NEW.question_id <> OLD.question_id
     OR NEW.student_id <> OLD.student_id
     OR NEW.storage_path <> OLD.storage_path
     OR NEW.content_hash <> OLD.content_hash
     OR NEW.byte_size <> OLD.byte_size
     OR NEW.mime_type <> OLD.mime_type
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'UPLOAD_IMMUTABLE: không được sửa danh tính hoặc nội dung ảnh'
      USING DETAIL =
        'Chỉ status, page_index, deleted_at, deleted_by được đổi. Ảnh khác thì '
        || 'thêm dòng mới rồi xoá mềm dòng cũ — như vậy còn dấu vết.';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'UPLOAD_UNDELETE_FORBIDDEN: không phục hồi ảnh đã xoá'
      USING DETAIL = 'Cần phục hồi thì chạy SQL bằng kết nối chủ sở hữu, có chủ đích.';
  END IF;

  IF v_status <> 'in_progress' THEN
    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();

    IF auth.uid() IS NOT NULL AND COALESCE(v_role, '') <> 'admin' THEN
      RAISE EXCEPTION 'ATTEMPT_FROZEN: bài đã nộp, ảnh chỉ được xem'
        USING DETAIL =
          'Học sinh sửa/xoá ảnh chỉ trong lúc attempt còn in_progress. Sau khi '
          || 'nộp, ảnh là bằng chứng của một bài đã chấm.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Gỡ cột và index
-- ---------------------------------------------------------------------------
--
-- Index có `WHERE purged_at IS NULL` nên bị xoá cùng cột; câu DROP INDEX bên dưới
-- là để đủ ý định.
ALTER TABLE public.essay_answer_uploads DROP COLUMN IF EXISTS purged_at;
DROP INDEX IF EXISTS public.essay_answer_uploads_purge_idx;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Source phải quay về trạng thái không dùng cột này, nếu không trang kết quả và
-- màn chấm sẽ lỗi truy vấn:
--
--   - `src/components/EssayAnswerImages.tsx`: bỏ `purged_at` khỏi `.select()` và
--     bỏ nhánh hiển thị "Đã hết hạn lưu".
--   - `src/app/api/essay-ai/uploads-ttl/route.ts`: gỡ route, và bỏ lịch gọi nó.
--
-- Kiểm bằng: `npm run build` phải compiled successfully, và mở một attempt có ảnh
-- để xác nhận khối ảnh vẫn hiện.
