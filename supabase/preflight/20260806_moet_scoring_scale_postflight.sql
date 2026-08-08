-- 20260806_moet_scoring_scale_postflight.sql
--
-- CHỈ ĐỌC. Chạy SAU `supabase/migrations/20260806_moet_scoring_scale.sql`.
-- Kỳ vọng: mọi must_be_zero đều bằng 0.
--
-- PHẠM VI — đọc trước khi kết luận một dòng > 0 là lỗi. Thang Bộ chỉ bắt buộc với
-- đề `exams.scoring_profile = 'moet_standard'` (thi thử). Đề `custom` (thi học kì)
-- do giáo viên đặt trọng số, và `homework_questions` không dùng thang này. Vì vậy
-- mọi kiểm trọng số dưới đây đều JOIN `exams` và lọc theo hồ sơ; đề custom mang
-- trọng số 1 mỗi câu là ĐÚNG, không phải sót backfill.
--
-- Bậc thang Đúng/Sai thì áp cho **cả hai hồ sơ và cả bài tập về nhà** — nó là cách
-- chấm một câu, không phải cách phân bổ điểm của đề.
--
-- Ngoài bảng must_be_zero còn hai bảng kiểm ở cuối file: bảng giá trị bậc thang
-- (phải khớp `TRUE_FALSE_LADDER` trong `src/lib/exam/scoring.ts`) và ảnh chụp sau
-- migration để đối chiếu với preflight.

