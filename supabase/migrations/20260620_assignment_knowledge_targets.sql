-- ==============================================
-- PHASE 4: MỤC TIÊU TRI THỨC CHO BÀI TẬP
-- Gắn exam/homework với theory hoặc knowledge block.
-- ==============================================

CREATE TABLE IF NOT EXISTS assignment_knowledge_targets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  knowledge_block_id TEXT REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  target_mastery NUMERIC(5,2) NOT NULL DEFAULT 60
    CHECK (target_mastery >= 0 AND target_mastery <= 100),
  weight NUMERIC(6,3) NOT NULL DEFAULT 1
    CHECK (weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_target_theory
  ON assignment_knowledge_targets(exam_id, theory_id)
  WHERE knowledge_block_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_target_block
  ON assignment_knowledge_targets(exam_id, knowledge_block_id)
  WHERE knowledge_block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_targets_exam
  ON assignment_knowledge_targets(exam_id);
CREATE INDEX IF NOT EXISTS idx_assignment_targets_theory
  ON assignment_knowledge_targets(theory_id);
CREATE INDEX IF NOT EXISTS idx_assignment_targets_block
  ON assignment_knowledge_targets(knowledge_block_id);

CREATE OR REPLACE FUNCTION assignment_target_validate_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.knowledge_block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM knowledge_blocks kb
    WHERE kb.id = NEW.knowledge_block_id
      AND kb.theory_id = NEW.theory_id
  ) THEN
    RAISE EXCEPTION 'knowledge_block_id % không thuộc theory_id %',
      NEW.knowledge_block_id,
      NEW.theory_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_target_validate ON assignment_knowledge_targets;
CREATE TRIGGER trg_assignment_target_validate
  BEFORE INSERT OR UPDATE ON assignment_knowledge_targets
  FOR EACH ROW EXECUTE FUNCTION assignment_target_validate_block();

DROP TRIGGER IF EXISTS update_assignment_targets_updated_at ON assignment_knowledge_targets;
CREATE TRIGGER update_assignment_targets_updated_at
  BEFORE UPDATE ON assignment_knowledge_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE assignment_knowledge_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all assignment_knowledge_targets"
  ON assignment_knowledge_targets;
CREATE POLICY "Allow all assignment_knowledge_targets"
  ON assignment_knowledge_targets
  FOR ALL
  USING (true)
  WITH CHECK (true);

