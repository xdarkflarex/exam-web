# Hợp đồng làm việc cho AI

File này là chỉ dẫn chuẩn duy nhất cho mọi AI làm việc trong repo. `CLAUDE.md`, `GEMINI.md` và Copilot chỉ trỏ về đây. Chỉ dẫn hệ thống và yêu cầu trực tiếp của người dùng luôn có ưu tiên cao hơn.

## 1. Thứ tự đọc bắt buộc

1. Đọc yêu cầu và kiểm tra `git status --short --ignore-submodules=all`.
2. Đọc file này.
3. Đọc `docs/PROJECT_MAP.md` và tài liệu miền liên quan.
4. Với yêu cầu rộng/chưa rõ, nếu Ollama local đã sẵn sàng, chạy `node scripts/ai-rag.mjs query "<mô tả ngắn>" --top 6 --max-bytes 60000` để chọn seed; không dùng RAG để thay thế kiểm tra nguồn sự thật.
5. Dùng `node scripts/ai-context.mjs` với `--route`, `--table`, `--file` hoặc `--changed`; sau RAG, ưu tiên `--file <seed>` và `--max-bytes 120000`. Lệnh này tự làm mới index trước khi đóng gói.
6. Đọc pack trong `.ai-cache/context/`, sau đó mới mở thêm các file nguồn được xếp hạng. Chỉ dùng `--no-refresh` khi cố ý giữ một snapshot đã biết.

Không quét `.next`, `node_modules`, `.git`, `.ai-cache`, `.understand-anything`, `.gitnexus`, `.cocoindex*` hoặc output sinh tự động.
Vector/output của `ai-rag` cũng nằm trong `.ai-cache/rag/`, chỉ dùng Ollama loopback và tuyệt đối không commit.

## 2. Phạm vi và worktree

- Repo thường có thay đổi chưa commit. Mọi thay đổi sẵn có thuộc về người dùng; không reset, checkout, format hàng loạt hoặc ghi đè chúng.
- Chỉ sửa file cần thiết cho yêu cầu. Nếu phải chạm file đang dirty, đọc diff trước và giữ nguyên phần không liên quan.
- Không tự ý đổi package manager, framework, kiến trúc database hoặc thiết kế sản phẩm.
- Không sửa/xóa migration đã có thể đã chạy. Tạo migration mới, có thứ tự và có kế hoạch rollback/verify.

## 3. Nguồn sự thật

Ưu tiên theo thứ tự:

1. Database Supabase đang chạy và RLS thực tế, nếu có quyền kiểm tra.
2. `supabase/migrations/**` theo thứ tự thời gian.
3. Source runtime trong `src/**`.
4. `ai/project.manifest.json` và tài liệu trong `docs/**`.
5. `database/SUPABASE_SCHEMA.sql` cùng các file `database/*.sql` chỉ là snapshot/script lịch sử.

Bộ migration hiện chưa dựng được database trắng. Không khẳng định schema chỉ từ một snapshot và không chạy `database/SUPABASE_SCHEMA.sql` vào production. Khi phát hiện lệch, ghi rõ bằng chứng và cập nhật tài liệu cùng bản sửa.

## 4. Bất biến nghiệp vụ

### Mode đánh giá

- `simulation`: thi thử; dùng domain `exams`, `exam_questions`, `exam_attempts`, `student_answers`.
- `practice`: ôn tập; dùng chung cấu trúc exam nhưng phải lọc đúng `exam_mode='practice'`.
- `homework`: domain riêng `homeworks`, `homework_*`; không tạo logic mới dựa vào `exams.exam_mode='homework'`.
- Public/leaderboard thi thử chỉ được lấy `simulation`.
- Không trộn attempt/answer của exam và homework khi chưa có lớp tổng hợp với định nghĩa metric rõ ràng.

### Câu hỏi và chấm điểm

