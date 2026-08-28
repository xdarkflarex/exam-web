-- =====================================================================
-- BÀI TẬP VỀ NHÀ: ĐOẠN LUYỆN CÓ LỜI GIẢI + ĐOẠN KIỂM TRA TÍNH ĐIỂM
-- =====================================================================
--
-- VẤN ĐỀ
-- Giáo viên muốn một bài tập gồm nhiều đoạn luyện (trả lời xong hiện ngay
-- đúng/sai và lời giải) rồi chốt bằng MỘT đoạn kiểm tra: không lộ gì trong lúc
-- làm, và chỉ đoạn này tính điểm.
--
-- Trước migration này không làm được, vì hai lý do:
--   1. `show_feedback_immediately` nằm trên `homework_assignments`, tức MỘT
--      chính sách cho cả bài. Bật thì đoạn kiểm tra cũng lộ đúng/sai.
--   2. `submit_homework_attempt` tính điểm trên TOÀN BỘ câu của bài. Không lách
--      được bằng trọng số 0 cho câu luyện: ràng buộc
--      `homework_questions_positive_score` bắt mọi câu > 0.
--
-- CÁCH LÀM
-- Thêm `homework_questions.phase` ('practice' | 'test'). Ba hàm runtime đọc cột
-- này. Bài KHÔNG có câu 'test' nào giữ nguyên hành vi cũ từng chi tiết một —
-- đó là điều kiện để migration này an toàn với dữ liệu đang chạy.
--
-- BẤT BIẾN PHẢI GIỮ
--   * Câu 'test' KHÔNG BAO GIỜ lộ `is_correct`, `score`, `explanation` hay
--     `solution` trong lúc attempt còn `in_progress`, bất kể
--     `show_feedback_immediately`. Chỉ `allow_review` sau khi nộp mới mở.
--   * Điểm chỉ đổi cách tính KHI bài có câu 'test'. Không có thì công thức cũ
--     (toàn bộ câu) phải chạy y nguyên.
--   * `shown_feedback` vẫn nghĩa là "đã trả lời và đã chấm", KHÔNG phải "học
--     sinh đã thấy lời giải". Đừng dùng nó làm cổng hiển thị: nó là cổng đếm
--     câu đã làm, và đổi nghĩa nó sẽ làm `HOMEWORK_INCOMPLETE` bắn sai.
--
-- REBASE
-- `check_homework_answer` lấy thân từ `20260806_moet_scoring_scale.sql` (bậc
-- thang Đúng/Sai), KHÔNG lấy từ `20260722`. Hai hàm còn lại lấy từ `20260722`
-- vì `20260806` không đụng tới chúng.
--
-- HOÀN TÁC
-- Chạy lại ba hàm từ file gốc tương ứng rồi
-- `ALTER TABLE public.homework_questions DROP COLUMN phase;`. Không mất dữ liệu
-- bài làm: cột này chỉ mô tả cấu trúc đề, không mô tả câu trả lời.

BEGIN;

-- ---------------------------------------------------------------------------
-- PHẦN 0 — TIỀN ĐIỀU KIỆN
-- ---------------------------------------------------------------------------
-- Ba hàm dưới đây được viết đè bằng CREATE OR REPLACE. Nếu chúng chưa tồn tại
-- thì kho migration đang lệch với database, và viết đè sẽ TẠO MỚI một hàm
-- không có REVOKE/GRANT của `20260722` — tức là mở rộng quyền một cách im lặng.
-- Dừng ngay còn hơn.

