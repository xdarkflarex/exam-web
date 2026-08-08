# Dữ liệu và migration

## Cảnh báo quan trọng

Repo hiện **không có migration baseline đầy đủ** để dựng database trắng. `supabase/migrations/**` là các migration gia tăng; `database/SUPABASE_SCHEMA.sql` tự ghi là file context và đang lệch với migration homework/mastery/essay mới. Không chạy `supabase db reset` hoặc áp snapshot vào production cho đến khi baseline được chuẩn hóa và kiểm thử trên database tạm.

`20260721_essay_assisted_grading.sql` và backfill cấu hình 6 câu essay legacy đã được áp trên Primary Database ngày 2026-07-22; các hậu kiểm cấu trúc đều trả `must_be_zero=0`. `20260722_runtime_security_hardening.sql` **cũng đã được áp** (xác minh live 2026-08-06 qua `to_regprocedure`). Nhưng "đã áp" chỉ nói object tồn tại: chưa có postflight live cho parent policy/grant và chưa có JWT negative test, nên đừng coi các mô tả capability/ownership bên dưới là bằng chứng database live đã chặn đủ.

`20260806_moet_scoring_scale.sql` (thang điểm Bộ GD&ĐT cho đề thi thử) **đã được áp** ngày 2026-08-05, postflight 30/30 `must_be_zero=0`. Nó thêm cột `exams.scoring_profile`, `CREATE OR REPLACE` ba hàm chấm và backfill `exam_questions.score`; thang điểm, phạm vi theo loại đề và quy trình ở [`SCORING.md`](SCORING.md). Như hai migration trên, "đã áp" mới là xác minh cấu trúc — phép thử 3/4 ý ra 0,5 ([`RUNBOOK.md`](RUNBOOK.md) mục 8 bước 6) chưa chạy.

## Nguồn sự thật

| Mức | Nguồn | Cách dùng |
|---|---|---|
| 1 | Supabase schema/RLS đang chạy | Nguồn runtime, cần kiểm tra bằng tài khoản chỉ đọc/CLI được phép |
| 2 | `supabase/migrations/**` | Lịch sử thay đổi gia tăng; không sửa migration đã áp dụng |
| 3 | Query trong `src/**` | Cho biết app đang kỳ vọng bảng/cột nào |
| 4 | `database/SUPABASE_SCHEMA.sql` | Snapshot tham khảo, không phải migration chạy được |
| 5 | Các `database/*.sql` khác | Script thủ công/lịch sử; chỉ dùng sau khi đối chiếu |

Không có generated TypeScript Database types, nên `supabase.from('...')` và tên cột sai vẫn có thể qua `tsc`.

## Domain chính

### Identity, lớp và quyền

| Object | Vai trò |
|---|---|
| `auth.users` | Identity do Supabase Auth quản lý |
| `profiles` | Role, tên, lớp, access tier, cờ đổi mật khẩu |
| `classes` | Lớp học và `teacher_id` |
| `site_settings` | Landing config, admin settings, feature flags |
| `enrollment_registrations` | Đơn đăng ký học và trạng thái tạo account |
| `admin_otp_codes` | OTP admin; hiện lưu code và trạng thái sử dụng |

Role model trong code là `student | teacher | admin`, nhưng snapshot/policy/API chưa đồng nhất. Không thêm policy dựa trên giả định role trước khi chốt model.

### Ngân hàng câu hỏi

| Object | Vai trò |
|---|---|
| `questions` | Nội dung, loại câu, lời giải, source, taxonomy |
| `answers` | Các đáp án và `is_correct` |
| `topics`, `categories`, `sections`, `subsections` | Cây phân loại |
| `question_taxonomy` | Liên kết question với taxonomy |
| `tags`, `question_tags` | Gắn nhãn |
| `question_feedbacks` | Phản hồi/lỗi câu hỏi |
| `question_grading_configs` | Đáp án tham chiếu/rubric riêng cho chấm `essay`; chỉ xuất hiện sau migration pilot |

