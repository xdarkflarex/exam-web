-- 20260811_essay_uploads_storage_policy_fix.sql
--
-- Sửa lỗi: học sinh KHÔNG xem lại được ảnh bài làm của chính mình sau khi nộp.
--
-- TRIỆU CHỨNG. Trang `/result` gọi `createSignedUrl` và Storage trả
-- `{"statusCode":"404","error":"not_found","message":"Object not found"}` trong
-- khi tệp có thật và service key sign được bình thường.
--
-- NGUYÊN NHÂN. Bốn policy của `20260809` kiểm quyền bằng
--
--   EXISTS (SELECT 1 FROM public.exam_attempts a
--           WHERE a.id = (storage.foldername(name))[1] AND a.student_id = auth.uid())
--
-- Subquery đó chạy DƯỚI RLS của `public.exam_attempts`, với chính role
-- `authenticated`. Và `students_read_own_exam_attempts` (20260722) chỉ cho học
-- sinh đọc attempt của mình khi:
--
--   status = 'in_progress'
--   OR đề practice
--   OR (đề simulation AND grading_status = 'completed' AND show_results_immediately)
--
-- Bài thi thử vừa nộp chưa chốt điểm nên KHÔNG thoả điều nào. Học sinh mất quyền
-- đọc attempt của chính mình, `EXISTS` thành false, và Storage — vốn không phân
-- biệt "không có quyền" với "không tồn tại", cố ý — trả "Object not found".
--
-- Vì sao lỗi này không lộ ra sớm hơn: trong giờ thi `status = 'in_progress'` nên
-- mọi thứ chạy đúng. Upload được, OCR được, ảnh hiện trong `ExamRunner`. Nó chỉ
-- xuất hiện sau khi bấm nộp — đúng lúc ảnh bắt đầu có giá trị làm bằng chứng.
--
-- BÀI HỌC, và đó là lý do bản sửa này không chỉ đổi biểu thức: **policy không được
-- phụ thuộc RLS của bảng khác.** Một policy đúng vào ngày viết có thể vỡ vì ai đó
-- siết RLS ở một bảng khác, và nó vỡ IM LẶNG — không lỗi, không log, chỉ là dữ
-- liệu biến mất khỏi UI. Bản sửa gỡ hẳn sự phụ thuộc bằng hàm `SECURITY DEFINER`.
--
-- VÌ SAO `SECURITY DEFINER` AN TOÀN Ở ĐÂY. Ba hàm dưới đây chỉ trả `boolean`, và
-- tham số vào là tên object mà người gọi đã biết (họ đang xin URL cho nó). Không
-- hàm nào trả về dữ liệu của người khác, nên không có đường rò rỉ nào — chúng chỉ
-- trả lời "được hay không". `auth.uid()` vẫn hoạt động trong `SECURITY DEFINER`
-- vì nó đọc claim JWT của request, không đọc role đang chạy.
--
-- GIỮ NGUYÊN TÊN VÀ SỐ LƯỢNG POLICY (4). Nhờ vậy postflight của `20260809` —
-- vốn đếm đúng 4 policy `essay_uploads_%` — vẫn đạt sau migration này.
--
-- PREFLIGHT:  supabase/preflight/20260811_essay_uploads_storage_policy_fix_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260811_essay_uploads_storage_policy_fix_postflight.sql
-- ROLLBACK:   supabase/rollback/20260811_essay_uploads_storage_policy_fix_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.essay_answer_uploads') IS NULL THEN
    RAISE EXCEPTION 'CHAY_SAI_THU_TU: chưa áp 20260809_essay_answer_uploads.sql'
      USING DETAIL = 'Migration này sửa policy của bucket do 20260809 tạo.';
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'KHONG_CO_STORAGE: schema storage của Supabase không tồn tại';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Ba hàm quyết định quyền, không phụ thuộc RLS của bảng nào
-- ---------------------------------------------------------------------------

/**
 * Người gọi có phải chủ của ảnh này.
 *
 * Đi qua `essay_answer_uploads` chứ không qua `exam_attempts`: `student_id` trên
 * dòng metadata đã được trigger `essay_answer_uploads_guard` bảo đảm luôn bằng
 * `exam_attempts.student_id`, nên hai nguồn cho cùng câu trả lời — nhưng nguồn
 * này không có điều kiện theo trạng thái bài thi.
 *
 * KHÔNG lọc `deleted_at`: ảnh đã xoá mềm thì tệp cũng đã bị route xoá khỏi
 * Storage, nên không có object nào để đọc. Thêm điều kiện ở đây chỉ tạo thêm một
 * chỗ để sai mà không chặn thêm gì.
 */
