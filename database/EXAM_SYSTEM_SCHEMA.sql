-- ==============================================
-- EXAM SYSTEM DATABASE SCHEMA
-- Chạy script này trên Supabase SQL Editor
-- ==============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- 1. PROFILES (User roles & info)
-- ==============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  class_id TEXT,
  school TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_class ON profiles(class_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ==============================================
-- 2. CLASSES (Lớp học)
-- ==============================================
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade INTEGER CHECK (grade IN (10, 11, 12)),
  school TEXT,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school);

-- ==============================================
-- 3. EXAMS (Đề thi)
-- ==============================================
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Source (từ question-bank)
  source_exam TEXT, -- Tên đề thi nguồn (từ question-bank)
  
  -- Timing
  duration INTEGER NOT NULL, -- Phút
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  
  -- Settings
  is_shuffle_questions BOOLEAN DEFAULT false,
  is_shuffle_answers BOOLEAN DEFAULT false,
  show_results_immediately BOOLEAN DEFAULT false,
  allow_review BOOLEAN DEFAULT true,
  max_attempts INTEGER DEFAULT 1,
  
  -- Anti-cheat settings
  allow_dev_tools BOOLEAN DEFAULT false, -- Block dev tools
  allow_tab_switch BOOLEAN DEFAULT false, -- Block tab switch
  max_tab_switches INTEGER DEFAULT 0, -- Số lần chuyển tab cho phép
  require_webcam BOOLEAN DEFAULT false, -- Yêu cầu webcam
  
  -- Grading
  passing_score DECIMAL(5,2) DEFAULT 5.0,
  total_score DECIMAL(5,2) DEFAULT 10.0,
  
  -- Access control
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  is_published BOOLEAN DEFAULT false,
  
  -- Metadata
  subject TEXT,
  exam_type TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_class ON exams(class_id);
CREATE INDEX IF NOT EXISTS idx_exams_creator ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published);
CREATE INDEX IF NOT EXISTS idx_exams_time ON exams(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject);
CREATE INDEX IF NOT EXISTS idx_exams_source ON exams(source_exam);

-- ==============================================
-- 4. EXAM_QUESTIONS (Câu hỏi trong đề)
-- ==============================================
CREATE TABLE IF NOT EXISTS exam_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL, -- Reference to questions table (from question-bank)
  
  -- Question type
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  
  -- Scoring
  score DECIMAL(5,2) DEFAULT 1.0,
  
  -- Part & Ordering (Chia 3 phần theo loại câu hỏi)
  part_number INTEGER NOT NULL CHECK (part_number IN (1, 2, 3)), -- Phần I, II, III
  order_in_part INTEGER NOT NULL, -- Thứ tự trong phần
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exam_id, question_id),
  UNIQUE(exam_id, part_number, order_in_part)
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question ON exam_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_type ON exam_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_exam_questions_part ON exam_questions(exam_id, part_number, order_in_part);

-- ==============================================
-- 5. EXAM_ATTEMPTS (Bài làm học sinh)
-- ==============================================
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Timing
  start_time TIMESTAMPTZ DEFAULT NOW(),
  submit_time TIMESTAMPTZ,
  time_spent INTEGER, -- Giây
  
  -- Scoring
  score DECIMAL(5,2),
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress' 
    CHECK (status IN ('in_progress', 'submitted', 'graded', 'abandoned')),
  
  -- Security & Monitoring
  ip_address TEXT,
  user_agent TEXT,
  tab_switches INTEGER DEFAULT 0,
  dev_tools_opened BOOLEAN DEFAULT false,
  suspicious_activities JSONB DEFAULT '[]'::jsonb,
  
  -- Part progress (tracking which part student is on)
  current_part INTEGER DEFAULT 1,
  part_1_completed BOOLEAN DEFAULT false,
  part_2_completed BOOLEAN DEFAULT false,
  part_3_completed BOOLEAN DEFAULT false,
  
  -- Metadata
  attempt_number INTEGER DEFAULT 1,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exam_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_flagged ON exam_attempts(is_flagged);
