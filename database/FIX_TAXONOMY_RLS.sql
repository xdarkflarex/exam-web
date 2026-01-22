-- ==============================================
-- FIX RLS POLICIES FOR STUDENT TAXONOMY ACCESS
-- Chạy script này trên Supabase SQL Editor
-- ==============================================

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Admin can manage topics" ON topics;
DROP POLICY IF EXISTS "Authenticated users can read topics" ON topics;
DROP POLICY IF EXISTS "Service role can manage topics" ON topics;
DROP POLICY IF EXISTS "Allow all on topics" ON topics;

DROP POLICY IF EXISTS "Admin can manage categories" ON categories;
DROP POLICY IF EXISTS "Authenticated users can read categories" ON categories;
DROP POLICY IF EXISTS "Service role can manage categories" ON categories;
DROP POLICY IF EXISTS "Allow all on categories" ON categories;

DROP POLICY IF EXISTS "Admin can manage sections" ON sections;
DROP POLICY IF EXISTS "Authenticated users can read sections" ON sections;
DROP POLICY IF EXISTS "Service role can manage sections" ON sections;
DROP POLICY IF EXISTS "Allow all on sections" ON sections;

DROP POLICY IF EXISTS "Admin can manage subsections" ON subsections;
DROP POLICY IF EXISTS "Authenticated users can read subsections" ON subsections;
DROP POLICY IF EXISTS "Service role can manage subsections" ON subsections;
DROP POLICY IF EXISTS "Allow all on subsections" ON subsections;

DROP POLICY IF EXISTS "Admin can manage question_taxonomy" ON question_taxonomy;
DROP POLICY IF EXISTS "Authenticated users can read question_taxonomy" ON question_taxonomy;
DROP POLICY IF EXISTS "Service role can manage question_taxonomy" ON question_taxonomy;
DROP POLICY IF EXISTS "Allow all on question_taxonomy" ON question_taxonomy;

-- ==============================================
-- TOPICS - Cho phép tất cả authenticated users đọc
-- ==============================================
CREATE POLICY "Anyone authenticated can read topics"
ON topics FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage topics"
ON topics FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Service role full access topics"
ON topics FOR ALL
TO service_role
USING (true);

-- ==============================================
-- CATEGORIES - Cho phép tất cả authenticated users đọc
-- ==============================================
CREATE POLICY "Anyone authenticated can read categories"
ON categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage categories"
ON categories FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Service role full access categories"
ON categories FOR ALL
TO service_role
USING (true);

-- ==============================================
-- SECTIONS - Cho phép tất cả authenticated users đọc
-- ==============================================
CREATE POLICY "Anyone authenticated can read sections"
ON sections FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage sections"
ON sections FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Service role full access sections"
ON sections FOR ALL
TO service_role
USING (true);

-- ==============================================
-- SUBSECTIONS - Cho phép tất cả authenticated users đọc
-- ==============================================
CREATE POLICY "Anyone authenticated can read subsections"
ON subsections FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage subsections"
ON subsections FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Service role full access subsections"
ON subsections FOR ALL
TO service_role
USING (true);

-- ==============================================
-- QUESTION_TAXONOMY - Cho phép tất cả authenticated users đọc
-- ==============================================
CREATE POLICY "Anyone authenticated can read question_taxonomy"
ON question_taxonomy FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage question_taxonomy"
ON question_taxonomy FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Service role full access question_taxonomy"
ON question_taxonomy FOR ALL
TO service_role
USING (true);

-- ==============================================
-- VERIFICATION - Check policies were created
-- ==============================================
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename IN ('topics', 'categories', 'sections', 'subsections', 'question_taxonomy')
ORDER BY tablename, policyname;