- Bốn dạng trong source: `multiple_choice`, `true_false`, `short_answer`, `essay`. `essay` là pilot tự luận riêng, không được đổi nghĩa hoặc migrate ngầm dữ liệu `short_answer`.
- Không gửi `answers.is_correct`, đáp án chuẩn hoặc lời giải xuống client trước thời điểm chính sách cho phép.
- Không tin `is_correct`, `score`, `student_id`, role hoặc access tier do client gửi lên.
- Chấm điểm và chốt attempt phải ở server/RPC transaction, idempotent và được RLS bảo vệ.
- Practice có thể phản hồi ngay; simulation và homework phải theo chính sách feedback đã lưu, mặc định không lộ lời giải khi đang làm.

### Pilot tự luận có AI hỗ trợ

- Pilot hiện chỉ áp dụng cho `simulation`; không thêm `essay` vào practice hoặc homework khi chưa có thiết kế/chấm server-side tương ứng.
- Luồng đang chạy trên source hiện tại là thủ công: giáo viên copy gói chấm không kèm profile/email/lớp, paste JSON gợi ý về, tự kiểm tra/sửa và gọi `review_essay_answer` để duyệt. Luồng này vẫn phải hoạt động kể cả sau khi có pipeline tự động, vì nó là đường lui khi provider hỏng.
- Chủ dự án đã quyết định ngày 2026-08-03 rằng AI **được phép** tự chốt điểm và công bố cho học sinh khi giáo viên offline. Quyết định này thay thế bất biến "AI không được tự chốt điểm" trước đó. Các ràng buộc dưới đây là điều kiện đi kèm, không phải khuyến nghị:
  - Điểm AI chỉ được ghi qua trusted RPC server-side sau khi validator đạt; không có đường nào cho client hoặc worker ghi thẳng trường điểm.
  - Auto-chốt phải qua hai kill-switch tách rời: `ESSAY_AI_ENABLED` (toàn pipeline) và `ESSAY_AI_AUTO_FINALIZE` (chỉ phần chốt điểm). Mặc định cả hai tắt. Mọi trạng thái không chắc chắn phải fail-closed về `pending_review`, không bao giờ fail-open thành điểm 0 hoặc điểm tối đa.
  - `student_answers.grading_status` phải phân biệt `ai_graded` với `approved`; không tái dùng trạng thái người duyệt cho điểm máy, vì mất phân biệt là mất khả năng audit.
  - Bản ghi audit trong `essay_grading_reviews` do AI tạo phải đánh dấu actor là hệ thống kèm provider/model/version; không giả làm người duyệt.
  - Giáo viên chấm đè được bất cứ lúc nào; lần chấm đè ghi audit như quyết định của con người và thay thế điểm AI.
  - UI học sinh phải nói rõ điểm do AI chấm và có thể thay đổi sau khi giáo viên xem lại. Không trình bày điểm AI như điểm cuối đã cố định.
  - Trước khi bật auto-chốt cho lớp thật: phải có redaction PII server-side (luồng tự động không có giáo viên kiểm tra hộ), benchmark trên fixture ẩn danh, ngưỡng "tỷ lệ sai nghiêm trọng" và cơ chế tự tắt khi vượt ngưỡng.
