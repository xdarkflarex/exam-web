# Rà soát ngân hàng câu hỏi bằng AI — kế hoạch

Tài liệu này để **mở một phiên làm việc riêng**. Phiên viết ra nó đang làm việc
khác (bài kiểm tra dịp lễ) và không đụng vào phần này.

Trạng thái (2026-08-30): **bước 1–5 của mục 9 đã xong trong source, chạy được
trên web.** Đường đi đầu-cuối đã có: lớp luật → contracts/validator → prompt →
adapter DeepSeek → worker chia lô → bốn route → trang `/admin/questions/audit`.

`20260830_question_audit.sql` **đã nạp** trên Primary ngày 2026-08-30 và lượt
quét đầu tiên đã chạy thật. **`20260831_question_audit_full_check.sql` chưa nạp**
— nó vá ba lỗi lộ ra ở lượt đó (xem mục 5, phần hợp đồng v2). Quy trình nạp ở
`docs/RUNBOOK.md` mục 8septies và 8octies.

Còn thiếu: tầng 2 (`deepseek-reasoner`, bước 6), phần gợi ý phân loại (bước 7),
và **con số ở mục 10** — chưa đối chiếu tay câu nào nên chưa biết nên tin công
cụ tới đâu.

---

## 1. Vì sao

Đợt nhập câu phần **Thống kê** bằng OCR sai nhiều. Chủ dự án phát hiện lúc đang
đọc đáp án cho học sinh — tức là lỗi đã tới tận lớp học rồi mới lộ ra. Cần một
công cụ quét cả chương và chỉ ra chỗ sai **trước** khi câu được đưa vào đề.

Loại lỗi cần bắt, xếp theo mức khó phát hiện:

| Loại | Bắt bằng gì |
|---|---|
| Không có đáp án nào được đánh dấu đúng | Luật, tất định |
| `multiple_choice` có nhiều hơn một đáp án đúng | Luật |
| Đúng/Sai không đủ 4 ý | Luật |
| Hai phương án trùng nội dung | Luật |
| LaTeX vỡ: `$` lẻ, `\begin`/`\end` lệch, ngoặc không cân | Luật |
| Nội dung cụt giữa chừng, còn rác OCR | Luật (heuristic) + người đọc |
| **Đáp án đánh dấu sai so với đề** | **Chỉ AI giải lại mới bắt được** |
| **Hướng dẫn giải sai dù đáp án đúng** | **Chỉ AI đọc mới bắt được** |

Hai dòng cuối là lý do tồn tại của tài liệu này. Sáu dòng trên nên chạy trước vì
rẻ, tất định và không cần chờ.

---

## 2. Phạm vi một lượt quét

Một lượt = **một chương hoặc một bài**, chọn theo `question_taxonomy`
(`topic → category → section → subsection`). ~~Không có nút "quét cả ngân hàng":
vài nghìn câu một lượt vừa tốn tiền vừa cho ra một danh sách không ai đọc hết.~~

Cỡ thực tế: 50–300 câu mỗi lượt.

**Sửa 2026-08-31 — thêm hai chế độ phạm vi.** Chủ dự án bỏ lệnh cấm "quét cả
ngân hàng". Lý do lệnh cấm không còn đứng vững: kiến trúc đã chia lô, con trỏ
nằm ở database, dừng/chạy tiếp được, và trạng thái duyệt lưu theo TỪNG DÒNG nên
một danh sách dài không buộc phải đọc hết trong một buổi. Cái còn lại chỉ là
tiền — và tiền thì hiện được thành con số trước khi bấm.

Ba chế độ:

- `taxonomy` — theo chương/bài, như cũ. Vẫn bắt chọn ít nhất một tầng.
- `chua_phan_loai` — **vá một điểm mù nghiêm trọng.** Truy vấn cũ nối trong với
  `question_taxonomy`, nên câu chưa có dòng phân loại thì không lượt quét nào
  chạm tới được, chọn phạm vi kiểu gì cũng vậy. Đúng nhóm nguy hiểm nhất: một
  đợt nhập OCR mới thường chưa kịp phân loại tay, tức là nhóm dễ sai nhất lại là
  nhóm không ai nhìn thấy.
- `tat_ca` — toàn bộ ngân hàng.

