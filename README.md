# Minh Math / Exam Web

Nền tảng web tiếng Việt dành cho luyện thi Toán THPT, quản lý ngân hàng câu hỏi, thi thử, ôn tập, bài tập về nhà, cây kiến thức và theo dõi tiến bộ học sinh.

> Baseline audit: 2026-07-19; cập nhật pilot tự luận: 2026-07-21. Source hiện có 72 page route, 6 route handler và 6 layout. TypeScript từng pass ở baseline; ESLint còn lỗi nên chưa được coi là production-ready. Xem [đánh giá kỹ thuật](docs/SECURITY_AND_AUDIT.md).

## Chức năng chính

| Nhóm | Chức năng |
|---|---|
| Công khai | Landing page, bài viết/thông báo, đăng ký học, đăng ký/đăng nhập, OAuth callback |
| Học sinh | Dashboard, thi thử, nhập bài tự luận văn bản/LaTeX trong pilot simulation, ôn tập, bài tập về nhà, lịch sử, thống kê, kiến thức/skill tree, bookmark, badge, mục tiêu, bảng xếp hạng |
| Giáo viên/Admin | Ngân hàng câu hỏi, tạo rubric tự luận, AI hỗ trợ qua copy/paste ẩn danh và giáo viên duyệt điểm, đề thi, homework, giao bài, kết quả, học sinh/lớp, liên kết câu hỏi-kiến thức, lý thuyết, bài viết, thông báo, media, tuyển sinh, báo cáo, cấu hình truy cập |
| Nền tảng | Supabase Auth/Postgres/Storage, RLS, OTP admin, timeout phiên, anti-cheat phía trình duyệt, MathJax/TikZ/Markdown |

Chi tiết theo vai trò và trạng thái triển khai nằm trong [docs/FEATURES.md](docs/FEATURES.md).

## Pilot chấm tự luận

Source có pilot câu `essay` chỉ cho **thi thử/kiểm tra `simulation`**. Học sinh nộp raw answer qua RPC; hệ thống chấm phần khách quan trên server và giữ điểm tổng ở trạng thái chờ nếu có tự luận. Giáo viên sao chép một gói chấm không kèm profile/email/lớp sang AI, dán JSON gợi ý về, kiểm tra/sửa rồi bắt buộc duyệt điểm cuối.

Pilot chưa gọi AI tự động, không cần API key AI và chưa hỗ trợ `practice` hoặc `homework`. Migration [`20260721_essay_assisted_grading.sql`](supabase/migrations/20260721_essay_assisted_grading.sql) cùng backfill 6 câu essay legacy đã được áp trên Primary Database ngày 2026-07-22; hai hậu kiểm cấu trúc đều đạt toàn bộ `must_be_zero=0`. Chức năng vẫn chưa production-ready vì hardening 20260722 và negative test bằng JWT/E2E chưa hoàn tất. Đọc [quy trình chấm tự luận](docs/ESSAY_GRADING.md) trước khi rollout.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict.
- Supabase SSR/Auth/Postgres/Storage.
- Tailwind CSS 4, dark mode, `lucide-react`.
- MathJax, Markdown/GFM, TikZ renderer.
- `@xyflow/react`, Dagre và GSAP cho cây kiến thức.
- `xlsx` cho nhập/xuất dữ liệu.

## Chạy local

Đã kiểm tra trong workspace với Node.js 22 và npm 10. Dùng **npm** làm package manager chuẩn; repo hiện còn `pnpm-lock.yaml` cũ, không cập nhật đồng thời hai lockfile.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Mở `http://127.0.0.1:3000`.

Các biến bắt buộc tối thiểu:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

`SUPABASE_SERVICE_KEY` chỉ được dùng trong server route. OTP email production cần thêm `RESEND_API_KEY` và `EMAIL_FROM`. Không commit `.env` hoặc in secret vào log/chat.

## Kiểm tra trước khi bàn giao

```powershell
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Hiện trạng ngày 2026-07-19:

- `tsc`: pass.
- `eslint`: fail, 113 error và 192 warning.
- `next build`: pass; còn cảnh báo convention `middleware` đã deprecated trên Next.js 16.
- Chưa có test runner, test suite hoặc CI.
- Bộ migration hiện tại chưa đủ để dựng database trắng; không chạy reset/migration production chỉ dựa vào tài liệu này.
- Schema/RPC pilot tự luận và backfill legacy đã live với hậu kiểm cấu trúc đạt; hardening 20260722, deploy đồng bộ source và JWT/E2E vẫn chưa hoàn tất.

Quy trình đầy đủ: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Đường tắt cho AI

AI phải đọc [AGENTS.md](AGENTS.md) trước khi sửa code, sau đó dùng chỉ mục nhẹ tại chỗ:

```powershell
node scripts/ai-context.mjs --route /admin/homework
node scripts/ai-context.mjs --table homework_attempts
node scripts/ai-context.mjs --changed
```

`ai-context` tự làm mới index; truy vấn `--table` ưu tiên cả migration/schema định nghĩa bảng rồi mới tới call-site TypeScript. Output nằm trong `.ai-cache/` và không commit. Không cần cài CocoIndex/GitNexus cho quy mô source hiện tại; nếu thử công cụ ngoài, chỉ giữ cache ngoài Git và không cho công cụ ghi đè `AGENTS.md`.

## Tài liệu chuẩn

| Tài liệu | Dùng khi |
|---|---|
| [AGENTS.md](AGENTS.md) | Quy tắc bắt buộc cho AI và người sửa code |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Kiến trúc, route, entrypoint, luồng dữ liệu, nơi cần tìm |
| [docs/FEATURES.md](docs/FEATURES.md) | Toàn bộ chức năng theo vai trò và mode |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Bảng/view/RPC, migration, RLS và nguồn sự thật |
| [docs/ESSAY_GRADING.md](docs/ESSAY_GRADING.md) | Phạm vi, state machine, copy/paste AI, giáo viên duyệt và checklist pilot tự luận |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Setup, debug, verify, deploy, MCP |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | UI tiếng Việt, màu sắc, responsive, math content |
| [docs/SECURITY_AND_AUDIT.md](docs/SECURITY_AND_AUDIT.md) | Baseline chất lượng, rủi ro đã xác nhận, thứ tự fix |

`database/*.sql` là snapshot/script lịch sử; `supabase/migrations/**` là migration gia tăng nhưng chưa phải baseline hoàn chỉnh. Khi code và tài liệu lệch nhau, ưu tiên xác minh source + database thực tế rồi cập nhật tài liệu trong cùng thay đổi.
