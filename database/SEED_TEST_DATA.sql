-- ==============================================
-- SEED TEST DATA FOR EXAM SYSTEM
-- Chạy sau khi đã chạy EXAM_SYSTEM_SCHEMA.sql
-- ==============================================

-- ==============================================
-- 1. CREATE TEST USERS (Manual - via Supabase Auth)
-- ==============================================
-- Bạn cần tạo users qua Supabase Dashboard > Authentication > Users
-- Hoặc dùng API signup
-- 
-- Test accounts to create:
-- 1. Teacher: teacher@test.com / password123
-- 2. Student 1: student1@test.com / password123
-- 3. Student 2: student2@test.com / password123
-- 4. Student 3: student3@test.com / password123

-- ==============================================
-- 2. INSERT PROFILES (Sau khi tạo users)
-- ==============================================
-- Thay thế UUID bằng UUID thực tế từ auth.users

-- Teacher profile
INSERT INTO profiles (id, full_name, email, role, school)
VALUES 
  ('TEACHER_UUID_HERE', 'Nguyễn Văn Giáo', 'teacher@test.com', 'teacher', 'THPT Lê Quý Đôn');

-- Student profiles
INSERT INTO profiles (id, full_name, email, role, class_id, school)
VALUES 
  ('STUDENT1_UUID_HERE', 'Trần Văn A', 'student1@test.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('STUDENT2_UUID_HERE', 'Lê Thị B', 'student2@test.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('STUDENT3_UUID_HERE', 'Phạm Văn C', 'student3@test.com', 'student', '12A1', 'THPT Lê Quý Đôn');

-- ==============================================
-- 3. INSERT CLASSES
-- ==============================================
INSERT INTO classes (id, name, grade, teacher_id, student_count, school)
VALUES 
  ('12A1', 'Lớp 12A1', 12, 'TEACHER_UUID_HERE', 3, 'THPT Lê Quý Đôn'),
  ('12A2', 'Lớp 12A2', 12, 'TEACHER_UUID_HERE', 0, 'THPT Lê Quý Đôn');

-- ==============================================
-- 4. INSERT TEST EXAMS
-- ==============================================
INSERT INTO exams (
  id, 
  title, 
  description, 
  duration, 
  start_time, 
  end_time, 
  is_shuffle_questions,
  is_shuffle_answers,
  show_results_immediately,
  passing_score,
  total_score,
  created_by, 
  class_id, 
  is_published,
  subject,
  exam_type
)
VALUES 
  (
    'exam-test-1',
    'Đề Thi Toán 12 - Học Kỳ 1',
    'Đề thi kiểm tra học kỳ 1 môn Toán lớp 12',
    90, -- 90 phút
    NOW() - INTERVAL '1 day', -- Bắt đầu từ 1 ngày trước
    NOW() + INTERVAL '7 days', -- Kết thúc sau 7 ngày
    false,
    false,
    true, -- Cho phép xem kết quả ngay
    5.0,
    10.0,
    'TEACHER_UUID_HERE',
    '12A1',
    true,
    'Toán 12',
    'Kiểm tra học kỳ'
  ),
  (
    'exam-test-2',
    'Đề Thi Thử THPT Quốc Gia 2026',
    'Đề thi thử THPT Quốc Gia môn Toán',
    90,
    NOW() + INTERVAL '1 day', -- Bắt đầu sau 1 ngày
    NOW() + INTERVAL '8 days',
    true, -- Trộn câu hỏi
    true, -- Trộn đáp án
    false, -- Không cho xem kết quả ngay
    5.0,
    10.0,
    'TEACHER_UUID_HERE',
    '12A1',
    true,
    'Toán 12',
    'Thi thử THPT'
  );

-- ==============================================
-- 5. INSERT EXAM QUESTIONS (3 PHẦN)
-- ==============================================
-- Exam 1: Đề Thi Toán 12 - Học Kỳ 1
-- Phần I: 7 câu trắc nghiệm 4 phương án (multiple_choice)
-- Phần II: 0 câu đúng/sai (true_false) - không có trong query
-- Phần III: 0 câu trả lời ngắn (short_answer) - không có trong query

-- PHẦN I: TRẮC NGHIỆM 4 PHƯƠNG ÁN (multiple_choice)
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
VALUES 
  ('exam-test-1', 'Q_1766496556427_WMFCTTB', 'multiple_choice', 1, 1, 0.25),
  ('exam-test-1', 'Q_1766496556483_VALGKRA', 'multiple_choice', 1, 2, 0.25),
  ('exam-test-1', 'Q_1766496556512_WO8BUNG', 'multiple_choice', 1, 3, 0.25),
  ('exam-test-1', 'Q_1766496556539_0ZLUTXQ', 'multiple_choice', 1, 4, 0.25),
  ('exam-test-1', 'Q_1766496556592_PQQMPHA', 'multiple_choice', 1, 5, 0.25),
  ('exam-test-1', 'Q_1766496556654_WSA2LVV', 'multiple_choice', 1, 6, 0.25),
  ('exam-test-1', 'Q_1766496556682_Z3KC1N8', 'multiple_choice', 1, 7, 0.25);

-- ==============================================
-- 6. INSERT TEST EXAM ATTEMPTS (Optional)
-- ==============================================
-- Tạo một vài bài làm mẫu để test

-- Student 1 làm exam 1 (đã nộp)
INSERT INTO exam_attempts (
  id,
  exam_id,
  student_id,
  start_time,
  submit_time,
  status,
  attempt_number
)
VALUES (
  'attempt-1',
  'exam-test-1',
  'STUDENT1_UUID_HERE',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '30 minutes',
  'submitted',
  1
);

-- Student 2 đang làm exam 1
INSERT INTO exam_attempts (
  id,
  exam_id,
  student_id,
  start_time,
  status,
  attempt_number
)
VALUES (
  'attempt-2',
  'exam-test-1',
  'STUDENT2_UUID_HERE',
  NOW() - INTERVAL '30 minutes',
  'in_progress',
  1
);

-- ==============================================
-- 7. INSERT SAMPLE ANSWERS (Optional)
-- ==============================================
-- Đáp án của student 1 cho exam 1 (Phần I: multiple_choice)

INSERT INTO student_answers (attempt_id, question_id, question_type, selected_answer, is_correct, score)
VALUES 
  ('attempt-1', 'Q_1766496556427_WMFCTTB', 'multiple_choice', 'A', true, 0.25),
  ('attempt-1', 'Q_1766496556483_VALGKRA', 'multiple_choice', 'B', true, 0.25),
  ('attempt-1', 'Q_1766496556512_WO8BUNG', 'multiple_choice', 'C', false, 0),
  ('attempt-1', 'Q_1766496556539_0ZLUTXQ', 'multiple_choice', 'A', true, 0.25),
  ('attempt-1', 'Q_1766496556592_PQQMPHA', 'multiple_choice', 'D', true, 0.25),
  ('attempt-1', 'Q_1766496556654_WSA2LVV', 'multiple_choice', 'B', true, 0.25),
  ('attempt-1', 'Q_1766496556682_Z3KC1N8', 'multiple_choice', 'A', true, 0.25);

-- ==============================================
-- 8. VERIFY DATA
-- ==============================================
-- Chạy các query sau để verify:

-- Check profiles
-- SELECT * FROM profiles;

-- Check classes
-- SELECT * FROM classes;

-- Check exams
-- SELECT * FROM exams;

-- Check exam questions
-- SELECT * FROM exam_questions WHERE exam_id = 'exam-test-1';

-- Check attempts
-- SELECT * FROM exam_attempts;

-- Check answers
-- SELECT * FROM student_answers WHERE attempt_id = 'attempt-1';

-- ==============================================
-- NOTES
-- ==============================================
-- 1. Thay thế tất cả UUID placeholders bằng UUID thực tế từ auth.users
-- 2. Thay thế question_id bằng ID thực tế từ bảng questions
-- 3. Trigger sẽ tự động tính điểm khi exam_attempts.status = 'submitted'
-- 4. Analytics sẽ tự động update khi có student_answers mới
