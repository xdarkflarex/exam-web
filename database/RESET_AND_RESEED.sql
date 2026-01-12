-- ==============================================
-- RESET AND RESEED TEST DATA
-- Auto-link từ question-bank + tạo test data
-- ==============================================

-- ==============================================
-- 1. DELETE OLD TEST DATA (CLEANUP)
-- ==============================================
-- Xóa dữ liệu cũ để tái tạo
-- Sử dụng ON CONFLICT DO NOTHING để tránh lỗi duplicate key

-- Xóa theo thứ tự ngược lại (child → parent)
DELETE FROM anti_cheat_logs WHERE attempt_id IN (
  SELECT id FROM exam_attempts WHERE exam_id = 'exam-test-1'
);

DELETE FROM student_answers WHERE attempt_id IN (
  SELECT id FROM exam_attempts WHERE exam_id = 'exam-test-1'
);

DELETE FROM exam_attempts WHERE exam_id = 'exam-test-1';

DELETE FROM exam_analytics WHERE exam_id = 'exam-test-1';

DELETE FROM exam_questions WHERE exam_id = 'exam-test-1';

DELETE FROM exams WHERE id = 'exam-test-1';

-- Xóa student profiles trước (vì có foreign key tới classes)
DELETE FROM profiles WHERE email IN (
  'dmdtonlinejudge@gmail.com', 'duyennguyen1805123@gmail.com', 'xdarkflarex1904@gmail.com'
) AND role = 'student';

-- Xóa classes
DELETE FROM classes WHERE id IN ('12A1', '12A2');

-- Xóa teacher profile cuối cùng
DELETE FROM profiles WHERE email = 'minhrom1904@gmail.com' AND role = 'teacher';

-- ==============================================
-- 2. INSERT PROFILES (Test Users) - PHẢI TẠO TRƯỚC
-- ==============================================
-- Teacher profile (tạo trước để classes có thể reference)
INSERT INTO profiles (id, full_name, email, role, school)
VALUES 
  ('546e759b-be35-48e8-b611-86cd20690099', 'Đinh Xuân Minh', 'minhrom1904@gmail.com', 'teacher', 'THPT Lê Quý Đôn')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  school = EXCLUDED.school;

-- ==============================================
-- 3. INSERT CLASSES (SAU KHI CÓ TEACHER)
-- ==============================================
INSERT INTO classes (id, name, grade, teacher_id, student_count, school)
VALUES 
  ('12A1', 'Lớp 12A1', 12, '546e759b-be35-48e8-b611-86cd20690099', 3, 'THPT Lê Quý Đôn'),
  ('12A2', 'Lớp 12A2', 12, '546e759b-be35-48e8-b611-86cd20690099', 0, 'THPT Lê Quý Đôn')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  teacher_id = EXCLUDED.teacher_id,
  student_count = EXCLUDED.student_count;

