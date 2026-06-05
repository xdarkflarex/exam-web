-- ==============================================
-- HỆ THỐNG LÝ THUYẾT (THEORIES)
-- Ngày tạo: 2026-06-04
-- ==============================================

-- 1. THEORIES (Bài lý thuyết thuộc Section)
CREATE TABLE IF NOT EXISTS theories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content_md TEXT,                 -- Toàn bộ lý thuyết Markdown (+ MathJax)
  difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_theories_section ON theories(section_id);
CREATE INDEX IF NOT EXISTS idx_theories_order ON theories(section_id, order_index);
CREATE INDEX IF NOT EXISTS idx_theories_published ON theories(is_published);

-- 2. THEORY_EDGES (Đồ thị tiên quyết giữa các bài lý thuyết)
CREATE TABLE IF NOT EXISTS theory_edges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  to_theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('prerequisite', 'related', 'extension')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_theory_id, to_theory_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_te_from ON theory_edges(from_theory_id);
CREATE INDEX IF NOT EXISTS idx_te_to ON theory_edges(to_theory_id);

-- 3. QUESTION_THEORIES (Liên kết câu hỏi ↔ bài lý thuyết)
CREATE TABLE IF NOT EXISTS question_theories (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  weight DECIMAL(3,2) DEFAULT 1.0,
  PRIMARY KEY (question_id, theory_id)
);

CREATE INDEX IF NOT EXISTS idx_qt_question ON question_theories(question_id);
CREATE INDEX IF NOT EXISTS idx_qt_theory ON question_theories(theory_id);

-- 4. THEORY_MASTERY (Theo dõi thành thạo theo học sinh)
CREATE TABLE IF NOT EXISTS theory_mastery (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  theory_id TEXT NOT NULL REFERENCES theories(id) ON DELETE CASCADE,
  mastery_score DECIMAL(5,2) DEFAULT 0.0,
  questions_attempted INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, theory_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_student ON theory_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_tm_theory ON theory_mastery(theory_id);
CREATE INDEX IF NOT EXISTS idx_tm_score ON theory_mastery(mastery_score);

-- 5. LATEX_TEMPLATES (Template .tex mặc định + custom)
CREATE TABLE IF NOT EXISTS latex_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  template_text TEXT NOT NULL,     -- Nội dung file .tex với placeholder
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- TRIGGERS (Tự cập nhật updated_at)
-- ==============================================
CREATE TRIGGER update_theories_updated_at BEFORE UPDATE ON theories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_theory_mastery_updated_at BEFORE UPDATE ON theory_mastery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_latex_templates_updated_at BEFORE UPDATE ON latex_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- RLS (Cho phép tất cả trong giai đoạn phát triển)
-- ==============================================
ALTER TABLE theories ENABLE ROW LEVEL SECURITY;
ALTER TABLE theory_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_theories ENABLE ROW LEVEL SECURITY;
ALTER TABLE theory_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE latex_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all theories" ON theories FOR ALL USING (true);
CREATE POLICY "Allow all theory_edges" ON theory_edges FOR ALL USING (true);
CREATE POLICY "Allow all question_theories" ON question_theories FOR ALL USING (true);
CREATE POLICY "Allow all theory_mastery" ON theory_mastery FOR ALL USING (true);
CREATE POLICY "Allow all latex_templates" ON latex_templates FOR ALL USING (true);

-- ==============================================
-- SEED: Template LaTeX mặc định
-- ==============================================
INSERT INTO latex_templates (name, description, is_default, template_text)
VALUES (
  'Template Cơ Bản',
  'Template mặc định cho xuất lý thuyết',
  true,
  E'\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{vietnam}\n\\usepackage{amsmath,amssymb}\n\\usepackage[margin=2cm]{geometry}\n\\usepackage{enumitem}\n\n\\begin{document}\n\\section*{ {{title}} }\n\n{{content}}\n\n\\vfill\n\\noindent\\textit{Xuất ngày: {{date}}}\n\\end{document}'
) ON CONFLICT DO NOTHING;
