-- 20260807_essay_ocr_snapshots.sql
--
-- Lưu chất lượng nhận dạng của mỗi lần học sinh chụp ảnh bài làm tự luận.
--
-- VÌ SAO CẦN BẢNG NÀY — đây là lỗ hổng an toàn, không phải tính năng tiện ích.
--
-- Luồng hiện tại: học sinh chụp ảnh → `POST /api/essay-ai/ocr` gọi Gemini →
-- route trả `text` + `confidence` + `warnings` về trình duyệt →
-- `ExamRunner.tsx` đổ **text** thẳng vào ô nhập rồi **vứt bỏ** confidence và
-- warnings. Từ giây đó, bài làm trong `student_answers` không còn dấu vết nào
-- cho biết nó do máy đọc từ ảnh hay do học sinh gõ tay.
--
-- Hệ quả ở `auto-finalize.ts`: worker không có gì để truyền nên truyền
-- `ocr: null`, và cổng `if (ocr)` **bỏ qua toàn bộ khối kiểm OCR**. Ba trigger
-- `low_ocr_confidence`, `math_region_uncertain`, `ocr_warning` không bao giờ
-- kích hoạt. Đó là fail-OPEN nằm giữa một module được thiết kế fail-closed.
--
-- Với môn Toán, đây đúng là chế độ hỏng nguy hiểm nhất: Gemini đọc `-2x` thành
-- `2x`, AI chấm bài đó và chấm ĐÚNG theo những gì nó thấy, confidence cao,
-- không cổng nào kêu, điểm sai được chốt tự động. Không ai phát hiện cho tới
-- khi phụ huynh hỏi.
--
-- PHẠM VI. Migration này CHỈ tạo mới (một bảng + index + không hàm nào). Nó
-- KHÔNG `CREATE OR REPLACE` bất cứ thứ gì của migration khác, nên không phụ
-- thuộc thứ tự với 20260803 đang treo và chạy được ngay.
--
-- BẢO MẬT. Bảng gắn với `student_answer_id` và cho biết bài nào đọc bằng máy.
-- Học sinh đọc được là biết bài mình có bị gắn cờ chất lượng thấp hay không —
-- suy ra được cách bài sẽ được xử lý. Vì vậy: RLS bật, KHÔNG policy nào, và
-- REVOKE khỏi anon/authenticated. Chỉ service_role (bypass RLS) đọc ghi, giống
-- hệt `essay_ai_usage` của 20260805.
--
-- KHÔNG LƯU ẢNH và KHÔNG LƯU TEXT BÀI LÀM. Chỉ lưu hash của text đã chuẩn hoá
-- cùng các chỉ số chất lượng. Bảng chất lượng OCR không phải chỗ chứa dữ liệu
-- học sinh, và ảnh bài làm là dữ liệu cá nhân theo `AGENTS.md` mục 7.
--
-- PREFLIGHT:  supabase/preflight/20260807_essay_ocr_snapshots_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260807_essay_ocr_snapshots_postflight.sql
-- ROLLBACK:   supabase/rollback/20260807_essay_ocr_snapshots_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Bảng ảnh chụp chất lượng OCR
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.essay_ocr_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  attempt_id text NOT NULL
    REFERENCES public.exam_attempts(id) ON DELETE CASCADE,

  -- KHÔNG có FK tới student_answers. Lúc học sinh bấm OCR, bài chưa nộp nên
  -- dòng `student_answers` chưa tồn tại — đặt FK ở đây là chặn chính luồng mà
  -- bảng này sinh ra để phục vụ. Worker nối hai bên bằng (attempt_id,
  -- question_id) khi chấm; cặp đó là khoá tự nhiên của một bài làm.
  question_id text NOT NULL
    REFERENCES public.questions(id) ON DELETE CASCADE,

  provider text NOT NULL,
  model text NOT NULL,

  -- 0..1. Dưới OCR_CONFIDENCE_MIN (0,9 trong auto-finalize.ts) thì chặn
  -- auto-chốt. CHECK ở đây vì một giá trị ngoài khoảng làm phép so sánh ngưỡng
  -- trở nên vô nghĩa mà không báo lỗi ở đâu cả.
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- OcrWarning[] đã làm phẳng thành hai mảng song song cùng độ dài.
  -- `warning_kinds` là giá trị enum ('math_unreadable', 'low_confidence_region',
  -- 'page_skipped', 'truncated'); `warning_details` là mô tả cho người đọc.
  -- Tách làm hai mảng thay vì jsonb để query đếm theo loại không phải parse.
  warning_kinds text[] NOT NULL DEFAULT '{}',
  warning_details text[] NOT NULL DEFAULT '{}',

  -- Hash của normalizedText tại thời điểm OCR. Học sinh được phép SỬA text sau
  -- khi máy đọc — và nên sửa. Hash cho worker biết bài lúc nộp có còn đúng bản
  -- máy đọc hay đã được người sửa lại: hai trường hợp đó có mức rủi ro khác
  -- nhau và không được đánh đồng.
  text_hash text NOT NULL,

  -- Số ký tự text nhận được. Dùng để phát hiện OCR trả về gần như rỗng — dấu
  -- hiệu ảnh mờ hoặc chụp nhầm — mà confidence vẫn cao.
  text_length integer NOT NULL DEFAULT 0 CHECK (text_length >= 0),

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.essay_ocr_snapshots IS
  'Chất lượng nhận dạng mỗi lần học sinh chụp ảnh bài tự luận. Không chứa ảnh '
  'và không chứa text bài làm, chỉ hash + chỉ số. Worker đọc bảng này để cổng '
  'OCR trong auto-finalize.ts có dữ liệu; thiếu nó thì ba trigger OCR không bao '
  'giờ kích hoạt. Chỉ service_role đọc ghi.';

