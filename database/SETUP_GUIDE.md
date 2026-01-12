# 🗄️ HƯỚNG DẪN SETUP DATABASE TRÊN SUPABASE

## 📋 Bước 1: Truy cập Supabase Dashboard

1. Mở trình duyệt và truy cập: https://supabase.com/dashboard
2. Đăng nhập vào project của bạn
3. Chọn project (cùng project với question-bank)

## 🔧 Bước 2: Chạy Schema

### 2.1. Mở SQL Editor
1. Sidebar bên trái → Click **SQL Editor**
2. Click **New Query**

### 2.2. Copy & Run Schema
1. Mở file `EXAM_SYSTEM_SCHEMA.sql`
2. Copy **TOÀN BỘ** nội dung
3. Paste vào SQL Editor
4. Click **Run** (hoặc Ctrl+Enter)

**Kết quả mong đợi:**
```
Success. No rows returned
```

### 2.3. Verify Tables
1. Sidebar → Click **Table Editor**
2. Kiểm tra các tables đã được tạo:
   - ✅ `profiles`
   - ✅ `classes`
   - ✅ `exams`
   - ✅ `exam_questions`
   - ✅ `exam_attempts`
   - ✅ `student_answers`
   - ✅ `exam_analytics`

## 👥 Bước 3: Tạo Test Users

### 3.1. Tạo Users qua Dashboard
1. Sidebar → **Authentication** → **Users**
2. Click **Add user** → **Create new user**

**Tạo 4 users:**

**Teacher:**
- Email: `teacher@test.com`
- Password: `password123`
- Auto Confirm: ✅ (check)

**Students:**
- Email: `student1@test.com` / Password: `password123`
- Email: `student2@test.com` / Password: `password123`
- Email: `student3@test.com` / Password: `password123`

### 3.2. Lấy UUID của Users
1. Sau khi tạo xong, click vào từng user
2. Copy **UUID** (ví dụ: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
3. Lưu lại:
   ```
   Teacher UUID: ___________________________
   Student1 UUID: ___________________________
   Student2 UUID: ___________________________
   Student3 UUID: ___________________________
   ```

## 📝 Bước 4: Insert Profiles & Test Data

### 4.1. Mở SEED_TEST_DATA.sql
1. Mở file `SEED_TEST_DATA.sql`
2. **Thay thế** các placeholder:
   - `TEACHER_UUID_HERE` → UUID của teacher
   - `STUDENT1_UUID_HERE` → UUID của student1
   - `STUDENT2_UUID_HERE` → UUID của student2
   - `STUDENT3_UUID_HERE` → UUID của student3

### 4.2. Chạy Seed Data
1. SQL Editor → New Query
2. Copy nội dung `SEED_TEST_DATA.sql` (đã thay UUID)
3. **Chỉ chạy từng section một:**

**Section 2 - Profiles:**
```sql
INSERT INTO profiles (id, full_name, email, role, school)
VALUES 
  ('UUID_THỰC_TẾ', 'Nguyễn Văn Giáo', 'teacher@test.com', 'teacher', 'THPT Lê Quý Đôn');

INSERT INTO profiles (id, full_name, email, role, class_id, school)
VALUES 
  ('UUID_THỰC_TẾ', 'Trần Văn A', 'student1@test.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('UUID_THỰC_TẾ', 'Lê Thị B', 'student2@test.com', 'student', '12A1', 'THPT Lê Quý Đôn'),
  ('UUID_THỰC_TẾ', 'Phạm Văn C', 'student3@test.com', 'student', '12A1', 'THPT Lê Quý Đôn');
```

**Section 3 - Classes:**
```sql
INSERT INTO classes (id, name, grade, teacher_id, student_count, school)
VALUES 
  ('12A1', 'Lớp 12A1', 12, 'TEACHER_UUID', 3, 'THPT Lê Quý Đôn');
```

**Section 4 - Exams:**
```sql
INSERT INTO exams (id, title, description, duration, start_time, end_time, ...)
VALUES (...);
```

### 4.3. Verify Data
Chạy các query sau để kiểm tra:

```sql
-- Check profiles
SELECT * FROM profiles;

-- Check classes
SELECT * FROM classes;

-- Check exams
SELECT * FROM exams;
```

## ✅ Bước 5: Verify Connection từ Next.js

### 5.1. Test Connection
1. Mở terminal trong `exam-web`
2. Tạo file test:

```bash
# Windows PowerShell
New-Item -Path "app/test-db/page.tsx" -ItemType File -Force
```

3. Copy nội dung từ `TEST_CONNECTION.tsx` (file tôi sẽ tạo)

### 5.2. Chạy Test
1. Truy cập: http://localhost:3000/test-db
2. Kiểm tra kết quả:
   - ✅ Connection successful
   - ✅ Hiển thị danh sách profiles
   - ✅ Hiển thị danh sách exams

## 🎯 Bước 6: Test Authentication

### 6.1. Login Test
1. Truy cập: http://localhost:3000/login (sau khi tạo login page)
2. Login với:
   - Email: `student1@test.com`
   - Password: `password123`
3. Kiểm tra redirect đến `/exams`

### 6.2. Verify RLS
1. Login as student → Chỉ thấy exams của class mình
2. Login as teacher → Thấy tất cả exams mình tạo

## 🐛 Troubleshooting

### Lỗi: "relation does not exist"
- **Nguyên nhân:** Chưa chạy schema
- **Giải pháp:** Chạy lại `EXAM_SYSTEM_SCHEMA.sql`

### Lỗi: "duplicate key value violates unique constraint"
- **Nguyên nhân:** Data đã tồn tại
- **Giải pháp:** Xóa data cũ hoặc đổi ID

### Lỗi: "insert or update on table violates foreign key constraint"
- **Nguyên nhân:** UUID không tồn tại trong `auth.users`
- **Giải pháp:** Kiểm tra lại UUID đã copy đúng chưa

### Lỗi: "permission denied for table"
- **Nguyên nhân:** RLS đang bật
- **Giải pháp:** Chạy query với service role key hoặc tắt RLS tạm thời

## 📊 Kiểm tra RLS Policies

```sql
-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';

-- Test student access
SET request.jwt.claim.sub = 'STUDENT_UUID';
SELECT * FROM exams; -- Chỉ thấy exams của class

-- Test teacher access
SET request.jwt.claim.sub = 'TEACHER_UUID';
SELECT * FROM exams; -- Thấy tất cả exams mình tạo
```

## 🎉 Hoàn Tất!

Sau khi setup xong, bạn có:
- ✅ Database schema đầy đủ
- ✅ RLS policies bảo mật
- ✅ Test users (1 teacher + 3 students)
- ✅ Test class (12A1)
- ✅ Test exams (2 đề)
- ✅ Triggers tự động tính điểm
- ✅ Analytics tracking

## 🚀 Next Steps

1. Tạo login/register pages
2. Tạo student exam list page
3. Tạo exam taking interface
4. Tạo teacher dashboard

---

**Lưu ý:** Nếu gặp lỗi, hãy check:
1. Supabase project URL đúng chưa
2. API keys đúng chưa (.env.local)
3. Users đã được tạo chưa
4. UUID đã thay đúng chưa
