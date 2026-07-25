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

- `/student`: tổng quan thi, hoạt động và CTA học tập.
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
| Analytics | `/admin/analytics`, `/admin/reports`, attempt detail |
| Nội dung | posts, calendar, announcements, landing sections, media |
| Tuyển sinh | `/admin/enrollments`, duyệt và tạo tài khoản tạm |
| Hệ thống | settings, feature access, OTP admin, LaTeX templates, feedback |

Giáo viên theo thiết kế phải chỉ thấy học sinh thuộc lớp có `classes.teacher_id` của mình. Không suy ra rằng mọi trang admin hiện đã áp dụng scope này.

## Mô hình đánh giá

### Bốn dạng câu hỏi trong source

| `question_type` | Ý nghĩa | Chấm dự kiến |
|---|---|---|
| `multiple_choice` | Một lựa chọn đúng | So answer id/đáp án chuẩn |
| `true_false` | Nhiều mệnh đề đúng/sai | So từng mệnh đề, cần định nghĩa điểm từng ý |
| `short_answer` | Trả lời ngắn | Chuẩn hóa chuỗi/số và so đáp án cho phép |
| `essay` | Tự luận dài bằng văn bản/LaTeX | Pilot simulation: AI chỉ gợi ý theo rubric; giáo viên duyệt/chốt bắt buộc |

### Pilot tự luận có AI hỗ trợ

- Chỉ hỗ trợ `simulation`; create exam chặn source có essay khi chọn `practice`. Homework chưa hỗ trợ.
- Admin/teacher tạo câu tại `/admin/questions/essay/new`, gồm đáp án tham chiếu, điểm tối đa và rubric có tổng điểm khớp.
- Học sinh nhập tối đa 20.000 ký tự. Non-empty essay chuyển `pending_review`; blank essay được server chốt 0.
- Màn hình chi tiết attempt cho phép copy gói chấm không kèm profile/email/lớp sang AI, paste JSON `essay-grade-result.v1`, kiểm tra từng criterion rồi sửa/chốt.
- Không có API AI, worker hoặc API key trong pilot; giáo viên có thể bỏ qua AI và chấm tay.
- `review_essay_answer` ghi audit, xác minh answer hash/rubric version và tính lại tổng điểm trên server.
- Migration `20260721_essay_assisted_grading.sql` chưa apply/test live, nên đây là bề mặt trong source chứ chưa phải chức năng production đã xác nhận.

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

- Lint toàn repo chưa sạch và chưa có test tự động.
- Simulation source đã có RPC submit/chấm server-side và không tải answer key trong lúc làm, nhưng chỉ có hiệu lực sau migration chưa được test live.
- Practice và homework vẫn còn chấm điểm/đáp án chuẩn phía client; không suy rộng pilot simulation thành trust boundary hoàn chỉnh.
- AI tự luận hiện là copy/paste thủ công và giáo viên duyệt, chưa có automation, retry, model policy hoặc cost/rate control.
- Analytics/lịch sử cũ chưa tổng hợp đầy đủ homework.
- Access tier chưa guard route/data đầy đủ.
- Mastery API cũ vẫn tồn tại trong source dù migration cleanup đã drop các bảng tương ứng.
- Một số trang cũ dùng cột/status khác schema snapshot mới.

Danh sách có bằng chứng và thứ tự sửa: [`SECURITY_AND_AUDIT.md`](SECURITY_AND_AUDIT.md).
