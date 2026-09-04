# Việc đang mở

Cập nhật 2026-08-13. Mỗi việc kèm sẵn **câu mở phiên** — copy nguyên khối trích
dẫn, dán vào một phiên Claude Code mới là chạy được ngay.

File này chỉ **điều phối**, không chép lại chi tiết kỹ thuật: chi tiết nằm ở tài
liệu được trỏ tới trong từng mục. Làm xong việc nào thì **xoá mục đó** khỏi đây
(quy ước của `docs/README.md`: xoá thông tin lỗi thời thay vì chồng bản cập
nhật).

Mọi phiên mới đều phải đọc `AGENTS.md` trước, và nếu chạm giao diện thì đọc thêm
`DESIGN_TODO.md` mục 0 (bốn bất biến theme không được phá).

---

## Trạng thái kho code, đọc trước khi làm bất cứ việc nào

- Đang ở nhánh `design/visual-overhaul`. **17 commit chưa đẩy lên GitHub**, tức
  web thật chưa hề đổi. Chưa quyết khi nào gộp vào `main`.
- Working tree luôn có sẵn thay đổi chưa commit của phiên khác. **Không reset,
  không checkout đè.** Hiện có: `docs/LATEX_PARSER_DEBUG.md`, `docs/RUNBOOK.md`,
  `scripts/render-tikz-svg.mjs`, và đúng một dòng `tikz:svg` trong
  `package.json`.
- Ba thứ đang nằm ngoài quản lý phiên bản, **chưa được commit và chưa quyết**:
  `testAI_OCR.jpg`, thư mục `.claude/`, thư mục `public/tikz/` (hình SVG dựng
  sẵn). Xem việc 8.

---

## 1. ĐÃ SỬA 2026-09-04 — hình vẽ trong bài lý thuyết không hiện

Triệu chứng cũ: mở `/learn` chọn bài bất kỳ của Chương 1 lớp 12, chỗ nào có hình
cũng dừng ở "Đang tải hình…" và không bao giờ ra hình.

**Nguyên nhân: `loading="lazy"` trên thẻ `<img>` dò ảnh dựng sẵn trong
`TikzRenderer`.** Thẻ đó vừa là ảnh vừa là phép dò "có tệp hay không", mà phép dò
chỉ kết luận được bằng `onLoad`/`onError`. `lazy` cho phép trình duyệt hoãn tải
vô thời hạn; hoãn tải nghĩa là không sự kiện nào bắn, nên `prebuilt` kẹt ở
`'checking'` vĩnh viễn. Ảnh không hiện, mà TikZJax cũng không được gọi vì
`prebuilt` chưa bao giờ thành `'missing'` — hỏng cả hai đường cùng lúc, im lặng.

Đo trong trình duyệt ngày 2026-09-04, đủ ba cấu hình:

| Cấu hình | Kết quả |
|---|---|
| `lazy` + `display:none` (bản cũ) | KHÔNG sự kiện nào |
| `lazy` + đang hiện | KHÔNG sự kiện nào |
| `eager` + `display:none` | `onload`, chạy đúng |

Bản sửa bỏ `lazy` và hoãn tải bằng `IntersectionObserver` sẵn có của component
(`isVisible`, đệm 240px): observer quyết định KHI NÀO gắn thẻ vào cây, gắn rồi
thì tải ngay và trả lời dứt khoát.

Hai mắt xích còn lại đã đo và đều đúng, nên không phải nghi ngờ nữa:

- **Khoá hình khớp tên tệp: 34/34** trên ba bài mẫu (`tikzFigureKey` so với
  `public/tikz/*.svg`, 112 tệp).
- **Dev server phục vụ SVG: HTTP 200.**

**Chưa mở `/learn` xem tận mắt** — trang đó nằm sau đăng nhập học sinh. Ba mắt
xích đã đo rời từng cái; việc còn lại là nhìn một bài thật.

## 2. Còn lại phần cần tài khoản thật — "Mảng cần củng cố" trống

**Lưới hoạt động: đã sửa 2026-08-14.** `TodayHero.tsx` không còn vẽ 28 ô xám khi
không có hoạt động; nó hiện ô "Chưa ghi nhận hoạt động". Không cần làm lại.

