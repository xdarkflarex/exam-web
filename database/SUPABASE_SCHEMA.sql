-- ==============================================
-- SUPABASE DATABASE SCHEMA
-- Chạy script này trên Supabase SQL Editor
-- ==============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- NOTE: Subjects/Chapters tables REMOVED
-- Use taxonomy system (topics/categories/sections) instead
-- ==============================================

-- ==============================================
-- 1. QUESTIONS (Câu hỏi)
-- ==============================================
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  
  -- Content
  content TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice',
  
  -- Difficulty (dual format for backward compatibility)
  difficulty INTEGER DEFAULT 1,              -- 1/2/3/4 (legacy)
  cognitive_level TEXT,                      -- NB/TH/VD/VDC (new)
  
  -- Classification (use taxonomy system via question_taxonomy table)
  source_exam TEXT,                          -- Tên đề thi nguồn
  
  -- Solution & Explanation
  explanation TEXT,                          -- Giải thích ngắn
  solution TEXT,                             -- Hướng dẫn giải chi tiết
  
  -- TikZ Graphics
  tikz_code TEXT,                            -- TikZ source code
  tikz_image_url TEXT,                       -- Supabase Storage URL
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_cognitive ON questions(cognitive_level);
CREATE INDEX IF NOT EXISTS idx_questions_source_exam ON questions(source_exam);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_updated ON questions(updated_at DESC);

-- ==============================================
-- 4. ANSWERS (Đáp án)
-- ==============================================
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_order ON answers(question_id, order_index);

-- ==============================================
-- 5. TAXONOMY (Phân loại 4 cấp)
-- ==============================================

-- Topics (Cấp 1)
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (Cấp 2)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_topic ON categories(topic_id);

-- Sections (Cấp 3) - Có thêm topic_id để truy vết nhanh
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_category ON sections(category_id);
CREATE INDEX IF NOT EXISTS idx_sections_topic ON sections(topic_id);

-- SubSections (Cấp 4) - Có thêm category_id và topic_id để truy vết nhanh
CREATE TABLE IF NOT EXISTS subsections (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  question_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subsections_section ON subsections(section_id);
CREATE INDEX IF NOT EXISTS idx_subsections_category ON subsections(category_id);
CREATE INDEX IF NOT EXISTS idx_subsections_topic ON subsections(topic_id);

-- Question Taxonomy Mapping
CREATE TABLE IF NOT EXISTS question_taxonomy (
  question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
  subsection_id TEXT REFERENCES subsections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_qtax_topic ON question_taxonomy(topic_id);
CREATE INDEX IF NOT EXISTS idx_qtax_category ON question_taxonomy(category_id);
CREATE INDEX IF NOT EXISTS idx_qtax_section ON question_taxonomy(section_id);
CREATE INDEX IF NOT EXISTS idx_qtax_subsection ON question_taxonomy(subsection_id);

-- ==============================================
-- 6. TAGS (Tags cho câu hỏi)
-- ==============================================
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Question Tags (Many-to-Many)
CREATE TABLE IF NOT EXISTS question_tags (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_qtags_question ON question_tags(question_id);
CREATE INDEX IF NOT EXISTS idx_qtags_tag ON question_tags(tag_id);

-- ==============================================
-- 7. AUTO UPDATE TIMESTAMP TRIGGER
-- ==============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subsections_updated_at BEFORE UPDATE ON subsections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- Enable nhưng allow all cho testing
-- Sau này có thể thêm auth
-- ==============================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsections ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_tags ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (public access)
CREATE POLICY "Allow all on questions" ON questions FOR ALL USING (true);
CREATE POLICY "Allow all on answers" ON answers FOR ALL USING (true);
CREATE POLICY "Allow all on topics" ON topics FOR ALL USING (true);
CREATE POLICY "Allow all on categories" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all on sections" ON sections FOR ALL USING (true);
CREATE POLICY "Allow all on subsections" ON subsections FOR ALL USING (true);
CREATE POLICY "Allow all on question_taxonomy" ON question_taxonomy FOR ALL USING (true);
CREATE POLICY "Allow all on tags" ON tags FOR ALL USING (true);
CREATE POLICY "Allow all on question_tags" ON question_tags FOR ALL USING (true);

-- ==============================================
-- 9. STORAGE BUCKET FOR TIKZ IMAGES
-- ==============================================
-- Bước 1: Tạo bucket (chạy trong SQL Editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tikz-images', 
  'tikz-images', 
  true,
  5242880,  -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bước 2: Storage policies cho bucket
-- Policy cho phép ai cũng có thể đọc (public bucket)
CREATE POLICY "Public read access for tikz-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tikz-images');

-- Policy cho phép upload (authenticated hoặc service role)
CREATE POLICY "Allow upload to tikz-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tikz-images');

-- Policy cho phép update
CREATE POLICY "Allow update tikz-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tikz-images');

-- Policy cho phép delete
CREATE POLICY "Allow delete tikz-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'tikz-images');
