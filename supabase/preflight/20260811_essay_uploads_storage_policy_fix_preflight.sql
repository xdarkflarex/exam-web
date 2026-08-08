-- 20260811_essay_uploads_storage_policy_fix_preflight.sql
--
-- Chạy TRƯỚC migration. Chỉ đọc. Bảng kết luận là câu lệnh CUỐI file.
--
-- CÁCH ĐỌC KHÁC PREFLIGHT THƯỜNG: cột `ky_vong` nói rõ từng dòng. Dòng `chan_*`
-- phải bằng 0. Dòng `xac_nhan_loi_*` kỳ vọng KHÁC 0 — chúng xác nhận lỗi có thật,
-- và nếu chúng bằng 0 thì migration chỉ là no-op, phải tìm hiểu trước khi tin
-- postflight.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: policy hiện tại của bucket — đây là thứ migration sẽ thay
-- ---------------------------------------------------------------------------

SELECT
  'policy_truoc_khi_sua' AS muc,
  policyname,
  cmd,
  COALESCE(qual, with_check) AS bieu_thuc
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: chính policy gây lỗi trên exam_attempts
-- ---------------------------------------------------------------------------
--
-- Đọc `bieu_thuc` của `students_read_own_exam_attempts`: nó là lý do subquery
-- trong policy storage trả false sau khi học sinh nộp bài.

SELECT
  'policy_exam_attempts' AS muc,
  policyname,
  cmd,
  COALESCE(qual, with_check) AS bieu_thuc
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'exam_attempts'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 3: bao nhiêu ảnh đang bị lỗi này
-- ---------------------------------------------------------------------------
--
-- Ảnh thuộc attempt mà học sinh KHÔNG còn đọc được attempt đó — tức là ảnh học
-- sinh hiện không xem lại được. Con số này phải về 0 (theo nghĩa "không còn ảnh
-- nào không xem được") sau migration; postflight không đo lại được vì phép đo
-- đúng phải chạy bằng JWT học sinh, nên ghi lại ở đây để biết quy mô.

SELECT
  'anh_bi_anh_huong' AS muc,
  COUNT(*)::bigint AS so_anh,
  COUNT(DISTINCT u.attempt_id)::bigint AS so_attempt
FROM public.essay_answer_uploads u
JOIN public.exam_attempts a ON a.id = u.attempt_id
WHERE u.deleted_at IS NULL
  AND a.status <> 'in_progress';

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT
  'chan_thieu_bang_uploads' AS check_name,
  COUNT(*)::bigint AS gia_tri,
  'phải = 0' AS ky_vong
FROM (SELECT 1 WHERE to_regclass('public.essay_answer_uploads') IS NULL) t
UNION ALL
SELECT 'chan_thieu_storage_objects', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regclass('storage.objects') IS NULL) t
UNION ALL
SELECT 'chan_thieu_bang_profiles', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regclass('public.profiles') IS NULL) t
UNION ALL
-- Migration dựng lại đúng 4 policy này. Khác 4 nghĩa là trạng thái không như
-- 20260809 để lại — đọc ảnh chụp 1 trước khi chạy.
SELECT 'chan_so_policy_bucket_khac_4', ABS(4 - COUNT(*))::bigint, 'phải = 0'
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
UNION ALL
-- XÁC NHẬN LỖI CÓ THẬT: policy bucket đang đọc exam_attempts trực tiếp.
-- Kỳ vọng 4 (cả bốn policy đều mắc). 0 nghĩa là đã có ai sửa, migration thành
-- no-op — tìm hiểu trước khi tin postflight.
SELECT 'xac_nhan_loi_policy_doc_exam_attempts', COUNT(*)::bigint, 'kỳ vọng = 4'
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'essay_uploads_%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%exam_attempts%'
UNION ALL
-- XÁC NHẬN LỖI CÓ THẬT: policy exam_attempts chặn học sinh đọc bài đã nộp.
-- Kỳ vọng 1. Nếu 0 thì chẩn đoán sai ở đâu đó — đừng chạy migration, đọc lại.
SELECT 'xac_nhan_loi_policy_chan_theo_status', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'exam_attempts'
  AND policyname = 'students_read_own_exam_attempts'
  AND COALESCE(qual, '') LIKE '%in_progress%'
UNION ALL
-- Ba hàm chưa tồn tại là bình thường trước migration.
SELECT 'ham_da_ton_tai', COUNT(*)::bigint, 'thường = 0; khác 0 = đã chạy rồi'
FROM unnest(ARRAY[
  'public.essay_upload_is_owner(text)',
  'public.essay_upload_viewer_is_admin()',
  'public.essay_upload_attempt_active(text)'
]) AS f(sig)
WHERE to_regprocedure(f.sig) IS NOT NULL
ORDER BY check_name;
