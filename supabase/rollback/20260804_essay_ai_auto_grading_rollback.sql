-- ROLLBACK cho 20260804_essay_ai_auto_grading.sql
--
-- Dùng khi cần gỡ tính năng AI tự chốt điểm khỏi database.
--
-- CÁCH NHANH HƠN, THỬ TRƯỚC: đặt ESSAY_AI_AUTO_FINALIZE=false trong biến môi
-- trường server rồi restart. Việc đó dừng ngay mọi lời gọi chốt điểm mà không
-- đụng schema và không mất dữ liệu. Chỉ chạy file này khi cần gỡ hẳn cấu trúc.
--
-- CẢNH BÁO: file này chuyển mọi điểm AI đã chốt về trạng thái chờ giáo viên.
-- Học sinh đang thấy điểm sẽ mất điểm đó và thấy "đang chờ chấm" trở lại. Đây
-- là hành vi CỐ Ý — nếu phải rollback thì nghĩa là điểm AI không còn đáng tin.
-- Hãy thông báo cho học sinh trước khi chạy.

BEGIN;

-- 1. Thu hồi quyền trước, để worker không ghi thêm trong lúc đang gỡ.
REVOKE ALL ON FUNCTION public.ai_finalize_essay_answer(
  text, text, integer, numeric, numeric, text, jsonb, text
) FROM service_role;

-- 2. Đưa các answer do AI chốt về hàng chờ giáo viên.
--    Giữ nguyên ai_score/ai_feedback: đó là dữ liệu để giáo viên tham khảo và
--    để điều tra vì sao phải rollback. Chỉ gỡ phần "đã chốt".
UPDATE public.student_answers
SET
  score = NULL,
  is_correct = NULL,
  grading_status = 'pending_review',
  grading_method = 'ai_auto_rolled_back',
  graded_at = NULL
WHERE grading_status = 'ai_graded';

-- 3. Tính lại tổng hợp cho các attempt bị ảnh hưởng, dùng công thức GỐC
--    (chỉ 'approved' mới là đã chốt) vì ai_graded sắp không còn hợp lệ.
WITH affected AS (
  SELECT DISTINCT attempt_id
  FROM public.student_answers
  WHERE grading_method = 'ai_auto_rolled_back'
),
recomputed AS (
  SELECT
    sa.attempt_id,
    COUNT(*) FILTER (
      WHERE sa.question_type = 'essay' AND sa.grading_status <> 'approved'
    ) AS pending_count,
    COALESCE(SUM(sa.score), 0) AS earned,
    COALESCE(SUM(sa.score) FILTER (WHERE sa.question_type <> 'essay'), 0) AS objective,
    COALESCE(SUM(sa.score) FILTER (WHERE sa.question_type = 'essay'), 0) AS essay,
    COALESCE(SUM(sa.max_score), 0) AS max_points,
    COUNT(*) FILTER (WHERE sa.is_correct IS TRUE) AS correct_count
  FROM public.student_answers sa
  WHERE sa.attempt_id IN (SELECT attempt_id FROM affected)
  GROUP BY sa.attempt_id
)
UPDATE public.exam_attempts ea
SET
  score = CASE WHEN r.pending_count = 0 AND r.max_points > 0
            THEN round(r.earned / r.max_points * 10, 2) ELSE NULL END,
  grading_status = CASE WHEN r.pending_count = 0 THEN 'completed' ELSE 'pending_review' END,
  objective_points = r.objective,
  essay_points = r.essay,
  earned_points = r.earned,
  max_points = r.max_points,
  correct_answers = r.correct_count,
  pending_grading_count = r.pending_count,
  graded_at = CASE WHEN r.pending_count = 0 THEN ea.graded_at ELSE NULL END,
  updated_at = now()
FROM recomputed r
WHERE ea.id = r.attempt_id;

-- 4. Gỡ bản ghi audit của AI.
--    Cân nhắc: giữ lại thì tốt cho điều tra, nhưng constraint actor_consistency
--    sắp bị gỡ và reviewer_id sắp NOT NULL trở lại, nên buộc phải xoá.
--    Sao lưu trước nếu cần:
--      CREATE TABLE essay_grading_reviews_ai_backup AS
--      SELECT * FROM public.essay_grading_reviews WHERE actor_kind = 'ai';
DELETE FROM public.essay_grading_reviews WHERE actor_kind = 'ai';

-- 5. Gỡ hàm.
DROP FUNCTION IF EXISTS public.ai_finalize_essay_answer(
  text, text, integer, numeric, numeric, text, jsonb, text
);
DROP FUNCTION IF EXISTS public.get_essay_grading_package(text);
DROP FUNCTION IF EXISTS public.recount_attempt_grading(text);

-- 6. Trả constraint và cột về nguyên trạng 20260721.
ALTER TABLE public.essay_grading_reviews
  DROP CONSTRAINT IF EXISTS essay_grading_reviews_actor_consistency_check;
ALTER TABLE public.essay_grading_reviews
  DROP CONSTRAINT IF EXISTS essay_grading_reviews_actor_kind_check;
ALTER TABLE public.essay_grading_reviews
  ALTER COLUMN reviewer_id SET NOT NULL;
ALTER TABLE public.essay_grading_reviews
  DROP COLUMN IF EXISTS actor_kind;

ALTER TABLE public.student_answers
  DROP CONSTRAINT IF EXISTS student_answers_grading_status_check;
ALTER TABLE public.student_answers
  ADD CONSTRAINT student_answers_grading_status_check
  CHECK (grading_status IN ('not_required', 'auto_graded', 'pending_review', 'approved', 'failed'));

COMMIT;

-- Hậu kiểm rollback: cả ba phải trả 0.
--   SELECT COUNT(*) FROM public.student_answers WHERE grading_status = 'ai_graded';
--   SELECT COUNT(*) FROM information_schema.columns
--     WHERE table_name = 'essay_grading_reviews' AND column_name = 'actor_kind';
--   SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'ai_finalize_essay_answer';
