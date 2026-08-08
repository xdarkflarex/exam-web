# Bàn giao: trạng thái công việc ngày 2026-08-06

File tạm cho phiên làm việc tiếp theo. Xoá khi các việc dưới đây đã xong.
Đọc `AGENTS.md` trước, rồi file này. Hai mảng việc đang treo: pipeline chấm AI tự
luận (2026-08-04) và thang điểm Bộ GD&ĐT (2026-08-06, mục riêng bên dưới).

## Đã xong trên database và môi trường (2026-08-04)

- **Key DeepSeek** đã revoke và cấp lại; `.env` dùng `DEEPSEEK_API_KEY` (không tiền
  tố) + `DEEPSEEK_MODEL=deepseek-chat` + `CRON_SECRET`.
- **Migration `20260805_essay_ai_usage.sql` đã áp** trên Primary, preflight và
  postflight đều đạt.
- **Test quyền bằng JWT học sinh thật: 9/9 đạt.** Chạy lại bất cứ lúc nào bằng
  `node --env-file=.env scripts/essay-ai-permission-check.mjs --email <email> --password <mk>`.
  Bốn test database bị chặn ở lớp `GRANT` (code `42501`), không chỉ RLS. Route
  `stats` bằng session học sinh trả đúng 403 — nhánh "đăng nhập rồi mà không phải
  admin" đã được xác minh. Chi tiết ở `docs/RUNBOOK.md` mục 8.

Còn một tài khoản thử `testhocsinh@gmail.com` với mật khẩu yếu (6 chữ số) trên
Primary. **Xoá tài khoản đó hoặc đổi sang mật khẩu mạnh** — nó nằm cùng database
với học sinh thật, ai đoán được email là vào được.

## Worker đã chạy thật lần đầu (2026-08-04) — đạt

Lần gọi provider thật đầu tiên của hệ thống. Chạy trên attempt
`0a983fd4-f747-4b3d-996e-d2783f939529` (3 câu essay, tài khoản thử của chủ dự án,
không phải bài học sinh thật). Tổng chi phí **0,00079 USD**.

| Kiểm tra | Kết quả |
|---|---|
| Cờ tắt (`ESSAY_AI_ENABLED=false`) | `picked: 0`, 0 dòng usage — worker đọc cờ **trước** khi query hàng chờ nên không chạm database, không gọi provider |
| Chấm thật, auto-chốt tắt | 3 dòng usage, cả 3 `outcome='pending_review'`, latency 1,8–3,1s |
| `student_answers` sau khi chấm | **không đổi** — cả 3 vẫn `pending_review`, `score`/`graded_by`/`graded_at` đều `null` |
| Worker ghi `essay_grading_reviews` | không dòng nào (3 dòng có sẵn là của luồng chấm tay 2026-07-25, `actor_kind='teacher'`) |
| Gọi lại lần hai | `skipped: 3`, `skipReasons: {already_graded_same_input: 3}`, `estimatedCostUsd: 0` — không gọi provider lần hai |
| Hai lời gọi song song | 200 và **409** `ALREADY_RUNNING` |
| `input_hash` | 3/3 phân biệt |
| RPC `essay_ai_month_to_date_cost()` | trả đúng 0,00079 USD |

`triggers` của cả 3 bài: `auto_finalize_disabled`, `model_requested_review`,
`low_grading_confidence`. Hai trigger sau **không phải cấu hình** — đó là DeepSeek
tự trả `ai_score=0`, `confidence=0` vì ba bài này chứa chuỗi vô nghĩa
(`"eqewqwqczxcdqweqeeqw"`). Mô hình từ chối đoán, đúng hành vi mong muốn.

**Giới hạn của kết quả này, đừng đọc quá lên:** nó chứng minh *đường ống* chạy
đúng (RPC → provider → validator → quyết định → nhật ký) và các cổng fail-closed
hoạt động. Nó **không** nói gì về chất lượng chấm — bài rác thì mô hình nào cũng
"qua". Chất lượng là việc của benchmark ở mục dưới.

Còn hai thứ chưa xác minh vì cần dữ liệu khác: nhánh `auto_finalize` thật sự ghi
`ai_graded` (phải bật cờ, mà cờ đang bị chặn có lý do), và cascade khi xoá
`exam_attempt`.

## Việc phải làm bằng tay — chưa ai làm được thay bạn

### 1. Xem dashboard

Mở `/admin/essay-ai` bằng tài khoản admin, xác nhận nó đọc được 3 dòng usage vừa
có. Đây là lần đầu dashboard có số liệu thật để hiển thị.

### 2. Benchmark trước khi nghĩ tới auto-chốt

`fixtures/essay-ai/` mới có 3 fixture mẫu do AI soạn. Cần fixture thật của bạn —
đọc `fixtures/essay-ai/README.md` mục "Bộ fixture nên có những gì". Kiểm tra
fixture không tốn tiền trước:

