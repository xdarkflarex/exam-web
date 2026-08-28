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
| `OCR_PROVIDER`, `OCR_API_KEY`, `OCR_MODEL` | OCR ảnh tự luận, server-only | Không; để trống thì pipeline tắt |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Chấm tự luận theo rubric, server-only | Không; để trống thì pipeline tắt |
| `ESSAY_AI_ENABLED`, `ESSAY_AI_AUTO_FINALIZE` | Hai kill-switch tách rời của pipeline chấm AI | Không; mặc định `false` |
| `ESSAY_AI_CONFIDENCE_MIN`, `ESSAY_AI_MONTHLY_COST_CAP` | Ngưỡng auto-chốt và trần chi phí | Không; thiếu thì fail-closed |
| `ESSAY_AI_OVERRIDE_MIN_COMPARED`, `ESSAY_AI_OVERRIDE_MAX_CHANGED_RATE`, `ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE` | Ngưỡng của kill-switch tự động theo mức chấm đè | Không; thiếu hoặc sai định dạng thì dùng mặc định thận trọng (20 / 0.3 / 0.05) |
| `CRON_SECRET` | Bearer token cho `POST /api/essay-ai/grade-queue` | Có, nếu muốn chạy worker; thiếu thì route trả 503 |

Không đặt Gemini/DeepSeek/OpenAI key vào biến `NEXT_PUBLIC_*`. Tiền tố đó nhúng giá trị vào bundle trình duyệt, tức là công khai key. Key nào từng chạy với tiền tố đó thì coi như đã lộ — **revoke và cấp lại**, đổi tên biến là không đủ.

Trạng thái pipeline chấm tự động ngày 2026-08-04: đã đủ đường đi đầu-cuối. `src/lib/essay-ai/` có lớp logic thuần và worker (`worker.ts`); `POST /api/essay-ai/grade-queue` là điểm gọi; `/admin/essay-ai` là trang theo dõi chi phí và tỷ lệ chấm đè. Migration `20260804_essay_ai_auto_grading.sql` đã áp; `20260805_essay_ai_usage.sql` **chưa áp** — thiếu nó thì worker không ghi được nhật ký chi phí và dashboard trả 503. Xem mục 8 để nạp và vận hành.

Trạng thái thang điểm ngày 2026-08-05: source đã chuyển sang thang Bộ GD&ĐT cho **đề thi thử** (`src/lib/exam/scoring.ts` + ba trang cấu hình điểm), và migration `20260806_moet_scoring_scale.sql` **đã áp** — postflight 30/30 dòng `must_be_zero = 0`, cột `exams.scoring_profile` và hàm `moet_true_false_score` đều tồn tại, trang tạo đề hết đứt. Chuỗi gọi cũng đã xác minh đủ: wrapper → `_trusted_internal` → hàm bậc thang, không còn tàn dư công thức tuyến tính, và bảng giá trị bậc thang được **gọi thật** ra đúng `0 / 0,1 / 0,25 / 0,5 / 1,0`. Phần chưa phủ là cách đếm số ý đúng bên trong vòng lặp plpgsql — chỉ phép thử end-to-end (bước 6 mục 8) mới đóng được, rủi ro thấp và **chưa chạy**. Bước 5 (rà đề học kì bị backfill nâng nhầm lên `moet_standard`) cũng chưa làm. Đề thi học kì, ôn tập và bài tập về nhà không dùng thang Bộ theo thiết kế; quy trình nạp ở mục 8, thang điểm và phạm vi theo loại đề ở [`SCORING.md`](SCORING.md).

## 4. Lệnh phát triển

