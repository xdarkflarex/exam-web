-- 20260810_essay_uploads_purge.sql
--
-- Thêm `purged_at` để job TTL đánh dấu "tệp đã dọn, metadata giữ lại".
--
-- VÌ SAO CẦN MỘT CỘT RIÊNG, KHÔNG TÁI DÙNG `deleted_at`. Hai việc này khác nhau
-- về ý nghĩa và về ai chịu trách nhiệm:
--
--   `deleted_at`  = NGƯỜI bỏ ảnh đi (học sinh trong giờ thi, hoặc admin). Ảnh
--                   không thuộc bài làm nữa, nên worker không tính nó và UI
--                   không hiện nó.
--   `purged_at`   = HỆ THỐNG dọn tệp sau 12 tháng. Ảnh VẪN thuộc bài làm — nó
--                   chỉ không còn xem được. Metadata (hash, kích thước, thời
--                   điểm) giữ vĩnh viễn, nên vẫn chứng minh được "bài này đã
--                   chấm trên ảnh có hash X".
--
-- Gộp hai thứ này vào `deleted_at` sẽ làm hồ sơ nói sai: một bài đã chấm bằng ảnh
-- sẽ trông như học sinh chưa từng nộp ảnh nào. Với `ESSAY_AI_AUTO_FINALIZE=true`
-- thì đó đúng là thông tin cần nhất khi có tranh chấp điểm cũ.
--
-- Còn một lý do kỹ thuật: `deleted_at` đi kèm CHECK đòi `deleted_by` khác NULL
-- (`essay_answer_uploads_delete_pair` của 20260809), và job TTL không phải một
-- người nên không có uuid để điền.
--
-- PHẠM VI. Một cột nullable + một index + nới trigger cho đúng một trường hợp.
-- Không đổi dữ liệu, không đổi quyền, không chạm bucket.
--
-- PREFLIGHT:  supabase/preflight/20260810_essay_uploads_purge_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260810_essay_uploads_purge_postflight.sql
-- ROLLBACK:   supabase/rollback/20260810_essay_uploads_purge_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.essay_answer_uploads') IS NULL THEN
    RAISE EXCEPTION 'CHAY_SAI_THU_TU: chưa áp 20260809_essay_answer_uploads.sql'
      USING DETAIL =
        'Migration này thêm cột vào bảng do 20260809 tạo. Áp 20260809 trước.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Cột
-- ---------------------------------------------------------------------------

ALTER TABLE public.essay_answer_uploads
  ADD COLUMN IF NOT EXISTS purged_at timestamptz;

COMMENT ON COLUMN public.essay_answer_uploads.purged_at IS
  'Thời điểm job TTL xoá tệp khỏi Storage. Metadata giữ lại vĩnh viễn để vẫn '
  'chứng minh được bài đã chấm trên ảnh nào. Khác deleted_at: đó là người bỏ ảnh, '
  'đây là hệ thống dọn tệp — ảnh vẫn thuộc bài làm.';

-- Đường truy vấn của job TTL: "ảnh quá hạn mà tệp chưa dọn".
CREATE INDEX IF NOT EXISTS essay_answer_uploads_purge_idx
  ON public.essay_answer_uploads (created_at)
  WHERE purged_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Nới trigger cho đúng một trường hợp
