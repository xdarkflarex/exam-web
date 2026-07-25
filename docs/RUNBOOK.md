# Runbook phát triển và vận hành

## 1. Yêu cầu

- Windows PowerShell (các lệnh dưới đây) hoặc shell tương đương.
- Node.js 20+; audit này dùng Node 22.21.0, npm 10.9.4.
- Một Supabase project đã có schema tương thích. Repo chưa tự dựng được database trắng.
- npm là package manager chuẩn cho đến khi chủ dự án quyết định khác.

## 2. Cài đặt

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Không dùng `npm install` chỉ để chạy project nếu không chủ ý cập nhật lockfile. Không cập nhật `package-lock.json` và `pnpm-lock.yaml` cùng lúc.

## 3. Biến môi trường

| Biến | Nơi dùng | Bắt buộc |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase | Có |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server session client | Có |
| `SUPABASE_SERVICE_KEY` | Enrollment/account creation server-only | Có cho các flow đó |
| `NEXT_PUBLIC_SITE_URL` | OAuth callback origin chuẩn | Production |
| `RESEND_API_KEY` | Gửi OTP admin | Production nếu OTP bật |
| `EMAIL_FROM` | Sender OTP | Production nếu OTP bật |

Không đặt Gemini/DeepSeek/OpenAI key vào biến `NEXT_PUBLIC_*`. Pilot essay hiện không gọi AI bằng API, không cần key: giáo viên copy prompt ẩn danh và paste JSON thủ công. Nếu sau này thêm provider, secret phải server-only và tài liệu/privacy policy phải được cập nhật trước.

## 4. Lệnh phát triển

```powershell
npm.cmd run dev
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
npm.cmd run start
```

Baseline 2026-07-19:

- Typecheck pass.
- Lint fail: 113 error, 192 warning trên 85 file.
- Production build pass; Next.js 16 cảnh báo nên chuyển convention `middleware` sang `proxy` trong một thay đổi auth được kiểm thử riêng.
- Không có `test` script/test runner/CI.

Khi repo còn lint debt, luôn lint file sửa:

```powershell
npx.cmd eslint src/path/file.tsx
```

Không tắt rule hoặc thêm `any` để né lỗi. Ghi số lỗi trước/sau nếu file đã có debt.

## 5. AI index/context pack

```powershell
node scripts/ai-index.mjs
node scripts/ai-context.mjs --route /learn
node scripts/ai-context.mjs --table question_knowledge_links --depth 1
node scripts/ai-context.mjs --file src/middleware.ts
node scripts/ai-context.mjs --changed --max-bytes 400000
```

- Index và pack nằm trong `.ai-cache/`, không commit.
- `ai-context` mặc định làm mới index; dùng `--no-refresh` chỉ khi cần giữ snapshot. `--table` đưa migration/schema định nghĩa object lên trước các nơi gọi trong TypeScript.
- `ai/project.manifest.json` là metadata được review thủ công; cập nhật khi domain/access rule thay đổi.
- Script không đọc `.env`, `.next`, dependency, submodule hoặc cache tool ngoài.

## 6. Smoke test route

Chạy dev server rồi kiểm tra tối thiểu:

```powershell
curl.exe -I http://127.0.0.1:3000/
curl.exe -I http://127.0.0.1:3000/login
curl.exe -I http://127.0.0.1:3000/learn
curl.exe -I http://127.0.0.1:3000/admin
```

Kỳ vọng khi chưa đăng nhập:

- `/` và `/login`: không redirect sang login.
- `/learn`, `/admin` và các route học: redirect về `/login`.
- API phải trả 401/403/405 theo method/role, không chỉ dựa vào middleware.

Middleware gọi Supabase auth trước khi xử lý hầu hết route; nếu mạng/Supabase không truy cập được, request local có thể treo hoặc fail. Phân biệt lỗi app với lỗi kết nối dịch vụ.

## 7. Checklist theo loại thay đổi

### UI/page thông thường

1. Typecheck.
2. Lint file thay đổi.
3. Desktop + mobile, light + dark.
4. Trạng thái loading/empty/error.
5. Nội dung tiếng Việt và MathJax/TikZ nếu có.

### Route/layout/middleware

