-- 20260920_feedback_anticheat_rls.sql
--
-- Sửa hai lỗ quyền phát hiện khi port sang app điện thoại:
-- `docs/VIEC_DANG_MO.md` mục A19 (`question_feedbacks`) và A20 (`anti_cheat_logs`).
--
-- ---------------------------------------------------------------------------
-- A19 — `question_feedbacks` không có policy nào cho học sinh
-- ---------------------------------------------------------------------------
--
-- Học sinh GHI vào bảng này từ `src/app/result/[attemptId]/page.tsx`. Nhưng
-- trong toàn bộ SQL của repo, bảng chỉ có đúng một policy:
--
--   "Admin can manage all feedbacks"  FOR ALL  USING (public.is_admin())
--     -- database/FIX_ADMIN_RLS_COMPLETE.sql:154
--
-- và **không file nào chạy `ALTER TABLE question_feedbacks ENABLE ROW LEVEL
-- SECURITY`**. Hai khả năng, cả hai đều hỏng:
--
--   RLS đang TẮT  -> insert chạy được, nhưng policy admin là vô hiệu và AI ĐĂNG
--                    NHẬP CŨNG SELECT ĐƯỢC góp ý của mọi học sinh khác, kèm tên
--                    người gửi và nội dung họ viết.
--   RLS đang BẬT  -> học sinh bị 42501, nên nút "Gửi góp ý" hỏng với mọi học
--                    sinh và hộp việc `/admin/feedback` không bao giờ có gì mới.
--
-- Preflight in ra đang là khả năng nào. Migration này xử lý cả hai: bật RLS VÀ
-- tạo policy trong CÙNG MỘT transaction. Bật RLS trước mà chưa có policy là
-- chặn đứng đường ghi hiện có — đó là lý do hai việc không được tách file.
--
-- ---------------------------------------------------------------------------
-- A20 — `anti_cheat_logs` cho phép ghi đè lên lượt thi của người khác
-- ---------------------------------------------------------------------------
--
--   "System can insert anti-cheat logs"  FOR INSERT  WITH CHECK (true)
--     -- database/EXAM_SYSTEM_SCHEMA.sql:496
--
-- `WITH CHECK (true)` không ràng buộc `attempt_id` phải thuộc người gọi. Ai
-- đăng nhập cũng chèn được bản ghi "chuyển tab" vào lượt thi của BẤT KỲ học
-- sinh nào nếu biết `attempt_id`. Một cuốn sổ ai cũng viết vào được thì không
-- còn là bằng chứng.
--
-- Policy SELECT của bảng cũng được dựng lại: bản gốc thiếu mệnh đề `TO` và
-- đọc thẳng `exam_attempts` + `exams` trong biểu thức — đúng cái bẫy mà
-- `AGENTS.md` mục 4 ("RLS: đừng để phân quyền phụ thuộc RLS/GRANT của bảng
-- khác") cấm, và là nguyên nhân của ba lỗi thật ngày 2026-08-07.
--
-- ---------------------------------------------------------------------------
-- PHẠM VI
-- ---------------------------------------------------------------------------
--
-- Một hàm helper mới + bật RLS cho một bảng + dựng lại năm policy. KHÔNG đổi
-- dữ liệu, KHÔNG đổi cấu trúc bảng, KHÔNG đổi GRANT.
--
-- PREFLIGHT:  supabase/preflight/20260920_feedback_anticheat_rls_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260920_feedback_anticheat_rls_postflight.sql
-- ROLLBACK:   supabase/rollback/20260920_feedback_anticheat_rls_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.question_feedbacks') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.question_feedbacks không tồn tại';
  END IF;

  IF to_regclass('public.anti_cheat_logs') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.anti_cheat_logs không tồn tại';
  END IF;

  IF to_regclass('public.exam_attempts') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.exam_attempts không tồn tại';
  END IF;

  -- Hai helper đã có sẵn mà file này dựa vào. Thiếu chúng thì policy mới tạo ra
  -- sẽ raise lúc CHẠY chứ không phải lúc tạo — tức là hỏng trên production, im
  -- lặng ở đây. Chặn ngay.
  IF to_regprocedure('public.viewer_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'THIEU_HAM: public.viewer_is_admin()'
      USING DETAIL = 'Áp supabase/migrations/20260812_announcements_policy_fix.sql trước.';
  END IF;

  IF to_regprocedure('public.can_manage_exam_attempt(text)') IS NULL THEN
    RAISE EXCEPTION 'THIEU_HAM: public.can_manage_exam_attempt(text)'
      USING DETAIL = 'Áp supabase/migrations/20260722_runtime_security_hardening.sql trước.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Helper: lượt thi này có phải của người đang gọi không
-- ---------------------------------------------------------------------------
--
-- Đặt tên chung chứ không gắn với một bảng: cùng phép kiểm này áp cho cả
-- `question_feedbacks` lẫn `anti_cheat_logs`, và sẽ còn dùng lại.
--
-- `SECURITY DEFINER` là bắt buộc, không phải cho tiện: học sinh CÓ đọc được
-- dòng `exam_attempts` của chính mình, nhưng viết `EXISTS (SELECT ... FROM
-- exam_attempts ...)` thẳng trong policy là buộc mọi vai trò chạm policy đó
-- phải đọc nổi bảng kia. Hàm chỉ trả đúng/sai nên không rò rỉ gì; tham số là
-- thứ người gọi đã biết.
--
-- Trả `false` khi `p_attempt_id` không tồn tại (EXISTS trên tập rỗng), nên
-- không có đường nào lách bằng một id bịa.
CREATE OR REPLACE FUNCTION public.owns_exam_attempt(p_attempt_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_attempts ea
    WHERE ea.id = p_attempt_id
      AND ea.student_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.owns_exam_attempt(text) IS
  'Lượt thi này có thuộc về người đang gọi không. SECURITY DEFINER để policy '
  'dùng nó không phụ thuộc quyền đọc public.exam_attempts của vai trò gọi — '
  'quy tắc ở AGENTS.md mục 4. Dùng cho question_feedbacks và anti_cheat_logs.';

REVOKE ALL ON FUNCTION public.owns_exam_attempt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_exam_attempt(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. `question_feedbacks`: bật RLS và tạo đủ ba policy
-- ---------------------------------------------------------------------------

ALTER TABLE public.question_feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage all feedbacks" ON public.question_feedbacks;
DROP POLICY IF EXISTS question_feedbacks_admin_all ON public.question_feedbacks;
DROP POLICY IF EXISTS question_feedbacks_student_insert ON public.question_feedbacks;
DROP POLICY IF EXISTS question_feedbacks_student_read ON public.question_feedbacks;

-- Admin toàn quyền. Đổi hai thứ so với bản gốc, cả hai đều bắt buộc:
--   - `TO authenticated`: `FOR ALL` thiếu `TO` áp cho MỌI vai trò và chen vào
--     mọi truy vấn đọc của mọi người (AGENTS.md mục 4).
--   - `viewer_is_admin()` thay `is_admin()`: cùng nghĩa (`role = 'admin'` exact)
--     nhưng có `SET search_path`. Không đổi ai được làm gì.
--
-- HỆ QUẢ PHẢI BIẾT TRƯỚC KHI ÁP — `role = 'teacher'` sẽ thấy hộp góp ý RỖNG.
--
-- `src/middleware.ts:394` cho cả `teacher` lẫn `admin` vào `/admin`, nhưng
-- policy của bảng này (viết từ `FIX_ADMIN_RLS_COMPLETE.sql`) là exact `admin`.
-- Hôm nay giáo viên vẫn đọc được góp ý CHỈ VÌ RLS đang tắt — tức là họ đang
-- đọc nhờ một lỗi, không nhờ một quyền. Bật RLS làm đúng cái policy đã viết.
--
-- Migration này cố ý KHÔNG nới sang `teacher`. `AGENTS.md` mục 4 xếp sai lệch
-- teacher/admin là **P1 đang mở** và dặn thẳng: "không nới policy riêng lẻ để
-- chữa triệu chứng" — sửa nó phải đồng bộ middleware, handler, RLS và UI trong
-- một lần, không phải lẻn vào một migration về góp ý.
--
-- Nếu chủ dự án muốn giáo viên đọc được góp ý: sửa MỘT chỗ là `USING` của
-- policy này (thêm `OR` một helper "là giáo viên"), và quyết luôn có scope theo
-- `classes.teacher_id` hay không — hôm nay giáo viên đang thấy góp ý của MỌI
-- lớp, kể cả lớp không phải của mình.
CREATE POLICY question_feedbacks_admin_all
  ON public.question_feedbacks
  FOR ALL TO authenticated
  USING (public.viewer_is_admin())
  WITH CHECK (public.viewer_is_admin());

-- Học sinh gửi góp ý CHO LƯỢT THI CỦA CHÍNH MÌNH.
--
-- Hai điều kiện, không phải một. `student_id = auth.uid()` chặn việc gán góp ý
-- cho người khác; `owns_exam_attempt` chặn việc gắn nó vào lượt thi của người
-- khác. Thiếu vế thứ hai thì hộp việc của giáo viên vẫn nhận được góp ý chỉ
-- sai chỗ — và "sai chỗ" trong một hộp việc là thứ tốn hàng giờ để lần ra.
CREATE POLICY question_feedbacks_student_insert
  ON public.question_feedbacks
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.owns_exam_attempt(attempt_id)
  );

-- Học sinh đọc lại góp ý của CHÍNH MÌNH, không thấy của ai khác.
--
-- Cần cho luồng hiện tại: `supabase-js` không trả dòng nếu không gọi `.select()`,
-- nhưng màn hình muốn hiện "đã gửi góp ý" sau khi tải lại trang thì phải đọc
-- được. Không có policy này thì tính năng chạy nhưng quên mất mình đã gửi.
CREATE POLICY question_feedbacks_student_read
  ON public.question_feedbacks
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- KHÔNG có policy UPDATE/DELETE cho học sinh: gửi rồi thì không sửa, không rút.
-- Góp ý đã vào hộp việc của giáo viên là một sự kiện, không phải một bản nháp.

-- ---------------------------------------------------------------------------
-- 3. `anti_cheat_logs`: siết INSERT, dựng lại SELECT cho đúng quy tắc
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System can insert anti-cheat logs" ON public.anti_cheat_logs;
DROP POLICY IF EXISTS "Teachers see anti-cheat logs" ON public.anti_cheat_logs;
DROP POLICY IF EXISTS anti_cheat_logs_student_insert ON public.anti_cheat_logs;
DROP POLICY IF EXISTS anti_cheat_logs_staff_read ON public.anti_cheat_logs;

-- Chỉ ghi được vào lượt thi của chính mình.
--
-- `service_role` bỏ qua RLS nên mọi đường ghi server-side không bị ảnh hưởng.
-- Đường ghi duy nhất từ client là `useExamAntiCheat` (web) và hook cùng tên bên
-- app điện thoại, cả hai đều ghi cho lượt thi đang làm.
CREATE POLICY anti_cheat_logs_student_insert
  ON public.anti_cheat_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_exam_attempt(attempt_id));

-- Giáo viên/quản trị phụ trách đề đọc được nhật ký.
--
-- Bản gốc viết `attempt_id IN (SELECT ... FROM exam_attempts JOIN exams ...)`
-- và thiếu `TO`. Thay bằng `can_manage_exam_attempt` — CHÍNH hàm mà 20260722
-- đã dùng cho `staff_read_scoped_exam_answers`, tức cùng một cổng với việc đọc
-- bài làm của học sinh. Đọc bài làm nhạy cảm hơn hẳn đọc nhật ký chuyển tab,
-- nên dùng chung cổng là nhất quán chứ không phải nới tay; khác biệt duy nhất
-- so với bản gốc là admin hệ thống và giáo viên chủ nhiệm lớp cũng đọc được,
-- thay vì chỉ người tạo đề.
CREATE POLICY anti_cheat_logs_staff_read
  ON public.anti_cheat_logs
  FOR SELECT TO authenticated
  USING (public.can_manage_exam_attempt(attempt_id));

-- Học sinh KHÔNG đọc được nhật ký của chính mình — giữ nguyên hành vi cũ. Cho
-- xem là dạy cách né: biết hệ thống đếm gì thì biết làm gì để không bị đếm.

-- ---------------------------------------------------------------------------
-- 4. Tự kiểm trong transaction
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_rls_tat integer;
  v_khong_co_to integer;
  v_doc_bang_khac integer;
  v_insert_khong_rang_buoc integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_rls_tat
  FROM pg_class
  WHERE oid IN (to_regclass('public.question_feedbacks'), to_regclass('public.anti_cheat_logs'))
    AND NOT relrowsecurity;

  IF v_rls_tat > 0 THEN
    RAISE EXCEPTION 'RLS_CHUA_BAT: % bảng còn tắt RLS', v_rls_tat
      USING DETAIL = 'Policy không có tác dụng nào khi RLS tắt.';
  END IF;

  SELECT COUNT(*)::integer INTO v_khong_co_to
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
    AND 'public' = ANY (roles);

  IF v_khong_co_to > 0 THEN
    RAISE EXCEPTION 'CON_POLICY_KHONG_GIOI_HAN_ROLE: % policy còn áp cho mọi vai trò', v_khong_co_to;
  END IF;

  -- Không policy nào được nhắc tên bảng khác trong biểu thức nữa.
  SELECT COUNT(*)::integer INTO v_doc_bang_khac
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(profiles|exam_attempts|exams)';

  IF v_doc_bang_khac > 0 THEN
    RAISE EXCEPTION 'CON_DOC_BANG_KHAC: % policy còn đọc bảng khác trực tiếp', v_doc_bang_khac
      USING DETAIL = 'Bọc vào hàm SECURITY DEFINER — AGENTS.md mục 4.';
  END IF;

  -- Không còn `WITH CHECK (true)` ở bất kỳ policy INSERT nào của hai bảng này.
  SELECT COUNT(*)::integer INTO v_insert_khong_rang_buoc
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
    AND cmd = 'INSERT'
    AND COALESCE(with_check, '') IN ('true', '(true)');

  IF v_insert_khong_rang_buoc > 0 THEN
    RAISE EXCEPTION 'INSERT_KHONG_RANG_BUOC: còn % policy WITH CHECK (true)', v_insert_khong_rang_buoc;
  END IF;

  IF to_regprocedure('public.owns_exam_attempt(text)') IS NULL
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure('public.owns_exam_attempt(text)')) THEN
    RAISE EXCEPTION 'HAM_SAI: thiếu owns_exam_attempt() hoặc nó không phải SECURITY DEFINER';
  END IF;

  IF NOT has_function_privilege('authenticated', to_regprocedure('public.owns_exam_attempt(text)'), 'EXECUTE') THEN
    RAISE EXCEPTION 'THIEU_QUYEN_EXECUTE: authenticated không gọi được owns_exam_attempt()'
      USING DETAIL = 'Thiếu quyền này thì học sinh nhận lỗi thay vì ghi được.';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — postflight đọc catalog KHÔNG đủ
-- ---------------------------------------------------------------------------
--
-- `AGENTS.md` mục 4: "Postflight đọc catalog KHÔNG chứng minh được lớp lỗi
-- này." Phải thử bằng JWT thật qua PostgREST. Script có sẵn:
--
--   node --env-file=.env scripts/feedback-anticheat-rls-check.mjs \
--     --email <hoc-sinh-test> --password <mat-khau-test>
--
-- Nó kiểm đủ bốn nhánh, kể cả nhánh NGƯỢC (bản sửa vừa nới vừa siết):
--   1. Học sinh gửi góp ý cho lượt thi của mình  -> 201
--   2. Học sinh gửi góp ý cho lượt thi người khác -> 403/42501
--   3. Học sinh đọc góp ý của mình               -> chỉ thấy dòng của mình
--   4. Học sinh ghi anti_cheat_logs cho lượt thi người khác -> 403/42501
--
-- KHÔNG dùng Supabase SQL Editor để kiểm: nó chạy bằng vai trò chủ sở hữu nên
-- `auth.uid()` là NULL và policy trông như bị bỏ qua.
