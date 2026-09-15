# Bộ luật phân loại câu hỏi

> Áp cho **cả hai kho**: `exam-web` (`src/lib/questions/classify.ts`) và
> `question-bank` (`src/services/classify-rules.ts`). Bộ luật là hợp đồng chung;
> code hai bên phải thi hành đúng nó, không được mỗi bên hiểu một kiểu.
>
> Trạng thái: **chủ dự án duyệt 2026-09-08, đang thi công**. Mục 10 là danh sách
> việc, có đánh dấu phần đã xong. Mọi con số dưới đây đo ngày **2026-09-08**
> trên database đang chạy, không lấy từ tài liệu cũ.

---

## 0. Ngân hàng đang ở đâu

| Số đo | Giá trị |
|---|---|
| Câu hỏi | 1621 |
| Đã có dòng `question_taxonomy` | 1511 |
| Chưa phân loại | 110 (lớp luật hiện tại cũng chịu cả 110) |
| Cây câu hỏi (bỏ `sgk-*`) | 5 chủ đề · 24 chương · 102 mục · 112 mục con |
| Dòng thiếu tầng `section` | 336 |
| Dòng thiếu tầng `subsection` | 343 |
| Quan hệ cha–con sai | **0** |
| Trỏ tới id không tồn tại | **0** |

Cấu trúc cây thì lành. Cái hỏng là **nội dung phân loại**, và nó hỏng ở chỗ
không màn nào nhìn thấy:

| Lớp luật hiện tại nói gì về 1511 câu đã gắn | Số câu |
|---|---|
| Đồng ý với phân loại đang có | 956 |
| **Im lặng — không kiểm được** | **506** |
| Mâu thuẫn | 49 |

506 câu là vùng tối. Luật không xác nhận cũng không phản đối, nên sai ở đó
không ai biết. Và trong 49 câu "mâu thuẫn", phần lớn là **luật sai chứ không
phải người sai** — 7 câu quy hoạch tuyến tính lớp 10 bị đòi kéo sang giải tích
lớp 12 chỉ vì đề có chữ "giá trị lớn nhất".

Đó là lý do bộ luật này không sửa vài biểu thức chính quy, mà đổi mô hình.

---

## 1. Mô hình: bốn toạ độ, không phải một nhãn

Hiện tại mọi thứ bị nén vào một trục duy nhất — "câu này thuộc nhánh nào". Đó
là nguyên nhân gốc của hiệu ứng chương nam châm: một chương phải vừa mang nghĩa
"mạch kiến thức", vừa mang nghĩa "lớp", vừa đôi khi mang nghĩa "định dạng câu",
nên từ khoá của ba thứ khác nhau cùng đổ về một chỗ.

Một câu hỏi có **bốn toạ độ độc lập**:

| Toạ độ | Trả lời câu hỏi | Ví dụ |
|---|---|---|
| **Mạch** | Thuộc mảng toán nào | `giai-tich`, `luong-giac`, `day-so`, `to-hop`, `xac-suat`, `thong-ke`, `hhkg`, `toa-do-phang`, `toa-do-khong-gian`, `menh-de-tap-hop`, `mu-log` |
| **Đối tượng** | Câu hỏi thao tác trên vật gì | `ham-bac-hai`, `ham-luong-giac`, `ham-mu-log`, `ham-tong-quat`, `mau-ghep-nhom`, `mau-roi-rac`, `khoi-chop` |
| **Việc** | Phải làm gì với vật đó | `xet-don-dieu`, `tim-cuc-tri`, `tim-gtln-gtnn`, `tim-tiem-can`, `giai-phuong-trinh`, `tinh-the-tich`, `doc-do-thi` |
| **Lớp** | Học sinh phải học tới lớp nào mới làm được | `10` / `11` / `12` — **luôn luôn suy ra**, không bao giờ khai báo |

Ba toạ độ đầu quyết định **nhánh trong cây**. Toạ độ thứ tư quyết định **ai được
thấy câu này** và nó khớp bài học nào — và nó là thứ đang không tồn tại ở đâu cả
trong dữ liệu.

---

## 2. Luật nền

### A1 — Lớp là suy ra, không phải khai báo

> Lớp của một câu = **lớp cao nhất trong tất cả kiến thức mà câu đó bắt buộc
> phải dùng.**

Không phải lớp của chương nó đang nằm. Không phải lớp của bài học mà giáo viên
lấy đề từ đó. Không phải lớp ghi trong tên nguồn.

Đây chính là điều chủ dự án nêu: một câu "nhìn sơ tưởng lớp 10" nhưng để giải
được phải dùng kiến thức lớp 11 thì **nó là câu lớp 11**. Kiến thức là điều kiện
cần, và điều kiện cần thì lấy `max`, không lấy trung bình, không lấy cái xuất
hiện đầu tiên.

Bằng chứng trên ngân hàng thật — bản mẫu thang lớp quyết được 888/1621 câu
(54,8%), và trong 862 câu so được với nhãn lớp của chương:

| | Số câu |
|---|---|
| Chương và kiến thức khớp lớp | 772 |
| **Chương gán THẤP hơn kiến thức thật** | **29** |
| Chương gán CAO hơn kiến thức thật | 61 |

Ví dụ sống, trích nguyên văn:

- `Hàm số $y=-x^3+3x^2-4$ đồng biến trên tập hợp nào...` → đang nằm ở
  **Mệnh đề và tập hợp (Lớp 10)**. Nó vào đó vì đề có chữ *"tập hợp"*. Đây là
  câu xét đơn điệu bằng đạo hàm, **lớp 12**.
- `Cho hàm số $y=\log_3(x^2-2x+3)$. Hàm số đồng biến trên khoảng nào?` → đang
  nằm ở **Hàm số, đồ thị và ứng dụng (Lớp 10)**. Lôgarit là lớp 11, xét đơn điệu
  hàm hợp là lớp 12 → **lớp 12**.
- `Cho hàm số $y=f(x)$ có đồ thị như hình vẽ. Hàm số đồng biến trên khoảng nào?`
  → đang nằm ở **Hình học không gian Euclid (Lớp 11)**, vì chú thích hình viết
  *"[HÌNH: đồ thị hình chóp nhọn...]"*. Máy đọc thấy "hình chóp".

### A2 — Không chắc thì DỪNG NÔNG, không đoán sâu

Gợi ý tới tầng chủ đề là kết quả **hợp lệ**. Trả `null` là kết quả **hợp lệ**.
Đoán một chương cụ thể khi bằng chứng chỉ đủ cho chủ đề là tạo ra dữ liệu sai
trông như dữ liệu đúng — tệ hơn hẳn ô trống, vì ô trống thì còn thấy mà đi điền.

### A3 — Luật chỉ chọn nhánh có thật

Không tự sinh id, không ghép id, không suy id theo tên. Không khớp được nhánh
nào trong cây thì trả `null`.

### A4 — Hàng rào chỉ TỪ CHỐI, không sửa hộ

Khi luật thấy gợi ý (của AI hoặc của người) mâu thuẫn với bằng chứng hiển
nhiên, nó **bác bỏ** và đẩy câu về hàng đợi người duyệt. Nó không tự thay bằng
lựa chọn của mình. Sửa hộ là đoán thay, mà đoán chính là thứ đang hỏng.

### A5 — Một nguồn luật cho hai kho

Xem mục 9. Hôm nay hai bản đã lệch nhau ở **8 điểm** và cùng ghi vào một
Supabase.

---

## 3. Đọc đề: văn bản nào được tính

### B1 — Tách ba vùng, mỗi vùng có quyền khác nhau

| Vùng | Lấy từ đâu | Được đóng góp |
|---|---|---|
| **Thân đề** | `questions.content` sau khi gỡ chú thích hình | mạch, đối tượng, việc, lớp |
| **Các ý** | `answers.content` — **chỉ** khi `question_type ∈ {true_false, short_answer}` | mạch, đối tượng, việc, lớp |
| **Chú thích hình** | các khối `[HÌNH: ...]` trong `content`, và `tikz_code` | **chỉ đối tượng** |

Chú thích hình mô tả *bức tranh*, không mô tả *kiến thức*. Đo được: 54 câu có
khối `[HÌNH: ...]`; **10 câu** có từ khoá hình học (`hình chóp`, `parabol`,
`đường tròn`…) **chỉ nằm trong chú thích, không có trong đề**. Một trong số đó
đã bị xếp vào Hình học không gian Euclid vì chú thích viết "đồ thị hình chóp
nhọn" — trong khi đó là câu khảo sát hàm số.

Cấm dùng chữ trong chú thích hình để chọn **mạch**. Nó được phép xác nhận
**đối tượng** (một parabol vẽ ra đúng là hàm bậc hai), nhưng không bao giờ được
tự nó quyết định câu thuộc mảng nào.

### B2 — Phương án nhiễu của trắc nghiệm KHÔNG được ghép vào

Với `multiple_choice`, ba trong bốn phương án là **đáp án sai** và thường là
công thức của mạch khác, cố tình đặt vào để gây nhiễu. Ghép chúng vào là mời
chính cái bẫy của đề đi quyết định mạch.

Với `true_false` và `short_answer` thì ngược lại — các ý mang phần lớn từ khoá,
và đề bài nhiều khi chỉ là *"Cho hàm số $y=f(x)$ có đồ thị như hình vẽ."*. Đo
được: 86 câu có đề dưới 120 ký tự, ghép các ý vào làm số câu luật quyết được
tăng từ 114 lên 142.

