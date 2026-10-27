# Việc đang mở

Sổ ghi việc của dự án. **Phần A** là việc còn phải làm, **phần B** là việc đang chờ
chủ dự án quyết, **phần C** là hồ sơ việc đã xong — giữ lại vì phần lớn bài học
nằm trong đó.

## Trạng thái kho code — rà 2026-10-27

Đo lại cuối phiên 2026-10-27, sau đợt lưu nháp bài thi (mục C25):

- Typecheck pass · test **555/555** pass · lint **68 error, 124 warning** — đúng
  bằng các lần đo 2026-09-07, 2026-09-18 và 2026-10-22, tức các đợt việc gần đây
  không thêm lỗi nào. `npm run build` xong (vẫn cần biến môi trường giả, xem dưới).
- Vẫn **chưa nối được vào Primary** trong phiên này (không có `.env`), nên mọi
  dòng ở "Số đo hiện tại" vẫn là số của 2026-09-07.

Ảnh chụp đầu phiên 2026-10-22, giữ lại để so:

- `origin/main` đã **nhận ba commit công cụ học tập** (tích phân, Oxyz, registry)
  và **bảy commit của đợt port app điện thoại** (A15–A20). Nhánh làm việc
  `claude/eloquent-ritchie-tmf8zr` được dựng lại từ `origin/main` đầu phiên này
  vì phần cũ của nó đã gộp hết.
- Typecheck pass · test **535/535** pass · lint **68 error, 124 warning** — đúng
  bằng lần đo 2026-09-07 và 2026-09-18, tức ba đợt việc gần đây không thêm lỗi nào.
