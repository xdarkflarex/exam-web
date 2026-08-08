# Đánh giá kỹ thuật toàn website

Ngày baseline toàn repo: **2026-07-19**. Delta pilot tự luận được kiểm tra tĩnh ngày **2026-07-21**; delta runtime hardening được chuẩn bị ngày **2026-07-22** và **đã áp trên Primary** (xác minh 2026-08-06). Delta thang điểm Bộ GD&ĐT: **2026-08-06**, source xong, migration **đã áp 2026-08-05** với postflight 30/30 `must_be_zero=0`, chuỗi gọi wrapper→internal→bậc thang và bảng giá trị bậc thang đều đã xác minh; còn phép thử end-to-end bước 6 chưa chạy.

## Delta 2026-07-22 — schema essay và hardening đều đã live, còn thiếu JWT/E2E

- `20260721_essay_assisted_grading.sql` và backfill sáu câu essay legacy `20260723_essay_legacy_config_backfill.sql` đã được áp trên Primary Database ngày 2026-07-22. Hai hậu kiểm tương ứng đạt 20/20 và 8/8 dòng `must_be_zero=0`; đây là bằng chứng cấu trúc/dữ liệu, chưa phải JWT/E2E.
- Output catalog ngày 2026-07-22 cho thấy baseline live khi đó vẫn có grant bảng quá rộng cho `anon`/`authenticated` và policy core dễ dãi. Đó là bằng chứng cần hardening; `20260722` đã áp sau đó nên số liệu này là **ảnh trước cutover**, không phải trạng thái hiện tại.
- Source + `20260722_runtime_security_hardening.sql` chuyển trust boundary của ba loại câu cũ trong `simulation`, `practice`, `homework` sang RPC server-side, rebuild closed baseline cho parent/child policy và grant, bảo vệ profile/question ownership, trọng số dương và áp feature/feedback/release gate ở server.
- **`20260722` đã được áp** — xác minh live ngày 2026-08-06 bằng `to_regprocedure`: `submit_exam_attempt_trusted_internal`, `can_edit_homework_question_links`, `get_my_safe_bookmarks` đều tồn tại và cả ba chỉ được định nghĩa trong file đó. Phần **còn chặn kết luận "đạt"** là postflight live cho parent policy/grant và negative test bằng JWT thật, không phải migration.
- Hai P1 còn mở ngay trong phạm vi này: homework chưa thống nhất semantics `teacher` với exact `admin`; entitlement của `history`/`analytics` chưa được enforce server-side đầy đủ.

Delta này cập nhật các mô tả source cũ bên dưới nhưng không đóng những finding khác. Không được diễn giải hardening ba luồng làm bài thành “toàn website đã an toàn”.

## Phạm vi và mức tin cậy

Đã thực hiện:

- Kiểm kê toàn bộ route, component, lib, type, SQL/migration và tài liệu.
- Đối chiếu query Supabase, role/middleware, runner và các luồng admin/student.
- Typecheck và ESLint toàn source.
- Tái kiểm tra tĩnh các finding từ browser review cũ trước khi xóa tài liệu cũ.
- Đối chiếu source và migration pilot `essay`/RPC submit-review/copy-paste AI.
- Đối chiếu output catalog live do người vận hành cung cấp và source/migration hardening 20260722.

Chưa thực hiện:

- E2E đăng nhập bằng tài khoản student/teacher/admin thật.
- Kiểm tra RLS/policy/grant bằng JWT student/teacher/admin và negative case trực tiếp trên Supabase.
- Test migration trên database trắng.
- Negative test JWT/E2E cho schema/RPC essay 20260721 đã live.
- Postflight live cho parent policy/grant của 20260722 (migration đã áp; hậu kiểm live chưa chạy).
- Gọi AI thật. Provider integration **đã có trong source** từ 2026-08-04 (`src/lib/essay-ai/`, worker, `POST /api/essay-ai/grade-queue`), nhưng chưa lượt gọi provider nào được kiểm chứng, và negative test quyền cho `essay_ai_usage` + `ai_finalize_essay_answer` bằng JWT student chưa chạy. Danh sách test bắt buộc ở `HANDOFF.md`.
- Full visual QA: in-app browser không attach local ổn định; HTTP local cũng phụ thuộc Supabase auth/network.

