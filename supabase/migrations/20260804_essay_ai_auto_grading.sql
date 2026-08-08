-- 20260804_essay_ai_auto_grading.sql
--
-- Cho phép AI tự chốt điểm câu tự luận và công bố cho học sinh, theo quyết
-- định sản phẩm ngày 2026-08-03 (xem AGENTS.md mục 4 và
-- docs/ESSAY_AUTO_GRADING_PLAN.md). Giáo viên xem lại và chấm đè bất cứ lúc nào.
--
-- ĐỌC TRƯỚC KHI CHẠY
--
-- 1. Migration này CHỈ phụ thuộc 20260721_essay_assisted_grading.sql (đã áp
--    trên Primary ngày 2026-07-22). Nó KHÔNG phụ thuộc
--    20260722_runtime_security_hardening.sql, nên chạy được ngay mà không cần
--    hoàn tất cutover đang treo.
--
-- 2. Migration KHÔNG tự bật tính năng. Nó chỉ tạo đường ghi điểm. Việc gọi
--    RPC do server điều khiển bằng ESSAY_AI_ENABLED / ESSAY_AI_AUTO_FINALIZE.
--    Nạp file này xong, hệ thống vẫn hoạt động y như cũ.
--
-- 3. Rủi ro đã biết: khi bật, học sinh có thể thấy điểm sai trước khi bất kỳ
--    ai kiểm tra. Với môn Toán, OCR đọc nhầm một dấu âm đủ đảo ngược kết luận.
--    Đừng bật cho lớp thật trước khi benchmark trên bài đã ẩn danh.
--
-- THAY ĐỔI
--   a. `student_answers.grading_status` nhận thêm 'ai_graded'.
--   b. `essay_grading_reviews.reviewer_id` nới thành NULL được, thêm
--      `actor_kind` để phân biệt người với máy. AI không có hàng trong
--      `profiles` nên không thể (và không được) giả làm người duyệt.
--   c. RPC `ai_finalize_essay_answer` — ghi điểm AI, tính lại điểm toàn bài.
--   d. RPC `get_essay_grading_package` — lấy đề/rubric/bài làm cho server chấm.
--
-- ROLLBACK: xem 20260804_essay_ai_auto_grading_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) Trạng thái mới: ai_graded
--
-- KHÔNG tái dùng 'approved' cho điểm máy. Mất phân biệt người/máy là mất khả
-- năng audit, và sau này không lọc ra được những bài AI đã chấm để rà lại.
-- ---------------------------------------------------------------------------

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_grading_status_check;

ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_grading_status_check
  CHECK (grading_status IN (
    'not_required',
    'auto_graded',      -- câu khách quan, máy chấm theo đáp án
    'pending_review',   -- chờ giáo viên
    'ai_graded',        -- AI đã chốt, giáo viên chưa xem lại
    'approved',         -- người đã duyệt (kể cả duyệt đè lên điểm AI)
    'failed'
  ));

-- ---------------------------------------------------------------------------
-- (b) Audit phân biệt người với máy
-- ---------------------------------------------------------------------------

ALTER TABLE public.essay_grading_reviews
  ADD COLUMN IF NOT EXISTS actor_kind text NOT NULL DEFAULT 'teacher';

-- Bản ghi cũ đều do giáo viên tạo; DEFAULT ở trên đã gán đúng.
ALTER TABLE public.essay_grading_reviews
  DROP CONSTRAINT IF EXISTS essay_grading_reviews_actor_kind_check;

ALTER TABLE public.essay_grading_reviews
  ADD CONSTRAINT essay_grading_reviews_actor_kind_check
  CHECK (actor_kind IN ('teacher', 'ai'));

-- reviewer_id phải nullable vì AI không có hàng trong profiles.
ALTER TABLE public.essay_grading_reviews
  ALTER COLUMN reviewer_id DROP NOT NULL;

-- Nhưng không được để cả hai cùng rỗng: bản ghi người BẮT BUỘC có reviewer_id,
-- bản ghi AI BẮT BUỘC không có. Ràng buộc này thay cho NOT NULL vừa gỡ.
ALTER TABLE public.essay_grading_reviews
  DROP CONSTRAINT IF EXISTS essay_grading_reviews_actor_consistency_check;

ALTER TABLE public.essay_grading_reviews
  ADD CONSTRAINT essay_grading_reviews_actor_consistency_check
  CHECK (
    (actor_kind = 'teacher' AND reviewer_id IS NOT NULL)
    OR (actor_kind = 'ai' AND reviewer_id IS NULL)
  );

COMMENT ON COLUMN public.essay_grading_reviews.actor_kind IS
  'teacher = người duyệt (reviewer_id bắt buộc); ai = máy chốt (reviewer_id NULL, model ở ai_model).';