1. Build production.
2. Smoke public/auth/student/admin.
3. Test redirect loop, missing profile, đổi mật khẩu, OTP. Với đổi mật khẩu bắt buộc: direct PostgREST update `profiles.must_change_password=false` bằng JWT student phải bị từ chối; chỉ `POST /api/auth/change-password` sau khi Supabase Auth đổi mật khẩu thành công mới được clear cờ.
4. Test user role khác và URL trực tiếp.

### Exam/practice/homework

1. Ba question type cũ; với simulation essay kiểm tra thêm loại thứ tư `essay`, blank essay và nhiều essay.
2. Create/resume/reload/autosave/submit hai lần/hết giờ.
3. Không lộ answer key/lời giải trước policy.
4. Không giả mạo score/user/status từ client.
5. Mode filter đúng ở list, prepare, active banner, result, leaderboard.

### Database/RLS/API

1. Không sửa migration đã áp dụng.
2. Test trên project tạm.
3. 401 chưa auth, 403 sai role, cross-user/cross-class bị chặn.
4. Transaction rollback và idempotency.
5. Generate/update Database types sau schema change.

## 8. Pilot tự luận: staging và smoke test

`20260721_essay_assisted_grading.sql` và backfill cấu hình sáu câu essay legacy `20260723_essay_legacy_config_backfill.sql` đã được áp trên Primary Database ngày 2026-07-22. Hậu kiểm tương ứng đạt 20/20 và 8/8 dòng `must_be_zero=0`. Kết quả này xác nhận cấu trúc/dữ liệu được kiểm tra, chưa thay thế negative test bằng JWT/E2E thật. Candidate hardening 20260722 r4 vẫn đang review và chưa được áp. Không chạy `database/SUPABASE_SCHEMA.sql`.

### Hồ sơ migration essay đã áp

Không chạy lại `20260721_essay_assisted_grading.sql` hoặc `20260723_essay_legacy_config_backfill.sql` để “thử lại”. Giữ output hậu kiểm và backup ngày 2026-07-22 làm hồ sơ vận hành. Các query dưới đây chỉ đọc, chỉ dùng khi cần chẩn đoán/đối chiếu catalog; không đưa output chứa dữ liệu nhận dạng lên chat công khai.

Constraint role trên database live hiện chỉ cho `admin|student`. Không thêm `teacher` trong cutover hardening; role matrix và dữ liệu teacher phải được thiết kế/test riêng. Bước vận hành tiếp theo bắt đầu từ preflight chỉ đọc của 20260722, không quay lại migration essay đã commit.

Kiểm tra catalog tối thiểu khi cần:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('questions', 'exam_attempts', 'student_answers', 'question_grading_configs', 'essay_grading_reviews')
order by table_name, ordinal_position;