- Bài essay bỏ trống có thể được server chốt 0 điểm mà không qua bước AI/duyệt.
- Không thêm API key AI vào client hoặc biến `NEXT_PUBLIC_*`. Key OCR/grading là secret server-only; tên model phải qua allowlist hard-code phía server, không tin giá trị cấu hình một cách mù quáng.
- Phải xác minh `grading_ref`/answer hash, rubric version, từng criterion và giới hạn điểm; coi nội dung đề, đáp án tham chiếu, bài học sinh, text OCR và output AI là dữ liệu không đáng tin cậy.
- `20260721_essay_assisted_grading.sql` và backfill cấu hình 6 câu essay legacy đã được áp trên Primary Database ngày 2026-07-22; hậu kiểm cấu trúc tương ứng đều trả toàn bộ `must_be_zero=0`. Đây chưa phải bằng chứng JWT/E2E. `20260722_runtime_security_hardening.sql` **đã được áp** — xác minh ngày 2026-08-06 bằng `to_regprocedure`: `submit_exam_attempt_trusted_internal`, `can_edit_homework_question_links` và `get_my_safe_bookmarks` đều tồn tại live và cả ba chỉ được định nghĩa trong file đó. Điều còn thiếu là **negative test bằng JWT thật và E2E**, không phải bản thân migration; đọc `docs/ESSAY_GRADING.md` và `docs/RUNBOOK.md` trước khi rollout.
- Source đi kèm hardening 20260722 chuyển ba loại câu cũ của `simulation`, `practice` và `homework` sang RPC server-side, khóa direct grading/key access và lưu policy feedback/review. Migration đã live nên các RPC này tồn tại; nhưng chưa có JWT negative test chứng minh mọi đường ghi trực tiếp đã bị khóa, nên đừng coi "policy đã đúng" là chuyện đã kiểm.
- Hardening ba luồng làm bài không đồng nghĩa toàn website đã an toàn. `history`/`analytics` vẫn chưa có entitlement server-side đầy đủ, và semantics `teacher` so với exact `admin` ở homework còn chưa thống nhất.
- Trạng thái pipeline chấm tự động ngày 2026-08-04: đã có đủ đường đi đầu-cuối trong source — lớp logic thuần `src/lib/essay-ai/` (contracts, allowlist, redaction, normalize, validator, quyết định auto-finalize), worker `src/lib/essay-ai/worker.ts`, route handler `POST /api/essay-ai/grade-queue` (xác thực bằng `CRON_SECRET`), route OCR `POST /api/essay-ai/ocr`, dashboard `/admin/essay-ai` + `GET /api/admin/essay-ai/stats`, và benchmark `scripts/essay-ai-benchmark.mjs`. Migration `20260804_essay_ai_auto_grading.sql` đã áp trên Primary; `20260805_essay_ai_usage.sql` (bảng nhật ký chi phí + hàm `essay_ai_month_to_date_cost`) **chưa áp**. Kế hoạch và thứ tự gate nằm ở `docs/ESSAY_AUTO_GRADING_PLAN.md`.
- **`ESSAY_AI_AUTO_FINALIZE` đã bật `true` (quyết định của chủ dự án, 2026-08-06).** Lý do: đây là lớp học thêm, điểm không phải điểm học bạ của trường, nên chủ dự án chấp nhận rủi ro AI chấm sai và sẽ sửa tay khi phát hiện. Quyết định này thay thế yêu cầu "phải giữ `false` cho tới khi benchmark trên fixture thật xong" ở các bản trước.

  **`ESSAY_AI_OVERRIDE_MIN_COMPARED` = 0 (đổi 2026-08-07).** Chủ dự án bỏ yêu cầu tích luỹ 20 bài đối chiếu trước khi cho auto-chốt: bài ĐẦU TIÊN cũng được AI chốt điểm ngay, vì yêu cầu sản phẩm là học sinh nộp xong thấy điểm luôn. Hai ngưỡng tỷ lệ (`MAX_CHANGED_RATE`, `MAX_SERIOUS_RATE`) vẫn siết từ bài đối chiếu đầu tiên, nên phanh tự động không mất — nó chỉ không còn chặn lúc chưa có dữ liệu. **Bất biến phải giữ:** nhánh `compared === 0` trong `evaluateOverrideGuard` phải tường minh. `0/0` cho `NaN` và `NaN > ngưỡng` luôn false, nên xoá nhánh đó thì cổng vẫn "mở" nhưng vì số học chứ không vì quyết định — đúng-tình-cờ, và đúng-tình-cờ thì hỏng lúc nào không biết.

  **`ESSAY_AI_CONFIDENCE_MIN` để trống = 1.0 = auto-chốt gần như không bao giờ chạy.** Mặc định này có chủ đích (cấu hình sai phải làm hệ thống thận trọng hơn), nhưng nó là cái bẫy đã tốn một buổi chẩn đoán ngày 2026-08-07: DeepSeek trả `confidence 0.95` vẫn bị chặn bằng `low_grading_confidence`, và nhìn từ ngoài giống hệt "AI không chấm được". Muốn auto-chốt chạy thì phải đặt số cụ thể.

  Ba điều dưới đây vẫn là bất biến kỹ thuật, không phải điều kiện chờ:
  - **OCR snapshot: xong trong source 2026-08-07, migration `20260807` đã nạp trên Primary cùng ngày.** Trước đó `POST /api/essay-ai/ocr` trả text về trình duyệt và không lưu `confidence`/`warnings`, worker truyền `ocr: null`, và nhánh `if (ocr)` **cho qua** — ba cổng `low_ocr_confidence`, `ocr_warning`, `math_region_uncertain` không bao giờ kích hoạt. Đó là fail-OPEN giữa module fail-closed, đúng chỗ nguy hiểm nhất của môn Toán (sai một dấu âm là đảo ngược kết luận, mà AI vẫn chấm tự tin vì nó chấm đúng theo cái nó thấy). **Bất biến phải giữ:** `FinalizeInput.ocr` là union ba trạng thái `typed` / `scanned` / `scanned_snapshot_missing`, không được gộp lại thành nullable — `null` mang hai nghĩa trái ngược ("gõ tay", an toàn; "mất dấu vết", nguy hiểm) là nguyên nhân gốc của lỗ hổng. Dùng `switch` trên union để TypeScript ép kiểm đủ nhánh. **Còn nợ một bản sửa quyền:** postflight `20260807` báo `service_role_thua_quyen_sua = 2` — bảng nhật ký OCR **không** append-only như file tuyên bố, vì `ALTER DEFAULT PRIVILEGES` của Supabase cấp `ALL` cho mọi bảng mới trong `public` và câu `REVOKE` của `20260807` không liệt kê `service_role`. `20260808_essay_ocr_snapshots_lock_append_only.sql` sửa việc này và **đã nạp ngày 2026-08-06**: postflight toàn bộ `must_be_zero = 0`, negative test runtime qua PostgREST 5/5 đạt (`scripts/essay-ocr-snapshot-permission-check.mjs`). Lưu ý khi đọc lịch sử: preflight lúc nạp báo `xac_nhan_loi_service_role_thua_quyen = 0` chứ không phải 3 như RUNBOOK dự đoán — quyền thừa đã được gỡ ở đâu đó ngoài quy trình ghi chép, nên migration chạy như no-op. ACL cuối cùng vẫn đúng, đã xác minh bằng `information_schema.role_table_grants` (chỉ còn `SELECT`, `INSERT`).

  **Worker phải đọc HẾT snapshot của một bài, không lấy dòng mới nhất** (sửa 2026-08-06). `essay_ocr_snapshots` cố ý không UNIQUE trên `(attempt_id, question_id)` vì học sinh chụp nhiều trang, và `ExamRunner` **nối** text mỗi lần chụp vào cùng một ô trả lời — bài nộp là hợp của N lần đọc máy. Bản trước dùng `.order(created_at desc).limit(1)` nên đánh giá cả bài bằng đúng tấm ảnh cuối: chụp trang 1 mờ (0,35) rồi trang 2 rõ (0,96) thì cổng chỉ thấy 0,96 và auto-chốt một bài mà nửa đầu đọc ở mức 0,35. `aggregateOcrEvidence()` gộp theo hướng chặn: confidence lấy **nhỏ nhất**, cảnh báo lấy **hợp**. Không đổi sang trung bình — trung bình cho một trang rõ bù cho một trang không đọc được.
  - **Cái bẫy default privileges áp cho mọi bảng mới.** Không được suy "không viết `GRANT UPDATE`" thành "không có quyền UPDATE": bảng tạo trong `public` sinh ra đã có `ALL` cho `postgres, anon, authenticated, service_role`. Bảng chỉ-`service_role` phải `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` **trước** khi `GRANT` đúng tập quyền cần. Postflight quyền phải đếm cả `TRUNCATE` (xoá sạch bảng mà không cần `DELETE`) và kiểm chủ sở hữu bảng (chủ sở hữu có đủ quyền bất chấp `REVOKE`). Rà toàn schema bằng `supabase/preflight/20260808_default_privileges_audit.sql`.
  - **Benchmark trên fixture thật vẫn chưa chạy, và giờ nó là việc tuỳ chọn chứ không phải cổng chặn.** `scripts/essay-ai-benchmark.mjs` đã có nhưng `fixtures/essay-ai/` chỉ chứa fixture mẫu. Vai trò của nó đã được thay bằng ramp 20 bài của `override-guard.ts` (xem trên) — chạy trên bài thật thay vì fixture soạn sẵn. Vẫn đáng chạy nếu muốn đo calibration của `confidence` một cách có kiểm soát: nếu nhóm AI tự tin không chính xác hơn nhóm không tự tin thì cổng chặn theo confidence không lọc được gì, và ramp 20 bài không phát hiện được điều đó.

  `ESSAY_AI_ENABLED=true` là đủ để dùng tính năng chụp ảnh và nhận gợi ý chấm; cờ thứ hai mới khiến điểm máy hiện ra với học sinh. UI học sinh phải nói rõ đó là điểm AI và có thể đổi sau khi giáo viên xem lại — ràng buộc này không đổi khi bật cờ.