Hai chế độ sau bắt **bấm hai lần**, sau khi trang đã hiện số câu và ước tính chi
phí. Ước tính đo từ chi phí THẬT của các lượt đã chạy chứ không từ bảng giá gõ
tay: giá provider đổi, còn độ dài câu hỏi của ngân hàng này thì không.

Trần mỗi lượt vẫn còn (`QUESTION_AUDIT_MAX_QUESTIONS`, mặc định 300; hàm database
chặn cứng ở 5000). Phạm vi lớn hơn trần thì quét nhiều lượt, và trang nói rõ
"phạm vi có N câu, lượt này chạy M câu" thay vì im lặng cắt cụt.

---

## 3. Ràng buộc không được thương lượng

Đọc `AGENTS.md` mục 4 và 5 trước khi viết code. Bốn điều dưới đây là hệ quả
trực tiếp của chúng, cộng với đặc thù của việc sửa **đáp án**:

1. **Không ghi thẳng vào ngân hàng.** AI sinh ra **đề xuất**; người duyệt rồi
   mới ghi. Khác hẳn pilot chấm tự luận: ở đó AI chốt điểm một bài của một học
   sinh và sửa lại được; ở đây một lần ghi sai `answers.is_correct` làm sai đáp
   án cho **mọi** học sinh làm câu đó về sau.

2. **Câu đã có người làm là trường hợp riêng.** Nếu câu đang được dùng trong
   `exam_questions`/`homework_questions` và đã có attempt đã nộp, đổi đáp án
   khiến bài đã chấm và bài chấm sau này không còn cùng một chuẩn. Công cụ phải
   **đếm và hiện số attempt bị ảnh hưởng** ngay cạnh nút áp dụng, và bắt xác
   nhận lần hai. Không tự động chấm lại bài cũ — đó là quyết định của giáo viên,
   không phải của công cụ.

3. **Output AI là dữ liệu không đáng tin.** Bắt buộc parse theo schema có
   version, từ chối JSON thiếu trường, sai kiểu, hoặc trỏ tới `question_id`
   khác cái đã gửi. Khuôn có sẵn: `src/lib/essay-ai/contracts.ts` và
   `normalize.ts`.

4. **Key và model.** `DEEPSEEK_API_KEY` là secret server-only, không bao giờ
   `NEXT_PUBLIC_*`. Tên model phải đi qua allowlist hard-code
   (`src/lib/essay-ai/model-allowlist.ts`, nhánh `deepseek`). Cần một kill-switch
   riêng cho công cụ này — **đừng** dùng chung `ESSAY_AI_ENABLED`, vì tắt pipeline
   chấm bài và tắt công cụ rà soát là hai quyết định khác nhau.

Không có dữ liệu học sinh trong payload: gửi đi chỉ có nội dung câu hỏi, hình,
lời giải và đáp án. Đây là lý do công cụ này **không** cần lớp redaction như
`src/lib/essay-ai/redaction.ts`.

---

## 4. Chọn model

Allowlist hiện có đúng hai model DeepSeek: **`deepseek-chat`** và
**`deepseek-reasoner`**. (Ghi chú: "flash" và "pro" là tên họ Gemini, DeepSeek
không có; Gemini chỉ cần đến khi phải *nhìn ảnh* — xem mục 5.)

Đề nghị **định tuyến hai tầng**, không chạy một model cho tất cả:

- **Tầng 1 — `deepseek-chat` cho toàn bộ câu trong phạm vi.** Rẻ, nhanh. Phần
  lớn câu trong ngân hàng là đúng, và với câu đúng thì việc duy nhất cần làm là
  xác nhận "khớp" — không đáng tiền suy luận dài.
- **Tầng 2 — `deepseek-reasoner`, chỉ chạy lại những câu tầng 1 báo lệch, báo
  không chắc, hoặc câu có `difficulty` cao.** Reasoner sinh chuỗi suy luận nên
  đắt hơn nhiều lần trên mỗi câu; đổi lại nó là thứ đáng tin khi kết luận là
  "đáp án đang lưu sai".

Chỉ khi **hai tầng đồng ý** rằng đáp án lưu sai thì đề xuất mới được xếp mức
"gần chắc". Một tầng nói lệch, tầng kia nói khớp → vẫn hiện cho người đọc, nhưng
gắn nhãn "hai model không đồng ý" và **không** cho áp dụng hàng loạt.