select proname
from pg_proc
where proname in ('create_essay_question', 'submit_exam_attempt', 'review_essay_answer');
```

### Negative tests bắt buộc

- Chưa auth không gọi được ba RPC.
- Student không tạo essay config, không review và không sửa trực tiếp `score`, `is_correct`, `grading_status` hoặc tổng điểm simulation.
- Student A không submit attempt của student B; practice attempt bị `UNSUPPORTED_EXAM_MODE`.
- Trên Primary hiện tại, exact admin mới là actor staff có role hợp lệ. Chỉ chạy case teacher sai/đúng lớp sau khi role matrix và fixture teacher được phê duyệt; không nới constraint chỉ để chạy test.
- JSON AI sai `grading_ref`, rubric version, criterion, confidence hoặc giới hạn điểm bị client parser/RPC từ chối.
- Submit lần hai idempotent; refresh khi pending không tạo answer/review trùng.

### Smoke workflow thủ công

1. Admin vào `/admin/questions/essay/new`, tạo một câu với rubric có tổng bằng điểm tối đa. Chỉ smoke bằng teacher khi role matrix/live fixture teacher đã được phê duyệt.
2. Tạo source-based exam ở `/admin/exams/create`; chọn `simulation`. Xác nhận `practice` bị chặn nếu source có essay.
3. Student làm đủ bốn loại câu, nhập essay văn bản/LaTeX và submit.
4. Xác nhận network simulation không có `answers.is_correct`, `solution` hoặc đáp án short-answer. Dùng session student thử query trực tiếp `answers.is_correct`, đáp án short-answer và `questions.solution`; nếu database runtime còn cho đọc thì dừng rollout và sửa GRANT/RLS. Gói chấm không được có profile/email/lớp; result hiện “Đang chờ chấm tự luận” và chưa có điểm tổng.
5. Admin results chọn “Duyệt chấm”, mở attempt, copy gói chấm và kiểm tra không có định danh. Nếu bài tự chứa PII, loại bỏ trước khi gửi AI ngoài.
6. Dán một JSON `essay-grade-result.v1`; kiểm tra parser, sửa điểm/feedback và nhấn duyệt.
7. Student refresh: feedback cuối xuất hiện, `pending_grading_count=0`, `grading_status='completed'`, điểm thang 10 khớp tổng điểm thô.
8. Lặp với blank essay, hai essay, JSON `needs_human_review` và cập nhật một điểm đã duyệt.

Sau smoke, chạy typecheck, targeted lint, build và browser QA desktop/mobile, light/dark. Chi tiết state/JSON/privacy ở [`ESSAY_GRADING.md`](ESSAY_GRADING.md).

### Cutover khi không có Supabase Branching

Đây là cutover bảo trì, không phải zero-downtime. `20260721` và `20260723` đã commit trên Primary ngày 2026-07-22 và **không nằm trong danh sách cần chạy lại**. Không cho học sinh làm bài trong toàn bộ phần cutover còn lại.

1. Chờ review candidate `20260722_runtime_security_hardening.sql` r4 hoàn tất. Backup database/project, ghi lại thời điểm khôi phục và đóng website hoặc chặn bắt đầu/nộp bài mới. Lần chạy r3 ngày 2026-07-24 đã rollback toàn bộ vì Supabase từ chối lưu custom GUC trong `ALTER FUNCTION`; r4 dùng reset transaction-local ở entry/success/exception.
2. Chạy [`../supabase/preflight/20260722_runtime_security_hardening_preflight.sql`](../supabase/preflight/20260722_runtime_security_hardening_preflight.sql) **từng block được đánh số**. Quan hệ/cột/unique key phải tương thích và mọi invariant `must_be_zero` phải bằng 0. Block RLS parent là inventory vì r4 sẽ enable/rebuild policy trong cùng transaction; `rls_enabled=false` tự nó không đủ kết luận pass/fail, nhưng thiếu bảng, trust anchor sai, policy/grant không hiểu rõ, owner question mồ côi, trọng số liên kết không dương hoặc dữ liệu owner/class bất hợp lệ đều là blocker. Review thủ công `classes`, `exams`, `homeworks`, assignments, recipients và `site_settings`; inventory legacy RPC phải được lưu lại và mọi callable legacy sẽ phải về 0 ở postflight. Constraint live chỉ cho `admin|student`; không tự nới role trong cutover này.
   - Snapshot live ngày 2026-07-24 xác nhận đúng một đề legacy `exams.exam_mode='homework'` đang public nhưng không có attempt/answer, cùng đúng một attempt simulation `in_progress` của đề chưa publish và không có answer. Chủ dự án đã xác nhận xóa cả hai để dựng lại sau. Bản không ghi dữ liệu bền vững [`../supabase/repair/20260723_runtime_security_hardening_blocker_preview.sql`](../supabase/repair/20260723_runtime_security_hardening_blocker_preview.sql) vẫn là bước đối chiếu trước cleanup; block 6 đã trả cả ba giá trị bằng 0.
   - Sau backup và khi toàn bộ website đang maintenance, chạy [`../supabase/repair/20260723_runtime_security_hardening_blocker_cleanup.sql`](../supabase/repair/20260723_runtime_security_hardening_blocker_cleanup.sql). File đã pin sẵn ba ID live đã xác minh, yêu cầu đề legacy vẫn là `homework` public, đề đó vẫn không có attempt, attempt nháp vẫn thuộc đúng đề simulation chưa publish và vẫn có 0 answer. Script kiểm tra allowlist FK và DELETE trigger trên toàn bộ relation bị xóa. Nó có thể xóa `exam_questions`, `assignment_knowledge_targets`, `exam_analytics`, `exam_assignments`, cùng attempt nháp và log/feedback liên quan; không xóa row dùng chung trong `questions`/`answers`.
   - Cleanup không phải lệnh bypass. Chỉ khi transaction báo `COMMIT` thành công và ba output cuối đều `must_be_zero=0` mới chạy lại **toàn bộ** preflight; không bỏ qua các gate còn lại.
3. Chỉ khi review r4 và bước 2 đạt, chạy toàn bộ [`../supabase/migrations/20260722_runtime_security_hardening.sql`](../supabase/migrations/20260722_runtime_security_hardening.sql) trong một lần. Migration này khóa RLS/grant cũ, thu hồi RPC legacy và thêm RPC mà source mới cần.
4. Deploy **đúng source cùng phiên bản** ngay sau khi migration commit. Không mở lại website giữa bước 3 và 4: source cũ không tương thích với RLS mới, còn source mới phụ thuộc RPC mới.
5. Chạy toàn bộ [`../supabase/preflight/20260722_runtime_security_hardening_postflight.sql`](../supabase/preflight/20260722_runtime_security_hardening_postflight.sql). Final structural gate phải trả toàn bộ `must_be_zero=0`.
6. Test bằng session/JWT thật của anon, student basic/full và admin. Chỉ test teacher đúng/sai lớp sau khi có role matrix và fixture teacher hợp lệ; không nới constraint live để tạo đường tắt cho cutover.
7. Smoke simulation, practice, homework, result, leaderboard, bookmark và complete-profile; chỉ mở lại website khi mọi kiểm tra đạt.

Nếu bước 3 đã commit nhưng app chưa thể chạy, giữ maintenance và dùng [`../supabase/rollback/20260722_runtime_security_hardening_lockdown.sql`](../supabase/rollback/20260722_runtime_security_hardening_lockdown.sql) để fail-closed trong lúc sửa hoặc restore backup. File này cố ý **không** phục hồi policy rộng/insecure trước đó.

Không drop constraint/type essay khi đã có dữ liệu phụ thuộc. Không chạy lại migration đã commit để “thử lại”; tạo forward fix mới hoặc restore backup đã kiểm chứng.

## 9. Database troubleshooting

Không chạy các setup guide cũ. Trước khi debug UI, xác nhận:

- Bảng/cột thực tế tồn tại.
- Migration đã áp đúng thứ tự.
- RLS policy khớp role/owner.
- Query dùng `student_id` hay `user_id`, `duration` hay `time_limit`, status `submitted` hay `completed`.

Tìm call-site legacy:

```powershell
rg -n "status.*completed|\.eq\('user_id'|time_limit|classes.*description" src
rg -n "theory_mastery|knowledge_block_mastery|process_mastery" src
```

Nếu `tsc` báo lỗi trong `.next/dev/types/**`, dừng dev server, xóa đúng thư mục `.next` rồi chạy lại trước khi kết luận source hỏng.

## 10. MCP Supabase

`mcp.json` là công cụ đặc quyền và có thể chạy package qua `npx -y`. Trước khi dùng:

1. Xác minh package chính chủ và pin version.
2. Dùng database role chỉ đọc khi audit.
3. Không truyền service role/database password qua chat/log.
4. Không cho AI tự chạy migration/destructive SQL.
5. Tắt/revoke credential sau phiên nếu là credential tạm.

## 11. Deploy checklist

- `npm ci`, typecheck, lint policy được chấp nhận, build pass.
- Env production đủ; service key không nằm trong bundle/client.
- Supabase redirect URL và `NEXT_PUBLIC_SITE_URL` đúng domain.
- Resend sender/domain đã xác minh nếu OTP bật.
- RLS negative tests pass.
- Migration có backup, preflight, verify và rollback.
- Không deploy pilot essay/hardening trước khi preflight, RLS/trigger/RPC negative tests và teacher-review smoke pass. Sau `20260722`, practice và homework chấm ở RPC server; trước khi migration đó chạy, database live vẫn có thể mang baseline cũ.
- Không deploy `.env`, `.ai-cache`, `.next`, tool index hoặc dữ liệu học sinh.
- Smoke landing, login, một route student, một route admin và các API bảo mật sau deploy.
