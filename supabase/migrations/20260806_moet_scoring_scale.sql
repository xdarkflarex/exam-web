-- 20260806_moet_scoring_scale.sql
--
-- Chuẩn hoá thang điểm về đúng quy định của Bộ GD&ĐT cho kỳ thi tốt nghiệp THPT:
--
--   Trắc nghiệm 4 phương án   0,25 điểm/câu
--   Đúng/Sai (4 ý)            đúng 4 ý → 1,0 | 3 ý → 0,5 | 2 ý → 0,25 | 1 ý → 0,1 | 0 ý → 0
--   Trả lời ngắn              0,5 điểm/câu
--   Tự luận                   tổng max_score của rubric (giữ nguyên cơ chế đã có)
--
-- PHẠM VI ÁP DỤNG — đọc trước phần còn lại
--
-- Thang trên là quy định của kỳ thi TỐT NGHIỆP THPT, nên nó KHÔNG áp cho mọi đề:
--
--   đề thi thử    exams.scoring_profile = 'moet_standard' → trọng số cố định như
--                 bảng trên, câu Đúng/Sai phải đúng 4 ý, tự luận phải có rubric.
--   đề thi học kì exams.scoring_profile = 'custom' → trường/giáo viên ra ma trận
--                 điểm riêng, tự đặt trọng số từng câu. Không ràng buộc 4 ý,
--                 không ràng buộc tổng 10.
--   bài tập       domain homeworks riêng, không có cột hồ sơ, luôn tự do cấu hình.
--                 Bài tập kèm liên kết tri thức là để luyện một mảng kiến thức,
--                 không có thang chính thức nào để áp.
--
-- BẬC THANG ĐÚNG/SAI ÁP CHO CẢ BA. Nó là cách chấm MỘT CÂU, không phải cách phân
-- bổ điểm cho đề: câu Đúng/Sai 2 điểm trong đề học kì được chấm 2,0 / 1,0 / 0,5 /
-- 0,2 / 0. Chỉ phần TRỌNG SỐ mới phụ thuộc hồ sơ.
--
-- HAI LỖI ĐỘC LẬP ĐANG ĐƯỢC SỬA
--
-- 1. TRỌNG SỐ. `src/app/admin/exams/create/page.tsx` ghi `score = 1` cho mọi câu
--    không phải tự luận, nên cả 106 dòng exam_questions không-tự-luận đều là 1.
--    Vì điểm cuối là round(earned/max*10, 2), đề chuẩn 12 MC + 4 TF + 6 SA có
--    tổng thô 22 thay vì 10, khiến một câu trắc nghiệm đáng 10/22 = 0,4545đ
--    (hào phóng 1,8 lần so với 0,25) còn một câu Đúng/Sai cũng chỉ 0,4545đ
--    (khắt khe 2,2 lần so với 1,0). Backfill ở mục 8 chỉ sửa đề moet_standard —
--    với đề custom, "mọi câu 1 điểm" là một ma trận điểm hợp lệ, không phải lỗi.
--
-- 2. ĐƯỜNG CONG ĐÚNG/SAI. Cả ba hàm chấm đang dùng tỷ lệ tuyến tính
--    round(max_score * correct / total, 4) → 3/4 ý ra 0,75 thay vì 0,5.
--    `check_homework_answer` còn tệ hơn: nó chỉ cho điểm khi đúng cả 4 ý,
--    không có điểm thành phần nào. Lỗi này áp cho cả ba luồng.
--
-- Thang Bộ tự cộng đúng 10,0 với đề chuẩn, nên sau migration này phép quy đổi
-- round(earned/max*10, 2) không làm méo điểm đề chuẩn nữa. Phép quy đổi được
-- GIỮ NGUYÊN để đề không theo cấu trúc chuẩn (đề học kì, đề một chương 12 MC =
-- 3,0 thô, bài tập) vẫn về thang 10.
--
-- ĐỌC TRƯỚC KHI CHẠY
--
-- 1. PHỤ THUỘC `20260722_runtime_security_hardening.sql` ĐÃ ÁP. Migration này
--    CREATE OR REPLACE `submit_exam_attempt_trusted_internal`,
--    `submit_practice_attempt`, `check_homework_answer` — cả ba do 20260722 định
--    nghĩa hoặc đổi tên. Preflight kiểm điều kiện này và DỪNG nếu chưa đạt; chạy
--    sai thứ tự sẽ tạo hàm mồ côi rồi bị 20260722 ghi đè.
--
--    Lưu ý tài liệu: `docs/PROJECT_MAP.md`, `HANDOFF.md` và `docs/RUNBOOK.md`
--    từng nói 20260722 chưa áp. Điều đó SAI — đã xác minh trên Primary ngày
--    2026-08-06 (ba hàm chỉ do 20260722 tạo đều tồn tại). Tài liệu được đính
--    chính cùng đợt này.
--
-- 2. KHÔNG CHẠM wrapper `public.submit_exam_attempt(text, jsonb)`.
--    20260722:1195-1205 RENAME hàm chấm của 20260721 thành
--    `submit_exam_attempt_trusted_internal` rồi bọc bằng `submit_exam_attempt`
--    mới lo phần gating công bố điểm (chỉ trả điểm khi show_results_immediately
--    và grading_status = 'completed'). Ghi đè wrapper là mất phần gating đó.
--    Thân hàm chấm thi thử đang chạy là của 20260721 — vì vậy bên dưới copy
--    nguyên thân từ 20260721:457-767 và chỉ đổi khối true_false.
--
-- 3. KHÔNG CHẠM cổng rubric tự luận (20260721:665-678). Cổng đó đã làm đúng
--    điều chủ dự án yêu cầu: nó lấy SUM((criterion->>'max_score')::numeric) từ
--    question_grading_configs và raise ESSAY_RUBRIC_SCORE_MISMATCH khi lệch
--    exam_questions.score quá 0,0001. Cả 6 config trên Primary đang khớp.
--    Backfill bên dưới cố ý KHÔNG chạm dòng question_type = 'essay'.
--
-- 4. KHÔNG tính lại 14 attempt đã nộp (quyết định của chủ dự án ngày
--    2026-08-06). Điểm cũ nằm ở student_answers.score và exam_attempts.score;
--    migration không đọc, không ghi hai chỗ đó. Công thức mới chỉ áp cho lần nộp
--    sau. Hệ quả cần biết trước: hai attempt cùng một đề, nộp trước và sau
--    2026-08-06, sẽ có điểm khác nhau. Đó KHÔNG phải bug — xem `docs/SCORING.md`.
--
-- PREFLIGHT:  supabase/preflight/20260806_moet_scoring_scale_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260806_moet_scoring_scale_postflight.sql
-- ROLLBACK:   supabase/rollback/20260806_moet_scoring_scale_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hàm bậc thang Đúng/Sai — nguồn duy nhất phía database
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moet_true_false_score(
  p_max_score numeric,
  p_correct integer,
  p_total integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    -- Đầu vào vô nghĩa: trả 0 thay vì NULL. NULL sẽ lan vào
    -- v_earned_points và làm mất điểm cả bài, không chỉ một câu.
    WHEN p_max_score IS NULL OR p_max_score <= 0 THEN 0
    WHEN p_correct IS NULL OR p_total IS NULL OR p_total <= 0 THEN 0

    -- BẬC THANG, không phải tỷ lệ. Đúng 3/4 ý là 0,5đ chứ không phải 0,75đ.
    -- Bậc thang cố ý dốc: ý thứ tư đáng 0,5đ còn ý thứ nhất chỉ 0,1đ, nên
    -- đoán bừa gần như không có lợi. Đúng 0 ý được 0 điểm.
    WHEN p_total = 4 THEN round(p_max_score * CASE least(greatest(p_correct, 0), 4)
      WHEN 4 THEN 1.0
      WHEN 3 THEN 0.5
      WHEN 2 THEN 0.25
      WHEN 1 THEN 0.1
      ELSE 0
    END, 4)

    -- Nhánh tỷ lệ. Với đề moet_standard nhánh này lẽ ra không tồn tại: trigger
    -- enforce_true_false_four_statements chặn câu Đúng/Sai khác 4 ý ngay từ lúc
    -- gắn vào đề. Với đề custom (thi học kì) và bài tập về nhà thì nó HỢP LỆ —
    -- bậc thang 4 bậc không áp được cho câu 2 hay 3 ý, và tỷ lệ là cách hiểu duy
    -- nhất còn nghĩa. Không RAISE ở đây: lỗi ở đây nổ giữa lúc học sinh bấm nộp
    -- và làm mất cả bài làm.
    ELSE round(p_max_score * least(greatest(p_correct, 0), p_total)::numeric / p_total, 4)
  END;
$$;

COMMENT ON FUNCTION public.moet_true_false_score(numeric, integer, integer) IS
  'Bậc thang điểm Đúng/Sai theo Bộ GD&ĐT: 4 ý đúng → max_score, 3 → 0,5·max, '
  '2 → 0,25·max, 1 → 0,1·max, 0 → 0. Phải cho cùng kết quả với trueFalseScore() '
  'trong src/lib/exam/scoring.ts.';

-- Hàm chỉ được gọi từ trong các hàm SECURITY DEFINER (chạy bằng quyền owner),
-- nên client không cần EXECUTE.
REVOKE ALL ON FUNCTION public.moet_true_false_score(numeric, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hồ sơ thang điểm của đề
-- ---------------------------------------------------------------------------
--
-- PHẠM VI. Thang Bộ là quy định của kỳ thi TỐT NGHIỆP THPT, không phải của mọi
-- đề trong hệ thống:
--
--   thi thử      → moet_standard: trọng số 0,25/1,0/0,5 cố định, Đúng/Sai đúng
--                  4 ý, tự luận phải có rubric. Chặn ở cả UI và database.
--   thi học kì   → custom: trường/giáo viên ra ma trận điểm riêng, tự đặt trọng
--                  số từng câu. Không ràng buộc 4 ý, không ràng buộc tổng 10.
--   bài tập      → domain homeworks riêng, KHÔNG có cột này, luôn tự do.
--
-- Bậc thang Đúng/Sai vẫn áp cho CẢ HAI hồ sơ — nó là cách chấm một câu, không
-- phải cách phân bổ điểm cho đề. Đề custom đặt câu Đúng/Sai 2 điểm thì bậc thang
-- thành 2,0 / 1,0 / 0,5 / 0,2 / 0.
--
-- DEFAULT 'custom' chứ không phải 'moet_standard': ba đề đang có trên Primary
-- mang trọng số 1 mỗi câu, gắn nhãn "theo thang Bộ" cho chúng thì trang cấu hình
-- sẽ báo sai lệch trên dữ liệu mà không ai định sửa. Backfill ở mục 8 nâng riêng
-- đề thi thử lên moet_standard.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS scoring_profile text NOT NULL DEFAULT 'custom';

ALTER TABLE public.exams
  DROP CONSTRAINT IF EXISTS exams_scoring_profile_check;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_scoring_profile_check
  CHECK (scoring_profile IN ('moet_standard', 'custom')) NOT VALID;
ALTER TABLE public.exams VALIDATE CONSTRAINT exams_scoring_profile_check;

COMMENT ON COLUMN public.exams.scoring_profile IS
  'moet_standard = đề thi thử theo thang Bộ GD&ĐT (trọng số cố định, Đúng/Sai '
  'đúng 4 ý). custom = đề thi học kì hoặc đề ngoài chuẩn, giáo viên tự đặt trọng '
  'số. Xem docs/SCORING.md.';

-- Giáo viên phải ghi được cột này lúc tạo đề. 20260722:3342-3345 grant INSERT
-- theo danh sách cột đóng, nên cột mới không tự có quyền — thiếu dòng này thì
-- mọi INSERT có scoring_profile bị từ chối và trang tạo đề đứt.
GRANT INSERT (scoring_profile) ON TABLE public.exams TO authenticated;

-- KHÔNG grant UPDATE(scoring_profile). Đổi hồ sơ của đề đã có nghĩa là đổi luật
-- chấm giữa đường: đề từng chặn Đúng/Sai 3 ý bỗng cho phép, hoặc ngược lại. Muốn
-- đổi thang điểm thì tạo đề mới.
--
-- Lưu ý: GRANT theo cột được kiểm ĐỘC LẬP với RLS, và admin cũng đăng nhập bằng
-- role `authenticated`, nên policy admins_manage_exams KHÔNG mở được cột này.
-- Chỉ service_role (route server) hoặc SQL trực tiếp đổi được — đúng như ý muốn.

-- ---------------------------------------------------------------------------
-- 3. Hàng rào 4 ý ở lớp database
-- ---------------------------------------------------------------------------
--
-- Bậc thang trên chỉ có nghĩa với câu đúng 4 ý, nhưng hàng rào này CHỈ áp cho đề
-- có scoring_profile = 'moet_standard' (thi thử). Đề thi học kì là custom: giáo
-- viên được dùng câu Đúng/Sai 2 hoặc 3 ý và hàm chấm rơi về tỷ lệ — hợp lệ, chỉ
-- không phải thang Bộ. Chặn cả đề custom sẽ khiến giáo viên không ra được đề học
-- kì theo ma trận của trường.
--
-- Bài tập về nhà KHÔNG có trigger này. `homework_questions` không có cột hồ sơ và
-- toàn bộ domain đó luôn tự do cấu hình; bài tập kèm liên kết tri thức không có
-- khái niệm thang chính thức nào.
--
-- Cả 42/42 câu true_false trong bank hiện có đúng 4 phương án nên hàng rào không
-- chặn dữ liệu đang có.
--
-- SECURITY DEFINER là bắt buộc: public.answers có RLS, và giáo viên không đọc
-- được đáp án của câu do người khác tạo. Nếu trigger chạy bằng quyền người gọi
-- thì COUNT(*) ra 0 và họ bị chặn oan.

CREATE OR REPLACE FUNCTION public.enforce_true_false_four_statements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scoring_profile text;
  v_question_type text;
  v_statement_count integer;
BEGIN
  SELECT e.scoring_profile INTO v_scoring_profile
  FROM public.exams e
  WHERE e.id = NEW.exam_id;

  -- Đề thi học kì / đề ngoài chuẩn: giáo viên tự chịu trách nhiệm về ma trận
  -- điểm, kể cả câu Đúng/Sai khác 4 ý.
  IF COALESCE(v_scoring_profile, 'custom') <> 'moet_standard' THEN
    RETURN NEW;
  END IF;

  SELECT q.question_type INTO v_question_type
  FROM public.questions q
  WHERE q.id = NEW.question_id;

  IF v_question_type IS DISTINCT FROM 'true_false' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_statement_count
  FROM public.answers a
  WHERE a.question_id = NEW.question_id;

  IF v_statement_count <> 4 THEN
    RAISE EXCEPTION 'TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS'
      USING DETAIL = format(
        'Câu %s có %s ý; thang điểm Đúng/Sai của Bộ chỉ định nghĩa cho đúng 4 ý. '
        || 'Đề thi học kì (scoring_profile = custom) không bị ràng buộc này.',
        NEW.question_id, v_statement_count
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_true_false_four_statements()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS exam_questions_true_false_four_statements ON public.exam_questions;
CREATE TRIGGER exam_questions_true_false_four_statements
  BEFORE INSERT OR UPDATE OF question_id ON public.exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_true_false_four_statements();

-- Bài tập về nhà không dùng thang Bộ nên không có hàng rào này. DROP tường minh
-- để migration idempotent: bản nháp trước của file này từng tạo trigger đó.
DROP TRIGGER IF EXISTS homework_questions_true_false_four_statements ON public.homework_questions;

-- ---------------------------------------------------------------------------
-- 4. Ràng buộc điểm dương cho homework_questions
-- ---------------------------------------------------------------------------
--
-- exam_questions đã có exam_questions_positive_score từ 20260722:200-205.
-- homework_questions thì chưa, và `check_homework_answer` cũng không kiểm.
-- Bảng đang rỗng (0 dòng) nên VALIDATE không tốn gì. Ràng buộc ở đây thay cho
-- việc RAISE trong hàm chấm: lỗi cấu hình phải nổ lúc cấu hình, không phải lúc
-- học sinh đang làm bài.

ALTER TABLE public.homework_questions
  DROP CONSTRAINT IF EXISTS homework_questions_positive_score;
ALTER TABLE public.homework_questions
  ADD CONSTRAINT homework_questions_positive_score CHECK (score > 0) NOT VALID;
ALTER TABLE public.homework_questions VALIDATE CONSTRAINT homework_questions_positive_score;

-- ---------------------------------------------------------------------------
-- 5. Thay công thức Đúng/Sai: thi thử
-- ---------------------------------------------------------------------------
--
-- Thân hàm copy nguyên từ 20260721:457-767 (định nghĩa ĐANG CHẠY, chỉ khác tên
-- do 20260722 rename). Thay đổi duy nhất: khối true_false gọi
-- moet_true_false_score() thay cho round(max * correct / total, 4).

CREATE OR REPLACE FUNCTION public.submit_exam_attempt_trusted_internal(
  p_attempt_id text,
  p_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam_mode text;
  v_question record;
  v_option record;
  v_payload jsonb;
  v_selected_answer text;
  v_selected_answers jsonb;
  v_text_answer text;
  v_is_correct boolean;
  v_answer_valid boolean;
  v_score numeric;
  v_max_score numeric;
  v_objective_points numeric := 0;
  v_essay_points numeric := 0;
  v_earned_points numeric := 0;
  v_max_points numeric := 0;
  v_correct_count integer := 0;
  v_total_count integer := 0;
  v_pending_count integer := 0;
  v_tf_total integer;
  v_tf_correct integer;
  v_tf_value boolean;
  v_rubric_version integer;
  v_rubric_total numeric;
  v_submission_hash text;
  v_final_score numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ANSWERS';
  END IF;
  IF jsonb_array_length(p_answers) > 500 OR octet_length(p_answers::text) > 2000000 THEN
    RAISE EXCEPTION 'ANSWERS_PAYLOAD_TOO_LARGE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item -> 'question_id') IS DISTINCT FROM 'string'
       OR char_length(item ->> 'question_id') NOT BETWEEN 1 AND 200
       OR (item - ARRAY['question_id', 'selected_answer', 'selected_answers', 'text_answer']) <> '{}'::jsonb
       OR (item ? 'selected_answer' AND jsonb_typeof(item -> 'selected_answer') NOT IN ('string', 'null'))
       OR (item ? 'selected_answers' AND jsonb_typeof(item -> 'selected_answers') NOT IN ('object', 'null'))
       OR (item ? 'text_answer' AND jsonb_typeof(item -> 'text_answer') NOT IN ('string', 'null'))
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    GROUP BY item ->> 'question_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_ANSWERS_PAYLOAD';
  END IF;
  v_submission_hash := md5(p_answers::text);

  SELECT ea.*
  INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id
  FOR UPDATE OF ea;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT e.exam_mode
  INTO v_exam_mode
  FROM public.exams e
  WHERE e.id = v_attempt.exam_id;

  IF v_exam_mode IS DISTINCT FROM 'simulation' THEN
    RAISE EXCEPTION 'UNSUPPORTED_EXAM_MODE';
  END IF;

  IF v_attempt.status IN ('submitted', 'graded') THEN
    IF v_attempt.submission_hash IS NOT NULL
       AND v_attempt.submission_hash IS DISTINCT FROM v_submission_hash THEN
      RAISE EXCEPTION 'SUBMISSION_PAYLOAD_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'grading_status', v_attempt.grading_status,
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_STATUS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.exam_questions eq
      WHERE eq.exam_id = v_attempt.exam_id
        AND eq.question_id = item ->> 'question_id'
    )
  ) THEN
    RAISE EXCEPTION 'ANSWER_QUESTION_NOT_IN_EXAM';
  END IF;

  PERFORM set_config('app.exam_grading_trusted', 'on', true);
  DELETE FROM public.student_answers WHERE attempt_id = p_attempt_id;

  FOR v_question IN
    SELECT
      eq.question_id,
      eq.question_type,
      eq.score::numeric AS max_score
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_attempt.exam_id
    ORDER BY eq.part_number, eq.order_in_part
  LOOP
    v_total_count := v_total_count + 1;
    IF v_question.max_score IS NULL OR v_question.max_score <= 0 THEN
      RAISE EXCEPTION 'INVALID_EXAM_QUESTION_SCORE';
    END IF;
    v_max_score := v_question.max_score;
    v_max_points := v_max_points + v_max_score;
    v_payload := NULL;
    v_selected_answer := NULL;
    v_selected_answers := '{}'::jsonb;
    v_text_answer := NULL;
    v_is_correct := false;
    v_score := 0;
    v_rubric_version := NULL;
    v_rubric_total := NULL;

    SELECT item INTO v_payload
    FROM jsonb_array_elements(p_answers) AS item
    WHERE item ->> 'question_id' = v_question.question_id
    LIMIT 1;
    v_payload := COALESCE(v_payload, '{}'::jsonb);

    IF v_question.question_type = 'multiple_choice' THEN
      v_selected_answer := NULLIF(v_payload ->> 'selected_answer', '');
      SELECT
        COALESCE(bool_or(a.id = v_selected_answer), false),
        COALESCE(bool_or(a.id = v_selected_answer AND a.is_correct), false)
      INTO v_answer_valid, v_is_correct
      FROM public.answers a
      WHERE a.question_id = v_question.question_id;

      IF NOT v_answer_valid THEN
        v_selected_answer := NULL;
        v_is_correct := false;
      END IF;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;

    ELSIF v_question.question_type = 'true_false' THEN
      IF jsonb_typeof(v_payload -> 'selected_answers') = 'object' THEN
        v_selected_answers := v_payload -> 'selected_answers';
      END IF;
      v_tf_total := 0;
      v_tf_correct := 0;
      FOR v_option IN
        SELECT order_index, is_correct
        FROM public.answers
        WHERE question_id = v_question.question_id
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
      -- v_is_correct giữ nghĩa cũ "đúng hết" vì nó vào correct_answers dùng cho
      -- thống kê, KHÔNG dùng để tính điểm.
      v_is_correct := v_tf_total > 0 AND v_tf_correct = v_tf_total;
      v_score := public.moet_true_false_score(v_max_score, v_tf_correct, v_tf_total);

    ELSIF v_question.question_type = 'short_answer' THEN
      v_text_answer := NULLIF(btrim(COALESCE(v_payload ->> 'text_answer', '')), '');
      SELECT EXISTS (
        SELECT 1
        FROM public.answers a
        WHERE a.question_id = v_question.question_id
          AND a.is_correct
          AND regexp_replace(lower(btrim(a.content)), '\s+', '', 'g') =
              regexp_replace(lower(COALESCE(v_text_answer, '')), '\s+', '', 'g')
      ) INTO v_is_correct;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;

    ELSIF v_question.question_type = 'essay' THEN
      v_text_answer := NULLIF(btrim(COALESCE(v_payload ->> 'text_answer', '')), '');
      IF char_length(COALESCE(v_text_answer, '')) > 20000 THEN
        RAISE EXCEPTION 'ESSAY_TOO_LONG';
      END IF;
      SELECT
        config.rubric_version,
        COALESCE(SUM((criterion ->> 'max_score')::numeric), 0)
      INTO v_rubric_version, v_rubric_total
      FROM public.question_grading_configs config
      CROSS JOIN LATERAL jsonb_array_elements(config.rubric) AS criterion
      WHERE config.question_id = v_question.question_id
      GROUP BY config.rubric_version;
      IF v_rubric_version IS NULL THEN
        RAISE EXCEPTION 'ESSAY_GRADING_CONFIG_MISSING';
      END IF;
      IF abs(v_rubric_total - v_max_score) > 0.0001 THEN
        RAISE EXCEPTION 'ESSAY_RUBRIC_SCORE_MISMATCH';
      END IF;
      v_is_correct := NULL;
      v_score := CASE WHEN v_text_answer IS NULL THEN 0 ELSE NULL END;
      IF v_text_answer IS NOT NULL THEN
        v_pending_count := v_pending_count + 1;
      END IF;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_QUESTION_TYPE';
    END IF;

    IF v_question.question_type <> 'essay' THEN
      v_objective_points := v_objective_points + COALESCE(v_score, 0);
      IF v_is_correct THEN v_correct_count := v_correct_count + 1; END IF;
    END IF;
    v_earned_points := v_earned_points + COALESCE(v_score, 0);

    INSERT INTO public.student_answers (
      attempt_id,
      question_id,
      question_type,
      selected_answer,
      selected_answers,
      text_answer,
      is_correct,
      score,
      max_score,
      grading_status,
      grading_method,
      grading_rubric_version,
      answer_hash,
      graded_at
    ) VALUES (
      p_attempt_id,
      v_question.question_id,
      v_question.question_type,
      v_selected_answer,
      CASE WHEN v_question.question_type = 'true_false' THEN v_selected_answers ELSE NULL END,
      v_text_answer,
      v_is_correct,
      v_score,
      v_max_score,
      CASE
        WHEN v_question.question_type <> 'essay' THEN 'auto_graded'
        WHEN v_text_answer IS NULL THEN 'approved'
        ELSE 'pending_review'
      END,
      CASE
        WHEN v_question.question_type <> 'essay' THEN 'server_rule'
        WHEN v_text_answer IS NULL THEN 'blank_answer'
        ELSE NULL
      END,
      v_rubric_version,
      md5(COALESCE(v_text_answer, '')),
      CASE WHEN v_question.question_type <> 'essay' OR v_text_answer IS NULL THEN now() ELSE NULL END
    );
  END LOOP;

  v_final_score := CASE WHEN v_pending_count = 0 AND v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE NULL END;

  UPDATE public.exam_attempts
  SET
    status = 'submitted',
    submit_time = now(),
    time_spent = GREATEST(0, EXTRACT(EPOCH FROM (now() - start_time))::integer),
    total_questions = v_total_count,
    correct_answers = v_correct_count,
    score = v_final_score,
    grading_status = CASE WHEN v_pending_count > 0 THEN 'pending_review' ELSE 'completed' END,
    objective_points = v_objective_points,
    essay_points = v_essay_points,
    earned_points = v_earned_points,
    max_points = v_max_points,
    pending_grading_count = v_pending_count,
    submission_hash = v_submission_hash,
    graded_at = CASE WHEN v_pending_count = 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'grading_status', CASE WHEN v_pending_count > 0 THEN 'pending_review' ELSE 'completed' END,
    'score', v_final_score,
    'pending_grading_count', v_pending_count,
    'idempotent', false
  );
END;
$$;

-- CREATE OR REPLACE giữ quyền cũ, nhưng nhắc lại cho rõ: hàm này là internal,
-- client chỉ được gọi qua wrapper submit_exam_attempt.
REVOKE ALL ON FUNCTION public.submit_exam_attempt_trusted_internal(text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Thay công thức Đúng/Sai: ôn tập
-- ---------------------------------------------------------------------------
--
-- Thân hàm copy nguyên từ 20260722:1244-1520. Thay đổi duy nhất: khối
-- true_false. Giữ nguyên EXCEPTION handler tắt app.exam_grading_trusted — bỏ nó
-- là để cờ tin cậy còn bật sau khi hàm lỗi.

CREATE OR REPLACE FUNCTION public.submit_practice_attempt(
  p_attempt_id text,
  p_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam_mode text;
  v_question record;
  v_option record;
  v_payload jsonb;
  v_selected_answer text;
  v_selected_answers jsonb;
  v_text_answer text;
  v_is_correct boolean;
  v_answer_valid boolean;
  v_score numeric;
  v_max_score numeric;
  v_earned_points numeric := 0;
  v_max_points numeric := 0;
  v_correct_count integer := 0;
  v_total_count integer := 0;
  v_tf_total integer;
  v_tf_correct integer;
  v_tf_value boolean;
  v_submission_hash text;
  v_final_score numeric;
BEGIN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ANSWERS';
  END IF;
  IF jsonb_array_length(p_answers) > 500 OR octet_length(p_answers::text) > 2000000 THEN
    RAISE EXCEPTION 'ANSWERS_PAYLOAD_TOO_LARGE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item -> 'question_id') IS DISTINCT FROM 'string'
       OR char_length(item ->> 'question_id') NOT BETWEEN 1 AND 200
       OR (item - ARRAY['question_id', 'selected_answer', 'selected_answers', 'text_answer']) <> '{}'::jsonb
       OR (item ? 'selected_answer' AND jsonb_typeof(item -> 'selected_answer') NOT IN ('string', 'null'))
       OR (item ? 'selected_answers' AND jsonb_typeof(item -> 'selected_answers') NOT IN ('object', 'null'))
       OR (item ? 'text_answer' AND jsonb_typeof(item -> 'text_answer') NOT IN ('string', 'null'))
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    GROUP BY item ->> 'question_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_ANSWERS_PAYLOAD';
  END IF;

  v_submission_hash := md5(p_answers::text);
  SELECT ea.*
  INTO v_attempt
  FROM public.exam_attempts ea
  WHERE ea.id = p_attempt_id
  FOR UPDATE OF ea;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT e.exam_mode
  INTO v_exam_mode
  FROM public.exams e
  WHERE e.id = v_attempt.exam_id;

  IF v_exam_mode <> 'practice' THEN
    RAISE EXCEPTION 'UNSUPPORTED_EXAM_MODE';
  END IF;
  IF v_attempt.status IN ('submitted', 'graded') THEN
    IF v_attempt.submission_hash IS NOT NULL
       AND v_attempt.submission_hash IS DISTINCT FROM v_submission_hash THEN
      RAISE EXCEPTION 'SUBMISSION_PAYLOAD_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'idempotent', true
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_STATUS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_attempt.exam_id
      AND eq.question_type = 'essay'
  ) THEN
    RAISE EXCEPTION 'ESSAY_NOT_ALLOWED_IN_PRACTICE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) AS item
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.exam_questions eq
      WHERE eq.exam_id = v_attempt.exam_id
        AND eq.question_id = item ->> 'question_id'
    )
  ) THEN
    RAISE EXCEPTION 'ANSWER_QUESTION_NOT_IN_EXAM';
  END IF;

  PERFORM set_config('app.exam_grading_trusted', 'on', true);

  FOR v_question IN
    SELECT eq.question_id, eq.question_type, eq.score::numeric AS max_score
    FROM public.exam_questions eq
    WHERE eq.exam_id = v_attempt.exam_id
    ORDER BY eq.part_number, eq.order_in_part
  LOOP
    v_total_count := v_total_count + 1;
    IF v_question.max_score IS NULL OR v_question.max_score <= 0 THEN
      RAISE EXCEPTION 'INVALID_EXAM_QUESTION_SCORE';
    END IF;
    v_max_score := v_question.max_score;
    v_max_points := v_max_points + v_max_score;
    v_payload := NULL;
    v_selected_answer := NULL;
    v_selected_answers := '{}'::jsonb;
    v_text_answer := NULL;
    v_is_correct := false;
    v_score := 0;

    SELECT item INTO v_payload
    FROM jsonb_array_elements(p_answers) AS item
    WHERE item ->> 'question_id' = v_question.question_id
    LIMIT 1;
    v_payload := COALESCE(v_payload, '{}'::jsonb);

    IF v_question.question_type = 'multiple_choice' THEN
      v_selected_answer := NULLIF(v_payload ->> 'selected_answer', '');
      SELECT
        COALESCE(bool_or(a.id = v_selected_answer), false),
        COALESCE(bool_or(a.id = v_selected_answer AND a.is_correct), false)
      INTO v_answer_valid, v_is_correct
      FROM public.answers a
      WHERE a.question_id = v_question.question_id;
      IF NOT v_answer_valid THEN
        v_selected_answer := NULL;
        v_is_correct := false;
      END IF;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;
    ELSIF v_question.question_type = 'true_false' THEN
      IF jsonb_typeof(v_payload -> 'selected_answers') = 'object' THEN
        v_selected_answers := v_payload -> 'selected_answers';
      END IF;
      v_tf_total := 0;
      v_tf_correct := 0;
      FOR v_option IN
        SELECT order_index, is_correct
        FROM public.answers
        WHERE question_id = v_question.question_id
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
      v_score := public.moet_true_false_score(v_max_score, v_tf_correct, v_tf_total);
    ELSIF v_question.question_type = 'short_answer' THEN
      v_text_answer := NULLIF(btrim(COALESCE(v_payload ->> 'text_answer', '')), '');
      IF char_length(COALESCE(v_text_answer, '')) > 20000 THEN
        RAISE EXCEPTION 'ANSWER_TOO_LONG';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.answers a
        WHERE a.question_id = v_question.question_id
          AND a.is_correct
          AND regexp_replace(lower(btrim(a.content)), '\s+', '', 'g') =
              regexp_replace(lower(COALESCE(v_text_answer, '')), '\s+', '', 'g')
      ) INTO v_is_correct;
      v_score := CASE WHEN v_is_correct THEN v_max_score ELSE 0 END;
    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_PRACTICE_QUESTION_TYPE';
    END IF;

    v_earned_points := v_earned_points + COALESCE(v_score, 0);
    IF v_is_correct THEN v_correct_count := v_correct_count + 1; END IF;

    INSERT INTO public.student_answers (
      attempt_id, question_id, question_type, selected_answer,
      selected_answers, text_answer, is_correct, score, max_score,
      grading_status, grading_method, answer_hash, graded_at, answered_at
    ) VALUES (
      p_attempt_id,
      v_question.question_id,
      v_question.question_type,
      v_selected_answer,
      CASE WHEN v_question.question_type = 'true_false' THEN v_selected_answers ELSE NULL END,
      v_text_answer,
      v_is_correct,
      v_score,
      v_max_score,
      'auto_graded',
      'server_rule',
      md5(COALESCE(v_text_answer, v_selected_answer, v_selected_answers::text, '')),
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
      max_score = EXCLUDED.max_score,
      grading_status = EXCLUDED.grading_status,
      grading_method = EXCLUDED.grading_method,
      answer_hash = EXCLUDED.answer_hash,
      graded_at = EXCLUDED.graded_at,
      answered_at = EXCLUDED.answered_at;
  END LOOP;

  v_final_score := CASE WHEN v_max_points > 0
    THEN round(v_earned_points / v_max_points * 10, 2)
    ELSE 0 END;

  UPDATE public.exam_attempts
  SET
    status = 'submitted',
    submit_time = now(),
    time_spent = GREATEST(0, EXTRACT(EPOCH FROM (now() - start_time))::integer),
    total_questions = v_total_count,
    correct_answers = v_correct_count,
    score = v_final_score,
    grading_status = 'completed',
    objective_points = v_earned_points,
    essay_points = 0,
    earned_points = v_earned_points,
    max_points = v_max_points,
    pending_grading_count = 0,
    submission_hash = v_submission_hash,
    graded_at = now(),
    updated_at = now()
  WHERE id = p_attempt_id;

  PERFORM set_config('app.exam_grading_trusted', 'off', true);

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'grading_status', 'completed',
    'score', v_final_score,
    'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.exam_grading_trusted', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_practice_attempt(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_attempt(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Thay công thức Đúng/Sai: bài tập về nhà
-- ---------------------------------------------------------------------------
--
-- Thân hàm copy nguyên từ 20260722:1829-2101. Đây là hàm sai nặng nhất: nó
-- không có điểm thành phần cho Đúng/Sai, chỉ cho điểm khi đúng cả 4 ý.
--
-- Chú ý: điểm được tính HAI LẦN trong hàm gốc — một lần ở INSERT (20260722:2022)
-- và một lần ở payload trả về (20260722:2083). Cả hai đều phải đổi, nếu không
-- điểm hiện cho học sinh khác điểm đã lưu. Bản này gom vào biến v_score, tính
-- một lần, dùng ở cả hai chỗ, để lỗi lệch đó không tái phát.

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
  SELECT q.id, q.question_type, q.explanation, q.solution, hq.score
  INTO v_question
  FROM public.homework_questions hq
  JOIN public.questions q ON q.id = hq.question_id
  WHERE hq.homework_id = v_attempt.homework_id
    AND hq.question_id = p_question_id;

  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'QUESTION_NOT_IN_HOMEWORK';
  END IF;

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
      'is_correct', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false)
          THEN v_existing_answer.is_correct
        ELSE NULL
      END,
      'score', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false)
          THEN v_existing_answer.score
        ELSE NULL
      END,
      'answers', v_answers,
      'explanation', NULL,
      'solution', NULL,
      'answered_questions', v_answered,
      'correct_answers', CASE
        WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
        ELSE NULL
      END,
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
    'is_correct', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_is_correct
      ELSE NULL
    END,
    -- Cùng biến v_score đã ghi vào homework_answers ở trên. Bản gốc tính lại
    -- công thức ở đây, tạo nguy cơ điểm hiện khác điểm lưu.
    'score', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_score
      ELSE NULL
    END,
    'answers', v_answers,
    'explanation', NULL,
    'solution', NULL,
    'answered_questions', v_answered,
    'correct_answers', CASE
      WHEN COALESCE(v_attempt.show_feedback_immediately, false) THEN v_correct
      ELSE NULL
    END,
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
-- 8. Backfill hồ sơ và trọng số
-- ---------------------------------------------------------------------------
--
-- Bước 1: gắn hồ sơ cho đề đang có. Cột vừa thêm có DEFAULT 'custom' nên mọi đề
-- đang là custom; nâng riêng đề thi thử lên moet_standard.
--
-- Vì sao lấy exam_mode = 'simulation' làm tiêu chí: đó là đúng thứ chủ dự án gọi
-- là "đề thi thử". Đề ôn tập không phải kỳ thi nên giữ custom.
--
-- Điểm cần biết trước: từ nay đề THI HỌC KÌ cũng được tạo ở mode 'simulation'
-- (nó là bài thi có giờ), nhưng với scoring_profile = 'custom'. Nghĩa là sau
-- migration này KHÔNG được suy hồ sơ từ exam_mode nữa — hai cột trả lời hai câu
-- hỏi khác nhau: exam_mode nói "làm bài kiểu gì", scoring_profile nói "chấm theo
-- thang nào". Câu UPDATE dưới đây là lần duy nhất chúng được nối với nhau, cho
-- dữ liệu tạo trước khi có cột.

UPDATE public.exams
SET scoring_profile = 'moet_standard'
WHERE exam_mode = 'simulation'
  AND scoring_profile <> 'moet_standard';

-- Bước 2: trọng số theo thang Bộ, CHỈ cho đề moet_standard.
--
-- Chạm cả đề ĐÃ CÓ attempt. Đó là chủ ý và không mâu thuẫn với quyết định
-- "không tính lại điểm cũ": điểm cũ nằm ở student_answers.score và
-- exam_attempts.score, không phải ở đây. Backfill chỉ đổi cách chấm LẦN NỘP SAU.
--
-- Đề custom KHÔNG bị chạm. Trọng số 1 mỗi câu của chúng là một ma trận điểm hợp
-- lệ (điểm sau quy đổi tỷ lệ đúng theo số câu đúng), chỉ không phải thang Bộ.
-- Ghi đè nó là tự ý đổi ma trận điểm của đề thi học kì do giáo viên ra.

UPDATE public.exam_questions eq SET score = CASE eq.question_type
  WHEN 'multiple_choice' THEN 0.25
  WHEN 'true_false'      THEN 1.0
  WHEN 'short_answer'    THEN 0.5
END
FROM public.exams e
WHERE e.id = eq.exam_id
  AND e.scoring_profile = 'moet_standard'
  AND eq.question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND eq.score IS DISTINCT FROM CASE eq.question_type
    WHEN 'multiple_choice' THEN 0.25
    WHEN 'true_false'      THEN 1.0
    WHEN 'short_answer'    THEN 0.5
  END;

-- KHÔNG chạm question_type = 'essay'. Điểm câu tự luận phải bằng tổng rubric;
-- cả 6 config trên Primary đang khớp, và UPDATE mù sẽ làm mọi lần nộp sau raise
-- ESSAY_RUBRIC_SCORE_MISMATCH. Postflight kiểm lại 6 config vẫn khớp.
--
-- KHÔNG backfill homework_questions. Bài tập về nhà không dùng thang Bộ: bài tập
-- kèm liên kết tri thức là để luyện theo một mảng kiến thức, không có thang chính
-- thức nào để áp. Trọng số của chúng giữ nguyên (DEFAULT 1 hoặc giá trị giáo viên
-- đặt). Bản nháp trước của file này có UPDATE homework_questions — đã bỏ.

-- Bước 3: đồng bộ tổng điểm hiển thị cho MỌI đề, kể cả custom. exams.total_score
-- không được dùng để chấm (điểm lấy từ SUM(exam_questions.score) lúc nộp), nhưng
-- lệch nhau thì con số giáo viên thấy nói khác con số máy chấm.
UPDATE public.exams e SET total_score = COALESCE(t.sum_score, 0)
FROM (
  SELECT eq.exam_id, SUM(eq.score) AS sum_score
  FROM public.exam_questions eq
  GROUP BY eq.exam_id
) AS t
WHERE t.exam_id = e.id
  AND e.total_score IS DISTINCT FROM COALESCE(t.sum_score, 0);

COMMIT;