```powershell
npm.cmd run dev
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
npm.cmd run start
npm.cmd test
npm.cmd run tikz:svg -- --chapters "D:/ToanTHPT/LATEX/HethongtrithucToanTHPT"
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

### RAG semantic cục bộ (tùy chọn, ưu tiên khi yêu cầu rộng)

RAG này chỉ hỗ trợ Codex tìm file liên quan; không phải tính năng AI của website. Nó dùng Ollama trên chính máy, lưu vector tại `.ai-cache/rag/` và không gửi source/code sang dịch vụ bên ngoài.

```powershell
# Cài Ollama một lần theo hướng dẫn chính thức, sau đó:
ollama pull nomic-embed-text
node scripts/ai-rag.mjs doctor
node scripts/ai-rag.mjs index
node scripts/ai-rag.mjs query "RLS homework teacher" --top 6 --max-bytes 60000
```

- RAG chỉ trả excerpt có đường dẫn và dòng, dùng để chọn seed. Bước tiếp theo vẫn là `node scripts/ai-context.mjs --file <seed> --max-bytes 120000` để lấy dependency/data neighborhood có kiểm soát.
- `index` tái dùng embedding của chunk không đổi; chỉ chunk thay đổi mới gọi Ollama. Nếu đổi embedding model, chạy lại `index` với đúng `--model`.
- Endpoint bị giới hạn ở `127.0.0.1`, `localhost` hoặc `::1`; không cấu hình endpoint cloud. Không tự cài Ollama hoặc tự tải model trong workflow.
- Nếu Ollama chưa chạy/model chưa có, `doctor` báo lệnh cần chạy. Đây là optional fallback, không chặn `ai-context` hiện có.

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

**Chạy SQL bằng gì.** Mọi file trong `supabase/` chạy được bằng Supabase SQL Editor (dán trọn file, một lần) hoặc `psql`. Đừng dùng meta-command của `psql` (`\echo`, `\i`, `\d`) trong file mới — Editor không hiểu và báo lỗi syntax ngay dòng đó; dùng `SELECT 'tiêu đề' AS muc;` để in mốc. Tương tự, đừng để kết luận quan trọng chỉ nằm trong `RAISE NOTICE`: Editor không hiện notice, nên phải lặp lại kết luận thành một dòng `SELECT` mới thấy được. Preflight/rollback của `20260806` từng vi phạm cả hai điều này và đã sửa ngày 2026-08-05.

`20260721_essay_assisted_grading.sql` và backfill cấu hình sáu câu essay legacy `20260723_essay_legacy_config_backfill.sql` đã được áp trên Primary Database ngày 2026-07-22. Hậu kiểm tương ứng đạt 20/20 và 8/8 dòng `must_be_zero=0`. Kết quả này xác nhận cấu trúc/dữ liệu được kiểm tra, chưa thay thế negative test bằng JWT/E2E thật. Hardening `20260722_runtime_security_hardening.sql` **cũng đã được áp** — xác minh live ngày 2026-08-06 bằng `to_regprocedure`: `submit_exam_attempt_trusted_internal`, `can_edit_homework_question_links` và `get_my_safe_bookmarks` đều tồn tại, và cả ba chỉ được định nghĩa trong file đó. Phần còn thiếu là JWT negative test và E2E, không phải migration. Không chạy `database/SUPABASE_SCHEMA.sql`.

### Hồ sơ migration essay đã áp

Không chạy lại `20260721_essay_assisted_grading.sql` hoặc `20260723_essay_legacy_config_backfill.sql` để “thử lại”. Giữ output hậu kiểm và backup ngày 2026-07-22 làm hồ sơ vận hành. Các query dưới đây chỉ đọc, chỉ dùng khi cần chẩn đoán/đối chiếu catalog; không đưa output chứa dữ liệu nhận dạng lên chat công khai.

Constraint role trên database live hiện chỉ cho `admin|student`. Không thêm `teacher` trong cutover hardening; role matrix và dữ liệu teacher phải được thiết kế/test riêng. Mục cutover 20260722 bên dưới **giữ lại làm hồ sơ**: migration đó đã áp, đừng chạy lại; đọc nó khi cần hiểu trạng thái database live chứ không phải để thực hiện.

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
2. Tạo đề ở `/admin/exams/create`: lọc theo chương/chuyên đề, tích chọn câu, chọn `simulation`. Xác nhận `practice` bị chặn nếu tập câu đã chọn có essay.
3. Student làm đủ bốn loại câu, nhập essay văn bản/LaTeX và submit.
4. Xác nhận network simulation không có `answers.is_correct`, `solution` hoặc đáp án short-answer. Dùng session student thử query trực tiếp `answers.is_correct`, đáp án short-answer và `questions.solution`; nếu database runtime còn cho đọc thì dừng rollout và sửa GRANT/RLS. Gói chấm không được có profile/email/lớp; result hiện “Đang chờ chấm tự luận” và chưa có điểm tổng.
5. Admin results chọn “Duyệt chấm”, mở attempt, copy gói chấm và kiểm tra không có định danh. Nếu bài tự chứa PII, loại bỏ trước khi gửi AI ngoài.
6. Dán một JSON `essay-grade-result.v1`; kiểm tra parser, sửa điểm/feedback và nhấn duyệt.
7. Student refresh: feedback cuối xuất hiện, `pending_grading_count=0`, `grading_status='completed'`, điểm thang 10 khớp tổng điểm thô.
8. Lặp với blank essay, hai essay, JSON `needs_human_review` và cập nhật một điểm đã duyệt.

Sau smoke, chạy typecheck, targeted lint, build và browser QA desktop/mobile, light/dark. Chi tiết state/JSON/privacy ở [`ESSAY_GRADING.md`](ESSAY_GRADING.md).

### Cutover 20260722 — hồ sơ, đã hoàn tất

> **Đã áp xong.** `20260722_runtime_security_hardening.sql` đã có trên Primary (xác minh 2026-08-06, xem mục 8 đầu). Các bước dưới đây là **hồ sơ lịch sử**, không phải việc cần làm. Đừng chạy lại migration hay repair script; muốn sửa gì thì tạo migration forward mới.

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

### Nạp migration AI tự chấm tự luận (20260804)

`20260804_essay_ai_auto_grading.sql` **không** phụ thuộc cutover 20260722 ở trên; nó chỉ cần 20260721 (đã live từ 2026-07-22). Vì vậy chạy được ngay mà không phải chờ hardening.

Migration này **không tự bật tính năng**. Nó chỉ tạo đường ghi điểm; việc gọi RPC do biến môi trường `ESSAY_AI_ENABLED`/`ESSAY_AI_AUTO_FINALIZE` điều khiển. Nạp xong, hệ thống chạy y như cũ cho tới khi bạn bật cờ.

Thứ tự:

1. Backup database và ghi lại thời điểm khôi phục.
2. Chạy [`../supabase/preflight/20260804_essay_ai_auto_grading_preflight.sql`](../supabase/preflight/20260804_essay_ai_auto_grading_preflight.sql). Mọi `must_be_zero` phải bằng 0. Ghi lại số bài đang `pending_review` để đối chiếu sau.
3. Chạy toàn bộ [`../supabase/migrations/20260804_essay_ai_auto_grading.sql`](../supabase/migrations/20260804_essay_ai_auto_grading.sql) trong một lần.
4. Chạy [`../supabase/preflight/20260804_essay_ai_auto_grading_postflight.sql`](../supabase/preflight/20260804_essay_ai_auto_grading_postflight.sql). Đặc biệt chú ý dòng `authenticated_can_call_ai_rpc`: khác 0 nghĩa là học sinh tự chấm điểm được, phải thu hồi quyền ngay.
5. Làm sáu test hành vi A–F ghi ở cuối file postflight. Bốn test quan trọng nhất: student gọi RPC phải bị từ chối; gọi hai lần cùng payload phải idempotent; giáo viên chấm đè lên điểm AI phải thành công; AI không được ghi đè bài giáo viên đã duyệt.

Chỉ sau khi cả 5 bước đạt mới đặt `ESSAY_AI_ENABLED=true`. `ESSAY_AI_AUTO_FINALIZE=true` đã bật ngày 2026-08-06 theo quyết định chủ dự án — cờ đó là thứ khiến điểm máy hiện ra với học sinh. Nó **không** tự chốt bài nào cho tới khi có 20 bài AI chấm được giáo viên duyệt lại; cổng `override-guard.ts` giữ mọi bài ở `pending_review` trước mốc đó.

Gỡ tính năng: đặt `ESSAY_AI_AUTO_FINALIZE=false` rồi restart là đủ để dừng ngay, không mất dữ liệu. Chỉ chạy [`../supabase/rollback/20260804_essay_ai_auto_grading_rollback.sql`](../supabase/rollback/20260804_essay_ai_auto_grading_rollback.sql) khi cần gỡ hẳn cấu trúc; file đó đưa mọi điểm AI về trạng thái chờ chấm, tức là học sinh đang thấy điểm sẽ mất điểm — báo cho họ trước.

### Nạp migration nhật ký chi phí AI (20260805)

`20260805_essay_ai_usage.sql` tạo bảng `essay_ai_usage` và hàm `essay_ai_month_to_date_cost()`. Thuần thêm mới, không `CREATE OR REPLACE` hàm nào, nên **không phụ thuộc cutover 20260722**.

Bắt buộc trước khi chạy worker: worker insert một dòng usage cho mỗi lượt gọi provider (kể cả lượt lỗi), và đó là nguồn duy nhất cho trần chi phí `ESSAY_AI_MONTHLY_COST_CAP`. Thiếu bảng thì cap đếm 0 và dashboard `/admin/essay-ai` trả 503.

1. [`../supabase/preflight/20260805_essay_ai_usage_preflight.sql`](../supabase/preflight/20260805_essay_ai_usage_preflight.sql) — mọi `must_be_zero` phải bằng 0.
2. [`../supabase/migrations/20260805_essay_ai_usage.sql`](../supabase/migrations/20260805_essay_ai_usage.sql) chạy một lần.
3. [`../supabase/preflight/20260805_essay_ai_usage_postflight.sql`](../supabase/preflight/20260805_essay_ai_usage_postflight.sql) — chú ý dòng kiểm quyền: `anon`/`authenticated` phải không đọc được bảng này. Nó chứa `ai_score` gắn với `student_answer_id`, học sinh đọc được là thấy điểm trước khi công bố.

Rollback: [`../supabase/rollback/20260805_essay_ai_usage_rollback.sql`](../supabase/rollback/20260805_essay_ai_usage_rollback.sql). Nó xoá nhật ký chi phí, không xoá điểm.

### Nạp migration thang điểm Bộ GD&ĐT (20260806)

`20260806_moet_scoring_scale.sql` đưa cách chấm **đề thi thử** về thang chính thức: trắc nghiệm **0,25**, Đúng/Sai **1,0**, trả lời ngắn **0,5**, tự luận bằng **tổng thang điểm rubric**. Bậc thang Đúng/Sai (**1,0 / 0,5 / 0,25 / 0,1 / 0** theo số ý đúng) áp cho **mọi** loại đề. Nền tảng và lý do đầy đủ ở [`SCORING.md`](SCORING.md) — đọc trước khi chạy, đặc biệt mục "Thang Bộ áp cho loại đề nào".

Migration này **có sửa dữ liệu** (thêm cột `exams.scoring_profile`, nâng đề `exam_mode = 'simulation'` hiện có lên `moet_standard`, backfill `exam_questions.score` và `exams.total_score`), khác với 20260804/20260805 chỉ thêm cấu trúc. Nó phụ thuộc `20260721` **và** `20260722`, cả hai đã live.

**Backfill chỉ chạm đề `moet_standard`.** Đề ôn tập giữ `custom` và giữ nguyên trọng số — trọng số 1 mỗi câu của chúng là một ma trận điểm hợp lệ, ghi đè nó là tự ý đổi cách chấm của giáo viên. Sau migration, đề thi học kì mới cũng là `simulation` + `custom`, nên **không được suy hồ sơ điểm từ `exam_mode`** nữa; câu `UPDATE` trong migration là lần duy nhất hai cột này được nối với nhau, dành cho dữ liệu tạo trước khi có cột.

Điều dễ làm sai nhất: `20260722:1195-1205` RENAME `submit_exam_attempt` thành `submit_exam_attempt_trusted_internal` rồi bọc lại. Thân hàm chấm thi thử đang chạy là hàm `_trusted_internal`, nên `20260806` `CREATE OR REPLACE` đúng hàm đó và **không chạm** wrapper. Sửa wrapper là mất gating công bố điểm.

Thứ tự:

1. Backup database và ghi lại thời điểm khôi phục. Chặn nộp bài trong lúc chạy — backfill đổi `exam_questions.score` của đề đang dùng, một attempt nộp giữa lúc migration chạy sẽ lấy trọng số nửa cũ nửa mới.
2. Chạy [`../supabase/preflight/20260806_moet_scoring_scale_preflight.sql`](../supabase/preflight/20260806_moet_scoring_scale_preflight.sql). Mọi `must_be_zero` phải bằng 0. Ghi lại số đếm `exam_questions` theo `question_type` và `score` hiện tại — đó là số để đối chiếu ở bước 4, và cũng là số cần khi phải rollback.
3. Chạy toàn bộ [`../supabase/migrations/20260806_moet_scoring_scale.sql`](../supabase/migrations/20260806_moet_scoring_scale.sql) trong một lần.
4. Chạy [`../supabase/preflight/20260806_moet_scoring_scale_postflight.sql`](../supabase/preflight/20260806_moet_scoring_scale_postflight.sql). Bảng kết luận `must_be_zero` (30 dòng) là **câu lệnh cuối file** có chủ ý — Supabase SQL Editor chỉ hiện kết quả của câu cuối cùng, nên để nó ở giữa thì chạy xong chỉ thấy bảng ảnh chụp và không biết đạt hay không. Muốn xem các bảng ảnh chụp ở trên thì bôi đen riêng từng câu rồi Run, hoặc chạy bằng `psql`. Ngoài các dòng `must_be_zero`, chú ý hai chỗ: bảng kiểm bậc thang `moet_true_false_score(1, k, 4)` với k = 0..4 phải ra đúng `0 / 0,1 / 0,25 / 0,5 / 1,0`; và dòng kiểm 6 config rubric vẫn khớp `exam_questions.score` của câu tự luận — backfill cố ý **không chạm** dòng essay, lệch ở đây nghĩa là cổng `ESSAY_RUBRIC_SCORE_MISMATCH` sẽ chặn học sinh nộp bài. Hai bảng ảnh chụp `exam_attempts`/`student_answers` **không** phải kiểm bằng 0: chúng phải **giống hệt preflight** (240 dòng, `tong_score` 6,50, `tong_max_score` 240,00 — xác minh 2026-08-05).
5. **Rà lại phân loại đề.** `SELECT id, title, exam_mode, scoring_profile FROM public.exams ORDER BY created_at;` — mọi đề `simulation` cũ giờ là `moet_standard`. Nếu có đề vốn là **thi học kì** bị nâng lên theo, đưa về `custom` và trả trọng số về giá trị giáo viên muốn; cột này **không** có `UPDATE` cho client nên phải làm bằng SQL, câu lệnh mẫu ở [`SCORING.md`](SCORING.md).
6. **Phép thử quyết định — không bỏ qua.** Nộp một attempt thử với đúng **3/4 ý** một câu Đúng/Sai, rồi đọc `student_answers.score`. Kỳ vọng **0,5**. Nếu ra **0,75** thì migration chưa vào đúng thân hàm đang chạy (xem cảnh báo wrapper ở trên) — dừng lại, đừng mở lại website. Làm thêm 2/4 → 0,25 và 1/4 → 0,1.
7. Lặp phép thử 3/4 ý cho **ôn tập** (`submit_practice_attempt` → 0,5) và **bài tập về nhà** (`check_homework_answer` → 0,5). Trước migration, bài tập về nhà cho **0** vì không có điểm thành phần, nên bước này chứng minh được thay đổi đã vào. Cả hai luồng đều là `custom` — bậc thang không phụ thuộc hồ sơ điểm, chỉ trọng số mới phụ thuộc.
8. Kiểm hàng rào 4 ý ở **cả hai lớp**, và chỉ trên đề `moet_standard`: đưa một câu Đúng/Sai 3 ý vào đề thi thử trên UI → báo lỗi rõ; rồi `INSERT` trực tiếp vào `exam_questions` bằng SQL → trigger raise `TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS`. Chỉ kiểm UI thì không biết trigger có chạy hay không. Rồi làm cùng phép thử trên một đề `custom` → phải **cho qua**; trigger chặn ở đó là bug, vì đề học kì được phép có câu 2–3 ý.
9. Đọc lại `exam_attempts.score` của 14 attempt cũ → **không dòng nào đổi** (attempt có điểm thật là 3,1 / earned 6,5 / max 21). Migration không chạm điểm cũ theo chủ ý; xem mục "Điểm cũ không được tính lại" trong [`SCORING.md`](SCORING.md).
10. Đăng nhập tài khoản học sinh, thử `UPDATE exam_questions SET score = 99` → permission denied. Thử luôn `UPDATE exams SET scoring_profile = 'custom'` → cũng phải denied, vì cột này chỉ được grant `INSERT`. Bắt buộc theo `AGENTS.md` mục 8 vì migration này chạm đường ghi trọng số.

Rollback: [`../supabase/rollback/20260806_moet_scoring_scale_rollback.sql`](../supabase/rollback/20260806_moet_scoring_scale_rollback.sql) khôi phục ba hàm chấm về công thức tuyến tính, `DROP` trigger và hàm bậc thang, đưa mọi `score` không-tự-luận về 1 và đồng bộ lại `total_score`. **Backfill là mất mát thông tin:** file không lưu giá trị `score` từng dòng trước đó — phục hồi được chính xác chỉ vì giá trị cũ đồng loạt là 1. Nếu đã dùng trang cấu hình điểm sửa trọng số sau khi migration chạy, rollback sẽ **mất** các giá trị đã sửa. Rollback cũng không hoàn nguyên điểm của attempt nộp sau migration; những attempt đó giữ điểm theo thang Bộ.

### Nạp migration ảnh chụp chất lượng OCR (20260807)

`20260807_essay_ocr_snapshots.sql` đóng một **fail-open** trong pipeline chấm AI. Trước nó, học sinh chụp ảnh bài làm → `/api/essay-ai/ocr` đọc bằng Gemini → text đổ thẳng vào ô nhập, còn `confidence`/`warnings` chỉ hiện trên màn hình rồi mất. Worker vì thế truyền `ocr: null`, và nhánh `if (ocr)` trong `auto-finalize.ts` **bỏ qua toàn bộ khối kiểm OCR** — ba trigger `low_ocr_confidence`, `math_region_uncertain`, `ocr_warning` không bao giờ chạy. Với môn Toán, Gemini đọc nhầm `-2x` thành `2x` là đủ đảo ngược kết luận, và AI sẽ chấm bài sai đó một cách tự tin vì nó chấm đúng theo cái nó thấy.

Migration chỉ **tạo mới** (một bảng + một index, không hàm nào), nên không phụ thuộc thứ tự với migration nào khác và không có nguy cơ ghi đè.

Phần source đi kèm đã xong trong cùng đợt: route ghi snapshot, worker đọc lên, và `FinalizeInput.ocr` đổi từ `OcrResult | null` sang union ba trạng thái (`typed` / `scanned` / `scanned_snapshot_missing`) — `null` cũ mang cả nghĩa "gõ tay" lẫn "mất dấu vết" nên không nhánh nào chặn được.

Thứ tự:

1. Chạy [`../supabase/preflight/20260807_essay_ocr_snapshots_preflight.sql`](../supabase/preflight/20260807_essay_ocr_snapshots_preflight.sql). Mọi `must_be_zero` phải bằng 0.
2. Chạy toàn bộ [`../supabase/migrations/20260807_essay_ocr_snapshots.sql`](../supabase/migrations/20260807_essay_ocr_snapshots.sql) trong một lần.
3. Chạy [`../supabase/preflight/20260807_essay_ocr_snapshots_postflight.sql`](../supabase/preflight/20260807_essay_ocr_snapshots_postflight.sql). Chú ý ba dòng dễ hiểu sai: `quyen_ro_ri_cho_client` = 0 nghĩa là `anon`/`authenticated` **không** có quyền nào (đúng ý muốn — học sinh đọc được bảng này là biết bài mình có bị gắn cờ chất lượng thấp hay không); `service_role_thua_quyen_sua` = 0 nghĩa là service_role **không** có UPDATE/DELETE/TRUNCATE (nhật ký không được sửa sau khi ghi); `rls_chua_bat_hoac_chua_force` = 0 đòi cả `relrowsecurity` lẫn `relforcerowsecurity`.

   **Đã biết: dòng `service_role_thua_quyen_sua` trả về 2 khi chạy lần đầu trên Primary Database (2026-08-07).** Không phải false positive. `20260807` chỉ `REVOKE ALL ... FROM PUBLIC, anon, authenticated` rồi `GRANT SELECT, INSERT TO service_role`, tin rằng "không grant UPDATE/DELETE" nghĩa là không có. Nhưng project Supabase mặc định có `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role`, nên **mọi bảng mới trong `public` sinh ra đã có ALL cho bốn role đó** — câu `GRANT` chỉ là no-op, và service_role không nằm trong danh sách `REVOKE` nên giữ nguyên ALL. Câu `REVOKE` gỡ được anon/authenticated, vì thế `quyen_ro_ri_cho_client` vẫn đúng bằng 0.

   Sửa bằng [`../supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`](../supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql) — xem mục ngay dưới. Sau khi áp nó, chạy lại postflight 20260807 thì dòng đó về 0. **Không sửa thẳng file `20260807`** (`AGENTS.md` mục 2: migration đã chạy thì không sửa).

   Postflight `20260807` đã được sửa để đếm thêm `TRUNCATE`/`REFERENCES`/`TRIGGER` và thêm dòng `service_role_la_chu_so_huu`. `TRUNCATE` là lỗ bản đầu bỏ sót: nó xoá sạch bảng mà **không cần** quyền `DELETE`, nên gỡ UPDATE/DELETE mà bỏ TRUNCATE thì check vẫn "xanh" trong khi nhật ký vẫn xoá được bằng một câu lệnh. Vì thế lần chạy lại sẽ thấy dòng này báo **3** chứ không phải 2, trước khi về 0 sau 20260808.
4. **Phép thử end-to-end.** Vào một đề có câu tự luận bằng tài khoản học sinh, chụp/chọn một ảnh bài làm. Kỳ vọng: text hiện ra như cũ, và `SELECT * FROM public.essay_ocr_snapshots ORDER BY created_at DESC LIMIT 1;` có một dòng mới với đúng `attempt_id`/`question_id`, `confidence` trong khoảng 0–1. Không có dòng nào nghĩa là route ghi hỏng — bài vẫn nộp được nhưng sẽ luôn bị đẩy về giáo viên duyệt tay.
5. Kiểm nhánh chặn: chạy worker trên một bài **có** ảnh nhưng cố tình xoá dòng snapshot của nó (`DELETE FROM public.essay_ocr_snapshots WHERE attempt_id = '…'`), rồi đọc `essay_ai_usage.triggers` — phải chứa `ocr_snapshot_missing`. Đây là bước chứng minh cổng mới thật sự chặn, không chỉ tồn tại.

**Dữ liệu cũ không cứu được.** Bài nộp trước khi nạp migration này không có snapshot, và hệ thống không phân biệt được chúng với bài gõ tay — thông tin đó đã mất vĩnh viễn. Benchmark trước khi bật `ESSAY_AI_AUTO_FINALIZE` vì thế phải chạy trên bài nộp **sau** ngày nạp.

Rollback: [`../supabase/rollback/20260807_essay_ocr_snapshots_rollback.sql`](../supabase/rollback/20260807_essay_ocr_snapshots_rollback.sql). Chỉ `DROP TABLE`, nhưng phải đi kèm hoàn nguyên source: giữ source mà bỏ bảng thì route OCR lỗi khi INSERT và học sinh mất chức năng chụp ảnh, còn worker sẽ chặn auto-chốt mọi bài (fail-closed, đúng hướng an toàn nhưng nghĩa là auto-chốt ngừng hẳn).

### Siết quyền append-only cho bảng OCR snapshot (20260808)

Chạy **sau** khi `20260807` đã áp. Migration này sửa lỗi mà chính postflight `20260807` phát hiện: `service_role` có `UPDATE`/`DELETE`/`TRUNCATE` trên `essay_ocr_snapshots` dù `20260807` cố ý không grant.

**Nguyên nhân là một cái bẫy cấp schema, không phải lỗi đánh máy.** Project Supabase mặc định có

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
```