- `npm run build` xong, 72 trang tĩnh. Nó **cần biến môi trường Supabase**: không
  có `.env` thì bước prerender hỏng ở `/admin/theories` và `/student/analytics`
  với lỗi "Your project's URL and API key are required". Đó là thiếu cấu hình,
  không phải lỗi code — đặt giá trị giả cho `NEXT_PUBLIC_SUPABASE_URL` và
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` là build xong. (Phiên 2026-10-27 dựng lại đúng
  cách này: `.env.local` giả, build xong, xoá ngay sau đó.)

Hai điều đúng ở mọi phiên, không gắn với lần đo nào:

- Không có CI. Mọi con số trong tài liệu là do người đo tay, nên **kiểm lại trước
  khi dựa vào nó** — xem `AGENTS.md` mục 3.
- Working tree thường có sẵn thay đổi chưa commit của chủ dự án; đừng gộp chúng
  vào commit của mình.

## Số đo hiện tại

Bảng dưới đây đo trên **database ngày 2026-09-07** và **chưa được kiểm lại** kể từ
đó — các phiên 2026-09-18, 2026-09-19 và 2026-10-22 đều không có `.env` nên không nối được vào Primary. Trước khi dựa
vào một dòng nào, đếm lại theo `RUNBOOK.md` mục 0.

| Thứ | Số đo 2026-09-07 |
|---|---|
| Câu hỏi trong ngân hàng | 1621 · đã phân loại 1511 · **chưa 110** |
| Câu nhắc tới hình mà chưa có hình | **176** / 312 câu có nhắc hình |
| Bài lý thuyết | 29 · đã xuất bản **29** · nháp 0 |
| Hình TikZ | 111 dựng sẵn · **0 hình trắng** |
| Công thức trong bài lý thuyết | 3927 · **0 lỗi** |
| Hồ sơ học sinh | 30 · khớp lớp 16 · lệch 1 · **chưa xếp lớp 13** |

---

# Phần A — việc đang mở

## A0. Mười một học sinh chưa được xếp lớp

Chặn hai tính năng vừa làm xong, và chặn **im lặng**: `get_my_grade()` trả NULL nên
`/learn` không mở sẵn đúng lớp, và bộ lọc "thi thử chỉ cho lớp 12" không áp được.
Không có lỗi nào hiện ra — chỉ là học sinh thấy cả ba lớp.

13 hồ sơ trống `class_id`, trừ 2 tài khoản admin:

```
Khánh Ngọc · Nguyễn Hoàng Gia An · Hoàng Phương Vy · Phạm Quốc Nam
Lê Việt Thái (2 hồ sơ trùng tên)
Ngọc Diệp Nguyên / Nguyên Ngọc Diệp (nghi trùng)
Trần Văn A · Lê Thị B · Phạm Văn C  (nhiều khả năng là tài khoản thử)
```

Xếp lớp bằng tay: `RUNBOOK.md` mục 8quindecies. Cần chủ dự án nhìn để tách tài
khoản thử khỏi học sinh thật trùng tên.

## A1. Bốn dòng nối màn "Rà hình theo PDF" chưa commit (question-bank)

Màn đã xong và đã đẩy lên GitHub (`figure-review-api.ts`, `FigureReview.tsx`),
nhưng bốn dòng nối nó vào `App.tsx` và `Sidebar.tsx` **vẫn nằm ngoài git** vì hai
file đó đang mang 364 và 25 dòng việc dở của chủ dự án. App chạy được; chỉ là chưa
commit. Khi chủ dự án commit đợt việc của mình thì bốn dòng đi kèm.

## A2. 176 câu thiếu hình

Công cụ đã xong (màn "Rà hình theo PDF" bên question-bank: mở PDF gốc, tìm câu
bằng từ khoá, dán TikZ, dựng thử, lưu và đẩy). Việc rà thì chưa bắt đầu. Cố ý
**không** ghép tự động — ghép sai thì học sinh đọc đề một đằng nhìn hình một nẻo
và không ai phát hiện ra.

## A3. Còn khoảng 73–110 câu chưa phân loại

Còn 110 câu sau lượt luật ngày 2026-09-05 (1324 → 1511). Sau đó lớp luật được cho
đọc thêm **lời giải** (`CLASSIFICATION_RULES.md`, 2026-09-15): chạy thử trên ngân
hàng thì nhóm chưa phân loại xuống **73**. Đó là số của một lần chạy thử, chưa rõ
đã ghi vào database chưa — đếm lại trước khi báo cáo. Phần còn lại dành cho tab
"Gợi ý AI", nay đã có hàng rào `findRuleConflict` chặn sau.

## A4. `20260903_question_audit_fix_apply.sql` — không xác minh được

Ưu tiên cao: không có nó thì nút "Áp dụng" ở `/admin/questions/audit` hỏng với
**mọi** đề xuất. Hàm có tồn tại nhưng chữ ký trùng với bản `20260830` nên PostgREST
không phân biệt được. Phải đọc thân hàm bằng `pg_get_functiondef` — cần kết nối
Postgres trực tiếp, mà host `db.<ref>.supabase.co` mất DNS từ giữa buổi 2026-09-07.

## A5. `hybrid-sync.ts` đếm push hỏng thành thành công (question-bank)

`hybrid-sync.ts:840` tăng `result.pushed` vô điều kiện. `supabase-js` trả
`{ error }` chứ **không ném lỗi**, nên `try/catch` không bắt được gì và một lượt
đồng bộ hỏng vẫn báo thành công. Đã báo, chưa được duyệt sửa.

## A6. Phép kiểm hình trắng chưa thành script

Chặn cuối trong `render-tikz-svg.mjs` chỉ bắt được hình **toàn bộ** trong suốt;
hình mất một nửa nét vẫn lọt. Phép kiểm thật (vẽ lên canvas rồi đếm điểm ảnh) hiện
làm tay trong trình duyệt — công thức ở `RUNBOOK.md` mục 12.

## A7. Còn lại phần cần tài khoản thật — "Mảng cần củng cố" trống

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

## A8. Giao diện tối ở khu quản trị — còn phần lớn

Đây là khối việc lớn nhất còn lại của đợt làm đẹp, đã có danh sách file và cặp
màu thay thế để giữ nhất quán.

> Đọc `docs/DESIGN_TODO.md` mục 0 (bất biến) rồi mục 2. Làm tiếp dark mode cho
> khu quản trị theo đúng cặp màu thay thế đã chốt ngày 2026-08-07. Sửa xong màn
> nào thì mở màn đó xem tận mắt ở cả hai chế độ sáng/tối.

## A9. Sáu màn đã sửa nhưng chưa ai nhìn bằng mắt

144 biến thể `dark:` thêm ngày 2026-08-07 ở 6 màn (soạn câu hỏi, phát hành đề,
xem bài làm, `QuestionEditor`, `ExamListCard`, `ImageCarousel`) đúng về mặt cơ
học nhưng chưa từng được mở ra xem. Tương phản ở mọi trang cần đăng nhập cũng
chưa đo lần nào — số đo hiện có chỉ lấy từ trang chủ.

> Đọc `docs/DESIGN_TODO.md` mục 3. Mở lần lượt 6 màn quản trị đã liệt kê ở cả
> sáng và tối, chụp lại chỗ sai, sửa, và đo tương phản cho các trang cần đăng
> nhập (trước nay mới đo trang chủ).

## A10. Khâu học chưa nói được học sinh đã qua khâu nào

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

## A11. CHƯA BẮT ĐẦU — tool quét câu hỏi trùng

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

## A12. ĐANG LÀM Ở QUESTION-BANK — ghép hình TikZ bộ GK1

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

## A13. ĐANG LÀM — rà soát lời giải/đáp án bằng AI, và gợi ý phân loại

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

## A14. ĐANG TREO — một hồ sơ lớp 9 giữ chỗ `class_id` rác

> Mục này trước đây đánh số **14**; `20260908_get_my_grade.sql` còn trỏ tới số cũ.

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

## A17. Client native không hoàn tất được việc đổi mật khẩu bắt buộc

Phát hiện ngày 2026-09-20 khi dựng cổng đăng nhập cho app điện thoại.

`profiles.must_change_password` là cờ chặn thật: `src/middleware.ts:308` đá mọi
route về `/change-password` khi cờ bật. Nhưng **chỉ có một chỗ xoá được cờ đó**
là `POST /api/auth/change-password`, và route đó:

- xác thực bằng **cookie** (`createServerClient` + `cookies()`), và
- xoá cờ bằng `SUPABASE_SERVICE_KEY`, đúng như nó nên làm — trigger
  `protect_profile_security_fields`
  (`supabase/migrations/20260722_runtime_security_hardening.sql:2398`) raise
  `PROFILE_SECURITY_FIELD_UPDATE_FORBIDDEN` khi chính chủ đụng vào cột này.

React Native không có cookie jar dùng chung với trình duyệt, nên app không gọi
được route này. Hệ quả cụ thể:

- App **đổi được** mật khẩu ở Auth (`supabase.auth.updateUser`) nhưng cờ vẫn
  bật, nên học sinh đổi xong vẫn bị chặn, rồi lên web lại bị bắt đổi lần nữa.
- Vì vậy app cố ý **không** cho đổi mật khẩu trong màn chặn, mà đẩy sang
  `{WEB_URL}/change-password`. Xem `exam-web-app-phone/app/(auth)/change-password.tsx`.

Đây **không phải lỗ hổng của web** — web đang chặn đúng. Nhưng trước bản gần
đây app **không đọc cờ này**, nên một tài khoản phát mật khẩu tạm dùng được app
vô thời hạn: web đóng, app mở. App đã vá phía mình (`src/lib/auth/gate.ts`).

**Hai hướng sửa bên web, chọn một:**

1. Cho `/api/auth/change-password` nhận `Authorization: Bearer <access_token>`
   bên cạnh cookie. Ít việc nhất, nhưng là thay đổi auth — cần test 401/403
   theo `AGENTS.md`, và phải giữ nguyên chặn `sec-fetch-site: cross-site` cho
   đường cookie.
2. Thêm RPC `SECURITY DEFINER` kiểu `complete_forced_password_change()` chỉ xoá
   cờ cho `auth.uid()` của chính người gọi, sau khi Auth đã đổi mật khẩu. Gọn
   hơn cho mọi client, nhưng phải cân nhắc: gọi RPC đó mà chưa thực sự đổi mật
   khẩu thì cờ bị xoá oan, nên cần ràng buộc thêm (ví dụ so
   `auth.users.updated_at` với thời điểm đặt cờ).

**Kèm theo — ba luật mật khẩu khác nhau trong cùng một repo:**

| Chỗ | Luật |
|---|---|
| `src/app/(student)/student/settings/page.tsx:176` | ≥ 6 ký tự, không đòi gì thêm |
| `src/app/api/auth/change-password/route.ts` | ≥ 8 ký tự + hoa + thường + số |
| `src/app/complete-profile/page.tsx` | ≥ 8 ký tự + hoa + thường + số |

Người dùng chỉ có MỘT mật khẩu, nên màn lỏng nhất là màn quyết định: đặt mật
khẩu 6 ký tự ở `/student/settings` là vô hiệu hoá luật của hai màn kia. Nên
thống nhất về luật 8 ký tự. App đã dùng luật chặt ở mọi chỗ
(`exam-web-app-phone/src/lib/auth/password.ts`).

## A18. `knowledge_block_edges` chỉ có đường ghi, không có đường xem

Rà cùng ngày, khi đối chiếu xem app còn thiếu màn nào.

`createKnowledgeBlockEdge` (`src/lib/theories/actions.ts:252`) ghi cạnh giữa các
khối tri thức, và `getKnowledgeGraphForTheory` (`:276`) lấy khối + cạnh "cho
mindmap" — nhưng **không file nào trong `src` gọi hàm thứ hai**, và không màn
hình nào vẽ `knowledge_block_edges`. `/learn/map` chỉ `redirect` về `/learn`,
còn `/learn` dùng `theory_edges` (quan hệ giữa các BÀI), không phải cạnh khối.

Nghĩa là dữ liệu cạnh khối có thể đang được nhập vào mà chưa ai xem được. Ba
lựa chọn, cần chủ dự án chọn:

1. Dựng màn hình xem thật (mindmap trong bài lý thuyết).
2. Xoá `getKnowledgeGraphForTheory` cho khỏi hiểu nhầm là đã có tính năng.
3. Để nguyên, nhưng ghi rõ đây là hạ tầng chờ dùng.

Ảnh hưởng tới app: `docs/PARITY.md` của `exam-web-app-phone` từng ghi "đồ thị
tri thức" là việc app còn thiếu. Sai — web cũng không có. Đã sửa lại.

## A19. `question_feedbacks` không có policy nào cho học sinh

> **TRẠNG THÁI 2026-09-20: bản sửa ĐÃ VIẾT, CHƯA ÁP lên database.**
> `supabase/migrations/20260920_feedback_anticheat_rls.sql` (kèm preflight,
> postflight, rollback và `scripts/feedback-anticheat-rls-check.mjs`). Mục này
> ở lại phần A cho tới khi migration chạy thật và script JWT trả toàn bộ ĐẠT —
> viết xong không phải là xong. Quy trình áp ở cuối mục.

Phát hiện khi port nút "Góp ý câu này" sang app.

Học sinh GHI vào bảng này từ `src/app/result/[attemptId]/page.tsx:201`. Nhưng
trong toàn bộ SQL của repo, `question_feedbacks` chỉ có đúng một policy:

```sql
-- database/FIX_ADMIN_RLS_COMPLETE.sql:154
CREATE POLICY "Admin can manage all feedbacks"
ON question_feedbacks FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
```

Không có policy INSERT/SELECT cho học sinh, và **không file nào chạy
`ALTER TABLE question_feedbacks ENABLE ROW LEVEL SECURITY`**. Hai khả năng:

| Nếu RLS đang… | Thì… |
|---|---|
| **TẮT** | Insert chạy được, nhưng policy admin ở trên là vô hiệu và **ai đăng nhập cũng SELECT được góp ý của mọi học sinh khác**. Góp ý có tên người gửi và nội dung họ viết. |
| **BẬT** | Học sinh bị từ chối 42501, nghĩa là nút "Gửi góp ý" bên web **đang hỏng** với mọi học sinh, và hộp việc `/admin/feedback` không bao giờ có gì mới. |

Không đoán được là khả năng nào nếu không chạy thật. Câu kiểm nhanh:

```sql
SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.question_feedbacks');
SELECT polname, polcmd FROM pg_policy WHERE polrelid = to_regclass('public.question_feedbacks');
```

**Sửa (cần cả hai vế):**

1. Bật RLS cho bảng.
2. Thêm hai policy cho học sinh, hẹp đúng phần của họ:

```sql
CREATE POLICY question_feedbacks_student_insert
  ON public.question_feedbacks FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY question_feedbacks_student_read
  ON public.question_feedbacks FOR SELECT TO authenticated
  USING (student_id = auth.uid());