Ước lượng chi phí phải đo thật rồi ghi lại vào đây, đừng đoán: chạy thử 20 câu,
lấy token thực tế nhân lên. Trần chi phí dùng lại cơ chế của
`ESSAY_AI_MONTHLY_COST_CAP` — **lưu ý** `20260805_essay_ai_usage.sql` (bảng nhật
ký chi phí) **chưa được áp**, nên hoặc áp nó trước, hoặc tự ghi nhật ký riêng.

---

## 5. Gửi cái gì cho model

Mỗi câu một lượt gọi, payload gồm:

- `questions.content`
- `questions.tikz_code` (mã TikZ của đề, gửi dạng **văn bản** — DeepSeek đọc
  được LaTeX, không cần model nhìn ảnh)
- `questions.explanation` và `questions.solution` (hướng dẫn giải hiện có)
- danh sách `answers`: nội dung từng phương án **và** phương án nào đang được
  đánh dấu `is_correct`

**Câu chỉ có ảnh, không có `tikz_code`** (`tikz_image_url` trỏ tới file, nội dung
hình không nằm trong văn bản) thì DeepSeek không thấy hình. Ba lựa chọn, phải
chọn có chủ đích chứ không để lặng lẽ chấm bừa: bỏ qua và gắn nhãn "không kiểm
được", hoặc đẩy qua Gemini vision (đã có `src/lib/essay-ai/ocr-provider.ts`),
hoặc để người đọc tự xử. **Không được** để model kết luận về một câu mà nó không
nhìn thấy đủ dữ kiện — đó đúng là cách sinh ra lỗi mới.

### Chống mồi đáp án

Nếu gửi đáp án kèm ngay từ đầu, model có xu hướng đồng ý với cái nó đã thấy. Bắt
buộc hoặc:

- **hai lượt**: lượt 1 chỉ gửi đề + hình, bắt model tự giải; lượt 2 mới so với
  đáp án đang lưu (chính xác hơn, tốn gấp đôi); hoặc
- **một lượt có ràng buộc thứ tự**: prompt bắt model điền `loi_giai_tu_lam` và
  `dap_an_tu_lam` **trước** khi được phép nhắc tới đáp án đang lưu, và schema
  đặt hai trường đó lên đầu.

Chọn cách nào cũng được, nhưng phải ghi lại lý do — và đo thử: nếu tỉ lệ "đồng ý
với đáp án lưu" của một lượt cao bất thường so với hai lượt thì mồi đang xảy ra.

### Hình dạng JSON trả về

Giữ tinh thần `essay-grade-result.v1`: có `schema`, có `question_id` để đối
chiếu, và mọi kết luận đều kèm lý do đọc được.

```jsonc
{
  "schema": "question-audit-result.v1",
  "question_id": "...",
  "loi_giai_tu_lam": "...",        // model tự giải, điền TRƯỚC
  "dap_an_tu_lam": "...",
  "khop_dap_an_dang_luu": true,
  "ket_luan": "dung" | "dap_an_sai" | "loi_giai_sai" | "ca_hai_sai" | "khong_kiem_duoc",
  "de_xuat": {
    "dap_an_dung_moi": "id phương án | id1,id2 cho Đúng/Sai | giá trị short_answer | null",
    "loi_giai_moi": "... | null"
  },
  "loi_latex": ["..."],
  "do_tin_cay": 0.0
}
```

Quy tắc nghiệp vụ bản đầu (**ĐÃ THAY THẾ ngày 2026-08-30**, giữ lại để hiểu vì
sao đổi):

- ~~hướng dẫn giải **đúng** mà đáp án **sai** → đề xuất sửa **đáp án**;~~
- ~~đáp án **đúng** mà hướng dẫn giải **sai** → đề xuất sửa **hướng dẫn giải**;~~
- ~~cả hai sai → không tự sửa gì, đánh dấu để người soạn viết lại.~~

**Vì sao bỏ:** ba nhánh này loại trừ nhau, nên model buộc phải chọn một. Chạy
thật cho thấy nhánh thứ ba nuốt mất đúng loại câu cần sửa nhất — một đợt nhập
OCR hỏng thường hỏng **cả đáp án lẫn lời giải cùng lúc**, nên công cụ im lặng ở
chỗ nó đáng nói nhất. Chủ dự án phát hiện khi thấy trang chỉ toàn đề xuất sửa
đáp án.