> **Điểm mù đã biết, đã đo, và cố ý KHÔNG sửa (2026-09-08).** Ý **SAI** của câu
> Đúng/Sai cũng là bẫy, y như phương án nhiễu của trắc nghiệm. Ví dụ thật: đề
> `u_1=-1, u_{n+1}=u_n+3` là cấp số **cộng**, và ý đầu tiên viết *"Dãy số trên
> là một cấp số nhân"* — đánh dấu **SAI**. Luật ghép hết các ý vào, đọc thấy
> "cấp số nhân", và kết luận đây là câu cấp số nhân. Nó bị chính cái bẫy của đề
> lừa.
>
> Cách sửa hiển nhiên là chỉ ghép ý ĐÚNG. **Đã đo: không đáng.** Mâu thuẫn giảm
> 39 → 38, nhưng số câu luật quyết được cũng giảm 979 → 975, và 13 câu đổi kết
> quả. Lý do: rất nhiều ý SAI chỉ sai ở một con số (*"Số hạng thứ năm là 13"*)
> nhưng vẫn nói đúng chủ đề. Bỏ chúng là đổi một cái bẫy hiếm lấy bốn lần mất
> tín hiệu thật.
>
> Ghi lại ở đây để lần sau không ai phải đo lại.

### B2b — LỜI GIẢI cũng được đọc, cho mọi dạng câu (2026-09-10)

Ca dẫn tới luật này: một câu **cấp số cộng** bị xếp vào chương **Thống kê**. Đề
chỉ viết *"hàng thứ nhất trồng 10 cây, hàng sau ít hơn 1 cây"*; chữ "cấp số
cộng" nằm nguyên trong `solution`. Cả lớp luật lẫn prompt đều chỉ đọc `content`
— **hai tầng cùng mù một chỗ**, nên không tầng nào cứu được tầng nào.

| | |
|---|---|
| Luật trên đề | không kết luận được |
| Luật trên đề + lời giải | **Cấp số cộng** |

Đo trên ngân hàng: 1532/1621 câu có `solution`. Đọc thêm nó thì **159 câu** luật
đang chịu sẽ quyết được, và chỉ **6 câu** đổi kết luận. Chạy thử ngay sau khi
bật: nhóm chưa phân loại từ 110 xuống **73**, luật tự đề xuất được 37 câu mà
trước đó nó bó tay hoàn toàn.

**Khác các Ý ở chỗ nào.** Ý của trắc nghiệm là BẪY người ra đề cố ý đặt — nên
mục B2 cấm ghép chúng. Lời giải thì ngược lại: nó là lập luận ĐÚNG của chính
người soạn, tức câu trả lời trực tiếp cho "việc phải làm ở đây là gì" (mục C1).
Vì thế nó được đọc cho **mọi** dạng câu, kể cả `multiple_choice`.

**Rủi ro đã biết:** lời giải nói KỸ THUẬT, không phải chủ đề. Câu
`u_{n+1} = 4u_n - 1` có lời giải *"đặt $v_n$ ta có cấp số nhân"* — kỹ thuật đặt
ẩn phụ, còn câu thuộc mạch dãy số truy hồi. Đổi 159 lấy 6 là đáng, nhưng khi một
luật bắt oan, hãy nhìn cả lời giải chứ không chỉ đề.

Bốn bề mặt đều đã được nối: route exam-web, `classify-by-rules.mjs`, và cả hai
đường của question-bank. Lời giải cũng vào **prompt**, có nhãn `LỜI GIẢI:` riêng
và cắt ở 800 ký tự.

### B3 — Khớp theo TOKEN, không khớp theo chuỗi con

Đo được: **6 câu** chứa chuỗi `log` nhưng không liên quan lôgarit —
`kilogam`, `logo`, `logistic`. Mọi dấu hiệu từ vựng phải neo vào biên từ; mọi
dấu hiệu ký hiệu phải neo vào **dạng lệnh LaTeX** (`\log`, `\sin`), không phải
chuỗi trần.

### B4 — Mẫu phải được viết cho văn bản ĐÃ CHUẨN HOÁ, và phải có phép thử chứng minh nó còn sống

`normalizeQuestion` **xoá dấu hai chấm**. Nên mẫu loại trừ `/\(p\) ?:/` trong
`classify.ts` **không bao giờ khớp được** — trong khi có 7 câu viết `(P):` ở
văn bản thô. Một hàng rào chết mà không ai biết là hàng rào tệ hơn không có, vì
nó tạo cảm giác đã che.

**Đã sửa 2026-09-08** thành `/\(p\) ?y ?=/` và `/\(p\) có phương trình/`, viết
cho văn bản đã chuẩn hoá. Lượt chạy thử ngay sau đó xác nhận: câu
*"Cho $(P)$ có phương trình $y=x^2-3x+2$"* thôi không còn bị đòi chuyển sang
giải tích lớp 12.

Tương tự, cả **4 mẫu** của luật `Đạo hàm (quy tắc)` (`quy tắc tính đạo hàm`,
`đạo hàm cấp hai`, `ý nghĩa.*đạo hàm`, `đạo hàm của hàm số hợp`) khớp **0 câu**
trên toàn ngân hàng. Chương "Đạo hàm (Lớp 11)" đang có 0 câu — luật đó chưa
từng chạy lần nào.

> **Luật:** mỗi mẫu phải có một ca thử trong `classify.test.ts` với chuỗi đã đi
> qua đúng bộ chuẩn hoá của runtime. Mẫu khớp 0 câu **và** không có ca thử →
> coi là chết, phải xoá hoặc sửa.

### B5 — Bỏ tên nguồn trước khi đọc

Tiền tố `(THPT Lê Thánh Tông - HCM 2025)`, `(Mã 110 - 2017)`, `(Đề Tham Khảo -
2017)` là siêu dữ liệu, không phải nội dung. Chúng mang tên trường, tên tỉnh,
năm — toàn thứ có thể trùng từ khoá của mạch.

---

## 4. Xác định mạch

### C1 — VIỆC quyết định mạch, không phải ký hiệu xuất hiện

`\sin` trong một câu tìm giá trị lớn nhất **không** biến nó thành câu lượng
giác. `u_n` trong một câu cấp số nhân **không** biến nó thành câu tổ hợp.
`\log` trong `f'(x)=(x-4)^2\log x` **không** biến nó thành câu mũ–lôgarit.

Ký hiệu nói câu hỏi *nhắc tới* cái gì. Việc nói câu hỏi *bắt làm* cái gì. Phân
loại theo cái thứ hai.

### C2 — Danh sách từ CẤM dùng làm dấu hiệu đơn lẻ

Những từ này xuất hiện ở mọi mạch. Một mình chúng **không bao giờ** đủ để chọn
mạch; chúng chỉ được tính khi đi kèm ít nhất một dấu hiệu riêng của mạch.

`tập hợp` · `mệnh đề` · `đồ thị` · `hàm số` · `bảng` · `số liệu` ·
`giá trị lớn nhất` · `giá trị nhỏ nhất` · `khoảng` · `hình vẽ` · `đường cong` ·
`giá trị` · `tính` · `xác định`

`Mệnh đề nào sau đây đúng?` là **cách hỏi**, không phải chủ đề. Câu
`Hàm số $y=-x^3+3x^2-4$ đồng biến trên tập hợp nào` rơi vào Mệnh đề–Tập hợp
đúng vì vi phạm luật này.

### C3 — Loại trừ phải ĐỐI XỨNG

Nếu mạch A tự loại khi thấy dấu hiệu của mạch B, thì mạch B cũng phải tự loại
khi thấy dấu hiệu riêng của A. Hôm nay loại trừ đang một chiều ở nhiều chỗ:
`Hình học không gian` loại `tích phân`, nhưng `Nguyên hàm – Tích phân` không
loại gì cả; `Mũ – Logarit` loại `cực trị`, nhưng `Khảo sát hàm số` không loại
`phương trình mũ`.

Cách kiểm: dựng ma trận giữa các mạch, đánh dấu ô nào có loại trừ. Ma trận phải
đối xứng, hoặc phải có chú thích giải thích vì sao cố ý lệch.

**Đã bù một chiều 2026-09-08:** luật *Khảo sát hàm số* giờ loại trừ
`nguyên hàm` / `tích phân` / `\int` / `hình phẳng`, đối xứng với việc luật
*Hình học không gian* vốn đã loại `tích phân`. Trước đó câu *"diện tích $S$ của
hình phẳng giới hạn bởi **đồ thị** hàm số"* bị kéo khỏi chương Nguyên hàm –
Tích phân, nơi nó đang nằm đúng.

### Lượt chạy thử toàn ngân hàng — 2026-09-08

`npm run questions:classify-rules` (chạy thử, không ghi) trên 1621 câu:

| | Trước lượt sửa | Sau |
|---|---|---|
| Câu luật đòi sửa lại | 49 | **39** |
| …trong đó **luật sai**, người đúng | ~11 | **2** |
| Luật đồng ý / im lặng | 1462 | 1472 |
| Câu chưa phân loại luật thêm được | 0 | 0 |

Bốn lỗi luật tìm ra bằng cách soi từng nhóm trong 49 câu, không phải bằng cách
đọc code:

1. **Quy hoạch tuyến tính lớp 10 bị kéo sang giải tích lớp 12** — 7 câu. Chúng
   khớp `giá trị lớn nhất`, và luật không có gì để nói "đây là bài miền đa
   giác". Thêm loại trừ `miền nghiệm`, `hệ bất phương trình`, và `f(x y)` —
   hàm HAI BIẾN là dấu hiệu riêng của quy hoạch tuyến tính, giải tích THPT
   không có hàm hai biến.
2. **Mẫu `(P):` chết** — xem B4.
3. **Parabol hệ số bằng số** — `y = -4x^2 + 16x + 2025`. Mẫu cũ chỉ bắt dạng
   tổng quát `ax^2`.
