-- ==============================================
-- FIX ADMIN RLS POLICIES - COMPLETE VERSION
-- Chạy script này trên Supabase SQL Editor
-- ==============================================
-- Mô tả: Thêm RLS policies cho role 'admin' để có thể:
-- - Xem và quản lý tất cả profiles (học sinh, giáo viên)
-- - Xem tất cả exam_attempts 
-- - Xem tất cả student_answers
-- - Xem và quản lý tất cả exam_analytics
-- - Xem tất cả anti_cheat_logs
-- - Quản lý classes, exams, exam_questions
-- - Xem và quản lý question_feedbacks
-- - Quản lý site_settings
-- ==============================================

-- ==============================================
-- BƯỚC 1: XÓA CÁC POLICIES CŨ (nếu có)
-- ==============================================

-- Profiles
DROP POLICY IF EXISTS "Admin can manage all profiles" ON profiles;

-- Classes
DROP POLICY IF EXISTS "Admin can manage all classes" ON classes;

-- Exams
DROP POLICY IF EXISTS "Admin can manage all exams" ON exams;

-- Exam Questions
DROP POLICY IF EXISTS "Admin can manage all exam questions" ON exam_questions;

-- Exam Attempts
DROP POLICY IF EXISTS "Admin can view all attempts" ON exam_attempts;
DROP POLICY IF EXISTS "Admin can manage all attempts" ON exam_attempts;

-- Student Answers
DROP POLICY IF EXISTS "Admin can view all answers" ON student_answers;

-- Exam Analytics
DROP POLICY IF EXISTS "Admin can view all analytics" ON exam_analytics;
DROP POLICY IF EXISTS "Admin can manage all analytics" ON exam_analytics;

-- Anti Cheat Logs
DROP POLICY IF EXISTS "Admin can view all anti-cheat logs" ON anti_cheat_logs;

-- Question Feedbacks
DROP POLICY IF EXISTS "Admin can manage all feedbacks" ON question_feedbacks;

-- Site Settings
DROP POLICY IF EXISTS "Admin can manage site settings" ON site_settings;

-- ==============================================
-- BƯỚC 2: TẠO HELPER FUNCTION (tối ưu performance)
-- ==============================================
-- Function này giúp tránh query lặp đi lặp lại trong policies

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- ==============================================
-- BƯỚC 3: TẠO CÁC POLICIES MỚI
-- ==============================================

-- ==============================================
-- 1. PROFILES - Admin can manage all profiles
-- ==============================================
CREATE POLICY "Admin can manage all profiles"
ON profiles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 2. CLASSES - Admin can manage all classes
-- ==============================================
CREATE POLICY "Admin can manage all classes"
ON classes FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 3. EXAMS - Admin can manage all exams
-- ==============================================
CREATE POLICY "Admin can manage all exams"
ON exams FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 4. EXAM_QUESTIONS - Admin can manage all exam questions
-- ==============================================
CREATE POLICY "Admin can manage all exam questions"
ON exam_questions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 5. EXAM_ATTEMPTS - Admin can view all attempts
-- (Chỉ SELECT vì admin không nên sửa attempts của học sinh)
-- ==============================================
CREATE POLICY "Admin can view all attempts"
ON exam_attempts FOR SELECT
TO authenticated
USING (public.is_admin());

-- Nếu cần admin có thể UPDATE (đánh dấu flag, etc):
CREATE POLICY "Admin can update attempts"
ON exam_attempts FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 6. STUDENT_ANSWERS - Admin can view all answers
-- ==============================================
CREATE POLICY "Admin can view all answers"
ON student_answers FOR SELECT
TO authenticated
USING (public.is_admin());

-- ==============================================
-- 7. EXAM_ANALYTICS - Admin can manage all analytics
-- ==============================================
CREATE POLICY "Admin can manage all analytics"
ON exam_analytics FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 8. ANTI_CHEAT_LOGS - Admin can view all logs
-- ==============================================
CREATE POLICY "Admin can view all anti-cheat logs"
ON anti_cheat_logs FOR SELECT
TO authenticated
USING (public.is_admin());

-- ==============================================
-- 9. QUESTION_FEEDBACKS - Admin can manage all feedbacks
-- ==============================================
CREATE POLICY "Admin can manage all feedbacks"
ON question_feedbacks FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ==============================================
-- 10. SITE_SETTINGS - Admin can manage site settings
-- ==============================================
-- Đảm bảo RLS được bật
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage site settings"
ON site_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Cho phép tất cả users đọc settings (nếu cần)
DROP POLICY IF EXISTS "Anyone can read site settings" ON site_settings;
CREATE POLICY "Anyone can read site settings"
ON site_settings FOR SELECT
TO authenticated
USING (true);

-- ==============================================
-- BƯỚC 4: KIỂM TRA KẾT QUẢ
-- ==============================================

-- Xem tất cả policies đã tạo
SELECT 
  schemaname,
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd,
  qual
FROM pg_policies 
WHERE policyname LIKE 'Admin can%'
ORDER BY tablename, policyname;

-- Xem function đã tạo
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_name = 'is_admin' 
AND routine_schema = 'public';

-- ==============================================
-- BƯỚC 5: TEST (Chạy thủ công sau khi apply)
-- ==============================================
-- Đăng nhập với tài khoản admin và test:
-- 
-- Test 1: Xem tất cả profiles
-- SELECT * FROM profiles LIMIT 10;
-- 
-- Test 2: Xem tất cả exam_attempts
-- SELECT * FROM exam_attempts LIMIT 10;
-- 
-- Test 3: Xem tất cả student_answers
-- SELECT * FROM student_answers LIMIT 10;

-- ==============================================
-- DONE! 
-- ==============================================
-- Sau khi chạy script này:
-- 1. Admin users có thể xem ALL student profiles
-- 2. Admin có thể xem ALL exam attempts và answers
-- 3. Admin có thể xem analytics cho tất cả exams
-- 4. Admin có thể quản lý classes, exams, feedbacks
-- 5. Admin có thể quản lý site settings
-- 
-- QUAN TRỌNG: 
-- - Script sử dụng function is_admin() để tối ưu performance
-- - Đã thêm WITH CHECK cho các policy FOR ALL
-- ==============================================