**Còn treo:** dải "Mảng cần củng cố" không hiện dù vòng tiến độ có số. Đọc source
ngày 2026-08-14 cho thấy dải trống **có thể là hành vi đúng**: `WeakAreas` loại
mức `collecting`, mà một chuyên đề cần `MIN_EVIDENCE = 4` đơn vị bằng chứng mới
thoát mức đó, trong khi câu không có `question_knowledge_links` thì bị bỏ qua
hoàn toàn. 30 câu rải mỏng trên nhiều chuyên đề rất dễ không chuyên đề nào đủ 4.

Vậy nên **đừng sửa RPC trước**. Việc cần làm là đo phủ sóng link rồi mới kết luận.

> Đọc `docs/DESIGN_OVERHAUL_2026-08-09.md` mục 4 (đã ghi đủ ba nghi can và lý do
> loại trừ). Mở `/student/analytics` bằng tài khoản học sinh thật, và đếm xem
> trong các câu học sinh đã làm có bao nhiêu câu thực sự có
> `question_knowledge_links`. Nếu thưa thì đây là việc nối link dữ liệu, không
> phải lỗi code — kết luận nào cũng ghi ngược lại vào mục 4 của tài liệu trên.

## 3. Giao diện tối ở khu quản trị — còn phần lớn

Đây là khối việc lớn nhất còn lại của đợt làm đẹp, đã có danh sách file và cặp
màu thay thế để giữ nhất quán.

> Đọc `docs/DESIGN_TODO.md` mục 0 (bất biến) rồi mục 2. Làm tiếp dark mode cho
> khu quản trị theo đúng cặp màu thay thế đã chốt ngày 2026-08-07. Sửa xong màn
> nào thì mở màn đó xem tận mắt ở cả hai chế độ sáng/tối.

## 4. Sáu màn đã sửa nhưng chưa ai nhìn bằng mắt

144 biến thể `dark:` thêm ngày 2026-08-07 ở 6 màn (soạn câu hỏi, phát hành đề,
xem bài làm, `QuestionEditor`, `ExamListCard`, `ImageCarousel`) đúng về mặt cơ
học nhưng chưa từng được mở ra xem. Tương phản ở mọi trang cần đăng nhập cũng
chưa đo lần nào — số đo hiện có chỉ lấy từ trang chủ.

> Đọc `docs/DESIGN_TODO.md` mục 3. Mở lần lượt 6 màn quản trị đã liệt kê ở cả
> sáng và tối, chụp lại chỗ sai, sửa, và đo tương phản cho các trang cần đăng
> nhập (trước nay mới đo trang chủ).

## 5. CHỜ QUYẾT — chữ phụ màu xám hơi nhạt

`text-slate-500` đang ở 3.9:1, dưới chuẩn 4.5 cho chữ nhỏ, dùng ở 531 chỗ. Đậm
lên thì đạt chuẩn nhưng chữ chính và chữ phụ gần bằng nhau, mất phân cấp thị
giác. Ba phương án đã ghi sẵn ở `docs/DESIGN_TODO.md` mục 1 — **cần chủ dự án
chọn trước**, không phải việc AI tự quyết.

## 6. CHỜ QUYẾT — hai hình lạc ngoài khối

Hai hình TikZ ở bài 2 lớp 10 nằm ngoài mọi khối tri thức nên sẽ không hiện ở bài
nào. Chọn một trong hai: đưa vào khối gần nhất, hay sửa parser để giữ cả phần
văn bản ngoài khối. Chi tiết ở `docs/LATEX_PARSER_DEBUG.md` mục "Còn treo".

## 7. Khâu học chưa nói được học sinh đã qua khâu nào

Panel bài học đã đọc theo khâu (Khái niệm → Kết quả lý thuyết → Công thức →
Phương pháp → Ví dụ → Bài tập), nhưng dải khâu **cố ý** chỉ nói bài có những khâu
nào, không nói học sinh đã qua khâu nào: năng lực hiện đo theo BÀI, chưa đo theo
KHỐI. Muốn có thật thì phải gộp năng lực theo `knowledge_block_id` qua
`question_knowledge_links`. Đây là việc mở rộng, không phải lỗi.