```

Đây là thay đổi quyền nên cần preflight/postflight và test 401/403 theo
`AGENTS.md` mục "Quyền truy cập" — nhất là vế "trước khi sửa thì đang thế nào",
vì nếu RLS đang tắt thì bật lên sẽ **chặn ngay** mọi đường ghi hiện có cho tới
khi hai policy trên được tạo trong cùng một transaction.

App gửi góp ý qua đúng đường đó và khi gặp 42501 thì nói thẳng "hệ thống chưa
mở tính năng góp ý", không báo "lỗi kết nối" — xem
`exam-web-app-phone/src/lib/feedback/actions.ts`.

### Quy trình áp `20260920` (cho cả A19 và A20)

Checklist đầy đủ — tiền kiểm, áp, hậu kiểm, phép thử JWT, dọn rác, rollback —
nằm ở `docs/RUNBOOK.md` **mục 8novendecies** (viết 2026-10-27). Chỉ có một bản,
ở đó; đừng dựng bản thứ hai trong file này rồi để hai bản lệch nhau.

Bốn điều quyết định kết quả, nhắc lại ở đây vì chúng là chỗ dễ làm sai nhất:

1. **Đọc `xac_nhan_loi_A19_rls_dang_tat` của preflight trước tiên.** Nó trả lời
   câu mà không tài liệu nào trả lời được: lỗ này đang là "rò rỉ" (RLS tắt) hay
   "nút hỏng" (RLS bật). Hai kết quả dẫn tới hai cách kiểm khác nhau ở bước cuối.
2. **Các dòng `xac_nhan_loi_*` ra ngược kỳ vọng thì ĐỪNG áp migration** — nghĩa
   là có người đã sửa ngoài quy trình, và postflight sẽ "đạt" bất kể trạng thái
   thật là gì.
3. **Phép thử JWT không bỏ được:** `scripts/feedback-anticheat-rls-check.mjs`,
   bằng tài khoản `role = 'student'`, và phải có `--other-attempt <id>` hoặc
   `SUPABASE_SERVICE_KEY` — thiếu thì hai phép thử quan trọng nhất bị **bỏ qua**
   và script thoát mã 2. Bỏ qua không phải là đạt. Supabase SQL Editor **không
   dùng được** cho việc này: nó chạy bằng vai trò chủ sở hữu nên `auth.uid()` là
   NULL và mọi policy trông như bị bỏ qua.
4. **Sau khi áp:** sửa dòng `20260920` ở `RUNBOOK.md` mục 0 và dòng trạng thái
   của mục 8novendecies kèm ngày + kết quả đo thật, rồi mới đóng A19/A20.

**Hệ quả phải biết trước:** sau khi áp, `role = 'teacher'` sẽ thấy hộp góp ý
`/admin/feedback` RỖNG. Hôm nay giáo viên đọc được là vì RLS đang tắt chứ không
phải vì có quyền — policy của bảng vốn là exact `admin`. Migration cố ý không
nới sang `teacher` vì `AGENTS.md` mục 4 xếp sai lệch teacher/admin là P1 đang mở
và dặn không chữa triệu chứng bằng một policy lẻ. Nếu chủ dự án muốn giáo viên
đọc được, đó là một quyết định riêng — và phải quyết luôn có scope theo
`classes.teacher_id` hay không, vì hôm nay giáo viên đang thấy góp ý của mọi lớp.

## A20. `anti_cheat_logs` cho phép ghi đè lên lượt thi của người khác

> **TRẠNG THÁI 2026-09-20: bản sửa ĐÃ VIẾT, CHƯA ÁP.** Cùng migration với A19 —
> `20260920_feedback_anticheat_rls.sql`. Hai lỗ đi chung một file vì cùng cần
> một helper (`public.owns_exam_attempt`).

Phát hiện khi port `useExamAntiCheat` sang app.

Policy INSERT của bảng này là:

```sql
-- database/EXAM_SYSTEM_SCHEMA.sql:496
CREATE POLICY "System can insert anti-cheat logs" ON anti_cheat_logs
  FOR INSERT WITH CHECK (true);
```

`WITH CHECK (true)` không ràng buộc `attempt_id` phải thuộc về người gọi. Ai
đăng nhập cũng chèn được bản ghi "chuyển tab" vào lượt thi của BẤT KỲ học sinh
nào — chỉ cần biết `attempt_id`. Sổ theo dõi gian lận mà ai cũng viết vào được
thì không còn là bằng chứng.

Không khẩn cấp (phải đoán được `attempt_id`, và nhật ký chỉ để giáo viên tham
khảo chứ không tự trừ điểm), nhưng nên siết:

```sql
WITH CHECK (
  attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id = auth.uid())
)
```

Lưu ý kèm theo: policy SELECT chỉ mở cho giáo viên tạo đề
(`database/EXAM_SYSTEM_SCHEMA.sql:487`), nên chính học sinh không đọc lại được
nhật ký của mình — đúng ý đồ, giữ nguyên.

## A21. Công cụ học tập chưa có đường vào từ bài lý thuyết

Việc nền số 4 của `STUDENT_TOOLS_ROADMAP.md` mục 4: học sinh đang học chương 4
thì phải được mời mở công cụ tích phân ngay tại đó, thay vì phải tự nhớ ra khu
`/student/tools` có gì.

**Đã có (2026-09-19):** `findToolsForLesson()` trong `src/lib/tools/registry.ts`
— mỗi công cụ khai báo khối lớp và từ khoá chương, hàm trả về các công cụ hợp
với một bài đang mở. Có 5 test, kể cả ca "mặt phẳng lớp 11 không phải Oxyz".

**Còn thiếu:** chỗ gọi. Panel bài học trong `src/app/learn/page.tsx` (khối
`selectedTheory`, quanh dòng 640) chưa hiện nút nào. Dữ liệu cần truyền vào hàm
đã có sẵn ngay tại đó: `gradeOf(selectedTheory)`, `groupOf(selectedTheory)` và
`selectedTheory.title`.

---

## A22. Người lạ bấm một đề cụ thể rồi mất dấu nó sau khi đăng nhập

Thấy khi quay hành trình người ngoài (mục C26, video 2026-10-27).

Trang chủ cho khách bấm vào một đề cụ thể, nhưng link là `/login` trần
(`src/app/page.tsx`, card đề): **đề vừa bấm không được mang theo**. Đăng nhập
xong, middleware đẩy về `/student` theo vai trò, nên người ta rơi vào bảng điều
khiển rỗng thay vì vào đúng đề họ vừa chọn. Người lạ phải tự mò lại
`/student/exams` và tìm lại đúng cái tên đề đó.

Sửa: cho card đề trỏ tới `/login?next=/exam/prepare/<id>`, và ở `/login` sau khi
đăng nhập thành công thì đi tới `next` nếu nó là **đường dẫn nội bộ** (bắt đầu
bằng `/`, không phải `//`, không có scheme) — nhận `next` tuỳ ý là mở open
redirect ngay trên trang đăng nhập.

Kiểm cùng lúc hai nhánh: `next` hợp lệ thì vào đúng đề; `next` trỏ ra ngoài
(`https://...`, `//evil`) thì **bỏ qua** và về `/student` như cũ.

## A23. Tài khoản mới không được mời làm gì

Thấy cùng lượt quay. Người vừa đăng ký vào `/student` và thấy "Không có việc
mới đang chờ" — đúng sự thật (chưa ai giao bài), nhưng với người tự tìm tới
trang để làm thử thì đó là một bảng trắng. Trang chủ đã mời họ làm đề; `/student`
thì không mời gì.

Chưa sửa vì nó đụng vào gói quyền: mời họ làm đề thi thử trong khi
gói `basic` đang **tắt** `simulation` là mời vào đúng cái cửa khoá. Thứ tự đúng
là quyết gói quyền trước (xem A19 phần "Hệ quả" và `/admin/access`), rồi mới
thêm lời mời.

---

# Phần B — chờ chủ dự án quyết

## B1. Chữ phụ màu xám hơi nhạt

`text-slate-500` đang ở 3.9:1, dưới chuẩn 4.5 cho chữ nhỏ, dùng ở 531 chỗ. Đậm
lên thì đạt chuẩn nhưng chữ chính và chữ phụ gần bằng nhau, mất phân cấp thị
giác. Ba phương án đã ghi sẵn ở `docs/DESIGN_TODO.md` mục 1 — **cần chủ dự án
chọn trước**, không phải việc AI tự quyết.