nên mọi bảng tạo mới trong `public` **sinh ra đã có ALL** cho bốn role đó, trước khi bất cứ câu `GRANT` nào chạy. Lập luận "tôi không grant UPDATE nên nó không có UPDATE" là sai, và sai im lặng — không lỗi, không cảnh báo. `20260807` `REVOKE` khỏi `PUBLIC, anon, authenticated` nhưng **không liệt kê `service_role`**, nên role đó giữ nguyên ALL và `GRANT SELECT, INSERT` thành no-op.

**Không phải sự cố đang diễn ra.** Đã rà toàn bộ call-site: chỉ `POST /api/essay-ai/ocr` (`.insert()`) và `worker.ts` (`.select()`) chạm bảng này, không có UPDATE/DELETE/TRUNCATE nào đang chạy. Không dòng nào đã bị sửa. Migration đóng đường trước khi có ai đi vào, không dọn thiệt hại. Điều đang thiếu là: tính "nhật ký không sửa được sau khi ghi" — toàn bộ giá trị làm bằng chứng của bảng — hiện chỉ được bảo đảm bằng quy ước trong comment, không bằng ACL. `service_role` là role của **mọi** route server, nên một đợt sửa code hay một script dọn dữ liệu chạy bằng service key xoá sạch được dấu vết chất lượng OCR mà không gặp cản nào.