> Đọc `docs/DESIGN_OVERHAUL_2026-08-09.md` mục 3b và
> `src/lib/theories/learning-stage.ts`. Gộp năng lực học sinh theo từng khối tri
> thức (`question_knowledge_links` → `knowledge_block_id`) để dải khâu trong
> `TheoryStages.tsx` nói được học sinh đã vững tới khâu nào. Ràng buộc: không có
> dữ liệu thì phải im lặng, tuyệt đối không tô "đã xong" bằng suy đoán.

## 8. CHỜ QUYẾT — mấy file đang nằm lẫn trong thư mục dự án

- `testAI_OCR.jpg`: nếu là ảnh bài làm của học sinh thật thì `AGENTS.md` mục 5
  cấm đưa vào kho code. Cần xác nhận rồi thêm vào `.gitignore` hoặc xoá.
- `.claude/`: cấu hình phiên làm việc, nên bỏ qua khỏi git.
- `public/tikz/`: 110 hình SVG dựng sẵn. Cần quyết commit hay dựng lại mỗi lần
  deploy — liên quan trực tiếp tới việc 1.

## 9. Đẩy code lên GitHub

17 commit đang chỉ nằm trên một ổ đĩa. Đẩy nhánh lên **không** đụng tới web
thật: production dựng từ `main`, nhánh này lên chỉ ra bản xem thử.

```bash
git push -u origin design/visual-overhaul
```

## 10. CHƯA BẮT ĐẦU — tool quét câu hỏi trùng

Đã chốt: làm ở **question-bank** (app Tauri), không phải exam-web. Lý do: mọi câu
hỏi đều sinh ra ở đó — exam-web không có một đường ghi nào vào bảng `questions` —
và question-bank giữ sẵn bản sao đầy đủ trong SQLite nên quét toàn ngân hàng là
việc tại chỗ, tức thì.

Hai tầng, tầng đầu quan trọng hơn: chặn ngay lúc lưu bằng dấu vân tay của nội
dung đã chuẩn hoá (bắt gọn ca nhập/OCR trùng một file hai lần), rồi mới tới màn
rà soát "gần giống" chỉ để gợi ý. Hai cái bẫy phải tính từ đầu: câu khác nhau
đúng một con số là câu **khác** (đề Toán đầy biến thể tham số, nên không được
chuẩn hoá số và không bao giờ tự xoá), và phần dẫn hay trùng y hệt nhau nên dấu
vân tay phải gộp cả đáp án chứ không chỉ đề.

> Mở phiên tại `D:\ToanTHPT\Web-nhap-cau-hoi\question-bank`. Viết công cụ phát
> hiện câu hỏi trùng: một module logic thuần tính dấu vân tay từ nội dung + đáp
> án đã chuẩn hoá, chặn ngay lúc lưu câu mới, kèm một màn rà soát toàn ngân hàng
> chỉ gợi ý chứ không tự xoá. Câu khác nhau một con số là câu khác — không chuẩn
> hoá số.

## 10bis. ĐANG LÀM Ở QUESTION-BANK — ghép hình TikZ bộ GK1

Đợt OCR bộ đề GK1 tách nội dung đề và mã TikZ ra hai file riêng; 20 hình / 8 đề
cần ghép lại vào câu hỏi. Việc này **làm ở question-bank**, không phải ở đây:
exam-web không có LaTeX toolchain nên không dựng được SVG, ghép mã ở đây chỉ tạo
ra một loạt câu "có mã, không hình".

Bàn giao đầy đủ (kèm hai lỗi lệch trong đường sync phải sửa trước):
`D:\ToanTHPT\Web-nhap-cau-hoi\question-bank\docs\BAN-GIAO-TIKZ-GK1.md`

**Phần của exam-web trong việc này — đã xong, dùng ngay:**

- `npm run tikz:review -- --ocr "<..>/_OCR/GK1" --pdf "<..>/GK1"` dựng bảng đối
  chiếu TikZ ↔ trang PDF gốc. Hình OCR là model VẼ LẠI từ ảnh trang, sai được mà
  đọc mã không thấy. Lần chạy 2026-09-03: 20 hình, 1 hình dựng lỗi (đề 01 Toán 10).
