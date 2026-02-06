-- Announcements Schema
-- Created: 2026-02-05

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'update', 'new_exam')),
  link_url TEXT,
  link_text TEXT,
  is_active BOOLEAN DEFAULT true,
  is_pinned BOOLEAN DEFAULT false,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can view active announcements
CREATE POLICY "Anyone can view active announcements"
ON announcements FOR SELECT
USING (
  is_active = true 
  AND (start_date IS NULL OR start_date <= NOW())
  AND (end_date IS NULL OR end_date >= NOW())
);

-- Admins can do everything
CREATE POLICY "Admins can manage all announcements"
ON announcements FOR ALL
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned, created_at DESC);

-- Bookmarks table for saved questions
CREATE TABLE IF NOT EXISTS question_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT REFERENCES questions(id) ON DELETE CASCADE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- Enable RLS
ALTER TABLE question_bookmarks ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own bookmarks
CREATE POLICY "Users can view own bookmarks"
ON question_bookmarks FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bookmarks"
ON question_bookmarks FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks"
ON question_bookmarks FOR DELETE
USING (user_id = auth.uid());

-- Admins can view all bookmarks
CREATE POLICY "Admins can view all bookmarks"
ON question_bookmarks FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL,
  category TEXT DEFAULT 'achievement' CHECK (category IN ('achievement', 'streak', 'score', 'milestone')),
  requirement_type TEXT NOT NULL,
  requirement_value INTEGER NOT NULL,
  points INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User badges (earned badges)
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- Enable RLS
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Everyone can view badges
CREATE POLICY "Anyone can view badges"
ON badges FOR SELECT
USING (is_active = true);

-- Users can view their own earned badges
CREATE POLICY "Users can view own badges"
ON user_badges FOR SELECT
USING (user_id = auth.uid());

-- System can insert badges for users (via service role)
CREATE POLICY "Admins can manage user badges"
ON user_badges FOR ALL
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Admins can manage badge definitions
CREATE POLICY "Admins can manage badges"
ON badges FOR ALL
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Personal goals table
CREATE TABLE IF NOT EXISTS user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('avg_score', 'exams_per_week', 'streak_days', 'total_exams')),
  target_value DECIMAL NOT NULL,
  current_value DECIMAL DEFAULT 0,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

-- Users can manage their own goals
CREATE POLICY "Users can view own goals"
ON user_goals FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own goals"
ON user_goals FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own goals"
ON user_goals FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own goals"
ON user_goals FOR DELETE
USING (user_id = auth.uid());

-- Admins can view all goals
CREATE POLICY "Admins can view all goals"
ON user_goals FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Insert default badges
INSERT INTO badges (code, name, description, icon, category, requirement_type, requirement_value, points) VALUES
  ('first_exam', 'Khởi đầu', 'Hoàn thành bài thi đầu tiên', '🎯', 'milestone', 'total_exams', 1, 10),
  ('exam_10', 'Chăm chỉ', 'Hoàn thành 10 bài thi', '📚', 'milestone', 'total_exams', 10, 50),
  ('exam_50', 'Siêng năng', 'Hoàn thành 50 bài thi', '🏃', 'milestone', 'total_exams', 50, 100),
  ('exam_100', 'Kiên trì', 'Hoàn thành 100 bài thi', '💪', 'milestone', 'total_exams', 100, 200),
  ('score_8', 'Xuất sắc', 'Đạt điểm 8.0 trở lên', '⭐', 'score', 'high_score', 8, 30),
  ('score_9', 'Ưu tú', 'Đạt điểm 9.0 trở lên', '🌟', 'score', 'high_score', 9, 50),
  ('score_10', 'Hoàn hảo', 'Đạt điểm 10', '🏆', 'score', 'high_score', 10, 100),
  ('streak_7', 'Tuần lễ vàng', 'Học 7 ngày liên tiếp', '🔥', 'streak', 'streak_days', 7, 70),
  ('streak_30', 'Tháng kiên cường', 'Học 30 ngày liên tiếp', '💎', 'streak', 'streak_days', 30, 300),
  ('avg_8', 'Học sinh giỏi', 'Điểm trung bình đạt 8.0', '🎓', 'achievement', 'avg_score', 8, 150)
ON CONFLICT (code) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON question_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_question ON question_bookmarks(question_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_user ON user_goals(user_id);