4. **Thiếu loại trừ tích phân** — xem trên.

Lỗi số 3 có một bài học riêng. Bản đầu tôi viết `/\d+x\^2 ?[-+]/` trần, và nó
bắt luôn `y = -x^3 + 3x^2 + 2` — một hàm bậc **ba**, tức mạch giải tích. Phép
thử *"khớp được chủ đề có chữ Đ hoa"* đỏ ngay lượt chạy đầu. Bản đúng có thêm
`(?!.*x\^[3-9])`. Đây là lần đầu bộ test bắt được một luật sai trước khi nó
chạm dữ liệu — đúng việc nó sinh ra để làm.

**Hai câu luật vẫn sai, đã biết đích danh** (bẫy ý SAI, xem B2):
`ĐS.THVN.QTĐH.TSHV.TH.021` và `TK.TKLT.BTTH.BTTH.TH.001`. Cả hai bị đòi chuyển
sang *Cấp số nhân*; giữ nguyên ở *Dãy số*.

### ĐÃ GHI THẬT — 2026-09-08

Chủ dự án duyệt và cho chạy `--sua-sai --ghi`. **39 dòng đã đổi**, sao lưu ở
`.taxonomy-backup-2026-09-08T09-32-37-838Z.json`. Sau đó **2 dòng được trả về
chỗ cũ** đúng như đã báo trước khi chạy, nên kết quả thực là **37 câu đổi
chương**.

Hậu kiểm ngay sau khi ghi:

| | |
|---|---|
| Dòng `question_taxonomy` | 1511 |
| Sai quan hệ cha–con, hoặc trỏ tới id không tồn tại | **0** |
| Luật còn mâu thuẫn với dữ liệu | **0** (từ 39) |

**Xác nhận độc lập bằng thang lớp.** `grade-ladder.ts` không biết gì về bảng
luật chọn mạch — nó đọc đề bằng bộ dấu hiệu riêng. Trước và sau lượt ghi, so
với nhãn lớp của chương:

| | Trước | Sau |
|---|---|---|
| Khớp | 1061 | **1086** |
| Chương gán thấp hơn kiến thức thật | 51 | **26** |

Số câu "chương gán thấp hơn" giảm một nửa. Đây là bằng chứng mạnh hơn hẳn con
số "0 mâu thuẫn" ở trên: cái đó chỉ nói lớp luật đồng ý với chính nó, còn cái
này là một tầng luật khác, dựng độc lập, nhìn vào cùng dữ liệu và thấy nó hợp
lý hơn trước.

**Lùi lại** nếu cần: POST lại toàn bộ file sao lưu lên
`/rest/v1/question_taxonomy` với `Prefer: resolution=merge-duplicates`.

### C4b — Khớp NHẦM một nhánh nguy hiểm hơn không khớp nhánh nào

Ca thật, tìm ra 2026-09-10 khi chủ dự án chỉ vào một câu **cấp số cộng** bị xếp
vào **Thống kê**:

Luật `Giới hạn` dò `categoryHints: ['giới hạn', 'liên tục']`. Cây câu hỏi
**không có chương nào tên "Giới hạn"**. Chương duy nhất chứa chữ "liên tục" là
*"Thống kê **liên tục** (Bảng số liệu ghép nhóm - Lớp 11 + 12)"* — một chương
thống kê.

Nên hint khớp đúng **một** chương. `catMatches.length === 1`, luật tưởng mình
chắc chắn, và mọi câu có `\lim` bị đẩy vào chương thống kê. **6 câu giới hạn
đang nằm ở đó.**

Phần tệ nhất không phải 6 câu. Là chuyện `findRuleConflict` **bảo vệ** chỗ sai
đó: một gợi ý đúng ("Một số yếu tố giải tích") gửi lên sẽ bị chính hàng rào từ
chối, kèm lời giải thích nghe rất thuyết phục.

> **Luật:** hint không được dựa vào một TỪ có thể là con của tên nhánh khác.
> `'liên tục'` là con của "Thống kê liên tục"; `'tích phân'` là con của "Nguyên
> hàm. Tích phân" (may là cùng mạch); `'số'` thì là con của gần hết.
>
> Kiểm nhanh: với mỗi hint, in ra **tất cả** nhánh nó khớp. Khớp đúng một nhánh
> mà nhánh đó thuộc mạch khác thì đó không phải "chắc chắn", đó là trùng chữ.

Đã sửa: bỏ `'liên tục'`, giữ `'giới hạn'`. Không nhánh nào trong cây cũ mang tên
đó nên luật trả `null` — im lặng, đúng như thiết kế. Đo lại: 6 → **0**.

**Nợ taxonomy còn lại:** cây cũ không có chỗ cho mạch *giới hạn – hàm số liên
tục* (Lớp 11). 6 câu đó hiện không có nhà đúng.

### C4 — Nhập nhằng thì IM LẶNG

Khớp nhiều chương cùng lúc nghĩa là luật **không phân biệt được** — đó đúng là
lúc phải nhường người, không phải lúc lấy phần tử đầu mảng. Ngoại lệ duy nhất:
nhiều chương khớp nhưng chúng **cùng một chủ đề** → chủ đề vẫn chắc, chỉ chưa
rõ chương, nên trả về tới chủ đề.

### C5 — Định dạng câu KHÔNG phải mạch kiến thức

21 mục trong cây tên là `Bài tập tổng hợp (TN Đúng / Sai)`, đang chứa 44 câu.
Đó là *định dạng*, và định dạng đã có cột riêng: `questions.question_type`.

Lớp luật **không được** nhắm vào các nhánh này. Một câu Đúng/Sai về cấp số cộng
thuộc mạch cấp số cộng; việc nó là câu Đúng/Sai không đổi được điều đó.

### C6 — Cây `sgk-*` nằm ngoài phân loại câu hỏi

Ngân hàng phân loại theo cây cũ; cây `sgk-*` là của lý thuyết và `/learn`, và
đang có **0 câu hỏi**. Quyết định của chủ dự án 2026-09-04: giữ nguyên cả hai.
Mọi script và mọi lượt gợi ý phải lọc bỏ `sgk-*`, nếu không câu rơi vào nhánh
không màn nào bốc tới.

---

## 5. Thang lớp

Đây là phần mới, và là phần trả lời đúng yêu cầu của chủ dự án.

### D1 — Lớp của ĐỐI TƯỢNG

| Đối tượng | Lớp | Dấu hiệu chính |
|---|---|---|
| Mệnh đề, tập hợp và phép toán trên tập hợp | 10 | `phủ định của mệnh đề`, `tập con`, `phần bù`, `hợp/giao của hai tập` |
| Bất phương trình & hệ bpt bậc nhất hai ẩn, miền nghiệm | 10 | `miền nghiệm`, `bất phương trình bậc nhất hai ẩn` |
| Hàm số bậc hai, parabol, tam thức bậc hai — **đề lý thuyết** | 10 | `x^2` (không kèm bậc cao hơn, không nằm trong hàm khác), `parabol`, `tam thức`, `đỉnh I(` |
| Hàm số bậc hai — **đề thực tế** | 12 | như trên, cộng thêm dấu hiệu bối cảnh đời sống — xem D6 |
| Hệ thức lượng trong tam giác | 10 | `định lí sin`, `định lí cosin` |
| Vectơ và toạ độ trong **mặt phẳng**, ba đường conic | 10 | `tích vô hướng`, `phương trình đường thẳng/đường tròn`, `elip`, `hypebol` |
| Mẫu số liệu **rời rạc** | 10 | bảng tần số **không** ghép nhóm |
| Quy tắc đếm, hoán vị – chỉnh hợp – tổ hợp, nhị thức Newton | 10 | `hoán vị`, `chỉnh hợp`, `tổ hợp chập`, `nhị thức newton` |
| Góc lượng giác, giá trị & công thức lượng giác | 11 | `đường tròn lượng giác`, `giá trị lượng giác` |
| Hàm số lượng giác, phương trình lượng giác | 11 | `hàm số lượng giác`, `phương trình lượng giác` |
| Dãy số, cấp số cộng, cấp số nhân | 11 | `dãy số`, `cấp số`, `công sai`, `công bội` |
| Giới hạn, hàm số liên tục | 11 | `\lim`, `liên tục tại` |
| Luỹ thừa, lôgarit, hàm mũ, hàm lôgarit | 11 | `\log`, `\ln`, `logarit`, `hàm số mũ` |
| Đạo hàm: định nghĩa, quy tắc, cấp hai, tiếp tuyến | 11 | `đạo hàm`, `tiếp tuyến của đồ thị` |
| Quan hệ song song/vuông góc, hình chóp, lăng trụ, góc nhị diện | 11 | `hình chóp`, `lăng trụ`, `góc nhị diện`, `giao tuyến` |
| Mẫu số liệu **ghép nhóm** | 11 | `ghép nhóm` |
| Biến cố hợp/giao/độc lập, quy tắc cộng–nhân xác suất | 11 | `biến cố độc lập`, `biến cố đối` |
| Hàm số cho bằng **đồ thị / bảng biến thiên**, hoặc công thức bậc ba, hữu tỉ | 12 | `bảng biến thiên`, `y=ax^3+…`, `y=(ax+b)/(cx+d)` |
| Nguyên hàm, tích phân | 12 | `\int`, `nguyên hàm`, `tích phân` |
| Vectơ và toạ độ trong **không gian** `Oxyz`, mặt phẳng, đường thẳng, mặt cầu | 12 | `oxyz`, `phương trình mặt phẳng`, `mặt cầu` |
| Xác suất có điều kiện, công thức Bayes, sơ đồ hình cây | 12 | `xác suất có điều kiện`, `bayes` |
| Biến ngẫu nhiên rời rạc, kì vọng | 12 (chuyên đề) | `biến ngẫu nhiên rời rạc`, `kì vọng` |
| Lãi suất – vay nợ, quy hoạch tuyến tính | 12 (chuyên đề) | `lãi kép`, `quy hoạch tuyến tính` |
| Khối nón, khối trụ, khối cầu | **chờ chốt** | xem mục 11 |

