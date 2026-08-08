-- 20260809_essay_answer_uploads.sql
--
-- Lưu ảnh bài làm tự luận: bucket private + bảng metadata + liên kết snapshot.
--
-- VÌ SAO CẦN — hai lý do độc lập, cả hai đều là lỗ hổng chứ không phải tiện ích.
--
-- 1. ẢNH LÀ BẢN GỐC CỦA HỒ SƠ, HIỆN KHÔNG ĐƯỢC LƯU. Luồng hiện tại:
--    `ExamRunner` gửi ảnh base64 tới `POST /api/essay-ai/ocr`, route gọi Gemini,
--    trả text về, rồi **vứt ảnh đi**. Từ giây đó bài làm chỉ còn bản text do máy
--    đọc. Khi phụ huynh hỏi "tại sao con tôi bị trừ điểm câu này", không ai mở
--    được bài viết tay ra đối chiếu — bằng chứng duy nhất là một chuỗi text mà
--    chính hệ thống thừa nhận có thể đọc sai. Với `ESSAY_AI_AUTO_FINALIZE=true`
--    (bật 2026-08-06) thì điểm đó còn được công bố tự động, không ai xem trước.
--
-- 2. XOÁ ẢNH LÀM HỎNG CỔNG OCR, VÀ HỎNG THEO HƯỚNG FAIL-OPEN. Chủ dự án quyết
--    định học sinh được thêm/sửa/xoá ảnh **trong giờ thi**, sau khi nộp chỉ xem.
--    Nhưng `essay_ocr_snapshots` không có liên kết nào tới ảnh, nên sau khi xoá:
--
--      chụp ảnh A mờ (confidence 0,35) -> chụp ảnh B rõ (0,96) -> xoá B -> nộp
--      => bài nộp là text của A, nhưng snapshot của B vẫn nằm đó và vẫn được tính
--
--    `aggregateOcrEvidence` (2026-08-06) đã sửa việc "chỉ đọc snapshot mới nhất"
--    nên nó gộp cả A và B — an toàn hơn, nhưng vẫn sai: nó đánh giá một tấm ảnh
--    KHÔNG CÒN TỒN TẠI. Cột `upload_id` ở mục 6 là thứ đóng lỗ này; worker lọc
--    theo ảnh còn sống thay vì theo thời gian.
--
-- ĐIỂM ĐÓNG BĂNG. Toàn bộ quyền ghi của học sinh kiểm theo
-- `exam_attempts.status = 'in_progress'`, KHÔNG theo vai trò. Trước nộp, ảnh chưa
-- phải hồ sơ nên học sinh làm gì cũng được; sau nộp, ảnh là bằng chứng của một
-- bài đã chấm nên không ai sửa được. Hết giờ mà chưa bấm nộp cũng mất quyền sửa,
-- vì attempt đã đóng — đúng ý muốn.
--
-- KHÔNG CÓ HARD DELETE cho bất kỳ ai qua đường client. Xoá là `deleted_at`. Lý
-- do: dấu vết "đã chụp 5 lần, bỏ 3" là dữ liệu benchmark thật (đo OCR sai bao
-- nhiêu lần trước khi học sinh chấp nhận), và một cú bấm nhầm của admin không
-- được phá bằng chứng chấm điểm của một bài đã công bố.
--
-- PREFLIGHT:  supabase/preflight/20260809_essay_answer_uploads_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260809_essay_answer_uploads_postflight.sql
-- ROLLBACK:   supabase/rollback/20260809_essay_answer_uploads_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn — sai thứ tự phải báo đúng nguyên nhân
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.exam_attempts') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.exam_attempts không tồn tại'
      USING DETAIL = 'Migration này gắn FK vào exam_attempts. Database sai hoặc chưa dựng.';
  END IF;

  IF to_regclass('public.questions') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.questions không tồn tại'
      USING DETAIL = 'Migration này gắn FK vào questions.';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.profiles không tồn tại'
      USING DETAIL = 'Policy admin đọc role từ profiles, giống 20260722.';
  END IF;

  -- Cột `upload_id` ở mục 6 chỉ có nghĩa khi bảng snapshot đã tồn tại.
  IF to_regclass('public.essay_ocr_snapshots') IS NULL THEN
    RAISE EXCEPTION 'CHAY_SAI_THU_TU: chưa áp 20260807_essay_ocr_snapshots.sql'
      USING DETAIL =
        'Mục 6 thêm cột upload_id vào bảng do 20260807 tạo. Áp 20260807 (và '
        || '20260808) trước.';
  END IF;

  -- Storage schema là của Supabase, không phải của dự án. Thiếu nó nghĩa là
  -- đang chạy trên Postgres thuần và mục 1 sẽ đổ với lỗi khó hiểu.
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'KHONG_CO_STORAGE: schema storage của Supabase không tồn tại'
      USING DETAIL =
        'Migration này tạo bucket private và policy trên storage.objects. Trên '
        || 'database không phải Supabase thì phần lưu ảnh phải thiết kế lại.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Bucket private