Hardening 20260722 đã thêm `questions.created_by`. Backfill chỉ gán owner khi mọi exam/homework đang liên kết câu đó suy ra đúng **một** owner; câu không suy ra được hoặc có nhiều owner giữ `NULL` để admin xử lý. Teacher chỉ tạo/quản lý câu của mình và chỉ gắn câu được phép vào parent draft; admin hệ thống có quyền ngân hàng câu hỏi toàn cục.

`answers.is_correct` là dữ liệu nhạy cảm trong lúc làm bài; không cấp select cho luồng student trước khi policy feedback cho phép.

### Thi thử và ôn tập

| Object | Vai trò |
|---|---|
| `exams` | Metadata, `exam_mode`, `scoring_profile`, publish/rule/time |
| `exam_questions` | Snapshot/thứ tự câu theo part |
| `exam_attempts` | Attempt của học sinh |
| `student_answers` | Câu trả lời, trạng thái chấm và điểm |
| `exam_analytics` | Dữ liệu analytics cũ |
| `anti_cheat_logs` | Tín hiệu tab/fullscreen/copy phía client |
| `exam_assignments` | Assignment legacy trên exam domain |
| `essay_grading_reviews` | Audit mỗi lần giáo viên chốt/cập nhật điểm tự luận; chỉ xuất hiện sau migration pilot |

`simulation` và `practice` dùng domain này nhưng mọi query bề mặt phải filter đúng mode.

`exams.scoring_profile` (`moet_standard` | `custom`, DEFAULT `custom`) là cột **độc lập** với `exam_mode`: đề thi thử và đề thi học kì cùng `exam_mode = 'simulation'` nhưng khác hồ sơ điểm, nên không được suy hồ sơ điểm từ mode. Client được `INSERT` cột này nhưng **không** được `UPDATE` — đổi hồ sơ điểm của đề đã tồn tại phải làm bằng SQL/service_role có chủ ý. Xem [`SCORING.md`](SCORING.md).

### Pilot chấm tự luận simulation

`essay` là question type thứ tư, dùng `student_answers.text_answer` cho raw answer và chỉ được bật trong source cho `exam_mode='simulation'`. Practice bị chặn khi source đề có essay; homework chưa tích hợp.

Migration pilot dự kiến thêm:

| Object/cột | Ý nghĩa |
|---|---|
| `questions.essay_max_score` | Điểm tối đa mặc định của câu essay. **Không phải nguồn trọng số khi vào đề** — trọng số lấy từ tổng thang điểm rubric trong `question_grading_configs`, xem [`SCORING.md`](SCORING.md) |
| `question_grading_configs` | `reference_answer`, rubric JSON, version, confidence threshold và metadata quản trị |
| `student_answers.max_score` | Trọng số snapshot từ `exam_questions.score` lúc submit |
| `student_answers.grading_status` | `not_required`, `auto_graded`, `pending_review`, `approved`, `failed` |
| `student_answers.grading_*`, `ai_*` | Điểm/feedback/breakdown/confidence, phương thức, hash/version, người/thời gian duyệt |
| `exam_attempts.grading_status` | `not_required`, `pending_review`, `completed`, `failed` |
| `exam_attempts.objective_points`, `essay_points`, `earned_points`, `max_points` | Tổng điểm thô để chuẩn hóa thang 10 |
| `exam_attempts.pending_grading_count`, `graded_at` | Số essay còn chờ và thời điểm hoàn tất |
| `exam_attempts.submission_hash` | Phát hiện replay submit có payload khác sau khi attempt đã chốt |
| `essay_grading_reviews` | Audit append-only của gợi ý AI và quyết định cuối của giáo viên |

State pilot:

```text
essay có nội dung: pending_review -> approved
essay bỏ trống: approved + score 0
attempt còn essay chờ: submitted + pending_review + score NULL
attempt đủ điểm: submitted + completed + score = earned_points/max_points*10
```

`max_points` là `SUM(exam_questions.score)` tính tại thời điểm nộp, **không phải** `exams.total_score`.

Trọng số từng câu phụ thuộc `exams.scoring_profile`. Chỉ đề **thi thử** (`moet_standard`) dùng thang Bộ GD&ĐT: trắc nghiệm 0,25 — Đúng/Sai 1,0 — trả lời ngắn 0,5. Đề thi học kì, đề ôn tập và bài tập về nhà là `custom`: giáo viên tự đặt, khởi tạo 1 điểm mỗi câu. Trọng số câu tự luận bằng tổng rubric ở **mọi** hồ sơ điểm, và bậc thang Đúng/Sai (1,0/0,5/0,25/0,1/0 theo số ý đúng) cũng áp cho mọi hồ sơ. Chi tiết ở [`SCORING.md`](SCORING.md).