### RLS: đừng để phân quyền phụ thuộc RLS/GRANT của bảng khác

Quy tắc này rút ra từ **ba lỗi thật trong cùng ngày 2026-08-07**, ba chỗ khác nhau, một nguyên nhân:

| # | Chỗ hỏng | Triệu chứng | Sửa ở |
|---|---|---|---|
| 1 | Policy `storage.objects` đọc `exam_attempts` | Học sinh không xem lại được ảnh bài làm sau khi nộp | `20260811` |
| 2 | `gateAttempt()` đọc `exam_attempts` bằng session học sinh | `grade-mine` luôn trả 404, không bài nào được chấm | service_role + so `student_id` tường minh |
| 3 | Policy `announcements` đọc `profiles` | Khách chưa đăng nhập nhận 401, trang chủ mất thông báo | `20260812` |

- **Không viết `EXISTS (SELECT ... FROM bảng_khác)` trong policy.** Bọc phép kiểm vào hàm `SECURITY DEFINER` trả `boolean`, `SET search_path = public, pg_temp`, `REVOKE` khỏi vai trò không cần. Hàm chỉ trả đúng/sai nên không rò rỉ dữ liệu; tham số là thứ người gọi đã biết.
- **Luôn viết mệnh đề `TO`.** Policy thiếu `TO` áp cho MỌI vai trò (`pg_policies.roles` hiện `{public}`). Policy permissive được OR ở **kết quả**, nhưng biểu thức của chúng vẫn phải **đánh giá được** — một policy không dành cho `anon` vẫn làm hỏng truy vấn của `anon` nếu nó chạm bảng `anon` không đọc được. Đây là điểm dễ hiểu sai nhất về RLS.
- **`FOR ALL` bao gồm `SELECT`.** Policy quản trị viết `FOR ALL` mà không giới hạn `TO` sẽ chen vào mọi truy vấn đọc của mọi người.
- **Postflight đọc catalog KHÔNG chứng minh được lớp lỗi này.** `20260809` có postflight đạt toàn bộ trong khi tính năng hỏng hoàn toàn. Mọi migration đụng policy phải kèm phép thử bằng JWT/anon key thật qua PostgREST, và phải kiểm cả nhánh ngược khi bản sửa nới quyền.
- **Không dùng Supabase SQL Editor để kiểm RLS.** Editor chạy bằng vai trò chủ sở hữu: `auth.uid()` là `NULL` và `FORCE ROW LEVEL SECURITY` không áp, nên mọi policy trông như bị bỏ qua.

