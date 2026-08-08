-- 20260806_moet_scoring_scale_rollback.sql
--
-- Hoàn nguyên `supabase/migrations/20260806_moet_scoring_scale.sql`.
--
-- ĐỌC HẾT MỤC NÀY TRƯỚC KHI CHẠY
--
-- CƠ CHẾ. Rollback KHÔNG dán lại ba thân hàm chấm. Ba hàm đó sau migration chỉ
-- khác bản gốc ở đúng một chỗ: chúng gọi `public.moet_true_false_score(...)` thay
-- cho biểu thức `round(v_max_score * v_tf_correct / v_tf_total, 4)`. Vì vậy chỉ
-- cần định nghĩa lại `moet_true_false_score` thành **chính công thức tuyến tính
-- cũ** là hành vi chấm trở về nguyên trạng, không phải chép tay 700 dòng
-- plpgsql — mỗi lần chép tay là một lần có thể sai một ký tự trong code tính
-- điểm cho học sinh.
--
-- Hệ quả: sau rollback, hàm `moet_true_false_score` VẪN TỒN TẠI nhưng trả điểm
-- tuyến tính. Không xoá được nó: ba hàm chấm gọi tên này ở runtime, xoá đi là
-- mọi lần nộp bài raise `undefined_function`. Đây là điểm khác biệt duy nhất so
-- với trạng thái trước migration, và nó không đổi điểm của ai.
--
-- MỘT KHÁC BIỆT HÀNH VI CÒN LẠI — nói rõ để không ai tưởng rollback là hoàn hảo.
-- Bài tập về nhà: TRƯỚC migration, `check_homework_answer` cho câu Đúng/Sai
-- **không có điểm thành phần nào** (chỉ `CASE WHEN đúng-cả-4-ý THEN score ELSE 0`).
-- Sau rollback bằng file này, nó cho điểm **tuyến tính** (3/4 ý → 0,75·score).
-- Đó là tuyến tính giống hai luồng còn lại, không phải all-or-nothing như cũ.
-- Chấp nhận được vì `homework_questions` đang rỗng nên không có điểm nào bị ảnh
-- hưởng. Nếu cần khôi phục đúng từng bit hành vi cũ của homework thì
-- `CREATE OR REPLACE` lại `check_homework_answer` từ
-- `20260722_runtime_security_hardening.sql:1829-2101` — chạy riêng, sau file này.
--
-- MẤT MÁT THÔNG TIN. Backfill trọng số không lưu giá trị cũ từng dòng. Phục hồi
-- được chính xác vì mọi dòng không-tự-luận trước migration đều là 1 (đã xác minh
-- trên Primary ngày 2026-08-06: 60 MC + 28 SA + 18 TF, tất cả score = 1).
--
--   CẢNH BÁO: nếu sau migration có ai sửa trọng số bằng UI
--   (/admin/exams/<id>/questions) thì file này **ghi đè giá trị đã sửa về 1**.
--   Kiểm trước bằng câu lệnh ở mục 0 và chỉ chạy tiếp khi bạn đồng ý mất chúng.
--
--   Rủi ro này LỚN HƠN NHIỀU so với lúc migration mới ra. Sau khi có
--   `scoring_profile`, đề THI HỌC KÌ được thiết kế để giáo viên tự đặt trọng số
--   từng câu — nghĩa là mọi ma trận điểm học kì do người ra đề nhập tay đều nằm
--   trong phạm vi bị mục 4 ghi đè về 1. Đọc kỹ danh sách ở mục 0.
--
-- CỘT `exams.scoring_profile` bị DROP ở mục 5. Đề học kì và đề thi thử sau đó
-- không phân biệt được nữa. Đây là mất mát không phục hồi được: thông tin "đề này
-- ra theo thang Bộ" chỉ nằm ở cột đó. Nếu định áp lại migration về sau, hãy
-- `SELECT id, scoring_profile FROM public.exams` và lưu kết quả ra ngoài TRƯỚC khi
-- chạy file này.
--
-- KHÔNG chạm `student_answers` và `exam_attempts`. Điểm 14 attempt cũ đã không
-- được tính lại lúc migration, nên rollback cũng không có gì phải trả lại. Nhưng
-- attempt nộp TRONG khoảng migration còn hiệu lực đã được chấm theo thang Bộ và
-- điểm đó ở lại — rollback không tính lại chúng. Hai attempt cùng đề sẽ khác
-- điểm; đó là hệ quả không tránh được của việc đổi thang điểm hai lần.

