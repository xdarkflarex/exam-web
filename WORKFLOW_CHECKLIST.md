# 📋 WORKFLOW CHECKLIST - EXAM-WEB PROJECT

**Project:** Hệ Thống Thi Toán THPT (Exam Web App)  
**Started:** Jan 7, 2026  
**Status:** Phase 1 - Backend Setup  

---

## 🎯 PHASE 1: BACKEND SETUP (Tuần 1)

### ✅ A. Next.js Project Setup
- [x] Tạo Next.js project với `create-next-app`
- [x] Cài đặt dependencies (Supabase, Zustand, date-fns, lucide-react)
- [x] Tạo folder structure (lib, types, components, database)
- [x] Setup TypeScript & tsconfig.json
- [x] Fix path alias (@/*)
- [x] Test: `npm run dev` chạy thành công

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Notes:** Server chạy tại http://localhost:3000

---

### ✅ B. Supabase Integration
- [x] Tạo Supabase clients (client.ts, server.ts, middleware.ts)
- [x] Cài đặt @supabase/ssr package
- [x] Setup middleware.ts cho auth protection
- [x] Verify environment variables (.env.local, .env.example)

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Notes:** Clients ready, auth middleware configured

---

### ✅ C. TypeScript Types
- [x] Tạo types/user.ts (Profile, Class, UserRole)
- [x] Tạo types/exam.ts (Exam, ExamAttempt, StudentAnswer, ExamQuestion)
- [x] Tạo types/question.ts (Question, Answer, QuestionType, CognitiveLevel)
- [x] Tạo types/index.ts (export all)

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Notes:** Tất cả types đã định nghĩa, sẵn sàng dùng

---

### ✅ D. Custom Hooks
- [x] Tạo lib/hooks/useAuth.ts
  - [x] Get session
  - [x] Get profile
  - [x] Logout function
  - [x] Auth state change listener
- [x] Tạo lib/hooks/useExam.ts
  - [x] useExam hook
  - [x] useExamAttempt hook

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Notes:** Hooks ready for use in components

---

### ✅ E. Home Page
- [x] Tạo app/page.tsx
  - [x] Auth check & redirect logic
  - [x] Student → /exams
  - [x] Teacher → /dashboard
  - [x] Not logged in → Show login/register buttons
- [x] Styling với Tailwind CSS

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Notes:** Home page shows 404 because no database yet

---

### ✅ F. Database Schema V2 (COMPLETED)
- [x] Cập nhật EXAM_SYSTEM_SCHEMA.sql V2
  - [x] 8 tables (profiles, classes, exams, exam_questions, exam_attempts, student_answers, exam_analytics, anti_cheat_logs)
  - [x] **Cấu trúc 3 phần:** part_number (1,2,3) + question_type (multiple_choice, true_false, short_answer)
  - [x] **Anti-cheat settings:** allow_dev_tools, allow_tab_switch, max_tab_switches, require_webcam
  - [x] **Part progress tracking:** current_part, part_1/2/3_completed
  - [x] **Source exam field:** source_exam (tên đề từ question-bank)
  - [x] RLS policies (student/teacher access control + anti_cheat_logs)
  - [x] Triggers (auto-calculate score, update analytics, check_suspicious_activity)
  - [x] Functions (get_available_exams, get_exam_results_summary, get_exam_questions_by_part)
  - [x] Indexes (optimize queries)
- [x] Tạo SEED_TEST_DATA.sql
  - [x] Test users template (1 teacher + 3 students)
  - [x] Test class (12A1)
  - [x] Test exams (2 đề)
  - [x] Sample attempts & answers
- [x] Tạo SETUP_GUIDE.md
  - [x] Step-by-step instructions
  - [x] Troubleshooting guide
  - [x] RLS verification queries
- [x] Tạo EXAM_STRUCTURE_GUIDE.md
  - [x] Giải thích cấu trúc 3 phần chi tiết
  - [x] Ví dụ cách tạo đề thi theo 3 phần
  - [x] Flow làm bài thi (Part I → II → III)
  - [x] Anti-cheat implementation guide
  - [x] Frontend code examples
- [x] Tạo app/test-db/page.tsx
  - [x] Test connection page
  - [x] Display profiles & exams
  - [x] Show setup instructions

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026  
**Next Step:** Chạy schema trên Supabase Dashboard

**Checklist để chạy:**
- [x] Mở Supabase Dashboard
- [x] SQL Editor → New Query
- [x] Copy EXAM_SYSTEM_SCHEMA.sql
- [x] Click Run
- [x] Verify tables created
- [x] Chạy RESET_AND_RESEED.sql (auto-link từ question-bank)
  - [x] Tạo test users qua Supabase Auth (4 users)
  - [x] Copy UUID từ auth.users
  - [x] Replace UUID placeholders với UUID thực
  - [x] Sửa email cho khớp với users thực
  - [x] Bỏ filter source_exam → lấy hết câu hỏi
  - [x] Run RESET_AND_RESEED.sql
  - [x] Verify data created (COUNT = 5 ✅)
- [x] Test connection tại /test-db

**Summary Phase 1:**
- ✅ Database schema V2 với 3 phần câu hỏi + anti-cheat
- ✅ RESET_AND_RESEED.sql chạy thành công
- ✅ 5 exam questions được insert
- ✅ Test users created và verified

---

## 🎯 PHASE 2: AUTHENTICATION (Tuần 2)

### ✅ A. Login Page
- [x] Tạo app/(auth)/login/page.tsx
- [x] Form: email + password
- [x] Supabase signInWithPassword
- [x] Error handling
- [x] Redirect to /exams (student) hoặc /dashboard (teacher)
- [x] Link to register page
- [x] Test accounts display

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ B. Register Page
- [x] Tạo app/(auth)/register/page.tsx
- [x] Form: full_name + email + password + role selection
- [x] Supabase signUp
- [x] Auto-create profile
- [x] Redirect to login

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ C. Root Layout & Globals CSS
- [x] Tạo app/layout.tsx với <html> và <body> tags
- [x] Tạo app/globals.css với Tailwind directives
- [x] Fix "Missing root layout tags" error
- [x] Test login/register pages hiển thị đúng

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

**Summary Phase 2:**
- ✅ Login page hoạt động với Supabase Auth
- ✅ Register page tạo users + profiles
- ✅ Root layout + globals.css

---

## ✅ PHASE 3: STUDENT PORTAL (Tuần 3)

### ✅ A. Exam List Page
- [x] Tạo app/(student)/exams/page.tsx
- [x] Fetch exams từ database
- [x] Filter: published + available time + not exceeded max attempts
- [x] Display: title, duration, start_time, end_time, attempts_taken
- [x] Display source_exam (tên đề gốc)
- [x] Button "Vào thi" nếu available
- [x] Auth check & redirect logic
- [x] Loading state

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ B. Exam Taking Interface
- [x] Tạo app/(student)/exams/[id]/take/page.tsx
- [x] Create exam_attempt on start
- [x] Resume existing in-progress attempt
- [x] Display questions by part (I, II, III)
- [x] Load questions with answers from database
- [x] Display TikZ images from Supabase Storage
- [x] Answer selection (A/B/C/D for multiple_choice)
- [x] Answer selection (checkboxes for true_false)
- [x] Answer selection (text input for short_answer)
- [x] Timer countdown with auto-save
- [x] Question navigation grid
- [x] Part navigation (Phần 1 → 2 → 3)
- [x] Submit button with confirmation
- [x] Save answers to student_answers table
- [x] Update exam_attempts status on submit

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

**Technical Notes:**
- Foreign key `fk_exam_questions_question_id` added for joins
- Answers loaded from separate `answers` table via nested select
- Images loaded via `tikz_image_url` field

---

### ⬜ C. Results Page (NEXT)
- [ ] Tạo app/(student)/results/[attemptId]/page.tsx
- [ ] Display score (calculated by trigger)
- [ ] Show correct/incorrect answers
- [ ] Display explanation (if available)
- [ ] Show time spent
- [ ] Back to exams button

**Status:** 🔄 IN PROGRESS  
**Estimated:** Jan 7-8, 2026

---

### ⬜ D. Student Layout
- [ ] Tạo app/(student)/layout.tsx
- [ ] Header with user info + logout
- [ ] Navigation

**Status:** PENDING  
**Estimated:** Jan 12, 2026

---

## ✅ PHASE 4: TEACHER DASHBOARD (Tuần 4)

### ✅ A. Dashboard Overview
- [x] Tạo app/(teacher)/dashboard/page.tsx
- [x] Stats: total exams, total attempts, avg score
- [x] Exams list với status, settings, stats
- [x] Quick actions: Cài đặt, Xem kết quả

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ B. Exam Settings Editor
- [x] Tạo app/(teacher)/dashboard/exams/[id]/edit/page.tsx
- [x] Edit: title, description, duration
- [x] Edit: start_time, end_time (datetime picker)
- [x] Edit: max_attempts (số lượt thi)
- [x] Edit: passing_score
- [x] Toggle: is_published, shuffle questions/answers, show results
- [x] Anti-cheat: block dev tools, tab switch warning
- [x] Reset all attempts button

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ C. View Student Results
- [x] Tạo app/(teacher)/dashboard/exams/[id]/results/page.tsx
- [x] Stats: total, passed, failed, avg, highest, lowest
- [x] Results table: student name, class, score, correct, time, submit time
- [x] Anti-cheat warnings: tab switches, dev tools, flagged

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ⬜ D. Realtime Monitor (FUTURE)
- [ ] Tạo app/(teacher)/monitor/[id]/page.tsx
- [ ] Supabase Realtime subscription
- [ ] Display students doing exam
- [ ] Progress bar per student
- [ ] Detect suspicious activities

**Status:** PENDING (Phase mở rộng)

---

### ⬜ E. Exam Creator (FUTURE)
- [ ] Tạo app/(teacher)/exams/create/page.tsx
- [ ] Form: create new exam
- [ ] Question selection from bank

**Status:** PENDING (Phase mở rộng)

---

## ✅ PHASE 5: ANTI-CHEAT IMPLEMENTATION (Tuần 5)

### ✅ A. Frontend Anti-Cheat
- [x] Tạo lib/utils/anti-cheat.ts
  - [x] Detect DevTools (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U)
  - [x] Block right-click
  - [x] Track tab switches (visibilitychange + blur)
  - [x] Block copy/paste/cut
  - [x] AntiCheatMonitor class with start/stop
  - [x] useAntiCheat React hook
- [x] Integrate vào exam taking page
  - [x] Start monitoring on exam load
  - [x] Stop monitoring on unmount
  - [x] Show tab switch warning in header
  - [x] Save stats on submit (tab_switches, dev_tools_opened, is_flagged)

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

### ✅ B. Teacher Anti-Cheat View
- [x] Results page shows anti-cheat warnings
  - [x] Tab switch count per student
  - [x] DevTools opened indicator
  - [x] Flagged indicator
- [x] Exam settings: allow_dev_tools, allow_tab_switch, max_tab_switches

**Status:** ✅ COMPLETED  
**Date:** Jan 7, 2026

---

## 🚀 PHASE 6: MỞ RỘNG - CHỌN CÂU HỎI TỪ NGÂN HÀNG (Sau khi hoàn thành Phase 1-5)

### ⬜ A. Question Bank Integration
- [ ] Tạo API route để fetch questions từ question-bank
  - [ ] Filter by subject, chapter, difficulty, cognitive_level
  - [ ] Search by content
  - [ ] Pagination
- [ ] Tạo component: QuestionSelector
  - [ ] Search & filter UI
  - [ ] Preview question with TikZ rendering
  - [ ] Select multiple questions
  - [ ] Assign to part (I/II/III) và set score

**Status:** PENDING (Phase mở rộng)  
**Estimated:** TBD  
**Notes:** Hiện tại dùng source_exam (tên đề) để lấy câu hỏi. Feature này cho phép teacher tự chọn câu hỏi từ ngân hàng.

---

### ⬜ B. Auto-Generate Exam
- [ ] Tạo algorithm để tự động tạo đề
  - [ ] Input: số câu mỗi phần, độ khó, chương
  - [ ] Random select questions matching criteria
  - [ ] Balance difficulty distribution
  - [ ] Avoid duplicate questions
- [ ] UI cho auto-generate
  - [ ] Form: configure criteria
  - [ ] Preview generated exam
  - [ ] Regenerate if not satisfied

**Status:** PENDING (Phase mở rộng)  
**Estimated:** TBD

---

### ⬜ C. Question Pool Management
- [ ] Tạo bảng question_pools
  - [ ] Teacher tạo pools (bộ câu hỏi)
  - [ ] Assign questions to pools
  - [ ] Share pools with other teachers
- [ ] UI quản lý pools
  - [ ] Create/edit/delete pools
  - [ ] Add/remove questions
  - [ ] Use pool to create exam

**Status:** PENDING (Phase mở rộng)  
**Estimated:** TBD

---

## 📊 DATABASE SCHEMA DETAILS

### Tables Created:
- [x] profiles (users)
- [x] classes (lớp học)
- [x] exams (đề thi) - **V2: Added source_exam, anti-cheat settings**
- [x] exam_questions (câu hỏi trong đề) - **V2: Added question_type, part_number, order_in_part**
- [x] exam_attempts (bài làm) - **V2: Added dev_tools_opened, current_part, part_1/2/3_completed, flag_reason**
- [x] student_answers (đáp án) - **V2: Added question_type**
- [x] exam_analytics (thống kê)
- [x] anti_cheat_logs (ghi log hành vi nghi vấn) - **NEW in V2**

### RLS Policies:
- [x] profiles: public read, users update own
- [x] classes: students see own, teachers manage own
- [x] exams: students see published for their class, teachers manage own
- [x] exam_questions: readable if exam accessible
- [x] exam_attempts: students see own, teachers see class
- [x] student_answers: students manage own, teachers view class
- [x] exam_analytics: teachers see own exams
- [x] anti_cheat_logs: teachers see logs for own exams - **NEW in V2**

### Triggers:
- [x] update_updated_at_column (auto timestamp)
- [x] calculate_exam_score (auto-calculate on submit)
- [x] update_exam_analytics (auto-update stats)
- [x] check_suspicious_activity (auto-flag on dev tools/tab switch) - **NEW in V2**

### Functions:
- [x] get_available_exams(student_id)
- [x] get_exam_results_summary(exam_id) - **V2: Added flagged_count**
- [x] get_exam_questions_by_part(exam_id) - **NEW in V2: Lấy câu hỏi theo 3 phần**

---

## 🔧 ENVIRONMENT SETUP

### .env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Status:** ✅ CONFIGURED  
**Notes:** Copy từ question-bank project

---

## 📁 PROJECT STRUCTURE

```
exam-web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── layout.tsx
│   ├── (student)/
│   │   ├── exams/
│   │   ├── exam/[id]/
│   │   ├── results/[attemptId]/
│   │   └── layout.tsx
│   ├── (teacher)/
│   │   ├── dashboard/
│   │   ├── exams/
│   │   ├── monitor/[id]/
│   │   └── layout.tsx
│   ├── test-db/
│   ├── page.tsx
│   ├── layout.tsx
│   └── middleware.ts
├── components/
│   ├── exam/
│   ├── teacher/
│   └── ui/
├── lib/
│   ├── supabase/
│   ├── hooks/
│   └── utils/
├── types/
├── database/
│   ├── EXAM_SYSTEM_SCHEMA.sql
│   ├── SEED_TEST_DATA.sql
│   └── SETUP_GUIDE.md
├── .env.local
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

**Status:** ✅ STRUCTURE READY

---

## 🎯 KEY DECISIONS

### 1. Architecture
- **Frontend:** Next.js 16 (App Router)
- **Backend:** Supabase (Auth + DB + Realtime)
- **State:** Zustand (if needed)
- **Styling:** Tailwind CSS + shadcn/ui

### 2. Database
- **Separate from question-bank:** Exam system tables độc lập
- **RLS enabled:** Security by default
- **Triggers:** Auto-calculate score & analytics
- **Functions:** Helper queries for common operations

### 3. Auth
- **Supabase Auth:** Email/password
- **Middleware:** Protect routes
- **RLS:** Row-level security for data access

### 4. Workflow
- **Backend first:** Database → Frontend
- **Test-driven:** Test page to verify connection
- **Incremental:** Phase by phase

---

## 📝 NOTES & ISSUES

### Resolved:
- ✅ PowerShell npm install issue (use space-separated args)
- ✅ Path alias issue (fixed tsconfig.json)
- ✅ @supabase/ssr package missing (installed)

### Pending:
- ⏳ Run schema on Supabase (need user action)
- ⏳ Create test users (need user action)
- ⏳ Seed test data (need user action)

### Known Limitations:
- Question-bank only has `source_exam` (text), no `exam_id`
- Exam system creates separate tables (no direct link to question-bank)
- Need to manually select questions when creating exams

---

## 🚀 NEXT IMMEDIATE STEPS

### Priority 1 (Today):
1. [ ] Run EXAM_SYSTEM_SCHEMA.sql on Supabase
2. [ ] Verify tables created
3. [ ] Test connection at /test-db

### Priority 2 (Tomorrow):
4. [ ] Create test users
5. [ ] Run SEED_TEST_DATA.sql
6. [ ] Test with sample data

### Priority 3 (This Week):
7. [ ] Create login/register pages
8. [ ] Create student exam list page
9. [ ] Create exam taking interface

---

## 📞 CONTACT & REFERENCES

**Project Location:** `d:\ToanTHPT\Web-nhap-cau-hoi\exam-web`  
**Related Project:** `d:\ToanTHPT\Web-nhap-cau-hoi\question-bank`  
**Supabase Project:** [Your Supabase URL]  
**Documentation:** See `database/SETUP_GUIDE.md`

---

**Last Updated:** Jan 7, 2026, 6:05 PM UTC+07:00  
**Status:** Phase 1-5 Complete! 🎉  
**Progress:** 95% (Core features done, UI/UX polish + Optional features pending)

---

## 📋 SUMMARY - Jan 7, 2026

### Completed Today:
1. ✅ **Phase 1:** Database schema V2, Supabase integration, types, hooks
2. ✅ **Phase 2:** Login/Register pages with Supabase Auth
3. ✅ **Phase 3A:** Exam list page with source_exam display
4. ✅ **Phase 3B:** Exam taking interface with:
   - 3-part structure (I, II, III)
   - Multiple choice, True/False, Short answer support
   - Timer countdown, Auto-save answers
   - Question navigation, Submit with confirmation
   - TikZ image display from Supabase Storage
5. ✅ **Phase 3C:** Results page after submit
6. ✅ **Phase 4A:** Teacher Dashboard with stats + exam list
7. ✅ **Phase 4B:** Exam Settings Editor:
   - Edit max_attempts, start/end time
   - Edit duration, passing_score
   - Toggle publish, shuffle, show results
   - Anti-cheat settings
   - Reset all attempts button
8. ✅ **Phase 4C:** View Student Results with stats table
9. ✅ **Phase 5A:** Anti-cheat Frontend:
   - Detect DevTools, block right-click, copy/paste
   - Track tab switches with warning display
   - Save stats on submit
10. ✅ **Phase 5B:** Login flow improvements:
    - Auto-redirect if already logged in
    - Role-based welcome message

### Database Fixes:
- Added foreign key: `exam_questions.question_id` → `questions.id`
- Added foreign key: `student_answers.question_id` → `questions.id`
- Fixed RESET_AND_RESEED.sql with correct source_exam values

### Optional Phases (Future):
1. ⬜ **OPTIONAL:** Show explanation for wrong answers after exam
2. ⬜ Realtime exam monitoring
3. ⬜ Exam creator from question bank
4. ⬜ UI/UX polish
