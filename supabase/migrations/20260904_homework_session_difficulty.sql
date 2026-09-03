-- =====================================================================
-- BÀI TẬP VỀ NHÀ: MỖI ĐOẠN LÀ MỘT ĐƯỜNG DỐC DỄ -> KHÓ
-- =====================================================================
--
-- YÊU CẦU (chủ dự án, 2026-09-03): một đoạn 10 câu thì 10 câu đó phải đi từ dễ
-- tới khó theo NB, TH, VD, VDC — chứ không phải cả bài dễ tới khó rồi cắt, vì
-- cắt kiểu đó cho ra một đoạn cuối gồm mười câu vận dụng cao liên tiếp.
--
-- MIGRATION NÀY LÀM ĐÚNG MỘT VIỆC: trả thêm `cognitive_level` và `difficulty`
-- vào payload mở bài. Luật xếp đoạn nằm ở client (`src/lib/homework/session-order.ts`,
-- hàm thuần, có test) vì nó chỉ là thứ tự hiển thị — không đụng tới chấm điểm,
-- không đụng tới quyền đọc, nên không có lý do gì phải chôn nó vào SQL.
--
-- THÂN HÀM LẤY NGUYÊN TỪ `20260827_homework_test_phase.sql`, chép máy móc rồi
-- chèn thêm hai trường. Mọi mệnh đề `v_reveal`, `show_feedback_immediately`,
-- `saved.id IS NOT NULL` giữ nguyên từng ký tự — chúng là các cổng giữ cho lời
-- giải không rò ra trước chính sách, và file này KHÔNG có lý do chạm vào chúng.
--
-- VÌ SAO KHÔNG CẦN CỔNG CHO HAI TRƯỜNG MỚI. Độ khó đã hiện công khai thành
-- nhãn NB/TH/VD/VDC ở giao diện học sinh (`COGNITIVE_LABELS`), và biết một câu
-- ở mức VDC không cho biết đáp án của nó. Ngược lại, đặt cổng vào đây thì học
-- sinh đang làm bài dở sẽ nhận `cognitive_level = NULL`, và mọi câu tụt về 'NB'
-- — bài mất đường dốc đúng lúc cần nó nhất.
--
-- MỘT LẦN XẾP LẠI. Bài đang có attempt `in_progress` lúc deploy sẽ đổi thứ tự
-- một lần. Không mất dữ liệu: `homework_answers` khoá theo `question_id`, còn
-- `current_session_index` chỉ là con trỏ đoạn. Học sinh có thể thấy một câu
-- mình đã làm nằm ở đoạn khác trước đó — chấp nhận được, và chỉ xảy ra một lần.
--
-- HOÀN TÁC: chạy lại khối `get_homework_attempt_questions` của
-- `20260827_homework_test_phase.sql`. Không có thay đổi schema nào để lùi.

BEGIN;

-- ---------------------------------------------------------------------------
-- TIỀN ĐIỀU KIỆN
-- ---------------------------------------------------------------------------
-- Cùng lý do như `20260827`: CREATE OR REPLACE lên một hàm chưa tồn tại sẽ TẠO
-- MỚI một hàm không mang REVOKE/GRANT của `20260722` — nới quyền trong im lặng.
-- Kiểm luôn hai cột được đọc: thiếu cột thì hàm mới không biên dịch nổi và cả
-- luồng mở bài tập chết, nên dừng ở đây rõ ràng hơn nhiều.

DO $$
BEGIN
  IF to_regprocedure('public.get_homework_attempt_questions(text)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: get_homework_attempt_questions phải tồn tại trước khi chạy file này';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions'
      AND column_name IN ('cognitive_level', 'difficulty')
    GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: questions phải có cả cognitive_level và difficulty';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- PAYLOAD MỞ BÀI — thêm cognitive_level và difficulty
-- ---------------------------------------------------------------------------
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
        -- Mức nhận thức của câu. Client dùng nó để xếp mỗi đoạn thành một
        -- đường dốc dễ -> khó (`src/lib/homework/session-order.ts`).
        --
        -- KHÔNG PHẢI DỮ LIỆU NHẠY CẢM: độ khó đã hiện thành nhãn NB/TH/VD/VDC
        -- ở khắp giao diện học sinh, và biết một câu ở mức VDC không cho biết
        -- đáp án của nó. Đây là lý do hai trường này nằm ngoài mọi mệnh đề
        -- `CASE WHEN v_reveal` — đừng thêm cổng cho chúng, vì cổng đó sẽ làm
        -- việc xếp đoạn hỏng đúng lúc học sinh đang làm bài dở.
        'cognitive_level', q.cognitive_level,
        'difficulty', q.difficulty,
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

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT, mọi cột `must_be_zero` phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname = 'get_homework_attempt_questions'
--       AND NOT p.prosecdef)                                  AS must_be_zero_mat_security_definer,
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname = 'get_homework_attempt_questions'
--       AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS must_be_zero_anon_goi_duoc,
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname = 'get_homework_attempt_questions'
--       AND p.prosrc NOT LIKE '%cognitive_level%')            AS must_be_zero_thieu_truong_moi;
--
-- Và một phép kiểm hành vi, vì hậu kiểm catalog KHÔNG chứng minh được hàm chạy
-- đúng. Đăng nhập bằng JWT của một học sinh có bài đang làm rồi gọi:
--
--   select jsonb_array_length(get_homework_attempt_questions('<attempt_id>') -> 'questions');
--   select (get_homework_attempt_questions('<attempt_id>') -> 'questions' -> 0) ? 'cognitive_level';
--
-- Câu đầu phải bằng đúng số câu của bài; câu sau phải trả `true`. Chạy trong
-- Supabase SQL Editor KHÔNG có giá trị ở đây: editor chạy bằng vai trò chủ sở
-- hữu nên `auth.uid()` là NULL và hàm sẽ ném UNAUTHENTICATED.