Thứ tự:

1. Chạy [`../supabase/preflight/20260808_essay_ocr_snapshots_lock_preflight.sql`](../supabase/preflight/20260808_essay_ocr_snapshots_lock_preflight.sql). **Đọc khác với preflight thường:** bảng kết luận có hai loại dòng, cột `ky_vong` nói rõ từng dòng. Các dòng `chan_*` phải bằng 0 — khác 0 là dừng. Các dòng `xac_nhan_loi_*` kỳ vọng **khác 0**, vì chúng xác nhận lỗi có thật; `xac_nhan_loi_service_role_thua_quyen` nên ra **3** (UPDATE+DELETE+TRUNCATE). Nếu nó ra 0 thì quyền thừa không tồn tại, migration chỉ là no-op vô hại nhưng chẩn đoán sai ở đâu đó — tìm hiểu trước khi tin postflight.
2. Đặc biệt chú ý dòng `chan_service_role_la_chu_so_huu`. Chủ sở hữu bảng có đủ quyền **bất chấp mọi `REVOKE`**, nên nếu `service_role` là owner thì migration này không thể ăn và cách sửa là đổi owner, không phải REVOKE. Cổng tự kiểm trong migration sẽ raise `REVOKE_KHONG_AN` và rollback, nhưng biết trước thì đỡ mất một vòng.
3. Chạy toàn bộ [`../supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`](../supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql) trong một lần. Migration **tự kiểm trong transaction trước `COMMIT`**: nếu `REVOKE` không ăn thì raise `REVOKE_KHONG_AN`, nếu siết mất cả `SELECT`/`INSERT` thì raise `SIET_QUA_TAY` — cả hai đều rollback, không commit nửa vời. Nghĩa là: migration commit thành công ⇒ ACL đã đúng.
4. Chạy [`../supabase/preflight/20260808_essay_ocr_snapshots_lock_postflight.sql`](../supabase/preflight/20260808_essay_ocr_snapshots_lock_postflight.sql). Mọi `must_be_zero` phải bằng 0. Đối chiếu bảng chi tiết role × thao tác với bảng cùng dạng trong preflight: đúng ba ô `UPDATE`/`DELETE`/`TRUNCATE` của `service_role` chuyển sang `false`, không ô nào khác đổi.
5. **Phép thử runtime — postflight không chứng minh được.** Postflight chỉ đọc catalog: nó chứng minh *cấu hình* đúng, không chứng minh *runtime* chặn. `AGENTS.md` mục 8 đòi negative test thật:

   ```bash
   node --env-file=.env scripts/essay-ocr-snapshot-permission-check.mjs
   ```

   Script đi qua PostgREST bằng `SUPABASE_SERVICE_KEY` — **đúng con đường production dùng**, vì `admin.from(...)` trong route OCR cũng đi PostgREST chứ không đi `psql`. Năm test: `UPDATE`/`DELETE` phải bị chặn với SQLSTATE `42501`, `SELECT` phải chạy được, `INSERT` phải thất bại ở khoá ngoại `23503` (chứng tỏ đã *qua* kiểm quyền), `anon` không đọc được. Thoát 0 = đạt, 1 = có test không đạt.

   **Script không ghi dữ liệu.** Câu `UPDATE`/`DELETE` lọc theo UUID toàn số 0 nên khớp 0 dòng, còn `INSERT` dùng `attempt_id`/`question_id` không tồn tại nên chết ở FK. Phân biệt được "bị chặn quyền" với "được phép nhưng không có gì để sửa" là nhờ Postgres kiểm quyền **trước** khi khớp dòng — `UPDATE ... WHERE false` vẫn raise `42501` nếu thiếu quyền. Cố ý không dùng cách "chèn thử rồi xoá": sau `20260808` thì `service_role` không còn `DELETE`, nên dòng rác sẽ nằm lại vĩnh viễn.

   **Đừng dùng Supabase SQL Editor cho bước này.** Editor chạy bằng vai trò **sở hữu** bảng, và chủ sở hữu có đủ quyền bất chấp mọi `REVOKE`. Nó sẽ cho `UPDATE`/`DELETE` chạy được và bạn kết luận migration thất bại — sai, một cách rất thuyết phục.

   **`TRUNCATE` không test được ở đây.** PostgREST không có động từ nào map sang nó — và đó chính là lý do quyền này nguy hiểm: xoá sạch bảng mà không cần `DELETE`, lại không lộ ra trên bề mặt REST nên dễ bị bỏ sót khi rà. Dòng `service_role_thua_quyen_ghi` của postflight kiểm nó ở lớp catalog; muốn kiểm runtime thì cần một kết nối SQL không phải chủ sở hữu, hiện chưa có trong môi trường này.
6. **Xác nhận luồng OCR chưa hỏng.** Chụp một ảnh bài làm bằng tài khoản học sinh như bước 4 của mục 20260807 → phải có dòng mới trong bảng. Đây là bước chứng minh `INSERT` còn nguyên trên đường đi thật (test D ở bước 5 dùng khoá ngoại không tồn tại nên không ghi dòng nào).

   **Đừng chờ giao diện báo lỗi — nó sẽ không báo.** `writeOcrSnapshot()` trong [`../src/app/api/essay-ai/ocr/route.ts`](../src/app/api/essay-ai/ocr/route.ts) trả `false` và chỉ `console.error` khi ghi hỏng, có chủ đích: học sinh đang làm bài giữa giờ thi, chặn OCR vì database lỗi là cướp chức năng nhập bài để đổi lấy một dòng nhật ký. Hệ quả cho bước kiểm này là quyền bị siết quá tay sẽ **im lặng hoàn toàn** ở phía học sinh. Xác minh bằng hai chỗ, không phải bằng màn hình học sinh: số dòng trong bảng có tăng không, và log server có dòng `[essay-ai ocr] ghi snapshot hỏng:` không.

   Nếu `INSERT` bị chặn thật thì rollback ngay: worker sẽ coi mọi bài có ảnh là mất dấu vết và chặn auto-chốt toàn bộ (fail-closed — không sai điểm, nhưng auto-chốt ngừng hẳn trong im lặng).

**Chạy lại nhiều lần vô hại.** Migration chỉ đổi ACL, không DDL, không dữ liệu; `REVOKE` một quyền không có là no-op.

Rollback: [`../supabase/rollback/20260808_essay_ocr_snapshots_lock_rollback.sql`](../supabase/rollback/20260808_essay_ocr_snapshots_lock_rollback.sql). **Gần như luôn là quyết định sai** — đọc phần đầu file trước khi chạy. Migration chỉ gỡ năm quyền mà không call-site nào dùng, nên nó không thể làm hỏng luồng nào; nếu có gì hỏng sau khi áp, nguyên nhân gần như chắc chắn ở chỗ khác. Nếu cần xoá tay một loạt dòng rác thì **đừng** nới quyền `service_role`: chạy câu lệnh đó bằng kết nối chủ sở hữu bảng (Supabase SQL Editor), chủ sở hữu không bị ACL chặn.

**Cái bẫy vẫn còn cho migration sau.** `ALTER DEFAULT PRIVILEGES` là cấu hình cấp schema; `20260808` **không** chạm nó, vì đổi nó là đổi hành vi của mọi bảng tương lai và cần chủ dự án quyết. Hai việc còn lại:

- Chạy [`../supabase/preflight/20260808_default_privileges_audit.sql`](../supabase/preflight/20260808_default_privileges_audit.sql) — script chỉ đọc, quét toàn `public` tìm bảng có ACL rộng hơn ý định vì cùng nguyên nhân. Nó **không** có bảng `must_be_zero`: phần lớn bảng *đúng* là nên cho `authenticated` đọc ghi, và không ngưỡng máy móc nào phân biệt được "rộng hợp lý" với "rộng do sơ suất". Bảng tổng xếp theo mức đáng ngờ và cột `phai_kiem_gi` nói phải đọc gì. Nhóm `CAO` đáng đọc trước: "RLS bật + không policy + client vẫn ghi được" là mâu thuẫn nội tại, vì mẫu RLS-không-policy được chọn *chính vì* muốn khoá chặt. Lưu ý `essay_ai_usage` (20260805) sẽ hiện ở nhóm `TRUNG_BINH` nhưng **đúng chủ ý** — worker cập nhật bản ghi chi phí nên nó cần UPDATE/DELETE. Phân biệt được chỉ bằng cách đọc migration tạo bảng và call-site.
- **Quy ước cho migration sau:** bảng chỉ-`service_role` phải viết `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role;` **trước** khi `GRANT` đúng tập quyền cần. Đừng dựa vào việc không viết `GRANT` để suy ra không có quyền. Và khi viết postflight quyền, luôn đếm cả `TRUNCATE` — nó xoá sạch bảng mà không cần `DELETE`.

## 8bis. Nạp `20260809_essay_answer_uploads.sql` — lưu ảnh bài làm

Migration này **khác các file trước ở một điểm quan trọng**: nó là file đầu tiên của dự án tạo bucket Storage và policy trên `storage.objects`. Trước nó, mọi quyết định quyền chỉ nằm trong schema `public`.

Nó giải quyết hai việc: (1) ảnh bài làm hiện **không được lưu** — route OCR gọi Gemini rồi vứt ảnh, nên khi có tranh chấp điểm không ai mở được bài viết tay ra đối chiếu, mà từ 2026-08-06 điểm đó còn được AI tự chốt; (2) học sinh được xoá ảnh trong giờ thi (quyết định chủ dự án) nhưng `essay_ocr_snapshots` không có liên kết nào tới ảnh, nên worker tính cả snapshot của ảnh đã bị xoá. Cột `upload_id` đóng lỗ đó.

Thứ tự:

1. Chạy [`../supabase/preflight/20260809_essay_answer_uploads_preflight.sql`](../supabase/preflight/20260809_essay_answer_uploads_preflight.sql). Mọi `must_be_zero` phải bằng 0. Ba dòng dễ hiểu sai:
   - `bang_da_ton_tai` và `cot_upload_id_da_ton_tai` khác 0 nghĩa là migration đã chạy rồi. Phần lớn là idempotent, nhưng phải biết trước.
   - `khong_co_attempt_in_progress` và `khong_co_admin` khác 0 **không** chặn migration, nhưng chặn việc *xác minh* nó ở bước 5 — không có attempt đang làm thì không test được luồng nộp ảnh, không có ai `role = 'admin'` thì không ai xem được ảnh học sinh.
   - Đọc ảnh chụp 5 và 6 (`gia_tri_status`, `gia_tri_role`). Cả trigger lẫn 8 policy đều so `status = 'in_progress'` và `role = 'admin'` **exact**. Nếu database dùng giá trị khác, học sinh không nộp được ảnh nào và nguyên nhân sẽ rất khó tìm. Lưu ý `teacher` **không** được policy admin chấp nhận — đó là điểm chưa thống nhất của dự án (`AGENTS.md` mục 4), không phải sơ suất của file này.
2. Chạy toàn bộ [`../supabase/migrations/20260809_essay_answer_uploads.sql`](../supabase/migrations/20260809_essay_answer_uploads.sql) trong một lần. Migration **tự kiểm trước `COMMIT`**: bucket phải private, không role nào còn `DELETE`/`TRUNCATE`, `authenticated`/`service_role` phải còn đủ `SELECT`/`INSERT`/`UPDATE`, đúng 4 policy storage, và cột `upload_id` phải tồn tại. Sai bất cứ điều nào thì raise và rollback. Commit thành công ⇒ cấu hình đúng.
3. Chạy [`../supabase/preflight/20260809_essay_answer_uploads_postflight.sql`](../supabase/preflight/20260809_essay_answer_uploads_postflight.sql). Mọi `must_be_zero` phải bằng 0. Chú ý:
   - `bucket_dang_public` là dòng quan trọng nhất cả file. Khác 0 nghĩa là ai có URL cũng tải được ảnh bài làm mà không cần đăng nhập.
   - `policy_storage_khong_loc_bucket` khác 0 nghĩa là có policy áp cho **mọi** bucket khác trong project, không chỉ bucket này.
   - `snapshot_mat_tinh_append_only` khác 0 nghĩa là việc thêm cột đã nới quyền bảng snapshot, phá `20260808`.
   - Đối chiếu ảnh chụp 5 với preflight: số dòng snapshot phải **giống hệt**, và `so_co_upload_id` phải bằng 0 (chưa route nào ghi cột mới).
4. **Đọc bằng mắt `using_expr` của 4 policy storage** (ảnh chụp 4 của postflight). Đây là chỗ một lỗi đánh máy biến "ảnh của tôi" thành "ảnh của mọi người", và không phép kiểm máy móc nào bắt được: policy sai vế `USING` vẫn hiện ra đầy đủ trong `pg_policies`. Cả bốn phải có `bucket_id = 'essay-uploads'` **và** một điều kiện về `auth.uid()`.
5. **Phép thử runtime — postflight không chứng minh được.** Với bảng có policy thật (khác `essay_ocr_snapshots` dùng mẫu không-policy), đây là bước quan trọng hơn cả postflight: một lỗi đánh máy trong vế `USING` vẫn hiện ra đầy đủ trong `pg_policies` mà cấp quyền cho sai người.

   Cần **hai** tài khoản học sinh khác nhau, mỗi tài khoản có một attempt đang `in_progress`. Hai tài khoản là bắt buộc — một tài khoản chỉ kiểm được "tôi đọc được ảnh của tôi", điều đó đúng kể cả khi policy cho phép đọc ảnh của tất cả mọi người.

   ```bash
   node --env-file=.env scripts/essay-uploads-permission-check.mjs --email-a hs1@example.com --password-a <mk1> --email-b hs2@example.com --password-b <mk2>
   ```

   Tám test: A đọc ảnh của mình (phải được), **A đọc ảnh của B (phải 0 dòng — bất biến quan trọng nhất)**, A ghi với `storage_path` sai (`UPLOAD_PATH_MISMATCH`), A ghi vào attempt của B (`UPLOAD_OWNER_MISMATCH`), A ghi mạo danh B (chỉ RLS chặn được — `42501`), A xoá cứng (`42501`, không role nào có `DELETE`), A thêm ảnh vào bài đã nộp (`ATTEMPT_NOT_ACTIVE`), anon đọc bảng (bị chặn). Thoát 0 = đạt, 1 = có test không đạt.

   Thiếu attempt `in_progress` thì script **dừng và nói rõ**, không báo đạt — "chưa test được gì" khác "đã test và đạt". Test G tự bỏ qua nếu A chưa có bài nào `submitted`, và bỏ qua được đếm riêng trong tổng kết.

   **Test E có thể để lại một dòng rác — chỉ khi nó KHÔNG ĐẠT.** Nó dựng mọi thứ hợp lệ với trigger để lớp duy nhất còn lại là RLS; nếu RLS sai thì dòng đó nằm lại và script in ngay câu `DELETE` để dọn (chạy bằng kết nối chủ sở hữu, vì không role nào có `DELETE`). Dòng dùng `page_index = 9999` và `content_hash` có dấu nên không thể xoá lầm dữ liệu thật.

   **Đừng dùng Supabase SQL Editor cho bước này.** Editor chạy bằng vai trò chủ sở hữu: `auth.uid()` là `NULL` và `FORCE ROW LEVEL SECURITY` không áp cho chủ sở hữu, nên mọi policy sẽ trông như bị bỏ qua và bạn sẽ kết luận migration thất bại — sai, một cách rất thuyết phục.

6. **Hai thứ script không phủ, phải thử bằng tay.** Policy trên `storage.objects` (script kiểm bảng metadata; quyền đọc **tệp** đi qua signed URL): mở `/result` bằng A, copy URL một ảnh, dán vào tab đang đăng nhập bằng B — phải không xem được. Và luồng đầu-cuối: chụp một ảnh thật, xoá được trong giờ thi, nộp bài, rồi xác nhận ảnh còn xem được mà không còn nút xoá.

Rollback: [`../supabase/rollback/20260809_essay_answer_uploads_rollback.sql`](../supabase/rollback/20260809_essay_answer_uploads_rollback.sql). **File này XOÁ DỮ LIỆU** — khác rollback của `20260808` (chỉ đổi ACL). Nó có cổng chặn đòi bản sao lưu `backup_20260809.essay_answer_uploads` trước khi xoá, và **cố ý không xoá bucket**: rollback cấu trúc không được kèm huỷ hồ sơ học sinh. Muốn dừng tính năng mà không mất gì thì tắt nút chụp ảnh ở UI, hoặc `UPDATE storage.buckets SET file_size_limit = 1 WHERE id = 'essay-uploads';` để chặn upload mới mà giữ ảnh cũ.

**Migration này một mình chưa cho nộp ảnh được.** Còn bốn việc phía source (`upload-url` route, client resize 1600px/JPEG 0.8 để xoá EXIF và giữ dung lượng, route OCR đổi sang nhận `uploadId`, worker lọc snapshot theo ảnh còn sống) và một việc phía UI phải đi cùng chứ không trễ hơn: `ExamRunner.tsx` đang nói với học sinh "Ảnh không được lưu lại" — từ lúc migration này chạy, câu đó là nói dối. Danh sách đầy đủ ở cuối file migration.

## 8ter. Nạp `20260810_essay_uploads_purge.sql` — TTL ảnh

Thêm cột `purged_at` để job TTL đánh dấu "tệp đã dọn, metadata giữ lại", và nới trigger cho đúng hai trường hợp mới.

**Vì sao không tái dùng `deleted_at`:** `deleted_at` là NGƯỜI bỏ ảnh đi (ảnh không còn thuộc bài làm, worker không tính, UI không hiện); `purged_at` là HỆ THỐNG dọn tệp sau 12 tháng (ảnh VẪN thuộc bài làm, chỉ không xem được nữa). Gộp hai thứ lại sẽ làm một bài đã chấm bằng ảnh trông như học sinh chưa từng nộp ảnh nào — đúng thông tin cần nhất khi tranh chấp một điểm cũ. Thêm nữa, `deleted_at` đi kèm CHECK đòi `deleted_by` khác NULL, mà job TTL không phải một người nên không có uuid để điền.

Thứ tự:

1. Chạy [`../supabase/preflight/20260810_essay_uploads_purge_preflight.sql`](../supabase/preflight/20260810_essay_uploads_purge_preflight.sql). Mọi `must_be_zero` phải bằng 0. **Đọc ảnh chụp 1**: cột `qua_han` là số ảnh job TTL sẽ dọn ở lần chạy đầu — lớn hơn 0 ngay lúc này nghĩa là có ảnh cũ hơn dự kiến, đọc lại trước khi bật job theo lịch vì xoá tệp không hoàn lại. **Lưu lại ảnh chụp 2** (`pg_get_functiondef`): migration `CREATE OR REPLACE` cả hàm trigger, và bản này là thứ để đối chiếu sau.
2. Chạy toàn bộ [`../supabase/migrations/20260810_essay_uploads_purge.sql`](../supabase/migrations/20260810_essay_uploads_purge.sql). Tự kiểm trước `COMMIT`: cột phải tồn tại và nullable, trigger phải còn gắn, và quyền `DELETE` không được xuất hiện.
3. Chạy [`../supabase/preflight/20260810_essay_uploads_purge_postflight.sql`](../supabase/preflight/20260810_essay_uploads_purge_postflight.sql). Mọi `must_be_zero` phải bằng 0. **Dòng quan trọng nhất là `mat_bat_bien_trong_ham`**: nó đếm sáu mã lỗi của `20260809` phải CÒN NGUYÊN trong thân hàm sau khi thay. Chép lại cả hàm để thêm hai khối là cách dễ nhất để đánh rơi một bất biến cũ, và đánh rơi thì không có lỗi nào báo — chỉ có một cổng an toàn im lặng biến mất. Dòng `thieu_bat_bien_moi` kiểm hướng ngược lại.