## B2. Hai hình lạc ngoài khối

Hai hình TikZ ở bài 2 lớp 10 nằm ngoài mọi khối tri thức nên sẽ không hiện ở bài
nào. Chọn một trong hai: đưa vào khối gần nhất, hay sửa parser để giữ cả phần
văn bản ngoài khối. Chi tiết ở `docs/LATEX_PARSER_DEBUG.md` mục "Còn treo".

## B4. Có nên chuyển OCR từ Gemini sang DeepSeek không?

Hỏi ngày 2026-10-26. **Phần code đã sẵn sàng, phần quyết định thì chưa.**

Đã làm: `OCR_PROVIDER=deepseek` chạy được (adapter dùng chung đường
`/chat/completions` kiểu OpenAI), allowlist có hai tên model kèm cảnh báo chưa
xác minh, 9 test cho hình dạng request và luật đọc cấu hình, và
`--ocr-compare` trong benchmark để chạy cùng bộ ảnh qua hai nhà.

Chưa biết, phải đo trước khi quyết:

1. Tên model nào còn sống — `node scripts/deepseek-vision-probe.mjs <ảnh>`.
   Phiên thêm adapter bị chặn ra `deepseek.com` nên không xác minh được tại
   nguồn, mà nguồn bên thứ ba thì mâu thuẫn nhau.
2. Đọc chữ viết tay tiếng Việt kèm công thức có bằng Gemini không —
   `node scripts/essay-ai-benchmark.mjs --ocr-compare "gemini:gemini-3.6-flash,deepseek:<model>"`.
   Hiện `fixtures/essay-ai/` **chưa có fixture nào kèm ảnh**, nên bước này cần
   chủ dự án thêm vài ảnh bài làm (ẩn danh) kèm `expected_ocr_text`.

Hai điều đáng cân khi quyết:

- **Dồn nhà cung cấp.** Chấm bài đã chạy trên DeepSeek. Đưa OCR sang nữa thì
  một lần họ đổi model là mất cả hai đường — mà họ đã đổi ngầm một lần rồi
  (2026-09-10, `deepseek-chat` âm thầm chạy bằng `deepseek-flash`).
- **Gemini đang chạy ổn.** Lợi ích của việc đổi chủ yếu là giá, nên chỉ đáng
  đổi nếu cột "khớp ký hiệu" trong benchmark không tụt.

## B3. Mấy file đang nằm lẫn trong thư mục dự án

- `testAI_OCR.jpg`: nếu là ảnh bài làm của học sinh thật thì `AGENTS.md` mục 5
  cấm đưa vào kho code. Cần xác nhận rồi thêm vào `.gitignore` hoặc xoá.
- `.claude/`: cấu hình phiên làm việc, nên bỏ qua khỏi git.
- `public/tikz/`: 110 hình SVG dựng sẵn. Cần quyết commit hay dựng lại mỗi lần
  deploy — liên quan trực tiếp tới việc 1.

---

# Phần C — hồ sơ việc đã xong

Giữ lại vì bài học nằm trong đó, không phải vì việc còn dở. Phần kiến thức dùng
lại được đã chuyển sang chỗ ở cố định:

| Việc | Kiến thức nay nằm ở |
|---|---|
| hình lý thuyết không hiện, hình trắng | `RUNBOOK.md` mục 12 |
| nhập / kiểm / xuất bản bài lý thuyết | `RUNBOOK.md` mục 13 |
| thêm chương Dãy số, chạy lớp luật | `RUNBOOK.md` mục 8octodecies |
| trạng thái từng migration | `RUNBOOK.md` mục 0 |
| PostgREST 1000 dòng, GRANT cột đóng, hai cây taxonomy | `AGENTS.md` mục 3 và 4 |

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

## 12. XONG 2026-09-06 — bài tập về nhà đi từ dễ tới khó

Yêu cầu chủ dự án 2026-09-03: "1 session 10 câu hỏi thì làm 10 câu độ khó tăng
dần theo level NB, TH, VD, VDC".

Đã làm:

- [`src/lib/homework/session-order.ts`](../src/lib/homework/session-order.ts) —
  hàm thuần `arrangeHomeworkSessions`, 10 test ở file `.test.ts` cạnh nó.
- [`src/app/homework/[attemptId]/page.tsx`](../src/app/homework/[attemptId]/page.tsx)
  gọi hàm đó thay cho phép `sort` theo `order_index` trước đây.
- `supabase/migrations/20260904_homework_session_difficulty.sql` — **đã nạp**,
  xác minh 2026-09-06 bằng `pg_get_functiondef`: thân hàm live của
  `get_homework_attempt_questions` có `cognitive_level`, mà chuỗi đó không xuất
  hiện ở đâu trong `20260827_homework_test_phase.sql` — nên bản live đúng là bản
  của file này. Quy trình ở `RUNBOOK.md` mục 8duodecies.

Nếu chưa nạp migration thì trang vẫn chạy: `cognitive_level` và `difficulty` về
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

## 13. XONG 2026-09-06 — đề ôn tập không còn đếm ngược

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
- `supabase/migrations/20260905_practice_exams_no_timer.sql` — **đã nạp**
  (chủ dự án nạp 2026-09-03; hậu kiểm lại 2026-09-06: không còn đề ôn tập nào
  mang `duration <> 0`).

**Chưa nhìn bằng mắt.** Trang xuất bản cần tài khoản admin; phần đã kiểm là logic
ngày/giờ (8 test), typecheck, và lint không thêm lỗi mới (22 vấn đề trước và sau).

### Số lượt làm — đã xong cùng đợt

Chủ dự án chốt 2026-09-03: đề ôn tập không giới hạn số lần làm.

- Trang xuất bản: đề ôn tập hiện chữ "Không giới hạn" thay cho ô nhập số, và
  luôn ghi `max_attempts = 0`.
- Trang tạo đề: ghi tường minh `max_attempts: mode === 'practice' ? 0 : 1` thay
  vì dựa vào `DEFAULT 1` của cột.
- `supabase/migrations/20260906_practice_exams_unlimited_attempts.sql` —
  **đã nạp** (chủ dự án nạp 2026-09-03; hậu kiểm lại 2026-09-06: không còn đề ôn
  tập nào mang `max_attempts <> 0`). Quy trình ở `RUNBOOK.md` mục 8quaterdecies.

Không phải sửa SQL runtime: quy ước `0 = không giới hạn` đã có từ `20260722` và
`20260803`, giao diện học sinh cũng đã đúng. Chỉ dữ liệu mang sai giá trị.

## 15. XONG 2026-09-04 — nhập toàn bộ 29 bài lý thuyết từ kho LaTeX

`npm run theories:import` (thêm `--ghi` để thực sự ghi; mặc định chạy thử).

Kết quả lần chạy: **25 bài tạo mới, 4 bài cập nhật, 388 khối tri thức** — khớp
đúng con số `lint-tri-thuc.mjs` báo (388 khối có id). 29 bài xuất bản 4, nháp 25.

### Lỗi `Misplaced \hline` đã hết, và nó là DỮ LIỆU CŨ chứ không phải parser

Bốn bài nhập tay trước đây lưu display math bằng **một** dấu `$` (inline), nên
MathJax gặp `\hline` trong `array` ở chế độ inline và báo lỗi đỏ giữa bài.

Parser đã được sửa từ trước (`latex-parser.ts` bước 8 dùng hàm thay thế, vì chuỗi
thay thế của `String.replace` coi `$$` là **một** dấu `$` — chính lỗi đó làm mọi
display math tụt xuống inline). Nhưng bốn bài kia chưa bao giờ được nhập lại.

Đo sau khi nhập lại: **35 chỗ `\hline`, 0 chỗ nằm ngoài `$$...$$`.**

### Ba cái bẫy của việc nhập, đã xử trong script

1. **Nguồn sự thật là ba file `filechinh-lop*.tex`, không phải thư mục.**
   `chapters/lop12/.../bai01-on-tap-dao-ham.tex` (280 dòng) là bản nháp KHÔNG nằm
   trong sách — file chính nạp bản `-chuan` (70 dòng). Quét thư mục sẽ lấy cả hai,
   mà chúng trùng tiêu đề "ÔN TẬP ĐẠO HÀM".
