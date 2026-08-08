-- 20260803_exam_preparation_attempt_quota.sql
--
-- Mục đích: bổ sung `max_attempts` và `attempts_remaining` vào payload của
-- `get_exam_preparation` để trang `/exam/prepare/[examId]` biết trước học sinh
-- còn lượt thi hay không.
--
-- Bối cảnh lỗi: `start_exam_attempt` raise `MAX_ATTEMPTS_REACHED` (ERRCODE 42501)
-- khi học sinh đã dùng hết lượt. Client nhận HTTP 403 nhưng không có dữ liệu nào
-- để hiển thị trạng thái "không còn lượt thi" trước khi bấm, nên học sinh thấy
-- nút "Bắt đầu thi" bình thường rồi bị từ chối im lặng.
--
-- PHỤ THUỘC: migration này CREATE OR REPLACE một hàm được định nghĩa trong
-- `20260722_runtime_security_hardening.sql`. Migration đó tính đến 2026-08-03
-- VẪN CHƯA ĐƯỢC ÁP trên Primary Database (xem `docs/RUNBOOK.md` mục cutover).
-- Không chạy file này trước 20260722; chạy trước sẽ tạo một hàm mồ côi không có
-- các guard đi kèm, và sau đó 20260722 sẽ ghi đè mất thay đổi ở đây.
-- Thứ tự bắt buộc: preflight 20260722 -> 20260722 -> postflight -> file này.
--
-- Phạm vi: chỉ đọc thêm và mở rộng payload. Không đổi schema, không đổi RLS,
-- không đổi ngữ nghĩa chấm điểm hay điều kiện chặn lượt thi. Ngưỡng chặn thật
-- vẫn nằm ở `start_exam_attempt`; số liệu trả về đây thuần tuý để hiển thị.
--
-- Rollback: chạy lại định nghĩa `get_exam_preparation` trong
-- `20260722_runtime_security_hardening.sql` (không có hai khoá mới trong payload).
-- Client xử lý hai khoá này là optional nên rollback không làm vỡ UI.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_exam_preparation(p_exam_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam record;
  v_existing record;
  v_question_count integer;
  v_attempt_count integer;
  v_best_score numeric;
  v_effective_max integer;
  v_attempts_remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    exam.id,
    exam.title,
    exam.description,
    exam.subject,
    exam.duration,
    exam.exam_mode,
    exam.is_published,
    exam.class_id,
    exam.max_attempts,
    exam.show_results_immediately,
    profile.role AS user_role,
    profile.class_id AS user_class_id
  INTO v_exam
  FROM public.exams exam
  JOIN public.profiles profile ON profile.id = auth.uid()
  WHERE exam.id = p_exam_id;

  IF v_exam.id IS NULL
     OR v_exam.user_role IS DISTINCT FROM 'student'
     OR v_exam.exam_mode IS DISTINCT FROM 'simulation'
     OR NOT COALESCE(v_exam.is_published, false)
     OR (
       v_exam.class_id IS NOT NULL
       AND v_exam.class_id IS DISTINCT FROM v_exam.user_class_id
     )
     OR NOT public.student_has_feature('simulation') THEN
    RAISE EXCEPTION 'EXAM_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_question_count
  FROM public.exam_questions exam_question
  WHERE exam_question.exam_id = p_exam_id;

  SELECT attempt.id, attempt.start_time
  INTO v_existing
  FROM public.exam_attempts attempt
  WHERE attempt.exam_id = p_exam_id
    AND attempt.student_id = auth.uid()
    AND attempt.status = 'in_progress'
  ORDER BY attempt.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE attempt.status IN ('submitted', 'graded'))::integer,
    CASE
      WHEN COALESCE(v_exam.show_results_immediately, false) THEN
        MAX(attempt.score) FILTER (
          WHERE attempt.status IN ('submitted', 'graded')
            AND attempt.grading_status = 'completed'
        )
      ELSE NULL
    END
  INTO v_attempt_count, v_best_score
  FROM public.exam_attempts attempt
  WHERE attempt.exam_id = p_exam_id
    AND attempt.student_id = auth.uid();

  -- Phản chiếu ĐÚNG logic quota trong `start_exam_attempt`:
  --   COALESCE(max_attempts, 1) > 0 AND completed_count >= max_attempts
  -- Nghĩa là NULL được coi như 1 lượt, còn 0 nghĩa là không giới hạn.
  -- Nếu hai chỗ lệch nhau, UI sẽ nói dối học sinh; sửa quota phải sửa cả hai.
  v_effective_max := COALESCE(v_exam.max_attempts, 1);

  IF v_effective_max > 0 THEN
    v_attempts_remaining := GREATEST(0, v_effective_max - COALESCE(v_attempt_count, 0));
  ELSE
    -- Không giới hạn: không có con số "còn lại" nào có nghĩa.
    v_attempts_remaining := NULL;
  END IF;

  RETURN jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'description', v_exam.description,
      'subject', v_exam.subject,
      'duration', v_exam.duration,
      'question_count', COALESCE(v_question_count, 0)
    ),
    'existing_attempt', CASE
      WHEN v_existing.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_existing.id,
        'start_time', v_existing.start_time
      )
    END,
    'attempt_count', COALESCE(v_attempt_count, 0),
    'best_score', v_best_score,
    -- 0 = không giới hạn lượt. Client coi hai khoá này là optional.
    'max_attempts', GREATEST(0, v_effective_max),
    'attempts_remaining', v_attempts_remaining
  );
END;
$$;

-- CREATE OR REPLACE giữ nguyên grant của signature cũ; khai báo lại cho tường minh
-- và để file này an toàn khi chạy độc lập sau 20260722.
REVOKE ALL ON FUNCTION public.get_exam_preparation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_preparation(text) TO authenticated;

COMMIT;
