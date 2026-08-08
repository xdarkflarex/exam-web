-- BACKUP TRƯỚC KHI CHẠY 20260804_essay_ai_auto_grading.sql
--
-- Chạy file này trong Supabase SQL Editor TRƯỚC bước preflight.
-- Nó tạo bản sao của các bảng mà migration sẽ đụng tới, ngay trong cùng
-- database, dưới schema riêng `backup_20260804`.
--
-- GIỚI HẠN PHẢI HIỂU RÕ:
-- Đây KHÔNG phải backup đầy đủ. Bản sao nằm trong cùng database, nên nó
-- không cứu được bạn nếu mất cả project, xoá nhầm database, hay Supabase gặp
-- sự cố. Nó chỉ cứu được đúng một tình huống: migration 20260804 làm hỏng dữ
-- liệu và bạn cần khôi phục các bảng đó về trạng thái trước khi chạy.
--
-- Tình huống đó là rủi ro chính ở đây, nên bản sao này đủ dùng cho việc nạp
-- migration. Nhưng về lâu dài, dữ liệu bài thi của học sinh không nên sống mà
-- không có backup nằm ngoài Supabase. Cân nhắc `supabase db dump` định kỳ
-- hoặc nâng gói có Point-in-Time Recovery.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup_20260804;

COMMENT ON SCHEMA backup_20260804 IS
  'Bản sao trước migration 20260804_essay_ai_auto_grading. Xoá sau khi đã xác nhận migration chạy tốt vài ngày.';

-- Năm bảng migration sẽ đọc hoặc ghi.
-- CREATE TABLE AS chỉ sao chép dữ liệu, không sao constraint/index/RLS —
-- đúng ý đồ: đây là bản sao để khôi phục nội dung, không phải để chạy thay.

DROP TABLE IF EXISTS backup_20260804.student_answers;
CREATE TABLE backup_20260804.student_answers AS
  SELECT * FROM public.student_answers;

DROP TABLE IF EXISTS backup_20260804.exam_attempts;
CREATE TABLE backup_20260804.exam_attempts AS
  SELECT * FROM public.exam_attempts;

DROP TABLE IF EXISTS backup_20260804.essay_grading_reviews;
CREATE TABLE backup_20260804.essay_grading_reviews AS
  SELECT * FROM public.essay_grading_reviews;

DROP TABLE IF EXISTS backup_20260804.question_grading_configs;
CREATE TABLE backup_20260804.question_grading_configs AS
  SELECT * FROM public.question_grading_configs;

DROP TABLE IF EXISTS backup_20260804.questions;
CREATE TABLE backup_20260804.questions AS
  SELECT * FROM public.questions;

-- Khoá schema backup lại: không ai được đọc/ghi qua API.
-- Nếu thiếu bước này, bản sao trở thành đường vòng để đọc đáp án và điểm số
-- mà không bị RLS chặn.
REVOKE ALL ON SCHEMA backup_20260804 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA backup_20260804 FROM PUBLIC, anon, authenticated;

COMMIT;

-- ===========================================================================
-- XÁC NHẬN: số dòng bản sao phải khớp bản gốc
-- ===========================================================================

SELECT
  'student_answers' AS bang,
  (SELECT COUNT(*) FROM public.student_answers) AS ban_goc,
  (SELECT COUNT(*) FROM backup_20260804.student_answers) AS ban_sao,
  CASE WHEN (SELECT COUNT(*) FROM public.student_answers)
          = (SELECT COUNT(*) FROM backup_20260804.student_answers)
       THEN 'OK' ELSE 'LECH - DUNG LAI' END AS ket_qua
UNION ALL SELECT 'exam_attempts',
  (SELECT COUNT(*) FROM public.exam_attempts),
  (SELECT COUNT(*) FROM backup_20260804.exam_attempts),
  CASE WHEN (SELECT COUNT(*) FROM public.exam_attempts)
          = (SELECT COUNT(*) FROM backup_20260804.exam_attempts)
       THEN 'OK' ELSE 'LECH - DUNG LAI' END
UNION ALL SELECT 'essay_grading_reviews',
  (SELECT COUNT(*) FROM public.essay_grading_reviews),
  (SELECT COUNT(*) FROM backup_20260804.essay_grading_reviews),
  CASE WHEN (SELECT COUNT(*) FROM public.essay_grading_reviews)
          = (SELECT COUNT(*) FROM backup_20260804.essay_grading_reviews)
       THEN 'OK' ELSE 'LECH - DUNG LAI' END
UNION ALL SELECT 'question_grading_configs',
  (SELECT COUNT(*) FROM public.question_grading_configs),
  (SELECT COUNT(*) FROM backup_20260804.question_grading_configs),
  CASE WHEN (SELECT COUNT(*) FROM public.question_grading_configs)
          = (SELECT COUNT(*) FROM backup_20260804.question_grading_configs)
       THEN 'OK' ELSE 'LECH - DUNG LAI' END
UNION ALL SELECT 'questions',
  (SELECT COUNT(*) FROM public.questions),
  (SELECT COUNT(*) FROM backup_20260804.questions),
  CASE WHEN (SELECT COUNT(*) FROM public.questions)
          = (SELECT COUNT(*) FROM backup_20260804.questions)
       THEN 'OK' ELSE 'LECH - DUNG LAI' END;

-- ===========================================================================
-- KHÔI PHỤC (chỉ chạy khi migration hỏng và cần quay lại)
-- ===========================================================================
--
-- Đọc kỹ trước khi chạy: các lệnh dưới ghi đè dữ liệu hiện tại bằng bản sao,
-- nghĩa là MỌI thay đổi sau thời điểm backup sẽ mất — kể cả bài học sinh nộp
-- trong lúc đó. Nếu website vẫn đang mở, đóng nó trước.
--
-- BEGIN;
-- SET session_replication_role = replica;  -- tạm tắt FK/trigger
--
-- DELETE FROM public.essay_grading_reviews;
-- INSERT INTO public.essay_grading_reviews
--   SELECT * FROM backup_20260804.essay_grading_reviews;
--
-- -- student_answers và exam_attempts: cập nhật tại chỗ an toàn hơn xoá/nạp,
-- -- vì các bảng khác tham chiếu tới chúng.
-- UPDATE public.student_answers sa
-- SET score = b.score,
--     is_correct = b.is_correct,
--     grading_status = b.grading_status,
--     grading_method = b.grading_method,
--     grading_feedback = b.grading_feedback,
--     grading_breakdown = b.grading_breakdown,
--     grading_confidence = b.grading_confidence,
--     ai_score = b.ai_score,
--     ai_feedback = b.ai_feedback,
--     ai_model = b.ai_model,
--     graded_by = b.graded_by,
--     graded_at = b.graded_at
-- FROM backup_20260804.student_answers b
-- WHERE sa.id = b.id;
--
-- UPDATE public.exam_attempts ea
-- SET score = b.score,
--     grading_status = b.grading_status,
--     objective_points = b.objective_points,
--     essay_points = b.essay_points,
--     earned_points = b.earned_points,
--     max_points = b.max_points,
--     correct_answers = b.correct_answers,
--     pending_grading_count = b.pending_grading_count,
--     graded_at = b.graded_at
-- FROM backup_20260804.exam_attempts b
-- WHERE ea.id = b.id;
--
-- SET session_replication_role = DEFAULT;
-- COMMIT;

-- ===========================================================================
-- DỌN DẸP (sau khi migration đã chạy ổn định vài ngày)
-- ===========================================================================
-- DROP SCHEMA backup_20260804 CASCADE;