### D2 — Lớp của VIỆC

| Việc | Lớp nền | Ghi chú |
|---|---|---|
| Nhận biết, đọc giá trị, thay số | = lớp của đối tượng | Việc này **không nâng lớp** |
| Giải phương trình / bất phương trình | = lớp của lớp hàm | bậc hai → 10, lượng giác → 11, mũ–lôgarit → 11 |
| Tính thể tích khối chóp, lăng trụ | 11 | |
| Xét đơn điệu, tìm cực trị, tìm GTLN–GTNN | 12 **khi phải dùng đạo hàm** | xem D3 — đây là ô hay sai nhất |
| Tìm tiệm cận, khảo sát và vẽ đồ thị | 12 | không có ở lớp dưới |
| Tính nguyên hàm, tích phân, thể tích bằng tích phân | 12 | |
| Tính xác suất theo định nghĩa cổ điển | 10 | |
| Tính xác suất có điều kiện | 12 | |

### D3 — Bảng CẶP: nơi lớp KHÔNG bằng `max` của hai thành phần

Đây là hạt nhân của "taxonomy phân cấp". **Cặp cụ thể nuốt các thành phần của
nó** — khi nhận ra được cặp, lớp lấy theo cặp, và hai dấu hiệu thành phần không
còn được tính riêng nữa.

| Đối tượng | Việc | Lớp | Vì sao |
|---|---|---|---|
| Hàm bậc hai **lý thuyết** | xét đơn điệu / tìm GTLN–GTNN | **10** | Đọc từ đỉnh parabol. SGK 10, bài *Hàm số bậc hai*. |
| Hàm bậc hai **thực tế** | mọi việc | **12** | Chủ dự án chốt 2026-09-08 — xem mục 11. Cùng công thức lớp 10, nhưng thuộc nhóm *ứng dụng… thực tiễn* của đề lớp 12. |
| `y = a·sin x + b`, `y = a·cos x + b` | tìm GTLN–GTNN | **11** | Chặn bằng `-1 ≤ sin x ≤ 1`. Không cần đạo hàm. |
| `y = sin x`, `y = cos x`, `y = tan x` (cơ bản) | xét đơn điệu trên một khoảng | **11** | Đọc từ đồ thị. SGK 11, bài *Hàm số lượng giác*. |
| `y = a^x`, `y = log_a x` (cơ bản) | xét đơn điệu | **11** | Suy từ cơ số. SGK 11. |
| Hàm **hợp** chứa lượng giác / mũ / lôgarit | xét đơn điệu, cực trị, GTLN–GTNN | **12** | Bắt buộc đạo hàm hàm hợp. Ví dụ `y = log_3(x²-2x+3)`. |
| Mẫu số liệu **rời rạc** | mọi số đặc trưng | **10** | |
| Mẫu số liệu **ghép nhóm** | số trung bình, trung vị, mốt, tứ phân vị | **11** | |
| Mẫu số liệu **ghép nhóm** | khoảng biến thiên, khoảng tứ phân vị, phương sai, độ lệch chuẩn | **12** | SGK 12, chương *Thống kê*. |

Ba dòng cuối là ví dụ đẹp nhất cho nguyên tắc: **`phương sai` một mình không
quyết được lớp nào cả.** Của mẫu rời rạc thì lớp 10, của mẫu ghép nhóm thì lớp
12. Chỉ có cặp mới quyết được. Ngân hàng hiện có một câu trung vị mẫu ghép nhóm
nằm trong chương "Thống kê rời rạc (Lớp 10)" — đúng lỗi này.

Quy mô của ô "đơn điệu / cực trị / GTLN–GTNN": **189 câu** mang một trong ba
việc đó. Trong đó **14 câu** có hàm lượng giác, **4 câu** có hàm mũ–lôgarit,
**2 câu** có hàm bậc hai, còn lại 169 câu là hàm tổng quát. Tức bảng cặp quyết
định lại lớp cho khoảng 20 câu — nhỏ, nhưng chúng đang nằm rải ở ba chương khác
nhau, và hôm nay chính chúng mâu thuẫn với nhau:

- `Giá trị nhỏ nhất của hàm số $y = 2\sin x + 5$` → **Lượng giác (Lớp 11)**
- `Giá trị lớn nhất và nhỏ nhất của $y = \sqrt{1+\sin x} - 3$` → **Một số yếu tố giải tích**

Cùng việc, cùng họ hàm, hai chương. Không có luật nào nói cái nào đúng. Bảng D3
là chỗ đặt câu trả lời đó **một lần**.

### D4 — Công thức tính lớp

```
lop(cau) = max( lop(u) : u ∈ DonViKienThuc(cau) )

DonViKienThuc(cau):
  1. đọc mọi dấu hiệu từ ba vùng văn bản (B1)
  2. ghép các cặp (đối tượng × việc) nhận ra được theo D3
  3. cặp NUỐT hai thành phần của nó — chúng không còn được tính riêng
  4. mỗi đơn vị còn lại mang lớp của nó theo D1/D2
```

Kết quả trả về phải kèm **bằng chứng**: từng đơn vị kiến thức, lấy từ vùng văn
bản nào, đóng góp lớp mấy. Không có bằng chứng thì khi sai, người ta đi sửa
từng dòng dữ liệu thay vì sửa luật — và lần chạy sau sai lại y hệt.

### D6 — Câu THỰC TẾ và câu LÝ THUYẾT là hai thứ khác nhau

Chủ dự án chốt 2026-09-08: **hàm bậc hai lý thuyết là lớp 10, hàm bậc hai thực
tế là lớp 12.** Cùng một đối tượng toán học, hai lớp — và cái phân biệt không
nằm ở công thức, cũng không nằm ở việc phải làm, mà ở chỗ đề có bối cảnh đời
sống hay không.

Điều đó khớp với chính cây taxonomy: có sẵn chương *"Ứng dụng đạo hàm để giải
quyết một số vấn đề liên quan đến thực tiễn"* với 80 câu, trong đó 67 là bài
toán kinh tế. Bài parabol ném bóng, cổng Arch, chi phí sản xuất dùng đúng công
thức lớp 10 nhưng được hỏi ở đề lớp 12.

**Ngưỡng bằng chứng: phải có CHỦ THỂ hoặc ĐẠI LƯỢNG đời sống. Đơn vị đo đơn
thuần KHÔNG tính.**

| Nhóm | Ví dụ dấu hiệu |
|---|---|
| Chủ thể | `một doanh nghiệp`, `một nhà máy`, `một trang trại`, `ông A dự định`, `vận động viên`, `người ta muốn`, `theo thống kê` |
| Kinh tế | `chi phí`, `doanh thu`, `lợi nhuận`, `giá bán`, `sản phẩm`, `triệu đồng`, `lãi suất` |
| Vật lí | `vận tốc`, `quãng đường`, `độ cao so với`, `nhiệt độ`, `chuyển động` |
| Đời sống | `dân số`, `diện tích mảnh/khu/rừng`, `thể tích bể/thùng`, `hàng rào` |

Vì sao đơn vị đo không được tính: *"Cho hình chóp $S.ABC$ có $SA = 3$ cm"* đầy
đơn vị mà vẫn là bài hình học thuần tuý. Lấy "có số kèm cm/m" làm dấu hiệu thì
mọi bài hình học đều thành bài thực tế. Ngược lại, *"Một doanh nghiệp sản xuất
$x$ sản phẩm"* không có đơn vị nào cũng đã là bài thực tế.

Đo trên ngân hàng: **29 câu hàm bậc hai thực tế → lớp 12**, phần còn lại là lý
thuyết. Rà tay cả 29 câu: không có câu nào bắt oan.

Luật này hiện **chỉ áp cho hàm bậc hai** — đúng phạm vi chủ dự án chốt. Hàm
`laCauThucTe()` được xuất ra để dùng lại, vì phép phân biệt này còn có ích cho
việc chọn mạch (cây đã có nhánh *thực tiễn* riêng), nhưng mở rộng sang mạch khác
là một quyết định mới, không phải hệ quả của quyết định này.

### D5 — Lớp suy ra được thì GHI, không suy được thì để trống

`null` nghĩa là **"chưa biết"**, không phải "lớp 12". Thang lớp hiện quyết được
54,8% ngân hàng. 45% còn lại phải để trống và chờ người, chứ không được điền
mặc định — điền mặc định là đúng nguyên nhân của lỗi `profiles.grade` mà
`AGENTS.md` đã ghi.

---

## 6. Ánh xạ vào cây thật

### E1 — Lớp KHÔNG phải một nhánh, và không được sửa bằng cách đổi tên chương

Hôm nay lớp bị nhét vào **tên chương**: `Lượng giác (Lớp 11)`,
`Tổ hợp và nhị thức Newton (Lớp 10 + 11)`,
`Thống kê liên tục (Bảng số liệu ghép nhóm - Lớp 11 + 12)`. 9/24 chương không có
nhãn lớp nào cả.

Hệ quả: **không truy vấn được theo lớp.** Muốn biết "câu này lớp mấy" phải đọc
tên chương bằng biểu thức chính quy — đúng cái mà không màn nào nên làm.