- Nút **"Rà hình"** ở `/admin/questions/audit` là thước nghiệm thu sau khi bên
  kia đẩy lên: nhóm `co_ma_chua_co_anh` không được tăng.

## 11. ĐANG LÀM — rà soát lời giải/đáp án bằng AI, và gợi ý phân loại

Đợt nhập phần **Thống kê** bằng OCR sai nhiều; lỗi lộ ra lúc chủ dự án đang đọc
đáp án cho học sinh. Cần công cụ quét theo **chương hoặc bài**: DeepSeek tự giải
lại từng câu rồi so với đáp án và lời giải đang lưu — lời giải đúng mà đáp án sai
thì đề xuất sửa đáp án, đáp án đúng mà lời giải sai thì đề xuất sửa lời giải.
Kết quả hiện trên một trang quản trị để soát bằng mắt, gồm cả lỗi LaTeX.

Thiết kế đầy đủ, ràng buộc và thứ tự làm nằm ở
[`QUESTION_AUDIT_PLAN.md`](QUESTION_AUDIT_PLAN.md). Ba điều đừng bỏ qua: AI chỉ
**đề xuất**, người duyệt mới được ghi; câu đã có attempt đã nộp phải cảnh báo
riêng trước khi đổi đáp án; và phần gợi ý phân loại phải đọc mục 8 trước, vì
`src/lib/questions/classify.ts` đã cố ý chọn luật thay vì AI ở đúng chỗ đó.

**Đã có trong source (2026-08-30):** bước 1–5 của mục 9, tức toàn bộ đường đi
đầu-cuối. `src/lib/questions/audit-*.ts` (luật, contracts, prompt, adapter
DeepSeek, worker chia lô), bốn route `/api/admin/questions/audit/*`, trang
`/admin/questions/audit` có thanh tiến trình và duyệt từng đề xuất.

**Đã nạp trên Primary:** `20260830`, `20260831`, `20260901` (xác nhận 2026-09-01
bằng truy vấn `to_regprocedure` + `information_schema.columns`).

**Việc còn phải làm, theo thứ tự:**

1. **Nạp `20260903_question_audit_fix_apply.sql`** — ƯU TIÊN CAO, chưa nạp.
   Không có nó thì nút "Áp dụng" hỏng với MỌI đề xuất (`malformed array literal`).
   Quy trình ở `RUNBOOK.md` mục 8undecies.
2. **Nạp `20260902_question_audit_incremental.sql`** — chưa nạp, quy trình ở
   `RUNBOOK.md` mục 8decies. Cho phép **quét dần dần**. Không có nó thì mọi lượt
   "Toàn bộ ngân hàng" lấy đúng 300 câu đầu và im lặng: 1136/1436 câu không bao
   giờ tới lượt, mà mỗi lượt vẫn trông như "chạy xong 300/300".
3. **Đối chiếu tay 20 câu** rồi ghi con số vào `QUESTION_AUDIT_PLAN.md` mục 10.
   Chưa có con số thì chưa biết nên tin công cụ tới đâu — và đừng áp dụng hàng loạt.
4. **Quét hết ngân hàng.** Bật "Bỏ qua câu đã quét", bấm quét lại tới khi
   `question_audit_select_scope('tat_ca', ..., true)` trả `total = 0`.
5. Tầng 2 `deepseek-reasoner` (bước 6 của mục 9) — chưa bắt đầu.
   `combineTiers()` đã có sẵn, còn thiếu lượt gọi thứ hai và chỗ lưu kết quả.

Phần gợi ý phân loại (bước 7) **đã xong 2026-08-31**: tab "Gợi ý AI" trong
`BulkTaxonomyDialog`, chọn được phạm vi (câu đang chọn / chưa phân loại / toàn
bộ). Đo được lúc làm: **297/1436 câu chưa phân loại**.