CREATE INDEX IF NOT EXISTS idx_attempts_submit_time ON exam_attempts(submit_time);
CREATE INDEX IF NOT EXISTS idx_attempts_dev_tools ON exam_attempts(dev_tools_opened);

-- ==============================================
-- 6. STUDENT_ANSWERS (Đáp án học sinh)
-- ==============================================
CREATE TABLE IF NOT EXISTS student_answers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  
  -- Question type
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  
  -- Answer data (different formats for different question types)
  selected_answer TEXT, -- "A", "B", "C", "D" cho multiple_choice
  selected_answers JSONB, -- {"a": true, "b": false, "c": true, "d": false} cho true_false
  text_answer TEXT, -- Cho short_answer
  
  -- Grading
  is_correct BOOLEAN,
  score DECIMAL(5,2),
  
  -- Timing
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  time_spent INTEGER, -- Giây dành cho câu này
  
  UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_answers_attempt ON student_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question ON student_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_correct ON student_answers(is_correct);
CREATE INDEX IF NOT EXISTS idx_student_answers_type ON student_answers(question_type);

-- ==============================================
-- 7. EXAM_ANALYTICS (Thống kê đề thi)
-- ==============================================
CREATE TABLE IF NOT EXISTS exam_analytics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  
  -- Statistics
  total_attempts INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  
  -- Calculated metrics
  difficulty_index DECIMAL(5,2), -- % đúng (0-100)
  discrimination_index DECIMAL(5,2), -- Phân biệt giỏi/yếu (-1 to 1)
  
  -- Timing
  avg_time_spent INTEGER, -- Giây trung bình
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exam_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_exam ON exam_analytics(exam_id);
CREATE INDEX IF NOT EXISTS idx_analytics_question ON exam_analytics(question_id);
CREATE INDEX IF NOT EXISTS idx_analytics_difficulty ON exam_analytics(difficulty_index);

-- ==============================================
-- 8. ANTI_CHEAT_LOGS (Ghi log hành vi nghi vấn)
-- ==============================================
CREATE TABLE IF NOT EXISTS anti_cheat_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  
  -- Event type
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dev_tools_opened',
    'tab_switch',
    'window_blur',
    'right_click',
    'copy_paste',
    'network_request',
    'suspicious_timing'
  )),
  
  -- Details
  description TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  
  -- Severity
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anti_cheat_attempt ON anti_cheat_logs(attempt_id);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_event ON anti_cheat_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_severity ON anti_cheat_logs(severity);

-- ==============================================
-- 9. TRIGGERS
-- ==============================================

-- Auto update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attempts_updated_at BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto calculate exam score on submit
CREATE OR REPLACE FUNCTION calculate_exam_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'in_progress' THEN
    -- Calculate score from student_answers
    SELECT 
      COALESCE(SUM(CASE WHEN is_correct THEN score ELSE 0 END), 0),
      COUNT(*),
      COUNT(*) FILTER (WHERE is_correct = true)
    INTO NEW.score, NEW.total_questions, NEW.correct_answers
    FROM student_answers
    WHERE attempt_id = NEW.id;
    
    -- Calculate time spent
    NEW.time_spent = EXTRACT(EPOCH FROM (NEW.submit_time - NEW.start_time))::INTEGER;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_calculate_score BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION calculate_exam_score();

-- Update exam analytics when answers are graded
CREATE OR REPLACE FUNCTION update_exam_analytics()
RETURNS TRIGGER AS $$
DECLARE
  v_exam_id TEXT;
