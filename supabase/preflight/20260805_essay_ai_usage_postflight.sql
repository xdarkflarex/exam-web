-- READ ONLY. Chạy SAU 20260805_essay_ai_usage.sql.
-- Kỳ vọng: mọi must_be_zero đều bằng 0.
--
-- Đây là hậu kiểm cấu trúc/quyền. Nó KHÔNG chứng minh hành vi runtime đúng;
-- phần đó cần test bằng JWT thật (xem cuối file).

-- 1. Bảng tồn tại.
SELECT 'usage_table_missing' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'essay_ai_usage'
  )
) t

UNION ALL

-- 2. Đủ cột theo đúng tên worker dùng.
SELECT 'expected_columns_missing', COUNT(*)::bigint
FROM (
  VALUES
    ('student_answer_id'), ('attempt_id'), ('provider'), ('model'),
    ('input_hash'), ('response_hash'), ('prompt_tokens'), ('completion_tokens'),
    ('estimated_cost_usd'), ('latency_ms'), ('outcome'), ('triggers'),
    ('ai_score'), ('ai_confidence'), ('created_at')
) AS expected(col)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'essay_ai_usage'
    AND c.column_name = expected.col
)

UNION ALL

-- 3. UNIQUE (input_hash) — chốt chống gọi provider hai lần. Thiếu ràng buộc
--    này thì worker chạy lại sẽ trả tiền lần nữa cho cùng một bài.
SELECT 'input_hash_unique_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'essay_ai_usage_input_hash_key'
      AND contype = 'u'
  )
) t

UNION ALL

-- 4. CHECK outcome tồn tại.
SELECT 'outcome_check_missing', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'essay_ai_usage_outcome_check'
  )
) t

UNION ALL

-- 5. FK có ON DELETE CASCADE: xoá attempt phải kéo theo nhật ký, nếu không sẽ
--    còn lại hàng mồ côi trỏ tới bài đã xoá.
SELECT 'fk_not_cascade', COUNT(*)::bigint
FROM (
  VALUES ('student_answer_id'), ('attempt_id')
) AS expected(col)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.essay_ai_usage'::regclass
    AND c.contype = 'f'
    AND c.confdeltype = 'c'
    AND a.attname = expected.col
)

UNION ALL

-- 6. RLS bật và FORCE.
SELECT 'rls_not_enabled', COUNT(*)::bigint
FROM pg_class
WHERE oid = 'public.essay_ai_usage'::regclass
  AND (relrowsecurity IS FALSE OR relforcerowsecurity IS FALSE)

UNION ALL

-- 7. QUAN TRỌNG NHẤT: không policy nào cho authenticated/anon.
--    Bảng chứa ai_score gắn với student_answer_id — học sinh đọc được nghĩa là
--    thấy điểm trước khi công bố.
SELECT 'unexpected_policy_present', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'essay_ai_usage'

UNION ALL

-- 8. Quyền bảng đã thu hồi khỏi anon/authenticated/public.
SELECT 'table_privilege_leaked', COUNT(*)::bigint
FROM (
  VALUES ('anon'), ('authenticated'), ('public')
) AS grantee(role_name)
WHERE has_table_privilege(
  grantee.role_name, 'public.essay_ai_usage', 'SELECT'
) OR has_table_privilege(
  grantee.role_name, 'public.essay_ai_usage', 'INSERT'
)

UNION ALL

-- 9. service_role phải đọc ghi được, nếu không worker hỏng.
SELECT 'service_role_cannot_use_table', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT (
    has_table_privilege('service_role', 'public.essay_ai_usage', 'SELECT')
    AND has_table_privilege('service_role', 'public.essay_ai_usage', 'INSERT')
  )
) t

UNION ALL

-- 10. Hàm chi phí tồn tại, SECURITY DEFINER, search_path ghim.
SELECT 'cost_function_missing_or_unsafe', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'essay_ai_month_to_date_cost'
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  )
) t

UNION ALL

-- 11. Hàm chi phí không được cấp cho authenticated/anon: nó là hàm SECURITY
--     DEFINER đọc bảng mà học sinh không được đọc.
SELECT 'authenticated_can_call_cost_fn', COUNT(*)::bigint
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'essay_ai_month_to_date_cost'
  AND (
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
    OR has_function_privilege('anon', p.oid, 'EXECUTE')
    OR has_function_privilege('public', p.oid, 'EXECUTE')
  )

UNION ALL

SELECT 'service_role_cannot_call_cost_fn', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'essay_ai_month_to_date_cost'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  )
) t

UNION ALL

-- 12. Hàm chạy được và trả số không âm.
SELECT 'cost_function_returns_bad_value', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE public.essay_ai_month_to_date_cost() < 0
) t

UNION ALL

-- 13. Nhất quán dữ liệu: 'skipped' không được có chi phí, và
--     'auto_finalized' bắt buộc phải có điểm.
SELECT 'skipped_rows_with_cost', COUNT(*)::bigint
FROM public.essay_ai_usage
WHERE outcome = 'skipped' AND estimated_cost_usd > 0

UNION ALL

SELECT 'finalized_rows_without_score', COUNT(*)::bigint
FROM public.essay_ai_usage
WHERE outcome = 'auto_finalized' AND ai_score IS NULL;


-- ===========================================================================
-- TEST HÀNH VI - phải làm thủ công, postflight ở trên KHÔNG thay thế được
-- ===========================================================================
--
-- A. Bằng JWT của một học sinh bất kỳ:
--      SELECT * FROM public.essay_ai_usage;
--    KỲ VỌNG: permission denied (hoặc 0 hàng). Nếu đọc được điểm của chính
--    mình trước khi công bố, DỪNG và thu hồi quyền ngay.
--
-- B. Bằng JWT học sinh:
--      SELECT public.essay_ai_month_to_date_cost();
--    KỲ VỌNG: permission denied.
--
-- C. Bằng service_role, insert hai hàng cùng input_hash.
--    KỲ VỌNG: hàng thứ hai bị chặn bởi essay_ai_usage_input_hash_key.
--    Đây chính là cơ chế khiến worker chạy lại không tốn tiền lần nữa.
--
-- D. Xoá một exam_attempt thử.
--    KỲ VỌNG: các hàng essay_ai_usage của attempt đó biến mất theo (CASCADE).