Ba RPC mới:

- `create_essay_question`: role `admin|teacher`, validate nội dung, rubric và tổng điểm rồi tạo question/config trong một transaction.
- `submit_exam_attempt`: owner-only, simulation-only, khóa attempt, chấm objective trên server, ghi essay pending và idempotent theo trạng thái attempt.
- `review_essay_answer`: admin hoặc teacher đúng đề/lớp; kiểm tra answer hash/rubric version/giới hạn điểm, ghi audit và tính lại attempt.

AI không gọi database hoặc tự chốt điểm. Source chỉ tạo gói chấm không kèm profile/email/lớp, parse JSON dán thủ công và yêu cầu giáo viên xác nhận. Xem [`ESSAY_GRADING.md`](ESSAY_GRADING.md).

### Hardening runtime 20260722

Migration này phụ thuộc 20260721 và đã chuyển trust boundary của ba luồng làm bài sang server:

| Nhóm | Object/RPC chính | Bất biến |
|---|---|---|
| Profile | trigger bảo vệ `profiles`, `can_manage_profile` | Self-create bị ép về `student`/tier cơ bản/không tự gán lớp; self-update không được đổi role, tier, lớp hoặc trường bảo mật |
| Question bank | `questions.created_by`, helper `can_*question*`, RLS trên `questions`/`answers` | Student không đọc key trực tiếp; teacher theo owner/scope; câu đã link phải clone/version trước khi sửa |
| Exam links | RLS `exam_questions`, helper attach/edit | Chỉ staff quản lý parent draft và có quyền trên question mới được gắn; `question_type` snapshot phải khớp question |
| Simulation/practice | `get_exam_preparation`, `start_exam_attempt`, `get_exam_attempt_questions`, `submit_exam_attempt`, `submit_practice_attempt` | Capability theo attempt, chấm server, không tin score/key/owner từ client; simulation giữ điểm chưa release |
| Homework | `get_homework_attempt_questions`, `check_homework_answer`, `submit_homework_attempt`, RPC metadata | Đúng recipient/attempt owner, chấm server, feedback theo policy; không nhận `essay` |
| Kết quả phụ trợ | `get_my_exam_answer_metadata`, `get_simulation_leaderboard`, `get_my_safe_bookmarks` | Scope actor/mode/release; bookmark không mở khóa đáp án |

Migration thêm `homework_assignments.show_feedback_immediately` và `allow_review` để quyết định lúc nào server được trả feedback/lời giải. `student_has_feature` chỉ là gate server-side cho `simulation`, `practice`, `homework`; entitlement của `history`/`analytics` chưa được đóng tương đương.

Policy hardening tin vào ownership của các bảng parent như `classes.teacher_id`, `exams.created_by/class_id`, `homeworks.created_by` và assignment/recipient. Bản r4 rebuild toàn bộ policy/grant của các parent này từ closed baseline, giới hạn anon exam ở metadata theo cột, yêu cầu trọng số question-link dương và chỉ cho student thấy homework/assignment/recipient đúng phạm vi. Rollout vẫn bị chặn cho đến khi preflight đạt; sau apply bắt buộc postflight và negative test bằng JWT thật.

### Homework domain riêng

Được thêm bởi `20260621_separate_homework_domain.sql`:

| Object | Vai trò |
|---|---|
| `homeworks` | Định nghĩa bài tập |
| `homework_questions` | Snapshot câu hỏi và thứ tự |
| `homework_assignments` | Một lần giao, deadline/status |
| `homework_assignment_recipients` | Lớp/học sinh nhận bài |
| `homework_attempts` | Attempt và session counters |
| `homework_answers` | Raw answer + grading fields hiện tại |
| `homework_knowledge_targets` | Mục tiêu theory/block |
| `homework_legacy_migration_audit` | Audit dữ liệu chuyển từ legacy |