> **Đề xuất:** thêm cột `question_taxonomy.grade smallint null` cùng
> `grade_source text` (`'rule' | 'teacher'`). Chạy lại luật **không được** ghi
> đè giá trị có `grade_source='teacher'`.
>
> **Preflight bắt buộc trước khi thêm cột:** kiểm GRANT theo danh sách cột trên
> `question_taxonomy`. `AGENTS.md` ghi rõ bẫy này — thêm một cột vào câu
> INSERT/UPDATE mà chưa cấp quyền cho nó thì **cả câu lệnh** hỏng với
> `permission denied for table`, không chỉ cột đó. Đã xảy ra hai lần trên
> `exams` (`max_attempts` 2026-09-03, `grade` 2026-09-04).

Không đổi tên chương để mã hoá lớp. Đổi tên an toàn cho id, nhưng lớp vẫn không
truy vấn được — chỉ tốn công mà không giải quyết gì.

### E2 — Đi sâu tới đâu bằng chứng đỡ được tới đó

336 dòng chưa có `section`, 343 chưa có `subsection`. Đó **không phải khuyết
tật**. Lớp luật ra được tới tầng chương đã là phần khó nhất; tầng mục và mục con
mô tả *dạng bài*, thứ mà từ khoá trong đề thường không đủ để phân biệt.

Cấm điền tầng sâu bằng cách chọn mục đầu tiên của chương.

### E3 — Chương "mồ côi" thì bỏ qua

Chương mà chủ đề cha không có trong danh sách → không ghi. Ghi `category_id`
không kèm `topic_id` hợp lệ là để lại dữ liệu nửa vời mà mọi màn phải tự đoán.

---

## 7. Ghi dữ liệu

### F1 — Mặc định chạy thử

Mọi script phân loại hàng loạt mặc định **không ghi**. Phải có cờ tường minh
(`--ghi`) mới đụng database. Đang đúng ở `scripts/classify-by-rules.mjs`, giữ
nguyên.

### F2 — Ba phạm vi ghi, tách riêng vì rủi ro khác nhau

| Phạm vi | Điều kiện | Cần cờ |
|---|---|---|
| Câu **chưa** có dòng `question_taxonomy` | luật kết luận được | `--ghi` |
| Câu **đang có** phân loại mà hàng rào khẳng định sai | luật chắc chắn (≥2 dấu hiệu, hoặc 1 dấu hiệu ở tầng chương) | `--ghi --sua-sai` |
| Ghi đè tất cả | **không tồn tại** | — |

### F3 — Sao lưu trước, kể cả khi chỉ thêm

Không có bảng lịch sử cho `question_taxonomy`. 142 dòng thêm sai vẫn là 142 dòng
phải đi tìm tay nếu không có danh sách. Ghi file `.taxonomy-added-*.json` /
`.taxonomy-backup-*.json` trước khi POST.

### F4 — Lớp thay đổi thì BÁO, không tự ghi đè

Đổi mạch là sửa phân loại. Đổi **lớp** là đổi việc học sinh nào nhìn thấy câu
đó. Một lượt chạy luật không được tự làm việc thứ hai — nó xuất danh sách và
chờ duyệt.

### F5 — PostgREST cắt ở 1000 dòng và KHÔNG báo

Ngân hàng hơn 1600 câu. Mọi script đọc `questions`, `answers` hay
`question_taxonomy` một phát là im lặng mất một phần ba, và báo cáo trông vẫn
sạch. Luôn phân trang bằng header `Range`.

---

## 8. Bộ mẫu vàng — thứ đang thiếu hoàn toàn

`classify.test.ts` hiện chỉ kiểm chuỗi tự nghĩ ra. Không có phép thử nào chạy
trên câu thật, nên không có cách nào biết một lần sửa luật làm tốt lên hay xấu
đi. Đó là lý do luật đã siết ba lần mà vẫn còn 506 câu ở vùng tối.

> **Bắt buộc:** `fixtures/classify/golden.json` — tối thiểu **120 câu** đã được
> chủ dự án xác nhận nhãn bằng tay, chọn có chủ đích:
>
> - 20 câu mỗi mạch cho 4 mạch đông nhất (giải tích, lượng giác, toạ độ không
>   gian, thống kê);
> - **toàn bộ 29 câu** mà thang lớp nói chương đang gán thấp hơn kiến thức;
> - 15 câu ở ranh giới bảng D3 (`\sin` + GTLN, ghép nhóm + phương sai, bậc hai +
>   đơn điệu);
> - 10 câu mà chú thích hình mâu thuẫn với đề;
> - 10 câu `true_false` có đề dưới 120 ký tự.
>
> Không dùng dữ liệu học sinh; fixture chỉ chứa nội dung câu hỏi.

Mọi thay đổi bảng luật phải in ra: **đúng / sai / im lặng** trước và sau. Con số
"im lặng" tăng không phải lúc nào cũng xấu — im lặng đúng chỗ tốt hơn đoán sai.
Nhưng "sai" tăng thì phải quay lại.

---

## 9. Chống lệch giữa hai kho

`classify-rules.ts` bên question-bank tự nhận là "bản song sinh" của
`classify.ts`. **Hôm nay hai bản đã lệch ở 8 điểm:**

| # | exam-web | question-bank |
|---|---|---|
| 1 | Luật `Khảo sát hàm số` có `đồ thị`, `đường cong` trong `match` | Luật `Ứng dụng đạo hàm`, không có |
| 2 | Loại trừ lớp 10 (`parabol`, `tam thức`, `ax^2`) và lượng giác | Không có loại trừ nào |
| 3 | `categoryHints: ['yếu tố giải tích']` | `['giải tích', 'đạo hàm']` — đúng cái đã đo là gây 309 mâu thuẫn giả |
| 4 | Có luật riêng `Đạo hàm (quy tắc)` | Không có |
| 5 | `DAU_HIEU_DAY_SO` có thêm `u_(n+1)=` | Không có |
| 6 | `Hình học không gian` loại trừ `nguyên hàm`/`tích phân` | Không loại trừ |
| 7 | `Mũ – Logarit` loại trừ `cực trị`, `đạo hàm`, `đồng biến`… | Chỉ loại trừ cấp số |
| 8 | `findRuleConflict` dùng `suggestTopic` (từ chối khi hoà điểm) | Dùng `suggestTopics()[0]` — bản mà exam-web đã bỏ vì nó phản đối dựa trên gợi ý chính luật không dám đưa ra |

Thêm hai khác biệt về đầu vào:

- exam-web có `classificationText()` (ghép các ý cho `true_false`/`short_answer`);
  question-bank **không có** → cùng một câu Đúng/Sai cho ra hai kết quả khác
  nhau tuỳ mở app nào.
- exam-web chuẩn hoá bằng `normalizeQuestion` (xoá dấu câu, quy đồng nghĩa);
  question-bank dùng `normalizeForRules` rút gọn (**giữ** dấu câu).

> **Cơ chế đề xuất** — question-bank không có test runner, nên khoá phải đặt ở
> exam-web:
>
> 1. Tách bảng luật ra file dữ liệu thuần `src/lib/questions/classify-rules.data.ts`
>    (không import gì), commit **y hệt** ở cả hai kho.
> 2. `scripts/classify-rules-sync.mjs` với hai chế độ: `--check` (so hash, thoát
>    khác 0 khi lệch) và `--apply` (chép sang `../question-bank/`).
> 3. `classify.test.ts` chạy `--check` khi thư mục anh em tồn tại, bỏ qua khi
>    không.
>
> Không có cơ chế thì dòng chú thích "sửa một bên phải sửa cả bên kia" là lời
> hứa, và nó đã bị vi phạm 8 lần.

### Bốn bề mặt gọi phân loại, hôm nay được bảo vệ khác nhau

| Bề mặt | Luật chạy trước | Hàng rào chặn AI | Ghép các ý |
|---|---|---|---|
| `exam-web` `POST /api/admin/questions/classify` | có | có | **không** |
| `exam-web` `BulkTaxonomyDialog.tsx` | có nhưng **thiếu `categories`** → gần như chết | — | không |
| `question-bank` `taxonomy-suggestion-service.ts` | có | có | không |
| `question-bank` `ai-classification-service.ts` | **không** | **không** | không |

Hàng cuối là bề mặt nguy hiểm nhất: `classifyQuestionsBatch()` gọi thẳng
DeepSeek, không có tầng nào chặn trước và không có tầng nào kiểm sau. Nó được
dùng bởi `ExamComposer.tsx` và `UnclassifiedQuestions.tsx` — tức đúng đường đi
hàng loạt, đúng chỗ đã gắn nhiều dòng nhất.

Hàng thứ hai giải thích vì sao gợi ý trong hộp thoại hàng loạt kém: thiếu
`categories` thì phần lớn luật không khớp được với cây hiện tại, vì tên môn học
thật (`Cấp số cộng`, `Lượng giác (Lớp 11)`) nằm ở tầng **chương**, không phải
tầng chủ đề.

> **Luật:** mọi bề mặt sinh gợi ý phân loại phải đi qua **cùng một hàm**, nhận
> cùng một đầu vào (ba vùng văn bản của B1) và cùng một cây. Không có ngoại lệ
> "chỗ này chỉ gợi ý thôi" — gợi ý là thứ người ta bấm Áp dụng.

### Ba prompt, và cái gì được phép nằm trong đó

Có **ba** prompt phân loại chạy trên cùng ngân hàng: `classify-ai-prompt.ts`
bên exam-web, `taxonomy-suggestion-service.ts` (một câu) và
`ai-classification-service.ts` (theo lô) bên question-bank.

Đo 2026-09-08: **chỉ một trong ba** có dòng hướng dẫn "chữ trong đề quyết định,
không phải ký hiệu" — dù đó chính là mô tả của lỗi đã đếm được (112 câu cấp số
bị xếp sang tổ hợp / thống kê vì có `u_n` và luỹ thừa).

