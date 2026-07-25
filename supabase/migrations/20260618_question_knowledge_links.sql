-- ==============================================
-- PHASE 1: CẦU NỐI DỮ LIỆU CÂU HỎI ↔ TRI THỨC
-- question_knowledge_links
-- Ngày tạo: 2026-06-18
-- ----------------------------------------------
-- Lớp liên kết chi tiết giữa câu hỏi và tri thức ở cấp
-- theory HOẶC knowledge_block. KHÔNG xóa question_theories
-- (giữ tương thích ngược). Backfill từ question_theories.
-- ==============================================

-- 1. BẢNG LIÊN KẾT
CREATE TABLE IF NOT EXISTS question_knowledge_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  knowledge_block_id TEXT REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary', 'supporting', 'prerequisite')),
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.0
    CHECK (weight > 0 AND weight <= 10),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'taxonomy_rule', 'import')),
  confidence NUMERIC(4,2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RÀNG BUỘC

-- Unique theo (question, block, link_type). Vì knowledge_block_id có thể NULL
-- (link cấp theory), dùng 2 unique index riêng: một cho block-level, một cho theory-level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qkl_block
  ON question_knowledge_links(question_id, knowledge_block_id, link_type)
  WHERE knowledge_block_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qkl_theory
  ON question_knowledge_links(question_id, theory_id, link_type)
  WHERE knowledge_block_id IS NULL;

-- Một câu hỏi chỉ có tối đa MỘT link 'primary' (bất kể theory/block nào).
CREATE UNIQUE INDEX IF NOT EXISTS uq_qkl_one_primary
  ON question_knowledge_links(question_id)
  WHERE link_type = 'primary';

CREATE INDEX IF NOT EXISTS idx_qkl_question ON question_knowledge_links(question_id);
CREATE INDEX IF NOT EXISTS idx_qkl_theory ON question_knowledge_links(theory_id);
CREATE INDEX IF NOT EXISTS idx_qkl_block ON question_knowledge_links(knowledge_block_id);

-- 3. TRIGGER: knowledge_block_id (nếu có) phải thuộc theory_id
CREATE OR REPLACE FUNCTION qkl_validate_block_theory()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.knowledge_block_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM knowledge_blocks kb
      WHERE kb.id = NEW.knowledge_block_id
        AND kb.theory_id = NEW.theory_id
    ) THEN
      RAISE EXCEPTION 'knowledge_block_id % không thuộc theory_id %',
        NEW.knowledge_block_id, NEW.theory_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qkl_validate ON question_knowledge_links;
CREATE TRIGGER trg_qkl_validate
  BEFORE INSERT OR UPDATE ON question_knowledge_links
  FOR EACH ROW EXECUTE FUNCTION qkl_validate_block_theory();