2. **Khoá đối chiếu là (chương, tiêu đề bài lý thuyết)**, không phải tên section
   và không phải tiêu đề trần. Section của bốn bài cũ tên "Bài 1. Ôn tập đạo hàm"
   trong khi theory tên "ÔN TẬP ĐẠO HÀM" — khớp theo tên section thì ba bài bị coi
   là mới và script đẻ bản trùng, để lại bản lỗi cho học sinh đọc. Còn "HỆ THỐNG
   HÓA VÀ BÀI TẬP CUỐI CHƯƠNG" có ở cả chương 2 và 3 lớp 12, nên khoá phải kèm chương.
3. **`is_published` không bị đụng.** Bài đang cho học sinh đọc giữ nguyên; 25 bài
   mới vào ở dạng nháp. Xuất bản là quyết định của giáo viên.

### Đã xuất bản 2026-09-06

Cả 29 bài đã ở trạng thái `is_published = true` — 14 bài nháp cuối cùng xuất bản
bằng `npm run theories:publish -- --ghi`, sau ba phép kiểm chặn: đủ chuỗi
section → category → topic, 59/59 hình có SVG dựng sẵn, 3927 công thức sạch.
Hình toàn bộ: 111 hình trong 29 bài, **111 đã có SVG** (`npm run tikz:svg` sau
mỗi lần sửa hình trong LaTeX).

## 16. XONG 2026-09-04 — rà toàn bộ công thức của 29 bài bằng MathJax thật

`npm run theories:check-math` chạy **chính bộ phân tích TeX của MathJax**
(`mathjax-full` có sẵn trong `node_modules`) trên mọi công thức của
`theories.content_md` — tức đúng thứ học sinh nhận, không phải file `.tex`.

**Quét bằng regex là không đủ, và đã chứng minh.** Bản quét tĩnh (môi trường lạ,
lệnh ngoài danh sách, `$$` lẻ cặp) báo *sạch trơn* trong khi trên `/learn` vẫn có
chỗ hỏng. Lỗi MathJax phần lớn là lỗi ngữ pháp — thiếu `}`, `&` sai số cột,
`\left` không có `
ight` — không mẫu regex nào bắt được nhóm đó.

### Lỗi tìm được: placeholder nội bộ của parser lọt ra nội dung

3927 công thức, 7 lỗi, tất cả cùng một hình dạng:

```
\left\{%%PROTECTED_0%%
ight.
```

`%%PROTECTED_n%%` là placeholder nội bộ của `latexToMarkdown`. **8 chỗ trên 2
bài** hiện nguyên chuỗi đó giữa bài cho học sinh đọc.

Nguyên nhân là **bảo vệ lồng nhau + khôi phục một lượt**. Với
`$\left\{egin{aligned}…\end{aligned}
ight.$`:

1. bước bảo vệ môi trường thay khối `aligned` bằng `%%PROTECTED_0%%`;
2. bước bảo vệ `$...$` bọc cả cụm thành `%%PROTECTED_1%%`;
3. bước khôi phục quét **một lượt**, thay `%%PROTECTED_1%%` bằng nội dung có
   chứa `%%PROTECTED_0%%` — mà con trỏ regex đã đi qua chỗ đó.

Hai bản sửa, cả hai đều cần:

- **Đổi thứ tự**: bảo vệ `$...$` chạy TRƯỚC bảo vệ môi trường. Cả biểu thức được
  cất nguyên văn nên không còn lồng nhau, và cũng không bị chèn `$$` vào giữa một
  công thức inline — cái đó còn hỏng thêm một tầng nữa.
- **Khôi phục lặp** tới khi hết placeholder (trần 10 vòng). Hàng rào cho ca lồng
  nhau chưa biết.

Ba test khoá lại ở `latex-parser.test.ts`.

Sau khi nhập lại 29 bài: **3927/3927 công thức sạch, 0 placeholder lọt ra,
35 `\hline` đều nằm trong `$$`.**

### Chạy lại khi nào

Sau mỗi lần `npm run theories:import --ghi`. Mã thoát khác 0 khi còn lỗi.

## 17. XONG 2026-09-04 — siết luật phân loại, và thêm chương "Dãy số"

### Vấn đề đo được trên ngân hàng thật (1621 câu)

112 câu ghi thẳng "cấp số cộng", "công sai", "dãy số" bị AI xếp vào:
**Tổ hợp và nhị thức Newton (52), Thống kê liên tục (36), Lượng giác (8)**.
KHÔNG câu nào vào đúng chương.

### Ba nguyên nhân, không phải một

1. **Lớp luật gần như chết.** `topicHints` chỉ dò trong tên `topics`, mà cây đang
   dùng có topics là "Đại số", "Thống kê", "MỘT SỐ YẾU TỐ GIẢI TÍCH" — tên môn
   học thật nằm ở tầng **chương**. Chỉ đúng một luật từng khớp được. Mọi câu rơi
   xuống AI, và AI đoán.
2. **Không có dấu hiệu phủ định.** "Tổ hợp" hút mọi câu có `u_n`, luỹ thừa,
   `C_n^k` — kể cả câu cấp số nhân.
3. **Dấu hiệu quá rộng.** `\sin` trần đủ để kết luận "Lượng giác", mà `\sin` có
   trong câu đạo hàm, tích phân, giới hạn.

### Đã sửa

| | trước | sau |
|---|---|---|
| 112 câu dãy số/cấp số luật tự quyết | 0 | **110** |
| Hàng rào bắt được là đang xếp sai | — | **107/112** |
| Tỷ lệ mâu thuẫn trên 1324 câu đã phân loại | 43,1% (bản đầu) | **11,7%** |

Con số 43% là của bản sửa đầu tiên và nó **là một lỗi**: khi nhiều chương cùng
khớp, code lấy chương đầu tiên trong mảng — tức chọn theo thứ tự database trả về.
Giờ khớp nhiều là **không chọn chương nào**, rơi xuống tầng chủ đề.

**Hàng rào `findRuleConflict`** chặn gợi ý AI mâu thuẫn với bằng chứng hiển
nhiên. Chỉ **từ chối**, không sửa hộ — sửa hộ là đoán thay model, mà đoán chính
là thứ đang hỏng. Route trả `rejectedByRule` để theo dõi.

### Migration chờ nạp

`20260910_them_chuong_day_so.sql` — thêm chương **Dãy số** + 3 mục con vào cây
**cũ** (dưới "Đại số"). Không có nó thì 40 câu dãy số thuần vẫn không có chỗ xếp.

Quyết định của chủ dự án: **giữ cây cũ**, không chuyển sang cây `sgk-*`. 1324 câu
đã phân loại theo cây cũ; chuyển hết là làm lại từ đầu.

### Đã mang sang question-bank

`question-bank/src/services/classify-rules.ts` là **bản song sinh** của
`classify.ts`. Bên đó trước nay hỏi thẳng DeepSeek cho mọi câu, không tầng nào
chặn trước, không tầng nào kiểm sau, `temperature: 0.3`, và **ép model đi tới
tận `subsection`** — chính thứ exam-web ghi rõ là "cách chắc chắn để nó bịa".
Nay: luật chạy trước, hàng rào kiểm sau, temperature 0, và không ép độ sâu.

**Sửa bảng luật một bên phải sửa cả bên kia.** Hai kho không dùng chung package
nên không có gì ép điều đó — chỉ có chú thích ở đầu mỗi file.

### Còn nợ

Hai cây taxonomy vẫn song song: ngân hàng câu hỏi ở cây cũ (1324 câu), lý thuyết
và `/learn` ở cây `sgk-*` (0 câu). Chúng không gặp nhau. Đó là lý do chọn chương
nào ở màn bốc câu theo cây SGK cũng thấy trống.

## 18. XONG 2026-09-06 — xuất bản nốt 14 bài lý thuyết, và chấm sao độ khó

Cả 29 bài lý thuyết nay đều `is_published = true`. 14 bài nháp cuối cùng lên
bằng [`scripts/publish-theories.mjs`](../scripts/publish-theories.mjs)
(`npm run theories:publish -- --ghi`).

### Vì sao không bấm tay ở /admin/theories

Bấm tay 14 bài thì được, nhưng không kiểm được gì trước khi bấm. Ba lớp lỗi đã
gặp thật ở dự án này đều chỉ lộ ra SAU khi học sinh mở bài: công thức lỗi cú pháp
hiện chữ đỏ giữa bài (mục 1), hình TikZ chưa dựng sẵn rơi xuống TikZJax và ra
khung mã nguồn, và bài thiếu mắt xích `section → category → topic` thì xuất bản
xong vẫn không hiện ở `/learn`.

