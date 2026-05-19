-- ============================================
-- Posts (Blog / Articles) Table
-- ============================================
-- Stores blog posts/articles for CMS
-- Admin/content writer can manage via /admin/posts
-- ============================================

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL DEFAULT '',
    cover_image TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    category TEXT,
    published_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Public can read published posts
CREATE POLICY "Allow public read published posts"
    ON posts
    FOR SELECT
    TO public
    USING (status = 'published');

-- Admin can read all posts
CREATE POLICY "Allow admin read all posts"
    ON posts
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admin can insert posts
CREATE POLICY "Allow admin insert posts"
    ON posts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admin can update posts
CREATE POLICY "Allow admin update posts"
    ON posts
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admin can delete posts
CREATE POLICY "Allow admin delete posts"
    ON posts
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_posts_updated_at ON posts;
CREATE TRIGGER trigger_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_updated_at();

-- ============================================
-- Grant permissions
-- ============================================
GRANT SELECT ON posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO authenticated;

-- ============================================
-- Seed new site_settings keys for landing CMS
-- ============================================

INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.brand',
    '{"name": "Minh Math", "copyright": "© 2025 Minh Math. Luyện Thi Toán - Tin Cấp 2/Cấp 3"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Update existing hero to include badge field
UPDATE site_settings
SET value = value || '{"badge": "Luyện thi Toán & Tin học"}'::jsonb
WHERE key = 'landing.hero'
AND NOT (value ? 'badge');

INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.exams_section',
    '{"title": "Đề thi có sẵn", "subtitle": "Đăng nhập để làm bài và xem kết quả chi tiết"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.benefits_section',
    '{"title": "Tại sao chọn Minh Math?", "subtitle": "Nền tảng luyện thi trực tuyến hiện đại, giúp bạn chuẩn bị tốt nhất cho kỳ thi"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.cta',
    '{"badge": "Miễn phí", "title": "Sẵn sàng nâng cao điểm số?", "subtitle": "Tham gia cùng hàng nghìn học sinh đang luyện thi trên Minh Math", "button": "Đăng ký miễn phí"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;