Đã sửa: đoạn hướng dẫn nằm trong hằng `HUONG_DAN_DOC_DE` **bên trong
`classify.ts`**, tức đi nhờ đúng khoá đồng bộ ở trên. Sửa một lần, ba prompt
cùng đổi, và không có đường nào để chúng lệch nhau trong im lặng. Thêm một phép
thử ở `classify-ai.test.ts` chặn nốt trường hợp ai đó dựng lại prompt mà quên
chèn — hỏng kiểu đó im lặng tuyệt đối, prompt vẫn chạy và vẫn trả JSON hợp lệ.

**Chỉ HAI điều được vào prompt**, và cả hai đều đã đo được là nguồn sai lớn:

| | |
|---|---|
| **A** | Chữ trong đề quyết định, không phải ký hiệu. `\sin` trong câu tìm GTLN không làm nó thành câu lượng giác. |
| **B** | Đề có bối cảnh đời sống thì ưu tiên nhánh *thực tiễn / kinh tế*. Đơn vị đo đơn thuần không tính. |

**Cái KHÔNG được vào prompt, và vì sao:**

- *Phần còn lại của bảng luật.* Nó được ép bằng code — `findRuleConflict` từ
  chối ở đầu ra. Ép bằng code chắc chắn hơn nhiều so với dặn model rồi hy vọng.
  Và luật đã quyết được câu nào thì câu đó không bao giờ đến tay model.
- *Thang lớp (D1–D3).* Model chọn **nhánh**, không chọn **lớp**. Đưa vào là dạy
  nó một việc nó không làm, đổi lấy prompt dài hơn cho mọi lô.

Giá phải trả: prompt exam-web dài 28 424 ký tự, đoạn hướng dẫn chiếm khoảng
3,5 %. Cây taxonomy vẫn là phần chiếm chỗ áp đảo.

### Ngân sách token — đo 2026-09-10

Sau khi thêm cả các Ý lẫn lời giải vào prompt, đo trên ngân hàng thật:

| Thành phần | Ký tự | Ước lượng token |
|---|---|---|
| Cây + luật + hướng dẫn (phần nền, có trong **mọi** lô) | 28 345 | 11 000 – 14 000 |
| Lô 10 câu thường | 31 553 | 13 000 – 16 000 |
| **Lô 10 câu nặng nhất** | **42 457** | **17 000 – 21 000** |

Model đang phục vụ là **`deepseek-v4-flash`**: **1 000 000 token vào**,
384 000 token ra. Lô nặng nhất dùng **~2 %** cửa sổ ngữ cảnh, tính theo ước
lượng bi quan nhất (2 ký tự/token).

**Không có nguy cơ tràn.** Kể cả nhét toàn bộ 1621 câu — đề + Ý + lời giải =
1 306 433 ký tự — vào một lời gọi cũng còn dưới trần; nhưng chuyện đó không xảy
ra vì `BATCH_SIZE = 10`.

Đầu ra mới là chỗ hẹp, và nó hẹp do **tự đặt** chứ không do API: question-bank
đặt `maxTokens: 4000` trong khi model cho 384 000. Ở 20 câu mỗi lô (trần của
`UnclassifiedQuestions`) × ~100 token/mục = ~2 000 token, còn biên gấp đôi.
`ExamComposer` chia lô 15 câu. An toàn, nhưng biên mỏng và con số 4000 không
còn lý do tồn tại.

### `deepseek-chat` đã quá hạn khai tử

Thông báo của DeepSeek: *"deepseek-chat & deepseek-reasoner will be fully
retired and inaccessible after Jul 24th, 2026, 15:59 (UTC). (Currently routing
to deepseek-v4-flash non-thinking/thinking.)"*

Hôm nay là **2026-09-10** — quá hạn **48 ngày**. Gọi thử: `deepseek-chat` vẫn
trả **200 OK**, nhưng trường `model` trong phản hồi ghi **`deepseek-flash`**.
Alias còn sống, ngoài cam kết.

**Điều dễ hiểu sai nhất:** model chấm bài **đã đổi rồi**, từ phía DeepSeek, im
lặng. Đổi tên trong code KHÔNG đổi thứ đang chạy — nó chỉ làm cái đang chạy trở
nên nhìn thấy được, và gỡ quả bom hẹn giờ khi alias tắt.

#### Đã đổi 2026-09-10

| Chỗ | Trước | Sau |
|---|---|---|
| `audit-config.ts` `DEFAULT_MODEL` | `deepseek-chat` | `deepseek-v4-flash` |
| `audit/start/route.ts` fallback | `deepseek-chat` | `deepseek-v4-flash` |
| `question-bank/src-tauri/src/lib.rs` | `deepseek-chat` | `deepseek-v4-flash` |
| `model-allowlist.ts` (chấm bài) | `chat`, `reasoner` | **thêm** `v4-flash`, `v4-pro`; giữ hai tên cũ |
| Giá ở 3 file provider | $0,14 / $0,28 mỗi 1M | **$0,44 / $1,32** |

**Vì sao GIỮ hai tên cũ trong allowlist.** `.env` đang đặt
`DEEPSEEK_MODEL=deepseek-chat` và `ESSAY_AI_AUTO_FINALIZE=true`. Gỡ ngay là
pipeline chấm bài fail-closed (`ProviderError`) cho tới khi ai đó sửa `.env` —
đúng lúc học sinh đang nộp bài. **Việc còn lại của chủ dự án:** đổi dòng đó
thành `DEEPSEEK_MODEL=deepseek-v4-flash`, rồi mới xoá hai tên cũ khỏi allowlist.

**Bảng giá sai không chỉ là hiển thị.** `grading-provider.ts` nuôi trần chi phí
tháng (`monthlyCostCapUsd`, `essay_ai_month_to_date_cost`). Ước thấp 3–4,7 lần
nghĩa là trần 10 USD thực chất cho tiêu tới ~40 USD trước khi nó chặn.

**`deepseek-v4-pro` được thêm vào allowlist nhưng CHƯA benchmark cho việc chấm
bài.** Allowlist là danh sách "được phép", không phải "được khuyến nghị" — đúng
tinh thần khối chú thích có sẵn trong file.

**Giới hạn còn lại:** question-bank đóng cứng tên model ở tầng **Rust**, nên
phía JS không chọn được model theo từng việc, và đổi là phải build lại app.

### Đi tìm hàng cuối thì thấy thêm một lỗi lớn hơn (2026-09-08)

`classifyQuestionsBatch()` không chỉ thiếu hàng rào. **Prompt nó gửi đi hầu như
trống rỗng về cấu trúc.**

`getTaxonomyTree()` bên question-bank trả về cây **bọc**:

```
[{ topic, categories: [{ category, sections: [{ section, subsections }] }] }]
```

Nút thật nằm *trong* lớp bọc ở ba tầng đầu. `formatTaxonomyForPrompt` lại đọc
`topic.name` ngay trên lớp bọc — mà lớp bọc không có `name`, cũng không có `id`.

Dựng lại bằng cây thật và đếm: **prompt chứa 620 lần chuỗi `undefined`**. Model
nhận đúng một danh sách phẳng 112 tên mục con, không biết chủ đề nào, chương
nào, mục nào. Nó phân loại mù cấu trúc — trong khi cả bộ luật này nói rằng cấu
trúc mới là thứ quyết định.

Lỗi im lặng tuyệt đối vì `fillParentIds` dựng lại tổ tiên từ `subsectionId` sau
đó, nên kết quả trả ra trông vẫn đủ bốn tầng. `taxonomy-suggestion-service.ts`
ngay bên cạnh bóc tách **đúng** — nên chỉ đường theo lô hỏng, và đó đúng là
đường dùng để gắn hàng loạt.

Đây là ứng viên số một cho câu hỏi "vì sao phân loại sai nhiều thế".

---

## 9b. Lượt quét đối chiếu ba nguồn — 2026-09-10

`scripts/classify-scan-ai.mjs` hỏi AI về **mọi** câu (kể cả câu luật đã quyết)
rồi so ba nguồn độc lập: **DB · LUẬT · AI**. Hỏi cả câu luật đã quyết là cố ý —
ở một lượt rà soát, hai ý kiến độc lập trùng nhau mới là bằng chứng.

**Script không có cờ ghi và không có đường ghi nào.**

### Lượt chạy dừng giữa chừng vì hết tiền API

64/163 lô chạy được, rồi DeepSeek trả `402 Insufficient Balance` cho 99 lô còn
lại. Số dư sau đó: **−0,12 USD**, `is_available: false`. Đã tiêu 3,26 USD cho
938 933 token vào và 510 925 token ra.

Nên **632/1621 câu (39%) được quét**; 989 câu còn lại không có ý kiến của AI, và
trong bảng dưới chúng nằm lẫn ở ô 6. Muốn quét nốt thì nạp tiền rồi chạy lại.

### Kết quả trên 632 câu quét được

| | Số câu | |
|---|---|---|
| 1. Ba nguồn TRÙNG (DB = luật = AI) | 390 | chắc nhất |
| 2. **Luật + AI trùng nhau, KHÁC DB** | **20** | ứng viên sửa mạnh nhất |
| 3. Luật và AI ĐÁ NHAU | 21 | cần người đọc |
| 4. Luật chịu, AI xác nhận DB | 185 | |
| 5. Luật chịu, AI khác DB | 13 | chỉ một ý kiến |
| 6. AI chịu (gần hết là 989 câu lô hỏng) | 993 | |

### Ô 2 — hai nguồn độc lập cùng nói DB sai