Rollback: [`../supabase/rollback/20260810_essay_uploads_purge_rollback.sql`](../supabase/rollback/20260810_essay_uploads_purge_rollback.sql). Nếu chưa job nào chạy (`purged_at` toàn NULL) thì không mất gì. Nó trả hàm trigger về bản `20260809` **trước** khi gỡ cột — thứ tự bắt buộc, vì hàm bản mới tham chiếu `NEW.purged_at` và sẽ đổ ở lần INSERT tiếp theo nếu cột đã mất. Muốn dừng job TTL mà không mất gì thì bỏ lịch gọi, hoặc đặt `ESSAY_UPLOAD_TTL_DAYS` rất lớn.

## 8quater. Nạp `20260811_essay_uploads_storage_policy_fix.sql` — SỬA LỖI

**Lỗi thật đã gặp trên Primary ngày 2026-08-07:** học sinh không xem lại được ảnh bài làm của chính mình sau khi nộp. `/result` hiện ô "Không mở được"; `createSignedUrl` trả `{"statusCode":"404","error":"not_found","message":"Object not found"}` trong khi tệp có thật và service key sign được bình thường.

**Nguyên nhân.** Bốn policy của `20260809` kiểm quyền bằng `EXISTS (SELECT 1 FROM public.exam_attempts ...)`. Subquery đó chạy **dưới RLS của `exam_attempts`**, và `students_read_own_exam_attempts` ([20260722](../supabase/migrations/20260722_runtime_security_hardening.sql)) chỉ cho học sinh đọc attempt của mình khi `status = 'in_progress'`, hoặc đề `practice`, hoặc `simulation AND grading_status='completed' AND show_results_immediately`. Bài thi thử vừa nộp chưa chốt điểm nên không thoả điều nào → `EXISTS` false → Storage trả "Object not found" (nó cố ý không phân biệt "không có quyền" với "không tồn tại").

Lỗi không lộ ra sớm vì trong giờ thi `status = 'in_progress'` nên upload, OCR và xem ảnh đều chạy đúng. Nó chỉ xuất hiện **sau khi bấm nộp** — đúng lúc ảnh bắt đầu có giá trị làm bằng chứng.

**Bài học đáng ghi lại:** policy không được phụ thuộc RLS của bảng khác. Một policy đúng vào ngày viết có thể vỡ vì ai đó siết RLS ở bảng khác, và nó vỡ **im lặng** — không lỗi, không log, chỉ là dữ liệu biến mất khỏi UI. Và `20260809` có postflight đạt **toàn bộ** trong khi policy vẫn hỏng: đó là giới hạn của mọi phép kiểm đọc catalog.

Thứ tự:

1. Chạy [`../supabase/preflight/20260811_essay_uploads_storage_policy_fix_preflight.sql`](../supabase/preflight/20260811_essay_uploads_storage_policy_fix_preflight.sql). **Đọc khác preflight thường**, cột `ky_vong` nói rõ từng dòng: các dòng `chan_*` phải bằng 0; dòng `xac_nhan_loi_policy_doc_exam_attempts` kỳ vọng **4** và `xac_nhan_loi_policy_chan_theo_status` kỳ vọng **1**. Nếu hai dòng xác nhận lỗi ra 0 thì chẩn đoán sai ở đâu đó — **đừng chạy migration**, đọc lại. Ảnh chụp 3 cho biết bao nhiêu ảnh đang bị ảnh hưởng.
2. Chạy toàn bộ [`../supabase/migrations/20260811_essay_uploads_storage_policy_fix.sql`](../supabase/migrations/20260811_essay_uploads_storage_policy_fix.sql). Nó tạo ba hàm `SECURITY DEFINER` (`essay_upload_is_owner`, `essay_upload_viewer_is_admin`, `essay_upload_attempt_active`) rồi dựng lại 4 policy dùng hàm thay cho subquery. Giữ **nguyên tên và số lượng policy**, nên postflight của `20260809` vẫn đạt sau bản sửa. Tự kiểm trước `COMMIT`: đủ 4 policy, không policy nào còn đọc `exam_attempts`, ba hàm phải là `SECURITY DEFINER`, và `authenticated` phải `EXECUTE` được cả ba (thiếu quyền này thì mọi truy vấn chạm bucket sẽ **lỗi** thay vì trả 0 dòng).
3. Chạy [`../supabase/preflight/20260811_essay_uploads_storage_policy_fix_postflight.sql`](../supabase/preflight/20260811_essay_uploads_storage_policy_fix_postflight.sql). Mọi `must_be_zero` phải bằng 0. Chú ý `ham_thieu_search_path` — `SECURITY DEFINER` không cố định `search_path` là đường leo quyền kinh điển.
4. **Phép thử thật, không bỏ được.** Postflight chỉ đọc catalog, và chính lỗi này là loại lỗi catalog không thấy:
   - Mở `/result` của một bài **đã nộp** bằng tài khoản học sinh → ảnh phải hiện ra. Đây chính xác là trường hợp đã hỏng.
   - Nhánh ngược, vì bản sửa **nới** quyền đọc: đăng nhập bằng học sinh B, dán signed URL ảnh của A vào → phải vẫn không xem được.
   - Chạy lại `scripts/essay-uploads-permission-check.mjs` (mục 8bis bước 5) → vẫn phải đạt hết.

Rollback: [`../supabase/rollback/20260811_essay_uploads_storage_policy_fix_rollback.sql`](../supabase/rollback/20260811_essay_uploads_storage_policy_fix_rollback.sql). **Nó khôi phục lại lỗi** — bản `20260809` là bản học sinh không xem được ảnh sau khi nộp. Không mất dữ liệu, nhưng chạy nó là chọn quay về trạng thái đó có ý thức. Nếu lo bản sửa nới quá tay thì kiểm bằng phép thử ngược ở bước 4 trước, đừng rollback.

## 8quinquies. Nạp `20260812_announcements_policy_fix.sql` — SỬA LỖI

**Lỗi thật đã gặp ngày 2026-08-07:** khách **chưa đăng nhập** không thấy thông báo nào trên trang chủ. `GET /rest/v1/announcements` bằng anon key trả `401` với `{"code":"42501","message":"permission denied for table profiles"}`.

**Nguyên nhân.** Hai policy trong `database/ANNOUNCEMENTS_SCHEMA.sql` đều không có mệnh đề `TO`, nên áp cho **mọi** vai trò kể cả `anon`. Policy admin là `FOR ALL` (gồm cả `SELECT`) và biểu thức của nó đọc `public.profiles` — bảng `anon` không có quyền. Policy permissive được OR ở **kết quả**, nhưng biểu thức của chúng vẫn phải **chạy được**: một policy không dành cho bạn vẫn làm hỏng truy vấn của bạn nếu nó không đánh giá nổi.

Đây là **lần thứ ba** cùng một nguyên nhân trong một ngày — sau policy storage (`20260811`) và `gateAttempt()`. Quy tắc đã ghi vào `AGENTS.md`: đừng để một quyết định phân quyền phụ thuộc vào việc vai trò gọi có đọc được bảng khác hay không.

Thứ tự:

1. Chạy [`../supabase/preflight/20260812_announcements_policy_fix_preflight.sql`](../supabase/preflight/20260812_announcements_policy_fix_preflight.sql). Các dòng `chan_*` phải bằng 0; ba dòng `xac_nhan_loi_*` kỳ vọng **khác 0** (lần lượt 2, 1, 1). Nếu chúng ra 0 thì chẩn đoán sai — **đừng chạy migration**. Đọc ảnh chụp 2: cột `se_hien_cho_khach` là số thông báo sẽ lộ ra cho người chưa đăng nhập sau bản sửa; biết trước con số đó rồi hãy chạy.
2. Chạy toàn bộ [`../supabase/migrations/20260812_announcements_policy_fix.sql`](../supabase/migrations/20260812_announcements_policy_fix.sql). Nó tạo `public.viewer_is_admin()` (`SECURITY DEFINER`) rồi dựng lại hai policy **có `TO` tường minh**. Tự kiểm trước `COMMIT`: không policy nào còn `{public}` ở cột role, không policy nào còn đọc `profiles`, hàm phải là `SECURITY DEFINER` và `authenticated` phải `EXECUTE` được.
3. Chạy [`../supabase/preflight/20260812_announcements_policy_fix_postflight.sql`](../supabase/preflight/20260812_announcements_policy_fix_postflight.sql). Mọi `must_be_zero` phải bằng 0. Hai dòng cốt lõi: `con_policy_khong_gioi_han_role` và `con_policy_doc_profiles`.
4. **Phép thử thật — catalog không chứng minh được.** Chạy từ máy:

```bash
node --env-file=.env -e 'const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;fetch(`${u}/rest/v1/announcements?select=id,title,is_active&limit=5`,{headers:{apikey:k,Authorization:`Bearer ${k}`}}).then(r=>r.json().then(b=>console.log(r.status,JSON.stringify(b).slice(0,300))))'
```

   Trước sửa `401`; sau sửa `200` kèm danh sách. **Nhánh ngược bắt buộc kiểm** vì bản sửa nới quyền đọc cho khách: thông báo `is_active = false` hoặc đã hết hạn phải **không** xuất hiện trong kết quả. Đối chiếu số dòng trả về với `se_hien_cho_khach` ở preflight — hai con số phải khớp.

Rollback: [`../supabase/rollback/20260812_announcements_policy_fix_rollback.sql`](../supabase/rollback/20260812_announcements_policy_fix_rollback.sql). **Nó khôi phục lại lỗi.** Muốn tạm ẩn hết thông báo mà không rollback thì `UPDATE public.announcements SET is_active = false;` — tức thì, hoàn tác được, không đụng policy.

