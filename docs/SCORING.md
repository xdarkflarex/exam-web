# Thang điểm

Nguồn duy nhất cho cách website tính điểm. Đổi thang điểm thì sửa file này trong cùng commit.

Áp dụng từ **2026-08-06** (migration `20260806_moet_scoring_scale.sql` + module
`src/lib/exam/scoring.ts`). Trước ngày đó hệ thống chấm khác — đọc mục
[Điểm cũ không được tính lại](#điểm-cũ-không-được-tính-lại) trước khi kết luận có bug.

> **Trạng thái (2026-08-05):** source xong, **migration đã áp trên Primary** — postflight 30/30
> dòng `must_be_zero = 0`, cột `exams.scoring_profile` và hàm `moet_true_false_score` đều tồn tại,
> `student_answers` không đổi (240 dòng / tổng 6,50 / max 240,00, khớp preflight).
>
> **Chuỗi gọi đã xác minh đủ** bằng bốn kiểm ghép lại: client gọi `submit_exam_attempt`
> (`ExamRunner.tsx:248`) → wrapper gọi `_trusted_internal` (`wrapper_...khong_goi_internal` = 0)
> → hàm đó gọi hàm bậc thang (`ham_cham_chua_goi_bac_thang` = 0) và **không còn** công thức tuyến
> tính cũ (`con_cong_thuc_tuyen_tinh_cu` = 0) → hàm bậc thang **chạy thật** ra đúng
> `0 / 0,1 / 0,25 / 0,5 / 1,0` (`bac_thang_sai_bang_gia_tri` = 0, kiểm này gọi hàm chứ không đọc
> `prosrc`). Kịch bản "3/4 ý vẫn ra 0,75" đòi hỏi công thức cũ còn sót, mà kiểm tàn dư đã loại trừ.
>
> **Còn lại:** cách đếm *số ý đúng* trước khi đưa vào hàm bậc thang nằm trong vòng lặp plpgsql,
> không kiểm được bằng SQL tĩnh. Phép thử end-to-end ([`RUNBOOK.md`](RUNBOOK.md) mục 8 bước 6)
> đóng nốt phần đó — rủi ro thấp, chưa chạy, sửa sau được.
>
> Bước 5 (rà lại phân loại đề: đề học kì bị backfill nâng nhầm lên `moet_standard`) cũng chưa làm.

## Thang Bộ áp cho loại đề nào

Đây là mục phải đọc trước mọi mục khác. Thang Bộ GD&ĐT là quy định của **kỳ thi tốt nghiệp
THPT**, không phải quy tắc chung cho mọi bài kiểm tra. Áp nó cho đề thi học kì là sai phạm vi:
ma trận điểm học kì do trường và giáo viên ra đề, khác nhau từng khối.

Cột `exams.scoring_profile` giữ phân biệt này. Ba loại đề giáo viên chọn khi tạo:

| Loại đề (UI) | `exam_mode` | `scoring_profile` | Trọng số | Bắt buộc 4 ý | Bắt buộc tổng 10 |
|---|---|---|---|:-:|:-:|
| Thi thử | `simulation` | `moet_standard` | thang Bộ, cố định | có | không¹ |
| Thi học kì | `simulation` | `custom` | giáo viên tự đặt, khởi tạo 1đ/câu | không | không |
| Ôn tập | `practice` | `custom` | giáo viên tự đặt, khởi tạo 1đ/câu | không | không |
| Bài tập về nhà² | — | — | giáo viên tự đặt, khởi tạo 1đ/câu | không | không |

¹ Đề thi thử một chương ra tổng khác 10 vẫn hợp lệ — chỉ cảnh báo, xem
[Quy đổi về thang 10](#quy-đổi-về-thang-10).
² `homeworks` / `homework_questions` **không có cột `scoring_profile`**: domain đó luôn tự do
cấu hình, không có khái niệm thang chính thức nào.

**Thi thử và thi học kì cùng `exam_mode = 'simulation'`.** Vì vậy không nơi nào được suy hồ sơ
điểm từ `exam_mode` — phải đọc `scoring_profile`. Bảng `EXAM_KIND` trong
`src/app/admin/exams/create/page.tsx` là chỗ duy nhất hai cột được nối với nhau.

Đề tạo **trước 2026-08-06** không có cột này; `normalizeScoringProfile()` cho `custom`
(`DEFAULT_SCORING_PROFILE`). Chọn `custom` chứ không phải `moet_standard` vì đề cũ mang trọng số
1 mỗi câu — gọi nó là "theo thang Bộ" thì UI sẽ báo sai lệch trên dữ liệu mà không ai định sửa.

**Cột `scoring_profile` không cho `UPDATE` từ client** (chỉ `INSERT`). Đổi hồ sơ của một đề đã
tồn tại làm mọi trọng số hiện có thành sai thang, nên phải làm bằng SQL có chủ đích.

Bậc thang Đúng/Sai là ngoại lệ: nó áp cho **cả ba** loại đề và cả bài tập về nhà, vì nó là cách
chấm *một câu*, không phải cách phân bổ điểm của đề.

## Trọng số mỗi câu

Chỉ áp cho đề **thi thử** (`moet_standard`). Theo thang chính thức của Bộ GD&ĐT cho đề thi tốt
nghiệp THPT môn Toán.

| Loại câu | `question_type` | Trọng số | Ghi ở đâu |
|---|---|---:|---|
| Trắc nghiệm 4 phương án | `multiple_choice` | **0,25** | `MOET_SCORE.multiple_choice` |
| Đúng / Sai (4 ý) | `true_false` | **1,00** | `MOET_SCORE.true_false` |
| Trả lời ngắn | `short_answer` | **0,50** | `MOET_SCORE.short_answer` |
| Tự luận | `essay` | **tổng thang điểm rubric** | `rubricTotal()` |

Trọng số nằm ở `exam_questions.score` (đề thi / ôn tập) và `homework_questions.score`
(bài tập về nhà), cả hai là `numeric` với `CHECK (score > 0)`.

Đề chuẩn **12 trắc nghiệm + 4 Đúng/Sai + 6 trả lời ngắn** cộng đúng
`12·0,25 + 4·1 + 6·0,5 = 10,0`. Đây là bất biến trung tâm: vì tổng đã là 10, phép quy đổi
thang 10 không làm méo điểm đề chuẩn. Đề có tự luận, ví dụ
`12 MC + 2 TF + 4 SA + 3 câu rubric 1đ`, cũng ra 10,0.

Đề `custom` (thi học kì, ôn tập) và bài tập về nhà khởi tạo **1 điểm mỗi câu**
(`CUSTOM_DEFAULT_SCORE`), bằng `DEFAULT` của cả hai cột. Một điểm mỗi câu nghĩa là điểm sau quy
đổi tỷ lệ đúng theo số câu làm đúng — đúng 6/12 ra 5,0 — mặc định dễ đoán nhất cho giáo viên
chưa muốn nghĩ về ma trận điểm. Sửa từng câu ở trang cấu hình điểm của đề.

## Bậc thang Đúng / Sai

Điểm câu Đúng/Sai theo **số ý đúng**, không phải tỷ lệ:

| Số ý đúng | Điểm (trọng số 1,0) |
|---:|---:|
| 4 | 1,00 |
| 3 | 0,50 |
| 2 | 0,25 |
| 1 | 0,10 |
| 0 | 0 |

Đây là **bậc thang**, không phải tỷ lệ tuyến tính: đúng 3/4 ý được **0,5đ**, không phải 0,75đ.
Bậc thang cố ý dốc — ý thứ tư đáng 0,5đ còn ý thứ nhất chỉ 0,1đ — nên đoán bừa gần như vô ích.
Với tỷ lệ tuyến tính, đoán bừa được 2/4 ý vẫn lấy nửa điểm.

Trọng số khác 1 thì mọi bậc nhân theo: trọng số 2 → `2,0 / 1,0 / 0,5 / 0,2 / 0`. Đó là cách một
đề học kì đặt câu Đúng/Sai 2 điểm mà vẫn giữ đúng hình dạng bậc thang.

**Với đề thi thử, câu Đúng/Sai phải có đúng 4 ý.** Bậc thang chỉ định nghĩa cho 4 ý. Hàng rào
hai lớp, cả hai chỉ áp cho `moet_standard`:

- Lớp database: trigger `exam_questions_true_false_four_statements` raise
  `TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS`, và nó **chỉ chặn khi đề là `moet_standard`**.
  `homework_questions` **không có** trigger này.
- Lớp UI: trang tạo đề chặn lưu khi đang chọn "Thi thử"; trang cấu hình điểm của đề thi thử
  liệt kê câu vi phạm.

Với đề `custom` và bài tập về nhà, câu Đúng/Sai **2 hay 3 ý là hợp lệ** và hàm chấm rơi về **tỷ
lệ tuyến tính** — nhánh đúng nghĩa duy nhất khi bậc thang 4 bậc không áp được. Ba trang UI cố ý
không cảnh báo gì trong trường hợp này: báo động trên một cấu hình đúng chỉ làm giáo viên học
cách bỏ qua mọi cảnh báo.

Nếu một câu ≠ 4 ý lọt vào đề `moet_standard` (dòng gắn trước migration, trigger không thấy), hàm
chấm cũng rơi về tỷ lệ tuyến tính thay vì ném lỗi. Ném lỗi giữa lúc học sinh nộp bài sẽ làm mất
cả bài làm, tệ hơn nhiều. Postflight có kiểm `thi_thu_cau_dung_sai_khong_du_4_y` để bắt các dòng
này.

## Câu tự luận: điểm lấy từ rubric

Điểm một câu tự luận = **tổng `max_score` của các tiêu chí** trong
`question_grading_configs.rubric` — *"chấm rubric có thang điểm và tự cộng lại được hoặc
giáo viên nhìn rubric set điểm được"*.

Cổng kiểm ở cả hai lớp, cùng ngưỡng lệch **0,0001**:

- `submit_exam_attempt` raise `ESSAY_RUBRIC_SCORE_MISMATCH` khi `exam_questions.score` lệch
  tổng rubric quá ngưỡng (`20260721_essay_assisted_grading.sql:665-678`).
- Phía TS: `matchesRubricTotal()` / `RUBRIC_SCORE_TOLERANCE` trong `src/lib/exam/scoring.ts`.
  Trang cấu hình điểm dùng nó để chặn lưu, để lỗi hiện lúc cấu hình đề chứ không phải lúc
  học sinh bấm nộp.

Câu tự luận **không có rubric** thì không tạo được đề: `submit_exam_attempt` sẽ raise
`ESSAY_GRADING_CONFIG_MISSING` đúng lúc nộp bài, và lúc đó thì quá muộn. Thêm rubric ở
`/admin/questions/essay/new` trước.

Điểm cuối của một bài tự luận là điểm giáo viên duyệt (hoặc AI chốt khi bật
`ESSAY_AI_AUTO_FINALIZE`, mặc định tắt) — xem [`ESSAY_GRADING.md`](ESSAY_GRADING.md).
Trọng số ở đây chỉ là **thang tối đa** của câu.

## Quy đổi về thang 10

```
score = round(earned_points / max_points * 10, 2)
```

`max_points` là `SUM(exam_questions.score)` tính tại thời điểm nộp, không phải
`exams.total_score`. Cột `total_score` chỉ là con số hiển thị cho giáo viên; các trang cấu
hình cập nhật nó cho khớp, nhưng máy chấm không đọc nó.

Đề **không theo cấu trúc chuẩn vẫn được quy đổi**. Đề một chương chỉ 12 trắc nghiệm có tổng
thô 3,0; làm đúng hết được 10đ, đúng 6/12 được 5,0đ. Đây là quyết định có ý thức: giáo viên
tạo đề ngắn để luyện một chương, và điểm 3/3 thì không nói được gì cho học sinh.

Trang cấu hình cảnh báo khi tổng ≠ 10,00 **chỉ trên đề thi thử**, và **không chặn** — đề ngắn là
hợp lệ. Đề học kì không có cảnh báo này: tổng khác 10 là bình thường khi giáo viên tự đặt ma
trận điểm.

## Nơi ghi trọng số

| Nơi | File | Ghi gì |
|---|---|---|
| Tạo đề (cả ba loại) | `src/app/admin/exams/create/page.tsx` | `exams.scoring_profile` + `exam_questions.score` + `exams.total_score`. Chặn nếu tự luận thiếu rubric (mọi loại đề); chặn Đúng/Sai ≠ 4 ý **chỉ khi chọn Thi thử** |
| Cấu hình điểm của đề | `src/app/admin/exams/[examId]/questions/page.tsx` | Sửa từng câu; nút đặt lại là "theo thang Bộ" hay "1 điểm mỗi câu" tuỳ hồ sơ; cập nhật `exams.total_score` |
| Tạo bài tập về nhà | `src/app/admin/homework/create/page.tsx` | `homework_questions.score`, khởi tạo 1đ/câu, sửa từng câu, không ràng buộc 4 ý |

Trang cấu hình điểm chỉ cho sửa khi `can_edit_exam_question_links(exam_id)` trả true — tức đề
**chưa publish** *và* **chưa có attempt nào**. Đó là chính hàm mà policy
`staff_update_draft_exam_question_links` dùng, nên UI và RLS không thể nói khác nhau. Đề đã có
người làm thì trọng số đóng băng: sửa lúc đó làm điểm của bài đã nộp và bài nộp sau không so
sánh được với nhau.

Ràng buộc rubric của câu tự luận (`ESSAY_RUBRIC_SCORE_MISMATCH`) áp cho **mọi hồ sơ** — nó là
ràng buộc của RPC chấm thi, không phải của thang Bộ.

## Ba luồng dùng chung một hàm

Bậc thang Đúng/Sai nằm ở đúng một chỗ mỗi lớp, để sửa thang điểm về sau chỉ phải sửa một nơi.
Nó áp cho **cả ba** luồng và cả hai hồ sơ điểm — bậc thang là cách chấm một câu, còn hồ sơ chỉ
quyết định trọng số nhân vào.

| Lớp | Hàm | Ba luồng gọi nó |
|---|---|---|
| Database | `public.moet_true_false_score(max, correct, total)` | `submit_exam_attempt_trusted_internal` (thi thử), `submit_practice_attempt` (ôn tập), `check_homework_answer` (bài tập về nhà) |
| TypeScript | `trueFalseScore()` trong `src/lib/exam/scoring.ts` | UI cấu hình và tổng kết điểm |

Hai lớp **phải cho cùng kết quả**. `src/lib/exam/scoring.test.ts` kiểm bảng giá trị phía TS;
postflight của `20260806` kiểm cùng bảng giá trị phía database, cộng thêm
`generate_series(-2, 8)` để chắc điểm không bao giờ vượt trọng số.

Chi tiết cần biết khi sửa hàm chấm thi thử: `20260722_runtime_security_hardening.sql:1195-1205`
**RENAME** `submit_exam_attempt` thành `submit_exam_attempt_trusted_internal` rồi bọc bằng
`submit_exam_attempt` mới lo phần gating công bố điểm. Nghĩa là **thân hàm chấm đang chạy là
của `20260721`**, tên `submit_exam_attempt_trusted_internal`. Sửa wrapper là mất gating điểm.

## Điểm cũ không được tính lại

**14 attempt nộp trước 2026-08-06 giữ nguyên điểm cũ.** Migration `20260806` không chạm
`student_answers` và `exam_attempts`. Công thức mới chỉ áp cho lần nộp sau.

Hệ quả phải biết trước: **hai attempt cùng một đề có thể khác điểm** nếu một cái nộp trước và
một cái nộp sau 2026-08-06. Đó không phải bug.

Công thức cũ, để đối chiếu khi đọc số liệu cũ:

- Mọi câu không-tự-luận mang trọng số **1** (`create/page.tsx` hardcode `score: 1`), nên đề
  chuẩn có tổng thô 22 thay vì 10. Một câu trắc nghiệm được `10/22 = 0,4545đ` — hào phóng 1,8
  lần so với 0,25; một câu Đúng/Sai cũng chỉ 0,4545đ — khắt khe 2,2 lần so với 1,00.
- Đúng/Sai chấm theo **tỷ lệ tuyến tính**: `round(max · correct / total, 4)`, nên 3/4 ý ra 0,75.
- Bài tập về nhà: câu Đúng/Sai **không có điểm thành phần** — chỉ đúng cả 4 ý mới được điểm.

Ba đề đang có trên Primary đều là `exam_mode = 'simulation'` nên backfill nâng cả ba lên
`moet_standard`. Nếu một trong số đó thật ra là đề học kì thì phải đổi lại bằng SQL —
`UPDATE public.exams SET scoring_profile = 'custom' WHERE id = '…'` — rồi đặt lại trọng số ở
trang cấu hình điểm. Không có đường nào làm việc đó từ UI: cột `scoring_profile` cố ý không cho
`UPDATE` từ client.

Attempt thật duy nhất có điểm trên Primary là 3,1 (earned 6,5 / max 21).
`scoring.test.ts` giữ lại con số này để đối chiếu.

## Kiểm tra

```bash
node --experimental-strip-types --test "src/lib/exam/scoring.test.ts"
```

Phía database: chạy `supabase/preflight/20260806_moet_scoring_scale_postflight.sql`, mọi
`must_be_zero` phải bằng 0. Quy trình vận hành đầy đủ ở [`RUNBOOK.md`](RUNBOOK.md).

Phép thử quyết định sau khi áp migration: nộp một attempt với đúng **3/4 ý** một câu Đúng/Sai
và đọc `student_answers.score`. Kỳ vọng **0,5**. Nếu ra **0,75** thì migration chưa vào đúng
thân hàm đang chạy — nhớ là `submit_exam_attempt` chỉ là wrapper.
