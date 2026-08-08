-- 20260806_moet_scoring_scale_preflight.sql
--
-- CHỈ ĐỌC. Chạy TRƯỚC `supabase/migrations/20260806_moet_scoring_scale.sql`.
--
-- Ba việc, theo thứ tự quan trọng:
--
--   A. CỔNG CHẶN. Kiểm `20260722_runtime_security_hardening.sql` đã áp chưa.
--      Migration 20260806 CREATE OR REPLACE ba hàm do 20260722 định nghĩa hoặc
--      đổi tên. Chạy sai thứ tự sẽ tạo hàm mồ côi rồi bị 20260722 ghi đè, và
--      bậc thang điểm âm thầm biến mất. Kiểm tra A DỪNG script nếu chưa đạt.
--
--   B. ẢNH CHỤP TRƯỚC. Ghi lại số đếm hiện tại để đối chiếu với postflight.
--      In ra, dán vào nhật ký vận hành.
--
--   C. RỦI RO ĐÃ BIẾT. Liệt kê dữ liệu sẽ bị hàng rào 4 ý chặn hoặc backfill
--      chạm tới, để không bị bất ngờ giữa lúc migration đang chạy.
--
-- PHẠM VI: thang Bộ chỉ áp cho đề **thi thử** (`exams.scoring_profile =
-- 'moet_standard'`). Đề thi học kì là `custom` — giáo viên tự đặt trọng số — và
-- bài tập về nhà không dùng thang này. Vì cột `scoring_profile` chưa tồn tại lúc
-- chạy preflight, các truy vấn dưới đây dùng `exam_mode = 'simulation'` làm điều
-- kiện thay thế, đúng bằng điều kiện backfill ở mục 8 của migration.

-- CÁCH CHẠY: file này chạy được trong Supabase SQL Editor, psql, hay bất cứ
-- client SQL nào — không dùng meta-command `\echo` của psql. Tiêu đề từng mục là
-- một `SELECT` trả về một dòng, nên nó hiện trong mọi client. Chạy trọn file một
-- lần; Editor trả nhiều bảng kết quả, đọc lần lượt từ trên xuống.

SELECT '=== A. Cổng chặn: 20260722 đã áp chưa ===' AS muc;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  -- submit_exam_attempt_trusted_internal chỉ tồn tại nếu 20260722:1195-1205 đã
  -- RENAME hàm chấm của 20260721. Đây là bằng chứng trực tiếp nhất.
  IF to_regprocedure('public.submit_exam_attempt_trusted_internal(text, jsonb)') IS NULL THEN
    v_missing := v_missing || 'submit_exam_attempt_trusted_internal(text,jsonb)';
  END IF;
  IF to_regprocedure('public.submit_exam_attempt(text, jsonb)') IS NULL THEN
    v_missing := v_missing || 'submit_exam_attempt(text,jsonb)';
  END IF;
  IF to_regprocedure('public.submit_practice_attempt(text, jsonb)') IS NULL THEN
    v_missing := v_missing || 'submit_practice_attempt(text,jsonb)';
  END IF;
  IF to_regprocedure('public.check_homework_answer(text, text, jsonb)') IS NULL THEN
    v_missing := v_missing || 'check_homework_answer(text,text,jsonb)';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'DEPENDENCY_MISSING: chưa áp 20260722_runtime_security_hardening.sql'
      USING DETAIL = format(
        'Thiếu: %s. Áp 20260722 trước, rồi chạy lại preflight này. '
        'KHÔNG chạy 20260806 lúc này.',
        array_to_string(v_missing, ', ')
      );
  END IF;

  RAISE NOTICE 'ĐẠT: cả 4 hàm chấm đều tồn tại — 20260722 đã áp.';
END;
$$;

-- Lặp lại kết luận mục A thành một DÒNG KẾT QUẢ, không chỉ NOTICE: Supabase SQL
-- Editor không hiện NOTICE, nên nếu chỉ dựa vào RAISE NOTICE thì chạy xong bạn
-- không thấy gì và không biết cổng chặn đã đạt hay script chưa chạy tới đó.
SELECT
  'cong_chan_20260722' AS check_name,
  (
    to_regprocedure('public.submit_exam_attempt_trusted_internal(text, jsonb)') IS NOT NULL
    AND to_regprocedure('public.submit_exam_attempt(text, jsonb)') IS NOT NULL
    AND to_regprocedure('public.submit_practice_attempt(text, jsonb)') IS NOT NULL
    AND to_regprocedure('public.check_homework_answer(text, text, jsonb)') IS NOT NULL
  ) AS ket_qua,
  'phải là true mới được chạy migration; false thì DO block ở trên đã raise' AS ghi_chu;

-- Hàm bậc thang lẽ ra CHƯA tồn tại. Nếu đã có thì migration này từng chạy rồi;
-- chạy lại vẫn an toàn (CREATE OR REPLACE + UPDATE có điều kiện IS DISTINCT FROM)
-- nhưng ảnh chụp ở mục B sẽ là số SAU migration, không phải số trước.
SELECT
  'moet_true_false_score_da_ton_tai' AS check_name,
  (to_regprocedure('public.moet_true_false_score(numeric, integer, integer)') IS NOT NULL) AS ket_qua,
  'true = migration đã từng chạy; ảnh chụp mục B không còn là trạng thái trước' AS ghi_chu;