DO $$
BEGIN
  IF to_regprocedure('public.check_homework_answer(text, text, jsonb)') IS NULL
     OR to_regprocedure('public.submit_homework_attempt(text)') IS NULL
     OR to_regprocedure('public.get_homework_attempt_questions(text)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: ba hàm runtime homework phải tồn tại trước khi chạy file này';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- PHẦN 1 — CỘT PHASE
-- ---------------------------------------------------------------------------
-- DEFAULT 'practice' để mọi dòng có sẵn giữ đúng nghĩa cũ. Quyền: `20260722`
-- cấp GRANT ở mức BẢNG cho `homework_questions`, nên cột mới thừa hưởng, không
-- phải cấp thêm gì. (Đừng đổi sang grant theo cột ở đây — làm thế là âm thầm
-- thu hẹp quyền của các cột khác.)

ALTER TABLE public.homework_questions
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'practice';

ALTER TABLE public.homework_questions
  DROP CONSTRAINT IF EXISTS homework_questions_phase_check;
ALTER TABLE public.homework_questions
  ADD CONSTRAINT homework_questions_phase_check
  CHECK (phase IN ('practice', 'test')) NOT VALID;
ALTER TABLE public.homework_questions
  VALIDATE CONSTRAINT homework_questions_phase_check;

CREATE INDEX IF NOT EXISTS homework_questions_homework_phase_idx
  ON public.homework_questions (homework_id, phase);

-- ---------------------------------------------------------------------------
-- PHẦN 2 — PAYLOAD LÚC MỞ BÀI / TẢI LẠI
-- ---------------------------------------------------------------------------
-- Ba thay đổi so với `20260722`:
--   * trả thêm `phase` để runner gom đoạn kiểm tra thành một đoạn cuối;
--   * `is_correct` của câu đã lưu chỉ mở cho câu luyện;
--   * `explanation`/`solution` mở cho câu luyện ĐÃ TRẢ LỜI (`saved.id IS NOT
--     NULL`). Điều kiện "đã trả lời" là thứ giữ cho payload không thành đường
--     đọc trước lời giải: tải lại trang giữa chừng vẫn thấy lời giải của câu
--     mình đã làm, chưa làm thì không.
CREATE OR REPLACE FUNCTION public.get_homework_attempt_questions(p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_reveal boolean;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT
    hta.id,
    hta.assignment_id,
    hta.student_id,
    hta.status,
    hta.current_session_index,
    hwa.homework_id,
    COALESCE(NULLIF(hwa.title, ''), h.title) AS title,
    h.session_size,
    hwa.show_feedback_immediately,
    hwa.allow_review
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  JOIN public.homeworks h ON h.id = hwa.homework_id
  WHERE hta.id = p_attempt_id;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'in_progress'
     AND NOT public.student_has_feature('homework') THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  v_reveal := v_attempt.status IN ('submitted', 'graded')
    AND COALESCE(v_attempt.allow_review, false);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'content', q.content,
        'question_type', q.question_type,
        'order_index', hq.order_index,
        'phase', hq.phase,
        'tikz_image_url', q.tikz_image_url,
        -- Lời giải chỉ đi kèm câu ĐÃ TRẢ LỜI của đoạn luyện. Bỏ điều kiện
        -- `saved.id IS NOT NULL` là biến payload mở bài thành đường đọc trước
        -- lời giải của mọi câu.
        'explanation', CASE
          WHEN v_reveal
            OR (
              COALESCE(v_attempt.show_feedback_immediately, false)
              AND hq.phase <> 'test'
              AND saved.id IS NOT NULL
            )
            THEN q.explanation
          ELSE NULL
        END,
        'solution', CASE
          WHEN v_reveal
            OR (
              COALESCE(v_attempt.show_feedback_immediately, false)
              AND hq.phase <> 'test'
              AND saved.id IS NOT NULL
            )
            THEN q.solution
          ELSE NULL
        END,
        'answers', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'content', a.content,
              'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE false END,
              'order_index', a.order_index
            )
            ORDER BY a.order_index, a.id
          )
          FROM public.answers a
          WHERE a.question_id = q.id
            AND (v_reveal OR q.question_type IN ('multiple_choice', 'true_false'))
        ), '[]'::jsonb),
        'saved_answer', CASE WHEN saved.id IS NULL THEN NULL ELSE jsonb_build_object(
          'selected_answer', saved.selected_answer,
          'selected_answers', saved.selected_answers,
          'text_answer', saved.text_answer,
          'is_correct', CASE
            WHEN v_reveal
              OR (COALESCE(v_attempt.show_feedback_immediately, false) AND hq.phase <> 'test')
              THEN saved.is_correct
            ELSE NULL
          END,
          'shown_feedback', saved.shown_feedback
        ) END
      )
      -- Đoạn kiểm tra luôn nằm cuối, không phụ thuộc `order_index` giáo viên
      -- đặt: runner cắt đoạn theo đúng thứ tự của mảng này.
      ORDER BY (hq.phase = 'test'), hq.order_index, hq.id
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  LEFT JOIN public.homework_answers saved
    ON saved.attempt_id = p_attempt_id
   AND saved.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'current_session_index', v_attempt.current_session_index
    ),
    'homework', jsonb_build_object(
      'title', v_attempt.title,
      'session_size', v_attempt.session_size,
      'show_feedback_immediately', v_attempt.show_feedback_immediately,
      'allow_review', v_attempt.allow_review
    ),
    'questions', v_questions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_homework_attempt_questions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_homework_attempt_questions(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- PHẦN 3 — CHẤM TỪNG CÂU
-- ---------------------------------------------------------------------------
-- Thân hàm lấy từ `20260806` (bậc thang Đúng/Sai). Thay đổi:
--   * `v_feedback` = chính sách của lần giao VÀ câu không thuộc đoạn kiểm tra;
--     mọi chỗ quyết định "có lộ cho học sinh không" đọc biến này;
--   * trả `explanation`/`solution` thật cho câu luyện — trước nay hai trường
--     này luôn NULL nên hướng dẫn giải chưa bao giờ tới được học sinh, dù giao
--     diện đã có sẵn chỗ hiển thị;
--   * `homework_attempts.correct_answers` VẪN theo chính sách của lần giao,
--     không theo `v_feedback`. Nếu đọc `v_feedback` thì mỗi lần học sinh trả
--     lời một câu kiểm tra, bộ đếm của cả bài bị ghi về 0.
CREATE OR REPLACE FUNCTION public.check_homework_answer(
  p_attempt_id text,
  p_question_id text,
  p_answer jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_question record;
  v_option record;
  v_selected_answer text;
  v_selected_answers jsonb := '{}'::jsonb;
  v_text_answer text;
  v_is_correct boolean := false;
  v_answer_valid boolean;
  v_score numeric := 0;
  v_tf_total integer := 0;
  v_tf_correct integer := 0;
  v_tf_value boolean;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_answers jsonb;
  v_existing_answer public.homework_answers%ROWTYPE;
  /* Cổng hiển thị của RIÊNG câu này: chính sách của lần giao VÀ câu không thuộc
     đoạn kiểm tra. Mặc định `false` là có chủ ý — thiếu dữ liệu thì giấu, không
     phải lộ. */
  v_feedback boolean := false;
BEGIN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_answer IS NULL OR jsonb_typeof(p_answer) <> 'object'
     OR octet_length(p_answer::text) > 100000 THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ANSWER';
  END IF;

  SELECT
    hta.id,
    hta.assignment_id,
    hta.student_id,
    hta.status,
    hwa.homework_id,
    hwa.show_feedback_immediately
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  WHERE hta.id = p_attempt_id
  FOR UPDATE OF hta;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT q.id, q.question_type, q.explanation, q.solution, hq.score, hq.phase
  INTO v_question
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id
    AND hq.question_id = p_question_id;

  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'QUESTION_NOT_IN_HOMEWORK';
  END IF;

  v_feedback := COALESCE(v_attempt.show_feedback_immediately, false)
    AND COALESCE(v_question.phase, 'practice') <> 'test';

  SELECT hwa.*
  INTO v_existing_answer
  FROM public.homework_answers hwa
  WHERE hwa.attempt_id = p_attempt_id
    AND hwa.question_id = p_question_id
  FOR UPDATE;

  IF v_existing_answer.id IS NOT NULL THEN
    SELECT
      COUNT(*),
      COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
      COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct)
    INTO v_total, v_answered, v_correct
    FROM public.homework_questions hq
    LEFT JOIN public.homework_answers hwa
      ON hwa.attempt_id = p_attempt_id
     AND hwa.question_id = hq.question_id
    WHERE hq.homework_id = v_attempt.homework_id;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'content', a.content,
        'is_correct', false,
        'order_index', a.order_index
      ) ORDER BY a.order_index, a.id
    ), '[]'::jsonb)
    INTO v_answers
    FROM public.answers a
    WHERE a.question_id = p_question_id
      AND v_question.question_type IN ('multiple_choice', 'true_false');

    RETURN jsonb_build_object(
      'question_id', p_question_id,
      'is_correct', CASE WHEN v_feedback THEN v_existing_answer.is_correct ELSE NULL END,
      'score', CASE WHEN v_feedback THEN v_existing_answer.score ELSE NULL END,
      'answers', v_answers,
      'explanation', CASE WHEN v_feedback THEN v_question.explanation ELSE NULL END,
      'solution', CASE WHEN v_feedback THEN v_question.solution ELSE NULL END,
      'answered_questions', v_answered,
      -- Tổng số câu đúng cũng phải theo `v_feedback`: trả về nó khi học sinh
      -- vừa làm một câu kiểm tra là để lộ đáp án qua độ chênh của bộ đếm.
      'correct_answers', CASE WHEN v_feedback THEN v_correct ELSE NULL END,
      'total_questions', v_total,
      'idempotent', true
    );
  END IF;

  IF NOT public.can_work_on_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ATTEMPT_STATUS';
  END IF;

  IF v_question.question_type = 'multiple_choice' THEN
    v_selected_answer := NULLIF(p_answer ->> 'selected_answer', '');
    SELECT
      COALESCE(bool_or(a.id = v_selected_answer), false),
      COALESCE(bool_or(a.id = v_selected_answer AND a.is_correct), false)
    INTO v_answer_valid, v_is_correct
    FROM public.answers a
    WHERE a.question_id = p_question_id;
    IF NOT v_answer_valid THEN
      RAISE EXCEPTION 'INVALID_SELECTED_ANSWER';
    END IF;
    v_score := CASE WHEN v_is_correct THEN v_question.score ELSE 0 END;
  ELSIF v_question.question_type = 'true_false' THEN
    IF jsonb_typeof(p_answer -> 'selected_answers') = 'object' THEN
      v_selected_answers := p_answer -> 'selected_answers';
    END IF;
    FOR v_option IN
      SELECT order_index, is_correct
      FROM public.answers
      WHERE question_id = p_question_id
      ORDER BY order_index
    LOOP
      v_tf_total := v_tf_total + 1;
      v_tf_value := NULL;
      IF jsonb_typeof(v_selected_answers -> (v_option.order_index::text)) = 'boolean' THEN
        v_tf_value := (v_selected_answers ->> (v_option.order_index::text))::boolean;
      END IF;
      IF v_tf_value IS NOT NULL AND v_tf_value = v_option.is_correct THEN
        v_tf_correct := v_tf_correct + 1;
      END IF;
    END LOOP;
    v_is_correct := v_tf_total > 0 AND v_tf_correct = v_tf_total;
    -- Trước migration này, 3/4 ý được 0 điểm. Giờ được 0,5·score.
    v_score := public.moet_true_false_score(v_question.score, v_tf_correct, v_tf_total);
  ELSIF v_question.question_type = 'short_answer' THEN
    v_text_answer := NULLIF(btrim(COALESCE(p_answer ->> 'text_answer', '')), '');
    IF v_text_answer IS NULL OR char_length(v_text_answer) > 20000 THEN
      RAISE EXCEPTION 'INVALID_TEXT_ANSWER';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.answers a
      WHERE a.question_id = p_question_id
        AND a.is_correct
        AND replace(regexp_replace(lower(btrim(a.content)), '\s+', '', 'g'), ',', '.') =
            replace(regexp_replace(lower(v_text_answer), '\s+', '', 'g'), ',', '.')
    ) INTO v_is_correct;
    v_score := CASE WHEN v_is_correct THEN v_question.score ELSE 0 END;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_HOMEWORK_QUESTION_TYPE';
  END IF;

  PERFORM set_config('app.homework_grading_trusted', 'on', true);

  INSERT INTO public.homework_answers (
    attempt_id, question_id, question_type, selected_answer,
    selected_answers, text_answer, is_correct, score,
    shown_feedback, answered_at, updated_at
  ) VALUES (
    p_attempt_id,
    p_question_id,
    v_question.question_type,
    v_selected_answer,
    CASE WHEN v_question.question_type = 'true_false' THEN v_selected_answers ELSE NULL END,
    v_text_answer,
    v_is_correct,
    v_score,
    true,
    now(),
    now()
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    question_type = EXCLUDED.question_type,
    selected_answer = EXCLUDED.selected_answer,
    selected_answers = EXCLUDED.selected_answers,
    text_answer = EXCLUDED.text_answer,
    is_correct = EXCLUDED.is_correct,
    score = EXCLUDED.score,
    shown_feedback = true,
    answered_at = EXCLUDED.answered_at,
    updated_at = now();

  SELECT
    COUNT(*),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct)
  INTO v_total, v_answered, v_correct
  FROM public.homework_questions hq
  LEFT JOIN public.homework_answers hwa
    ON hwa.attempt_id = p_attempt_id
   AND hwa.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  UPDATE public.homework_attempts
  SET
    total_questions = v_total,
    answered_questions = v_answered,
    correct_answers = CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.homework_grading_trusted', 'off', true);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'content', a.content,
      'is_correct', false,
      'order_index', a.order_index
    ) ORDER BY a.order_index, a.id
  ), '[]'::jsonb)
  INTO v_answers
  FROM public.answers a
  WHERE a.question_id = p_question_id
    AND v_question.question_type IN ('multiple_choice', 'true_false');

  RETURN jsonb_build_object(
    'question_id', p_question_id,
    'is_correct', CASE WHEN v_feedback THEN v_is_correct ELSE NULL END,
    -- Cùng biến v_score đã ghi vào homework_answers ở trên. Bản gốc tính lại
    -- công thức ở đây, tạo nguy cơ điểm hiện khác điểm lưu.
    'score', CASE WHEN v_feedback THEN v_score ELSE NULL END,
    'answers', v_answers,
    'explanation', CASE WHEN v_feedback THEN v_question.explanation ELSE NULL END,
    'solution', CASE WHEN v_feedback THEN v_question.solution ELSE NULL END,
    'answered_questions', v_answered,
    'correct_answers', CASE WHEN v_feedback THEN v_correct ELSE NULL END,
    'total_questions', v_total,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_homework_answer(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_homework_answer(text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- PHẦN 4 — NỘP BÀI VÀ TÍNH ĐIỂM
-- ---------------------------------------------------------------------------
-- Thân hàm lấy từ `20260722`. Thay đổi duy nhất: khi bài CÓ câu 'test', tử số
-- và mẫu số của điểm chỉ lấy trên các câu 'test'.
--
-- Phép kiểm "đã làm hết" vẫn tính trên TOÀN BỘ câu: học sinh phải đi qua đủ các
-- đoạn luyện rồi mới nộp được, đó chính là chỗ "bắt buộc" của thiết kế này.
CREATE OR REPLACE FUNCTION public.submit_homework_attempt(p_attempt_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_earned_points numeric;
  v_max_points numeric;
  v_score numeric;
  /* Bài có đoạn kiểm tra hay không. Đây là công tắc giữ tương thích ngược: bài
     cũ (toàn 'practice') cho `false` và công thức điểm chạy y như trước. */
  v_has_test boolean;
BEGIN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT hta.id, hta.assignment_id, hta.student_id, hta.status, hwa.homework_id, hta.score
  INTO v_attempt
  FROM public.homework_attempts hta
  JOIN public.homework_assignments hwa ON hwa.id = hta.assignment_id
  WHERE hta.id = p_attempt_id
  FOR UPDATE OF hta;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'HOMEWORK_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status IN ('submitted', 'graded') THEN
    RETURN jsonb_build_object(
      'attempt_id', p_attempt_id,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_ATTEMPT_STATUS';
  END IF;
  IF NOT public.can_work_on_homework_assignment(v_attempt.assignment_id) THEN
    RAISE EXCEPTION 'HOMEWORK_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.homework_questions hq
    WHERE hq.homework_id = v_attempt.homework_id
      AND hq.phase = 'test'
  ) INTO v_has_test;

  /* v_total/v_answered/v_correct đếm TOÀN BỘ câu — đó là phép kiểm "đã làm hết"
     và là số liệu tiến độ hiện cho giáo viên.
     v_earned_points/v_max_points thì chỉ lấy đoạn kiểm tra khi bài có đoạn đó:
     điểm là điểm của bài kiểm tra, không phải điểm của phần luyện. */
  SELECT
    COUNT(*),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback),
    COUNT(hwa.id) FILTER (WHERE hwa.shown_feedback AND hwa.is_correct),
    COALESCE(SUM(hwa.score) FILTER (
      WHERE hwa.shown_feedback AND (NOT v_has_test OR hq.phase = 'test')
    ), 0),
    COALESCE(SUM(hq.score) FILTER (
      WHERE NOT v_has_test OR hq.phase = 'test'
    ), 0)
  INTO v_total, v_answered, v_correct, v_earned_points, v_max_points
  FROM public.homework_questions hq
  LEFT JOIN public.homework_answers hwa
    ON hwa.attempt_id = p_attempt_id
   AND hwa.question_id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'HOMEWORK_HAS_NO_QUESTIONS';
  END IF;
  IF v_answered <> v_total THEN
    RAISE EXCEPTION 'HOMEWORK_INCOMPLETE';
  END IF;

  IF v_max_points <= 0 THEN
    RAISE EXCEPTION 'INVALID_HOMEWORK_QUESTION_SCORE';
  END IF;
  v_score := round(v_earned_points / v_max_points * 10, 2);
  PERFORM set_config('app.homework_grading_trusted', 'on', true);

  UPDATE public.homework_attempts
  SET
    status = 'submitted',
    submitted_at = now(),
    total_questions = v_total,
    answered_questions = v_answered,
    correct_answers = v_correct,
    score = v_score,
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.homework_grading_trusted', 'off', true);

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'score', v_score,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.homework_grading_trusted', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_homework_attempt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_homework_attempt(text) TO authenticated;

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau khi COMMIT, mọi cột `must_be_zero` phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'homework_questions'
--       AND column_name = 'phase') - 1                        AS must_be_zero_thieu_cot,
--   (SELECT count(*) FROM public.homework_questions
--     WHERE phase NOT IN ('practice', 'test'))                AS must_be_zero_phase_la,
--   (SELECT count(*) FROM pg_constraint
--     WHERE conname = 'homework_questions_phase_check'
--       AND NOT convalidated)                                 AS must_be_zero_check_chua_validate,
--   (SELECT count(*) FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('check_homework_answer', 'submit_homework_attempt',
--                        'get_homework_attempt_questions')
--      AND NOT p.prosecdef)                                   AS must_be_zero_mat_security_definer,
--   (SELECT count(*) FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('check_homework_answer', 'submit_homework_attempt',
--                        'get_homework_attempt_questions')
--      AND has_function_privilege('anon', p.oid, 'EXECUTE'))  AS must_be_zero_anon_goi_duoc;
--
-- Và một phép kiểm hành vi, không phải cấu trúc: bài CŨ (không có câu 'test')
-- phải cho ra đúng điểm như trước. Chọn một attempt đã nộp rồi so:
--
-- SELECT hta.id, hta.score AS diem_da_luu,
--        round(
--          COALESCE(SUM(hwa.score) FILTER (WHERE hwa.shown_feedback), 0)
--          / NULLIF(SUM(hq.score), 0) * 10, 2)                AS diem_tinh_lai
-- FROM public.homework_attempts hta
-- JOIN public.homework_assignments hasg ON hasg.id = hta.assignment_id
-- JOIN public.homework_questions hq ON hq.homework_id = hasg.homework_id
-- LEFT JOIN public.homework_answers hwa
--        ON hwa.attempt_id = hta.id AND hwa.question_id = hq.question_id
-- WHERE hta.status IN ('submitted', 'graded')
-- GROUP BY hta.id, hta.score
-- HAVING hta.score IS DISTINCT FROM round(
--          COALESCE(SUM(hwa.score) FILTER (WHERE hwa.shown_feedback), 0)
--          / NULLIF(SUM(hq.score), 0) * 10, 2);
--
-- Truy vấn cuối phải trả 0 dòng. Ra dòng nào là điểm của bài đã nộp không còn
-- tái tạo được bằng công thức cũ — dừng và đọc lại PHẦN 4 trước khi giao bài.