Cùng lúc lộ ra hai lỗi nữa:

- **Bản sửa lời giải rơi nhầm ô.** `questions` có HAI cột lời giải và học sinh
  thấy cả hai với hai nhãn khác nhau: `explanation` ("Giải thích") và `solution`
  ("Lời giải"). Bản v1 chỉ có một trường đề xuất, và RPC luôn ghi vào
  `explanation` — lỗi nằm ở `solution` thì bản sửa ghi sang ô khác, ô sai vẫn
  còn nguyên cho học sinh đọc. Đây là **ghi sai dữ liệu**, không phải thiếu
  tính năng.
- **Không có chỗ nói "đề bài sai".** Đề mâu thuẫn hoặc thiếu dữ kiện chỉ rơi
  được vào `khong_kiem_duoc`, lẫn với "AI không chắc" — hai thứ cần hành động
  khác hẳn nhau.

`khong_kiem_duoc` là một kết luận hợp lệ và phải dùng thật (câu thiếu hình,
thiếu dữ kiện, đề mơ hồ). Ép model luôn phán một câu trả lời là cách nhanh nhất
để có một danh sách đề xuất không ai dám tin.

### Hợp đồng v2 — ba phán quyết độc lập (2026-08-30)

Thay MỘT `ket_luan` bằng **ba phần tự đánh giá**, mỗi phần mang mô tả lỗi và bản
sửa của riêng nó. `ket_luan` không còn do model phát biểu mà được **suy ra** ở
validator — điều này xoá hẳn lớp lỗi "model nói `dung` nhưng lại kèm bản sửa" mà
v1 phải đi kiểm từng nhánh.

```jsonc
{
  "schema": "question-audit-result.v2",
  "question_id": "...",
  "loi_giai_tu_lam": "...",        // model tự giải, điền TRƯỚC
  "dap_an_tu_lam": "...",
  "khong_kiem_duoc": false,
  "ly_do_khong_kiem_duoc": null,
  "danh_gia_de":      { "co_loi": false, "mo_ta": null },
  "danh_gia_dap_an":  { "co_loi": false, "mo_ta": null, "dap_an_dung_moi": null },
  "danh_gia_loi_giai": {
    "co_loi": false, "mo_ta": null,
    "explanation_moi": null,       // ghi vào questions.explanation
    "solution_moi": null           // ghi vào questions.solution
  },
  "loi_latex": [],
  "do_tin_cay": 0.0
}
```

Kết luận suy ra, theo thứ tự ưu tiên: `khong_kiem_duoc` → `de_sai` → `ca_hai_sai`
→ `dap_an_sai` → `loi_giai_sai` → `dung`. Hai nhánh đầu đứng trên vì cả hai đều
có nghĩa "đừng áp dụng gì cả"; xếp `dap_an_sai` lên trước sẽ cho ra một nút Áp
dụng trên câu mà chính model nói là không đọc được.

Ràng buộc mới:

- **`de_sai` không bao giờ có bản sửa.** Sửa đáp án của một đề sai là vô nghĩa,
  và viết lại đề là **đổi thứ đang được đo**, không phải sửa lỗi. Công cụ chỉ
  báo, người soạn tự xử. Prompt cũng nói rõ `danh_gia_de` chỉ dành cho đề *sai
  hoặc không trả lời được*, không dành cho lỗi gõ LaTeX (cái đó vào `loi_latex`).
- **`ca_hai_sai` nay áp được cả hai bản sửa trong MỘT transaction.** Đổi lại,
  nhóm này không bao giờ được áp dụng hàng loạt và vẫn phải xác nhận hai bước.
- **Không được điền vào ô lời giải đang trống.** Validator từ chối
  `explanation_moi` khi `questions.explanation` rỗng, và tương tự cho `solution`.
  Điền ô trống là "viết lời giải mới" — khác về chi phí, khác về mức cần kiểm,
  và không phải thứ người dùng bấm quét để nhận.