### Job dọn ảnh quá hạn

```bash
curl -X POST https://<host>/api/essay-ai/uploads-ttl \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

`dryRun: true` chỉ đếm, không xoá gì — **luôn chạy nó trước lần thật đầu tiên**, vì xoá tệp không hoàn lại. Bỏ `dryRun` để dọn thật; `limit` mặc định 200 mỗi lượt, tối đa 1000.

Đọc `report`: `found` là số ảnh quá hạn tìm được, `filesRemoved` số tệp đã xoá, `marked` số dòng đã đánh dấu, `failed` số ảnh sẽ thử lại lượt sau. `filesRemoved` khác `marked` nghĩa là đã xoá tệp nhưng chưa đánh dấu xong — lượt sau tự sửa (tìm lại đúng những dòng đó, `remove()` trên tệp không tồn tại là no-op).

Thứ tự trong route là **xoá tệp trước, đánh dấu sau**, có chủ đích. Lỗi giữa hai bước để lại tệp đã xoá chưa đánh dấu (lượt sau sửa được). Thứ tự ngược lại để lại dòng "đã dọn" mà tệp còn nằm đó — dung lượng không bao giờ thu hồi và không ai biết để đi tìm.

**Chưa có ảnh nào tới hạn cho tới khoảng 2027-08** (ảnh đầu tiên là 2026-08). Gọi job sớm là vô hại và xác nhận được đường ống chạy đúng khi chưa có gì để mất — nên làm đúng lúc này, không đợi.

### Test quyền pipeline chấm AI bằng JWT thật

Postflight SQL chỉ kiểm cấu hình `GRANT` trong catalog; nó không chứng minh runtime chặn thật. `AGENTS.md` mục 8 yêu cầu negative test bằng JWT thật — dùng script này thay cho việc mò DevTools console:

```bash
node --env-file=.env scripts/essay-ai-permission-check.mjs --email <email-hoc-sinh> --password <mat-khau>
```

Thông tin đăng nhập truyền qua tham số, không hard-code và không đọc từ file, nên không bị commit. Script chỉ đọc, không ghi. `--env-file` là cờ của Node: nó nạp `.env` mà không cần script mở file đó ra.

Script kiểm 9 mục và thoát 1 nếu có mục nào không đạt: học sinh đọc `essay_ai_usage`; học sinh gọi `essay_ai_month_to_date_cost`, `ai_finalize_essay_answer`, `get_essay_grading_package`; `grade-queue` thiếu/sai token và với method `GET`; `stats` chưa đăng nhập và bằng session học sinh. Nó tự dừng nếu tài khoản truyền vào không phải `role = 'student'` — chạy bộ này bằng JWT admin cho kết quả vô nghĩa.

Kết quả chạy 2026-08-04 trên Primary: **9/9 đạt.** Bốn test database đều bị chặn ở lớp `GRANT` (PostgREST code `42501`), không chỉ ở RLS. Test `stats` bằng session học sinh trả đúng **403**, tức nhánh "đăng nhập rồi nhưng không phải admin" đã được xác minh, không phải chỉ nhánh chưa đăng nhập.

Hai test cần ghi dữ liệu không nằm trong script: insert hai dòng cùng `input_hash` (dòng thứ hai phải bị chặn) và xoá `exam_attempt` thử (dòng usage phải biến mất theo CASCADE). Cái thứ nhất đã được xác nhận khi chạy worker thật (xem dưới); cái thứ hai vẫn chưa.

### Kết quả chạy worker thật lần đầu (2026-08-04)

Lượt gọi provider thật đầu tiên của hệ thống, trên attempt thử của chủ dự án (3 câu essay), tổng chi phí **0,00079 USD**. Toàn bộ đạt:

| Kiểm tra | Kết quả |
|---|---|
| `ESSAY_AI_ENABLED=false` | `picked: 0`, 0 dòng usage. Worker đọc cờ **trước** khi query hàng chờ nên không chạm database và không gọi provider |
| Chấm thật, `ESSAY_AI_AUTO_FINALIZE=false` | 3 dòng usage `outcome='pending_review'`, latency 1,8–3,1s |
| `student_answers` | không đổi — `score`, `graded_by`, `graded_at` vẫn `null`, bài vẫn trong hàng chờ giáo viên |
| Gọi lại lượt hai | `skipped: 3`, lý do `already_graded_same_input`, `estimatedCostUsd: 0` — `UNIQUE (input_hash)` chặn gọi provider lần hai |
| Hai lượt song song | 200 và **409** `ALREADY_RUNNING` |
| `essay_ai_month_to_date_cost()` | khớp đúng tổng của 3 dòng |

`triggers` cả 3 bài: `auto_finalize_disabled`, `model_requested_review`, `low_grading_confidence`. Hai cái sau không do cấu hình — DeepSeek tự trả `score=0`, `confidence=0` vì nội dung ba bài là chuỗi vô nghĩa. Mô hình từ chối đoán, đúng hành vi mong muốn.

**Đọc kết quả này đúng mức.** Nó chứng minh đường ống và các cổng fail-closed hoạt động. Nó không nói gì về chất lượng chấm: bài rác thì mô hình nào cũng "qua". Nhánh `auto_finalize` ghi `ai_graded` vẫn chưa được chạy thật lần nào.

### Vận hành worker chấm tự động

**Cách gọi.** Worker không tự chạy — không có scheduler trong app. Một lượt:

```bash
curl -X POST http://localhost:3000/api/essay-ai/grade-queue -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":5}'
```

`limit` kẹp trong 1..25, mặc định 10. Route trả về báo cáo chỉ gồm số đếm và mã lý do — không có `student_answer_id` hay nội dung bài, nên dán được vào issue mà không rò dữ liệu. Gọi trùng khi lượt trước chưa xong → 409. Sai hoặc thiếu bearer token → 401. `GET` → 405.

Muốn chạy định kỳ thì đặt cron **ngoài** app (Vercel Cron, GitHub Actions, hay task scheduler trên máy) trỏ vào route đó với cùng header. Giữ `CRON_SECRET` như một secret thật: nó cho phép tiêu tiền API.

**Cách đọc dashboard.** `/admin/essay-ai` (chỉ `role = 'admin'`). Trang này trả lời đúng một câu hỏi: *đã đủ bằng chứng để bật `ESSAY_AI_AUTO_FINALIZE` chưa?* Thứ tự đọc theo đúng thứ tự trên trang:

1. **Cờ đang bật** — từ 2026-08-06 `ESSAY_AI_AUTO_FINALIZE` là `true`. Thấy `false` nghĩa là ai đó đã tắt (hoặc env production chưa đồng bộ với `.env` local), không phải trạng thái mong đợi nữa.
2. **Trạng thái cổng chặn tự động** (dải màu trên cùng khối số liệu chấm đè). Đây là cái worker đang **thực thi**, không phải khuyến nghị: vàng nghĩa là dù `ESSAY_AI_AUTO_FINALIZE` có bật, worker vẫn không tự chốt bài nào, và câu chi tiết nói rõ chặn vì lý do gì. Lưu ý hai điều:
   - Cổng chặn cả khi **chưa đủ bài đối chiếu**, không chỉ khi tỷ lệ xấu. Đó là trạng thái hiện tại và là đúng.
   - Cổng xanh **không** phải giấy phép bật cờ. Điều kiện OCR snapshot và benchmark vẫn còn nguyên; cổng chỉ nói "số liệu chấm đè không phản đối".
   - Cổng tính lại mỗi lượt worker chứ không chốt cứng, nên quanh ngưỡng nó có thể mở lại giữa các lượt. Muốn dừng chắc chắn thì tắt cờ bằng tay.
3. **Tỷ lệ giáo viên chấm đè** và độ lớn trung bình của override. Đây là chỉ số quyết định. "Chưa có bài nào vừa được AI chấm vừa được giáo viên duyệt lại" nghĩa là chưa đủ bằng chứng — không phải nghĩa là tốt.
4. **Sai nghiêm trọng** — số bài giáo viên sửa lệch quá 20% thang điểm. Mỗi bài ở đây là một học sinh lẽ ra đã nhận điểm sai nếu auto-chốt bật.
5. **Chi phí** đặt dưới cùng có chủ ý: nó dễ nhìn và dễ gây yên tâm sai. Chi phí thấp không nói gì về chất lượng chấm.
6. **Phân bố `triggers`** cho biết pipeline đang bị chặn ở đâu. `auto_finalize_disabled` chiếm gần hết là bình thường khi cờ đang tắt; `override_rate_exceeded` là dấu vết của cổng tự động ở mục 2.

Benchmark là nguồn bằng chứng thứ hai, độc lập với dashboard: xem [`../fixtures/essay-ai/README.md`](../fixtures/essay-ai/README.md).

**Cách tắt.** Ba mức, từ nhẹ đến nặng:

| Muốn | Làm |
|---|---|
| Dừng điểm AI hiện ra với học sinh | `ESSAY_AI_AUTO_FINALIZE=false` + restart. Worker vẫn chấm và ghi gợi ý, bài vẫn về hàng chờ giáo viên |
| Dừng mọi lượt gọi provider (dừng tiêu tiền) | `ESSAY_AI_ENABLED=false` + restart. Worker thoát sớm, không insert dòng usage nào |
| Dừng cả điểm gọi worker | Xoá `CRON_SECRET` khỏi env → route trả 503. Hoặc tắt cron bên ngoài |

Tắt cờ không xoá điểm đã chốt. Bài đang `ai_graded` vẫn `ai_graded` và học sinh vẫn thấy nhãn "Điểm do AI chấm — giáo viên sẽ xem lại"; giáo viên chấm đè qua `EssayGradingPanel` để đưa về `approved`.

Ngoài ba mức trên còn một mức **tự động**: cổng chặn theo mức chấm đè (`src/lib/essay-ai/override-guard.ts`). Worker tính lại mỗi lượt trên cửa sổ 90 ngày và tự hạ auto-chốt xuống `pending_review` khi giáo viên đang phải sửa điểm quá nhiều, hoặc khi chưa đủ bài đối chiếu để biết AI chấm đúng hay sai. Không cần ai can thiệp, và trạng thái hiện trên dashboard (mục 2 phần "Cách đọc dashboard"). Ba biến `ESSAY_AI_OVERRIDE_*` ở mục 2 điều chỉnh ngưỡng; ngưỡng mặc định là **thận trọng chứ chưa có bằng chứng thật đứng sau** — `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 10.1 là chỗ chốt lại sau benchmark. Cổng này chỉ siết, không nới: nó không bao giờ tự bật auto-chốt khi cờ đang tắt.