-- CÁCH CHẠY: file này chạy được trong Supabase SQL Editor, psql, hay client SQL
-- nào cũng được — không dùng meta-command `\echo` của psql.

SELECT '=== 0. Kiểm trước khi rollback: có trọng số nào bị sửa bằng tay không? ===' AS muc;

-- LƯU LẠI TRƯỚC KHI CHẠY TIẾP. Cột scoring_profile sẽ bị DROP ở mục 5 và không
-- suy lại được từ dữ liệu còn lại — exam_mode KHÔNG cho biết hồ sơ, vì đề học kì
-- cũng là 'simulation'. Copy kết quả này ra ngoài file SQL.
SELECT
  e.id,
  e.title,
  e.exam_mode,
  e.scoring_profile AS se_bi_mat_vinh_vien
FROM public.exams e
ORDER BY e.scoring_profile, e.id;

-- Trọng số sẽ bị đưa về 1. Mỗi dòng ra ở đây là một giá trị người nhập tay.
--
-- Với đề moet_standard, kỳ vọng 0 dòng (backfill đã đặt đúng 0,25/1,0/0,5).
-- Với đề custom, MỌI dòng khác 1 đều xuất hiện ở đây — đó chính là ma trận điểm
-- học kì mà giáo viên nhập, và nó sẽ mất. Đây là danh sách phải đọc kỹ nhất.
SELECT
  e.scoring_profile,
  eq.exam_id,
  eq.question_id,
  eq.question_type,
  eq.score AS se_bi_ghi_de_ve_1
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE eq.question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND eq.score IS DISTINCT FROM 1
ORDER BY e.scoring_profile, eq.exam_id, eq.question_id;

-- Attempt đã nộp SAU migration: điểm của chúng theo thang Bộ và sẽ không được
-- tính lại. Đọc để biết phạm vi ảnh hưởng, không phải để sửa.
SELECT
  COUNT(*)::bigint AS attempt_nop_sau_2026_08_06,
  COALESCE(MIN(ea.score), 0) AS diem_thap_nhat,
  COALESCE(MAX(ea.score), 0) AS diem_cao_nhat
FROM public.exam_attempts ea
WHERE ea.submit_time >= '2026-08-06'::timestamptz;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trả công thức Đúng/Sai về tuyến tính
-- ---------------------------------------------------------------------------
--
-- Thân hàm mới là chính biểu thức cũ ở 20260721:644-646 và 20260722:1425-1427:
--   round(v_max_score * v_tf_correct / v_tf_total, 4)
--
-- Giữ nguyên các cổng chặn đầu vào vô nghĩa. Chúng không tồn tại trong biểu thức
-- cũ (nó nằm trong `CASE WHEN v_tf_total > 0 ... ELSE 0 END` ở phía gọi), nhưng
-- phía gọi giờ không còn CASE đó nên hàm phải tự chặn — bỏ đi là chia cho 0.

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
    WHEN p_max_score IS NULL OR p_max_score <= 0 THEN 0
    WHEN p_correct IS NULL OR p_total IS NULL OR p_total <= 0 THEN 0
    ELSE round(p_max_score * least(greatest(p_correct, 0), p_total)::numeric / p_total, 4)
  END;
$$;