-- ---------------------------------------------------------------------------
--
-- Trigger của `20260809` chặn mọi UPDATE khi attempt không còn `in_progress`,
-- trừ khi người gọi là admin hoặc `auth.uid()` là NULL (service_role). Job TTL
-- chạy bằng service_role nên nó ĐÃ qua được cổng đó.
--
-- Nhưng còn một bất biến phải thêm: `purged_at` chỉ được đặt MỘT LẦN và không
-- được xoá. Bỏ nó về NULL sẽ nói rằng tệp còn xem được trong khi nó đã bị xoá
-- khỏi Storage, và UI sẽ hiện ảnh lỗi thay vì "đã hết hạn lưu".
--
-- `CREATE OR REPLACE` hàm của 20260809: giữ nguyên toàn bộ thân cũ, thêm đúng
-- một khối. Chép lại cả hàm là bắt buộc — Postgres không có cách nào thêm một
-- câu lệnh vào giữa một hàm đã tồn tại.
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

    -- Ảnh mới không thể đã bị dọn. Chặn ở đây để không ai chèn sẵn một dòng
    -- "đã hết hạn" nhằm làm ảnh biến mất khỏi UI mà vẫn còn tệp trên Storage.
    IF NEW.purged_at IS NOT NULL THEN
      RAISE EXCEPTION 'UPLOAD_PURGED_ON_INSERT: ảnh mới không được có purged_at';
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
        'Chỉ status, page_index, deleted_at, deleted_by, purged_at được đổi. Ảnh '
        || 'khác thì thêm dòng mới rồi xoá mềm dòng cũ — như vậy còn dấu vết.';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'UPLOAD_UNDELETE_FORBIDDEN: không phục hồi ảnh đã xoá'
      USING DETAIL = 'Cần phục hồi thì chạy SQL bằng kết nối chủ sở hữu, có chủ đích.';
  END IF;

  -- MỚI Ở 20260810. Dọn tệp là việc một chiều: tệp đã xoá khỏi Storage thì không
  -- dựng lại được, nên gỡ dấu chỉ làm hồ sơ nói sai.
  IF OLD.purged_at IS NOT NULL AND NEW.purged_at IS NULL THEN
    RAISE EXCEPTION 'UPLOAD_UNPURGE_FORBIDDEN: không gỡ dấu đã dọn tệp'
      USING DETAIL =
        'Tệp đã bị xoá khỏi Storage và không dựng lại được. Gỡ purged_at sẽ khiến '
        || 'UI hiện ảnh lỗi thay vì "đã hết hạn lưu".';
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
-- 3. Tự kiểm trong transaction
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'essay_answer_uploads'
      AND column_name = 'purged_at'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'THIEU_COT: purged_at không tồn tại hoặc bị NOT NULL'
      USING DETAIL = 'Ảnh còn xem được phải có purged_at NULL, nên cột phải nullable.';
  END IF;

  -- Trigger phải còn gắn. `CREATE OR REPLACE FUNCTION` không gỡ trigger, nhưng
  -- kiểm để một lần chạy sai thứ tự không đi qua im lặng.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.essay_answer_uploads')
      AND tgname = 'essay_answer_uploads_guard_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'THIEU_TRIGGER: essay_answer_uploads_guard_trg không còn gắn';
  END IF;

  -- Quyền không được đổi. Migration này không grant gì; nếu `DELETE` xuất hiện
  -- thì có ai đó đã chạy thứ khác giữa hai migration.
  IF has_table_privilege('service_role', 'public.essay_answer_uploads', 'DELETE')
     OR has_table_privilege('authenticated', 'public.essay_answer_uploads', 'DELETE') THEN
    RAISE EXCEPTION 'QUYEN_XOA_XUAT_HIEN: bảng này chỉ xoá mềm'
      USING DETAIL = 'Kiểm lại ai đã grant DELETE sau khi 20260809 chạy.';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
--
-- Job dọn: `POST /api/essay-ai/uploads-ttl` (bearer `CRON_SECRET`), gọi theo lịch
-- hàng ngày. Nó xoá tệp của ảnh cũ hơn `ESSAY_UPLOAD_TTL_DAYS` (mặc định 365) rồi
-- đặt `purged_at`. Thứ tự đó cố ý: xoá tệp trước, đánh dấu sau — nếu đổi ngược
-- thì một lần lỗi giữa hai bước để lại dòng "đã dọn" mà tệp còn nằm đó, tức là
-- dung lượng không bao giờ được thu hồi và không ai biết.
--
-- Chưa có ảnh nào tới hạn cho tới khoảng 2027-08 (ảnh đầu tiên là 2026-08). Job
-- vì thế chưa xoá gì trong năm đầu; gọi nó sớm là vô hại và xác nhận được đường
-- ống chạy đúng khi chưa có gì để mất.
