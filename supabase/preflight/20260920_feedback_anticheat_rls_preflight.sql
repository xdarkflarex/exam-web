-- 20260920_feedback_anticheat_rls_preflight.sql
--
-- Chạy TRƯỚC migration. Chỉ đọc. Bảng kết luận là câu lệnh CUỐI file.
--
-- CÁCH ĐỌC: dòng `chan_*` phải bằng 0, nếu không migration sẽ raise. Dòng
-- `xac_nhan_loi_*` kỳ vọng KHÁC 0 — chúng chứng minh lỗi có thật; bằng 0 nghĩa
-- là ai đó đã sửa ngoài quy trình và cần hiểu vì sao trước khi tin postflight.
--
-- CÂU HỎI QUAN TRỌNG NHẤT mà file này trả lời: `question_feedbacks` đang BẬT
-- hay TẮT RLS. Hai trạng thái dẫn tới hai lỗi trái ngược nhau (xem đầu file
-- migration), và chỉ database đang chạy mới biết là cái nào.

-- ---------------------------------------------------------------------------
-- Ảnh chụp 1: RLS của hai bảng
-- ---------------------------------------------------------------------------

SELECT
  'rls_truoc_khi_sua' AS muc,
  c.relname AS bang,
  c.relrowsecurity AS rls_bat,
  c.relforcerowsecurity AS rls_ep_ca_chu_so_huu
FROM pg_class c
WHERE c.oid IN (to_regclass('public.question_feedbacks'), to_regclass('public.anti_cheat_logs'))
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 2: policy hiện tại — đây là thứ migration sẽ thay
-- ---------------------------------------------------------------------------
--
-- Đọc cột `ap_cho_role`: `{public}` nghĩa là policy KHÔNG có mệnh đề `TO`.
-- Đọc `bieu_thuc_with_check` của policy INSERT trên `anti_cheat_logs`: `true`
-- chính là A20.

SELECT
  'policy_truoc_khi_sua' AS muc,
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
-- Ảnh chụp 3: dữ liệu đang có — để biết bản sửa đụng tới bao nhiêu dòng
-- ---------------------------------------------------------------------------
--
-- `gop_y_lac_luot_thi` là số góp ý có `attempt_id` KHÔNG thuộc về `student_id`
-- của chính dòng đó. Nếu khác 0 thì policy INSERT mới sẽ không cho tạo thêm
-- dòng kiểu đó nữa — nhưng dòng cũ vẫn nằm yên, migration không xoá gì.

SELECT
  'du_lieu_question_feedbacks' AS muc,
  COUNT(*)::bigint AS tong_dong,
  COUNT(DISTINCT student_id)::bigint AS so_hoc_sinh,
  COUNT(*) FILTER (WHERE status = 'pending')::bigint AS cho_xem,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = qf.attempt_id AND ea.student_id = qf.student_id
    )
  )::bigint AS gop_y_lac_luot_thi
FROM public.question_feedbacks qf;

SELECT
  'du_lieu_anti_cheat_logs' AS muc,
  COUNT(*)::bigint AS tong_dong,
  COUNT(DISTINCT attempt_id)::bigint AS so_luot_thi
FROM public.anti_cheat_logs;

-- ---------------------------------------------------------------------------
-- Ảnh chụp 4: GRANT cấp bảng
-- ---------------------------------------------------------------------------
--
-- Nhắc của `AGENTS.md`: bảng tạo trong `public` sinh ra đã có `ALL` cho
-- `anon, authenticated`. Migration này KHÔNG đổi GRANT — nó dựa vào RLS để
-- chặn theo dòng. Ảnh chụp ở đây để sau này không ai suy "không viết GRANT"
-- thành "không có quyền".

SELECT
  'quyen_cap_bang' AS muc,
  t.bang,
  t.vai_tro,
  has_table_privilege(t.vai_tro, t.bang, 'SELECT') AS co_select,
  has_table_privilege(t.vai_tro, t.bang, 'INSERT') AS co_insert,
  has_table_privilege(t.vai_tro, t.bang, 'UPDATE') AS co_update,
  has_table_privilege(t.vai_tro, t.bang, 'DELETE') AS co_delete
FROM (
  SELECT bang, vai_tro
  FROM unnest(ARRAY['public.question_feedbacks', 'public.anti_cheat_logs']) AS bang,
       unnest(ARRAY['anon', 'authenticated']) AS vai_tro
) t
ORDER BY t.bang, t.vai_tro;

-- ---------------------------------------------------------------------------
-- KẾT LUẬN — phải là câu lệnh cuối cùng
-- ---------------------------------------------------------------------------

SELECT 'chan_thieu_bang_question_feedbacks' AS check_name, COUNT(*)::bigint AS gia_tri, 'phải = 0' AS ky_vong
FROM (SELECT 1 WHERE to_regclass('public.question_feedbacks') IS NULL) t
UNION ALL
SELECT 'chan_thieu_bang_anti_cheat_logs', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regclass('public.anti_cheat_logs') IS NULL) t
UNION ALL
SELECT 'chan_thieu_ham_viewer_is_admin', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regprocedure('public.viewer_is_admin()') IS NULL) t
UNION ALL
SELECT 'chan_thieu_ham_can_manage_exam_attempt', COUNT(*)::bigint, 'phải = 0'
FROM (SELECT 1 WHERE to_regprocedure('public.can_manage_exam_attempt(text)') IS NULL) t
UNION ALL
-- A19, khả năng thứ nhất: RLS đang TẮT -> ai đăng nhập cũng đọc được góp ý của
-- người khác. Kỳ vọng 1 nếu đây là khả năng đang xảy ra.
SELECT 'xac_nhan_loi_A19_rls_dang_tat', COUNT(*)::bigint, 'kỳ vọng 0 hoặc 1 — xem ảnh chụp 1'
FROM pg_class
WHERE oid = to_regclass('public.question_feedbacks') AND NOT relrowsecurity
UNION ALL
-- A19, khả năng thứ hai: RLS BẬT mà không có policy nào cho học sinh -> nút góp
-- ý hỏng. Đếm policy KHÔNG phải của admin.
SELECT 'xac_nhan_loi_A19_khong_co_policy_hoc_sinh', COUNT(*)::bigint, 'kỳ vọng = 0 (không có policy nào cho học sinh)'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_feedbacks'
  AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%auth.uid()%'
UNION ALL
-- A20: policy INSERT không ràng buộc gì. Kỳ vọng 1.
SELECT 'xac_nhan_loi_A20_insert_with_check_true', COUNT(*)::bigint, 'kỳ vọng = 1'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'anti_cheat_logs'
  AND cmd = 'INSERT' AND COALESCE(with_check, '') IN ('true', '(true)')
UNION ALL
-- Policy thiếu `TO`. Kỳ vọng >= 2 (một của feedbacks, hai của anti_cheat_logs).
SELECT 'xac_nhan_loi_policy_khong_co_TO', COUNT(*)::bigint, 'kỳ vọng >= 2'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('question_feedbacks', 'anti_cheat_logs')
  AND 'public' = ANY (roles)
UNION ALL
-- Hàm chưa tồn tại là bình thường trước migration.
SELECT 'ham_owns_exam_attempt_da_ton_tai', COUNT(*)::bigint, 'thường = 0; khác 0 = đã chạy rồi'
FROM (SELECT 1 WHERE to_regprocedure('public.owns_exam_attempt(text)') IS NOT NULL) t
ORDER BY check_name;