## 8sexies. Nạp `20260827_homework_test_phase.sql` — đoạn kiểm tra trong bài tập

**ĐÃ NẠP trên Primary ngày 2026-08-28**, hậu kiểm cấu trúc đạt. Giữ lại mục này làm hồ sơ và làm
hướng dẫn cho môi trường khác. Chưa chạy E2E bằng tài khoản thật — xem bước 5 và 6.

Lưu ý thứ tự nếu nạp ở nơi khác: **migration trước, code sau.** Không có cột `phase` thì trang tạo
bài tập lỗi ngay khi lưu (`column "phase" of relation "homework_questions" does not exist`).

Ghi nhận từ lượt nạp thật: bước 4 (mốc đối chiếu) trả **một** dòng chứ không phải 0 — attempt
`a4c41cfe…` nộp ngày 15/06/2026. Đã truy nguyên, **không phải lỗi đang sống**: bài đó được chấm
trước hardening `20260722` (lưu điểm thô 5,00, chưa quy đổi thang 10), và bài tập của nó đã phình từ
20 lên 158 câu sau khi em đó nộp — thời đó `can_edit_homework_question_links` chưa tồn tại để chặn.
Nếu chạy lại mốc đối chiếu, kỳ vọng đúng dòng này, không phải 0 dòng.

Migration làm ba việc: thêm `homework_questions.phase` (`practice` | `test`, mặc định `practice`),
rồi viết đè ba hàm runtime để câu `test` không lộ gì khi đang làm và chỉ đoạn `test` tính điểm.
`check_homework_answer` **rebase trên `20260806`**, không phải `20260722` — lấy nhầm bản là mất bậc
thang Đúng/Sai 1,0/0,5/0,25/0,1.

Thứ tự:

1. Đọc phần đầu file: bất biến, lý do rebase và đường hoàn tác nằm ngay trong header.
2. Chạy toàn bộ [`../supabase/migrations/20260827_homework_test_phase.sql`](../supabase/migrations/20260827_homework_test_phase.sql).
   Nó mở `BEGIN;` và **có** `COMMIT;` ở cuối. Khối `DO $$` đầu file dừng ngay nếu một trong ba hàm
   chưa tồn tại — đó là dấu hiệu kho migration lệch với database, đừng chạy tiếp.
3. Chạy khối hậu kiểm ở cuối file (đang để dạng chú thích, bỏ `--` rồi chạy). Mọi cột `must_be_zero`
   phải bằng 0.
4. **Mốc đối chiếu — chạy TRƯỚC và SAU.** Truy vấn cuối khối hậu kiểm so `homework_attempts.score`
   đã lưu với điểm tính lại bằng công thức cũ, trên mọi attempt đã nộp. Phải trả **0 dòng** ở cả hai
   lượt. Migration không đụng vào điểm đã lưu, nên truy vấn này **không** chứng minh hàm mới đúng —
   nó chỉ xác nhận công thức cũ tái tạo được dữ liệu cũ, để nếu sau này có con số lệch thì biết chắc
   nó đến từ hàm mới. Chạy lượt "trước" mà đã ra dòng thì dừng và tìm hiểu trước khi nạp.
5. **Phép thử hồi quy thật:** sau khi nạp, cho một tài khoản học sinh làm và nộp **một bài tập KHÔNG
   có đoạn kiểm tra** (mọi câu `phase = 'practice'`). Điểm phải bằng đúng điểm công thức cũ cho ra.
   Đây mới là chỗ chứng minh nhánh tương thích ngược còn nguyên — không phải bước 4.
6. Sau đó mới smoke tính năng mới: tạo một bài tập có cả câu "Luyện" và câu "Kiểm tra", giao
   với **"Hiện phản hồi ngay" bật**, rồi kiểm bằng học sinh thật:
   - đoạn luyện: trả lời xong hiện đúng/sai **và lời giải**;
   - đoạn kiểm tra: nằm cuối, gom một phần, trả lời xong **không** hiện gì;
   - tải lại trang giữa đoạn kiểm tra: vẫn không lộ đáp án câu đã làm;
   - nộp bài: điểm khớp với riêng đoạn kiểm tra, không phải toàn bài.

Rollback: chạy lại `get_homework_attempt_questions` + `submit_homework_attempt` từ
`20260722_runtime_security_hardening.sql` và `check_homework_answer` từ
`20260806_moet_scoring_scale.sql`, rồi `ALTER TABLE public.homework_questions DROP COLUMN phase;`.
Không mất dữ liệu bài làm: cột chỉ mô tả cấu trúc đề.

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
- Không deploy pilot essay/hardening trước khi preflight, RLS/trigger/RPC negative tests và teacher-review smoke pass. `20260722` đã live nên practice và homework chấm ở RPC server; JWT negative test vẫn còn thiếu.
- Nếu commit có chạm đường tính điểm: `20260806` đã áp chưa, postflight `must_be_zero=0` chưa, và phép thử 3/4 ý một câu Đúng/Sai ra 0,5 chưa. Xem [`SCORING.md`](SCORING.md).
- Không deploy `.env`, `.ai-cache`, `.next`, tool index hoặc dữ liệu học sinh.
- **Có** deploy `public/tikz/` (110 SVG, 3,0 MB). Thiếu là mọi hình lý thuyết rơi xuống khung dự phòng.
- Smoke landing, login, một route student, một route admin và các API bảo mật sau deploy.

## 12. Hình TikZ của bài lý thuyết

### Dựng SVG

```powershell
npm.cmd run tikz:svg -- --chapters "D:/ToanTHPT/LATEX/HethongtrithucToanTHPT"
```

Cần `pdflatex` + `dvisvgm` trong PATH (MiKTeX đã có trên máy chủ dự án). Script
đọc `preamble.tex` + `tri-thuc.sty` để lấy màu, `\usetikzlibrary` và khối
`\tikzset`, biên dịch từng `tikzpicture` rồi ghi ra `public/tikz/<khoá>.svg`.

- Chạy lại nhiều lần thoải mái: hình đã có SVG thì bỏ qua. `--force` để làm lại tất cả.
- **Sửa hình trong `.tex` thì phải chạy lại**, nếu không web vẫn hiện hình cũ.
- Xem lại toàn bộ hình đã dựng: mở `/tikz/_preview.html`.
- Trạng thái 2026-08-11: 110/110 hình dựng thành công.

### ĐANG HỎNG: hình chưa hiện trên web (2026-08-11)

SVG đã dựng đủ và parser đã sinh đúng khối ```` ```tikz ````, nhưng **hình vẫn
chưa hiện khi xem thật trên trình duyệt**. Chưa tìm ra nguyên nhân — dừng ở đây
để làm tiếp sau. Không có gì phải rollback: các phần khác của màn nhập lý thuyết
đã chạy ổn.

Đường đi của một hình, để soi cho đúng chỗ:

```
file .tex  →  latexToMarkdown() bọc thành ```tikz
           →  MathContent: react-markdown gọi component `code`
           →  <TikzRenderer code={...}>
           →  tikzFigureKey(code)  →  <img src="/tikz/<khoá>.svg">
           →  onError  →  TikZJax  →  khung xổ mã
```

Nghi can, xếp theo thứ tự nên kiểm:

1. **Lệch khoá.** Đây là nghi can số một vì nó hỏng *im lặng*: web đi tìm tệp
   không có, `onError` bắn, rơi thẳng xuống TikZJax mà không báo gì. Script băm
   mã lấy trực tiếp từ `.tex`; component băm chuỗi mà react-markdown truyền vào
   (`String(children).replace(/\n$/, '')`). Hai chuỗi đó **chưa được kiểm là
   giống nhau trên trình duyệt**. Cách đo nhanh: mở DevTools → Network, lọc
   `tikz`, xem có request `/tikz/*.svg` nào 404 không, rồi so khoá trong URL với
   `public/tikz/manifest.json`.
2. **Dữ liệu cũ trong database.** Các bài lý thuyết nạp từ tháng 6 mang
   `content_md` sinh bởi parser CŨ (display math tụt thành `$`, và với 19/30
   file thì nội dung vốn đã hỏng). Xem trang `/learn` sẽ thấy bản cũ chứ không
   phải kết quả của parser mới. **Phải nhập lại** mới đánh giá được.
3. **Dev server chưa thấy tệp mới.** `public/tikz/` được thêm sau khi server
   đang chạy — dừng `npm run dev` và chạy lại.
4. **`format="markdown"` mới thêm.** Nếu thử trước lúc đó thì nội dung không đi
   qua react-markdown, nên `code` component không chạy và TikZ chỉ là chữ.
5. **`<img>` kẹt ở trạng thái `checking`.** `TikzRenderer` ẩn ảnh cho tới khi
   `onLoad` bắn. Nếu thấy vòng xoay "Đang tải hình..." đứng mãi thì là nhánh này.

Nếu cuối cùng phải bỏ `<img>`: phương án thay thế là nhúng thẳng nội dung SVG
vào DOM (fetch rồi `innerHTML` trong `.tikz-container`, class đó đã nằm trong
`ignoreHtmlClass` của MathJax). Đổi lại là mất cache ảnh của trình duyệt.

Bối cảnh đầy đủ và lý do không dùng TikZJax: [`LATEX_PARSER_DEBUG.md`](LATEX_PARSER_DEBUG.md).