COMMENT ON FUNCTION public.moet_true_false_score(numeric, integer, integer) IS
  'ĐÃ ROLLBACK 20260806: trả điểm Đúng/Sai theo TỶ LỆ TUYẾN TÍNH, không phải bậc '
  'thang của Bộ GD&ĐT. 3/4 ý → 0,75·max thay vì 0,5·max. Tên hàm giữ nguyên vì ba '
  'hàm chấm gọi nó ở runtime; xoá đi là mọi lần nộp bài lỗi undefined_function.';

-- ---------------------------------------------------------------------------
-- 2. Bỏ hàng rào 4 ý
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS exam_questions_true_false_four_statements ON public.exam_questions;
-- Migration KHÔNG tạo trigger này (bài tập kèm liên kết tri thức không dùng thang
-- Bộ), nhưng một bản nháp trước có tạo. Giữ câu DROP để rollback dọn được cả
-- trường hợp bản nháp đó từng chạy.
DROP TRIGGER IF EXISTS homework_questions_true_false_four_statements ON public.homework_questions;
DROP FUNCTION IF EXISTS public.enforce_true_false_four_statements();

-- ---------------------------------------------------------------------------
-- 3. Bỏ ràng buộc điểm dương của homework_questions
-- ---------------------------------------------------------------------------
--
-- exam_questions_positive_score KHÔNG bỏ ở đây: nó là của 20260722:200-205, có
-- trước migration này. Bỏ nó là rollback quá tay.

ALTER TABLE public.homework_questions
  DROP CONSTRAINT IF EXISTS homework_questions_positive_score;

-- ---------------------------------------------------------------------------
-- 4. Đưa trọng số về 1
-- ---------------------------------------------------------------------------
--
-- KHÔNG chạm dòng essay — migration cũng không chạm, và điểm của chúng phải khớp
-- tổng rubric.
--
-- KHÔNG chạm `homework_questions`: migration không backfill bảng đó (bài tập không
-- dùng thang Bộ), nên "hoàn nguyên" nó là ghi đè điểm giáo viên tự đặt bằng một
-- thay đổi mà migration chưa từng gây ra.

UPDATE public.exam_questions
SET score = 1
WHERE question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND score IS DISTINCT FROM 1;

-- Tính lại tổng điểm hiển thị từ trọng số vừa hoàn nguyên. Với ba đề đang có,
-- phép này cho lại đúng 20 / 22 / 22 như trước migration.
UPDATE public.exams e
SET total_score = COALESCE(t.sum_score, 0)
FROM (
  SELECT eq.exam_id, SUM(eq.score) AS sum_score
  FROM public.exam_questions eq
  GROUP BY eq.exam_id
) AS t
WHERE t.exam_id = e.id
  AND e.total_score IS DISTINCT FROM COALESCE(t.sum_score, 0);

-- ---------------------------------------------------------------------------
-- 5. Bỏ cột hồ sơ thang điểm
-- ---------------------------------------------------------------------------
--
-- DROP COLUMN gỡ luôn CHECK constraint, COMMENT và GRANT theo cột — không cần ba
-- câu lệnh riêng.
--
-- KHÔNG phục hồi được: đề nào từng là 'moet_standard' sau bước này không còn dấu
-- vết. Mục 0 in ra danh sách để lưu ra ngoài trước.

ALTER TABLE public.exams DROP COLUMN IF EXISTS scoring_profile;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. Xác minh sau rollback
-- ---------------------------------------------------------------------------
--
-- Kỳ vọng: mọi must_be_zero bằng 0.

SELECT 'con_trong_so_khac_1' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM public.exam_questions eq
WHERE eq.question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND eq.score IS DISTINCT FROM 1

UNION ALL
SELECT 'con_cot_scoring_profile', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'scoring_profile'

UNION ALL
SELECT 'con_trigger_hang_rao_4_y', COUNT(*)::bigint
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'exam_questions_true_false_four_statements',
    'homework_questions_true_false_four_statements'
  )