-- ---------------------------------------------------------------------------
--
-- `public = false` là điều quan trọng nhất của cả file này. Bucket public nghĩa
-- là bất kỳ ai có URL đều tải được ảnh bài làm mà không cần đăng nhập, và URL
-- kiểu đó rò rỉ qua log, lịch sử trình duyệt, ảnh chụp màn hình chia sẻ. Truy
-- cập phải đi qua signed URL ngắn hạn do server cấp sau khi kiểm ownership.
--
-- `file_size_limit` 3 MB: client đã resize về cạnh dài 1600px / JPEG 0.8 (~250
-- KB) trước khi upload, nên 3 MB là mức chặn ảnh chưa qua resize chứ không phải
-- mức dự kiến. Đặt cao hơn là mời gọi 1 GB free tier hết trong một kỳ thi:
-- 30 học sinh x 6 câu x 2 trang x 3 MB = 1,1 GB.
--
-- `allowed_mime_types` lặp lại danh sách của route OCR. Hai lớp kiểm cùng một
-- thứ là có chủ đích: route có thể bị sửa, bucket thì không đổi theo mỗi deploy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'essay-uploads',
  'essay-uploads',
  false,
  3 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- `DO UPDATE` chứ không `DO NOTHING`: nếu bucket đã tồn tại từ một lần thử tay
-- và bị đặt `public = true`, `DO NOTHING` sẽ để nguyên trạng thái rò rỉ và
-- migration vẫn báo thành công. Câu trên ép về đúng trạng thái mong muốn.

-- ---------------------------------------------------------------------------
-- 2. Bảng metadata ảnh
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.essay_answer_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  attempt_id text NOT NULL
    REFERENCES public.exam_attempts(id) ON DELETE CASCADE,

  question_id text NOT NULL
    REFERENCES public.questions(id) ON DELETE CASCADE,

  -- Trùng lặp có chủ đích với `exam_attempts.student_id`. Policy RLS chạy trên
  -- MỌI dòng được đọc, nên bắt nó JOIN sang exam_attempts mỗi lần là đắt và
  -- khiến policy phụ thuộc vào RLS của bảng kia. Trigger ở mục 4 giữ hai bên
  -- không lệch.
  student_id uuid NOT NULL,

  -- Đường dẫn trong bucket: {attempt_id}/{question_id}/{id} — không có đuôi tệp.
  -- Đuôi không mang thông tin nào mà `mime_type` chưa có, và bỏ nó ra làm phép so
  -- trong trigger mục 4 (b) thành một phép nối chuỗi không cần đoán.
  --
  -- UNIQUE vì hai dòng trỏ cùng một object nghĩa là xoá một dòng làm dòng kia
  -- trỏ vào hư không.
  storage_path text NOT NULL UNIQUE,

  mime_type text NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),

  byte_size integer NOT NULL CHECK (byte_size > 0),

  -- SHA-256 của đúng số byte đã nằm trên Storage. Đây là thứ trả lời "ảnh đang
  -- xem có phải ảnh đã chấm hay không" khi có tranh chấp; thiếu nó thì việc lưu
  -- ảnh chỉ chứng minh được "có một ảnh", không chứng minh được "ảnh nào".
  content_hash text NOT NULL,

  -- Thứ tự trang do học sinh sắp, không phải thứ tự upload. Học sinh chụp trang
  -- 2 trước rồi trang 1 là chuyện thường.
  page_index integer NOT NULL DEFAULT 0 CHECK (page_index >= 0),

  -- pending: đã cấp signed URL, chưa xác nhận có byte trên Storage.
  -- stored:  đã có file, chưa OCR.
  -- ocr_done: đã có snapshot tương ứng.
  -- failed:  OCR đổ; ảnh vẫn giữ để giáo viên đọc bằng mắt.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'stored', 'ocr_done', 'failed')),

  -- Xoá mềm. NULL = còn sống. Worker chỉ tính snapshot của ảnh còn sống.
  deleted_at timestamptz,
  -- Ai xoá: học sinh (trong giờ thi) hay admin (bất cứ lúc nào). Không dùng FK
  -- tới profiles: xoá một tài khoản không được phép xoá dấu vết hành động của
  -- tài khoản đó.
  deleted_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Hai trường xoá mềm phải cùng có hoặc cùng không. Một dòng có `deleted_at`
  -- mà không có `deleted_by` là dấu vết vô dụng đúng lúc cần nó nhất.
  CONSTRAINT essay_answer_uploads_delete_pair CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.essay_answer_uploads IS
  'Ảnh bài làm tự luận trên bucket private essay-uploads. Ảnh là bản gốc của hồ '
  'sơ, text OCR là bản dẫn xuất do học sinh xác nhận. Học sinh thêm/xoá được khi '
  'attempt còn in_progress, sau đó chỉ xem; admin toàn quyền nhưng cũng chỉ xoá '
  'mềm. Không có hard delete qua client.';