```bash
node scripts/essay-ai-benchmark.mjs --dry-run
```

Chạy thật (mỗi fixture là một lượt gọi API có phí):

```bash
node scripts/essay-ai-benchmark.mjs --out .ai-cache/essay-ai-benchmark.json
```

Hai con số quyết định: **tỷ lệ sai nghiêm trọng** (lệch > 20% thang điểm) và
**calibration của confidence**. Nếu nhóm AI tự tin không chính xác hơn nhóm không
tự tin thì cổng chặn theo confidence không lọc được gì, và script in cảnh báo đúng
chỗ đó.

## Đã xong trong source (chưa deploy)

| Việc | File |
|---|---|
| Worker chấm tự động | `src/lib/essay-ai/worker.ts`, `worker-logic.ts` |
| Route gọi worker | `src/app/api/essay-ai/grade-queue/route.ts` |
| Nhật ký chi phí | `supabase/migrations/20260805_essay_ai_usage.sql` + 3 file kèm |
| UI trạng thái `ai_graded` | `src/app/result/[attemptId]/page.tsx`, `src/components/admin/EssayGradingPanel.tsx`, `src/app/admin/attempts/[attemptId]/page.tsx`, `src/app/admin/exams/[examId]/results/page.tsx` |
| Dashboard theo dõi | `src/app/admin/essay-ai/page.tsx`, `src/app/api/admin/essay-ai/stats/route.ts` |
| Kill-switch tự động theo override rate | `src/lib/essay-ai/override-guard.ts`, `override-stats.ts` (+ 3 biến `ESSAY_AI_OVERRIDE_*`) |
| Benchmark | `scripts/essay-ai-benchmark.mjs`, `fixtures/essay-ai/` |
| Test quyền tự động | `scripts/essay-ai-permission-check.mjs` |

Kiểm tra đã chạy trên máy: `tsc --noEmit` 0 lỗi; `eslint` trên các file mới và đã
sửa 0 lỗi; `npm run build` compiled successfully; `npm test` **194/194 đạt**
(con số 82/82 ở bản trước của file này đã cũ — bộ test đã lớn thêm nhờ
`scoring.test.ts`, `auto-finalize.test.ts`, `override-guard.test.ts`,
`override-stats.test.ts`).

Còn một warning cũ ở `src/app/result/[attemptId]/page.tsx:110`
(`useCallback has an unnecessary dependency: 'supabase'`) nằm trên code không sửa
lần này. Baseline repo vẫn fail 113 error/192 warning — tiêu chí là không thêm lỗi mới.

## Ba điều đừng quên

**`ESSAY_AI_AUTO_FINALIZE` đã bật `true` (2026-08-06).** Chủ dự án quyết định: đây là
lớp học thêm, điểm không phải điểm học bạ của trường, chấp nhận rủi ro AI chấm sai
và sửa tay khi phát hiện. Thay thế yêu cầu "phải giữ false" ở các bản trước.

**Nhưng bật cờ chưa làm bài nào được tự chốt.** `override-guard.ts` đòi 20 bài AI
chấm đã được giáo viên duyệt lại (`ESSAY_AI_OVERRIDE_MIN_COMPARED`, mặc định 20)
trước khi mở cổng. Hiện `compared` gần như bằng 0, nên mọi bài vẫn về
`pending_review`, chỉ khác là lý do giờ là `override_rate_exceeded` thay vì
`auto_finalize_disabled`. **Việc cần làm để auto-chốt thật sự chạy:** để worker chấm
20 bài, giáo viên duyệt lại đủ 20 bài đó trong hàng chờ, rồi cổng tự mở nếu tỷ lệ
sửa điểm ≤ 30% và tỷ lệ sai nghiêm trọng ≤ 5%. Theo dõi ở `/admin/essay-ai`.

Đừng hạ `MIN_COMPARED` cho nhanh — hạ nó là bỏ đúng cái bằng chứng làm cho việc
bật cờ có cơ sở.

Trạng thái hai điều kiện cũ:

- **OCR snapshot: xong trong source (2026-08-07), migration `20260807` đã nạp.** Trước đó
  `POST /api/essay-ai/ocr` trả text về trình duyệt rồi quên `confidence`/`warnings`,
  worker truyền `ocr: null`, và nhánh `if (ocr)` **cho qua** — ba cổng
  `low_ocr_confidence`, `ocr_warning`, `math_region_uncertain` không bao giờ kích
  hoạt. Đó là fail-OPEN nằm giữa module fail-closed. Đã sửa tận gốc: bảng
  `essay_ocr_snapshots` (`20260807`), route ghi bản ghi chất lượng, worker đọc lên,
  và `FinalizeInput.ocr` đổi từ `OcrResult | null` sang union ba trạng thái
  (`typed` / `scanned` / `scanned_snapshot_missing`) để "gõ tay" không còn bị đánh
  đồng với "mất dấu vết".

  **`20260808` đã nạp (2026-08-06).** Postflight toàn bộ `must_be_zero = 0`; negative
  test runtime qua PostgREST `5/5 đạt` (`node --env-file=.env
  scripts/essay-ocr-snapshot-permission-check.mjs`) — `UPDATE`/`DELETE` bị chặn ở
  `42501`, `SELECT` chạy được, `INSERT` chết ở FK `23503` (tức đã qua kiểm quyền),
  `anon` không đọc được. Một chi tiết đáng ghi: preflight báo
  `xac_nhan_loi_service_role_thua_quyen = 0` chứ không phải 3 như RUNBOOK dự đoán,
  nghĩa là quyền thừa đã được gỡ ở đâu đó ngoài quy trình ghi chép và migration chạy
  như no-op. Đã xác minh ACL cuối bằng `information_schema.role_table_grants`: chỉ
  còn `SELECT`, `INSERT`. Bối cảnh cũ của lỗi giữ lại bên dưới.

  Postflight `20260807` từng báo `service_role_thua_quyen_sua = 2`:
  bảng nhật ký OCR **không** append-only như file tuyên bố. `20260807` viết
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated` rồi `GRANT SELECT, INSERT TO
  service_role`, tin rằng "không grant UPDATE/DELETE" nghĩa là không có — nhưng
  `ALTER DEFAULT PRIVILEGES` của Supabase cấp `ALL` cho mọi bảng mới trong `public`,
  nên `GRANT` là no-op và `service_role` (không nằm trong danh sách `REVOKE`) giữ
  nguyên `ALL`, gồm cả `TRUNCATE`. Không có call-site nào dùng các quyền đó nên chưa
  có dòng nào bị sửa, nhưng tính "không sửa được sau khi ghi" hiện chỉ là quy ước
  trong comment. Nạp `20260808_essay_ocr_snapshots_lock_append_only.sql` theo
  `docs/RUNBOOK.md`; cùng lúc rà cả schema bằng
  `supabase/preflight/20260808_default_privileges_audit.sql` vì cái bẫy này áp cho
  mọi bảng mới, không riêng bảng này.
- **Chưa benchmark trên fixture thật.** `fixtures/essay-ai/` mới có fixture mẫu.
  Hai con số quyết định: tỷ lệ sai nghiêm trọng (lệch > 20% thang điểm) và
  calibration của `confidence`. Nếu nhóm AI tự tin không chính xác hơn nhóm không
  tự tin thì cổng chặn theo confidence không lọc được gì.

Lưu ý về dữ liệu cũ: bài nộp **trước** khi nạp `20260807` không có snapshot và
không phân biệt được với bài gõ tay — dữ liệu đó đã mất vĩnh viễn. Benchmark phải
chạy trên bài mới.

**Migration `20260803_exam_preparation_attempt_quota.sql` chưa áp.** Nó `CREATE OR REPLACE`
một hàm định nghĩa trong `20260722_runtime_security_hardening.sql` — mà `20260722` giờ đã
xác nhận là **đã áp**, nên rào cản thứ tự đã hết. Vẫn chưa áp trong đợt này; xử lý riêng.
UI đã xử lý `max_attempts` như optional nên không chạy cũng không vỡ gì.

**Đính chính: `20260722` đã áp.** Xác minh live ngày 2026-08-06 bằng `to_regprocedure` —
`submit_exam_attempt_trusted_internal`, `can_edit_homework_question_links` và
`get_my_safe_bookmarks` đều tồn tại, và grep chứng minh cả ba chỉ được định nghĩa trong
file đó. Mô tả "RPC server-side chấm điểm" trong `PROJECT_MAP.md` **là trạng thái hiện
tại**, không phải trạng thái tương lai. Phần còn thiếu là JWT negative test và E2E cho
đường ghi trực tiếp, không phải migration.

Điều phải biết trước khi sửa bất cứ hàm chấm nào: `20260722:1195-1205` **RENAME**
`submit_exam_attempt(text,jsonb)` thành `submit_exam_attempt_trusted_internal` rồi bọc bằng
`submit_exam_attempt` mới lo gating công bố điểm. Thân hàm chấm đang chạy vì thế là của
`20260721`, dưới tên `_trusted_internal`. `CREATE OR REPLACE` wrapper là mất gating điểm.

## Thang điểm Bộ GD&ĐT cho đề thi thử — migration đã áp, còn phép thử end-to-end (2026-08-05)

Thang chính thức của kỳ thi tốt nghiệp THPT áp cho **đề thi thử**: trắc nghiệm **0,25**, Đúng/Sai
**1,0**, trả lời ngắn **0,5**, tự luận bằng **tổng thang điểm rubric**. Bậc thang Đúng/Sai
(**1,0 / 0,5 / 0,25 / 0,1 / 0** theo số ý đúng — đúng 3/4 ý là **0,5đ**, không phải 0,75) áp cho
**mọi** loại đề, vì đó là cách chấm chứ không phải ma trận điểm.

**Ba loại đề còn lại không dùng thang Bộ:** thi học kì, ôn tập và bài tập về nhà là đề do giáo viên
ra, nên trọng số do giáo viên đặt, khởi tạo 1 điểm mỗi câu. Cột `exams.scoring_profile`
(`moet_standard` | `custom`) là chỗ ghi phân biệt này; nó **độc lập** với `exam_mode` — thi thử và
thi học kì cùng `simulation`. Nguồn duy nhất: `docs/SCORING.md`, mục "Thang Bộ áp cho loại đề nào".

Lý do phải làm: trọng số mọi câu đang hardcode `1`, nên đề chuẩn 12 MC + 4 TF + 6 SA có tổng
thô 22 thay vì 10 — một câu trắc nghiệm được 0,4545đ (hào phóng 1,8×) còn một câu Đúng/Sai
cũng chỉ 0,4545đ (khắt khe 2,2×). Cộng thêm hai lỗi độc lập: Đúng/Sai chấm theo tỷ lệ tuyến
tính ở cả thi thử và ôn tập, và bài tập về nhà **không có điểm thành phần** nào cả.

Đã xong trong source:

- `src/lib/exam/scoring.ts` + `scoring.test.ts` (34 test đạt) — hồ sơ điểm, hằng số, bậc thang,
  `rubricTotal()`, `matchesRubricTotal()` ở ngưỡng 0,0001, quy đổi thang 10, và hai helper nhập
  điểm `parseScoreInput()`/`formatScoreInput()` dùng chung cho ba trang.
- Bốn file migration `20260806_moet_scoring_scale` (migration / preflight / postflight /
  rollback): cột `exams.scoring_profile` (DEFAULT `custom`, có `INSERT` nhưng **không** `UPDATE`
  cho client), hàm bậc thang dùng chung `moet_true_false_score()`, `CREATE OR REPLACE` ba hàm
  chấm, trigger 4 ý trên `exam_questions` **chỉ chặn đề `moet_standard`** (không có trigger nào
  trên `homework_questions` — bài tập về nhà được phép có câu 2–3 ý), backfill trọng số +
  `total_score` chỉ cho đề `moet_standard`.
- Ba trang ghi trọng số: `admin/exams/create` (chọn một trong ba loại đề, ghi cả `exam_mode` và
  `scoring_profile`), `admin/exams/[examId]/questions` (mục "Cấu hình điểm" sửa từng câu + nút
  "Đặt lại theo thang Bộ" chỉ hiện với đề thi thử + bảng rubric cho câu tự luận),
  `admin/homework/create` (điểm mỗi câu tự do, mặc định 1).

**Đã làm (2026-08-05):** nạp `20260806` xong — postflight **30/30 dòng `must_be_zero = 0`**, cột
`exams.scoring_profile` và hàm `moet_true_false_score` đều tồn tại, `student_answers` không đổi
(240 dòng / tổng 6,50 / max 240,00, khớp preflight). Trang tạo đề hết đứt. Trong lúc nạp phát hiện
và sửa ba lỗi của file SQL, không phải của database: preflight/rollback dùng `\echo` (meta-command
psql, Supabase SQL Editor không hiểu); cổng chặn preflight chỉ báo kết quả qua `RAISE NOTICE` mà
Editor không hiện; và postflight đặt bảng `must_be_zero` ở giữa file trong khi Editor chỉ hiện câu
lệnh cuối — nay bảng đó là câu cuối, và có thêm cổng raise `POSTFLIGHT_CHAY_QUA_SOM` khi chạy
trước migration.

**Chưa làm — việc tiếp theo phải là cái này:**

1. **Rà lại phân loại đề sau backfill:** migration nâng mọi đề `exam_mode = 'simulation'` cũ lên
   `moet_standard`. Nếu trong đó có đề vốn là thi học kì, đưa về `custom` bằng SQL (cột không có
   `UPDATE` cho client); câu lệnh mẫu ở `docs/SCORING.md`. Làm trước phép thử vì nó đổi dữ liệu.
2. **Phép thử quyết định:** nộp attempt với đúng 3/4 ý một câu Đúng/Sai → `student_answers.score`
   phải là **0,5**. Ra **0,75** nghĩa là migration không vào đúng thân hàm đang chạy — nhớ
   `submit_exam_attempt` chỉ là wrapper. Lặp cho ôn tập và bài tập về nhà (bài tập về nhà
   trước migration ra **0**, nên nó chứng minh được thay đổi).
4. Kiểm hàng rào 4 ý ở cả hai lớp: UI chặn, và `INSERT` trực tiếp bằng SQL phải raise
   `TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS`. Rồi kiểm nhánh ngược: cùng phép thử trên đề `custom`
   phải **cho qua**.
5. Xác nhận 14 attempt cũ **không đổi điểm** (attempt có điểm thật: 3,1 / earned 6,5 / max 21).
   Theo quyết định của chủ dự án, điểm cũ không tính lại — nên hai attempt cùng một đề có thể
   khác điểm nếu một cái nộp trước 2026-08-06. Đó không phải bug.
6. Negative test quyền: tài khoản học sinh thử `UPDATE exam_questions SET score = 99` →
   permission denied. Thử luôn `UPDATE exams SET scoring_profile = 'custom'` → cũng phải denied,
   vì cột này chỉ được grant `INSERT`.

Chưa làm nữa: `homework_questions` trên Primary đang **rỗng**, nên phải tạo một bài tập về
nhà có câu Đúng/Sai mới test được bước 2. Và trang cấu hình điểm chỉ sửa được đề **chưa
publish và chưa có attempt** (`can_edit_exam_question_links`) — ba đề đang có đã bị đóng
băng, trọng số của chúng chỉ đổi được bằng backfill trong migration.

## Việc còn thiếu, đã biết, chưa làm

- ~~Bảng `essay_ocr_snapshots` + `essay_answer_uploads`~~ — **xong 2026-08-06**, xem mục
  "Lưu ảnh bài làm" bên dưới.
- **Schema `backup_20260804`** — giữ vài ngày rồi `DROP SCHEMA backup_20260804 CASCADE`.
  Cân nhắc backup định kỳ nằm **ngoài** Supabase: bản sao hiện tại nằm cùng
  database nên không cứu được nếu mất cả project.

## Lưu ảnh bài làm tự luận — migration đã nạp, còn phép thử runtime (2026-08-06)

`20260809_essay_answer_uploads.sql` **đã nạp trên Primary**: preflight 0 hết, migration tự
kiểm và commit, postflight 0 hết. Ảnh bài làm giờ được lưu trên bucket private
`essay-uploads` thay vì bị vứt sau khi OCR đọc.

Quyết định của chủ dự án đứng sau thiết kế này: học sinh thêm/sửa/xoá ảnh **trong giờ
thi**, sau khi nộp chỉ xem; admin toàn quyền. Ranh giới thực thi bằng
`exam_attempts.status = 'in_progress'`, không bằng vai trò — nên hết giờ mà chưa bấm nộp
cũng mất quyền sửa. Không có hard delete cho bất kỳ ai qua đường client; xoá là
`deleted_at`.

Xong trong source:

| Việc | File |
|---|---|
| Hạ tầng dùng chung (gate quyền, hash, đường dẫn) | `src/lib/essay-ai/uploads.ts` |
| Cấp signed upload URL + chỉ số trang + quota | `src/app/api/essay-ai/upload-url/route.ts` |
| Xoá ảnh (xoá mềm + xoá tệp, một lời gọi) | `src/app/api/essay-ai/upload/route.ts` |
| OCR đổi từ base64 sang `uploadId`, đối chiếu hash, ghi `upload_id` | `src/app/api/essay-ai/ocr/route.ts` |
| Worker lọc snapshot theo ảnh còn sống | `src/lib/essay-ai/worker.ts` |
| Thu nhỏ 1600px + xoá EXIF + băm phía client | `src/lib/essay-ai/client-image.ts` |
| UI danh sách ảnh + nút xoá + sửa câu "ảnh không được lưu" | `src/components/ExamRunner.tsx` |

Ba điểm thiết kế đáng biết trước khi sửa:

1. **`content_hash` do client khai lúc xin signed URL, bị trigger đóng băng, rồi route OCR
   băm lại byte tải về và đối chiếu.** Chính vì nó được khai TRƯỚC và không sửa được, phép
   so sau đó mới có nghĩa. Đây cũng là thứ trả lời "ảnh đang xem có phải ảnh đã chấm" khi
   có tranh chấp điểm.
2. **`question_id` của snapshot lấy từ dòng `essay_answer_uploads`, không nhận từ client.**
   Bản trước client gửi `questionId` và server tin — nghĩa là sửa một dòng JSON là gắn được
   snapshot chất lượng của câu 5 sang câu 3.
3. **`fetchOcrProvenance` giờ chỉ có MỘT đường tới `typed`**, và nó đòi bằng chứng dương:
   bài chưa từng có dòng upload nào. Có ảnh nhưng không có snapshot của ảnh còn sống →
   `scanned_snapshot_missing`. Thứ tự truy vấn (ảnh trước, snapshot sau) là cố ý: kết quả
   truy vấn ảnh quyết định nghĩa của "không có snapshot nào".

Kiểm tra đã chạy: `tsc --noEmit` 0 lỗi, `eslint` trên mọi file mới/đã sửa 0 lỗi,
`npm test` 205/205, `npm run build` compiled successfully (hai route mới đăng ký:
`/api/essay-ai/upload`, `/api/essay-ai/upload-url`).

**CHƯA CHẠY — phép thử runtime.** Script đã có, cần bạn cấp hai tài khoản học sinh thật:

```bash
node --env-file=.env scripts/essay-uploads-permission-check.mjs --email-a hs1@example.com --password-a <mk1> --email-b hs2@example.com --password-b <mk2>
```

Tám test, chi tiết ở `docs/RUNBOOK.md` mục 8bis bước 5. Hai tài khoản là bắt buộc: một tài
khoản chỉ kiểm được "tôi đọc được ảnh của tôi", điều đó đúng kể cả khi policy cho phép đọc
ảnh của tất cả mọi người. Mỗi tài khoản cần một attempt đang `in_progress`; thiếu thì script
dừng và nói rõ chứ không báo đạt.

Test E là test duy nhất có thể để lại dòng rác, và chỉ khi nó KHÔNG ĐẠT — nó dựng mọi thứ
hợp lệ với trigger để lớp duy nhất còn lại là RLS. Script in ngay câu `DELETE` để dọn.

**Đừng dùng Supabase SQL Editor cho việc này** — Editor chạy bằng vai trò chủ sở hữu nên
`auth.uid()` là NULL và `FORCE ROW LEVEL SECURITY` không áp, mọi policy sẽ trông như bị bỏ
qua.

Script KHÔNG phủ hai thứ, phải thử bằng tay (mục 8bis bước 6): policy trên `storage.objects`
(quyền đọc **tệp** qua signed URL — dán URL ảnh của A vào tab đăng nhập bằng B), và luồng
đầu-cuối chụp/xoá/nộp/xem lại.

### Chấm tự động đã chạy thật đầu-cuối (2026-08-07)

Học sinh nộp bài → `POST /api/essay-ai/grade-mine` → DeepSeek chấm → điểm hiện ngay, không
chờ giáo viên. Đã xác nhận chạy trên bài thật.

Bốn thứ phải cùng đúng, và trong buổi làm việc từng cái một chặn đường:

| Điều kiện | Sai như thế nào lúc đầu |
|---|---|
| `ESSAY_AI_AUTO_FINALIZE=true` | Chưa bật |
| `ESSAY_AI_OVERRIDE_MIN_COMPARED=0` | Mặc định 20, chặn mọi bài vì chưa có bài đối chiếu |
| `ESSAY_AI_CONFIDENCE_MIN=0.8` | **Để trống → mặc định 1.0**, nên `confidence 0.95` vẫn bị `low_grading_confidence` |
| Route `grade-mine` gọi được | Chưa tồn tại; sau khi thêm thì trả 404 vì `gateAttempt` (xem dưới) |

**Cái bẫy đáng nhớ nhất là `ESSAY_AI_CONFIDENCE_MIN` để trống.** Nhìn từ ngoài nó giống hệt
"DeepSeek không chấm được", trong khi thật ra provider chạy hoàn hảo (`providerErrors: 0`,
`ai_confidence: 0.95`, có tính tiền). Chẩn đoán đúng chỉ đến từ cột `triggers` trong
`essay_ai_usage` — không có bảng đó thì còn mò lâu.

**`gateAttempt` mắc ĐÚNG lỗi mà `20260811` sửa ở tầng policy.** Nó tra `exam_attempts` bằng
session học sinh, mà `students_read_own_exam_attempts` ẩn attempt đã nộp (chưa
`grading_status='completed'`) khỏi chính chủ bài. `grade-mine` chỉ chạy SAU khi nộp nên nó
luôn rơi vào đúng khoảng RLS đó → 404 `ATTEMPT_NOT_FOUND`. Đã sửa: danh tính vẫn lấy từ
session (`auth.getUser()`), nhưng quyền sở hữu tra bằng service_role rồi so
`student_id !== user.id` tường minh.

Đây là lần thứ HAI cùng một nguyên nhân gây lỗi ở hai chỗ khác nhau trong một ngày. Ghi lại
thành quy tắc: **đừng dựa vào RLS của bảng khác cho một quyết định phân quyền mà mình kiểm
tường minh được.**

### OCR chạy ngầm — học sinh không thấy text (2026-08-07)

Quyết định của chủ dự án: hai cách trả lời là gõ text HOẶC chụp ảnh; ảnh được OCR ngầm và
ghép vào bài làm lúc nộp, học sinh không đọc/sửa bản máy đọc.

Text OCR giờ gắn theo từng ảnh (`UploadedImage.ocrText`), chỉ ghép lúc nộp
(`buildEssayAnswerText`). Hệ quả kèm theo đã xử lý: xoá ảnh xoá luôn text của nó; câu chỉ
nộp ảnh không gõ chữ vẫn tính là "đã làm"; cảnh báo OCR không hiện cho học sinh nữa (vẫn lưu
trong `essay_ocr_snapshots` và vẫn chặn auto-chốt).

**Rủi ro đã chấp nhận:** không còn ai kiểm OCR trước khi chấm. Với môn Toán, đọc nhầm một
dấu âm là đảo ngược kết luận, và AI sẽ chấm bài sai đó một cách tự tin. Cổng
`low_ocr_confidence` / `math_region_uncertain` là lớp bảo vệ duy nhất còn lại.

**LỖI ĐÃ BIẾT, CHƯA SỬA — tải lại trang giữa giờ thi làm mất text OCR.** `ocrText` chỉ nằm
trong React state. Học sinh F5 thì ảnh vẫn còn trên Storage nhưng text mất, và vì họ không
thấy text nên KHÔNG BIẾT là đã mất. Nộp xong câu đó `text_answer` rỗng → `fetchQueue` loại ra
→ không được chấm. Trước khi OCR chạy ngầm thì lỗi này vô hại (text nằm trong ô nhập, mất là
thấy ngay). Cách sửa đúng: lúc nộp, quét các dòng `essay_answer_uploads` còn sống mà state
không có text, gọi OCR cho chúng rồi mới nộp.

### Lỗi đã gặp thật và đã sửa: học sinh không xem lại được ảnh sau khi nộp (2026-08-07)

**Đây là mục đáng đọc nhất của cả file này**, vì nó là một lỗ hổng loại "vỡ im lặng" mà
toàn bộ bộ kiểm tra tự động đều báo đạt.

Triệu chứng: `/result` hiện ô "Không mở được"; `createSignedUrl` trả
`{"statusCode":"404","message":"Object not found"}` trong khi tệp có thật và service key
sign được bình thường.

Nguyên nhân: 4 policy storage của `20260809` kiểm quyền bằng
`EXISTS (SELECT 1 FROM public.exam_attempts ...)`, và subquery đó chạy **dưới RLS của
`exam_attempts`**. `students_read_own_exam_attempts` (20260722) chỉ cho học sinh đọc attempt
của mình khi `status='in_progress'`, hoặc đề practice, hoặc `simulation AND
grading_status='completed' AND show_results_immediately`. Bài thi thử vừa nộp chưa chốt điểm
nên không thoả điều nào → `EXISTS` false → Storage trả "Object not found" (cố ý không phân
biệt "không có quyền" với "không tồn tại").

Vì sao không lộ ra sớm: trong giờ thi `status='in_progress'` nên upload, OCR, xem ảnh đều
chạy đúng. Lỗi chỉ xuất hiện **sau khi bấm nộp** — đúng lúc ảnh bắt đầu có giá trị bằng
chứng. Và `20260809` có postflight đạt **toàn bộ** trong khi policy vẫn hỏng.

**Hai bài học, ghi lại vì chúng sẽ lặp:**

1. **Policy không được phụ thuộc RLS của bảng khác.** Một policy đúng vào ngày viết có thể
   vỡ vì ai đó siết RLS ở bảng khác, và nó vỡ im lặng: không lỗi, không log, chỉ là dữ liệu
   biến mất khỏi UI. Cách đúng là hàm `SECURITY DEFINER` trả `boolean` — nó không rò rỉ gì
   (tham số là tên object người gọi đã biết) và `auth.uid()` vẫn hoạt động bên trong vì nó
   đọc claim JWT, không đọc role đang chạy.
2. **Postflight đọc catalog không thay được phép thử bằng JWT thật.** Đây là bằng chứng cụ
   thể: 14/14 dòng `must_be_zero = 0` mà tính năng vẫn hỏng hoàn toàn.

Bản sửa: `20260811_essay_uploads_storage_policy_fix.sql` + 3 file kèm, **CHƯA NẠP**. Xem
`docs/RUNBOOK.md` mục 8quater. Nó tạo ba hàm `essay_upload_is_owner`,
`essay_upload_viewer_is_admin`, `essay_upload_attempt_active` rồi dựng lại 4 policy dùng hàm.
Giữ nguyên tên và số lượng policy nên postflight `20260809` vẫn đạt sau bản sửa.

Bản sửa **nới** quyền đọc, nên phép thử ngược là bắt buộc: đăng nhập bằng B, dán signed URL
ảnh của A → phải vẫn không xem được.

### UI xem lại ảnh + job TTL — xong trong source (2026-08-07)

`src/components/EssayAnswerImages.tsx` dùng chung cho hai chỗ: trang kết quả của học sinh
(`/result/[attemptId]`) và màn chấm của giáo viên (`/admin/attempts/[attemptId]`). Component
**không có đường nào để ghi** — sửa/xoá ảnh chỉ xảy ra trong `ExamRunner`, và cách giữ ranh
giới đó rẻ nhất là component xem lại không có nút xoá. Bucket private nên nó xin signed URL
10 phút cho từng ảnh; người không có quyền thấy danh sách rỗng, không thấy lỗi.

`20260810_essay_uploads_purge.sql` + `POST /api/essay-ai/uploads-ttl` (bearer `CRON_SECRET`,
có `dryRun`) — **migration CHƯA NẠP**, xem `docs/RUNBOOK.md` mục 8ter. Biến mới
`ESSAY_UPLOAD_TTL_DAYS` (mặc định 365).

Điều đáng cảnh giác nhất ở `20260810`: nó `CREATE OR REPLACE` hàm trigger của `20260809`,
tức là chép lại cả thân hàm để thêm hai khối. Đó là cách dễ nhất để đánh rơi một bất biến
cũ mà không có lỗi nào báo. Postflight có dòng `mat_bat_bien_trong_ham` đếm sáu mã lỗi cũ
phải còn nguyên — đọc dòng đó trước mọi dòng khác.

Kiểm tra đã chạy sau cả hai đợt: `tsc --noEmit` 0 lỗi, `eslint` trên mọi file mới/đã sửa 0
lỗi, `npm test` 205/205, `npm run build` compiled successfully (ba route mới:
`/api/essay-ai/upload`, `/api/essay-ai/upload-url`, `/api/essay-ai/uploads-ttl`). Warning
duy nhất còn lại là cái cũ ở `result/[attemptId]/page.tsx:111` (`useCallback` có dependency
`supabase` không cần) — nằm trên code không sửa lần này, dòng dịch từ 110 vì thêm một import.

## Rủi ro đã chấp nhận có ý thức

Chủ dự án quyết định ngày 2026-08-03 rằng AI được tự chốt điểm và công bố cho học
sinh, giáo viên xem lại sau. Điều này thay thế bất biến cũ trong `AGENTS.md`.

Hệ quả: với môn Toán, OCR đọc nhầm một dấu âm hoặc số mũ đủ đảo ngược kết luận, và
khi auto-chốt thì không có ai phát hiện giúp. `auto-finalize.ts` đã fail-closed ở
mọi nhánh không chắc chắn, nhưng nó không bắt được lỗi mà OCR tự tin đọc sai. Đó
là lý do cần benchmark trước khi bật, và cần nhãn "điểm AI" trên UI.

Về test: `src/lib/essay-ai/worker-logic.test.ts` có 26 test cho phần quyết định đã
tách khỏi I/O (clamp limit, ngưỡng confidence chỉ-siết-không-nới, khớp rubric
version, parse gói chấm). `auto-finalize.test.ts` (2026-08-06+, 30 test) kiểm
`decideFinalization` theo bảng đầu vào riêng cho từng trigger — thay cho con số
"14/14" ghi ở bản trước, con số đó không có thật.

**Auto kill-switch theo override rate: đã làm (2026-08-06+).**
`src/lib/essay-ai/override-guard.ts` (22 test) + `override-stats.ts` (26 test):
worker tính lại mỗi lượt trên cửa sổ 90 ngày, chặn `auto_finalize` thành
`pending_review` khi chưa đủ bài đối chiếu hoặc override rate vượt ngưỡng mặc định
(`MIN_COMPARED=20`, `MAX_CHANGED_RATE=0.3`, `MAX_SERIOUS_RATE=0.05` — ba biến env
mới, chưa có bằng chứng thật đứng sau, xem `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 7
và mục 10.1). Là veto runtime tính lại mỗi lượt, không chốt cứng vào database —
tự mở lại khi tỷ lệ tụt xuống dưới ngưỡng, và không cần migration mới (không đụng
hai file `20260803`/`20260806` đang chờ nạp). Dashboard `/admin/essay-ai` đọc cùng
phép tính (`GET /api/admin/essay-ai/stats`), nên không lệch với worker.

Từ 2026-08-06 vai trò của cổng này đổi: `ESSAY_AI_AUTO_FINALIZE` đã bật, nên
`override-guard` không còn là lớp phòng thủ thứ hai mà là **cổng chặn duy nhất còn
đóng**. Ngưỡng `MIN_COMPARED=20` là thứ quyết định khi nào bài đầu tiên được tự chốt.

`redaction.ts` cố ý ưu tiên không phá nội dung toán hơn là phủ hết PII — nó chỉ ẩn
số định danh khi có nhãn đi kèm ("SĐT:", "CCCD:"). Bản heuristic số thuần trước đó
đã ẩn nhầm "Diện tích là 123456789 mét vuông". Đừng đổi lại.