-- Cột hồ sơ thang điểm lẽ ra CHƯA tồn tại. Nếu đã có thì migration từng chạy.
SELECT
  'exams_scoring_profile_da_ton_tai' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'scoring_profile'
  ) AS ket_qua,
  'true = migration đã từng chạy' AS ghi_chu;

SELECT '=== B. Ảnh chụp trước migration ===' AS muc;

-- Kỳ vọng trên Primary ngày 2026-08-06: mọi dòng không-tự-luận đều score = 1
-- (60 multiple_choice, 28 short_answer, 18 true_false), 3 dòng essay.
SELECT
  eq.question_type,
  eq.score,
  COUNT(*)::bigint AS so_dong
FROM public.exam_questions eq
GROUP BY eq.question_type, eq.score
ORDER BY eq.question_type, eq.score;

-- Đề nào sẽ thành moet_standard. Backfill mục 8 của migration nâng đề
-- exam_mode = 'simulation' lên moet_standard; đề ôn tập giữ custom.
--
-- CHỈ đề ở cột "se_thanh_moet_standard" bị backfill trọng số. Đề ôn tập giữ
-- nguyên trọng số đang có — với đề custom, "mọi câu 1 điểm" là ma trận điểm hợp
-- lệ, không phải lỗi cần sửa.
SELECT
  e.exam_mode,
  COUNT(*)::bigint AS so_de,
  COUNT(*) FILTER (WHERE e.exam_mode = 'simulation')::bigint AS se_thanh_moet_standard,
  COUNT(*) FILTER (WHERE e.exam_mode <> 'simulation')::bigint AS se_giu_custom
FROM public.exams e
GROUP BY e.exam_mode
ORDER BY e.exam_mode;

-- Trọng số đúng thang Bộ cho từng loại, chỉ tính trên đề SẼ thành moet_standard.
SELECT
  eq.question_type,
  COUNT(*)::bigint AS tong_dong_de_thi_thu,
  COUNT(*) FILTER (WHERE eq.score = CASE eq.question_type
    WHEN 'multiple_choice' THEN 0.25
    WHEN 'true_false'      THEN 1.0
    WHEN 'short_answer'    THEN 0.5
  END)::bigint AS da_dung_thang_bo,
  COUNT(*) FILTER (WHERE eq.question_type <> 'essay' AND eq.score IS DISTINCT FROM CASE eq.question_type
    WHEN 'multiple_choice' THEN 0.25
    WHEN 'true_false'      THEN 1.0
    WHEN 'short_answer'    THEN 0.5
  END)::bigint AS se_bi_backfill
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.exam_mode = 'simulation'
GROUP BY eq.question_type
ORDER BY eq.question_type;

-- Tổng điểm từng đề: cột đang lưu vs tổng thật, và tổng sau khi áp thang Bộ.
-- Đề thi thử chuẩn 12 MC + 4 TF + 6 SA phải ra đúng 10,0 ở cột cuối; đề ôn tập
-- có tong_sau_migration = tong_that_hien_tai vì không bị backfill.
SELECT
  e.id,
  e.title,
  e.exam_mode,
  e.is_published,
  e.total_score AS total_score_dang_luu,
  COALESCE(SUM(eq.score), 0) AS tong_that_hien_tai,
  COALESCE(SUM(CASE
    WHEN e.exam_mode <> 'simulation' THEN eq.score
    WHEN eq.question_type = 'multiple_choice' THEN 0.25
    WHEN eq.question_type = 'true_false'      THEN 1.0
    WHEN eq.question_type = 'short_answer'    THEN 0.5
    ELSE eq.score
  END), 0) AS tong_sau_migration,
  COUNT(eq.question_id)::bigint AS so_cau
FROM public.exams e
LEFT JOIN public.exam_questions eq ON eq.exam_id = e.id
GROUP BY e.id, e.title, e.exam_mode, e.is_published, e.total_score
ORDER BY e.id;

-- 14 attempt đã nộp. Migration KHÔNG chạm bảng này; postflight so lại đúng các
-- con số dưới đây. Chủ dự án đã quyết định không tính lại điểm cũ (2026-08-06).
SELECT
  COUNT(*)::bigint AS tong_attempt,
  COUNT(*) FILTER (WHERE ea.score IS NOT NULL)::bigint AS co_diem,
  COALESCE(SUM(ea.score), 0) AS tong_diem,
  COALESCE(SUM(ea.earned_points), 0) AS tong_earned,
  COALESCE(SUM(ea.max_points), 0) AS tong_max
FROM public.exam_attempts ea;

-- Tổng điểm đã lưu ở student_answers. Đây là con số phải KHÔNG ĐỔI sau migration.
SELECT
  COUNT(*)::bigint AS tong_dong,
  COALESCE(SUM(sa.score), 0) AS tong_score,
  COALESCE(SUM(sa.max_score), 0) AS tong_max_score