COMMENT ON COLUMN public.essay_answer_uploads.content_hash IS
  'SHA-256 của byte trên Storage. Chứng minh ảnh đang xem là ảnh đã được chấm.';

-- ---------------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------------

-- Đường truy vấn của trang học sinh: "ảnh của tôi".
CREATE INDEX IF NOT EXISTS essay_answer_uploads_student_idx
  ON public.essay_answer_uploads (student_id, created_at DESC);

-- Đường truy vấn của job TTL: "ảnh cũ hơn 12 tháng còn file trên Storage".
CREATE INDEX IF NOT EXISTS essay_answer_uploads_ttl_idx
  ON public.essay_answer_uploads (created_at)
  WHERE status <> 'pending';

-- Một trang chỉ có một ảnh còn sống. Không UNIQUE toàn phần: dòng đã xoá mềm
-- phải được phép trùng page_index với dòng thay thế nó.
--
-- Index này phục vụ luôn đường truy vấn chính của worker và của UI xem lại
-- ("ảnh còn sống của bài này"), nên không cần thêm index không-unique trên cùng
-- bộ cột với cùng điều kiện WHERE — nó sẽ chỉ là bản trùng phải bảo trì kèm.
CREATE UNIQUE INDEX IF NOT EXISTS essay_answer_uploads_page_uniq
  ON public.essay_answer_uploads (attempt_id, question_id, page_index)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Trigger — bất biến mà RLS không diễn đạt được
