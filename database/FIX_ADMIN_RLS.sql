-- ==============================================
-- FIX ADMIN RLS POLICIES
-- Chạy script này trên Supabase SQL Editor
-- ==============================================
-- Mô tả: Thêm RLS policies cho role 'admin' để có thể:
-- - Xem tất cả profiles (học sinh, giáo viên)
-- - Xem tất cả exam_attempts 
-- - Xem tất cả student_answers
-- - Xem tất cả exam_analytics
-- - Xem tất cả anti_cheat_logs
-- - Quản lý classes và exams
-- ==============================================

-- ==============================================
-- 1. PROFILES - Admin can manage all profiles
-- ==============================================
-- Check and drop existing policy if exists
DROP POLICY IF EXISTS "Admin can manage all profiles" ON profiles;

CREATE POLICY "Admin can manage all profiles"
ON profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

-- ==============================================
-- 2. CLASSES - Admin can manage all classes
-- ==============================================
DROP POLICY IF EXISTS "Admin can manage all classes" ON classes;

CREATE POLICY "Admin can manage all classes"
ON classes FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 3. EXAMS - Admin can manage all exams
-- ==============================================
DROP POLICY IF EXISTS "Admin can manage all exams" ON exams;

CREATE POLICY "Admin can manage all exams"
ON exams FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 4. EXAM_QUESTIONS - Admin can manage all exam questions
-- ==============================================
DROP POLICY IF EXISTS "Admin can manage all exam questions" ON exam_questions;

CREATE POLICY "Admin can manage all exam questions"
ON exam_questions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 5. EXAM_ATTEMPTS - Admin can view all attempts
-- ==============================================
DROP POLICY IF EXISTS "Admin can view all attempts" ON exam_attempts;

CREATE POLICY "Admin can view all attempts"
ON exam_attempts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 6. STUDENT_ANSWERS - Admin can view all answers
-- ==============================================
DROP POLICY IF EXISTS "Admin can view all answers" ON student_answers;

CREATE POLICY "Admin can view all answers"
ON student_answers FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 7. EXAM_ANALYTICS - Admin can view and manage all analytics
-- ==============================================
DROP POLICY IF EXISTS "Admin can view all analytics" ON exam_analytics;

CREATE POLICY "Admin can view all analytics"
ON exam_analytics FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- 8. ANTI_CHEAT_LOGS - Admin can view all logs
-- ==============================================
DROP POLICY IF EXISTS "Admin can view all anti-cheat logs" ON anti_cheat_logs;

CREATE POLICY "Admin can view all anti-cheat logs"
ON anti_cheat_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ==============================================
-- VERIFICATION - Check policies were created
-- ==============================================
SELECT 
  schemaname,
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd 
FROM pg_policies 
WHERE policyname LIKE 'Admin can%'
ORDER BY tablename, policyname;

-- ==============================================
-- DONE! 
-- ==============================================
-- After running this script:
-- 1. Admin users can now view all student profiles
-- 2. Admin can view all exam attempts and answers
-- 3. Admin can view analytics for all exams
-- 4. Admin can manage all classes and exams
-- 
-- Test by:
-- 1. Login as admin user
-- 2. Go to /admin/users - should see ALL users
-- 3. Check console for any RLS errors
-- ==============================================
