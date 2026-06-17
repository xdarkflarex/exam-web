-- ============================================================
-- CHẠY FILE NÀY TRÊN SUPABASE SQL EDITOR ĐỂ FIX CÁC LỖI:
--  1) error 23514: "new row for relation exams violates check constraint"
--     -> do constraint exam_mode cũ chưa cho phép 'homework'
--  2) log lặp: "create-account: cột mở rộng chưa có, fallback insert profile cơ bản"
--     -> do profiles thiếu must_change_password / source_enrollment_id / access_tier
--  3) Bài tập theo bài (taxonomy) + mastery theo mức nhận thức
--
-- An toàn để chạy lại nhiều lần (idempotent).
-- ============================================================

-- ---------- 1. EXAM HOMEWORK MODE ----------
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS exam_mode TEXT NOT NULL DEFAULT 'practice';

ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_exam_mode_check;
ALTER TABLE exams
  ADD CONSTRAINT exams_exam_mode_check
  CHECK (exam_mode IN ('practice', 'simulation', 'homework'));

CREATE INDEX IF NOT EXISTS idx_exams_exam_mode ON exams(exam_mode);

-- exam_assignments: giao bài cho lớp hoặc HS
CREATE TABLE IF NOT EXISTS exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (class_id IS NOT NULL AND student_id IS NULL) OR
    (class_id IS NULL AND student_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_exam ON exam_assignments(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_class ON exam_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_student ON exam_assignments(student_id);

-- RLS cho exam_assignments (chạy sau khi bảng đã tồn tại, an toàn idempotent)
ALTER TABLE exam_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin read exam_assignments" ON exam_assignments;
CREATE POLICY "Allow admin read exam_assignments" ON exam_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Allow admin write exam_assignments" ON exam_assignments;
CREATE POLICY "Allow admin write exam_assignments" ON exam_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
  );

DROP POLICY IF EXISTS "Allow student read own exam_assignments" ON exam_assignments;
CREATE POLICY "Allow student read own exam_assignments" ON exam_assignments
  FOR SELECT USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN classes c ON c.id = p.class_id
      WHERE p.id = auth.uid() AND c.id = exam_assignments.class_id
    )
  );

-- ---------- 2. ENROLLMENT ACCOUNT LINK + must_change_password ----------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_enrollment_id UUID;

-- ---------- 3. ACCESS TIER + FEATURE FLAGS ----------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'basic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_access_tier_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_access_tier_check CHECK (access_tier IN ('basic', 'full'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_access_tier ON profiles(access_tier);

-- ---------- 4. COGNITIVE LEVEL + MASTERY THEO MỨC ----------
ALTER TABLE knowledge_blocks
  ADD COLUMN IF NOT EXISTS cognitive_level TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_blocks_cognitive_level_check'
  ) THEN
    ALTER TABLE knowledge_blocks
      ADD CONSTRAINT knowledge_blocks_cognitive_level_check
      CHECK (cognitive_level IN ('NB', 'TH', 'VD', 'VDC'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_kb_cognitive ON knowledge_blocks(cognitive_level);

-- cognitive_level cho câu hỏi (dùng để lọc bài tập theo mức)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS cognitive_level TEXT;
CREATE INDEX IF NOT EXISTS idx_questions_cognitive ON questions(cognitive_level);

-- mastery theo mức nhận thức (tên bảng khớp với COGNITIVE_LEVEL_MASTERY.sql)
CREATE TABLE IF NOT EXISTS theory_mastery_by_level (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  cognitive_level TEXT NOT NULL CHECK (cognitive_level IN ('NB', 'TH', 'VD', 'VDC')),
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  mastery_score DECIMAL(5,2) DEFAULT 0.0,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, theory_id, cognitive_level)
);
CREATE INDEX IF NOT EXISTS idx_tmbl_student ON theory_mastery_by_level(student_id);
CREATE INDEX IF NOT EXISTS idx_tmbl_theory ON theory_mastery_by_level(theory_id);
CREATE INDEX IF NOT EXISTS idx_tmbl_level ON theory_mastery_by_level(cognitive_level);

ALTER TABLE theory_mastery_by_level ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all theory_mastery_by_level" ON theory_mastery_by_level;
CREATE POLICY "Allow all theory_mastery_by_level" ON theory_mastery_by_level FOR ALL USING (true);

-- ---------- 5. BÀI TẬP VỀ NHÀ THEO SESSION (làm từng câu, có đáp án ngay) ----------
-- Số câu mỗi session khi làm bài tập về nhà
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS session_size INTEGER NOT NULL DEFAULT 10;

-- Session hiện tại của học sinh trong 1 attempt bài tập về nhà
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS current_session_index INTEGER NOT NULL DEFAULT 0;

-- Đánh dấu câu đã được hiển thị đáp án (chế độ bài tập về nhà)
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS shown_feedback BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Sau khi chạy xong, vào Supabase: Settings > API > "Reload schema"
-- (hoặc đợi vài giây) để cập nhật schema cache.
-- ============================================================