-- ---------------------------------------------------------------------------
--
-- RLS quyết định "được thấy dòng nào", không quyết định "giá trị nào hợp lệ".
-- Ba việc dưới đây phải là trigger:
--
--   a. `student_id` phải khớp chủ attempt. Sai giá trị này làm policy của mục 5
--      cấp quyền cho người khác — một dòng có `student_id` của B nhưng
--      `attempt_id` của A khiến B đọc được ảnh của A.
--   b. `storage_path` phải khớp `{attempt_id}/{question_id}/{id}`. Policy
--      storage ở mục 7 kiểm quyền bằng cách đọc attempt_id TỪ đường dẫn, nên
--      đường dẫn không khớp là một đường vòng qua policy đó.
--   c. Sau khi nộp, không sửa gì ngoài xoá mềm.
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

  -- (a)
  IF NEW.student_id <> v_owner THEN
    RAISE EXCEPTION 'UPLOAD_OWNER_MISMATCH: student_id không khớp chủ attempt'
      USING DETAIL =
        'Đặt student_id = exam_attempts.student_id. Giá trị lệch sẽ khiến policy '
        || 'RLS cấp quyền đọc cho người không phải chủ bài.';
  END IF;

  -- (b)
  IF NEW.storage_path <> NEW.attempt_id || '/' || NEW.question_id || '/' || NEW.id::text THEN
    RAISE EXCEPTION 'UPLOAD_PATH_MISMATCH: storage_path không khớp khoá dòng'
      USING DETAIL =
        'Bắt buộc dạng {attempt_id}/{question_id}/{id}. Policy trên '
        || 'storage.objects đọc attempt_id từ đoạn đầu đường dẫn, nên đường dẫn '
        || 'lệch là một đường vòng qua kiểm quyền.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Thêm ảnh chỉ khi bài còn đang làm. Admin cũng không thêm ảnh hộ học sinh:
    -- ảnh là bằng chứng do học sinh nộp, không phải dữ liệu quản trị.
    IF v_status <> 'in_progress' THEN
      RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE: bài thi đã kết thúc, không thêm được ảnh'
        USING DETAIL = 'Chỉ attempt ở trạng thái in_progress mới nhận ảnh mới.';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' từ đây.

  -- Khoá bất biến: không đổi ảnh sang bài khác, sang người khác, hay đổi nội
  -- dung/hash của một ảnh đã ghi.
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

  -- Xoá mềm không được hoàn tác qua client: "chưa từng bị xoá" và "đã xoá rồi
  -- phục hồi" là hai trạng thái khác nhau của hồ sơ.
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'UPLOAD_UNDELETE_FORBIDDEN: không phục hồi ảnh đã xoá'
      USING DETAIL = 'Cần phục hồi thì chạy SQL bằng kết nối chủ sở hữu, có chủ đích.';
  END IF;

  -- (c) Sau khi nộp: chỉ còn một hành động hợp lệ là xoá mềm, và chỉ admin.
  IF v_status <> 'in_progress' THEN
    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();

    -- `auth.uid()` NULL nghĩa là đang chạy bằng service_role (worker cập nhật
    -- `status` sau khi OCR xong) — đó là đường hợp lệ, không phải người dùng.
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

DROP TRIGGER IF EXISTS essay_answer_uploads_guard_trg ON public.essay_answer_uploads;
CREATE TRIGGER essay_answer_uploads_guard_trg
  BEFORE INSERT OR UPDATE ON public.essay_answer_uploads
  FOR EACH ROW EXECUTE FUNCTION public.essay_answer_uploads_guard();

-- ---------------------------------------------------------------------------
-- 5. RLS trên bảng metadata
-- ---------------------------------------------------------------------------
--
-- KHÁC `essay_ocr_snapshots`. Bảng đó dùng mẫu "RLS bật, không policy nào" vì
-- học sinh không được biết bài mình có bị gắn cờ chất lượng thấp hay không.
-- Bảng này thì học sinh PHẢI đọc được — họ cần thấy ảnh mình đã nộp — nên nó có
-- policy thật, và policy là thứ duy nhất chặn học sinh A đọc ảnh học sinh B.

ALTER TABLE public.essay_answer_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_answer_uploads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS essay_answer_uploads_student_select ON public.essay_answer_uploads;
DROP POLICY IF EXISTS essay_answer_uploads_student_insert ON public.essay_answer_uploads;
DROP POLICY IF EXISTS essay_answer_uploads_student_update ON public.essay_answer_uploads;
DROP POLICY IF EXISTS essay_answer_uploads_admin_all ON public.essay_answer_uploads;

