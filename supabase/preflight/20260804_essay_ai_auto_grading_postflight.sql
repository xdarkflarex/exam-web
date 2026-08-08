-- READ ONLY. Chạy SAU 20260804_essay_ai_auto_grading.sql.
-- Kỳ vọng: mọi must_be_zero đều bằng 0.
--
-- Đây là hậu kiểm cấu trúc/quyền. Nó KHÔNG chứng minh hành vi runtime đúng;
-- phần đó cần test bằng JWT thật (xem cuối file).

-- 1. Constraint grading_status đã nhận ai_graded.
SELECT 'ai_graded_not_allowed' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_answers_grading_status_check'
      AND pg_get_constraintdef(oid) LIKE '%ai_graded%'
  )
) t

UNION ALL

-- 2. actor_kind tồn tại, NOT NULL, có CHECK.
SELECT 'actor_kind_column_bad', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'essay_grading_reviews'
      AND column_name = 'actor_kind'
      AND is_nullable = 'NO'
  )
) t

UNION ALL

SELECT 'actor_kind_check_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'essay_grading_reviews_actor_kind_check'
  )
) t

UNION ALL

SELECT 'actor_consistency_check_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'essay_grading_reviews_actor_consistency_check'
  )
) t

UNION ALL

-- 3. reviewer_id đã nullable.
SELECT 'reviewer_id_still_not_null', COUNT(*)::bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'essay_grading_reviews'
  AND column_name = 'reviewer_id'
  AND is_nullable = 'NO'

UNION ALL

-- 4. Ba hàm tồn tại và là SECURITY DEFINER với search_path ghim.
SELECT 'functions_missing_or_unsafe', COUNT(*)::bigint
FROM (
  VALUES
    ('ai_finalize_essay_answer'),
    ('get_essay_grading_package'),
    ('recount_attempt_grading')
) AS expected(fname)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = expected.fname
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public, pg_temp']
)

UNION ALL

-- 5. QUAN TRỌNG NHẤT: student/anon KHÔNG được gọi hàm chốt điểm.
--    Nếu dòng này khác 0, học sinh có thể tự chấm điểm cho mình.
SELECT 'authenticated_can_call_ai_rpc', COUNT(*)::bigint
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ai_finalize_essay_answer',
    'get_essay_grading_package',
    'recount_attempt_grading'
  )
  AND (
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
    OR has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('public', p.oid, 'EXECUTE')
  )

UNION ALL

-- 6. service_role phải gọi được, nếu không worker sẽ hỏng.
SELECT 'service_role_cannot_call', COUNT(*)::bigint
FROM (
  VALUES
    ('ai_finalize_essay_answer'),
    ('get_essay_grading_package'),
    ('recount_attempt_grading')
) AS expected(fname)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = expected.fname
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')
)

UNION ALL

-- 7. Tính nhất quán dữ liệu: bản ghi ai không được có reviewer_id và ngược lại.
SELECT 'inconsistent_review_actor_rows', COUNT(*)::bigint
FROM public.essay_grading_reviews
WHERE (actor_kind = 'ai' AND reviewer_id IS NOT NULL)
   OR (actor_kind = 'teacher' AND reviewer_id IS NULL)

UNION ALL

-- 8. Answer ai_graded phải có điểm và model; không được rỗng.
SELECT 'ai_graded_rows_incomplete', COUNT(*)::bigint
FROM public.student_answers
WHERE grading_status = 'ai_graded'
  AND (score IS NULL OR ai_model IS NULL OR graded_by IS NOT NULL)

UNION ALL

-- 9. Không attempt nào vừa còn pending vừa đã công bố điểm.
SELECT 'attempt_score_pending_conflict', COUNT(*)::bigint
FROM public.exam_attempts
WHERE pending_grading_count > 0 AND score IS NOT NULL

UNION ALL

-- 10. Điểm không vượt thang 10.
SELECT 'attempt_score_out_of_range', COUNT(*)::bigint
FROM public.exam_attempts
WHERE score IS NOT NULL AND (score < 0 OR score > 10)

UNION ALL

-- 11. Điểm từng câu không vượt max_score.
SELECT 'answer_score_over_max', COUNT(*)::bigint
FROM public.student_answers
WHERE score IS NOT NULL AND max_score IS NOT NULL AND score > max_score;


-- ===========================================================================
-- TEST HÀNH VI - phải làm thủ công, postflight ở trên KHÔNG thay thế được
-- ===========================================================================
--
-- A. Bằng JWT của một học sinh bất kỳ, thử gọi:
--      SELECT public.ai_finalize_essay_answer('bat_ky', 'x', 1, 10, 1, 'a', NULL, 'm');
--    KỲ VỌNG: lỗi permission denied. Nếu chạy được, DỪNG và thu hồi quyền ngay.
--
-- B. Bằng service_role, gọi ai_finalize_essay_answer HAI LẦN với cùng payload
--    trên một answer đang pending.
--    KỲ VỌNG: lần hai trả idempotent = true, và essay_grading_reviews chỉ có
--    thêm đúng một hàng.
--
-- C. Sau khi AI chốt (trạng thái ai_graded), gọi review_essay_answer bằng JWT
--    giáo viên đúng lớp với điểm khác.
--    KỲ VỌNG: thành công, trạng thái chuyển 'approved', reviewer_id là giáo
--    viên đó, và điểm toàn bài được tính lại theo điểm mới.
--
-- D. Sau khi giáo viên đã duyệt (approved), gọi lại ai_finalize_essay_answer.
--    KỲ VỌNG: lỗi ANSWER_NOT_PENDING. AI không được đè lên quyết định người.
--
-- E. Gọi ai_finalize_essay_answer với p_ai_score lớn hơn max_score.
--    KỲ VỌNG: lỗi INVALID_AI_SCORE.
--
-- F. Gọi với p_answer_hash sai.
--    KỲ VỌNG: lỗi ANSWER_VERSION_MISMATCH.