DROP TRIGGER IF EXISTS update_qkl_updated_at ON question_knowledge_links;
CREATE TRIGGER update_qkl_updated_at BEFORE UPDATE ON question_knowledge_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RPC MAP AN TOÀN / IDEMPOTENT
-- Toàn bộ việc đổi primary cũ và tạo link mới chạy trong cùng một transaction.
-- Tránh trạng thái dở dang hoặc lỗi unique khi client gửi nhiều lệnh rời rạc.
CREATE OR REPLACE FUNCTION map_question_knowledge_link(
  p_question_id TEXT,
  p_theory_id TEXT,
  p_knowledge_block_id TEXT DEFAULT NULL,
  p_link_type TEXT DEFAULT 'primary',
  p_weight NUMERIC DEFAULT 1.0,
  p_source TEXT DEFAULT 'manual',
  p_confidence NUMERIC DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS question_knowledge_links
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link question_knowledge_links;
BEGIN
  IF p_link_type NOT IN ('primary', 'supporting', 'prerequisite') THEN
    RAISE EXCEPTION 'link_type không hợp lệ: %', p_link_type;
  END IF;
  IF p_source NOT IN ('manual', 'taxonomy_rule', 'import') THEN
    RAISE EXCEPTION 'source không hợp lệ: %', p_source;
  END IF;
  IF p_weight <= 0 OR p_weight > 10 THEN
    RAISE EXCEPTION 'weight phải nằm trong khoảng (0, 10]';
  END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN
    RAISE EXCEPTION 'confidence phải nằm trong khoảng [0, 1]';
  END IF;

  -- Khóa các link của câu hỏi để hai request đồng thời không tạo hai primary.
  PERFORM 1
  FROM question_knowledge_links
  WHERE question_id = p_question_id
  FOR UPDATE;

  IF p_link_type = 'primary' THEN
    -- Nếu đích hiện tại đã là primary thì chỉ cập nhật metadata và kết thúc.
    SELECT *
    INTO v_link
    FROM question_knowledge_links
    WHERE question_id = p_question_id
      AND theory_id = p_theory_id
      AND knowledge_block_id IS NOT DISTINCT FROM p_knowledge_block_id
      AND link_type = 'primary'
    LIMIT 1;

    IF FOUND THEN
      UPDATE question_knowledge_links
      SET weight = p_weight,
          source = p_source,
          confidence = p_confidence,
          created_by = COALESCE(p_created_by, created_by)
      WHERE id = v_link.id
      RETURNING * INTO v_link;
      RETURN v_link;
    END IF;

    -- Xóa supporting tại đích mới vì dòng này sắp được nâng thành primary.
    DELETE FROM question_knowledge_links
    WHERE question_id = p_question_id
      AND theory_id = p_theory_id
      AND knowledge_block_id IS NOT DISTINCT FROM p_knowledge_block_id
      AND link_type = 'supporting';

    -- Nếu vị trí primary cũ đã có supporting tương ứng, xóa bản supporting trùng
    -- trước khi hạ primary cũ xuống supporting.
    DELETE FROM question_knowledge_links supporting
    USING question_knowledge_links current_primary
    WHERE current_primary.question_id = p_question_id
      AND current_primary.link_type = 'primary'
      AND supporting.question_id = current_primary.question_id
      AND supporting.link_type = 'supporting'
      AND supporting.theory_id = current_primary.theory_id
      AND supporting.knowledge_block_id IS NOT DISTINCT FROM current_primary.knowledge_block_id;

    UPDATE question_knowledge_links
    SET link_type = 'supporting'
    WHERE question_id = p_question_id
      AND link_type = 'primary';
  END IF;

  SELECT *
  INTO v_link
  FROM question_knowledge_links
  WHERE question_id = p_question_id
    AND theory_id = p_theory_id
    AND knowledge_block_id IS NOT DISTINCT FROM p_knowledge_block_id
    AND link_type = p_link_type
  LIMIT 1;

  IF FOUND THEN
    UPDATE question_knowledge_links
    SET weight = p_weight,
        source = p_source,
        confidence = p_confidence,
        created_by = COALESCE(p_created_by, created_by)
    WHERE id = v_link.id
    RETURNING * INTO v_link;
  ELSE
    INSERT INTO question_knowledge_links (
      question_id,
      theory_id,
      knowledge_block_id,
      link_type,
      weight,
      source,
      confidence,
      created_by
    )
    VALUES (
      p_question_id,
      p_theory_id,
      p_knowledge_block_id,
      p_link_type,
      p_weight,
      p_source,
      p_confidence,
      p_created_by
    )
    RETURNING * INTO v_link;
  END IF;

  RETURN v_link;
END;
$$;

CREATE OR REPLACE FUNCTION bulk_map_questions_to_knowledge(
  p_question_ids TEXT[],
  p_theory_id TEXT,
  p_knowledge_block_id TEXT DEFAULT NULL,
  p_link_type TEXT DEFAULT 'supporting',
  p_weight NUMERIC DEFAULT 1.0,
  p_created_by UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_question_id TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_question_ids IS NULL OR cardinality(p_question_ids) = 0 THEN
    RETURN 0;
  END IF;

  FOREACH v_question_id IN ARRAY p_question_ids LOOP
    PERFORM map_question_knowledge_link(
      v_question_id,
      p_theory_id,
      p_knowledge_block_id,
      p_link_type,
      p_weight,
      'manual',
      NULL,
      p_created_by
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 5. BACKFILL TỪ question_theories (cấp theory, knowledge_block_id = NULL)
-- Mỗi dòng question_theories -> một link 'primary' cấp theory.
-- Nếu một câu hỏi map nhiều theory: chỉ dòng đầu là 'primary', còn lại 'supporting'
-- để tôn trọng ràng buộc uq_qkl_one_primary.
INSERT INTO question_knowledge_links
  (question_id, theory_id, knowledge_block_id, link_type, weight, source)
SELECT
  qt.question_id,
  qt.theory_id,
  NULL,
  CASE WHEN ROW_NUMBER() OVER (
    PARTITION BY qt.question_id ORDER BY qt.theory_id
  ) = 1 THEN 'primary' ELSE 'supporting' END,
  COALESCE(qt.weight, 1.0),
  'import'
FROM question_theories qt
ON CONFLICT DO NOTHING;

-- 6. VIEW COVERAGE: số câu hỏi đã map theo theory & block
CREATE OR REPLACE VIEW v_theory_question_coverage AS
SELECT
  t.id AS theory_id,
  t.title AS theory_title,
  t.section_id,
  COUNT(DISTINCT qkl.question_id) AS mapped_questions,
  COUNT(DISTINCT qkl.question_id)
    FILTER (WHERE qkl.knowledge_block_id IS NOT NULL) AS block_mapped_questions
FROM theories t
LEFT JOIN question_knowledge_links qkl ON qkl.theory_id = t.id
GROUP BY t.id, t.title, t.section_id;

CREATE OR REPLACE VIEW v_block_question_coverage AS
SELECT
  kb.id AS knowledge_block_id,
  kb.theory_id,
  kb.title AS block_title,
  kb.block_type,
  COUNT(DISTINCT qkl.question_id) AS mapped_questions
FROM knowledge_blocks kb
LEFT JOIN question_knowledge_links qkl ON qkl.knowledge_block_id = kb.id
GROUP BY kb.id, kb.theory_id, kb.title, kb.block_type;

-- 7. RLS (giai đoạn phát triển — sẽ siết lại ở Phase 6)
ALTER TABLE question_knowledge_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all question_knowledge_links" ON question_knowledge_links;
CREATE POLICY "Allow all question_knowledge_links"
  ON question_knowledge_links
  FOR ALL
  USING (true)
  WITH CHECK (true);