-- Học sinh xem ảnh của chính mình, kể cả sau khi nộp và kể cả dòng đã xoá mềm
-- (UI hiện "bạn đã xoá ảnh này" thay vì làm nó biến mất không dấu vết).
CREATE POLICY essay_answer_uploads_student_select
  ON public.essay_answer_uploads
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Thêm ảnh: chỉ vào attempt của mình và chỉ khi còn đang làm. Điều kiện
-- in_progress lặp lại ở trigger mục 4 có chủ đích — policy chặn qua PostgREST,
-- trigger chặn cả đường service_role.
CREATE POLICY essay_answer_uploads_student_insert
  ON public.essay_answer_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND deleted_at IS NULL
    AND EXISTS (
      -- Tên cột của dòng mới phải viết đủ `essay_answer_uploads.attempt_id`.
      -- Viết trần `attempt_id` thì Postgres tra scope trong cùng trước, nên nếu
      -- `exam_attempts` có (hoặc sau này thêm) một cột cùng tên thì điều kiện
      -- này âm thầm so cột đó với chính nó và luôn đúng — policy mất tác dụng
      -- mà không có lỗi nào.
      SELECT 1 FROM public.exam_attempts a
      WHERE a.id = essay_answer_uploads.attempt_id
        AND a.student_id = auth.uid()
        AND a.status = 'in_progress'
    )
  );

-- Xoá mềm và sắp lại trang, chỉ trong giờ thi.
CREATE POLICY essay_answer_uploads_student_update
  ON public.essay_answer_uploads
  FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts a
      WHERE a.id = essay_answer_uploads.attempt_id
        AND a.student_id = auth.uid()
        AND a.status = 'in_progress'
    )
  )
  WITH CHECK (student_id = auth.uid());

-- Admin toàn quyền đọc/sửa. `FOR ALL` ở đây KHÔNG gồm hard delete: mục 6 không
-- grant DELETE cho role nào, nên không policy nào cấp được quyền đó.
CREATE POLICY essay_answer_uploads_admin_all
  ON public.essay_answer_uploads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Quyền — liệt kê service_role tường minh (bài học của 20260808)
-- ---------------------------------------------------------------------------
--
-- `ALTER DEFAULT PRIVILEGES` của Supabase cấp `ALL` cho `postgres, anon,
-- authenticated, service_role` trên MỌI bảng mới trong `public`. Vì vậy "không
-- viết GRANT DELETE" KHÔNG có nghĩa là không có DELETE — quyền đã có từ trước
-- khi câu GRANT chạy. `20260807` mắc đúng lỗi này và phải sửa bằng `20260808`.
--
-- Cách đúng: REVOKE ALL khỏi cả bốn role TRƯỚC, rồi grant đúng tập cần.
REVOKE ALL ON TABLE public.essay_answer_uploads
  FROM PUBLIC, anon, authenticated, service_role;

-- authenticated cần SELECT/INSERT/UPDATE để policy mục 5 có tác dụng: RLS lọc
-- dòng, GRANT mới quyết định có thao tác nào được thử hay không.
GRANT SELECT, INSERT, UPDATE ON TABLE public.essay_answer_uploads TO authenticated;

-- service_role: route cấp signed URL (INSERT), route OCR cập nhật status
-- (UPDATE), worker và job TTL đọc (SELECT).
GRANT SELECT, INSERT, UPDATE ON TABLE public.essay_answer_uploads TO service_role;

-- Cố ý KHÔNG grant DELETE và TRUNCATE cho bất kỳ role nào, và lần này câu
-- REVOKE ở trên đã thực sự gỡ chúng. Dọn dữ liệu thật thì dùng kết nối chủ sở
-- hữu, có chủ đích, hoặc để CASCADE qua attempt lo.

-- ---------------------------------------------------------------------------
-- 7. Policy trên storage.objects
-- ---------------------------------------------------------------------------
--
-- Bucket private chỉ chặn truy cập KHÔNG đăng nhập. Không có policy dưới đây
-- thì mọi user đã đăng nhập đọc được ảnh của mọi user khác — `authenticated` là
-- một role duy nhất dùng chung cho toàn bộ học sinh.
--
-- Quyền suy ra từ ĐƯỜNG DẪN: `(storage.foldername(name))[1]` là `attempt_id`.
-- Điều đó chỉ an toàn vì trigger mục 4 (b) đã buộc `storage_path` khớp
-- `attempt_id` thật. Hai cơ chế này phụ thuộc nhau; sửa một bên phải sửa bên kia.

DROP POLICY IF EXISTS essay_uploads_student_read ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_write ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_delete ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_admin_read ON storage.objects;

CREATE POLICY essay_uploads_student_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts a
      WHERE a.id = (storage.foldername(name))[1]
        AND a.student_id = auth.uid()
    )
  );