Vì vậy, các mục dưới đây là **đã xác nhận từ source/migration**; hành vi/dữ liệu production phải được tái hiện trước khi sửa hoặc đóng issue.

## Tóm tắt đánh giá

| Lĩnh vực | Kết luận |
|---|---|
| Độ rộng sản phẩm | Nhiều chức năng cho public, học sinh và admin; homework/knowledge đã có domain đáng kể |
| Kiến trúc | Monolith dễ triển khai nhưng business logic/query phân tán ở client page lớn |
| Type safety | TypeScript strict pass, nhưng Supabase không có generated Database types |
| Bảo mật | Chưa đạt toàn cục: schema/RPC essay và hardening 20260722 đều đã live nhưng chưa có JWT/E2E chứng minh đường ghi trực tiếp đã bị khóa; role semantics, OTP session binding, parent policy verification và entitlement history/analytics còn mở |
| Database | Chưa tái tạo được từ migration; snapshot và runtime expectation mâu thuẫn |
| Chất lượng | Lint fail, không test/CI; nhiều file 700-1000 dòng |
| Vận hành AI | Wiki cũ stale; đã thay bằng docs chuẩn + index/context script nhẹ |

## Baseline kiểm tra

- `npx.cmd tsc --noEmit --incremental false`: **pass**.
- ESLint: **fail**, 305 vấn đề = 113 error + 192 warning trên 85 file.
- `npm.cmd run build`: **pass** sau khi cho phép tải Google Fonts; sinh đủ 58 static page artifacts và toàn bộ route manifest.
- Next.js cảnh báo convention `src/middleware.ts` đã deprecated, nên migration sang `proxy` phải được làm như một thay đổi auth riêng có smoke test.
- Không có test runner, test/spec hoặc CI.

Top lint debt:

| Rule | Số lượng |
|---|---:|
| `no-unused-vars` | 117 |
| `no-explicit-any` | 83 |
| `react-hooks/exhaustive-deps` | 53 |
| `no-img-element` | 20 |
| `react-hooks/immutability` | 13 |
| `set-state-in-effect` | 5 |

Hotspot lint: admin exam detail, leaderboard, reports, question bank, student history, landing, attempt detail.

## P0 — phải xử lý trước khi tin cậy điểm/quyền

### P0.1 Schema essay đã live nhưng runtime trust boundary đầy đủ chưa tồn tại trên live

Bằng chứng:

- Catalog live đã cho thấy RLS bật nhưng grant/policy core trước hardening còn rộng; chỉ bật RLS không ngăn được direct key/score access nếu policy vẫn allow-all.
- Migration 20260721 và backfill 20260723 đã live với hậu kiểm 20/20 + 8/8 dòng bằng 0, nhưng các hậu kiểm đó chỉ xác nhận cấu trúc/dữ liệu được liệt kê.
- Source hiện lấy exam/practice question qua capability attempt, chỉ gửi raw answer và chấm bằng `submit_exam_attempt`/`submit_practice_attempt`; simulation giữ essay có nội dung ở `pending_review` và không release điểm trước policy.
- Homework hiện lấy bundle/check/submit qua RPC server, không tin grading field từ client và trả feedback/lời giải theo policy assignment; source từ chối `essay` ở practice/homework.
- Migration 20260722 rebuild policy/grant core gồm cả parent trust anchors, bảo vệ direct mutation, owner/link, legacy RPC và key reveal; wrapper submit simulation che điểm khi grading/release policy chưa đạt.
- Source `POST /api/auth/change-password` đổi mật khẩu bằng session user rồi mới clear `must_change_password` qua service role; trigger của 20260722 từ chối mọi thay đổi client-side của cờ này.
- 20260722 đã áp, nhưng parent policy/grant **chưa qua postflight live** và **chưa có JWT negative test** chứng minh đường trực tiếp đã bị khóa. Đó là lý do finding này còn mở, không phải vì migration.
- History/analytics và một số reader legacy vẫn có thể chưa hiểu `grading_status`/partial score hoặc chưa có entitlement server-side đầy đủ.

