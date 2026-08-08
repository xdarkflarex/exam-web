# Chức năng sản phẩm

Tài liệu này mô tả baseline toàn repo ngày 2026-07-19 và delta pilot tự luận trong source ngày 2026-07-21. “Có route” không đồng nghĩa đã an toàn, đã apply migration hoặc hoàn thiện; các điểm rủi ro được liên kết sang [`SECURITY_AND_AUDIT.md`](SECURITY_AND_AUDIT.md).

## Vai trò và phạm vi

| Vai trò | Ý nghĩa hiện tại | Phạm vi dự kiến |
|---|---|---|
| Khách | Chưa đăng nhập | Landing, bài viết/thông báo công khai, form đăng ký học, login/signup |
| Học sinh `student` | Người học | Dữ liệu cá nhân, bài được giao, thi/ôn/luyện, kiến thức và tiến bộ |
| Giáo viên `teacher` | Code coi là admin qua `isAdmin()` | Quản lý lớp/học sinh của mình; hiện policy/API chưa đồng nhất với cách hiểu này |
| Admin `admin` | Quản trị hệ thống | Toàn bộ dashboard quản trị, cấu hình, content, user và dữ liệu học tập |

Access tier của học sinh:

- `full`: được phép tất cả feature.
- `basic`: theo `site_settings['access.feature_flags']` cho `practice`, `simulation`, `theories`, `graph`, `homework`, `history`, `analytics`.
- Hiện feature flags chủ yếu lọc sidebar; chưa phải rào chắn route/data hoàn chỉnh.

## Bề mặt công khai

| Chức năng | Route/entrypoint | Ghi chú |
|---|---|---|
| Landing Minh Math | `/` | Section cấu hình từ `site_settings`, bài viết, đề thi simulation, form tuyển sinh |
| Đăng ký học | `POST /api/enrollments` | Ghi `enrollment_registrations` bằng service role; cần chống spam/rate limit |
| Đăng ký tài khoản | `/signup`, `POST /api/auth/signup` | Role bị cố định là `student` |
| Đăng nhập | `/login` | Email/password và redirect theo profile role |
| OAuth callback | `/auth/callback` | Trao đổi code Supabase và tạo/kiểm tra profile |
| Hoàn thiện hồ sơ | `/complete-profile` | Chỉ user đã auth nhưng chưa có profile |
| Đổi mật khẩu bắt buộc | `/change-password` | Dùng cho tài khoản được admin tạo từ đơn đăng ký |

## Học sinh

### Dashboard và hồ sơ

- `/student`: workspace “Hôm nay”, ưu tiên attempt đang làm, bài còn hạn và
  phản hồi đã được công bố; không hiển thị điểm tự luận đang chờ duyệt như 0.
- `/student/exams`: danh sách đề thi thử.
- `/student/practice`: danh sách ôn tập.
- `/student/homework`: bài tập được giao và trạng thái.
- `/student/history`: lịch sử dựa chủ yếu vào `exam_attempts`/`student_answers`.
- `/student/analytics`: hồ sơ năng lực; tier basic/full có cách hiển thị khác nhau.
- `/student/settings`: hồ sơ/cài đặt cá nhân.

### Thi thử, ôn tập và kết quả

- Thi thử: `/exam/prepare/[examId]` -> `/exam/[attemptId]` -> `/exam/[attemptId]/result` hoặc `/result/[attemptId]`.
- Ôn tập: `/practice` -> `/practice/[attemptId]`.
- Simulation runner gửi raw answer tới RPC `submit_exam_attempt`; nếu migration pilot đã được áp, server chấm ba loại cũ và giữ essay ở trạng thái chờ giáo viên.
- Practice runner vẫn autosave/chấm qua Supabase browser client và không nhận đề có `essay` trong source hiện tại.
- Với simulation có essay chưa duyệt, học sinh thấy trạng thái chờ và chưa thấy điểm tổng. Sau khi duyệt đủ, điểm được công bố trên thang 10 cùng feedback cuối.
- Anti-cheat phía trình duyệt ghi `anti_cheat_logs`; đây là tín hiệu hỗ trợ, không phải rào chắn bảo mật tuyệt đối.

### Homework riêng

- Danh sách: `/student/homework`.
- Chuẩn bị/resume: `/homework/prepare/[examId]` (tên param còn mang dấu vết legacy).
- Làm bài: `/homework/[attemptId]`.
- Domain dữ liệu riêng: `homeworks`, `homework_questions`, `homework_assignments`, recipients, attempts, answers và knowledge targets.
- Homework hỗ trợ chia session bằng `session_size`/`current_session_index`.

### Kiến thức và động lực học

- `/learn`: workspace lý thuyết + knowledge block + skill tree + homework liên quan.
- `/learn/map` và `/learn/theories/[id]`: route tương thích, redirect về `/learn` với query phù hợp.
- `/bookmarks`, `/badges`, `/goals`, `/leaderboard`: bookmark câu hỏi, huy hiệu, mục tiêu và xếp hạng.