Không phát triển mới dựa vào `exams.exam_mode='homework'`. Param route `/homework/prepare/[examId]` chỉ là tên legacy, không làm domain thành exam.

Sau hardening 20260722, homework vẫn còn một P1 semantics: UI/admin helper có nơi coi `teacher` là staff, nhưng policy/helper homework hiện yêu cầu exact `admin`. Không mở rộng policy riêng lẻ cho teacher trước khi chốt role matrix và đồng bộ middleware, handler, RLS, UI.

### Kiến thức

| Object | Vai trò |
|---|---|
| `theories`, `theory_edges` | Node/cạnh lý thuyết |
| `knowledge_blocks`, `knowledge_block_edges` | Nội dung con và quan hệ |
| `question_theories` | Mapping legacy question-theory |
| `question_knowledge_links` | Mapping chuẩn question -> theory/block/cognitive level |
| `assignment_knowledge_targets` | Target cho assignment legacy |
| `v_theory_question_coverage` | View coverage theo theory |
| `v_block_question_coverage` | View coverage theo block |

RPC được source gọi:

- `map_question_knowledge_link`
- `bulk_map_questions_to_knowledge`
- `process_mastery_for_answer`
- `process_mastery_for_attempt`

`20260621_cleanup_mastery.sql` drop `mastery_evidence`, `knowledge_block_mastery`, `theory_mastery`, `theory_mastery_by_level` và các function refresh/process liên quan, nhưng `src/lib/theories/actions.ts` vẫn query/call chúng. Phần mastery cũ không được coi là runtime hợp lệ.

### CMS và gamification

- `posts`, `announcements`.
- `question_bookmarks`.
- `badges`, `user_badges`, `user_goals`.
- `latex_templates`.
- Supabase Storage bucket `Landingpage` cho media landing.

## Migration hiện có

| File | Mục đích |
|---|---|
| `20250114_site_settings.sql` | Site settings/RLS |
| `20250219_enrollment_registrations.sql` | Đơn đăng ký |
| `20260618_question_knowledge_links.sql` | Mapping question-knowledge, view/RPC |
| `20260620_assignment_knowledge_targets.sql` | Knowledge target cho assignment legacy |
| `20260620_mastery_evidence.sql` | Mastery/event/function cũ |
| `20260621_cleanup_mastery.sql` | Archive/drop mastery cũ |
| `20260621_separate_homework_domain.sql` | Homework domain riêng, migrate legacy, RLS |
| `20260721_essay_assisted_grading.sql` | Pilot essay simulation, RPC submit/review, trigger bảo vệ grading và audit; đã apply ngày 2026-07-22, postflight cấu trúc đạt, chưa JWT/E2E |
| `20260722_runtime_security_hardening.sql` | Ownership question, closed RLS/grant gồm cả parent trust anchors và RPC server-side cho simulation/practice/homework; đã apply (xác minh 2026-08-06), chưa postflight live/JWT tests. **RENAME** `submit_exam_attempt` thành `submit_exam_attempt_trusted_internal` rồi bọc lại — sửa hàm chấm phải sửa hàm `_trusted_internal` |
| `20260804_essay_ai_auto_grading.sql` | Đường ghi điểm cho AI tự chấm tự luận (`ai_finalize_essay_answer`, `grading_status='ai_graded'`); đã apply, không tự bật tính năng — cờ `ESSAY_AI_ENABLED`/`ESSAY_AI_AUTO_FINALIZE` điều khiển |
| `20260805_essay_ai_usage.sql` | Nhật ký chi phí `essay_ai_usage` + `essay_ai_month_to_date_cost()`; đã apply |
| `20260806_moet_scoring_scale.sql` | Thang điểm Bộ GD&ĐT cho đề thi thử: cột `exams.scoring_profile` (`moet_standard`/`custom`, DEFAULT `custom`), hàm bậc thang `moet_true_false_score()`, `CREATE OR REPLACE` ba hàm chấm, trigger 4 ý **chỉ áp cho `moet_standard`**, backfill `exam_questions.score` + `exams.total_score`; **đã apply 2026-08-05**, postflight 30/30. Mọi sửa hàm chấm sau này rebase trên file này, xem [`SCORING.md`](SCORING.md) |
| `20260807_essay_ocr_snapshots.sql` | Bảng `essay_ocr_snapshots`: chất lượng nhận dạng mỗi lần học sinh chụp ảnh bài tự luận (confidence, cảnh báo, hash, provider/model). Khoá tra cứu `(attempt_id, question_id)` vì lúc OCR chạy thì `student_answers` chưa có dòng. RLS bật + FORCE, không policy, chỉ `service_role` SELECT/INSERT. Chỉ tạo mới, không đụng migration nào khác; **đã apply 2026-08-07**, postflight báo `service_role_thua_quyen_sua = 2` — quyền UPDATE/DELETE **không** bị chặn như file tuyên bố, sửa bằng `20260808`. Đóng fail-open ở cổng OCR của `auto-finalize.ts` |
| `20260808_essay_ocr_snapshots_lock_append_only.sql` | Sửa lỗi quyền của `20260807`: `REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` khỏi `service_role` để `essay_ocr_snapshots` thật sự append-only. Nguyên nhân gốc là `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO ... service_role` của Supabase — **bảng mới trong `public` sinh ra đã có ALL**, nên "không grant UPDATE" ≠ "không có UPDATE", và `REVOKE` của `20260807` không liệt kê `service_role`. Chỉ đổi ACL, tự kiểm trong transaction trước COMMIT, chạy lại vô hại; **chưa apply**. Không chạm default privileges cấp schema — bẫy vẫn còn cho bảng mới, xem `supabase/preflight/20260808_default_privileges_audit.sql` và quy ước ở [`RUNBOOK.md`](RUNBOOK.md) |