-- ---------------------------------------------------------------------------
-- (c) Lấy gói chấm cho server
--
-- SECURITY DEFINER vì server cần đọc đáp án tham chiếu và rubric — thứ mà
-- student không bao giờ được đọc. Hàm này KHÔNG cấp cho authenticated;
-- chỉ service_role gọi được (xem phần GRANT ở cuối).
--
-- Payload cố ý không chứa student_id, email, tên hay lớp: nó được gửi thẳng
-- sang provider AI bên ngoài.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_essay_grading_package(p_student_answer_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT
    sa.id,
    sa.attempt_id,
    sa.question_id,
    sa.text_answer,
    sa.answer_hash,
    sa.max_score,
    sa.grading_status,
    sa.grading_rubric_version,
    q.content        AS question_content,
    cfg.reference_answer,
    cfg.rubric,
    cfg.rubric_version,
    cfg.ai_enabled,
    cfg.minimum_confidence,
    ea.status        AS attempt_status,
    e.exam_mode
  INTO v_row
  FROM public.student_answers sa
  JOIN public.exam_attempts ea ON ea.id = sa.attempt_id
  JOIN public.exams e          ON e.id = ea.exam_id
  JOIN public.questions q      ON q.id = sa.question_id
  LEFT JOIN public.question_grading_configs cfg ON cfg.question_id = sa.question_id
  WHERE sa.id = p_student_answer_id;

  IF v_row.id IS NULL OR v_row.exam_mode IS DISTINCT FROM 'simulation' THEN
    RAISE EXCEPTION 'ESSAY_ANSWER_NOT_FOUND';
  END IF;
  IF v_row.attempt_status <> 'submitted' THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_SUBMITTED';
  END IF;
  IF v_row.grading_status <> 'pending_review' THEN
    -- Đã chốt rồi thì không chấm lại: tránh worker chạy trùng ghi đè quyết
    -- định của giáo viên.
    RAISE EXCEPTION 'ANSWER_NOT_PENDING';
  END IF;
  IF v_row.reference_answer IS NULL OR v_row.rubric IS NULL THEN
    RAISE EXCEPTION 'GRADING_CONFIG_MISSING';
  END IF;

  RETURN jsonb_build_object(
    'grading_ref',    v_row.answer_hash,
    'rubric_version', v_row.rubric_version,
    'question',       v_row.question_content,
    'reference_answer', v_row.reference_answer,
    'rubric',         v_row.rubric,
    'student_answer', v_row.text_answer,
    'max_score',      v_row.max_score,
    'ai_enabled',     COALESCE(v_row.ai_enabled, false),
    'min_confidence', v_row.minimum_confidence
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- (d) AI chốt điểm
--
-- Đối xứng với review_essay_answer nhưng actor là hệ thống. Mọi kiểm tra của
-- bản người vẫn giữ nguyên: answer hash, rubric version, giới hạn điểm,
-- idempotency theo review_hash.
--
-- Ba khác biệt có chủ đích:
--   - grading_status = 'ai_graded' chứ không phải 'approved';
--   - reviewer_id NULL, actor_kind 'ai';
--   - CHỈ nhận answer đang 'pending_review'. Không cho AI ghi đè lên bài
--     giáo viên đã duyệt, kể cả khi worker chạy lại.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ai_finalize_essay_answer(
  p_student_answer_id text,
  p_answer_hash text,
  p_rubric_version integer,
  p_ai_score numeric,
  p_ai_confidence numeric,
  p_ai_feedback text,
  p_ai_breakdown jsonb,
  p_ai_model text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_answer public.student_answers%ROWTYPE;
  v_attempt_id text;
  v_attempt_status text;
  v_exam_mode text;
  v_pending_count integer;
  v_correct_count integer;
  v_earned_points numeric;
  v_objective_points numeric;
  v_essay_points numeric;
  v_max_points numeric;
  v_final_exam_score numeric;
  v_review_hash text;
BEGIN
  IF p_ai_model IS NULL OR btrim(p_ai_model) = '' THEN
    RAISE EXCEPTION 'AI_MODEL_REQUIRED';
  END IF;
  IF p_ai_confidence IS NULL OR p_ai_confidence < 0 OR p_ai_confidence > 1 THEN
    RAISE EXCEPTION 'INVALID_AI_CONFIDENCE';
  END IF;
  IF p_ai_breakdown IS NOT NULL AND octet_length(p_ai_breakdown::text) > 100000 THEN
    RAISE EXCEPTION 'AI_BREAKDOWN_TOO_LARGE';
  END IF;

  SELECT sa.attempt_id INTO v_attempt_id
  FROM public.student_answers sa
  WHERE sa.id = p_student_answer_id;
  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'ESSAY_ANSWER_NOT_FOUND';
  END IF;

  -- Khoá attempt trước, giống review_essay_answer: hai câu essay của cùng một
  -- bài được chốt đồng thời sẽ tuần tự hoá phần cập nhật tổng hợp.
  SELECT ea.status, e.exam_mode
  INTO v_attempt_status, v_exam_mode
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  WHERE ea.id = v_attempt_id
  FOR UPDATE OF ea;

  SELECT sa.* INTO v_answer
  FROM public.student_answers sa
  WHERE sa.id = p_student_answer_id
    AND sa.attempt_id = v_attempt_id
  FOR UPDATE OF sa;

  IF v_answer.id IS NULL OR v_answer.question_type <> 'essay' THEN
    RAISE EXCEPTION 'ESSAY_ANSWER_NOT_FOUND';
  END IF;
  IF v_answer.text_answer IS NULL OR btrim(v_answer.text_answer) = '' THEN
    RAISE EXCEPTION 'BLANK_ESSAY_ALREADY_FINAL';
  END IF;
  IF v_exam_mode IS DISTINCT FROM 'simulation' OR v_attempt_status <> 'submitted' THEN
    RAISE EXCEPTION 'ESSAY_REVIEW_NOT_ALLOWED';
  END IF;

  -- Chốt chặn quan trọng nhất: AI không bao giờ được đè lên quyết định của
  -- người. Giáo viên duyệt xong thì trạng thái là 'approved', không còn
  -- 'pending_review', nên nhánh này chặn mọi lần worker chạy lại.
  IF v_answer.grading_status <> 'pending_review' THEN
    RAISE EXCEPTION 'ANSWER_NOT_PENDING';
  END IF;

  IF v_answer.answer_hash IS DISTINCT FROM p_answer_hash THEN
    RAISE EXCEPTION 'ANSWER_VERSION_MISMATCH';
  END IF;
  IF v_answer.grading_rubric_version IS DISTINCT FROM p_rubric_version THEN
    RAISE EXCEPTION 'RUBRIC_VERSION_MISMATCH';
  END IF;
  IF p_ai_score IS NULL OR p_ai_score < 0 OR p_ai_score > v_answer.max_score THEN
    RAISE EXCEPTION 'INVALID_AI_SCORE';
  END IF;

  v_review_hash := md5(jsonb_build_object(
    'actor', 'ai',
    'answer_hash', p_answer_hash,
    'rubric_version', p_rubric_version,
    'ai_score', p_ai_score,
    'ai_confidence', p_ai_confidence,
    'ai_feedback', NULLIF(btrim(COALESCE(p_ai_feedback, '')), ''),
    'ai_breakdown', p_ai_breakdown,
    'ai_model', btrim(p_ai_model)
  )::text);

  -- Idempotent: worker retry với cùng payload không tạo bản ghi thứ hai.
  IF EXISTS (
    SELECT 1 FROM public.essay_grading_reviews r
    WHERE r.student_answer_id = p_student_answer_id
      AND r.review_hash = v_review_hash
  ) THEN
    RETURN (
      SELECT jsonb_build_object(
        'attempt_id', a.id,
        'grading_status', a.grading_status,
        'score', a.score,
        'pending_grading_count', a.pending_grading_count,
        'idempotent', true
      )
      FROM public.exam_attempts a WHERE a.id = v_attempt_id
    );
  END IF;

  -- Cờ này mở trigger protect_simulation_answer_grades cho đúng transaction
  -- hiện tại; nó tự hết hiệu lực khi transaction kết thúc.
  PERFORM set_config('app.exam_grading_trusted', 'on', true);

  UPDATE public.student_answers
  SET
    score = p_ai_score,
    is_correct = (p_ai_score = max_score),
    grading_status = 'ai_graded',
    grading_method = 'ai_auto',
    grading_feedback = NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 4000), ''),
    grading_breakdown = p_ai_breakdown,
    grading_confidence = p_ai_confidence,
    ai_score = p_ai_score,
    ai_feedback = NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 8000), ''),
    ai_model = left(btrim(p_ai_model), 200),
    graded_by = NULL,     -- không có người nào chịu trách nhiệm điểm này
    graded_at = now()
  WHERE id = p_student_answer_id;

  INSERT INTO public.essay_grading_reviews (
    student_answer_id, attempt_id, review_hash, answer_hash, rubric_version,
    ai_score, ai_confidence, ai_feedback, ai_breakdown, ai_model,
    final_score, final_feedback, reviewer_id, actor_kind
  ) VALUES (
    p_student_answer_id, v_attempt_id, v_review_hash, p_answer_hash, p_rubric_version,
    p_ai_score, p_ai_confidence,
    NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 8000), ''),
    p_ai_breakdown, left(btrim(p_ai_model), 200),
    p_ai_score,
    NULLIF(left(btrim(COALESCE(p_ai_feedback, '')), 4000), ''),
    NULL, 'ai'
  );

  -- Tính lại tổng hợp. 'ai_graded' được coi là ĐÃ chốt nên không còn tính vào
  -- pending: đó chính là điều khiến điểm toàn bài được công bố.
  SELECT
    COUNT(*) FILTER (
      WHERE question_type = 'essay'
        AND grading_status NOT IN ('approved', 'ai_graded')
    ),
    COALESCE(SUM(score), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type <> 'essay'), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type = 'essay'), 0),
    COALESCE(SUM(max_score), 0),
    COUNT(*) FILTER (WHERE is_correct IS TRUE)
  INTO v_pending_count, v_earned_points, v_objective_points, v_essay_points,
       v_max_points, v_correct_count
  FROM public.student_answers
  WHERE attempt_id = v_attempt_id;

  v_final_exam_score := CASE
    WHEN v_pending_count = 0 AND v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE NULL END;

  UPDATE public.exam_attempts
  SET
    score = v_final_exam_score,
    grading_status = CASE WHEN v_pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
    objective_points = v_objective_points,
    essay_points = v_essay_points,
    earned_points = v_earned_points,
    max_points = v_max_points,
    correct_answers = v_correct_count,
    pending_grading_count = v_pending_count,
    graded_at = CASE WHEN v_pending_count = 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'grading_status', CASE WHEN v_pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
    'score', v_final_exam_score,
    'pending_grading_count', v_pending_count,
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cho phép giáo viên chấm đè lên điểm AI
--
-- review_essay_answer bản 20260721 chỉ nhận answer 'pending_review' một cách
-- gián tiếp (nó không kiểm tra grading_status). Sau migration này, answer do
-- AI chốt mang trạng thái 'ai_graded' và giáo viên vẫn phải duyệt đè được.
-- Không cần sửa hàm đó: nó không lọc theo grading_status, và khi ghi sẽ đặt
-- 'approved' + reviewer_id, đúng như mong muốn.
--
-- Chỉ cần đảm bảo bộ đếm pending của nó cũng hiểu 'ai_graded'. Bản gốc đếm
-- `grading_status <> 'approved'`, tức là sau khi AI chốt mà giáo viên duyệt
-- một câu khác, câu ai_graded sẽ bị đếm là pending và điểm biến mất. Vá lại:
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recount_attempt_grading(p_attempt_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending_count integer;
  v_correct_count integer;
  v_earned numeric;
  v_objective numeric;
  v_essay numeric;
  v_max numeric;
BEGIN
  SELECT
    COUNT(*) FILTER (
      WHERE question_type = 'essay'
        AND grading_status NOT IN ('approved', 'ai_graded')
    ),
    COALESCE(SUM(score), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type <> 'essay'), 0),
    COALESCE(SUM(score) FILTER (WHERE question_type = 'essay'), 0),
    COALESCE(SUM(max_score), 0),
    COUNT(*) FILTER (WHERE is_correct IS TRUE)
  INTO v_pending_count, v_earned, v_objective, v_essay, v_max, v_correct_count
  FROM public.student_answers
  WHERE attempt_id = p_attempt_id;

  UPDATE public.exam_attempts
  SET
    score = CASE WHEN v_pending_count = 0 AND v_max > 0
              THEN round(v_earned / v_max * 10, 2) ELSE NULL END,
    grading_status = CASE WHEN v_pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
    objective_points = v_objective,
    essay_points = v_essay,
    earned_points = v_earned,
    max_points = v_max,
    correct_answers = v_correct_count,
    pending_grading_count = v_pending_count,
    graded_at = CASE WHEN v_pending_count = 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_attempt_id;
END;
$$;

COMMENT ON FUNCTION public.recount_attempt_grading(text) IS
  'Tính lại tổng hợp attempt, coi ai_graded là đã chốt. Dùng để sửa dữ liệu khi cần.';

-- ---------------------------------------------------------------------------
-- Quyền
--
-- Hai RPC mới CHỈ dành cho service_role (worker server). Không cấp cho
-- authenticated: nếu student gọi được ai_finalize_essay_answer thì họ tự chấm
-- điểm cho mình.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_essay_grading_package(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_essay_grading_package(text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_finalize_essay_answer(
  text, text, integer, numeric, numeric, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_finalize_essay_answer(
  text, text, integer, numeric, numeric, text, jsonb, text
) TO service_role;

REVOKE ALL ON FUNCTION public.recount_attempt_grading(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recount_attempt_grading(text) TO service_role;

COMMIT;