## Giáo viên/Admin

| Miền | Chức năng/route chính |
|---|---|
| Tổng quan | `/admin`, recent exams/feedback/stats |
| Ngân hàng câu hỏi | `/admin/questions`, `/admin/questions/sources`, `/admin/questions/essay/new`, editor, media, taxonomy/tag/filter, rubric tự luận |
| Đề thi | `/admin/exams`, create, detail, questions, publish, results |
| Homework | `/admin/homework`, create, detail, assign, results, knowledge targets |
| Kiến thức | `/admin/theories`, new/edit/import/export/edges, `/admin/knowledge-links` |
| Người học | `/admin/students`, detail, `/admin/users`, `/admin/classes` |
| Analytics | `/admin/analytics` là workspace kết quả lớp cho `simulation/practice` (không gộp homework), có điểm trung vị, hàng chờ tự luận và drill-down; `/admin/reports`, attempt detail |
| Nội dung | posts, calendar, announcements, landing sections, media |
| Tuyển sinh | `/admin/enrollments`, duyệt và tạo tài khoản tạm |
| Hệ thống | settings, feature access, OTP admin, LaTeX templates, feedback |

Giáo viên theo thiết kế phải chỉ thấy học sinh thuộc lớp có `classes.teacher_id` của mình. Không suy ra rằng mọi trang admin hiện đã áp dụng scope này.

## Mô hình đánh giá

### Bốn dạng câu hỏi trong source

Cột trọng số dưới đây là của đề **thi thử** (`exams.scoring_profile = 'moet_standard'`). Đề thi
học kì, đề ôn tập và bài tập về nhà là `custom`: khởi tạo 1 điểm mỗi câu, giáo viên tự đặt lại.
Bậc thang Đúng/Sai thì áp cho **mọi** loại đề.

| `question_type` | Ý nghĩa | Trọng số đề thi thử | Cách chấm |
|---|---|---:|---|
| `multiple_choice` | Một lựa chọn đúng | 0,25 | So answer id/đáp án chuẩn |
| `true_false` | Bốn mệnh đề đúng/sai | 1,00 | **Bậc thang theo số ý đúng**: 4 ý → 1,0 · 3 ý → 0,5 · 2 ý → 0,25 · 1 ý → 0,1 · 0 ý → 0. Đề thi thử bắt buộc đúng 4 ý; đề custom cho 2–3 ý và chấm theo tỷ lệ |
| `short_answer` | Trả lời ngắn | 0,50 | Chuẩn hóa chuỗi/số và so đáp án cho phép |
| `essay` | Tự luận dài bằng văn bản/LaTeX | **tổng thang điểm rubric** | Pilot simulation: AI chỉ gợi ý theo rubric; giáo viên duyệt/chốt bắt buộc. Ràng buộc tổng rubric áp cho mọi loại đề |

Điểm hiển thị cho học sinh là thang 10: `round(earned_points / max_points * 10, 2)`, với `max_points = SUM(exam_questions.score)` tại thời điểm nộp. Đề thi thử chuẩn 12 trắc nghiệm + 4 Đúng/Sai + 6 trả lời ngắn cộng đúng 10,0. Nguồn duy nhất cho thang điểm: [`SCORING.md`](SCORING.md) — đọc trước khi chạm bất cứ đường tính điểm nào, đặc biệt mục "Thang Bộ áp cho loại đề nào". Thang này áp từ `20260806_moet_scoring_scale.sql`, **migration đã áp ngày 2026-08-05** (postflight 30/30, chuỗi gọi và bảng giá trị bậc thang đã xác minh); còn phép thử end-to-end bước 6 chưa chạy.

### Ba loại đề

Giáo viên chọn một trong ba khi tạo đề, và lựa chọn đó ghi xuống **hai cột độc lập**:

| Loại đề | `exam_mode` | `scoring_profile` | Trọng số |
|---|---|---|---|
| Thi thử | `simulation` | `moet_standard` | thang Bộ, cố định |
| Thi học kì | `simulation` | `custom` | giáo viên tự đặt |
| Ôn tập | `practice` | `custom` | giáo viên tự đặt |

Thi thử và thi học kì **cùng** `exam_mode`, nên không được suy hồ sơ điểm từ mode — phải đọc
`scoring_profile`. Bài tập về nhà không có cột này, luôn tự do cấu hình.

### Pilot tự luận có AI hỗ trợ