**Bổ sung khi hiện thực (2026-08-29): dạng Đúng/Sai.** Bản trên chỉ mô tả
"id phương án | giá trị short_answer", nhưng câu Đúng/Sai không có một đáp án
đúng duy nhất — nó có bốn phán quyết độc lập, nên một id đơn lẻ không diễn đạt
được bản sửa. `dap_an_dung_moi` của dạng này là **danh sách `answers.id` của
những ý phải mang `is_correct = true`, nối bằng dấu phẩy**; chuỗi rỗng nghĩa là
cả bốn ý đều Sai. Dùng id thay vì chuỗi "ĐSĐS" để đề xuất không phụ thuộc thứ tự
hiển thị của phương án. Validator từ chối id lạ và id lặp.

**Chống mồi được kiểm bằng thứ tự khoá.** Kế hoạch chọn phương án "một lượt có
ràng buộc thứ tự" (rẻ hơn hai lượt). `parseQuestionAuditResult` đọc
`Object.keys` của JSON model trả về và **từ chối** kết quả nào đặt
`khop_dap_an_dang_luu` / `ket_luan` / `de_xuat` trước `loi_giai_tu_lam` và
`dap_an_tu_lam`. Đây là bằng chứng gián tiếp, không phải bảo đảm — model vẫn có
thể suy luận ngược rồi in xuôi — nên vẫn phải đo tỉ lệ "đồng ý với đáp án lưu"
như mục này yêu cầu.

---

## 6. Dữ liệu và luồng

Đề nghị hai bảng, cả hai chỉ phục vụ khu quản trị:

- `question_audit_runs` — một lượt quét: phạm vi taxonomy, model đã dùng, thời
  điểm, số câu, trạng thái, chi phí.
- `question_audit_findings` — một dòng mỗi câu: `question_id`, `run_id`, kết
  luận, đề xuất, `do_tin_cay`, và **trạng thái xử lý** (`cho_duyet`, `da_ap_dung`,
  `da_bo_qua`). Trạng thái nằm ở đây chứ không ở chỗ khác, để mở lại lượt quét cũ
  vẫn biết cái gì đã xử.

RLS: chỉ staff đọc/ghi. Nhớ cái bẫy đã ghi trong `AGENTS.md`: viết `TO` tường
minh, và đừng để policy đọc bảng khác — bọc phép kiểm vào hàm `SECURITY DEFINER`.
Nhớ luôn cái bẫy default privileges: bảng mới trong `public` sinh ra đã có `ALL`
cho `anon`/`authenticated`/`service_role`; phải `REVOKE` trước rồi mới `GRANT`
đúng tập cần.

Luồng chạy: theo khuôn worker đã có của `essay-ai` — một route handler nhận lô,
xác thực bằng `CRON_SECRET`, chạy nền, ghi tiến độ vào `question_audit_runs`.
Đừng gọi vài trăm lượt API trong một request HTTP của trình duyệt.

---

## 7. Trang xem kết quả

`/admin/questions/audit` (tên gợi ý). Yêu cầu tối thiểu:

- chọn phạm vi (chương/bài) rồi bấm quét, có thanh tiến độ;
- danh sách finding, lọc theo `ket_luan`, sắp theo mức nghiêm trọng;
- mỗi dòng hiện **song song**: đáp án/lời giải đang lưu ↔ đề xuất của AI, render
  bằng `MathContent` để nhìn ra lỗi LaTeX bằng mắt — đây là yêu cầu chủ dự án
  nêu thẳng;
- nút **Áp dụng** / **Bỏ qua** từng dòng; áp dụng hàng loạt chỉ cho nhóm đã được
  hai tầng model đồng ý;
- cạnh nút áp dụng: số attempt đã nộp sẽ bị ảnh hưởng (mục 3.2).

Ghi sửa đổi đi qua một RPC server-side, không `UPDATE` thẳng từ client — cùng lý
do với mọi đường ghi khác trong repo này.

---

## 8. Phần hai — gợi ý phân loại

Chủ dự án muốn "phân loại AI như question-bank" vì lọc và phân loại tay từng câu
quá cực, dù đã phân loại tay một phần.

**Đọc cái này trước khi viết code:** `src/lib/questions/classify.ts` là bộ phân
loại **bằng luật**, và phần đầu file ghi rõ nó ra đời để **đi sửa những câu mà AI
phân loại sai**. Nó đang được dùng ở `BulkTaxonomyDialog`. Nên đây không phải
chỗ trống để điền AI vào — nó là một quyết định đã có, và lật lại nó cần lý do.

