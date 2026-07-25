# Chấm tự luận có AI hỗ trợ

## Trạng thái pilot

> `20260721_essay_assisted_grading.sql` và backfill cấu hình sáu câu essay legacy `20260723_essay_legacy_config_backfill.sql` đã được áp trên Primary Database ngày 2026-07-22. Hai hậu kiểm tương ứng đều đạt: 20/20 và 8/8 dòng `must_be_zero=0`. Đây chỉ là bằng chứng cấu trúc/dữ liệu, chưa phải JWT/E2E. Candidate hardening `20260722_runtime_security_hardening.sql` r4 vẫn đang review và chưa được áp; không coi chức năng là production-ready cho đến khi hoàn tất phần cutover còn lại trong `RUNBOOK.md`.

Phạm vi hiện tại:

| Hạng mục | Trạng thái |
|---|---|
| `simulation` (thi thử/kiểm tra) | Schema/RPC essay và backfill legacy đã live; UI/source đã có luồng submit và giáo viên duyệt, nhưng runtime an toàn đầy đủ còn phụ thuộc hardening 20260722 + JWT/E2E |
| `practice` | Không nhận `essay`; source mới submit/chấm ba loại cũ bằng RPC `submit_practice_attempt` sau hardening |
| `homework` | Không nhận `essay`; source mới kiểm tra/nộp/chấm ba loại cũ bằng RPC server sau hardening |
| Gọi AI tự động | Chưa có; không có API key, worker hoặc hàng đợi AI |
| AI hỗ trợ | Giáo viên sao chép gói chấm ẩn danh sang AI, dán JSON về và kiểm tra |
| Điểm cuối | Giáo viên bắt buộc duyệt/chốt mọi bài tự luận có nội dung; AI không được tự công bố điểm |

Một câu tự luận bỏ trống được server chốt 0 điểm mà không tạo bước AI/duyệt. Mọi câu tự luận có nội dung chuyển sang `pending_review` và làm điểm toàn bài ở trạng thái chưa công bố.

## Mục tiêu và ranh giới tin cậy

- `essay` là loại riêng, không đổi nghĩa `short_answer`.
- Học sinh nhập văn bản/LaTeX tối đa 20.000 ký tự trong `ExamRunner`.
- Client chỉ gửi raw answer; RPC lấy question type, đáp án chuẩn và trọng số từ database.
- AI chỉ đề xuất theo rubric. Giáo viên có thể sửa điểm/nhận xét hoặc bỏ qua AI và chấm tay.
- Không gửi profile, email, lớp hoặc `student_id` vào gói AI. `grading_ref` là hash của nội dung bài, không phải định danh học sinh.
- Gói vẫn chứa nguyên văn bài làm. Nếu học sinh tự viết dữ liệu nhận dạng trong bài, hệ thống hiện chưa tự xóa; giáo viên phải kiểm tra trước khi gửi cho dịch vụ AI bên ngoài.

## Thành phần trong source

| Thành phần | Vai trò |
|---|---|
| `src/app/admin/questions/essay/new/page.tsx` | Tạo câu `essay`, đáp án tham chiếu và rubric qua `create_essay_question` |
| `src/components/ExamRunner.tsx` | Nhập tự luận và nộp toàn bài qua `submit_exam_attempt` |
| `src/lib/exam/questions.ts` | Tải đề simulation không có `solution`/`is_correct` |
| `src/lib/essay-grading/prompt.ts` | Tạo prompt ẩn danh và kiểm tra JSON `essay-grade-result.v1` |
| `src/components/admin/EssayGradingPanel.tsx` | Copy prompt, paste/validate gợi ý, sửa và duyệt điểm |
| `src/app/admin/attempts/[attemptId]/page.tsx` | Màn hình giáo viên đọc rubric, đáp án tham chiếu và chốt từng câu |
| `src/app/admin/exams/[examId]/results/page.tsx` | Hiện số bài chờ duyệt và điều hướng tới attempt |
| `src/app/result/[attemptId]/page.tsx` | Chưa hiện điểm tổng khi còn câu chờ duyệt; hiện điểm sau khi hoàn tất |
| `supabase/migrations/20260721_essay_assisted_grading.sql` | Cột/bảng/RLS/trigger và ba RPC của pilot; đã áp Primary ngày 2026-07-22 |
| `supabase/preflight/20260721_essay_assisted_grading_postflight.sql` | Hậu kiểm chỉ đọc đã đạt 20/20 dòng `must_be_zero=0` |
| `supabase/migrations/20260723_essay_legacy_config_backfill.sql` | Sửa nội dung/lời giải/rubric cho sáu câu essay legacy; đã áp và hậu kiểm 8/8 dòng bằng 0 |
| `supabase/migrations/20260722_runtime_security_hardening.sql` | Candidate r4 đang review, chưa áp: RLS/grant đóng, RPC tải/nộp an toàn cho exam/practice/homework, feature gate server-side, positive-score constraint và khóa bypass buộc đổi mật khẩu |
| `supabase/preflight/20260722_runtime_security_hardening_*.sql` | Preflight/postflight cấu trúc; vẫn phải bổ sung negative test bằng JWT thật |