- Chỉ hỗ trợ `simulation`; create exam chặn source có essay khi chọn `practice`. Homework chưa hỗ trợ.
- Admin/teacher tạo câu tại `/admin/questions/essay/new`, gồm đáp án tham chiếu, điểm tối đa và rubric có tổng điểm khớp.
- Trọng số câu tự luận trong đề là **tổng `max_score` của các tiêu chí rubric**, không phải `questions.essay_max_score`. Lệch quá 0,0001 thì `submit_exam_attempt` raise `ESSAY_RUBRIC_SCORE_MISMATCH`; trang cấu hình điểm chặn từ lúc cấu hình.
- Học sinh nhập tối đa 20.000 ký tự. Non-empty essay chuyển `pending_review`; blank essay được server chốt 0.
- Màn hình chi tiết attempt cho phép copy gói chấm không kèm profile/email/lớp sang AI, paste JSON `essay-grade-result.v1`, kiểm tra từng criterion rồi sửa/chốt.
- Từ 2026-08-04 có thêm luồng tự động song song (`src/lib/essay-ai/`). `ESSAY_AI_AUTO_FINALIZE` đã bật từ 2026-08-06, nhưng auto-chốt chỉ thực sự chạy sau khi có 20 bài AI chấm được giáo viên duyệt lại (cổng `override-guard.ts`).
- `review_essay_answer` ghi audit, xác minh answer hash/rubric version và tính lại tổng điểm trên server.
- Migration `20260721_essay_assisted_grading.sql` đã apply ngày 2026-07-22 với hậu kiểm cấu trúc đạt, nhưng chưa test bằng JWT/E2E — chưa phải chức năng production đã xác nhận.

Quy trình và giới hạn đầy đủ: [`ESSAY_GRADING.md`](ESSAY_GRADING.md).

### Ba mode không được trộn

| Mode | Dữ liệu chính | Feedback mặc định |
|---|---|---|
| `simulation` | `exams` + `exam_*` | Mục tiêu không lộ đáp án; source đã bỏ `is_correct`/solution nhưng option query còn finding short-answer cần sửa/test |
| `practice` | `exams` + `exam_*` với filter practice | Có thể phản hồi ngay; chưa hỗ trợ essay |
| `homework` | `homeworks` + `homework_*` | Không lộ lời giải khi đang làm, trừ khi assignment cho phép |

## Thành phần nền tảng

- Auth/cookie/middleware: `src/middleware.ts`, `src/lib/auth/**`.
- Supabase browser client: `src/lib/supabase/client.ts`.
- Session timeout: middleware + `SessionTimeoutProvider`/hooks.
- Math content: `MathContent`, `TikzRenderer`, parser/normalizer/export LaTeX.
- Theme/loading providers: `src/app/providers.tsx`.
- Layout riêng: public/auth, student, admin, learn, result/exam flows.
- Import/export: XLSX và LaTeX.

## Những phần đang dở hoặc gây hiểu nhầm

- Lint toàn repo chưa sạch. Có test runner (`npm test`) nhưng phạm vi mới ở vài module thuần, chưa có CI.
- Simulation, practice và homework đều đã chấm ở RPC server-side (`20260721` + `20260722`, cả hai đã live), nhưng chưa có JWT/E2E chứng minh đường ghi trực tiếp đã bị khóa.
- **Thang Bộ đã vào database.** `20260806_moet_scoring_scale.sql` đã áp ngày 2026-08-05 với postflight 30/30 `must_be_zero=0`, và chuỗi gọi đã xác minh đủ (wrapper → `_trusted_internal` → hàm bậc thang, không còn tàn dư công thức tuyến tính, bảng giá trị bậc thang gọi thật ra đúng `0 / 0,1 / 0,25 / 0,5 / 1,0`). Phần chưa phủ là cách đếm số ý đúng trong vòng lặp plpgsql — phép thử end-to-end ([`RUNBOOK.md`](RUNBOOK.md) mục 8 bước 6) chưa chạy, rủi ro thấp. Bước 5 (rà đề học kì bị nâng nhầm lên `moet_standard`) cũng chưa làm. Xem [`SCORING.md`](SCORING.md).
- Điểm của attempt nộp trước 2026-08-06 **không được tính lại**, nên hai attempt cùng một đề có thể khác điểm. Đó là quyết định có ý thức, không phải bug.
- AI tự luận có luồng tự động từ 2026-08-04; `ESSAY_AI_AUTO_FINALIZE` bật từ 2026-08-06 theo quyết định chủ dự án (lớp học thêm, không phải điểm học bạ). Kill-switch tự động theo override rate **đã có** (`src/lib/essay-ai/override-guard.ts`) và hiện là cổng chặn thực tế: dưới 20 bài đối chiếu thì không bài nào được tự chốt. OCR snapshot xong trong source từ 2026-08-07 (bảng `essay_ocr_snapshots` + cổng fail-closed `ocr_snapshot_missing`); `20260807` và `20260808` (append-only) đều đã nạp, negative test runtime 5/5 đạt. Từ 2026-08-06 worker gộp mọi lần chụp của một bài thay vì lấy snapshot mới nhất.
- Analytics/lịch sử cũ chưa tổng hợp đầy đủ homework.
- Access tier chưa guard route/data đầy đủ.
- Mastery API cũ vẫn tồn tại trong source dù migration cleanup đã drop các bảng tương ứng.
- Một số trang cũ dùng cột/status khác schema snapshot mới.

Danh sách có bằng chứng và thứ tự sửa: [`SECURITY_AND_AUDIT.md`](SECURITY_AND_AUDIT.md).