UNION ALL
SELECT 'con_ham_enforce_4_y', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE to_regprocedure('public.enforce_true_false_four_statements()') IS NOT NULL
) t

UNION ALL
-- Tự luận phải vẫn khớp tổng rubric. Rollback không chạm dòng essay nên kết quả
-- này phải giống cả preflight lẫn postflight của migration.
SELECT 'tu_luan_lech_tong_rubric', COUNT(*)::bigint
FROM public.exam_questions eq
LEFT JOIN (
  SELECT
    config.question_id,
    SUM((criterion ->> 'max_score')::numeric) AS tong_rubric
  FROM public.question_grading_configs config
  CROSS JOIN LATERAL jsonb_array_elements(config.rubric) AS criterion
  GROUP BY config.question_id
) AS r ON r.question_id = eq.question_id
WHERE eq.question_type = 'essay'
  AND (r.tong_rubric IS NULL OR abs(eq.score - r.tong_rubric) > 0.0001)

UNION ALL
SELECT 'exams_total_score_lech_tong_that', COUNT(*)::bigint
FROM public.exams e
LEFT JOIN (
  SELECT eq.exam_id, SUM(eq.score) AS sum_score
  FROM public.exam_questions eq
  GROUP BY eq.exam_id
) AS t ON t.exam_id = e.id
WHERE t.exam_id IS NOT NULL
  AND e.total_score IS DISTINCT FROM COALESCE(t.sum_score, 0)

UNION ALL
-- Ba hàm chấm phải CÒN NGUYÊN. Rollback không xoá hàm nào — nếu dòng này > 0 thì
-- website không nộp bài được nữa.
SELECT 'mat_ham_cham', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE to_regprocedure('public.submit_exam_attempt(text, jsonb)') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regprocedure('public.submit_exam_attempt_trusted_internal(text, jsonb)') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regprocedure('public.submit_practice_attempt(text, jsonb)') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regprocedure('public.check_homework_answer(text, text, jsonb)') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regprocedure('public.moet_true_false_score(numeric, integer, integer)') IS NULL
) t

UNION ALL
-- Công thức đã về tuyến tính: 3/4 ý phải ra 0,75, không còn 0,5.
SELECT 'bac_thang_chua_ve_tuyen_tinh', COUNT(*)::bigint
FROM (
  VALUES (0, 0::numeric), (1, 0.25), (2, 0.5), (3, 0.75), (4, 1.0)
) AS expected(so_y_dung, diem_ky_vong)
WHERE public.moet_true_false_score(1, expected.so_y_dung, 4)
      IS DISTINCT FROM expected.diem_ky_vong

ORDER BY check_name;

-- Bảng giá trị sau rollback — kỳ vọng 0 / 0,25 / 0,5 / 0,75 / 1,00.
SELECT
  k AS so_y_dung,
  public.moet_true_false_score(1, k, 4) AS diem_sau_rollback
FROM generate_series(0, 4) AS k
ORDER BY k;

-- SAU KHI ROLLBACK: `src/lib/exam/scoring.ts` vẫn chứa bậc thang của Bộ, và
-- `src/app/admin/exams/create/page.tsx` vẫn cho chọn loại đề rồi ghi cột
-- `scoring_profile` — cột giờ không còn, nên **trang tạo đề sẽ lỗi ngay** với
-- `column "scoring_profile" does not exist`. Đây là hỏng ngay lập tức, không phải
-- lệch âm thầm.
--
-- Vì vậy rollback file này BẮT BUỘC đi kèm hoàn nguyên source (git revert các
-- commit của đợt 20260806). Chỉ chạy SQL mà giữ source là mất trang tạo đề; chỉ
-- revert source mà giữ SQL là đề tạo sau đó mang trọng số thang Bộ nhưng được chấm
-- bằng công thức tuyến tính — tổ hợp sai nhất trong cả bốn khả năng.
