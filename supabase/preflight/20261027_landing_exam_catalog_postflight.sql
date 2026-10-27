-- 20261027_landing_exam_catalog_postflight.sql
--
-- Chạy SAU migration. Chỉ đọc. Mọi dòng `must_be_zero` phải bằng 0.
--
-- CẢNH BÁO ĐÃ GHI Ở `AGENTS.md` mục 4: file này đọc catalog, nên nó KHÔNG
-- chứng minh được trang chủ chạy đúng. Phép thử thật bằng anon key qua
-- PostgREST nằm ở RUNBOOK mục 8vicies bước 4 — chạy nó rồi mới kết luận.

SELECT
  'quyen_cot_anon_sau_khi_sua' AS muc,
  c.column_name AS cot,
  has_column_privilege('anon', 'public.exams', c.column_name, 'SELECT') AS anon_doc_duoc
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'exams'
ORDER BY anon_doc_duoc DESC, c.column_name;

SELECT
  'policy_sau_khi_sua' AS muc,
  tablename AS bang, policyname, cmd, roles::text AS ap_cho_role, qual AS bieu_thuc_using
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('exams', 'exam_questions')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — mọi dòng phải = 0
-- ---------------------------------------------------------------------------

SELECT 'anon_chua_doc_duoc_grade' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exams', 'grade', 'SELECT')) t
UNION ALL
SELECT 'anon_chua_doc_duoc_description', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exams', 'description', 'SELECT')) t
UNION ALL
SELECT 'anon_chua_dem_duoc_cau_hoi', COUNT(*)::bigint
FROM (SELECT 1 WHERE NOT has_column_privilege('anon', 'public.exam_questions', 'exam_id', 'SELECT')) t
UNION ALL
-- Chốt NGƯỢC: nới đúng hai cột, không hơn.
SELECT 'anon_doc_duoc_cot_khong_nen_doc', COUNT(*)::bigint
FROM unnest(ARRAY[
  'created_by', 'class_id', 'max_attempts', 'passing_score',
  'total_score', 'start_time', 'end_time', 'scoring_profile'
]) AS cot
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'exams' AND c.column_name = cot
)
AND has_column_privilege('anon', 'public.exams', cot, 'SELECT')
UNION ALL
SELECT 'anon_doc_duoc_noi_dung_cau_hoi', COUNT(*)::bigint
FROM (SELECT 1 WHERE has_table_privilege('anon', 'public.questions', 'SELECT')) t
UNION ALL
SELECT 'anon_doc_duoc_dap_an', COUNT(*)::bigint
FROM (SELECT 1 WHERE has_table_privilege('anon', 'public.answers', 'SELECT')) t
UNION ALL
SELECT 'thieu_policy_danh_muc_de', (1 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'exams'
  AND policyname = 'anon_read_published_exam_catalog'
UNION ALL
SELECT 'thieu_policy_dem_cau_hoi', (1 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'exam_questions'
  AND policyname = 'anon_count_published_exam_questions'
UNION ALL
SELECT 'policy_cu_con_sot', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'anon_read_published_simulation_exams'
UNION ALL
SELECT 'policy_con_thieu_TO', COUNT(*)::bigint
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('exams', 'exam_questions')
  AND 'public' = ANY (roles)
UNION ALL
-- Policy mới vẫn phải ràng buộc `is_published`; mất vế đó là lộ đề nháp.
SELECT 'policy_khong_con_rang_buoc_is_published', (1 - COUNT(*))::bigint
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'anon_read_published_exam_catalog'
  AND COALESCE(qual, '') LIKE '%is_published%'
UNION ALL
SELECT 'anon_ghi_duoc_vao_exams', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE has_table_privilege('anon', 'public.exams', 'INSERT')
     OR has_table_privilege('anon', 'public.exams', 'UPDATE')
     OR has_table_privilege('anon', 'public.exams', 'DELETE')
) t
ORDER BY check_name;
