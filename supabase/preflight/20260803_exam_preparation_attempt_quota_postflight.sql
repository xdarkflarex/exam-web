-- READ ONLY. Run after 20260803_exam_preparation_attempt_quota.sql.
-- Expected: every must_be_zero value is 0.
--
-- Kiểm tra cấu trúc/grant, không thay thế test bằng JWT thật. Xác minh hành vi
-- thực tế vẫn cần đăng nhập bằng một học sinh đã dùng hết lượt và xác nhận
-- trang prepare hiện "Bạn không còn lượt thi" thay vì lỗi 403 im lặng.

-- 1. Hàm tồn tại, đúng signature, vẫn là SECURITY DEFINER + STABLE.
SELECT 'function_missing_or_wrong_flags' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc proc
    JOIN pg_namespace ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'public'
      AND proc.proname = 'get_exam_preparation'
      AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
      AND proc.prosecdef                                  -- SECURITY DEFINER
      AND proc.provolatile = 's'                          -- STABLE
  )
) AS missing_function

UNION ALL

-- 2. search_path bị ghim (chống search_path hijacking trên SECURITY DEFINER).
SELECT 'function_search_path_not_pinned', COUNT(*)::bigint
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
  AND proc.proname = 'get_exam_preparation'
  AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
  AND (
    proc.proconfig IS NULL
    OR NOT (proc.proconfig @> ARRAY['search_path=public, pg_temp'])
  )

UNION ALL

-- 3. Payload mới thực sự có hai khoá bổ sung.
SELECT 'payload_keys_missing', COUNT(*)::bigint
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
  AND proc.proname = 'get_exam_preparation'
  AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
  AND (
    proc.prosrc NOT LIKE '%''max_attempts''%'
    OR proc.prosrc NOT LIKE '%''attempts_remaining''%'
  )

UNION ALL

-- 4. Guard cũ không bị đánh rơi khi CREATE OR REPLACE.
--    Nếu bất kỳ điều kiện nào biến mất, hàm đã bị viết lại sai.
SELECT 'guards_dropped', COUNT(*)::bigint
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
  AND proc.proname = 'get_exam_preparation'
  AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
  AND (
    proc.prosrc NOT LIKE '%UNAUTHENTICATED%'
    OR proc.prosrc NOT LIKE '%EXAM_NOT_AVAILABLE%'
    OR proc.prosrc NOT LIKE '%student_has_feature%'
    OR proc.prosrc NOT LIKE '%show_results_immediately%'
  )

UNION ALL

-- 5. anon/PUBLIC không được execute; authenticated thì phải được.
SELECT 'anon_or_public_can_execute', COUNT(*)::bigint
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
  AND proc.proname = 'get_exam_preparation'
  AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
  AND (
    has_function_privilege('anon', proc.oid, 'EXECUTE')
    OR has_function_privilege('public', proc.oid, 'EXECUTE')
  )

UNION ALL

SELECT 'authenticated_cannot_execute', COUNT(*)::bigint
FROM pg_proc proc
JOIN pg_namespace ns ON ns.oid = proc.pronamespace
WHERE ns.nspname = 'public'
  AND proc.proname = 'get_exam_preparation'
  AND pg_get_function_identity_arguments(proc.oid) = 'p_exam_id text'
  AND NOT has_function_privilege('authenticated', proc.oid, 'EXECUTE')

UNION ALL

-- 6. Cột `exams.max_attempts` phải tồn tại và là số nguyên.
SELECT 'max_attempts_column_missing', COUNT(*)::bigint
FROM (
  SELECT 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'max_attempts'
      AND data_type IN ('integer', 'smallint', 'bigint')
  )
) AS missing_column

UNION ALL

-- 7. Cảnh báo dữ liệu: max_attempts âm không có nghĩa trong logic quota
--    (0 = không giới hạn, >0 = số lượt). Giá trị âm sẽ làm UI và
--    start_exam_attempt diễn giải khác nhau.
SELECT 'negative_max_attempts_rows', COUNT(*)::bigint
FROM public.exams
WHERE max_attempts IS NOT NULL
  AND max_attempts < 0;