BEGIN
  -- Get exam_id from attempt
  SELECT ea.exam_id INTO v_exam_id
  FROM exam_attempts ea
  WHERE ea.id = NEW.attempt_id;
  
  -- Update or insert analytics
  INSERT INTO exam_analytics (exam_id, question_id, total_attempts, correct_count, incorrect_count)
  VALUES (
    v_exam_id,
    NEW.question_id,
    1,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_correct = false THEN 1 ELSE 0 END
  )
  ON CONFLICT (exam_id, question_id) DO UPDATE SET
    total_attempts = exam_analytics.total_attempts + 1,
    correct_count = exam_analytics.correct_count + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    incorrect_count = exam_analytics.incorrect_count + CASE WHEN NEW.is_correct = false THEN 1 ELSE 0 END,
    difficulty_index = (exam_analytics.correct_count + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)::DECIMAL / 
                       (exam_analytics.total_attempts + 1) * 100,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_analytics_on_answer AFTER INSERT OR UPDATE ON student_answers
  FOR EACH ROW EXECUTE FUNCTION update_exam_analytics();

-- Auto-flag suspicious activity
CREATE OR REPLACE FUNCTION check_suspicious_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Flag if dev tools opened
  IF NEW.dev_tools_opened = true THEN
    NEW.is_flagged = true;
    NEW.flag_reason = 'Dev tools detected';
  END IF;
  
  -- Flag if too many tab switches
  IF NEW.tab_switches > (
    SELECT COALESCE(max_tab_switches, 0) 
    FROM exams 
    WHERE id = NEW.exam_id
  ) THEN
    NEW.is_flagged = true;
    NEW.flag_reason = 'Excessive tab switching';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_suspicious_activity_trigger BEFORE UPDATE ON exam_attempts
  FOR EACH ROW EXECUTE FUNCTION check_suspicious_activity();

-- ==============================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ==============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE anti_cheat_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: Public read, users can update own
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- CLASSES: Students see own class, teachers see classes they teach
CREATE POLICY "Students see own class" ON classes
  FOR SELECT USING (
    id IN (SELECT class_id FROM profiles WHERE id = auth.uid())
    OR
    teacher_id = auth.uid()
  );

CREATE POLICY "Teachers can manage own classes" ON classes
  FOR ALL USING (teacher_id = auth.uid());

-- EXAMS: Students see published exams for their class, teachers see own exams
CREATE POLICY "Students see published exams for their class" ON exams
  FOR SELECT USING (
    (is_published = true AND class_id IN (SELECT class_id FROM profiles WHERE id = auth.uid()))
    OR
    created_by = auth.uid()
  );

CREATE POLICY "Teachers manage own exams" ON exams
  FOR ALL USING (created_by = auth.uid());

