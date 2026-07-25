-- ==============================================
-- PHASE 2: MASTERY EVIDENCE + BLOCK MASTERY
-- Idempotent, rebuildable, server-side
-- Phụ thuộc: 20260618_question_knowledge_links.sql
-- ==============================================

-- 1. Evidence nguyên tử cho mỗi câu trả lời × liên kết tri thức.
CREATE TABLE IF NOT EXISTS mastery_evidence (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_answer_id TEXT NOT NULL REFERENCES student_answers(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  knowledge_block_id TEXT REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  cognitive_level TEXT NOT NULL
    CHECK (cognitive_level IN ('NB', 'TH', 'VD', 'VDC')),
  is_correct BOOLEAN NOT NULL DEFAULT false,
  earned_score NUMERIC(8,3) NOT NULL DEFAULT 0,
  max_score NUMERIC(8,3) NOT NULL DEFAULT 1
    CHECK (max_score > 0),
  weight NUMERIC(6,3) NOT NULL DEFAULT 1
    CHECK (weight > 0),
  source_link_id TEXT REFERENCES question_knowledge_links(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mastery_evidence_answer_target
  ON mastery_evidence (
    student_answer_id,
    theory_id,
    COALESCE(knowledge_block_id, '')
  );
CREATE INDEX IF NOT EXISTS idx_mastery_evidence_student
  ON mastery_evidence(student_id);
CREATE INDEX IF NOT EXISTS idx_mastery_evidence_attempt
  ON mastery_evidence(attempt_id);
CREATE INDEX IF NOT EXISTS idx_mastery_evidence_theory
  ON mastery_evidence(student_id, theory_id);
CREATE INDEX IF NOT EXISTS idx_mastery_evidence_block
  ON mastery_evidence(student_id, knowledge_block_id)
  WHERE knowledge_block_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_mastery_evidence_updated_at ON mastery_evidence;
CREATE TRIGGER update_mastery_evidence_updated_at
  BEFORE UPDATE ON mastery_evidence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Aggregate mastery cấp knowledge block.
CREATE TABLE IF NOT EXISTS knowledge_block_mastery (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  knowledge_block_id TEXT NOT NULL REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  questions_attempted INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, knowledge_block_id)
);

CREATE INDEX IF NOT EXISTS idx_kbm_student
  ON knowledge_block_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_kbm_block
  ON knowledge_block_mastery(knowledge_block_id);
CREATE INDEX IF NOT EXISTS idx_kbm_score
  ON knowledge_block_mastery(mastery_score);

DROP TRIGGER IF EXISTS update_kbm_updated_at ON knowledge_block_mastery;
CREATE TRIGGER update_kbm_updated_at
  BEFORE UPDATE ON knowledge_block_mastery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Đảm bảo các aggregate cũ có conflict target ổn định.
CREATE UNIQUE INDEX IF NOT EXISTS uq_theory_mastery_student_theory
  ON theory_mastery(student_id, theory_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tmbl_student_theory_level
  ON theory_mastery_by_level(student_id, theory_id, cognitive_level);

-- 3. Refresh aggregate của một theory.
CREATE OR REPLACE FUNCTION refresh_theory_mastery(
  p_student_id UUID,
  p_theory_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_attempted INTEGER;
  v_correct INTEGER;
  v_score NUMERIC(5,2);
  v_last TIMESTAMPTZ;
  v_level TEXT;
  v_level_attempted INTEGER;
  v_level_correct INTEGER;
  v_level_score NUMERIC(5,2);
  v_level_last TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(DISTINCT student_answer_id)::INTEGER,
    COUNT(DISTINCT student_answer_id)
      FILTER (WHERE is_correct)::INTEGER,
    COALESCE(
      ROUND(
        100 * SUM((earned_score / max_score) * weight) /
        NULLIF(SUM(weight), 0),
        2
      ),
      0
    ),
    MAX(occurred_at)
  INTO v_attempted, v_correct, v_score, v_last
  FROM mastery_evidence
  WHERE student_id = p_student_id
    AND theory_id = p_theory_id;

  IF v_attempted = 0 THEN
    DELETE FROM theory_mastery
    WHERE student_id = p_student_id AND theory_id = p_theory_id;
    DELETE FROM theory_mastery_by_level
    WHERE student_id = p_student_id AND theory_id = p_theory_id;
    RETURN;
  END IF;

  INSERT INTO theory_mastery (
    student_id,
    theory_id,
    mastery_score,
    questions_attempted,
    questions_correct,
    last_attempt_at,
    streak
  )
  VALUES (
    p_student_id,
    p_theory_id,
    v_score,
    v_attempted,
    v_correct,
    v_last,
    0
  )
  ON CONFLICT (student_id, theory_id) DO UPDATE SET
    mastery_score = EXCLUDED.mastery_score,
    questions_attempted = EXCLUDED.questions_attempted,
    questions_correct = EXCLUDED.questions_correct,
    last_attempt_at = EXCLUDED.last_attempt_at,
    updated_at = NOW();

  FOREACH v_level IN ARRAY ARRAY['NB', 'TH', 'VD', 'VDC'] LOOP
    SELECT
      COUNT(DISTINCT student_answer_id)::INTEGER,
      COUNT(DISTINCT student_answer_id)
        FILTER (WHERE is_correct)::INTEGER,
      COALESCE(
        ROUND(
          100 * SUM((earned_score / max_score) * weight) /
          NULLIF(SUM(weight), 0),
          2
        ),
        0
      ),
      MAX(occurred_at)
    INTO v_level_attempted, v_level_correct, v_level_score, v_level_last
    FROM mastery_evidence
    WHERE student_id = p_student_id
      AND theory_id = p_theory_id
      AND cognitive_level = v_level;

    IF v_level_attempted = 0 THEN
      DELETE FROM theory_mastery_by_level
      WHERE student_id = p_student_id
        AND theory_id = p_theory_id
        AND cognitive_level = v_level;
    ELSE
      INSERT INTO theory_mastery_by_level (
        student_id,
        theory_id,
        cognitive_level,
        questions_attempted,
        questions_correct,
        mastery_score,
        last_attempt_at
      )
      VALUES (
        p_student_id,
        p_theory_id,
        v_level,
        v_level_attempted,
        v_level_correct,
        v_level_score,
        v_level_last
      )
      ON CONFLICT (student_id, theory_id, cognitive_level) DO UPDATE SET
        questions_attempted = EXCLUDED.questions_attempted,
        questions_correct = EXCLUDED.questions_correct,
        mastery_score = EXCLUDED.mastery_score,
        last_attempt_at = EXCLUDED.last_attempt_at,
        updated_at = NOW();
    END IF;
  END LOOP;
END;
$$;

-- 4. Refresh aggregate của một knowledge block.
CREATE OR REPLACE FUNCTION refresh_knowledge_block_mastery(
  p_student_id UUID,
  p_knowledge_block_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_attempted INTEGER;
  v_correct INTEGER;
  v_evidence INTEGER;
  v_score NUMERIC(5,2);
  v_confidence NUMERIC(5,2);
  v_last TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(DISTINCT student_answer_id)::INTEGER,
    COUNT(DISTINCT student_answer_id)
      FILTER (WHERE is_correct)::INTEGER,
    COUNT(*)::INTEGER,
    COALESCE(
      ROUND(
        100 * SUM((earned_score / max_score) * weight) /
        NULLIF(SUM(weight), 0),
        2
      ),
      0
    ),
    ROUND(100 * LEAST(COUNT(DISTINCT student_answer_id), 5)::NUMERIC / 5, 2),
    MAX(occurred_at)
  INTO
    v_attempted,
    v_correct,
    v_evidence,
    v_score,
    v_confidence,
    v_last
  FROM mastery_evidence
  WHERE student_id = p_student_id
    AND knowledge_block_id = p_knowledge_block_id;

  IF v_attempted = 0 THEN
    DELETE FROM knowledge_block_mastery
    WHERE student_id = p_student_id
      AND knowledge_block_id = p_knowledge_block_id;
    RETURN;
  END IF;

  INSERT INTO knowledge_block_mastery (
    student_id,
    knowledge_block_id,
    mastery_score,
    questions_attempted,
    questions_correct,
    evidence_count,
    confidence_score,
    last_activity_at
  )
  VALUES (
    p_student_id,
    p_knowledge_block_id,
    v_score,
    v_attempted,
    v_correct,
    v_evidence,
    v_confidence,
    v_last
  )
  ON CONFLICT (student_id, knowledge_block_id) DO UPDATE SET
    mastery_score = EXCLUDED.mastery_score,
    questions_attempted = EXCLUDED.questions_attempted,
    questions_correct = EXCLUDED.questions_correct,
    evidence_count = EXCLUDED.evidence_count,
    confidence_score = EXCLUDED.confidence_score,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = NOW();
END;
$$;

-- 5. Process một student_answer. Chạy lại sẽ thay thế evidence cũ.
CREATE OR REPLACE FUNCTION process_mastery_for_answer(
  p_student_answer_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_answer RECORD;
  v_old_theories TEXT[];
  v_new_theories TEXT[];
  v_old_blocks TEXT[];
  v_new_blocks TEXT[];
  v_target TEXT;
  v_count INTEGER;
BEGIN
  SELECT
    sa.id,
    sa.attempt_id,
    sa.question_id,
    COALESCE(sa.is_correct, false) AS is_correct,
    COALESCE(sa.score, CASE WHEN sa.is_correct THEN 1 ELSE 0 END, 0) AS earned_score,
    ea.student_id,
    CASE
      WHEN q.cognitive_level IN ('NB', 'TH', 'VD', 'VDC')
        THEN q.cognitive_level
      WHEN q.difficulty = 2 THEN 'TH'
      WHEN q.difficulty = 3 THEN 'VD'
      WHEN q.difficulty >= 4 THEN 'VDC'
      ELSE 'NB'
    END AS cognitive_level
  INTO v_answer
  FROM student_answers sa
  JOIN exam_attempts ea ON ea.id = sa.attempt_id
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.id = p_student_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy student_answer %', p_student_answer_id;
  END IF;

  SELECT ARRAY_AGG(DISTINCT theory_id),
         ARRAY_AGG(DISTINCT knowledge_block_id)
           FILTER (WHERE knowledge_block_id IS NOT NULL)
  INTO v_old_theories, v_old_blocks
  FROM mastery_evidence
  WHERE student_answer_id = p_student_answer_id;

  DELETE FROM mastery_evidence
  WHERE student_answer_id = p_student_answer_id;

  -- Ưu tiên question_knowledge_links. Fallback question_theories cho dữ liệu cũ.
  INSERT INTO mastery_evidence (
    student_id,
    attempt_id,
    student_answer_id,
    question_id,
    theory_id,
    knowledge_block_id,
    cognitive_level,
    is_correct,
    earned_score,
    max_score,
    weight,
    source_link_id,
    occurred_at
  )
  SELECT
    v_answer.student_id,
    v_answer.attempt_id,
    v_answer.id,
    v_answer.question_id,
    targets.theory_id,
    targets.knowledge_block_id,
    v_answer.cognitive_level,
    v_answer.is_correct,
    CASE WHEN v_answer.is_correct THEN 1 ELSE 0 END,
    1,
    targets.weight,
    targets.source_link_id,
    NOW()
  FROM (
    SELECT DISTINCT ON (raw_targets.theory_id, COALESCE(raw_targets.knowledge_block_id, ''))
      raw_targets.theory_id,
      raw_targets.knowledge_block_id,
      raw_targets.weight,
      raw_targets.source_link_id
    FROM (
      SELECT
        qkl.theory_id,
        qkl.knowledge_block_id,
        qkl.weight,
        qkl.id AS source_link_id,
        CASE qkl.link_type
          WHEN 'primary' THEN 1
          WHEN 'supporting' THEN 2
          ELSE 3
        END AS priority
      FROM question_knowledge_links qkl
      WHERE qkl.question_id = v_answer.question_id

      UNION ALL

      SELECT
        qt.theory_id,
        NULL::TEXT,
        COALESCE(qt.weight, 1),
        NULL::TEXT,
        4
      FROM question_theories qt
      WHERE qt.question_id = v_answer.question_id
        AND NOT EXISTS (
          SELECT 1
          FROM question_knowledge_links qkl
          WHERE qkl.question_id = v_answer.question_id
        )
    ) raw_targets
    ORDER BY
      raw_targets.theory_id,
      COALESCE(raw_targets.knowledge_block_id, ''),
      raw_targets.priority
  ) targets;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT ARRAY_AGG(DISTINCT theory_id),
         ARRAY_AGG(DISTINCT knowledge_block_id)
           FILTER (WHERE knowledge_block_id IS NOT NULL)
  INTO v_new_theories, v_new_blocks
  FROM mastery_evidence
  WHERE student_answer_id = p_student_answer_id;

  FOR v_target IN
    SELECT DISTINCT value
    FROM unnest(
      COALESCE(v_old_theories, ARRAY[]::TEXT[]) ||
      COALESCE(v_new_theories, ARRAY[]::TEXT[])
    ) AS value
  LOOP
    PERFORM refresh_theory_mastery(v_answer.student_id, v_target);
  END LOOP;

  FOR v_target IN
    SELECT DISTINCT value
    FROM unnest(
      COALESCE(v_old_blocks, ARRAY[]::TEXT[]) ||
      COALESCE(v_new_blocks, ARRAY[]::TEXT[])
    ) AS value
    WHERE value IS NOT NULL
  LOOP
    PERFORM refresh_knowledge_block_mastery(v_answer.student_id, v_target);
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6. Process toàn bộ attempt. Chạy lại an toàn.
CREATE OR REPLACE FUNCTION process_mastery_for_attempt(
  p_attempt_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_answer_id TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_answer_id IN
    SELECT id
    FROM student_answers
    WHERE attempt_id = p_attempt_id
  LOOP
    PERFORM process_mastery_for_answer(v_answer_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 7. Rebuild toàn bộ evidence từ student_answers hiện có.
CREATE OR REPLACE FUNCTION rebuild_all_mastery_evidence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_answer_id TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_answer_id IN SELECT id FROM student_answers LOOP
    PERFORM process_mastery_for_answer(v_answer_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 8. RLS tạm thời đồng bộ Phase 1; Phase 6 sẽ siết theo role.
ALTER TABLE mastery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_block_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all mastery_evidence" ON mastery_evidence;
CREATE POLICY "Allow all mastery_evidence"
  ON mastery_evidence FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all knowledge_block_mastery" ON knowledge_block_mastery;
CREATE POLICY "Allow all knowledge_block_mastery"
  ON knowledge_block_mastery FOR ALL USING (true) WITH CHECK (true);