-- ---------------------------------------------------------------------------
-- 2. Index
-- ---------------------------------------------------------------------------

-- Đường truy vấn duy nhất của worker: "bài (attempt, question) này có ảnh chụp
-- nào không, lấy bản mới nhất". DESC để bản mới nhất nằm đầu.
CREATE INDEX IF NOT EXISTS essay_ocr_snapshots_answer_idx
  ON public.essay_ocr_snapshots (attempt_id, question_id, created_at DESC);

-- Không UNIQUE trên (attempt_id, question_id): học sinh được chụp nhiều trang
-- và chụp lại khi ảnh mờ, mỗi lần là một dòng. Worker lấy bản mới nhất, nhưng
-- các bản cũ vẫn cần cho benchmark (đo mức OCR sai bao nhiêu lần trước khi
-- người dùng chấp nhận kết quả).

-- ---------------------------------------------------------------------------
-- 3. Khoá quyền
-- ---------------------------------------------------------------------------
--
-- Giống 20260805: RLS bật nhưng KHÔNG tạo policy nào. Bật RLS mà không có
-- policy nghĩa là mọi truy cập qua anon/authenticated đều bị từ chối, kể cả
-- admin — admin cũng đăng nhập bằng role `authenticated`. service_role bypass
-- RLS nên worker (route server) vẫn đọc ghi bình thường.

ALTER TABLE public.essay_ocr_snapshots ENABLE ROW LEVEL SECURITY;

-- FORCE để chủ bảng cũng không được bỏ qua RLS. Không có dòng này, kết nối
-- bằng vai trò sở hữu bảng đọc được toàn bộ dữ liệu.
ALTER TABLE public.essay_ocr_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.essay_ocr_snapshots FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.essay_ocr_snapshots TO service_role;

-- Cố ý KHÔNG grant UPDATE/DELETE cho service_role: đây là nhật ký chất lượng,
-- sửa lại sau khi ghi thì mất chính giá trị làm bằng chứng. Dọn dữ liệu cũ thì
-- dùng ON DELETE CASCADE qua attempt, hoặc SQL trực tiếp có chủ đích.

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — chưa xong việc
-- ---------------------------------------------------------------------------
--
-- Bảng này một mình KHÔNG đóng được lỗ hổng. Còn ba việc phía source, và cho
-- tới khi cả ba xong thì `ESSAY_AI_AUTO_FINALIZE` vẫn phải giữ `false`:
--
--   1. `POST /api/essay-ai/ocr` phải INSERT vào bảng này (cần `questionId`
--      trong request body — hiện route chỉ nhận `attemptId`).
--   2. `worker.ts` phải đọc snapshot theo (attempt_id, question_id) và truyền
--      vào `decideFinalization` thay cho `ocr: null` cứng.
--   3. `auto-finalize.ts` phải phân biệt "học sinh gõ tay" (không có ảnh, an
--      toàn) với "có ảnh nhưng không tìm thấy snapshot" (mất dấu vết, phải
--      chặn). Hiện `ocr: null` mang cả hai nghĩa và nhánh `if (ocr)` cho qua
--      tất cả — đó chính là fail-open cần sửa.