Tác động:

- Migration và source hardening ba mode đều đã live; điều chưa có là bằng chứng runtime. Deploy lệch phiên bản source/migration về sau vẫn làm flow không tương thích.
- Nếu parent trust anchor đang rộng hoặc sai owner, helper `SECURITY DEFINER` có thể khuếch đại quyền dù policy child đã đóng.
- Cho đến khi JWT tests pass, student vẫn có thể lộ key hoặc giả mạo grading qua đường direct table/RPC chưa được phát hiện.
- Analytics có thể coi essay pending/partial như sai nếu không filter đúng `grading_status`.

Điều kiện để hạ finding:

1. Chạy postflight 20260722 trên live: review parent policy/grant, legacy RPC và mọi trust anchor. Migration đã áp nên đây là hậu kiểm, không phải preflight.
2. Không chạy lại 20260721/20260722/20260723 đã commit. Sửa gì thì tạo migration forward mới, và nếu chạm hàm chấm thì rebase trên `20260806_moet_scoring_scale.sql`.
3. Dùng JWT thật test unauthenticated, basic-disabled feature, direct key/score write, cross-attempt/cross-class, wrong mode, teacher khác lớp, hash/rubric mismatch, submit hai lần và feedback/review timing.
4. Xác nhận simulation/practice/homework không thấy key/solution trong network trước policy và không thể gọi direct table mutation để tự chấm.
5. Đưa history/analytics qua entitlement server-side và chỉ dùng điểm final/partial score đúng nghĩa trước khi hạ finding toàn cục.

### P0.2 Migration không dựng lại được database

Bằng chứng:

- Chuỗi migration gia tăng vẫn thiếu baseline cho profiles/classes/questions/exams/theories/blocks. Các migration essay pilot và runtime hardening đều phụ thuộc core table runtime.
- Migration knowledge gọi bảng/function nền chưa được tạo trong chain.
- `database/SUPABASE_SCHEMA.sql` là context snapshot, thiếu homework mới và còn mastery đã drop.
- `20260621_cleanup_mastery.sql` drop mastery table/RPC, trong khi `src/lib/theories/actions.ts` vẫn query/call chúng.
- Không có `supabase/config.toml` hoặc generated Database types.

Tác động: môi trường mới, CI và rollback không tái tạo; query cột cũ vẫn qua typecheck.

Hướng sửa: tạo baseline canonical từ schema runtime đã làm sạch, test reset trên project tạm, generate types, rồi mới viết migration tiếp.

### P0.3 Role, OTP, API và RLS không có một semantics

Bằng chứng:

- `isAdmin()` coi `teacher` và `admin` đều có quyền admin.
- Nhiều API/policy homework/OTP kiểm tra exact `role === 'admin'`.
- Middleware source hiện chỉ buộc exact `admin` hoàn tất OTP, đồng thời chuyển `teacher` ra khỏi `/admin/verify-otp`; teacher vẫn có thể vào admin shell qua `isAdmin()` nên API/RLS phải scope riêng.
- Hardening 20260722 vẫn giữ homework helper/policy exact `admin` trong khi admin UI/middleware có thể cho `teacher` vào; đây là P1 semantics có chủ đích chưa giải quyết, không phải lý do nới một policy riêng lẻ.
- Constraint role live hiện chỉ chấp nhận `admin|student`; đừng tự thêm `teacher` để kiểm thử.
- Middleware return sớm cho mọi `/api/*`; OTP middleware không bảo vệ server mutation.
- Cookie `admin_2fa_verified=true` sống 6 giờ, không gắn user/session; logout admin không xóa cookie.
- OTP dùng `Math.random`, lưu plaintext; không thấy attempt counter/rate limit đầy đủ.
- `question_knowledge_links`, `assignment_knowledge_targets` và mastery migration có policy `FOR ALL USING (true)` cho authenticated/public role tùy file.

Tác động:

