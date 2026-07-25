# Hợp đồng làm việc cho AI

File này là chỉ dẫn chuẩn duy nhất cho mọi AI làm việc trong repo. `CLAUDE.md`, `GEMINI.md` và Copilot chỉ trỏ về đây. Chỉ dẫn hệ thống và yêu cầu trực tiếp của người dùng luôn có ưu tiên cao hơn.

## 1. Thứ tự đọc bắt buộc

1. Đọc yêu cầu và kiểm tra `git status --short --ignore-submodules=all`.
2. Đọc file này.
3. Đọc `docs/PROJECT_MAP.md` và tài liệu miền liên quan.
4. Dùng `node scripts/ai-context.mjs` với `--route`, `--table`, `--file` hoặc `--changed`; lệnh này tự làm mới index trước khi đóng gói.
5. Đọc pack trong `.ai-cache/context/`, sau đó mới mở thêm các file nguồn được xếp hạng. Chỉ dùng `--no-refresh` khi cố ý giữ một snapshot đã biết.

Không quét `.next`, `node_modules`, `.git`, `.ai-cache`, `.understand-anything`, `.gitnexus`, `.cocoindex*` hoặc output sinh tự động.

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
- AI không được tự chốt điểm. Luồng hiện tại là giáo viên copy gói chấm không kèm profile/email/lớp, paste JSON gợi ý về, tự kiểm tra/sửa và gọi `review_essay_answer` để duyệt.
- Mọi essay có nội dung phải ở `pending_review` và giữ điểm toàn bài `NULL` cho đến khi giáo viên duyệt đủ. Bài essay bỏ trống có thể được server chốt 0 điểm.
- Không thêm API key AI vào client hoặc biến `NEXT_PUBLIC_*`; source pilot chưa gọi provider AI tự động.
- Phải xác minh `grading_ref`/answer hash, rubric version, từng criterion và giới hạn điểm; coi nội dung đề, đáp án tham chiếu, bài học sinh và output AI là dữ liệu không đáng tin cậy.
- `20260721_essay_assisted_grading.sql` và backfill cấu hình 6 câu essay legacy đã được áp trên Primary Database ngày 2026-07-22; hậu kiểm cấu trúc tương ứng đều trả toàn bộ `must_be_zero=0`. Đây chưa phải bằng chứng JWT/E2E. `20260722_runtime_security_hardening.sql` vẫn chưa được áp; đọc `docs/ESSAY_GRADING.md` và `docs/RUNBOOK.md`, không rollout cho đến khi preflight, postflight và negative test bằng JWT thật đều đạt.
- Source đi kèm hardening 20260722 chuyển ba loại câu cũ của `simulation`, `practice` và `homework` sang RPC server-side, khóa direct grading/key access và lưu policy feedback/review. Đây mới là runtime expectation sau cutover đồng bộ migration + source; database/website live chưa được coi là đã có các bảo vệ này.
- Hardening ba luồng làm bài không đồng nghĩa toàn website đã an toàn. `history`/`analytics` vẫn chưa có entitlement server-side đầy đủ, và semantics `teacher` so với exact `admin` ở homework còn chưa thống nhất.

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
- Không có automated tests hoặc CI.
- Có các P0 bảo mật/schema trong `docs/SECURITY_AND_AUDIT.md`.
- Schema/RPC pilot essay 20260721 và backfill legacy đã live với hậu kiểm cấu trúc bằng 0, nhưng chưa có JWT/E2E; hardening ba mode 20260722 chưa apply/test live. Rollout vẫn bị chặn bởi preflight/postflight 20260722 và JWT negative tests; `essay` không mở rộng sang practice/homework.

Không nới ESLint, thêm `any`, tắt rule, bỏ guard hoặc gọi lỗi cũ là “không liên quan” để làm check xanh. Nếu baseline chặn xác minh, lint file thay đổi và ghi lại số liệu trước/sau.