### Quyền truy cập

- Role hiện có ý nghĩa: `student`, `teacher`, `admin`; helper `isAdmin` coi `teacher` và `admin` có quyền quản trị, nhưng nhiều policy/API hiện chỉ chấp nhận exact `admin`. Không mở rộng hoặc thu hẹp quyền khi chưa đồng bộ middleware, handler, RLS và UI.
- `/api/*` bị middleware bỏ qua. Mỗi route handler phải tự xác thực user, role, resource ownership và input.
- Ẩn menu không phải authorization. `access_tier`/feature flags phải được guard ở server/page/action và RLS nếu bảo vệ dữ liệu.
- Query giáo viên phải scope theo lớp `classes.teacher_id`; admin hệ thống mới được xem toàn cục.
- Đặc biệt ở homework, source admin UI có thể cho `teacher` đi vào nhưng helper/policy runtime còn exact `admin`; coi đây là P1 đang mở, không nới policy riêng lẻ để chữa triệu chứng.
- Feature gate server-side 20260722 mới bao phủ luồng làm bài `simulation`/`practice`/`homework`; không suy diễn rằng `/student/history` và `/student/analytics` đã được bảo vệ tương đương.
- Thay đổi auth, OTP, RLS, service-role hoặc tạo tài khoản là thay đổi bảo mật cao: cần test negative case 401/403 và cross-user/cross-class.

