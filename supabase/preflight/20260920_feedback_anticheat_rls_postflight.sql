-- 20260920_feedback_anticheat_rls_postflight.sql
--
-- Chạy SAU migration. Chỉ đọc. Mọi dòng `must_be_zero` phải bằng 0.
--
-- CẢNH BÁO ĐÃ GHI Ở `AGENTS.md`: file này chỉ đọc catalog, nên nó KHÔNG chứng
-- minh được tính năng chạy đúng. `20260809` từng có postflight đạt toàn bộ
-- trong khi tính năng hỏng hoàn toàn. Phép thử thật bằng JWT nằm ở
-- `scripts/feedback-anticheat-rls-check.mjs` — chạy nó rồi mới kết luận.

-- ---------------------------------------------------------------------------
-- Ảnh chụp: policy sau khi sửa
-- ---------------------------------------------------------------------------

SELECT
  'policy_sau_khi_sua' AS muc,
  tablename AS bang,
  policyname,
  cmd,
  roles::text AS ap_cho_role,
  qual AS bieu_thuc_using,
  with_check AS bieu_thuc_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — mọi dòng phải = 0
-- ---------------------------------------------------------------------------

SELECT 'rls_con_tat' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM pg_class
WHERE oid IN (to_regclass('public.question_feedbacks'), to_regclass('public.anti_cheat_logs'))
  AND NOT relrowsecurity
UNION ALL
SELECT 'policy_con_thieu_TO', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
  AND 'public' = ANY (roles)
UNION ALL
SELECT 'policy_con_doc_bang_khac', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(profiles|exam_attempts|exams)'
UNION ALL
SELECT 'insert_con_with_check_true', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
  AND cmd = 'INSERT' AND COALESCE(with_check, '') IN ('true', '(true)')
UNION ALL
SELECT 'thieu_ham_owns_exam_attempt', COUNT(*)::bigint
FROM (SELECT 1 WHERE to_regprocedure('public.owns_exam_attempt(text)') IS NULL) t
UNION ALL
SELECT 'ham_khong_phai_security_definer', COUNT(*)::bigint
FROM pg_proc p
WHERE p.oid = to_regprocedure('public.owns_exam_attempt(text)') AND NOT p.prosecdef
UNION ALL
SELECT 'ham_thieu_search_path', COUNT(*)::bigint
FROM pg_proc p
WHERE p.oid = to_regprocedure('public.owns_exam_attempt(text)')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
    WHERE cfg LIKE 'search_path=%'
  )
UNION ALL
SELECT 'authenticated_khong_goi_duoc_ham', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE to_regprocedure('public.owns_exam_attempt(text)') IS NOT NULL
    AND NOT has_function_privilege('authenticated', to_regprocedure('public.owns_exam_attempt(text)'), 'EXECUTE')
) t
UNION ALL
SELECT 'anon_van_goi_duoc_ham', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE to_regprocedure('public.owns_exam_attempt(text)') IS NOT NULL
    AND has_function_privilege('anon', to_regprocedure('public.owns_exam_attempt(text)'), 'EXECUTE')
) t
UNION ALL
-- `question_feedbacks` phải có đúng ba policy: admin_all, student_insert, student_read.
SELECT 'question_feedbacks_thieu_policy', (3 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_feedbacks'
  AND policyname IN (
    'question_feedbacks_admin_all',
    'question_feedbacks_student_insert',
    'question_feedbacks_student_read'
  )
UNION ALL
-- `anti_cheat_logs` phải có đúng hai policy mới.
SELECT 'anti_cheat_logs_thieu_policy', (2 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'anti_cheat_logs'
  AND policyname IN ('anti_cheat_logs_student_insert', 'anti_cheat_logs_staff_read')
UNION ALL
-- Policy cũ phải biến mất hết.
SELECT 'policy_cu_con_sot', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'Admin can manage all feedbacks',
    'System can insert anti-cheat logs',
    'Teachers see anti-cheat logs'
  )
UNION ALL
-- Học sinh KHÔNG được có đường UPDATE/DELETE trên góp ý.
SELECT 'hoc_sinh_sua_xoa_duoc_gop_y', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_feedbacks'
  AND cmd IN ('UPDATE', 'DELETE')
  AND policyname <> 'question_feedbacks_admin_all'
ORDER BY check_name;
