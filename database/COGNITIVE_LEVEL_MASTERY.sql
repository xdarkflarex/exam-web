-- ==============================================
-- COGNITIVE LEVEL TRÊN CÂY TRI THỨC + MASTERY THEO MỨC (Phần 5)
-- Mức nhận thức: NB (nhận biết), TH (thông hiểu), VD (vận dụng), VDC (vận dụng cao)
-- Nguồn mức của câu hỏi tái dùng questions.difficulty (1=NB,2=TH,3=VD,4=VDC).
-- Chạy trên Supabase SQL Editor.
-- ==============================================

-- 1. cognitive_level cho khối tri thức (nút lá), chủ yếu khối 'bai_tap'.
ALTER TABLE knowledge_blocks
  ADD COLUMN IF NOT EXISTS cognitive_level TEXT
  CHECK (cognitive_level IN ('NB', 'TH', 'VD', 'VDC'));

CREATE INDEX IF NOT EXISTS idx_kb_cognitive ON knowledge_blocks(cognitive_level);

-- 2. Mastery tách theo mức nhận thức cho từng HS × theory.
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

DROP TRIGGER IF EXISTS update_tmbl_updated_at ON theory_mastery_by_level;
CREATE TRIGGER update_tmbl_updated_at BEFORE UPDATE ON theory_mastery_by_level
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE theory_mastery_by_level ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all theory_mastery_by_level" ON theory_mastery_by_level;
CREATE POLICY "Allow all theory_mastery_by_level" ON theory_mastery_by_level FOR ALL USING (true);