Thiết kế dung hoà, giữ được cả hai:

- AI chỉ **gợi ý**, không ghi. Ghi vẫn qua `BulkTaxonomyDialog` như hiện tại.
- AI chỉ chạy trên câu **chưa có `question_taxonomy`**, hoặc khi người dùng chủ
  động chọn "gợi ý lại" cho một nhóm. Không bao giờ tự đè lên phân loại tay.
- Luật chạy trước; AI chỉ được hỏi khi luật trả `null`. Rẻ hơn, và giữ tính tất
  định ở phần lớn ngân hàng.
- AI **chỉ được chọn trong danh sách taxonomy có thật**, gửi kèm trong prompt —
  đúng bất biến mà `classify.ts` đang giữ: không khớp thì trả `null`, không tự
  nghĩ ra nhánh mới.

Nhớ: `question_taxonomy` có khoá chính là `question_id`, tức **mỗi câu chỉ nằm ở
một đường dẫn**. Gợi ý phân loại là thay thế, không phải thêm.

### Đã hiện thực (2026-08-31)

Đo được trước khi làm: **297/1436 câu chưa phân loại** — hơn 20% ngân hàng, và
cũng chính là nhóm mà công cụ rà soát vừa mới nhìn thấy được (xem mục 2).

Bốn ràng buộc ở trên được giữ nguyên từng cái:

| Ràng buộc | Chỗ ép |
|---|---|
| Luật chạy trước, AI chỉ nhận phần luật trả `null` | `POST /api/admin/questions/classify`, bước 1 |
| AI chỉ gợi ý, ghi vẫn qua `BulkTaxonomyDialog` | Route không có lệnh ghi nào; dialog thêm tab thứ ba |
| Chỉ chọn trong cây có thật | `assertPathInTree` trong `classify-ai.ts` |
| Không tự đè lên phân loại tay | Người dùng tự chọn câu ở `/admin/questions` rồi mới mở dialog |

Thêm một ràng buộc mà bản kế hoạch chưa nêu, và nó là cái quan trọng nhất:
**đường đi phải đúng quan hệ cha–con**. Một `category_id` có thật nhưng thuộc
topic khác sẽ tạo ra dòng tự mâu thuẫn, và **mọi bộ lọc theo cây đọc sai từ đó
trở đi** — đúng cái bẫy mà comment trong `BulkTaxonomyDialog.apply()` cảnh báo.
Validator từ chối cả lô khi gặp một mục như vậy, chứ không nhặt phần "trông có
vẻ ổn" ra dùng: model đang bịa thì những mục còn lại của cùng lượt không đáng
tin hơn.

**Điều AI làm được mà luật không làm được** là lý do tồn tại của phần này, chứ
không phải "AI thông minh hơn": `suggestTopic` chỉ ra tới tầng **Chủ đề**, còn
AI gợi ý được cả đường đi tới **Mục con**. Có một ô tick "Hỏi AI cả những câu
luật đã đoán được" cho tình huống muốn đường đi sâu hơn, **mặc định tắt** để giữ
đúng thứ tự luật-trước.

Gửi theo lô 10 câu: cây taxonomy phải nằm trong mọi lời gọi, và cây dài hơn câu
hỏi nhiều lần — gửi từng câu một là trả tiền cho cả cây 297 lần.

Kill-switch dùng chung `QUESTION_AUDIT_ENABLED` với công cụ rà soát. Hai tính
năng cùng phục vụ ngân hàng câu hỏi, cùng một khoá, cùng một túi tiền; thêm cặp
biến môi trường thứ ba cho một tính năng con chỉ làm bảng cấu hình dài ra mà
không cho ai thêm quyền quyết định gì.

---

## 9. Thứ tự làm

1. ~~**Lớp luật trước** (mục 1, sáu dòng đầu).~~ **Xong 2026-08-29** —
   `src/lib/questions/audit-rules.ts` + `audit-rules.test.ts`. Thêm một mã
   ngoài bảng mục 1: `khong_kiem_duoc_bang_van_ban` cho câu có `tikz_image_url`
   mà không có `tikz_code`, tức đúng trường hợp mục 5 nói model sẽ không thấy
   hình. `shouldSkipAiAudit()` là chỗ quyết định câu nào không đáng gửi đi.