- Teacher có thể bị kẹt hoặc có quyền không nhất quán.
- Đổi account trong cùng browser có nguy cơ kế thừa trạng thái OTP.
- API mutation nhạy cảm có thể bỏ qua yêu cầu OTP.
- Mapping/mastery có thể bị client không có quyền quản trị sửa nếu policy đã áp.

Hướng sửa:

1. Chốt role matrix và teacher scope.
2. Tạo server authorization helper dùng chung cho page/action/API.
3. Bind 2FA assertion với user id + session/auth time; clear logout; OTP CSPRNG + hash + rate limit.
4. Thay policy allow-all bằng ownership/role policy và RLS negative tests.

## P1 — sai nghiệp vụ hoặc bypass đáng kể

### P1.1 Rule đề thi được lưu nhưng chưa enforce nguyên tử

Baseline lưu `start_time`, `end_time`, `max_attempts`, `show_results_immediately`, `allow_review` nhưng chưa enforce đầy đủ/atomic. Hardening 20260722 đã live và có kiểm tra server ở start/submit cùng release result, nhưng chưa có test runtime chứng minh; create exam vẫn đưa câu vào part 1 và `passing_score` chưa chắc cùng thang với score attempt.

Về thang điểm: từ `20260806_moet_scoring_scale.sql`, điểm attempt là thang 10 quy đổi từ `SUM(exam_questions.score)` — nên `passing_score` phải hiểu theo thang 10, không theo tổng thô. Xem [`SCORING.md`](SCORING.md).

Fix tại server transaction tạo/nộp attempt, không chỉ disable UI.

### P1.2 Access tier mới chỉ được harden cho ba luồng làm bài

Baseline dùng `getFeatureFlags`/`hasFeatureAccess` chủ yếu để ẩn menu. Hardening 20260722 đã live với `student_has_feature` tại RPC cho `simulation`, `practice`, `homework`, nhưng `history`/`analytics` vẫn chưa có quyết định entitlement server-side tương đương.

Giữ một server-side access decision dùng chung cho nav, route/action và RLS/data scope; mở rộng có kiểm thử sang history/analytics thay vì chỉ ẩn link.

### P1.3 Homework result dùng mẫu số sai

`src/app/admin/homework/[id]/results/page.tsx` cộng `homework_attempts.total_questions`, có thể là 0 hoặc chỉ số câu phiên. Progress không clamp; UI có thể hiện `10/0` hoặc hơn 100%.

Fix: lấy tổng câu canonical từ `homework_questions`; tách tiến độ phiên/toàn bài, xử lý denominator unknown.

### P1.4 Homework feedback policy đã có local, chưa được chứng minh live

Baseline `HomeworkRunner` render đúng/sai, explanation và solution ngay sau khi trả lời. Source + migration 20260722 đã chuyển việc chấm/return key sang `check_homework_answer` và lưu `show_feedback_immediately`/`allow_review`; cả hai đã live nhưng chưa được test bằng JWT/network.

Điều kiện đóng: server chỉ trả content được phép theo attempt status/deadline trong cả direct RPC/table path, với test assignment bật/tắt từng policy.

### P1.5 Analytics/history bỏ qua homework

`/student/history`, `/admin/students`, student detail chủ yếu đọc `exam_attempts`/`student_answers`; homework dùng bảng riêng. Học sinh có hoạt động homework vẫn có thể hiện “0 lượt thi/không hoạt động”.

Fix: service activity/capability chuẩn, định nghĩa metric và label rõ, scope theo giáo viên/lớp.

### P1.6 Trang cũ query schema cũ

`admin/reports`, badges, goals có các dấu hiệu `status='completed'`, `exam_attempts.user_id`, `exams.time_limit`, `classes.description`; snapshot mới dùng `submitted/graded`, `student_id`, `duration` và có thể không có description.

Fix sau khi generate Database types; thêm integration query test cho từng route.

### P1.7 Một số mutation nhiều bước vẫn không transaction

Simulation/practice/homework submit đã có transaction RPC trong migration local, nhưng chưa test live. Create exam và theory import vẫn thực hiện nhiều insert/update tuần tự, một số rollback thủ công hoặc bỏ qua lỗi edge. Crash giữa bước tạo state nửa chừng.

Fix bằng RPC/server transaction + idempotency key và verify count.