-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo` của psql. Chạy trọn file một lần.

-- ---------------------------------------------------------------------------
-- CỔNG CHẶN: migration đã áp chưa?
-- ---------------------------------------------------------------------------
--
-- Vì sao cần cổng này. Bảng must_be_zero dưới đây là MỘT câu lệnh duy nhất (30
-- nhánh nối bằng UNION ALL, dấu `;` đầu tiên ở cuối `ORDER BY check_name`).
-- Postgres phân giải toàn bộ tên cột trước khi chạy nhánh nào, nên nếu
-- `exams.scoring_profile` chưa tồn tại thì cả 30 kiểm chết cùng lúc với đúng một
-- dòng `column e.scoring_profile does not exist` ở giữa file — thông báo đó không
-- nói được rằng nguyên nhân là "chưa chạy migration", và người đọc dễ tưởng
-- database hỏng hoặc postflight viết sai.
--
-- Cổng này raise TRƯỚC, bằng tên lỗi nói thẳng phải làm gì.
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'scoring_profile'
  ) THEN
    v_missing := v_missing || 'cột exams.scoring_profile';
  END IF;

  IF to_regprocedure('public.moet_true_false_score(numeric, integer, integer)') IS NULL THEN
    v_missing := v_missing || 'hàm moet_true_false_score(numeric,integer,integer)';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT_CHAY_QUA_SOM: chưa áp 20260806_moet_scoring_scale.sql'
      USING DETAIL = format(
        'Thiếu: %s. Migration nằm trong một BEGIN...COMMIT nên thiếu một thứ '
        || 'nghĩa là thiếu tất cả — nó chưa chạy, hoặc đã rollback. '
        || 'Thứ tự đúng: backup → preflight → migration → postflight '
        || '(docs/RUNBOOK.md mục 8). Postflight chỉ đọc, chạy sớm không hỏng gì.',
        array_to_string(v_missing, ', ')
      );
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- Bảng kiểm bậc thang — in ra để đọc bằng mắt
-- ---------------------------------------------------------------------------
--
-- Kỳ vọng, và đây là điểm khác biệt cốt lõi của migration này:
--
--   so_y_dung | diem_moi | diem_cu_tuyen_tinh
--   ----------+----------+--------------------
--           0 |     0.00 |               0.00
--           1 |     0.10 |               0.25
--           2 |     0.25 |               0.50
--           3 |     0.50 |               0.75   <- sai lệch lớn nhất
--           4 |     1.00 |               1.00

SELECT
  k AS so_y_dung,
  public.moet_true_false_score(1, k, 4) AS diem_moi,
  round(1.0 * k / 4, 4) AS diem_cu_tuyen_tinh,
  public.moet_true_false_score(1, k, 4) - round(1.0 * k / 4, 4) AS chenh_lech
FROM generate_series(0, 4) AS k
ORDER BY k;

-- ---------------------------------------------------------------------------
-- Ảnh chụp sau migration — đối chiếu với preflight
-- ---------------------------------------------------------------------------

-- Trọng số theo hồ sơ. Đề moet_standard chỉ được xuất hiện với 0,25 / 1,0 / 0,5;
-- đề custom giữ nguyên 1 mỗi câu (trên Primary ngày 2026-08-06).
SELECT
  e.scoring_profile,
  eq.question_type,
  eq.score,
  COUNT(*)::bigint AS so_dong
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
GROUP BY e.scoring_profile, eq.question_type, eq.score
ORDER BY e.scoring_profile, eq.question_type, eq.score;

-- Tổng điểm từng đề sau migration. Đề THI THỬ chuẩn 12 MC + 4 TF + 6 SA phải ra
-- 10,0. Đề thi thử không theo cấu trúc chuẩn ra số khác 10 là BÌNH THƯỜNG — phép
-- quy đổi earned/max*10 vẫn cho làm đúng hết được 10 điểm (quyết định 2026-08-06).
--
-- Đề CUSTOM ra số khác 10 cũng bình thường và không có gì phải kiểm: cột
-- dung_thang_10 chỉ có nghĩa ở dòng moet_standard.
SELECT
  e.id,
  e.title,
  e.exam_mode,
  e.scoring_profile,
  e.total_score,
  COUNT(*) FILTER (WHERE eq.question_type = 'multiple_choice')::bigint AS so_mc,
  COUNT(*) FILTER (WHERE eq.question_type = 'true_false')::bigint AS so_tf,
  COUNT(*) FILTER (WHERE eq.question_type = 'short_answer')::bigint AS so_sa,
  COUNT(*) FILTER (WHERE eq.question_type = 'essay')::bigint AS so_essay,
  CASE WHEN e.scoring_profile = 'moet_standard'
       THEN (e.total_score = 10.0)::text
       ELSE 'khong_ap_dung' END AS dung_thang_10
FROM public.exams e
JOIN public.exam_questions eq ON eq.exam_id = e.id
GROUP BY e.id, e.title, e.exam_mode, e.scoring_profile, e.total_score
ORDER BY e.id;

-- 14 attempt cũ: các con số dưới đây phải GIỐNG HỆT preflight. Migration không
-- đọc, không ghi exam_attempts và student_answers.
SELECT
  COUNT(*)::bigint AS tong_attempt,
  COUNT(*) FILTER (WHERE ea.score IS NOT NULL)::bigint AS co_diem,
  COALESCE(SUM(ea.score), 0) AS tong_diem,
  COALESCE(SUM(ea.earned_points), 0) AS tong_earned,
  COALESCE(SUM(ea.max_points), 0) AS tong_max
FROM public.exam_attempts ea;

SELECT
  COUNT(*)::bigint AS tong_dong,
  COALESCE(SUM(sa.score), 0) AS tong_score,
  COALESCE(SUM(sa.max_score), 0) AS tong_max_score
FROM public.student_answers sa;


-- ---------------------------------------------------------------------------
-- BẢNG KẾT LUẬN — đặt CUỐI FILE có chủ ý
-- ---------------------------------------------------------------------------
--
-- Supabase SQL Editor chỉ hiện kết quả của CÂU LỆNH CUỐI CÙNG khi chạy nhiều
-- câu một lượt. Bảng 30 kiểm dưới đây là phần quyết định đạt/không đạt, nên nó
-- phải là câu cuối; để nó ở giữa file thì chạy xong bạn chỉ thấy bảng ảnh chụp
-- và không biết migration đạt hay không. Các bảng ảnh chụp ở trên vẫn đọc được
-- bằng psql, hoặc bằng cách bôi đen riêng từng câu rồi Run trong Editor.
--
-- Kỳ vọng: MỌI dòng must_be_zero = 0.
SELECT 'thieu_ham_bac_thang' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1 WHERE to_regprocedure('public.moet_true_false_score(numeric, integer, integer)') IS NULL
) t

UNION ALL
-- Wrapper submit_exam_attempt phải còn nguyên VÀ còn gọi hàm internal. Nếu
-- migration vô tình ghi đè wrapper thì phần gating công bố điểm biến mất và học
-- sinh thấy điểm bài tự luận trước khi giáo viên duyệt.
SELECT 'wrapper_submit_exam_attempt_mat_hoac_khong_goi_internal', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE to_regprocedure('public.submit_exam_attempt(text, jsonb)') IS NULL
  UNION ALL
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'submit_exam_attempt'
    AND pg_get_function_identity_arguments(p.oid) = 'p_attempt_id text, p_answers jsonb'
    AND p.prosrc NOT LIKE '%submit_exam_attempt_trusted_internal%'
) t

UNION ALL
-- Ba hàm chấm phải gọi hàm bậc thang. Đây là kiểm quyết định: nếu dòng này > 0
-- thì migration KHÔNG vào đúng thân hàm đang chạy và 3/4 ý vẫn ra 0,75.
SELECT 'ham_cham_chua_goi_bac_thang', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'submit_exam_attempt_trusted_internal',
      'submit_practice_attempt',
      'check_homework_answer'
    )
    AND p.prosrc NOT LIKE '%moet_true_false_score%'
) t

UNION ALL
-- Tàn dư công thức tuyến tính. Chuỗi 'v_tf_correct / v_tf_total' chỉ xuất hiện
-- trong công thức cũ round(v_max_score * v_tf_correct / v_tf_total, 4).
SELECT 'con_cong_thuc_tuyen_tinh_cu', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'submit_exam_attempt_trusted_internal',
      'submit_practice_attempt',
      'check_homework_answer'
    )
    AND p.prosrc LIKE '%v_tf_correct / v_tf_total%'
) t

UNION ALL
-- Cổng rubric tự luận phải còn trong hàm chấm thi thử.
SELECT 'mat_cong_rubric_tu_luan', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'submit_exam_attempt_trusted_internal'
    AND (
      p.prosrc NOT LIKE '%ESSAY_RUBRIC_SCORE_MISMATCH%'
      OR p.prosrc NOT LIKE '%ESSAY_GRADING_CONFIG_MISSING%'
    )
) t

UNION ALL
-- Phép quy đổi thang 10 phải còn nguyên ở cả ba hàm nộp bài.
SELECT 'mat_phep_quy_doi_thang_10', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'submit_exam_attempt_trusted_internal',
      'submit_practice_attempt',
      'submit_homework_attempt'
    )
    AND p.prosrc NOT LIKE '%/ v_max_p%'
) t

UNION ALL
-- Ba hàm chấm phải giữ SECURITY DEFINER và search_path cố định. CREATE OR REPLACE
-- giữ nguyên hai thuộc tính này, nhưng mất chúng là mất cả hàng rào bảo mật.
SELECT 'ham_cham_mat_security_definer_hoac_search_path', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'submit_exam_attempt_trusted_internal',
      'submit_practice_attempt',
      'check_homework_answer',
      'enforce_true_false_four_statements'
    )
    AND (
      NOT p.prosecdef
      OR p.proconfig IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
      )
    )
) t

UNION ALL
-- Quyền: hai RPC client gọi trực tiếp phải còn EXECUTE cho authenticated.
SELECT 'mat_grant_execute_cho_authenticated', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('submit_exam_attempt', 'submit_practice_attempt', 'check_homework_answer')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
) t

UNION ALL
-- Quyền: anon không được gọi hàm chấm nào, và hàm internal cũng không được lộ
-- cho authenticated (client phải đi qua wrapper để chịu gating công bố điểm).
SELECT 'ham_cham_bi_lo_quyen', COUNT(*)::bigint
FROM (
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (
        p.proname IN (
          'submit_exam_attempt',
          'submit_exam_attempt_trusted_internal',
          'submit_practice_attempt',
          'check_homework_answer',
          'moet_true_false_score',
          'enforce_true_false_four_statements'
        )
        AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE')
        )
      )
      OR (
        p.proname IN (
          'submit_exam_attempt_trusted_internal',
          'moet_true_false_score',
          'enforce_true_false_four_statements'
        )
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    )
) t

UNION ALL
-- Hàng rào 4 ý phải có trên `exam_questions`.
SELECT 'thieu_trigger_hang_rao_4_y', COUNT(*)::bigint
FROM (SELECT 1) AS x
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'exam_questions'
    AND t.tgname = 'exam_questions_true_false_four_statements'
    AND NOT t.tgisinternal
)

UNION ALL
-- Và KHÔNG được có trên `homework_questions`. Bài tập kèm liên kết tri thức không
-- dùng thang Bộ, nên câu Đúng/Sai 2 hay 3 ý phải gắn được vào bài tập. Bản nháp
-- trước của migration có tạo trigger này; nếu dòng dưới > 0 thì bản nháp đó đã
-- chạy trên Primary và phải DROP tay.
SELECT 'trigger_4_y_khong_duoc_co_tren_homework', COUNT(*)::bigint
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'homework_questions'
  AND t.tgname = 'homework_questions_true_false_four_statements'
  AND NOT t.tgisinternal

UNION ALL
-- Cột hồ sơ thang điểm: phải tồn tại, NOT NULL, DEFAULT 'custom'.
SELECT 'exams_scoring_profile_sai_dinh_nghia', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'scoring_profile'
      AND is_nullable = 'NO'
      AND column_default LIKE '%custom%'
  )
) t

UNION ALL
-- CHECK constraint của hồ sơ phải tồn tại và đã VALIDATE.
SELECT 'thieu_rang_buoc_exams_scoring_profile_check', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'exams'
      AND c.conname = 'exams_scoring_profile_check'
      AND c.convalidated
  )
) t

UNION ALL
-- Không đề nào mang hồ sơ lạ. CHECK constraint đã chặn, dòng này bắt trường hợp
-- constraint bị DROP mà quên tạo lại.
SELECT 'exams_scoring_profile_gia_tri_la', COUNT(*)::bigint
FROM public.exams e
WHERE e.scoring_profile IS NULL
   OR e.scoring_profile NOT IN ('moet_standard', 'custom')

UNION ALL
-- Quyền ghi theo cột. 20260722:3338-3350 grant INSERT/UPDATE theo danh sách cột
-- ĐÓNG nên cột mới không tự có quyền — thiếu GRANT INSERT thì trang tạo đề đứt
-- với lỗi permission denied. GRANT UPDATE thì cố ý KHÔNG có: đổi hồ sơ của đề đã
-- tồn tại làm mọi trọng số hiện có thành sai thang, phải làm bằng SQL có chủ đích.
SELECT 'quyen_cot_scoring_profile_sai', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT has_column_privilege('authenticated', 'public.exams'::regclass, 'scoring_profile', 'INSERT')
  UNION ALL
  SELECT 1 WHERE has_column_privilege('authenticated', 'public.exams'::regclass, 'scoring_profile', 'UPDATE')
) t

UNION ALL
-- Ràng buộc điểm dương của homework_questions phải tồn tại và đã VALIDATE.
SELECT 'thieu_rang_buoc_homework_positive_score', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'homework_questions'
      AND c.conname = 'homework_questions_positive_score'
      AND c.convalidated
  )
) t

UNION ALL
-- Trọng số đề THI THỬ: trắc nghiệm 4 phương án phải là 0,25.
SELECT 'thi_thu_trac_nghiem_khac_0_25', COUNT(*)::bigint
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.scoring_profile = 'moet_standard'
  AND eq.question_type = 'multiple_choice' AND eq.score IS DISTINCT FROM 0.25

UNION ALL
-- Trọng số đề THI THỬ: Đúng/Sai phải là 1,0 (bậc thang nhân trên trọng số này).
SELECT 'thi_thu_dung_sai_khac_1_0', COUNT(*)::bigint
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.scoring_profile = 'moet_standard'
  AND eq.question_type = 'true_false' AND eq.score IS DISTINCT FROM 1.0

UNION ALL
-- Trọng số đề THI THỬ: trả lời ngắn phải là 0,5.
SELECT 'thi_thu_tra_loi_ngan_khac_0_5', COUNT(*)::bigint
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.scoring_profile = 'moet_standard'
  AND eq.question_type = 'short_answer' AND eq.score IS DISTINCT FROM 0.5

UNION ALL
-- Đề CUSTOM phải KHÔNG bị backfill. Trên Primary ngày 2026-08-06 mọi đề custom
-- mang trọng số 1 mỗi câu; nếu dòng này > 0 thì backfill đã quét quá phạm vi và
-- ma trận điểm giáo viên tự đặt bị ghi đè bằng thang Bộ.
--
-- Đây là kiểm CHỈ ĐÚNG NGAY SAU MIGRATION. Khi giáo viên bắt đầu tự đặt trọng số
-- cho đề học kì, dòng này sẽ > 0 một cách hợp lệ — lúc đó bỏ nó đi, đừng "sửa"
-- dữ liệu cho vừa với nó.
SELECT 'de_custom_bi_backfill_ngoai_pham_vi', COUNT(*)::bigint
FROM public.exam_questions eq
JOIN public.exams e ON e.id = eq.exam_id
WHERE e.scoring_profile = 'custom'
  AND eq.question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND eq.score IS DISTINCT FROM 1

UNION ALL
-- Không dòng nào vi phạm CHECK (score > 0) của 20260722:200-205.
SELECT 'exam_questions_score_khong_duong', COUNT(*)::bigint
FROM public.exam_questions eq
WHERE eq.score IS NULL OR eq.score <= 0

UNION ALL
-- Tự luận: điểm câu phải khớp tổng rubric trong ngưỡng 0,0001 — cùng ngưỡng
-- ESSAY_RUBRIC_SCORE_MISMATCH. Backfill cố ý không chạm dòng essay nên kết quả
-- này phải giống hệt preflight. Câu essay thiếu config cũng bị đếm ở đây.
--
-- KHÔNG lọc theo hồ sơ: cổng rubric là ràng buộc của RPC chấm thi, không phải của
-- thang Bộ, nên nó áp cho cả đề học kì.
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
-- Bài tập về nhà KHÔNG bị áp thang Bộ. Migration không backfill bảng này; nếu
-- dòng dưới > 0 thì một bản nháp cũ đã chạy và ghi 0,25/1,0/0,5 vào bài tập.
-- Bảng rỗng ngày 2026-08-06 nên kỳ vọng 0 là chắc chắn.
SELECT 'homework_bi_ap_thang_bo', COUNT(*)::bigint
FROM public.homework_questions hq
JOIN public.questions q ON q.id = hq.question_id
WHERE q.question_type IN ('multiple_choice', 'true_false', 'short_answer')
  AND hq.score IN (0.25, 0.5)

UNION ALL
-- exams.total_score phải khớp SUM(exam_questions.score). Lệch nhau thì con số
-- giáo viên thấy nói khác con số máy chấm.
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
-- Bảng giá trị bậc thang phía database. Phải khớp TRUE_FALSE_LADDER trong
-- src/lib/exam/scoring.ts: 0 / 0,1 / 0,25 / 0,5 / 1,0. Nếu dòng này > 0 thì hai
-- lớp chấm khác nhau và điểm học sinh phụ thuộc vào chỗ nào chấm.
SELECT 'bac_thang_sai_bang_gia_tri', COUNT(*)::bigint
FROM (
  VALUES (0, 0::numeric), (1, 0.1), (2, 0.25), (3, 0.5), (4, 1.0)
) AS expected(so_y_dung, diem_ky_vong)
WHERE public.moet_true_false_score(1, expected.so_y_dung, 4)
      IS DISTINCT FROM expected.diem_ky_vong

UNION ALL
-- Bậc thang phải giữ hình dạng khi trọng số câu khác 1.
SELECT 'bac_thang_sai_khi_trong_so_khac_1', COUNT(*)::bigint
FROM (
  VALUES
    (2::numeric, 4, 2.0::numeric), (2, 3, 1.0), (2, 2, 0.5), (2, 1, 0.2),
    (0.5, 3, 0.25), (0.5, 4, 0.5)
) AS expected(trong_so, so_y_dung, diem_ky_vong)
WHERE public.moet_true_false_score(expected.trong_so, expected.so_y_dung, 4)
      IS DISTINCT FROM expected.diem_ky_vong

UNION ALL
-- Đầu vào vô nghĩa phải trả 0, không trả NULL. NULL sẽ lan vào v_earned_points
-- và làm mất điểm cả bài thay vì một câu.
SELECT 'bac_thang_tra_null_hoac_am', COUNT(*)::bigint
FROM (
  VALUES
    (1::numeric, 0, 0), (0::numeric, 4, 4), (-1::numeric, 4, 4),
    (1::numeric, 4, -4), (1::numeric, 9, 4), (1::numeric, -3, 4)
) AS bad(trong_so, so_y_dung, tong_y)
WHERE public.moet_true_false_score(bad.trong_so, bad.so_y_dung, bad.tong_y) IS NULL
   OR public.moet_true_false_score(bad.trong_so, bad.so_y_dung, bad.tong_y) < 0
   OR public.moet_true_false_score(bad.trong_so, bad.so_y_dung, bad.tong_y) > 1

UNION ALL
-- Đúng 4 ý phải bằng trọng số câu, không hơn: không có đường nào cho điểm vượt
-- max_score, kể cả khi số ý đúng bị truyền sai.
SELECT 'bac_thang_vuot_trong_so', COUNT(*)::bigint
FROM (
  SELECT generate_series(-2, 8) AS so_y_dung
) AS s
WHERE public.moet_true_false_score(1, s.so_y_dung, 4) > 1.0

UNION ALL
-- Câu Đúng/Sai nằm trong đề THI THỬ mà không đúng 4 ý → bậc thang mất nghĩa cho
-- những câu này (chúng rơi về fallback tỷ lệ tuyến tính). Trigger chặn từ nay,
-- nhưng dòng gắn TRƯỚC migration thì trigger không thấy — nên phải kiểm.
--
-- Chỉ tính đề moet_standard: trong đề học kì và bài tập, câu Đúng/Sai 2 hay 3 ý
-- là hợp lệ và chấm theo tỷ lệ là cách hiểu đúng.
SELECT 'thi_thu_cau_dung_sai_khong_du_4_y', COUNT(*)::bigint
FROM (
  SELECT eq.question_id
  FROM public.exam_questions eq
  JOIN public.exams e ON e.id = eq.exam_id
  WHERE eq.question_type = 'true_false'
    AND e.scoring_profile = 'moet_standard'
  GROUP BY eq.question_id
  HAVING (SELECT COUNT(*) FROM public.answers a WHERE a.question_id = eq.question_id) <> 4
) t

ORDER BY check_name;