CREATE POLICY essay_uploads_student_write
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'essay-uploads'
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts a
      WHERE a.id = (storage.foldername(name))[1]
        AND a.student_id = auth.uid()
        AND a.status = 'in_progress'
    )
  );

-- Đây là chỗ DUY NHẤT có hard delete trong cả file, và nó có lý do: ảnh học
-- sinh bỏ đi TRƯỚC khi nộp chưa bao giờ là hồ sơ. Dòng metadata vẫn ở lại đã
-- xoá mềm, nên dấu vết "đã chụp rồi bỏ" không mất — chỉ file biến mất, đúng như
-- học sinh mong đợi khi bấm xoá.
CREATE POLICY essay_uploads_student_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts a
      WHERE a.id = (storage.foldername(name))[1]
        AND a.student_id = auth.uid()
        AND a.status = 'in_progress'
    )
  );

CREATE POLICY essay_uploads_admin_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Cố ý KHÔNG có policy DELETE cho admin trên storage. Admin xoá là xoá mềm ở
-- bảng metadata; file vẫn nằm đó tới khi job TTL dọn. Một cú bấm nhầm không
-- được phá bằng chứng chấm điểm của bài đã công bố.

-- ---------------------------------------------------------------------------
-- 8. Nối snapshot với ảnh
-- ---------------------------------------------------------------------------
--
-- Đây là mục đóng lỗ hổng số 2 ở đầu file. Không có cột này, worker chỉ biết
-- "bài (attempt, question) có những snapshot nào theo thời gian" và buộc phải
-- tính cả snapshot của ảnh đã bị xoá.
--
-- NULLABLE vì dòng snapshot ghi TRƯỚC migration này không có ảnh tương ứng để
-- trỏ tới. Worker phải coi `upload_id IS NULL` là "không biết ảnh nào" và
-- fail-closed, không phải "ảnh còn sống".
--
-- ON DELETE CASCADE: bảng snapshot là append-only đối với `service_role`, nhưng
-- append-only bảo vệ khỏi route server sửa nhật ký, không phải khỏi việc xoá cả
-- attempt. Khi một upload thật sự bị xoá cứng (chỉ qua CASCADE từ attempt, hoặc
-- SQL chủ sở hữu có chủ đích) thì snapshot của nó mất đối tượng và không còn ý
-- nghĩa gì để giữ lại.
ALTER TABLE public.essay_ocr_snapshots
  ADD COLUMN IF NOT EXISTS upload_id uuid
    REFERENCES public.essay_answer_uploads(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.essay_ocr_snapshots.upload_id IS
  'Ảnh mà lần OCR này đã đọc. NULL = dòng ghi trước 20260809, worker phải '
  'fail-closed. Worker lọc snapshot theo ảnh còn sống (deleted_at IS NULL) thay '
  'vì theo created_at, vì học sinh được xoá ảnh trong giờ thi.';

CREATE INDEX IF NOT EXISTS essay_ocr_snapshots_upload_idx
  ON public.essay_ocr_snapshots (upload_id)
  WHERE upload_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. Tự kiểm trong transaction — sai thì rollback, không commit nửa vời
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_public       boolean;
  v_con_thua     text[];
  v_thieu        text[];
  v_so_policy    integer;
BEGIN
  -- Bucket phải private. Đây là kiểm quan trọng nhất của cả file.
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'essay-uploads';
  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'BUCKET_PUBLIC: bucket essay-uploads không ở chế độ private'
      USING DETAIL = 'Bucket public nghĩa là ai có URL cũng tải được ảnh bài làm.';
  END IF;

  -- Không role nào được có DELETE/TRUNCATE trên bảng metadata.
  SELECT array_agg(t.role || ':' || t.priv ORDER BY t.role, t.priv) INTO v_con_thua
  FROM (
    SELECT r.role, p.priv
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
    CROSS JOIN unnest(ARRAY['DELETE', 'TRUNCATE']) AS p(priv)
    WHERE has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
  ) t;

  IF v_con_thua IS NOT NULL THEN
    RAISE EXCEPTION 'QUYEN_XOA_CON_SOT: %', array_to_string(v_con_thua, ', ')
      USING DETAIL =
        'Bảng này chỉ xoá mềm. Quyền có thể đến từ ALTER DEFAULT PRIVILEGES '
        || '(xem mục 6) hoặc từ chủ sở hữu bảng — chủ sở hữu luôn có đủ quyền và '
        || 'REVOKE không gỡ được.';
  END IF;

  -- anon không được chạm gì.
  IF has_table_privilege('anon', 'public.essay_answer_uploads', 'SELECT') THEN
    RAISE EXCEPTION 'ANON_DOC_DUOC: anon còn quyền SELECT trên essay_answer_uploads';
  END IF;

  -- authenticated và service_role phải còn đủ quyền làm việc.
  SELECT array_agg(t.role || ':' || t.priv ORDER BY t.role, t.priv) INTO v_thieu
  FROM (
    SELECT r.role, p.priv
    FROM unnest(ARRAY['authenticated', 'service_role']) AS r(role)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS p(priv)
    WHERE NOT has_table_privilege(r.role, 'public.essay_answer_uploads', p.priv)
  ) t;

  IF v_thieu IS NOT NULL THEN
    RAISE EXCEPTION 'SIET_QUA_TAY: thiếu quyền %', array_to_string(v_thieu, ', ')
      USING DETAIL = 'Học sinh sẽ không nộp được ảnh. Rollback ngay.';
  END IF;

  -- Bốn policy của bucket phải tồn tại. Thiếu policy đọc thì mọi user đã đăng
  -- nhập đọc được ảnh của mọi user khác.
  SELECT COUNT(*)::integer INTO v_so_policy
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'essay_uploads_%';

  IF v_so_policy <> 4 THEN
    RAISE EXCEPTION 'THIEU_POLICY_STORAGE: có % policy, cần 4', v_so_policy;
  END IF;

  -- Cột nối snapshot phải tồn tại, nếu không mục 8 đã im lặng không làm gì.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'essay_ocr_snapshots'
      AND column_name = 'upload_id'
  ) THEN
    RAISE EXCEPTION 'THIEU_COT_UPLOAD_ID: essay_ocr_snapshots.upload_id không tồn tại';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — chưa xong việc