> Đọc `AGENTS.md` rồi `docs/QUESTION_AUDIT_PLAN.md`. Bước 1–5 của mục 9 đã xong;
> đọc `src/lib/questions/audit-*.ts` và migration `20260830_question_audit.sql`
> trước khi viết thêm. Làm tiếp bước 6: lượt gọi tầng hai `deepseek-reasoner` cho
> những câu tầng một báo lệch/không chắc, rồi áp quy tắc "hai model đồng ý" —
> `combineTiers()` đã có sẵn, còn thiếu chỗ lưu kết quả tầng 2. Ràng buộc quan
> trọng nhất ở mục 3: AI chỉ đề xuất, người duyệt mới được ghi, và câu đã có
> attempt đã nộp phải cảnh báo riêng. Trước khi viết phần phân loại, đọc mục 8 và
> phần đầu `src/lib/questions/classify.ts` — repo đã cố ý chọn luật thay vì AI ở
> chỗ đó.

## 12. XONG CODE, CHỜ NẠP MIGRATION — bài tập về nhà đi từ dễ tới khó

Yêu cầu chủ dự án 2026-09-03: "1 session 10 câu hỏi thì làm 10 câu độ khó tăng
dần theo level NB, TH, VD, VDC".

Đã làm:

- [`src/lib/homework/session-order.ts`](../src/lib/homework/session-order.ts) —
  hàm thuần `arrangeHomeworkSessions`, 10 test ở file `.test.ts` cạnh nó.
- [`src/app/homework/[attemptId]/page.tsx`](../src/app/homework/[attemptId]/page.tsx)
  gọi hàm đó thay cho phép `sort` theo `order_index` trước đây.
- `supabase/migrations/20260904_homework_session_difficulty.sql` — **chưa nạp**,
  quy trình ở `RUNBOOK.md` mục 8duodecies.

Chưa nạp migration thì trang vẫn chạy: `cognitive_level` và `difficulty` về
`undefined`, `resolveCognitiveLevel` trả `NB` cho mọi câu, và thứ tự rơi về đúng
`order_index` giáo viên đặt — tức là y như trước khi có thay đổi này.

**Chưa nhìn bằng mắt trên bài thật.** Kiểm bằng dev server cần tài khoản học
sinh có bài tập đang giao; phần đã kiểm là logic thuần (10 test) và typecheck.

### Việc tiếp theo — hiệu chỉnh theo năng lực học sinh

Chủ dự án muốn "sau này có data học sinh thì hiệu chỉnh độ khó của session theo
level học sinh". Chỗ làm việc đó **không phải** `session-order.ts`: làm bài dễ
hơn cho học sinh yếu là THÊM/BỎ câu chứ không phải đổi thứ tự, nên nó thuộc bước
chọn câu lúc giao bài (`homework_questions`), ở
[`src/app/admin/homework/create/page.tsx`](../src/app/admin/homework/create/page.tsx).
Nguồn dữ liệu năng lực: `src/lib/analytics/student-capability.ts`.

Ràng buộc phải giữ khi làm: bài đã giao rồi thì tập câu **không được đổi**.
Hiệu chỉnh chỉ áp cho lần giao mới, nếu không thì hai học sinh cùng lớp làm hai
đề khác nhau mà điểm vẫn nằm chung một bảng.

## 13. XONG CODE, CHỜ NẠP MIGRATION — đề ôn tập không còn đếm ngược

Chủ dự án 2026-09-03: "bài tập ôn tập theo chương thì cấu hình bài lại có thời
gian là như thế nào. Chỉ cần chọn ngày bắt đầu và ngày kết thúc để thúc học sinh
làm chứ ra giờ như đề thi thì sao được."

Đúng, và cả hệ thống vốn đã đồng ý — chỉ một màn hình phá: trang xuất bản đề ghi
đè `duration = 0` thành 90 mỗi lần lưu. Chi tiết ở `RUNBOOK.md` mục 8tredecies.

Đã làm:

- `/admin/exams/[examId]/publish` — đề ôn tập không còn ô "Thời gian làm bài";
  thay bằng "Mở từ ngày" / "Hạn cuối" dùng `type="date"`, và **không bao giờ**
  ghi `duration` khác 0 cho `practice`.
