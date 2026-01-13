-- ============================================
-- Site Settings Table
-- ============================================
-- Stores editable content for public pages (landing page, etc.)
-- Admin can edit content via /admin/settings/landing
-- ============================================

-- Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);

-- Enable RLS (Row Level Security)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Allow public read access (for landing page to fetch content)
CREATE POLICY "Allow public read access to site_settings"
    ON site_settings
    FOR SELECT
    TO public
    USING (true);

-- Allow admin to update site_settings
CREATE POLICY "Allow admin to update site_settings"
    ON site_settings
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admin to insert site_settings
CREATE POLICY "Allow admin to insert site_settings"
    ON site_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admin to delete site_settings (if needed)
CREATE POLICY "Allow admin to delete site_settings"
    ON site_settings
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
-- Default Landing Page Content
-- ============================================

-- Insert default hero content
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.hero',
    '{
        "title": "Nền tảng luyện thi Toán THPT",
        "subtitle": "Luyện đề – phân tích – cải thiện điểm số một cách hiệu quả",
        "cta_primary": "Đăng nhập",
        "cta_secondary": "Bắt đầu ngay"
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Insert default benefits content
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.benefits',
    '[
        {"icon": "target", "title": "Đề thi chất lượng", "description": "Hàng trăm đề thi được biên soạn theo chuẩn đề thi THPT Quốc gia"},
        {"icon": "trending", "title": "Phân tích chi tiết", "description": "Thống kê điểm mạnh, điểm yếu và đề xuất bài tập phù hợp"},
        {"icon": "clock", "title": "Luyện thi mọi lúc", "description": "Học và làm bài thi trực tuyến 24/7 trên mọi thiết bị"},
        {"icon": "award", "title": "Theo dõi tiến bộ", "description": "Xem lịch sử làm bài và theo dõi sự tiến bộ qua từng ngày"}
    ]'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Insert default config
INSERT INTO site_settings (key, value, updated_at)
VALUES (
    'landing.config',
    '{
        "show_featured_exams": true,
        "featured_exams_count": 6
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Trigger for updated_at
-- ============================================

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_site_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_site_settings_updated_at ON site_settings;
CREATE TRIGGER trigger_site_settings_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_site_settings_updated_at();

-- ============================================
-- Grant permissions
-- ============================================
GRANT SELECT ON site_settings TO anon;
GRANT SELECT ON site_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON site_settings TO authenticated;