**15/20 câu đang nằm ở "Tổ hợp và nhị thức Newton" thực chất là bài cấp số** —
Aladin ba điều ước, tổng `1 + 3 + 3² + …`, tháp 9 tầng, hội trường 10 dãy ghế,
bàn cờ hạt dẻ, dây bungee, hình vuông lồng nhau, tổ ong, tổng 100 số lẻ đầu.
Đây là bài toán tổng cấp số kinh điển, không phải bài đếm.

Một câu ngược lại đáng chú ý: *"Lớp 10A có 45 học sinh, 25 giỏi Toán, 23 giỏi
Lý…"* đang nằm ở **Cấp số nhân**, cả luật lẫn AI đều nói là **Mệnh đề và tập
hợp** — bài bao hàm–loại trừ.

### Ô 3 — chỗ hai tầng đá nhau, và vì sao đáng đọc

Hai nhóm, hai nguyên nhân khác hẳn:

- **6 câu đọc đồ thị**: luật nói *Một số yếu tố giải tích* (lớp 12), AI nói
  *Hàm số, đồ thị và ứng dụng (Lớp 10)*. Đây đúng ranh giới lớp 10 / lớp 12 mà
  mục 11 đang treo — không phải lỗi của bên nào.
- **2 câu mở đầu bằng "Mệnh đề nào dưới đây sai?"**: AI chọn *Mệnh đề và tập
  hợp*, luật chọn *Lượng giác (Lớp 11)* từ các Ý. **Luật đúng, AI sai** — nó
  vấp đúng từ nam châm mà mục C2 cấm dùng làm dấu hiệu đơn lẻ. Bằng chứng cho
  thấy hàng rào luật vẫn cần thiết kể cả với model mạnh hơn.

## 9c. Đọc tay nốt nhóm luật bó tay — 2026-09-12

Tài khoản DeepSeek hết tiền, nên nhóm cuối được đọc **bằng mắt** thay vì hỏi
model. Hoá ra rẻ hơn nhiều so với tưởng: sau khi lớp luật biết đọc lời giải,
nhóm "chưa gắn VÀ luật bó tay" chỉ còn **73 câu** — khoảng 33 000 token, tức
một phần rất nhỏ ngân sách của một phiên làm việc.

### Kết quả

| | |
|---|---|
| Trước | 110 câu chưa phân loại |
| Luật tự quyết (nhờ đọc lời giải) | 37 |
| Đọc tay | 72 |
| Cố ý bỏ lại | 1 |
| **Sau** | **1620/1621 câu đã có phân loại · 0 dòng sai quan hệ cha–con** |

Trong 72 câu đọc tay: **68 câu cùng một loại** — bài toán thực tiễn giải bằng
đạo hàm (tối ưu chi phí, quãng đường ngắn nhất, thể tích lớn nhất, tốc độ thay
đổi, đồ thị hàm phân thức bậc hai trên bậc nhất). Bốn ngoại lệ, mỗi câu ghi lý
do ngay trong `scripts/classify-manual-apply.mjs`.

### Vì sao luật bó tay trước cả 68 câu — và đừng đi "sửa" nó

Đề của chúng nói về **cá diêu hồng, bể nước, hàng rào hình chữ E, máy bay, huyết
áp, thang dựa tường**. Không có một từ khoá toán học nào để luật bám vào; chữ
"đạo hàm" chỉ xuất hiện trong lời giải, và ngay cả ở đó cũng thường là ký hiệu
`f'(x)` chứ không phải chữ.

Đây là **giới hạn thật của phương pháp từ khoá**, không phải lỗi cấu hình. Siết
thêm luật để bắt nhóm này nghĩa là lấy `\sqrt`, `x^2`, "lớn nhất" làm dấu hiệu —
đúng những từ nam châm mà mục C2 cấm. Nhóm này thuộc về người đọc, hoặc về AI.

### Câu bị cố ý bỏ lại

`test-123`, nội dung đúng bằng chuỗi *"Updated test"* — rác còn sót từ một lần
thử. Gán phân loại cho nó là làm rác trông như dữ liệu thật. **Cần XOÁ**, và xoá
không phải việc của script phân loại.

## 9d. Rà nốt 988 câu AI chưa chạm — 2026-09-12

Tài khoản DeepSeek hết tiền sau 632/1621 câu. 988 câu còn lại rà bằng người,
nhưng **không đọc cả 988** — đọc hết là lãng phí, và cũng không phải chỗ rủi ro.

### Chia theo phán quyết của LUẬT trước khi đọc

| | Số câu | |
|---|---|---|
| Luật ĐỒNG Ý với DB | 625 | hai nguồn đã khớp |
| Luật MÂU THUẪN với DB | 27 | đã biết, nằm trong 54 câu `--sua-sai` |
| **Luật IM LẶNG** | **336** | chỉ mình DB nói — vùng tối thật |

### Phép kiểm độc lập: "câu này có giống chỗ nó đang đứng không?"

Lớp luật hỏi *"câu này thuộc mạch nào"*. Phép kiểm này hỏi một câu **khác**:
*"câu này có mang dấu hiệu nào của chính chương nó đang nằm không?"* Hai câu hỏi
khác nhau, nên nó bắt được cả những chỗ **luật và DB cùng sai** — thứ mà so
luật với DB không bao giờ thấy.

Chạy trên toàn bộ 1620 câu đã phân loại → **59 câu** bị gắn cờ (23 + 36). Người
đọc 59 câu đó, không đọc 1561 câu còn lại.

### Kết quả: 33 câu nằm sai chương

Một mẫu áp đảo: **chương "Tổ hợp và nhị thức Newton" đang giữ 10 bài CẤP SỐ** —
Aladin gấp đôi điều ước, tổng `1+3+3²+…`, tháp 9 tầng, hội trường 10 dãy ghế,
bàn cờ hạt dẻ, dây bungee, tổ ong. Chúng là bài tính TỔNG cấp số, không phải
bài đếm. Điều này khớp với lượt quét AI hôm 2026-09-10, nơi luật và AI cũng
cùng chỉ vào nhóm này.