Chuỗi này tham chiếu các bảng nền và function như `update_updated_at_column()` nhưng không tự tạo đầy đủ. Snapshot lại thiếu các bảng homework/essay mới và còn object đã drop.

## RLS và transaction rules

- Mọi bảng public phải bật RLS và có policy tối thiểu theo operation.
- `authenticated USING (true)` chỉ phù hợp dữ liệu đọc công khai đã được chủ ý; không dùng cho answer key, mapping quản trị hoặc mutation.
- Policy phải kiểm tra ownership (`auth.uid()`), recipient, class/teacher scope và role từ profile đáng tin cậy.
- Không dùng service role từ client. Route server dùng service role phải tự auth/authorize trước khi bypass RLS.
- Submit/grading/tạo exam/import theory nhiều bước phải vào transaction/RPC idempotent; không để trạng thái nửa chừng.
- Pilot simulation dùng trigger để chặn student ghi/sửa/xóa trực tiếp answer và sửa trường định danh/trạng thái/điểm attempt; RPC `submit_exam_attempt`/`review_essay_answer` là trusted mutation. Điều này chưa thay thế việc kiểm thử RLS/trigger trên database thật.
- Hardening 20260722 đã rebuild policy của `profiles`, question/key, link, attempt/answer và bookmark từ closed baseline; revoke quyền nhạy cảm của `PUBLIC`/`anon`, rồi chỉ grant operation cần thiết cho `authenticated` qua RLS/RPC. Migration đã áp, nhưng chưa có postflight live/JWT test nên đừng kết luận thiết kế này đã chặn đủ trên runtime.
- `question_grading_configs.reference_answer` và rubric không được cấp SELECT cho student; review của teacher phải scope theo người tạo đề hoặc `classes.teacher_id`.

## Quy trình tạo baseline chuẩn

1. Tạo database Supabase tạm, không chứa dữ liệu thật.
2. Xuất schema runtime đã loại secret/data cá nhân.
3. So sánh object với query trong `.ai-cache/index.json`.
4. Chốt một baseline migration tạo type/function/table/index/RLS theo dependency order.
5. Áp chuỗi migration gia tăng hoặc squash có audit mapping rõ ràng, gồm pilot essay và runtime hardening sau khi precondition được thỏa.
6. Chạy reset trên database tạm ít nhất hai lần.
7. Generate Database types và dùng cho Supabase client.
8. Viết RLS negative tests trước khi áp production.

Cho đến khi hoàn tất, mọi thay đổi database phải ghi precondition và SQL verify, không tuyên bố “fresh setup supported”.
