-- ==============================================
-- BÀI TẬP VỀ NHÀ (HOMEWORK MODE) — Phần 3
-- Chạy trên Supabase SQL Editor.
-- ==============================================

-- 1. exam_mode: bổ sung 'homework' (giữ practice/simulation cũ).
--    Nếu cột chưa tồn tại thì tạo; nếu có CHECK cũ thì thay bằng CHECK mới.
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS exam_mode TEXT NOT NULL DEFAULT 'practice';

ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_exam_mode_check;
ALTER TABLE exams
  ADD CONSTRAINT exams_exam_mode_check
  CHECK (exam_mode IN ('practice', 'simulation', 'homework'));

-- exams đã có start_time / end_time (dùng làm deadline cho homework).

-- 2. Giao bài: bảng exam_assignments (giao theo lớp hoặc theo từng HS).
CREATE TABLE IF NOT EXISTS exam_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Mỗi dòng giao cho 1 lớp HOẶC 1 HS (không cùng lúc cả hai).
  CHECK (
    (class_id IS NOT NULL AND student_id IS NULL) OR
    (class_id IS NULL AND student_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_exam_assignments_exam ON exam_assignments(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_class ON exam_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_student ON exam_assignments(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_assignment_class
  ON exam_assignments(exam_id, class_id) WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_assignment_student
  ON exam_assignments(exam_id, student_id) WHERE student_id IS NOT NULL;

ALTER TABLE exam_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all exam_assignments" ON exam_assignments;
CREATE POLICY "Allow all exam_assignments" ON exam_assignments FOR ALL USING (true);
