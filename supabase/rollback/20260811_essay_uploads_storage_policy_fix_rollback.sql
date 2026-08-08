-- 20260811_essay_uploads_storage_policy_fix_rollback.sql
--
-- Trả 4 policy bucket về bản `20260809` và gỡ ba hàm quyền.
--
-- ĐỌC TRƯỚC KHI CHẠY: **rollback này KHÔI PHỤC LẠI LỖI.** Bản `20260809` là bản
-- mà học sinh không xem lại được ảnh bài làm của chính mình sau khi nộp — đó là
-- toàn bộ lý do `20260811` tồn tại. Chạy file này nghĩa là chọn quay về trạng
-- thái đó một cách có ý thức.
--
-- Không mất dữ liệu: file chỉ đổi policy và gỡ hàm. Ảnh, metadata, bucket không
-- bị chạm.
--
-- VÌ SAO GẦN NHƯ LUÔN LÀ QUYẾT ĐỊNH SAI. `20260811` chỉ NỚI quyền đọc cho đúng
-- chủ sở hữu ảnh và không nới cho ai khác — `essay_upload_is_owner` so
-- `student_id = auth.uid()` trên chính dòng metadata. Nếu sau khi áp mà có gì
-- hỏng, nguyên nhân gần như chắc chắn ở chỗ khác.
--
-- NẾU LO BẢN SỬA NỚI QUÁ TAY thì đừng rollback — kiểm bằng phép thử ngược trước:
-- đăng nhập bằng học sinh B, dán signed URL ảnh của A vào, phải không xem được.
--   node --env-file=.env scripts/essay-uploads-permission-check.mjs ...

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trả policy bucket về bản 20260809
-- ---------------------------------------------------------------------------
--
-- Phải làm TRƯỚC khi gỡ hàm: policy đang tham chiếu ba hàm đó, và `DROP FUNCTION`
-- sẽ bị chặn bởi dependency (hoặc nếu ép CASCADE thì nó xoá luôn policy, để bucket
-- không còn policy nào — tức là không ai đọc được ảnh, kể cả admin).

DROP POLICY IF EXISTS essay_uploads_student_read ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_admin_read ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_write ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_delete ON storage.objects;

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

-- ---------------------------------------------------------------------------
-- 2. Trả policy admin của bảng metadata về bản 20260809
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS essay_answer_uploads_admin_all ON public.essay_answer_uploads;

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
-- 3. Gỡ ba hàm
-- ---------------------------------------------------------------------------
--
-- Không dùng CASCADE: nếu còn policy nào tham chiếu thì Postgres phải raise, để ta
-- biết mục 1 chưa làm hết chứ không âm thầm xoá mất một policy.

DROP FUNCTION IF EXISTS public.essay_upload_is_owner(text);
DROP FUNCTION IF EXISTS public.essay_upload_viewer_is_admin();
DROP FUNCTION IF EXISTS public.essay_upload_attempt_active(text);

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Trạng thái đã biết: học sinh KHÔNG xem lại được ảnh sau khi nộp bài, và
-- `EssayAnswerImages` sẽ hiện ô "Không mở được" cho mọi trang. Nếu không muốn học
-- sinh thấy ô lỗi đó, gỡ khối `<EssayAnswerImages>` khỏi
-- `src/app/result/[attemptId]/page.tsx` — màn chấm của giáo viên (admin) vẫn hoạt
-- động vì policy admin không phụ thuộc trạng thái attempt.
--
-- Kiểm bằng: chạy lại postflight của 20260809 (phải vẫn đạt — 4 policy, cùng tên).