Chiều ngược lại: **"Cấp số nhân" đang giữ hai bài bao hàm–loại trừ** ("lớp 10A
có 45 học sinh, 25 em giỏi Toán, 11 em giỏi cả Toán và Lý…").

Và ba câu **giới hạn – tiệm cận** nằm trong chương **Thống kê** — di chứng của
lỗi hint `'liên tục'` đã sửa ở mục C4b.

### Bài học: phép kiểm sai vì một dấu chéo ngược

Bản đầu của phép kiểm viết mẫu `/\sin/` — **một** dấu chéo. Trong regex `\s` là
khoảng trắng, nên nó dò `" in"` chứ không dò `\sin`, và **40 câu lượng giác đúng
chỗ bị gắn cờ oan**. Sau khi sửa thành `/\\sin/`: 74 câu đáng ngờ còn 36.

Đúng cái bẫy mục B3 nói — ký hiệu LaTeX phải neo vào dạng lệnh — nhưng lần này
mắc ở công cụ kiểm chứ không ở bảng luật. Bài học: **thử mẫu trên văn bản thật
trước khi tin kết quả của nó**, kể cả khi mẫu chỉ dùng một lần.

### Nhóm thứ hai bị gắn cờ oan, và vì sao

40 câu lượng giác + nhiều câu tập hợp bị gắn cờ vì **đề trắc nghiệm quá ngắn**:
*"Đẳng thức nào sau đây sai?"* — công thức nằm trong phương án, mà phương án
trắc nghiệm thì mục B2 cấm đọc. Đã thêm ngưỡng: không phán câu có dưới 120 ký
tự sau chuẩn hoá. Đây là giới hạn thật của B2, không phải lỗi.

## 10. Việc phải làm để thi hành bộ luật này

Theo thứ tự, mỗi bước tự đứng được:

1. ~~**Bịt lỗ không có hàng rào.**~~ **XONG 2026-09-08.**
   `ai-classification-service.ts` giờ chạy `findRuleConflict` trên từng kết quả
   và từ chối cái nào mâu thuẫn; số bị từ chối hiện ra trong màn xem trước của
   `UnclassifiedQuestions.tsx` chứ không nuốt im. Cùng lượt sửa luôn lỗi prompt
   `undefined` (mục 9) và lọc `sgk-*`.

   Luật **không** chạy trước ở bề mặt này, và đó là chủ ý: cả luồng khoá theo
   `subsectionId`, mà luật chỉ ra tới tầng chương — trả kết quả nông sẽ hiện
   "Unknown" ở ba cột. Ở đây luật đóng vai hàng rào, không đóng vai bộ lọc.

2. ~~**Sửa `BulkTaxonomyDialog.tsx`** truyền `categories`.~~ **XONG 2026-09-08**,
   theo cách mạnh hơn: hộp thoại không còn tự chạy luật ở client. Chế độ "Gợi ý
   theo luật" gọi chung `POST /api/admin/questions/classify` với cờ `rulesOnly`,
   nên nó dùng đúng văn bản (có các Ý) và đúng cây (đã lọc `sgk-*`) như chế độ
   AI. Bề mặt thứ hai trong bảng trên bị **xoá**, không phải vá.

   Đo trên 1621 câu:

   | | Luật quyết được | Ra tới tầng chương |
   |---|---|---|
   | Hộp thoại cũ (thiếu `categories`) | 531 | **0** |
   | Route cũ (chưa ghép Ý, cây đầy đủ) | 703 | 703 |
   | Bản mới | **1005** | **1005** |

3. ~~**Đồng bộ hai bản luật**~~ **XONG 2026-09-08.** `exam-web` giữ bản gốc;
   `scripts/classify-rules-sync.mjs --apply` sinh bản question-bank vào
   `src/services/generated/`, và `classify.test.ts` chạy `--check` mỗi lần test
   (tự bỏ qua khi không có kho anh em). Cả `normalize.ts` cũng được đồng bộ —
   chép luật mà không chép bộ chuẩn hoá thì cùng bảng luật vẫn cho hai kết quả.

   `npm run questions:classify-sync` để kiểm, thêm `:apply` để ghi.

4. **Dựng bộ mẫu vàng** (mục 8) trước khi sửa thêm bất kỳ biểu thức nào — không
   có nó thì không đo được sửa đúng hay sai. *Cần chủ dự án xác nhận nhãn.*
5. **Thi công B1** (ba vùng văn bản) và **B3/B4** (token, mẫu phải sống).
   *Phần B1, B2, B3 và B5 đã xong bên trong `grade-ladder.ts` ở bước 6; còn phải
   đưa cùng cách đọc đó sang lớp luật chọn mạch (`classify.ts`), và dựng phép
   thử "mẫu phải sống" cho B4.*
6. ~~**Thi công thang lớp** D1–D4~~ **XONG 2026-09-08.**
   `src/lib/questions/grade-ladder.ts` — ba bảng D1/D2/D3, tách ba vùng văn bản,
   khớp theo token, và trả về `{ grade, units, uncertain, notes }`. 15 phép thử
   trong `grade-ladder.test.ts`, lấy câu nguyên văn từ ngân hàng.

   **Chưa ghi gì.** `scripts/grade-ladder-report.mjs` chạy nó trên toàn ngân
   hàng và chỉ in ra; script cố ý không có cờ `--ghi`.

   Đo lần đầu (2026-09-08):

   | | |
   |---|---|
   | Thang lớp quyết được | **1240 / 1621 (76,5 %)** — lớp 10: 130 · lớp 11: 396 · lớp 12: 714 |
   | Máy tự nhận chưa chắc | 294 |
   | Khớp nhãn lớp của chương | 1041 / 1189 |
   | **Chương gán THẤP hơn kiến thức thật** | **48** |
   | Chương gán CAO hơn kiến thức thật | 100 |

   Ba luật hoá ra quan trọng hơn dự tính, cả ba tìm ra khi đối chiếu với ngân
   hàng thật chứ không phải khi viết bảng:

   - **`bảng biến thiên` không phải dấu hiệu lớp 12.** SGK 10 lập bảng biến
     thiên cho parabol ngay trong bài Hàm số bậc hai.
   - **Loại trừ là phát biểu về CẢ CÂU, không phải về một vùng.** Một câu mở đầu
     "Cho hàm số bậc hai $y=ax^2+bx+c$…" có một Ý nhắc bảng biến thiên: xét loại
     trừ theo từng vùng thì vùng Ý không thấy chữ "bậc hai" ở đề và vẫn kết luận
     lớp 12.
   - **Quy hoạch tuyến tính cần một cặp riêng.** "Tìm GTLN của $F = x-y+2024$
     trên miền nghiệm của hệ bất phương trình" là bài lớp 10 — xét giá trị tại
     các đỉnh của miền đa giác, không có đạo hàm nào. Thiếu cặp
     `(bpt-bac-nhat-hai-an × tim-gtln-gtnn) = 10` thì 6 câu lớp 10 bị đẩy lên
     lớp 12, và lớp luật chọn mạch cũng mắc đúng lỗi đó.

   Và một luật về sự trung thực: **chỉ bắt được VIỆC mà không bắt được ĐỐI TƯỢNG
   nào thì đánh dấu `uncertain`.** Cả bảng D3 nói rằng đối tượng mới là thứ quyết
   định lớp; "tìm giá trị lớn nhất" đứng một mình có thể là parabol lớp 10, đọc
   đồ thị lớp 10, hay đạo hàm lớp 12. Đó là phần lớn trong 294 câu "chưa chắc" —
   danh sách này là kết quả có ích, không phải thất bại.

7. **Thêm cột `question_taxonomy.grade` + `grade_source`** và ghi. Đã có đủ
   quyết định để làm (mục 11), nhưng phải theo đúng hai ràng buộc ở đó: chưa
   màn học sinh nào được đọc cột này, và `grade_source='teacher'` không bao giờ
   bị lượt chạy sau ghi đè. **Preflight bắt buộc:** kiểm GRANT theo danh sách
   cột trên `question_taxonomy` trước khi thêm — xem mục E1.
8. **Hàng đợi duyệt cho 294 câu "chưa chắc"**. Chủ dự án chọn duyệt từng câu chứ
   không đặt luật chung, nên chỗ lưu quyết định là việc bắt buộc, không phải
   tuỳ chọn — hiện chưa có.
9. Rà lại 506 câu vùng tối bằng luật đã siết.

### Lệnh

```bash
npm run questions:classify-sync           # hai kho có lệch không
node --env-file=.env --experimental-strip-types scripts/grade-ladder-report.mjs
node --env-file=.env --experimental-strip-types scripts/grade-ladder-report.mjs --lech
node --env-file=.env --experimental-strip-types scripts/grade-ladder-report.mjs --can-xem
```

Thêm `--csv <file>` để xuất toàn bộ phán quyết kèm bằng chứng ra Excel.

---

## 11. Quyết định của chủ dự án

### Đã chốt 2026-09-08

**Mục đích của lớp suy ra: cả hai, nhưng làm công cụ soạn đề TRƯỚC.**

Thi công như công cụ cho giáo viên, chạy vài tháng cho tin được, rồi mới nối vào
đường lọc đề của học sinh. Hệ quả cho code, không phải chuyện văn phong:

- Cột `question_taxonomy.grade` được phép thêm và ghi, nhưng **không màn học
  sinh nào được đọc nó** cho tới khi có quyết định thứ hai. `AssessmentListPage`
  vẫn lọc bằng `exams.grade` như cũ.
- Ở giai đoạn này sai một câu là thầy sửa tay. Ở giai đoạn sau, sai một câu là
  học sinh mất quyền thi — nên **đừng viết code giả định giai đoạn một sẽ kéo
  dài**. Mọi đường ghi phải giữ `grade_source` để lúc siết còn phân biệt được
  câu nào do máy suy, câu nào do người chốt.

**`y = \sqrt{1+\sin x}` và các hàm hợp lượng giác: KHÔNG có luật chung — thầy
duyệt từng câu.**

Đây là quyết định *không* đặt thêm luật, và nó hợp lý: 42 câu không đủ nhiều để
bù rủi ro của một luật sai hàng loạt. Máy giữ nguyên cách làm hiện tại — không
nhận ra dạng đơn giản thì giữ lớp cao và đánh dấu `uncertain`.

> **Việc phải làm:** cột `chua_chac` trong CSV của `grade-ladder-report.mjs` là
> hàng đợi duyệt của thầy. Nó phải giữ được quyết định — chưa có chỗ lưu, nên
> đây là lý do thứ hai để cột `grade_source` tồn tại: `'teacher'` không bao giờ
> bị lượt chạy sau ghi đè.

**Hàm bậc hai: LÝ THUYẾT là lớp 10, THỰC TẾ là lớp 12.**

Chốt sau, thay bản chốt đầu tiên cùng ngày ("xét đơn điệu hàm bậc hai là lớp
12"). Bản đầu lấy **việc phải làm** làm chỗ phân biệt; bản này lấy **bối cảnh
của đề**, và nó đúng hơn — xem D6. Một câu hỏi trục đối xứng của parabol là lớp
10 dù việc gì; một câu chi phí sản xuất dùng parabol là lớp 12 dù việc gì.

Thi công: đối tượng `ham-bac-hai` đổi hẳn **mã** thành `ham-bac-hai-thuc-te`
(lớp 12) khi bắt được bối cảnh đời sống. Mã mới không khớp hai cặp bậc hai trong
D3 (vốn giữ chúng ở lớp 10) nên `max` tự cho ra 12, không cần ngoại lệ nào trong
vòng ghép cặp. Bằng chứng in ra cho người duyệt ghi thẳng
`ham-bac-hai-thuc-te=12`, đọc là hiểu ngay.

Đo lại sau mỗi lần chốt — độ khớp với nhãn lớp của chương:

| Luật về hàm bậc hai | Khớp | Chương gán cao hơn |
|---|---|---|
| D3 bản nháp (luôn lớp 10) | 1041 | 100 |
| Chốt lần một (đơn điệu → 12) | 1051 | 86 |
| **Chốt lần hai (thực tế → 12)** | **1061** | **77** |

Ba lần đo trên cùng một ngân hàng, cùng mọi luật khác. Cách phân biệt theo bối
cảnh khớp dữ liệu thật tốt hơn cả hai cách trước.

**Tổ hợp và nhị thức Newton: LỚP 10.** Đúng như D1 bản nháp (KNTT 2018). Tên
chương ghi "(Lớp 10 + 11)" nhưng thang lớp lấy 10.

### Còn treo

1. **Khối nón / trụ / cầu** — chưa có trong D1, nên không đóng góp gì vào thang
   lớp. Cần biết KNTT 2018 xếp lớp mấy.
2. **Luật thực tế/lý thuyết có mở sang mạch khác không?** Hiện chỉ áp cho hàm
   bậc hai, đúng phạm vi đã chốt. Nhưng cùng lý lẽ thì một bài lãi suất dùng cấp
   số nhân, hay một bài tối ưu dùng đạo hàm, cũng thuộc nhóm *thực tiễn*. Hàm
   `laCauThucTe()` đã sẵn sàng dùng lại; mở rộng là một quyết định mới.

*(Mục "GTLN–GTNN của hàm bậc hai" đã tự đóng: luật thực tế/lý thuyết không phân
biệt theo việc, nên nó áp cho mọi việc.)*
