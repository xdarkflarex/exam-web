-- ==============================================
-- PHÂN QUYỀN TÍNH NĂNG (ACCESS TIER + FEATURE FLAGS)
-- Phần 2 của kế hoạch HS / phân quyền / bài tập
-- Chạy trên Supabase SQL Editor.
-- ==============================================

-- 1. access_tier trên profiles: 'basic' (HS thường) | 'full' (HS của tôi, full access)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'basic'
  CHECK (access_tier IN ('basic', 'full'));

CREATE INDEX IF NOT EXISTS idx_profiles_access_tier ON profiles(access_tier);

-- 1b. Giáo viên phụ trách lớp (để xác định "HS của tôi đang dạy").
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

-- 2. Feature flags cho nhóm 'basic' lưu trong site_settings (key/value jsonb).
--    value liệt kê tính năng mà HS 'basic' ĐƯỢC PHÉP dùng.
INSERT INTO site_settings (key, value)
VALUES (
  'access.feature_flags',
  '{
    "practice": true,
    "simulation": false,
    "theories": true,
    "graph": false,
    "homework": true,
    "history": true,
    "analytics": false
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