## 5. Secret và dữ liệu

- Không đọc, in, copy hoặc commit `.env`; chỉ dùng tên biến từ `.env.example`.
- `SUPABASE_SERVICE_KEY`, database URL, OTP, mật khẩu tạm và token không được đưa vào client, tài liệu, log hoặc context pack.
- Gói chấm AI không được chứa profile, email, lớp hoặc định danh học sinh. Nếu bài làm tự chứa dữ liệu cá nhân, phải loại bỏ trước khi gửi cho dịch vụ ngoài.
- `mcp.json` là cấu hình đặc quyền. Không chạy MCP database hay lệnh `npx -y` từ đó nếu người dùng chưa cho phép và chưa xác minh package/version.
- Không dùng dữ liệu học sinh thật trong fixture, ảnh chụp, prompt hoặc test output.

## 6. Quy ước code và UI

- TypeScript strict; alias `@/*` trỏ tới `src/*`.
- Ưu tiên primitive hiện có trong `src/lib`, `src/components`, `src/hooks`; tránh thêm lớp trùng chức năng.
- UI người dùng bằng tiếng Việt, responsive, hỗ trợ light/dark và không phá luồng MathJax/TikZ/Markdown.
- Dùng token/pattern trong `docs/DESIGN_SYSTEM.md`; giữ trải nghiệm ít chói, không thêm nền trắng gắt hoặc animation cản việc làm bài.
- Route cũ có người dùng phải redirect có chủ đích thay vì xóa im lặng.

## 7. Quy trình thay đổi

1. Tái hiện hoặc xác định bằng chứng từ call-site/query/migration.
2. Xác định blast radius bằng index và `rg`; kiểm tra importer, route và bảng dùng chung.
3. Viết thay đổi nhỏ nhất giải quyết nguyên nhân gốc.
4. Với data change: kiểm tra RLS, ownership, mode filter, trạng thái attempt và đường rollback.
5. Cập nhật tài liệu nếu route, biến môi trường, schema, quyền, mode hoặc lệnh vận hành thay đổi.
6. Chạy kiểm tra theo rủi ro và báo cáo rõ phần không thể chạy.

## 8. Ma trận xác minh

Tối thiểu cho mọi thay đổi TypeScript:

```powershell
npx.cmd tsc --noEmit --incremental false
npx.cmd eslint <cac-file-da-sua>
```

Thêm `npm.cmd run build` khi sửa route/layout/config/dependency hoặc trước release.

Thay đổi auth/API/RLS:

- Chưa đăng nhập -> 401 hoặc redirect đúng.
- Sai role -> 403/redirect đúng.
- Đúng role nhưng sai owner/lớp -> không đọc/ghi được.
- Không thể sửa score/role/user id bằng payload client.

Thay đổi exam/practice/homework:

- Kiểm tra đủ ba question type cũ; thay đổi simulation essay phải kiểm tra thêm `essay`, blank essay, nhiều essay và trạng thái chờ duyệt.
- Resume, autosave, submit hai lần, hết giờ và reload.
- Xác nhận mode không xuất hiện ở bề mặt của mode khác.
- Xác nhận đáp án/lời giải không lộ trước chính sách.

Thay đổi pilot essay:

- Student không ghi/sửa/xóa trực tiếp được answer đã nộp, grading fields hoặc tổng điểm simulation.
- AI JSON sai `grading_ref`, rubric version, criterion hoặc giới hạn điểm phải bị từ chối.
- Teacher sai đề/lớp không đọc/chốt được; teacher đúng scope vẫn phải tự duyệt điểm cuối.
- Khi còn essay `pending_review`, student không thấy điểm tổng; sau câu cuối, điểm được tính lại trên server theo thang 10.

## 9. Baseline chưa được phép che giấu

- Typecheck pass ở audit 2026-07-19.
- Lint toàn repo đang fail: 113 error, 192 warning.
- Không có CI. Có test đơn vị chạy bằng test runner của Node: `npm test` (`node --experimental-strip-types --test "src/**/*.test.ts"`).
- Có các P0 bảo mật/schema trong `docs/SECURITY_AND_AUDIT.md`.
- Schema/RPC pilot essay 20260721 và backfill legacy đã live với hậu kiểm cấu trúc bằng 0; hardening ba mode 20260722 cũng đã live (xác minh 2026-08-06). Điều còn thiếu là JWT negative test và E2E, không phải migration. `essay` không mở rộng sang practice/homework.
- Thang điểm (`20260806_moet_scoring_scale.sql` + `src/lib/exam/scoring.ts`): thang Bộ GD&ĐT chỉ áp cho **đề thi thử** (`exams.scoring_profile = 'moet_standard'`) — trắc nghiệm 0,25, Đúng/Sai 1,0, trả lời ngắn 0,5, tự luận bằng tổng rubric. Đề thi học kì, ôn tập và bài tập về nhà là `custom`: giáo viên tự đặt trọng số. Bậc thang Đúng/Sai 1,0/0,5/0,25/0,1/0 theo số ý đúng áp cho mọi loại đề. `scoring_profile` **độc lập** với `exam_mode` (thi thử và thi học kì cùng `simulation`) — đừng suy cột này từ cột kia. Đừng hardcode trọng số ở chỗ mới; đọc `docs/SCORING.md` trước khi chạm bất cứ đường tính điểm nào.
- Cổng chặn auto-chốt theo override rate (`src/lib/essay-ai/override-guard.ts`) là cổng **chỉ-siết**: nó chỉ được biến `auto_finalize` thành `pending_review`, không bao giờ ngược lại. `FinalizeInput.overrideGuard` cố ý **không** có mặc định "cho qua" — `undefined` là chặn, để một call-site mới quên truyền không làm mất một cổng an toàn. Worker và `GET /api/admin/essay-ai/stats` phải dùng chung `override-stats.ts`; tính lại riêng ở một bên là để dashboard nói khác cái hệ thống đang làm.

Không nới ESLint, thêm `any`, tắt rule, bỏ guard hoặc gọi lỗi cũ là “không liên quan” để làm check xanh. Nếu baseline chặn xác minh, lint file thay đổi và ghi lại số liệu trước/sau.
