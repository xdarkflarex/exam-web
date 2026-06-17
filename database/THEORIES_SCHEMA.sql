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
-- SEED: Template LaTeX mặc định (match filechinh.tex style)
-- ==============================================
INSERT INTO latex_templates (name, description, is_default, template_text)
VALUES (
  'Template Minh Math',
  'Template chuẩn theo style Hệ thống Tri thức Toán THPT (filechinh.tex)',
  true,
  E'\\documentclass[12pt,a4paper]{article}\n\\usepackage[T5]{fontenc}\n\\usepackage[utf8]{inputenc}\n\\usepackage[vietnamese]{babel}\n\\usepackage{newtxtext,newtxmath}\n\\usepackage[a4paper,left=1.8cm,right=1.8cm,top=2.2cm,bottom=2.2cm]{geometry}\n\\usepackage{xcolor}\n\\definecolor{Primary}{HTML}{0F172A}\n\\definecolor{Accent}{HTML}{2563EB}\n\\definecolor{SoftAccent}{HTML}{EFF6FF}\n\\definecolor{Border}{HTML}{CBD5E1}\n\\definecolor{TextGray}{HTML}{475569}\n\\usepackage{tikz,tcolorbox,amsmath,enumitem,fancyhdr,multicol,graphicx,tkz-tab}\n\\tcbuselibrary{breakable}\n\\usetikzlibrary{calc,arrows.meta}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\setlength{\\headheight}{32pt}\n\\fancyhead[L]{\\begin{tabular}{@{}l@{}}{\\color{black}\\scriptsize\\bfseries {{header_left_1}}}\\\\{\\color{black}\\scriptsize\\bfseries {{header_left_2}}}\\end{tabular}}\n\\fancyhead[R]{\\begin{tabular}{@{}r@{}}\n\\textcolor{Accent}{\\small\\bfseries TÀI LIỆU LUYỆN THI}\\\\\\textcolor{Accent}{\\scriptsize {{header_right}}}\\end{tabular}}\n\\fancyfoot[C]{\\textcolor{TextGray}{\\thepage}}\n\\renewcommand{\\headrulewidth}{0pt}\n\\newcommand{\\MainTitle}[1]{\\begin{center}\\begin{tikzpicture}\\node[fill=Primary,rounded corners=18pt,minimum width=16cm,minimum height=2cm](box){};\\node[anchor=center,font=\\fontsize{24}{24}\\selectfont\\bfseries,text=white]at(box.center){#1};\\end{tikzpicture}\\end{center}\\vspace{1em}}\n\\newcommand{\\SectionBox}[1]{\\begin{tcolorbox}[colback=Primary,colframe=Primary,arc=4mm,boxrule=0pt,left=3mm,right=3mm,top=2mm,bottom=2mm,halign=center]{\\color{white}\\bfseries\\Large #1}\\end{tcolorbox}}\n\\newcounter{mychapter}\\newcounter{mylesson}[mychapter]\n\\newcommand{\\ChapterBox}[1]{\\refstepcounter{mychapter}\\SectionBox{CHƯƠNG \\themychapter. #1}}\n\\newcommand{\\LessonBox}[1]{\\refstepcounter{mylesson}\\begin{tcolorbox}[colback=Accent,colframe=Accent,arc=4mm,boxrule=0pt,left=3mm,right=3mm,top=2mm,bottom=2mm,halign=center]{\\color{white}\\bfseries\\Large BÀI \\themylesson. #1}\\end{tcolorbox}}\n\\newcommand{\\TheoryHeading}[1]{{\\color{Primary}\\bfseries #1}\\par}\n\\newtcolorbox{theorybox}{breakable,colback=SoftAccent,colframe=Accent,boxrule=0.8pt,arc=3mm,title=\\bfseries KIẾN THỨC CẦN NHỚ,fonttitle=\\large,coltitle=white,colbacktitle=Accent}\n\\newtcolorbox{examplebox}{breakable,colback=white,colframe=Border,boxrule=0.8pt,arc=3mm,title=\\bfseries VÍ DỤ,fonttitle=\\large,coltitle=Primary,colbacktitle=SoftAccent}\n\\begin{document}\n\\MainTitle{ {{title}} }\n\n{{content}}\n\n\\vfill\n\\noindent\\textit{Xuất từ Exam-Web ngày: {{date}}}\n\\end{document}'
) ON CONFLICT DO NOTHING;