## Dữ liệu và trạng thái

Migration mở rộng `question_type` bằng `essay` và thêm:

- `questions.essay_max_score`.
- `question_grading_configs`: đáp án tham chiếu, rubric, version, ngưỡng confidence và cờ AI.
- Các trường chấm trên `student_answers`: `max_score`, `grading_status`, feedback/breakdown/confidence, metadata AI, `answer_hash`, người/thời điểm duyệt.
- Các trường tổng hợp trên `exam_attempts`: `grading_status`, điểm khách quan/tự luận, điểm thô đạt/tối đa, số câu chờ duyệt, `submission_hash` cho replay idempotent và `graded_at`.
- `essay_grading_reviews`: audit append-only cho mỗi quyết định giáo viên; `review_hash` làm replay cùng payload trở thành idempotent.

State chính:

```text
student_answers
  objective: auto_graded
  essay blank: approved + score 0
  essay có nội dung: pending_review -> approved

exam_attempts
  in_progress
    -> submitted + pending_review + score NULL
    -> submitted + completed + score thang 10
```

Attempt vẫn giữ `status='submitted'`; `grading_status` phân biệt đang chờ và đã hoàn tất. Không đổi thành `status='graded'` trong pilot để giảm phá vỡ các reader cũ.

## Luồng sử dụng

1. Giáo viên mở `/admin/questions/essay/new`, nhập đề, đáp án tham chiếu, điểm tối đa và rubric. Tổng điểm rubric phải bằng điểm tối đa.
2. Tạo đề ở `/admin/exams/create`, chọn `simulation`. Source có `essay` bị chặn khi chọn `practice`; essay và short answer được xếp vào phần 3.
3. Học sinh làm `/exam/[attemptId]` và nộp. `ExamRunner` gọi `submit_exam_attempt`; client không gửi `score`, `is_correct` hoặc `student_id`.
4. RPC khóa attempt, xác minh owner/mode, chấm ba loại khách quan trên server và ghi essay có nội dung là `pending_review`.
5. Học sinh thấy “Đang chờ chấm tự luận”; `score` toàn bài là `NULL` cho đến khi mọi essay được duyệt.
6. Giáo viên mở kết quả đề, chọn “Duyệt chấm”, rồi tới chi tiết attempt.
7. Giáo viên có thể chấm tay hoặc:
   - sao chép gói chấm ẩn danh;
   - gửi gói đó cho một AI bên ngoài;
   - dán đúng một JSON trả về;
   - kiểm tra điểm từng tiêu chí, confidence, bằng chứng và nhận xét;
   - sửa điểm/nhận xét nếu cần;
   - nhấn “Duyệt và chốt điểm”.
8. `review_essay_answer` kiểm tra role/scope, answer hash, rubric version và giới hạn điểm; sau đó ghi audit và tính lại điểm toàn bài trên server.

## Hợp đồng JSON với AI

Schema bắt buộc là `essay-grade-result.v1` gồm:

- `grading_ref` đúng hash của bài hiện tại;
- `rubric_version` đúng version đang chấm;
- `outcome`: `suggested` hoặc `needs_human_review`;
- `suggested_score`, `confidence` trong giới hạn;
- đúng một kết quả cho mỗi `criterion_id`, không thừa/trùng;
- tổng điểm tiêu chí khớp `suggested_score`;
- feedback tiếng Việt và lý do cần xem lại nếu có.

Parser từ chối JSON sai bài, rubric cũ, tiêu chí lạ, điểm vượt giới hạn hoặc tổng điểm không khớp. Điều này chỉ kiểm tra cấu trúc và phiên bản, không chứng minh nhận xét AI đúng về toán học.

## Cách tính điểm

- `exam_questions.score` là điểm tối đa thô của từng câu; essay lấy từ `questions.essay_max_score`, các câu cũ mặc định 1.
- `student_answers.score` là điểm thô nhận được.
- Khi mọi essay đã được duyệt:

```text
exam_attempts.score = round(earned_points / max_points * 10, 2)
```

- Sau khi chấm xong, `correct_answers` đếm các answer đạt trọn điểm; essay có điểm một phần vẫn phải hiển thị theo `score/max_score`. UI không được suy ra số câu tự luận sai từ `total_questions - correct_answers`.

## Quyền và bảo mật

- `create_essay_question`: chỉ `admin|teacher` theo profile.
- `submit_exam_attempt`: yêu cầu `auth.uid()` là owner và đề có `exam_mode='simulation'`; submit lần hai trả kết quả hiện có.
- `review_essay_answer`: admin toàn cục; teacher chỉ khi là người tạo đề hoặc `classes.teacher_id` của lớp đề.
- Trigger chặn student ghi/sửa/xóa trực tiếp answer của simulation và chặn sửa các trường định danh, thời gian, trạng thái hoặc điểm attempt ngoài trusted RPC.
- `question_grading_configs` không có policy SELECT cho student.
- Mọi gợi ý AI và điểm cuối được lưu trong `essay_grading_reviews` để audit.