- [`src/lib/exam/exam-schedule.ts`](../src/lib/exam/exam-schedule.ts) — quy đổi
  ngày/giờ tách thành hàm thuần, 8 test. Sửa luôn lỗi cũ
  `toISOString().slice(0,16)` làm mốc giờ **lùi 7 tiếng mỗi lượt mở-rồi-lưu**.
- Trang chi tiết đề hiện "Không giới hạn giờ" thay vì "0 phút" cho đề ôn tập.
- `supabase/migrations/20260905_practice_exams_no_timer.sql` — **chưa nạp**.

**Chưa nhìn bằng mắt.** Trang xuất bản cần tài khoản admin; phần đã kiểm là logic
ngày/giờ (8 test), typecheck, và lint không thêm lỗi mới (22 vấn đề trước và sau).

### Số lượt làm — đã xong cùng đợt

Chủ dự án chốt 2026-09-03: đề ôn tập không giới hạn số lần làm.

- Trang xuất bản: đề ôn tập hiện chữ "Không giới hạn" thay cho ô nhập số, và
  luôn ghi `max_attempts = 0`.
- Trang tạo đề: ghi tường minh `max_attempts: mode === 'practice' ? 0 : 1` thay
  vì dựa vào `DEFAULT 1` của cột.
- `supabase/migrations/20260906_practice_exams_unlimited_attempts.sql` —
  **chưa nạp**, quy trình ở `RUNBOOK.md` mục 8quaterdecies.

Không phải sửa SQL runtime: quy ước `0 = không giới hạn` đã có từ `20260722` và
`20260803`, giao diện học sinh cũng đã đúng. Chỉ dữ liệu mang sai giá trị.

## 14. ĐANG TREO — một hồ sơ lớp 9 giữ chỗ `class_id` rác

`20260907` đã nạp ngày 2026-09-04. Hậu kiểm: sửa 4 hồ sơ, **còn 1**.

| | |
|---|---|
| Hồ sơ | `Khanh Huong Nguyen` |
| `class_id` | `"9/1"` — không trỏ tới lớp nào |
| Vì sao migration không đụng | khối 9 không có lớp; `classes.grade` và `profiles.grade` đều `CHECK IN (10, 11, 12)` |

**Chủ dự án quyết ngày 2026-09-04: để nguyên, tính sau.** Đây là lựa chọn có ý
thức, không phải việc bị bỏ quên — đừng "dọn" nó trong một lượt refactor.

Cái đang mất, để khi nào cần thì biết mà cân:

- Em này **không nhận được bài tập giao theo lớp** (`homework_assignment_recipients`
  khớp bằng `class_id`).
- Không hiện trong bộ lọc lớp ở `/admin/students` và `/admin/analytics`.
- **Chặn việc thêm FOREIGN KEY** `profiles.class_id → classes.id`. FK là thứ đóng
  vĩnh viễn cả lớp lỗi này, và nó không tạo được khi còn một dòng không khớp.
  Nên hàng rào cuối cùng vẫn để ngỏ vì đúng một dòng dữ liệu.

Ba đường xử, ghi đầy đủ ở PHẦN 3 của
[`20260907`](../supabase/migrations/20260907_fix_profile_class_ids.sql): hỏi lại
em rồi xếp tay ở `/admin/classes`; đặt `class_id = NULL` để hồ sơ nói thật là
chưa có lớp; hoặc mở hẳn khối 9 — việc lớn hơn ba dòng SQL, vì còn phải rà mọi
chỗ đang hardcode 10/11/12 (form đăng ký, chọn khối khi tạo đề, lọc đề theo khối).

Hậu kiểm `must_be_zero_class_id_khong_khop` sẽ **giữ nguyên bằng 1** cho tới khi
ca này được xử. Đó là đúng với trạng thái hiện tại, không phải migration lỗi.

### Đường ghi `class_id` đã khoá hết (2026-09-04)

Form đăng ký chọn khối (server tra khoá), `/admin/users` ô chọn lớp thật,
`/admin/classes` vốn đã đúng, `/student/settings` bỏ hẳn ô. Không còn ô chữ tự do
nào ghi vào `class_id` — nên con số 1 ở trên sẽ **không tăng thêm**.
