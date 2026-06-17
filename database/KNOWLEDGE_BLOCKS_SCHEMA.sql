-- ==============================================
-- KHỐI TRI THỨC CÓ KIỂU (KNOWLEDGE BLOCKS)
-- Bổ sung cho THEORIES_SCHEMA.sql
-- Ngày tạo: 2026-06-10
-- ----------------------------------------------
-- Mỗi Theory được tách thành nhiều khối tri thức có KIỂU
-- (định nghĩa, định lý, tính chất, ví dụ...) để hiển thị
-- đồ thị tri thức 2D/3D và bản đồ tư duy từng bài.
-- ==============================================

-- 1. KNOWLEDGE_BLOCKS (khối tri thức con của Theory)
CREATE TABLE IF NOT EXISTS knowledge_blocks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'dinh_nghia', 'dinh_ly', 'tinh_chat', 'he_qua', 'cong_thuc',
    'phuong_phap', 'chu_y', 'vi_du', 'bai_tap'
  )),
  title TEXT,
  body_md TEXT,                    -- Nội dung (Markdown + MathJax + tikz)
  order_index INTEGER DEFAULT 0,
  external_id TEXT,                -- = [id] khai báo trong LaTeX, dùng map cạnh
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_theory ON knowledge_blocks(theory_id);
CREATE INDEX IF NOT EXISTS idx_kb_type ON knowledge_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_kb_order ON knowledge_blocks(theory_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_external
  ON knowledge_blocks(external_id) WHERE external_id IS NOT NULL;

-- 2. KNOWLEDGE_BLOCK_EDGES (cạnh giữa các khối tri thức)
CREATE TABLE IF NOT EXISTS knowledge_block_edges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_block_id TEXT NOT NULL REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  to_block_id TEXT NOT NULL REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('prerequisite', 'related', 'extension')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_block_id, to_block_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_kbe_from ON knowledge_block_edges(from_block_id);
CREATE INDEX IF NOT EXISTS idx_kbe_to ON knowledge_block_edges(to_block_id);

-- ==============================================
-- TRIGGERS
-- ==============================================
DROP TRIGGER IF EXISTS update_knowledge_blocks_updated_at ON knowledge_blocks;
CREATE TRIGGER update_knowledge_blocks_updated_at BEFORE UPDATE ON knowledge_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- RLS (cho phép tất cả trong giai đoạn phát triển)
-- ==============================================
ALTER TABLE knowledge_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_block_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all knowledge_blocks" ON knowledge_blocks;
DROP POLICY IF EXISTS "Allow all knowledge_block_edges" ON knowledge_block_edges;
CREATE POLICY "Allow all knowledge_blocks" ON knowledge_blocks FOR ALL USING (true);
CREATE POLICY "Allow all knowledge_block_edges" ON knowledge_block_edges FOR ALL USING (true);