### P1.8 Public enrollment dùng service role, chưa chống abuse

`POST /api/enrollments` public validate cơ bản rồi service-role insert; chưa có CAPTCHA/rate limit/dedupe/payload size guard rõ.

Fix rate limit theo IP + fingerprint hợp lý, honeypot/CAPTCHA tùy threat model, unique/dedupe và monitoring; service role vẫn chỉ server.

### P1.9 Pilot AI tự luận chưa có vận hành production

Gói chấm không đính kèm profile/email/lớp và parser kiểm tra schema/ref/rubric/score, nhưng vẫn chứa nguyên văn bài học sinh và đáp án tham chiếu. Không có PII scrub tự động, provider allowlist, data-retention policy, retry/cost/rate control hoặc đánh giá độ lệch model. Giáo viên duyệt bắt buộc giúp giảm rủi ro chốt điểm, không làm output AI trở thành bằng chứng đúng.

Giữ copy/paste thủ công ở staging; ban hành quy tắc nhà cung cấp/dữ liệu và benchmark rubric trước khi cân nhắc API AI tự động. Chi tiết tại `docs/ESSAY_GRADING.md`.

## P2 — nợ chất lượng/trải nghiệm

- `admin/reports` và `admin/announcements` render `AdminSidebar` lần nữa dù admin layout đã có.
- Sidebar gọi `/learn/map` với label “Cây kỹ năng” nhưng route chỉ redirect `/learn`.
- Badges/bookmarks/goals/leaderboard là UI đảo cũ, không dùng student shell thống nhất.
- Question bank giới hạn 500 record gần nhất; thiếu pagination/server search đáng tin cậy.
- `QuestionEditor`, `useSessionTimeout`, route `/exam/[attemptId]/result` có dấu hiệu dead/legacy, cần xác minh call-site trước khi xóa.
- Có cả npm và pnpm lock; pnpm lock giữ dependency graph cũ.
- `.env.example` cũ có public AI key không dùng và thiếu site URL.
- Nhiều file page/action 700-1000 dòng, query + state + UI trộn; tăng blast radius và lint debt.
- Middleware auth call xảy ra trước public return cho root/login flow; availability trang public phụ thuộc Supabase hơn cần thiết.

## Thứ tự xử lý đề nghị

### Phase 0 — đóng trust boundary

1. Chạy postflight parent policy/grant và JWT negative tests cho simulation/practice/homework trên live (20260722 đã áp); không chạy lại 20260721/20260722/20260723 đã live.
2. Role/teacher matrix + API authorization + OTP session binding.
3. Audit và khóa policy allow-all.

### Phase 1 — database tái tạo được

1. Baseline migration + generated types.
2. Xóa/di trú code schema/mastery legacy sau call-site audit.
3. RLS/integration tests trong Supabase local/test project.

### Phase 2 — đúng nghiệp vụ

1. Exam rule/time/max attempts/review policy.
2. Hoàn tất feature access server-side cho history/analytics và các route ngoài ba runner.
3. Homework feedback/progress.
4. Unified activity/analytics exam + homework.

### Phase 3 — chất lượng và vận hành

1. Test runner + CI; auth/runner/RLS E2E trước.
2. Giảm lint debt theo hotspot, không mass-disable.
3. Tách page lớn thành domain service/query/view model.
4. Chốt npm, xóa lock/dead code sau xác minh.

## Điều kiện để gọi là production-ready

- Không có answer key/grading trust ở client trong mọi mode, không chỉ pilot simulation.
- Database dựng từ migration trắng và generated types khớp.
- Role/access/OTP/RLS negative tests pass.
- Bốn question type và ba mode được hỗ trợ/chặn có chủ đích, có E2E create/resume/submit/pending-review/result.
- Mọi gợi ý essay có audit và giáo viên duyệt; privacy/provider policy được chốt trước khi tự động gọi AI.
- Lint/typecheck/build/CI pass theo policy đã chốt.
- Monitoring lỗi API, enrollment abuse, submit failures và migration health.
- Browser QA desktop/mobile, student/admin, light/dark hoàn tất bằng dữ liệu test.