Script chạy cả ba phép kiểm trước, và **không ghi gì nếu có bài hỏng**. Kết quả
lượt này: 14/14 bài đủ chuỗi cây, 59/59 hình có SVG dựng sẵn, 3927 công thức sạch
(`npm run theories:check-math`).

### Độ khó: 22 bài đang mang giá trị mặc định, không phải đánh giá

`import-theories-from-latex.mjs` đặt cứng `difficulty_level: 3` cho mọi bài tạo
mới. Nên số 3 của một bài mới nhập **không nói lên điều gì** — nó chỉ là giá trị
khởi tạo. Thang thay vào:

| sao | nghĩa |
|-----|-------|
| 1 | chỉ cần nhớ, không có kỹ thuật |
| 2 | một quy trình, áp thẳng vào là ra |
| 3 | vài quy trình, phải chọn đúng cái nào |
| 4 | phối hợp nhiều công cụ, sai một bước là hỏng cả bài |
| 5 | tổng hợp cả chương hoặc mô hình hoá nhiều bước |

Thang căn theo chính các bài thầy đã tự chấm: MỆNH ĐỀ 2, PHƯƠNG TRÌNH LƯỢNG GIÁC
CƠ BẢN 3, CÔNG THỨC LƯỢNG GIÁC 4, CẤP SỐ NHÂN 5. Phân bố sau khi chấm: 2 bài ★★,
13 bài ★★★, 8 bài ★★★★, 6 bài ★★★★★.

**Chỉ chấm bài còn nháp.** Bài đã xuất bản là bài thầy đã đọc và duyệt; chấm đè
lên đó là lấy phỏng đoán của máy ghi đè lên đánh giá của người dạy.

`difficulty_level` không khoá bài, không lọc bài, không đụng tới điểm — nó chỉ
hiện thành sao ở `/admin/theories`. `/learn` có mang nó xuống thẻ nhưng không vẽ
ra. Chấm sai thì sửa ở trang soạn bài, không có hậu quả nào với học sinh.

### Hoàn tác

`.theories-published-<dấu thời gian>.json` ghi trạng thái cũ của đúng 14 bài bị
đổi (đã cho vào `.gitignore`); PATCH ngược lại là về nguyên trạng.

## 19. XONG 2026-09-07 — bảy hình không gian trắng tinh vì dvisvgm dịch sai `opacity`

Chủ dự án mở `/learn` và thấy "có 2 hình trắng". Đếm lại bằng máy thì không phải
hai mà **bảy**, và cả bảy đều là hình không gian: ba hình ở VECTƠ TRONG KHÔNG
GIAN, hai ở HỆ TRỤC TOẠ ĐỘ, một ở bài tập cuối chương Oxyz, một mặt cầu ở phụ lục
A.

### Nguyên nhân

`dvisvgm 3.6` dịch `opacity=` của TikZ thành **0**.

TikZ hiện `opacity=0.7` bằng ExtGState trong PDF. Bản dvisvgm này đọc không ra và
ghi `opacity='0'` — không chỉ cho nét mờ, mà cho **mọi nét vẽ sau đó**. Đo trên
bảy file: 100% số `<path>` đều mang `opacity='0'`.

Tái hiện được bằng bốn dòng LaTeX:

```latex
\fill[SoftAccent,opacity=0.7] (0,0) rectangle (3,2);
\draw[thick,Primary] (0,0)--(3,2);
```

→ dvisvgm cho `fill-opacity='0'` **và** `stroke-opacity='0'`; `pdftocairo -svg`
trên đúng file PDF đó cho `fill-opacity="0.7"` và `stroke-opacity="1"`.

### Vì sao không khâu nào bắt được

Đây là lớp lỗi im lặng hoàn toàn:

- `pdflatex` xong sạch, `dvisvgm` xong sạch, không cảnh báo nào;
- file SVG ghi ra **hợp lệ**: đúng kích thước, đủ `<path>`, đủ màu — chỉ có điều
  mọi nét đều trong suốt;
- phép kiểm "hình đã có SVG chưa" của `scripts/publish-theories.mjs` thấy đủ
  111/111 và cho qua;
- phép kiểm phía production thấy HTTP 200 và đúng số byte;
- ngay cả quét màu trong file cũng thấy `#2563eb`, `#7c3aed` — hình "có màu".

Chỉ có một cách phát hiện: **vẽ ra rồi đếm điểm ảnh**. Cách làm khi truy: nạp cả
111 SVG vào một trang, vẽ từng hình lên canvas 120×120 nền trắng, đếm điểm không
trắng. Bảy hình cho đúng 0.

### Bản sửa

`scripts/render-tikz-svg.mjs`:

1. **Đường lui**: SVG nào chứa `opacity='0'` thì dựng lại bằng `pdftocairo -svg`
   (đi kèm MiKTeX, không phải cài thêm). Vẫn để dvisvgm làm chính vì nó đang dựng
   đúng 104 hình còn lại và `--exact-bbox` cắt sát hơn.
2. **Chặn cuối**: nếu mọi nét vẽ đều trong suốt thì **không ghi file**, báo lỗi.
   Thà dừng còn hơn ghi đè một SVG tốt bằng một SVG trắng rồi vài tuần sau mới có
   người nhìn ra.

Cả hai công cụ đều đổi chữ thành hình vector nên SVG vẫn không phụ thuộc font.

Đã dựng lại bảy hình: cả bảy nay mang `fill-opacity="0.7"` (hoặc `0.85`) đúng như
bản in. Mặt cầu ở phụ lục A nặng lên 645 KB vì `\shade[ball color=...]` thành
`radialGradient` 259 điểm dừng — vẫn là vector, chấp nhận được cho một hình.

### Còn nợ

Phép kiểm "vẽ ra rồi đếm điểm ảnh" hiện làm bằng tay trong trình duyệt. Nên gói
thành script chạy được trong CI, vì chặn cuối ở trên chỉ bắt được trường hợp
**toàn bộ** trong suốt — hình mất một nửa nét thì vẫn lọt.

## 20. XONG 2026-09-18 — công cụ tích phân, và dọn nền dùng chung cho các công cụ

Đợt 2 của `STUDENT_TOOLS_ROADMAP.md` đã xong cả hai công cụ. Công cụ tích phân gộp
ba kiểu bài của chương 4 vào một tab: tổng Riemann, diện tích hình phẳng, quãng
đường từ v(t). Chi tiết ở mục 9 của roadmap; ở đây chỉ giữ hai bài học.

**Nền dùng chung phải nằm ở `lib/tools/`, không nằm trong thư mục của công cụ đầu
tiên cần nó.** `poly.ts` và `surd.ts` viết cho công cụ khảo sát hàm số, nhưng công
cụ tích phân cần đúng chúng; phần đọc biểu thức cũng vậy. Lần này chuyển hẳn lên
`lib/tools/` và tách `expression.ts` ra khỏi `function-analysis/parse.ts` — cùng
đường mà `fraction.ts` đã đi ở đợt 1. Công cụ sau (Oxyz, đường tròn lượng giác) cứ
theo lối đó.

**Không nhìn được bằng mắt trong sandbox thì dựng đường nhìn tạm.** Route
`/student/tools/*` nằm sau middleware đăng nhập, mà sandbox không có `.env` để tạo
phiên thật. Cách đã dùng: một trang `/tool-preview` tạm + một dòng cho qua
middleware, chụp màn hình bằng Chromium có sẵn, rồi **xoá cả hai trước khi commit**
(`git checkout src/middleware.ts`). Nhờ chụp thật mới thấy nhãn cận dạng căn đè lên
số trên trục — đọc code không thấy được. MathJax không tải được qua proxy của
sandbox nên công thức hiện ra dạng `$…$` thô: hình và bố cục kiểm được, còn **phần
công thức thì vẫn phải mở bằng mắt trên máy có mạng**.

## 21. XONG 2026-09-19 — công cụ Oxyz kéo được để xoay

Đợt 3 của `STUDENT_TOOLS_ROADMAP.md` xong công cụ nặng nhất: bốn kiểu bài của
chương 5, hình không gian xoay được bằng SVG và phép chiếu song song tự viết
(không three.js). Chi tiết ở mục 10 của roadmap; ở đây giữ hai bài học.