FROM public.student_answers sa;

SELECT '=== C. Rủi ro đã biết ===' AS muc;

-- Hàng rào 4 ý: câu true_false không đúng 4 ý sẽ bị trigger chặn khi gắn vào đề
-- **moet_standard**. Kỳ vọng 0 dòng (42/42 câu trong bank có đúng 4 phương án).
--
-- Phạm vi hẹp hơn ta tưởng: những câu này vẫn gắn được vào đề học kì (custom) và
-- vào bài tập về nhà, và vẫn chấm được (bậc thang rơi về tỷ lệ tuyến tính — nhánh
-- hợp lệ cho hồ sơ custom). Chỉ đề thi thử là không nhận.
SELECT
  q.id AS question_id,
  COUNT(a.id)::bigint AS so_y_thuc_te,
  EXISTS (SELECT 1 FROM public.exam_questions eq WHERE eq.question_id = q.id) AS dang_nam_trong_de,
  EXISTS (
    SELECT 1 FROM public.exam_questions eq
    JOIN public.exams e ON e.id = eq.exam_id
    WHERE eq.question_id = q.id AND e.exam_mode = 'simulation'
  ) AS dang_nam_trong_de_se_thanh_moet
FROM public.questions q
LEFT JOIN public.answers a ON a.question_id = q.id
WHERE q.question_type = 'true_false'
GROUP BY q.id
HAVING COUNT(a.id) <> 4
ORDER BY q.id;

-- Cổng rubric tự luận. Backfill cố ý KHÔNG chạm dòng essay, nên các cặp dưới đây
-- phải khớp trước VÀ sau migration. Kỳ vọng lech = 0 ở cả 6 dòng.
-- Nếu có dòng lệch > 0,0001 thì lỗi đó CÓ TRƯỚC migration này và nó không sửa;
-- lần nộp sau sẽ raise ESSAY_RUBRIC_SCORE_MISMATCH.
SELECT
  eq.exam_id,
  eq.question_id,
  eq.score AS diem_trong_de,
  r.tong_rubric,
  round(abs(eq.score - r.tong_rubric), 6) AS lech
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
ORDER BY eq.exam_id, eq.question_id;

-- Bài tập về nhà. Bảng homework_questions kỳ vọng rỗng (0 dòng ngày 2026-08-06)
-- nên ràng buộc score > 0 là no-op. Nếu có dòng score <= 0 thì
-- ALTER TABLE ... VALIDATE CONSTRAINT trong migration sẽ THẤT BẠI — sửa trước.
--
-- Migration KHÔNG backfill trọng số bảng này và KHÔNG tạo hàng rào 4 ý trên nó:
-- bài tập kèm liên kết tri thức không dùng thang Bộ, mặc định 1 điểm mỗi câu.
SELECT
  COUNT(*)::bigint AS tong_dong,
  COUNT(*) FILTER (WHERE hq.score IS NULL OR hq.score <= 0)::bigint AS score_khong_duong_phai_bang_0
FROM public.homework_questions hq;

-- Trigger trên hai bảng liên quan. Kỳ vọng 0 dòng — hàng rào 4 ý là hoàn toàn
-- mới, không có trigger nào bị migration ghi đè.
--
-- Sau migration chỉ `exam_questions` có trigger 4 ý; `homework_questions` vẫn
-- phải 0 dòng. Migration có câu DROP TRIGGER IF EXISTS cho bảng homework nhưng
-- chỉ để dọn dấu vết của bản nháp trước, không tạo lại.
SELECT
  c.relname AS bang,
  t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('exam_questions', 'homework_questions')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- Quyền ghi theo cột trên `exams`. 20260722:3338-3350 grant INSERT/UPDATE theo
-- danh sách cột ĐÓNG, nên cột `scoring_profile` mới không tự có quyền.
-- Kỳ vọng trước migration: cả hai dòng false. Sau migration: insert = true,
-- update = false (cố ý — chỉ service_role hoặc SQL trực tiếp đổi được hồ sơ).
SELECT
  'exams.scoring_profile' AS cot,
  has_column_privilege('authenticated', 'public.exams'::regclass, 'scoring_profile', 'INSERT') AS co_quyen_insert,
  has_column_privilege('authenticated', 'public.exams'::regclass, 'scoring_profile', 'UPDATE') AS co_quyen_update
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'scoring_profile'
);

-- Quyền hiện tại của ba hàm chấm. CREATE OR REPLACE giữ quyền cũ, nhưng ghi lại
-- để postflight có mốc so sánh. Kỳ vọng: cả ba có EXECUTE cho authenticated,
-- và submit_exam_attempt_trusted_internal KHÔNG có.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS tham_so,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'submit_exam_attempt',
    'submit_exam_attempt_trusted_internal',
    'submit_practice_attempt',
    'check_homework_answer'
  )
ORDER BY p.proname;

SELECT 'Preflight xong. Chỉ chạy migration khi mục A báo ĐẠT.' AS ket_luan;
