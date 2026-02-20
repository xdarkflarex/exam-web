-- =============================================
-- Migration: Practice Mode + Grade-based System
-- Date: 2025-02-12
-- =============================================

-- 1. Add grade to profiles (required for students)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grade INTEGER CHECK (grade IN (10, 11, 12));

-- 2. Add grade and exam_mode to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS grade INTEGER CHECK (grade IN (10, 11, 12));
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_mode TEXT DEFAULT 'simulation' CHECK (exam_mode IN ('practice', 'simulation'));
-- practice = ôn tập (không timer, lưu progress, tất cả các khối)
-- simulation = thi thử (có timer, tất cả các khối)

-- 3. Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_exams_grade ON exams(grade);
CREATE INDEX IF NOT EXISTS idx_exams_exam_mode ON exams(exam_mode);
CREATE INDEX IF NOT EXISTS idx_profiles_grade ON profiles(grade);

-- 4. Create index for practice mode auto-save (upsert student_answers by attempt_id + question_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_answers_attempt_question 
  ON student_answers(attempt_id, question_id);
