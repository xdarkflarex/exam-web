-- 20260920_feedback_anticheat_rls_rollback.sql
--
-- Trả `question_feedbacks` và `anti_cheat_logs` về policy gốc, gỡ hàm
-- `owns_exam_attempt()`.
--
-- ĐỌC TRƯỚC KHI CHẠY: **rollback này KHÔI PHỤC LẠI HAI LỖ.**
--
--   - `question_feedbacks` trở lại trạng thái chỉ có policy admin. Nếu RLS
--     trước đó đang TẮT thì file này KHÔNG tắt lại — tắt RLS là mở lại đường
--     cho mọi người đọc góp ý của nhau, và không có tình huống nào đáng đánh
--     đổi như vậy. Muốn tắt thật thì phải gõ tay, có ý thức:
--         ALTER TABLE public.question_feedbacks DISABLE ROW LEVEL SECURITY;
--   - `anti_cheat_logs` trở lại `WITH CHECK (true)`, tức ai cũng ghi được vào
--     lượt thi của người khác.
--
-- Không mất dữ liệu: chỉ đổi policy và gỡ một hàm. Không dòng nào bị chạm.
--
-- NẾU TRIỆU CHỨNG LÀ "HỌC SINH KHÔNG GỬI ĐƯỢC GÓP Ý" thì đừng rollback vội —
-- nhiều khả năng là `attempt_id` không thuộc về học sinh đó (policy mới đòi cả
-- hai điều kiện). Chạy `scripts/feedback-anticheat-rls-check.mjs` để biết nhánh
-- nào hỏng trước khi mở lại cả cánh cửa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trả policy về bản gốc
-- ---------------------------------------------------------------------------
--
-- Phải làm TRƯỚC khi gỡ hàm: policy mới đang tham chiếu `owns_exam_attempt()`,
-- và `DROP FUNCTION` sẽ bị dependency chặn (hoặc CASCADE sẽ xoá luôn policy,
-- để bảng ở trạng thái không ai ghi được).

DROP POLICY IF EXISTS question_feedbacks_admin_all ON public.question_feedbacks;
DROP POLICY IF EXISTS question_feedbacks_student_insert ON public.question_feedbacks;
DROP POLICY IF EXISTS question_feedbacks_student_read ON public.question_feedbacks;

DROP POLICY IF EXISTS anti_cheat_logs_student_insert ON public.anti_cheat_logs;
DROP POLICY IF EXISTS anti_cheat_logs_staff_read ON public.anti_cheat_logs;

-- Nguyên văn bản gốc, KỂ CẢ phần thiếu mệnh đề `TO` — đó chính là lỗi, và
-- rollback phải trả về đúng trạng thái cũ chứ không phải một bản "cũ nhưng đã
-- sửa một nửa". Nửa vời còn khó chẩn đoán hơn.
--
-- `is_admin()` có thể không tồn tại nếu `database/FIX_ADMIN_RLS_COMPLETE.sql`
-- chưa từng chạy trên database này. Khi đó dùng `viewer_is_admin()` thay thế:
-- hai hàm cùng nghĩa, và một policy không tạo được sẽ để bảng không ai quản trị.
DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE POLICY "Admin can manage all feedbacks"
      ON public.question_feedbacks FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
    $ddl$;
  ELSE
    EXECUTE $ddl$
      CREATE POLICY "Admin can manage all feedbacks"
      ON public.question_feedbacks FOR ALL
      TO authenticated
      USING (public.viewer_is_admin())
      WITH CHECK (public.viewer_is_admin());
    $ddl$;
  END IF;
END;
$$;

CREATE POLICY "Teachers see anti-cheat logs" ON public.anti_cheat_logs
  FOR SELECT USING (
    attempt_id IN (
      SELECT ea.id FROM public.exam_attempts ea
      JOIN public.exams e ON ea.exam_id = e.id
      WHERE e.created_by = auth.uid()
    )
  );

CREATE POLICY "System can insert anti-cheat logs" ON public.anti_cheat_logs
  FOR INSERT WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Gỡ hàm
-- ---------------------------------------------------------------------------
--
-- Không `CASCADE`: nếu còn policy nào tham chiếu thì lệnh này phải HỎNG để
-- người chạy biết, chứ không âm thầm xoá policy đó đi.

DROP FUNCTION IF EXISTS public.owns_exam_attempt(text);

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Chạy lại preflight: các dòng `xac_nhan_loi_*` phải khác 0 trở lại. Nếu chúng
-- vẫn bằng 0 thì rollback chưa trọn vẹn, đừng coi là xong.