**Chỗ nào so sánh được bằng số hữu tỉ thì đừng đụng tới căn.** Vị trí tương đối
giữa mặt cầu và mặt phẳng là so d với R, nhưng d luôn có căn. So `d²` với `R²` —
cả hai hữu tỉ — thì ca **tiếp xúc** (d đúng bằng R) không bao giờ bị trượt thành
"cắt" hay "không cắt" vì sai số. Cùng lý do: tập số a + b√r chỉ cộng được khi
cùng r, nên mọi phép cộng hai độ dài khác căn đều phải tránh từ lúc thiết kế.

**Hình 3D phải nhìn mới biết đúng.** Ba lỗi của bản đầu — mảnh mặt phẳng phủ kín
khung, tên vectơ đè lên tên điểm, phương trình tham số viết `x = 0 + 1t` — không
lỗi nào lộ ra qua test hay typecheck. Cách xem trong sandbox vẫn như mục 20:
trang `/tool-preview` tạm + một dòng cho qua middleware, chụp bằng Chromium,
rồi xoá cả hai trước khi commit.

## 22. ĐÃ SỬA 2026-09-20 — `/badges` và `/goals` đọc `exam_attempts` bằng cột không tồn tại

Phát hiện ngày 2026-09-19 khi port hai trang này sang app điện thoại. **Hỏng
lặng lẽ**: không có lỗi nào hiện ra, chỉ là mọi con số đứng im ở 0.

Cả hai trang viết:

```ts
// src/app/badges/page.tsx:90   và   src/app/goals/page.tsx:105
const { data: attemptsData } = await supabase
  .from('exam_attempts')
  .select('score, created_at')
  .eq('user_id', user.id)          // ← bảng có `student_id`, không có `user_id`
  .eq('status', 'completed')       // ← status chỉ nhận in_progress|submitted|graded|abandoned
```

Hai điều kiện đều sai với schema thật (`database/SUPABASE_SCHEMA.sql:183`, và
mọi file khác trong `src` đều dùng `student_id` + `'submitted'`). PostgREST trả
lỗi cột không tồn tại; **cả hai trang không kiểm `error`**, nên `attemptsData`
về `null`, nhánh `if (attemptsData && attemptsData.length > 0)` không chạy, và
`stats` giữ nguyên giá trị khởi tạo là 0.

Hậu quả học sinh nhìn thấy:

- `/badges`: mọi thanh tiến độ 0%, `totalExams` 0, `highestScore` 0, chuỗi ngày 0.
  Huy hiệu đã đạt vẫn hiện đúng (bảng `user_badges` dùng `user_id` — đúng), nên
  trang trông như "chưa làm bài nào" với người đã làm hàng chục bài.
- `/goals`: `current_value` không bao giờ được cập nhật, nên mục tiêu không bao
  giờ tự đánh dấu hoàn thành.

Hai trang đều mở được từ `StudentHeader` (chuông huy hiệu và menu), nên đây là
màn hình học sinh thật sự vào.

**Sửa:** đổi thành `.eq('student_id', user.id).in('status', ['submitted', 'graded'])`
và kiểm `error` thay vì nuốt. Bản app đã làm đúng, đối chiếu được ở
`exam-web-app-phone/src/lib/student/achievements.ts` — cùng một phép tính,
cùng thang chuỗi ngày `activity-streak.ts`.

Cân nhắc kèm theo: `created_at` là lúc MỞ đề, `submit_time` là lúc nộp. App dùng
`submit_time` vì "ngày học" nên là ngày làm xong bài. Khác biệt nhỏ nhưng nếu
sửa thì nên thống nhất một mốc cho cả hai bên.

## 23. ĐÃ SỬA 2026-09-20 — không có đường nào TẠO bookmark

Phát hiện cùng đợt. `question_bookmarks` chỉ được **đọc** (qua RPC
`get_my_safe_bookmarks`) và **xoá** ở `src/app/bookmarks/page.tsx:91`. Không file
nào trong `src` insert vào bảng đó.

Policy INSERT đã có sẵn (`database/ANNOUNCEMENTS_SCHEMA.sql:65`), tức hạ tầng
sẵn sàng — chỉ thiếu nút bấm. Kết quả: `/bookmarks` mở được từ menu
`StudentHeader` nhưng luôn rỗng, trừ khi dữ liệu đến từ nơi khác ngoài repo này.

**Chỗ tự nhiên để thêm nút:** trang kết quả `/result/[attemptId]` — học sinh vừa
thấy câu mình làm sai là lúc muốn đánh dấu để ôn lại. Cần quyết cho phép lưu
`note` hay không, vì cột đó đang có mà không ai ghi.

Vì chưa có đường tạo, **app điện thoại cố ý không port màn này**: dựng một màn
hình đọc thứ không gì sinh ra là dựng một trang rỗng có thật.

**Bản sửa 2026-09-20** (mục 22):

- `src/app/badges/page.tsx` và `src/app/goals/page.tsx`: `student_id` thay
  `user_id`, `.in('status', ['submitted','graded'])` thay `'completed'`, và
  `error` được kiểm rồi hiện thành dải đỏ có nút "Thử lại" thay vì nuốt.
- Mốc thời gian chuyển sang `submit_time` ở cả hai trang. Chốt luôn cái mà mục
  A15 để ngỏ: "ngày học" là ngày NỘP bài, không phải ngày mở đề — bản app điện
  thoại đã tính như vậy từ đầu, giờ hai bên khớp nhau.
- **Chưa mở trang bằng tài khoản học sinh thật.** Typecheck và lint sạch, nhưng
  con số đúng hay không thì phải đăng nhập mới biết.

**Bản sửa 2026-09-20** (mục 23):

- `src/lib/bookmarks/actions.ts` — `addBookmark` / `removeBookmark` /
  `getBookmarkIdsByQuestion`, dùng chung hình dạng với bản app điện thoại.
- `src/app/result/[attemptId]/page.tsx` — nút "Lưu để ôn lại" ở mỗi câu, cạnh
  nút góp ý. Bấm lại là bỏ lưu.
- Quyết định về cột `note`: **KHÔNG ghi.** Cột vẫn còn và RPC vẫn trả về, nhưng
  chưa có thiết kế cho việc nhập ghi chú và bản app cũng không ghi — thêm một ô
  nhập ở một bên là tạo dữ liệu chỉ nửa hệ thống hiểu.
- Từ nay `/bookmarks` có dữ liệu để hiện. Hai đường tạo: web (nút này) và app
  điện thoại (cùng màn kết quả).

## 24. XONG 2026-10-22 — thêm chuyển động cho landing và trang học sinh

Phase 7 của `VISUAL_MOTION_PLAN.md` (mục 15). Tám chỗ, **không thêm một lớp CSS
trùng chức năng nào** — bảy chỗ dùng lại primitive đã có (`ScrollRevealClient`,
`.stagger-children`, `.animate-list-stagger`, `group-hover:scale-*`), một chỗ
thêm `.nav-underline` dựng trên keyframes `progress-grow` sẵn có.

**Bài học — chỗ chưa có chuyển động thường là chỗ bị quên, không phải chỗ cố ý
để yên.** `StatsStrip` là khối duy nhất của landing chưa từng được bọc
`ScrollRevealClient`: cả trang hiện dần khi cuộn, riêng dải số liệu bật ra ngay.
Không ai nhận ra vì nó nằm cao, gần như luôn ở trong khung nhìn đầu tiên. Rà
bằng `grep` tên lớp chuyển động trên từng file (xem mục 15 của kế hoạch) tìm ra
nó trong một phút, còn đọc trang bằng mắt thì không.

**Phép thử của lưới reduced-motion phải chạy trên trình duyệt thật.** Đếm số
phần tử còn `opacity: 0` sau khi tải xong, với `prefers-reduced-motion: reduce`:
phải bằng **0**. Đo được 0 ở cả ba cỡ màn. Không có phép đếm này thì một lớp
`.animate-*` mới quên khai báo trong lưới sẽ làm mất hẳn nội dung của người bật
giảm chuyển động — mà người đo bằng mắt với cấu hình mặc định thì không bao giờ
thấy.

## 25. XONG 2026-10-27 — F5 giữa giờ thi không còn mất bài

`ExamRunner` giữ đáp án trong state React và chỉ gửi lên server **một lần duy
nhất** lúc nộp (`submit_exam_attempt`). Thiết kế đó rất nhẹ cho server — một
transaction cho một bài thi thay vì hàng nghìn lượt autosave — nhưng nó có đúng
một hệ quả xấu: **tải lại trang là mất sạch đáp án đã chọn**, và không có cách
nào cứu. Hệ quả ấy rơi vào người thật, giữa lúc đang thi, và trang thi không hề
có cảnh báo nào trước khi nó xảy ra.