CREATE OR REPLACE FUNCTION public.essay_upload_is_owner(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.essay_answer_uploads u
    WHERE u.storage_path = object_name
      AND u.student_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.essay_upload_is_owner(text) IS
  'Người gọi có phải chủ ảnh bài làm này. SECURITY DEFINER để không phụ thuộc RLS '
  'của bảng khác — nguyên nhân lỗi mà 20260811 sửa.';

/**
 * Người gọi có phải admin hệ thống.
 *
 * Cũng bọc `SECURITY DEFINER` vì cùng một lý do: `20260809` đọc `public.profiles`
 * trực tiếp trong policy, tức là phụ thuộc RLS của `profiles`. Hôm nay admin đọc
 * được dòng của chính mình, nhưng đó là một giả định về bảng khác — chính loại
 * giả định vừa gây ra lỗi này.
 *
 * `role = 'admin'` exact, KHÔNG nhận `teacher`. Đây là hành vi có ý thức, khớp
 * `AGENTS.md` mục 4: semantics `teacher` so với `admin` là P1 đang mở của dự án,
 * và nới nó ở một migration về ảnh là sửa triệu chứng ở sai chỗ.
 */
CREATE OR REPLACE FUNCTION public.essay_upload_viewer_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

/**
 * Người gọi có được GHI vào thư mục của ảnh này — tức bài thi còn đang làm.
 *
 * Suy `attempt_id` từ đoạn đầu đường dẫn thay vì tra dòng metadata: lúc ghi object
 * mới, dòng metadata có thể chưa tồn tại (client tự upload trực tiếp), nên tra
 * metadata sẽ chặn oan chính luồng cần cho phép.
 *
 * Ở đây BUỘC phải đọc `exam_attempts` vì `status` chỉ có ở đó. `SECURITY DEFINER`
 * làm điều kiện `status = 'in_progress'` thành phép kiểm tường minh của ta, không
 * còn là hệ quả phụ của RLS bảng khác — trước bản sửa, việc chặn-sau-khi-nộp đúng
 * một cách tình cờ, và cái đúng tình cờ thì hỏng lúc nào không biết.
 */
CREATE OR REPLACE FUNCTION public.essay_upload_attempt_active(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    WHERE a.id = split_part(object_name, '/', 1)
      AND a.student_id = auth.uid()
      AND a.status = 'in_progress'
  );
$$;

-- Policy chạy dưới role của người gọi, nên `authenticated` phải EXECUTE được —
-- thiếu quyền này thì mọi truy vấn chạm bucket sẽ LỖI thay vì bị từ chối.
GRANT EXECUTE ON FUNCTION public.essay_upload_is_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.essay_upload_viewer_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.essay_upload_attempt_active(text) TO authenticated;

-- `anon` không có việc gì với ảnh bài làm. Hàm `SECURITY DEFINER` chạy bằng quyền
-- chủ sở hữu nên thu hẹp bề mặt gọi được là việc nên làm, không phải tuỳ chọn.
REVOKE ALL ON FUNCTION public.essay_upload_is_owner(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.essay_upload_viewer_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.essay_upload_attempt_active(text) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. Dựng lại 4 policy storage — cùng tên, cùng số lượng
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS essay_uploads_student_read ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_write ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_student_delete ON storage.objects;
DROP POLICY IF EXISTS essay_uploads_admin_read ON storage.objects;

-- Học sinh xem ảnh của mình, BẤT KỂ bài đã nộp hay chưa. Đây chính là dòng sửa
-- lỗi: điều kiện cũ mất hiệu lực đúng lúc học sinh cần xem lại nhất.
CREATE POLICY essay_uploads_student_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND public.essay_upload_is_owner(name)
  );

CREATE POLICY essay_uploads_admin_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND public.essay_upload_viewer_is_admin()
  );

CREATE POLICY essay_uploads_student_write
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'essay-uploads'
    AND public.essay_upload_attempt_active(name)
  );

-- Xoá tệp chỉ trong giờ thi. Ảnh học sinh bỏ đi TRƯỚC khi nộp chưa bao giờ là hồ
-- sơ; sau khi nộp thì không ai xoá tệp được qua đường client.
CREATE POLICY essay_uploads_student_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'essay-uploads'
    AND public.essay_upload_attempt_active(name)
  );