Pilot chưa giải quyết toàn bộ mô hình role/OTP của website. Middleware source hiện chỉ buộc exact `admin` qua OTP và không cho `teacher` vào trang xác minh; API OTP vẫn exact `admin`. `teacher` có thể đi qua admin shell mà không qua OTP nên quyền thực tế vẫn phải được scope ở API/RLS. Constraint role live hiện chỉ cho `admin|student`; không nới constraint này trong cutover 20260722. Homework vẫn còn lệch semantics giữa `teacher` ở UI/helper chung và exact `admin` trong policy/helper domain. Phải kiểm thử và chốt role matrix trước production.

## Giới hạn đã biết

- Schema/RPC essay 20260721 và backfill 20260723 đã live với hậu kiểm cấu trúc/dữ liệu đạt; chưa có JWT/E2E, generated Database types hoặc Supabase integration tests.
- Catalog live xác nhận RLS đã bật nhưng policy/grant core trước hardening còn rộng. Loader source không select `is_correct`/`solution`, nhưng chỉ JWT negative test sau cutover mới chứng minh student không thể đọc key hoặc ghi score qua direct table/RPC.
- Không có API AI tự động, retry, rate limit, cost control hoặc model allowlist.
- Essay chưa có autosave server-side; nội dung chỉ nằm trong state trình duyệt đến lúc nộp, nên reload/mất kết nối có thể làm mất bài. Chưa dùng pilot cho kỳ thi thật trước khi có RPC autosave và kiểm thử resume.
- Rubric/config là dữ liệu live; pilot lưu rubric version và hash bài nhưng chưa snapshot toàn bộ rubric theo từng attempt.
- `answer_hash` dùng để phát hiện bài/version không khớp, không phải chữ ký mật mã.
- Hardening source chưa có bằng chứng apply live; candidate migration 20260722 r4 còn đang review. Nếu chỉ deploy source hoặc chỉ chạy migration thì luồng sẽ không tương thích.
- Candidate r4 rebuild closed baseline cho parent policy/grant của `classes`, `exams`, `homeworks`, assignments, recipients và `site_settings`; vẫn phải review preflight/postflight vì helper ownership tin các trường parent này.
- Ngân hàng câu hỏi teacher dùng owner-only: câu đa owner/không suy ra owner được để admin xử lý; câu đã link phải clone/version thay vì sửa trực tiếp.
- Feature gate server-side hardening mới bao phủ `simulation`/`practice`/`homework`; entitlement `history`/`analytics` vẫn là P1 chưa đóng.
- Legacy binary analytics bỏ qua essay trong trusted RPC vì không biểu diễn được partial credit; các dashboard khác vẫn có thể chưa hiểu `grading_status`/essay partial score.

## Điều kiện mở pilot (staging hoặc maintenance trên project hiện tại)

`20260721_essay_assisted_grading.sql` và `20260723_essay_legacy_config_backfill.sql` đã hoàn tất trên Primary Database. Không chạy lại hai migration này để “thử lại”. Phần cutover còn lại là:

1. Hoàn tất review candidate `20260722_runtime_security_hardening.sql` r4. Backup và đóng luồng bắt đầu/nộp bài trước khi làm bất kỳ thay đổi live nào.
2. Chạy từng block `20260722_runtime_security_hardening_preflight.sql`; dừng nếu thiếu object/key, invariant khác 0, trust anchor sai, điểm liên kết không dương, legacy RPC không hiểu rõ hoặc parent policy/grant không an toàn. Trạng thái RLS parent hiện tại là inventory vì r4 sẽ enable và rebuild trong cùng transaction, nhưng mọi bảng/constraint/owner cần thiết vẫn phải tương thích. Constraint role live chỉ có `admin|student`; không tự thêm `teacher` trong cutover này.
3. Chỉ sau khi review và preflight đạt, áp `20260722_runtime_security_hardening.sql`, deploy source cùng phiên bản khi website vẫn maintenance, rồi chạy toàn bộ postflight; mọi dòng trong final structural gate phải có `must_be_zero=0`.
4. Test negative bằng session/JWT thật: unauthenticated, basic-disabled feature, cross-attempt/cross-class, direct score/key write, hash/rubric version cũ; chỉ test `teacher` sau khi có role matrix/live fixture hợp lệ.
5. Test chức năng: bốn loại simulation, blank/multiple essay, submit hai lần, duration `0`, hết giờ, reload và cập nhật điểm đã duyệt; test thêm ba loại cũ ở practice/homework.
6. Kiểm tra prompt không chứa profile/email/lớp; thử prompt injection và JSON sai schema.
7. Xác nhận practice/homework từ chối `essay`, key/solution chỉ hiện theo policy đã lưu.
8. Chạy typecheck, targeted lint, build và browser QA student/admin trên desktop/mobile.

Chi tiết lệnh và smoke test nằm trong [`RUNBOOK.md`](RUNBOOK.md). Backlog bảo mật còn lại nằm trong [`SECURITY_AND_AUDIT.md`](SECURITY_AND_AUDIT.md).
