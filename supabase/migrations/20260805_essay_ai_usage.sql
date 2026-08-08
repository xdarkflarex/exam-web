-- 20260805_essay_ai_usage.sql
--
-- Nhật ký mọi lời gọi provider AI chấm tự luận: token, chi phí, kết quả quyết
-- định. Ba mục đích, theo docs/ESSAY_AUTO_GRADING_PLAN.md mục 7:
--
--   1. Nguồn duy nhất để tính trần chi phí tháng (ESSAY_AI_MONTHLY_COST_CAP).
--      Không có bảng này thì `decideFinalization` luôn nhận
--      monthToDateCostUsd = 0 và trần không bao giờ có tác dụng.
--   2. Chống gọi trùng: UNIQUE (input_hash) khiến worker chạy lại không trả
--      tiền lần thứ hai cho cùng một bài + cùng rubric + cùng model.
--   3. Đo tỷ lệ giáo viên chấm đè và độ lớn sai lệch — chỉ số quyết định có
--      được phép bật ESSAY_AI_AUTO_FINALIZE hay không.
--
-- ĐỌC TRƯỚC KHI CHẠY
--
-- 1. Migration này CHỈ tạo mới (bảng + index + một hàm tên chưa từng tồn tại).
--    Nó KHÔNG `CREATE OR REPLACE` hàm nào của migration khác, nên KHÔNG phụ
--    thuộc cutover 20260722 đang treo và chạy được ngay.
--
-- 2. Bảng lưu `ai_score` gắn với `student_answer_id`. Học sinh đọc được nghĩa
--    là thấy điểm trước khi công bố. Vì vậy: RLS bật, KHÔNG có policy nào,
--    và REVOKE khỏi anon/authenticated. Chỉ service_role (bypass RLS) đọc ghi.
--
-- 3. Bảng KHÔNG lưu nội dung bài làm, đề, hay text trả về của provider — chỉ
--    lưu hash. Nhật ký chi phí không phải chỗ chứa dữ liệu học sinh.
--
-- ROLLBACK: xem supabase/rollback/20260805_essay_ai_usage_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Bảng nhật ký
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.essay_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  student_answer_id text NOT NULL
    REFERENCES public.student_answers(id) ON DELETE CASCADE,
  attempt_id text NOT NULL
    REFERENCES public.exam_attempts(id) ON DELETE CASCADE,

  provider text NOT NULL,
  model text NOT NULL,

  -- hashGradingInput({answerHash, rubricVersion, questionId, model}) phía
  -- worker. Đây là khoá chống gọi trùng: cùng bài + cùng rubric + cùng model
  -- thì chỉ được gọi provider một lần.
  input_hash text NOT NULL,
  response_hash text,

  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  latency_ms integer,

  -- Kết quả cuối của một lượt xử lý:
  --   auto_finalized  - đã gọi ai_finalize_essay_answer thành công
  --   pending_review  - fail-closed, bài để nguyên cho giáo viên
  --   provider_error  - không gọi được provider (vẫn ghi để đếm chi phí thử)
  --   skipped         - bỏ qua trước khi gọi provider (ai_enabled=false,
  --                     lệch rubric version...). Chi phí = 0.
  outcome text NOT NULL,

  -- ReviewTrigger[] từ decideFinalization. Dùng để biết pipeline đang bị chặn
  -- ở đâu: toàn 'low_confidence' là chuyện khác hẳn toàn 'cost_cap_reached'.
  triggers text[] NOT NULL DEFAULT '{}',

  ai_score numeric,
  ai_confidence numeric,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT essay_ai_usage_input_hash_key UNIQUE (input_hash),
  CONSTRAINT essay_ai_usage_outcome_check CHECK (
    outcome IN ('auto_finalized', 'pending_review', 'provider_error', 'skipped')
  ),
  CONSTRAINT essay_ai_usage_tokens_check CHECK (
    prompt_tokens >= 0 AND completion_tokens >= 0
  ),
  CONSTRAINT essay_ai_usage_cost_check CHECK (estimated_cost_usd >= 0),
  CONSTRAINT essay_ai_usage_confidence_check CHECK (
    ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
  ),
  CONSTRAINT essay_ai_usage_score_check CHECK (ai_score IS NULL OR ai_score >= 0)
);

COMMENT ON TABLE public.essay_ai_usage IS
  'Nhật ký lời gọi provider AI chấm tự luận: token, chi phí, quyết định. service_role only. Không chứa nội dung bài làm.';
COMMENT ON COLUMN public.essay_ai_usage.input_hash IS
  'hashGradingInput(answerHash, rubricVersion, questionId, model). UNIQUE - chống gọi provider hai lần cho cùng đầu vào.';
COMMENT ON COLUMN public.essay_ai_usage.outcome IS
  'auto_finalized | pending_review | provider_error | skipped';

-- Truy vấn chi phí tháng quét theo created_at; dashboard lọc theo attempt.
CREATE INDEX IF NOT EXISTS idx_essay_ai_usage_created_at
  ON public.essay_ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essay_ai_usage_attempt
  ON public.essay_ai_usage (attempt_id);
CREATE INDEX IF NOT EXISTS idx_essay_ai_usage_answer
  ON public.essay_ai_usage (student_answer_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Quyền
--
-- RLS bật nhưng KHÔNG tạo policy: với RLS bật và không policy nào khớp,
-- authenticated đọc được 0 hàng. REVOKE ở dưới là lớp thứ hai — nếu sau này
-- ai đó thêm nhầm một policy, REVOKE vẫn chặn.
-- ---------------------------------------------------------------------------

ALTER TABLE public.essay_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_ai_usage FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.essay_ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.essay_ai_usage TO service_role;

-- ---------------------------------------------------------------------------
-- Chi phí từ đầu tháng
--
-- Worker gọi hàm này để lấy monthToDateCostUsd cho decideFinalization. Tính
-- theo múi giờ VN (Asia/Ho_Chi_Minh) chứ không phải UTC: "tháng này" trong đầu
-- người vận hành là tháng theo lịch địa phương, và chênh 7 tiếng ở ranh giới
-- tháng đủ để trần bị reset sai ngày.
--
-- Chỉ tính hàng có chi phí thật; 'skipped' luôn có cost = 0 nên không ảnh hưởng.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.essay_ai_month_to_date_cost()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric
  FROM public.essay_ai_usage
  WHERE created_at >= (
    date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    AT TIME ZONE 'Asia/Ho_Chi_Minh'
  );
$$;

COMMENT ON FUNCTION public.essay_ai_month_to_date_cost() IS
  'Tổng chi phí AI chấm tự luận từ đầu tháng (giờ VN), USD. service_role only.';

REVOKE ALL ON FUNCTION public.essay_ai_month_to_date_cost() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.essay_ai_month_to_date_cost() TO service_role;

COMMIT;