2. ~~Contracts + validator cho `question-audit-result.v1`.~~ **Xong 2026-08-29**
   — `src/lib/questions/audit-contracts.ts` + `audit-contracts.test.ts`, gồm cả
   `combineTiers()` cho quy tắc "hai model đồng ý" của mục 4.
3. ~~Worker một tầng (`deepseek-chat`).~~ **Xong 2026-08-30.** Không làm bản
   script như dự kiến ban đầu — chủ dự án cần nhìn tiến trình trên web, nên
   worker được chia lô và gọi từ trình duyệt (xem ghi chú dưới). Kill-switch là
   `QUESTION_AUDIT_ENABLED`, riêng hẳn với `ESSAY_AI_ENABLED`. Nhật ký chi phí
   **không** dùng `20260805_essay_ai_usage.sql` (vẫn chưa áp) mà nằm ở cột riêng
   của `question_audit_runs` — công cụ này không nên chờ một migration của
   pipeline khác. File: `audit-config.ts`, `audit-prompt.ts`, `audit-provider.ts`,
   `audit-worker.ts`.
4. ~~Hai bảng + RPC ghi sửa đổi.~~ **Xong 2026-08-30** —
   `supabase/migrations/20260830_question_audit.sql`, **chưa nạp**.
5. ~~Trang `/admin/questions/audit`.~~ **Xong 2026-08-30**, có trong sidebar
   dưới "Câu hỏi".
6. Tầng hai (`deepseek-reasoner`) và quy tắc "hai model đồng ý". **Chưa bắt đầu**
   — `combineTiers()` đã có sẵn trong `audit-contracts.ts`, còn thiếu lượt gọi
   thứ hai và cột lưu kết quả tầng 2.
7. ~~Phần gợi ý phân loại (mục 8).~~ **Xong 2026-08-31** —
   `classify-ai.ts` (hợp đồng + kiểm cây), `classify-ai-prompt.ts`,
   `classify-ai-provider.ts`, `POST /api/admin/questions/classify`, và tab thứ
   ba trong `BulkTaxonomyDialog`. Không cần migration: gợi ý không được lưu, ghi
   vẫn qua đường cũ.

### Vì sao chia lô thay vì một job chạy nền

Mục 6 nói "đừng gọi vài trăm lượt API trong một request HTTP của trình duyệt" —
vẫn đúng. Nhưng một job chạy nền trên serverless không có gì bảo đảm sống sót
sau khi response đã trả, và chủ dự án cần NHÌN THẤY tiến trình.

Cách đã chọn: `POST /api/admin/questions/audit/step` xử lý 5 câu rồi ghi con trỏ
`question_audit_runs.next_index` xuống database; trang gọi lại tới khi xong.
Không request nào dài, tiến trình hiện thật, và đóng tab giữa chừng thì mở lại
là chạy tiếp — trạng thái nằm ở database chứ không ở bộ nhớ tiến trình.

## 10. Xong nghĩa là gì

- Chạy trên một chương thật, đối chiếu tay 20 câu để biết công cụ nói đúng bao
  nhiêu phần. **Ghi con số đó vào tài liệu này.** Chưa có con số thì chưa biết
  nên tin nó tới đâu.
- Có ít nhất một câu mà công cụ bắt đúng lỗi đáp án của đợt Thống kê — đó là
  phép thử nghiệm thu thật sự.
- Không có đường nào ghi vào `answers`/`questions` mà không qua người duyệt.
- `npx.cmd tsc --noEmit`, lint file đã sửa, và test đơn vị cho phần logic thuần.

---

## Câu mở phiên

> Đọc `AGENTS.md` rồi `docs/QUESTION_AUDIT_PLAN.md`. Làm công cụ rà soát ngân
> hàng câu hỏi theo tài liệu đó, bắt đầu từ mục 9 bước 1 và 2 (lớp luật tất định
> + contracts/validator), chưa gọi API. Ràng buộc quan trọng nhất ở mục 3: AI chỉ
> đề xuất, người duyệt mới được ghi, và câu đã có attempt đã nộp phải cảnh báo
> riêng. Trước khi viết phần phân loại, đọc mục 8 và phần đầu
> `src/lib/questions/classify.ts` — repo đã cố ý chọn luật thay vì AI ở chỗ đó.