-- ==============================================
-- 4. INSERT STUDENT PROFILES (SAU KHI CÓ CLASSES)
-- ==============================================
INSERT INTO profiles (id, full_name, email, role, class_id, school)
VALUES 
  ('cfa7ff94-96e6-4b86-8318-0b14a4e69830', 'Trần Văn A', 'dmdtonlinejudge@gmail.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('cbb12f64-6e10-4243-b5ec-ec37080bddee', 'Lê Thị B', 'duyennguyen1805123@gmail.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('6330a9c6-1881-4007-87e0-3a119e042f2d', 'Phạm Văn C', 'xdarkflarex1904@gmail.com', 'student', '12A1', 'THPT Lê Quý Đôn')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  class_id = EXCLUDED.class_id,
  school = EXCLUDED.school;

-- ==============================================
-- 5. INSERT TEST EXAMS
-- ==============================================
INSERT INTO exams (
  id, 
  title, 
  description, 
  source_exam,
  duration, 
  start_time, 
  end_time, 
  is_shuffle_questions,
  is_shuffle_answers,
  show_results_immediately,
  allow_dev_tools,
  allow_tab_switch,
  max_tab_switches,
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
    'Đề Thi Thử TN THPT - Bãi Cháy Lần 1',
    'Đề thi thử tốt nghiệp THPT môn Toán - Bãi Cháy Lần 1',
    'ĐỀ THI THỬ TỐT NGHIỆP THPT BÃI CHÁY LẦN 1 NĂM HỌC: 2025 - 2026 Môn: TOÁN',
    90,
    NOW(),
    NOW() + INTERVAL '365 days',
    false,
    false,
    true,
    false,
    false,
    999,
    5.0,
    10.0,
    '546e759b-be35-48e8-b611-86cd20690099',
    '12A1',
    true,
    'Toán 12',
    'Thi thử THPT'
  );

-- ==============================================
-- 6. AUTO-LINK EXAM QUESTIONS FROM QUESTION-BANK
-- ==============================================
-- Load TẤT CẢ câu hỏi từ source_exam
-- Cấu trúc mỗi đề: 12 MC + 4 TF + 6 SA = 22 câu

-- EXAM 1: Part 1 - Multiple Choice (12 câu, 0.25đ/câu = 3đ)
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
SELECT 
  'exam-test-1',
  id,
  question_type,
  1,
  ROW_NUMBER() OVER (ORDER BY id),
  0.25
FROM questions 
WHERE source_exam = 'ĐỀ THI THỬ TỐT NGHIỆP THPT BÃI CHÁY LẦN 1 NĂM HỌC: 2025 - 2026 Môn: TOÁN'
  AND question_type = 'multiple_choice';

-- EXAM 1: Part 2 - True/False (4 câu, 1đ/câu = 4đ)
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
SELECT 
  'exam-test-1',
  id,
  question_type,
  2,
  ROW_NUMBER() OVER (ORDER BY id),
  1.0
FROM questions 
WHERE source_exam = 'ĐỀ THI THỬ TỐT NGHIỆP THPT BÃI CHÁY LẦN 1 NĂM HỌC: 2025 - 2026 Môn: TOÁN'
  AND question_type = 'true_false';

-- EXAM 1: Part 3 - Short Answer (6 câu, 0.5đ/câu = 3đ)
INSERT INTO exam_questions (exam_id, question_id, question_type, part_number, order_in_part, score)
SELECT 
  'exam-test-1',
  id,
  question_type,
  3,
  ROW_NUMBER() OVER (ORDER BY id),
  0.5
FROM questions 
WHERE source_exam = 'ĐỀ THI THỬ TỐT NGHIỆP THPT BÃI CHÁY LẦN 1 NĂM HỌC: 2025 - 2026 Môn: TOÁN'
  AND question_type = 'short_answer';

-- ==============================================
-- 7. VERIFY DATA
-- ==============================================
-- Chạy các query sau để verify:

-- Check profiles
-- SELECT id, full_name, email, role FROM profiles;

-- Check exams
-- SELECT id, title, source_exam FROM exams;

-- Check exam questions (count by part)
-- SELECT 
--   exam_id, 
--   part_number, 
--   question_type, 
--   COUNT(*) as total_questions
-- FROM exam_questions
-- GROUP BY exam_id, part_number, question_type
-- ORDER BY exam_id, part_number;

-- Check exam attempts
-- SELECT id, exam_id, student_id, status, current_part FROM exam_attempts;

-- Check student answers
-- SELECT COUNT(*) as total_answers FROM student_answers WHERE attempt_id = 'attempt-1';

-- ==============================================
-- NOTES
-- ==============================================
-- 1. Thay thế tất cả UUID placeholders bằng UUID thực tế từ auth.users
-- 2. Script tự động lấy questions từ question-bank theo source_exam
-- 3. Chia câu hỏi thành 3 phần theo question_type:
--    - Part 1: multiple_choice
--    - Part 2: true_false
--    - Part 3: short_answer
-- 4. Trigger sẽ tự động tính điểm khi exam_attempts.status = 'submitted'
-- 5. Analytics sẽ tự động update khi có student_answers mới
-- 6. Để chạy lại, chỉ cần run script này - nó sẽ auto delete + reseed