-- ---------------------------------------------------------------------------
--
-- Migration này một mình KHÔNG cho phép nộp ảnh. Còn bốn việc phía source:
--
--   1. `POST /api/essay-ai/upload-url` — kiểm ownership + in_progress, tạo dòng
--      `pending`, trả signed upload URL. Chưa có route này.
--   2. Client resize ảnh về cạnh dài 1600px / JPEG 0.8 trước khi upload. Không
--      phải tối ưu: đây là thứ giữ 1 GB free tier sống được quá một kỳ thi, và
--      là cách xoá EXIF/GPS (vẽ lại qua canvas là mất sạch metadata).
--   3. `POST /api/essay-ai/ocr` đổi từ nhận base64 sang nhận `uploadId`, tự tải
--      ảnh từ Storage bằng service key, rồi ghi snapshot KÈM `upload_id`. Vì
--      `service_role` không có UPDATE trên bảng snapshot, `upload_id` phải ghi
--      ngay lúc INSERT — nghĩa là OCR chạy SAU khi ảnh đã lên Storage.
--   4. `fetchOcrProvenance` trong `worker.ts` lọc snapshot theo ảnh còn sống
--      (`JOIN essay_answer_uploads ON upload_id WHERE deleted_at IS NULL`) thay
--      vì lấy mọi dòng theo (attempt_id, question_id). Snapshot có
--      `upload_id IS NULL` phải về `scanned_snapshot_missing`, không được coi là
--      hợp lệ.
--
-- Và một việc phía UI, phải đi cùng migration này chứ không trễ hơn:
-- `ExamRunner.tsx:466` đang nói với học sinh "Ảnh không được lưu lại". Từ lúc
-- migration này chạy, câu đó là nói dối.
--
-- Job TTL 12 tháng (mục 3, `essay_answer_uploads_ttl_idx`) chưa có. Chưa gấp:
-- nó chỉ cần thiết sau khi có ảnh cũ hơn một năm.