-- ---------------------------------------------------------------------------
-- 3. Gỡ cùng một sự phụ thuộc trên bảng metadata
-- ---------------------------------------------------------------------------
--
-- `essay_answer_uploads_admin_all` của `20260809` cũng đọc `public.profiles` trực
-- tiếp trong policy. Hiện nó chạy đúng, nhưng nó là cùng một loại giả định về RLS
-- của bảng khác. Đổi sang hàm để cả họ policy này nhất quán.
--
-- Ba policy học sinh của bảng đó KHÔNG cần đổi: chúng chỉ so `student_id =
-- auth.uid()` trên chính dòng đang xét, không tra bảng nào khác. Riêng
-- `student_insert`/`student_update` có subquery vào `exam_attempts` để đòi
-- `in_progress` — và ở đó RLS của `exam_attempts` cho phép đúng trạng thái ấy,
-- nên chúng đang đúng vì lý do đúng, không phải tình cờ.

DROP POLICY IF EXISTS essay_answer_uploads_admin_all ON public.essay_answer_uploads;

CREATE POLICY essay_answer_uploads_admin_all
  ON public.essay_answer_uploads
  FOR ALL TO authenticated
  USING (public.essay_upload_viewer_is_admin())
  WITH CHECK (public.essay_upload_viewer_is_admin());

-- ---------------------------------------------------------------------------
-- 4. Tự kiểm trong transaction
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_so_policy integer;
  v_con_phu_thuoc integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_so_policy
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'essay_uploads_%';

  IF v_so_policy <> 4 THEN
    RAISE EXCEPTION 'SO_POLICY_SAI: có % policy, cần 4', v_so_policy;
  END IF;

  -- Không policy nào của bucket được còn tham chiếu `exam_attempts` TRỰC TIẾP.
  -- Đây là kiểm cốt lõi của migration: nếu còn, lỗi vẫn nguyên đó.
  SELECT COUNT(*)::integer INTO v_con_phu_thuoc
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'essay_uploads_%'
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%exam_attempts%';

  IF v_con_phu_thuoc > 0 THEN
    RAISE EXCEPTION 'CON_PHU_THUOC_RLS: % policy còn đọc exam_attempts trực tiếp', v_con_phu_thuoc
      USING DETAIL =
        'Subquery vào exam_attempts chạy dưới RLS của bảng đó, và RLS đó chặn học '
        || 'sinh sau khi nộp bài. Dùng public.essay_upload_* thay thế.';
  END IF;

  -- Ba hàm phải tồn tại và phải là SECURITY DEFINER; thiếu `prosecdef` thì chúng
  -- lại chạy dưới RLS người gọi và không sửa được gì.
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.essay_upload_is_owner(text)',
      'public.essay_upload_viewer_is_admin()',
      'public.essay_upload_attempt_active(text)'
    ]) AS f(sig)
    WHERE to_regprocedure(f.sig) IS NULL
       OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(f.sig))
  ) THEN
    RAISE EXCEPTION 'HAM_SAI: thiếu hàm hoặc hàm không phải SECURITY DEFINER';
  END IF;

  -- `authenticated` phải EXECUTE được cả ba, nếu không mọi truy vấn chạm bucket
  -- sẽ raise permission denied thay vì trả về 0 dòng.
  IF NOT (
    has_function_privilege('authenticated', to_regprocedure('public.essay_upload_is_owner(text)'), 'EXECUTE')
    AND has_function_privilege('authenticated', to_regprocedure('public.essay_upload_viewer_is_admin()'), 'EXECUTE')
    AND has_function_privilege('authenticated', to_regprocedure('public.essay_upload_attempt_active(text)'), 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'THIEU_QUYEN_EXECUTE: authenticated không gọi được hàm quyền';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — xác minh bằng đúng con đường production
-- ---------------------------------------------------------------------------
--
-- Postflight chỉ đọc catalog. Phép thử thật:
--
--   node --env-file=.env scripts/essay-uploads-permission-check.mjs \
--     --email-a <A> --password-a <mkA> --email-b <B> --password-b <mkB>
--
-- và quan trọng hơn cả: mở `/result` của một bài ĐÃ NỘP bằng tài khoản học sinh
-- rồi xác nhận ảnh hiện ra. Đó là chính xác trường hợp đã hỏng, và không phép
-- kiểm catalog nào thay được nó.
--
-- Rồi kiểm nhánh ngược, vì bản sửa này NỚI quyền đọc: đăng nhập bằng học sinh B,
-- dán signed URL ảnh của A vào — phải vẫn không xem được.