**Bản sửa giữ nguyên hợp đồng "một lượt ghi server cho một bài thi".** Nháp nằm
trong `localStorage` trên máy của chính học sinh, không đi đâu cả, nên không
thêm một byte tải nào cho server và cũng không thêm rủi ro lộ dữ liệu.
[`src/lib/exam/draft.ts`](../src/lib/exam/draft.ts) + 11 test.

Ba điều bất biến, mỗi điều là một ca đã gặp ở nơi khác:

1. **Không bao giờ được làm vỡ buổi thi.** Mọi lời gọi đều nuốt lỗi: chế độ
   riêng tư, hết quota, `localStorage` bị chặn — tất cả chỉ dẫn tới "không có
   nháp", không bao giờ dẫn tới một exception ném ra giữa giờ. Hết quota thì
   hàm tự dọn nháp của các lượt khác rồi ghi lại đúng một lần: bài đang thi quan
   trọng hơn mọi bản nháp cũ.
2. **Khoá theo `attemptId`, không theo `examId`.** Một học sinh làm lại cùng một
   đề (đề ôn tập không giới hạn lượt, mục 13) sẽ bị chèn đáp án của lượt cũ vào
   lượt mới nếu khoá theo đề.
3. **Nháp không phải nguồn sự thật.** Nộp xong là xoá ngay sau khi RPC trả về,
   trước cả khi chuyển trang. Nháp hỏng một phần thì cứu phần lành: câu nào
   không còn đúng hình dạng thì bỏ câu đó, không ném lỗi — ném ở đây là biến một
   bản nháp méo thành một buổi thi trắng.

Học sinh thấy gì: một dải thông báo "Đã khôi phục bài làm lưu trên máy lúc
**14:05 ngày 27/10**. Bài chỉ được gửi lên hệ thống khi em bấm nộp." Câu thứ hai
có mặt để không ai hiểu nhầm là đã nộp rồi.

**Đo thật trên trình duyệt**, không chỉ test đơn vị: trả lời cả ba loại câu
(trắc nghiệm, Đúng/Sai, trả lời ngắn) → `localStorage` có khoá
`exam-draft:<attemptId>` → F5 → dải thông báo hiện ra, và đếm lại được
`aria-pressed=true` ở 2 nút cùng ô trả lời ngắn giữ nguyên `0,333`. Test đơn vị
không thay được phép đo này: nó dùng `Storage` giả, còn thứ hỏng thật thì nằm ở
chỗ React gắn lại state sau khi trang dựng lại.

**Còn nợ:** nháp chỉ cứu được đáp án, **không cứu được đồng hồ**. Thời gian còn
lại tính từ `exam_attempts.start_time` trên server — `ExamSidebar` dựng lại mốc
kết thúc mỗi lần mount — nên F5 không làm trôi giờ, nhưng cũng nghĩa là học sinh
mất đúng số giây họ loay hoay tải lại. Không sửa được ở lớp này.

## 26. XONG 2026-10-27 — phân loại đề ở trang chủ, và quay lại hành trình của người ngoài

Hai việc một mạch, vì việc thứ nhất tìm ra lý do cho việc thứ hai.

### Quay lại toàn bộ hành trình người lạ

Container của phiên làm việc không có `.env` của Primary nên không chạm được
database thật. Thay vì bỏ cuộc hoặc quay một màn hình chết, dựng một **Supabase
giả chạy trong máy** nói đúng phương ngữ PostgREST + GoTrue mà `supabase-js`
gửi đi (`scripts/mock-supabase.mjs`), rồi lái trình duyệt thật đi hết hành trình
và ghi hình (`scripts/record-student-flow.mjs`). **App không bị sửa một dòng
nào để quay** — đó là điều kiện để bản ghi còn có giá trị.

Nó chứng minh được: giao diện, điều hướng, thông báo lỗi, và các cổng chặn mà
client phải xử lý. Nó **không** chứng minh: RLS thật, transaction thật, hiệu
năng thật. Mock có hai công tắc để diễn đúng trạng thái production hôm nay
(`MOCK_ANON_GRADE`, `MOCK_ANON_PRACTICE`, `MOCK_ACCESS_TIER`).

**Ba điều nhìn thấy trong video mà đọc code không thấy:**

1. **Người lạ bấm một đề cụ thể ở trang chủ rồi bị đẩy sang `/login` — và đề
   vừa bấm bị quên sạch.** Đăng nhập xong họ rơi vào `/student`, không phải vào
   đề. Chưa sửa: cần `?next=` xuyên qua login (xem mục A22).
2. **Tài khoản mới vào `/student` thấy một bảng rỗng**: "Không có việc mới đang
   chờ". Người vừa đăng ký xong không được mời làm gì cả.
3. **Rồi họ bị chặn**: `start_exam_attempt` ném `FEATURE_NOT_AVAILABLE` vì gói
   `basic` mặc định **tắt** `simulation`. Màn hình nói "Hãy liên hệ giáo viên" —
   với một người tự tìm tới trang để làm thử, đó là ngõ cụt. Đây là **cổng
   chặn đứng giữa đường quảng bá**, và nó là một ô cờ ở `/admin/access`.

### Phân loại đề ở trang chủ

Trước: một danh sách phẳng. Thứ phân loại duy nhất đang chạy là dải màu bên
trái card, băm từ `exams.subject` — mà cả ngân hàng chỉ có môn Toán, nên **mọi
đề ra cùng một màu**. Có code phân loại, không có phân loại.

Sau: hàng chip `Tất cả lớp · Lớp 10 · Lớp 11 · Lớp 12` và `Thi thử · Ôn tập`,
mỗi chip kèm số đề thật, và nhãn lớp/loại đề trên từng card. Chip là `<Link>`
chứ không phải nút JS: chạy cả khi JS chưa tải xong, và **mỗi bộ lọc là một
đường dẫn gửi được** — dán `minhmath.../?lop=12#exams` vào nhóm Zalo lớp 12 là
học sinh mở ra thấy đúng đề của mình.

**Chỗ khó không phải giao diện mà là quyền.** `20260722:3339` cấp cho `anon`
theo danh sách cột đóng, **không có `grade`**; grant theo cột của Postgres từ
chối **cả câu** khi chạm cột chưa cấp. Thêm `grade` vào câu select của trang chủ
mà chưa nạp migration là khối đề biến mất sạch khỏi trang chủ với mọi khách, im
lặng — đúng họ lỗi `max_attempts` ngày 2026-09-03. Nên mã viết để chạy **cả hai
phía**: câu đầy đủ trước, bị từ chối thì rơi về câu cũ và tự ẩn phần lọc theo
lớp. Nạp `20261027_landing_exam_catalog.sql` là **bật** phân loại lên, không
phải sửa một trang đang hỏng.

Cùng lúc phát hiện hai thứ nữa, cả hai đều do thiếu quyền chứ không do code:

- **Đề ôn tập chưa bao giờ xuất hiện trên trang chủ.** Policy cũ chỉ cho
  `exam_mode = 'simulation'`. Tức là loại đề dễ mời người lạ nhất — không bấm
  giờ, không giới hạn lượt — lại là loại bị giấu.
- **Dòng "22 câu" trên card luôn bị ẩn với khách.** `anon` không có GRANT lẫn
  policy nào trên `exam_questions`, nên số câu luôn đếm ra 0. Chỉ người đã đăng
  nhập mới thấy con số đó.

Cả ba mở trong cùng một migration, kèm preflight in ra **toàn bộ `description`
sẽ thành công khai** (đọc trước khi chạy) và hai chốt ngược trong postflight:
`anon` không được đọc `created_by`/`class_id`/`max_attempts`/..., và không được
đọc `questions`/`answers`. Quy trình: `RUNBOOK.md` mục 8vicies.

9 test cho `src/lib/landing/exam-catalog.ts`. Hai test đáng giá nhất không phải
"lọc có chạy không" mà là hai ca đã từng làm hỏng sản phẩm: đề `grade = NULL`
(đề cho **mọi lớp**) phải hiện ở **mọi** tab lớp, và khi chưa cấp quyền đọc cột
`grade` thì không lọc theo lớp và không bịa nhãn.