-- EXAM_QUESTIONS: Readable if exam is accessible
CREATE POLICY "Exam questions readable if exam accessible" ON exam_questions
  FOR SELECT USING (
    exam_id IN (
      SELECT id FROM exams 
      WHERE (is_published = true AND class_id IN (SELECT class_id FROM profiles WHERE id = auth.uid()))
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Teachers manage exam questions" ON exam_questions
  FOR ALL USING (
    exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
  );

-- EXAM_ATTEMPTS: Students see own attempts, teachers see class attempts
CREATE POLICY "Students see own attempts" ON exam_attempts
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Students create own attempts" ON exam_attempts
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students update own attempts" ON exam_attempts
  FOR UPDATE USING (student_id = auth.uid());

CREATE POLICY "Teachers see class attempts" ON exam_attempts
  FOR SELECT USING (
    exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
  );

-- STUDENT_ANSWERS: Students manage own answers, teachers can view
CREATE POLICY "Students manage own answers" ON student_answers
  FOR ALL USING (
    attempt_id IN (SELECT id FROM exam_attempts WHERE student_id = auth.uid())
  );

CREATE POLICY "Teachers see class answers" ON student_answers
  FOR SELECT USING (
    attempt_id IN (
      SELECT ea.id FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE e.created_by = auth.uid()
    )
  );

-- EXAM_ANALYTICS: Teachers see analytics for own exams
CREATE POLICY "Teachers see own exam analytics" ON exam_analytics
  FOR SELECT USING (
    exam_id IN (SELECT id FROM exams WHERE created_by = auth.uid())
  );

CREATE POLICY "System can manage analytics" ON exam_analytics
  FOR ALL USING (true);

-- ANTI_CHEAT_LOGS: Teachers see logs for own exams
CREATE POLICY "Teachers see anti-cheat logs" ON anti_cheat_logs
  FOR SELECT USING (
    attempt_id IN (
      SELECT ea.id FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE e.created_by = auth.uid()
    )
  );

CREATE POLICY "System can insert anti-cheat logs" ON anti_cheat_logs
  FOR INSERT WITH CHECK (true);

-- ==============================================
-- 11. FUNCTIONS FOR COMMON QUERIES
-- ==============================================

-- Get exams available for a student
CREATE OR REPLACE FUNCTION get_available_exams(student_user_id UUID)
RETURNS TABLE (
  exam_id TEXT,
  title TEXT,
  duration INTEGER,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  attempts_taken INTEGER,
  max_attempts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.duration,
    e.start_time,
    e.end_time,
    COALESCE(COUNT(ea.id), 0)::INTEGER,
    e.max_attempts
  FROM exams e
  LEFT JOIN exam_attempts ea ON e.id = ea.exam_id AND ea.student_id = student_user_id
  WHERE e.is_published = true
    AND e.class_id IN (SELECT class_id FROM profiles WHERE id = student_user_id)
    AND NOW() BETWEEN e.start_time AND e.end_time
  GROUP BY e.id, e.title, e.duration, e.start_time, e.end_time, e.max_attempts
  HAVING COALESCE(COUNT(ea.id), 0) < e.max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get exam questions grouped by part (3 phần theo loại câu hỏi)
CREATE OR REPLACE FUNCTION get_exam_questions_by_part(exam_uuid TEXT)
RETURNS TABLE (
  part_number INTEGER,
  question_type TEXT,
  total_questions INTEGER,
  questions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    eq.part_number,
    eq.question_type,
    COUNT(*)::INTEGER,
    jsonb_agg(jsonb_build_object(
      'id', eq.id,
      'question_id', eq.question_id,
      'score', eq.score,
      'order_in_part', eq.order_in_part
    ) ORDER BY eq.order_in_part)
  FROM exam_questions eq
  WHERE eq.exam_id = exam_uuid
  GROUP BY eq.part_number, eq.question_type
  ORDER BY eq.part_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get exam results summary for teacher
CREATE OR REPLACE FUNCTION get_exam_results_summary(exam_uuid TEXT)
RETURNS TABLE (
  total_students INTEGER,
  completed INTEGER,
  in_progress INTEGER,
  avg_score DECIMAL,
  highest_score DECIMAL,
  lowest_score DECIMAL,
  flagged_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT ea.student_id)::INTEGER,
    COUNT(CASE WHEN ea.status = 'submitted' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN ea.status = 'in_progress' THEN 1 END)::INTEGER,
    AVG(ea.score),
    MAX(ea.score),
    MIN(ea.score),
    COUNT(CASE WHEN ea.is_flagged = true THEN 1 END)::INTEGER
  FROM exam_attempts ea
  WHERE ea.exam_id = exam_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- DONE! SCHEMA V2 UPDATED
-- ==============================================
-- Changes from V1:
-- 1. Added source_exam field to exams (dùng từ question-bank)
-- 2. Added question_type và part_number to exam_questions (chia 3 phần)
-- 3. Added anti-cheat settings to exams (block dev tools, tab switch)
-- 4. Added current_part, part_1/2/3_completed to exam_attempts (track progress)
-- 5. Added anti_cheat_logs table (ghi log hành vi nghi vấn)
-- 6. Added check_suspicious_activity trigger (tự động flag)
-- 7. Added get_exam_questions_by_part function (lấy câu hỏi theo phần)
-- 8. Updated get_exam_results_summary to include flagged_count
-- 
-- Next step: Run SEED_TEST_DATA.sql to create test users and exams
