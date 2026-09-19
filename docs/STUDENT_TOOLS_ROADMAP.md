# Lộ trình công cụ học tập cho học sinh

Nghiên cứu ngày 2026-09-13, sau khi công cụ đầu tiên (vẽ miền nghiệm hệ bất
phương trình, commit `06e1641`) lên production. Mục tiêu của chủ dự án: thêm
công cụ Toán để **thu hút học sinh**.

Tài liệu này trả lời ba câu: làm công cụ nào, theo thứ tự nào, và làm thế nào
để công cụ giúp học sinh HỌC thay vì chỉ lấy đáp án.

## Trạng thái

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 1 | Cây xác suất & Bayes · Ghép nhóm · "Tự làm" cho miền nghiệm | ✅ xong 2026-09-14 (mục 7) |
| 2 | Khảo sát hàm số · Tích phân | ✅ xong — khảo sát hàm số 2026-09-15 (mục 8) · tích phân 2026-09-18 (mục 9) |
| 3 | Oxyz xoay được · Đường tròn lượng giác | Oxyz ✅ 2026-09-19 (mục 10) · đường tròn lượng giác chưa làm |

---

## 1. Dữ liệu: học sinh sẽ gặp gì trong đề, và ngân hàng đang có gì

### 1.1. Ma trận đề tốt nghiệp THPT môn Toán (theo đề chính thức 2025)

Nguồn: [mathvn.com — ma trận đề](https://www.mathvn.com/2026/02/ma-tran-e-thi-tot-nghiep-thpt-mon-toan.html).
Đề có ba phần: I trắc nghiệm 12 câu, II đúng/sai 4 câu (16 ý), III trả lời
ngắn 6 câu; đề tăng yếu tố vận dụng thực tiễn
([xaydungchinhsach.chinhphu.vn](https://xaydungchinhsach.chinhphu.vn/cau-truc-de-thi-tot-nghiep-thpt-tu-nam-2025-119240308200554932.htm)).

| Nội dung | Phần I | Phần II | Phần III | Tổng |
|---|---|---|---|---|
| Hình toạ độ Oxyz (L12) | 3 | 1 | – | **4** |
| Nguyên hàm – tích phân (L12) | 2 | 1 | 1 | **4** |
| Khảo sát / ứng dụng đạo hàm (L12) | 1 | 1 | 1 | **3** |
| Hình học không gian (L11) | 2 | – | 1 | **3** |
| Xác suất có điều kiện (L12) | – | 1 | – | 1 (4 ý) |
| Xác suất cổ điển (L11) | – | – | 1 | 1 |
| Tổ hợp (L10) | – | – | 1 | 1 |
| **BPT bậc nhất hai ẩn (L10)** | – | – | 1 | 1 ← đã có công cụ |
| Lượng giác, cấp số, mũ–log, thống kê (L11) | 1 mỗi loại | – | – | 4 |

### 1.2. Ngân hàng câu hỏi hiện có (đếm ngày 2026-09-13, 1620 câu đã phân loại)

| Chương | Số câu | Trả lời ngắn | Đúng/sai |
|---|---|---|---|
| Một số yếu tố giải tích (ứng dụng đạo hàm L12) | **732** | 197 | 130 |
| Lượng giác (L11) | 246 | 55 | 50 |
| Hình toạ độ không gian | 143 | 4 | 4 |
| Thống kê ghép nhóm (L11 + 12) | 90 | 22 | 22 |
| Cấp số cộng + cấp số nhân + dãy số | 140 | 27 | 33 |
| Nguyên hàm – tích phân | 37 | 10 | 4 |
| BPT & hệ BPT bậc nhất hai ẩn | 36 | 11 | 7 |
| **Xác suất có điều kiện** | **1** | 0 | 1 |

**Hai điều rút ra:**

1. Khảo sát hàm số là chỗ học sinh luyện nhiều nhất (45% ngân hàng) và có mặt
   ở cả ba phần đề. Công cụ ở đây được dùng nhiều nhất.
2. **Xác suất có điều kiện là lỗ hổng**: đề có nguyên một câu đúng/sai (4 ý,
   tới 1 điểm) mà ngân hàng chỉ có 1 câu. Đây là nội dung MỚI của chương trình
   2018, học sinh ít tài liệu. Một công cụ ở đây lấp đúng chỗ trống, và nó cũng
   là tín hiệu cần bổ sung câu hỏi vào ngân hàng.

---

## 2. Nguyên tắc: công cụ phải dạy, không phải giải hộ

Rủi ro lớn nhất của công cụ Toán là thành máy lấy đáp án kiểu Photomath: học
sinh gõ đề, chép số, không học gì. Nghiên cứu cho ba hướng chống lại điều đó,
và cả ba làm được trong khuôn công cụ miền nghiệm đang có.

**N1. Đoán trước, rồi mới xem.** Trước mỗi bước quyết định (gạch nửa mặt phẳng
nào, dấu của y' trên khoảng này, chọn nhánh nào của cây xác suất), công cụ hỏi
học sinh trước. Chọn xong mới hiện bước giải và đánh dấu đúng/sai. Biến xem
thụ động thành tự giải thích — tự giải thích cải thiện cả nhớ quy trình lẫn
chuyển giao sang bài mới ([Atkinson, Renkl & Merrill — self-explanation và
fading](https://www.researchgate.net/publication/200772684_Transitioning_From_Studying_Examples_to_Solving_Problems_Effects_of_Self-Explanation_Prompts_and_Fading_Worked-Out_Steps)).

**N2. Rút dần lời giải mẫu (fading).** Ba chế độ cho mọi công cụ: *Xem mẫu* →
*Làm cùng* (bước cuối bị ẩn, học sinh tự làm) → *Tự làm* (chỉ còn kiểm tra).
Rút từ bước CUỐI trước là thứ tự được nghiên cứu ở trên ghi nhận có lợi nhất;
nghiên cứu gần đây cũng cho thấy nhóm học theo lối rút dần tiến bộ rõ hơn nhóm
học thông thường ([PMC — working memory và fading](https://pmc.ncbi.nlm.nih.gov/articles/PMC12879535/)).

**N3. Thao tác trực tiếp.** Kéo thanh trượt hệ số, kéo điểm trên đường tròn,
xoay hình 3D — thấy ngay hậu quả. Đây là lý do GeoGebra/Desmos giúp hiểu khái
niệm ([IGI Global — Desmos & GeoGebra](https://www.igi-global.com/viewtitle.aspx?TitleId=317537&isxn=9781668459201)).
Thao tác không thay lời giải; nó cho học sinh lý do để đọc lời giải.

Ba nguyên tắc kỹ thuật giữ từ công cụ đầu tiên:

- **Chính xác như bài giải tay.** Phân số, căn thức viết đúng dạng SGK; số
  thập phân chỉ khi SGK cũng làm tròn, và luôn ghi "≈".
- **Theo đúng quy ước SGK Kết nối tri thức**, kể cả quy ước hình vẽ (miền
  nghiệm không tô màu là ví dụ). Công cụ lệch sách là dạy ngược.
- **Chạy hoàn toàn ở trình duyệt**, không đọc/ghi dữ liệu học sinh — cho tới
  khi có lý do rõ ràng để lưu tiến độ (cần RLS, xem mục 6).

**Không làm được — và không giả vờ làm được:** chặn học sinh mở công cụ trong
lúc làm bài về nhà. Mở tab mới là xong. N1–N2 làm cho đường tắt kém hấp dẫn
hơn, không loại bỏ nó.

---

## 3. Danh sách xếp hạng

Mỗi công cụ chấm theo: trọng số đề (mục 1.1), nhu cầu ngân hàng (1.2), mức
tái dùng code có sẵn, rủi ro sai toán, rủi ro thành máy giải hộ.
"Phiên" = khối lượng tương đương công cụ miền nghiệm (~2.700 dòng kèm test).

### Đợt 1 — nhanh, tái dùng cao, lấp chỗ trống đề thi

#### 1. Cây xác suất & công thức Bayes (L12 · xác suất có điều kiện)

- **Học sinh làm:** nhập P(A), P(B | A), P(B | Ā) — hoặc chọn bài thực tế có
  sẵn (xét nghiệm bệnh, dây chuyền lỗi, dự báo thời tiết).
- **Công cụ hiện:** cây xác suất tự vẽ; bảng "trong 1000 người thì…" (tần số
  tự nhiên — cách dễ hiểu nhất cho Bayes); công thức xác suất toàn phần và
  Bayes từng bước bằng phân số chính xác.
- **Móc thu hút:** câu hỏi "đoán trước" kinh điển — xét nghiệm chính xác 99%,
  bệnh hiếm 1%, dương tính thì xác suất mắc bệnh là bao nhiêu? Đa số đoán
  99%, đáp án là 50%. Kéo thanh trượt tỉ lệ mắc bệnh để thấy vì sao.
- **Khớp đề:** 4 ý đúng/sai phần II thường hỏi đúng các đại lượng này.
- **Tái dùng:** `Frac`, bộ đọc số, `steps` + `RichText`, khuôn trang công cụ.
- **Rủi ro sai toán:** thấp (chỉ cộng nhân phân số). **Công sức:** ~0,5 phiên.

#### 2. Mẫu số liệu ghép nhóm (L11 + L12 · thống kê)

- **Học sinh làm:** nhập bảng ghép nhóm [a; b) và tần số.
- **Công cụ hiện:** biểu đồ tần số; từng bước tính số trung bình (giá trị đại
  diện), mốt, trung vị, Q1, Q3 bằng **công thức nội suy** — tô sáng *nhóm chứa
  trung vị* trên biểu đồ, chỗ học sinh hay chọn nhầm nhất; khoảng biến thiên,
  khoảng tứ phân vị, phương sai, độ lệch chuẩn.
- **Móc thu hút:** kéo một vạch trên biểu đồ để "đoán" trung vị trước khi tính;
  thêm/bớt một giá trị ngoại lai để thấy trung bình nhảy còn trung vị đứng yên.
- **Khớp đề:** 1 câu phần I; ngân hàng 90 câu, 22 câu trả lời ngắn.
- **Tái dùng:** `Frac`, `steps`, trục toạ độ của `InequalityPlot` (tách ra, xem 4.1).
- **Rủi ro:** thấp; **máy giải hộ: trung bình** (câu trả lời ngắn hỏi đúng các
  số này) → bật N1 mặc định. **Công sức:** ~0,5–1 phiên.

#### 3. Nâng cấp miền nghiệm: chế độ "Tự làm"

- Trước bước gạch, học sinh chạm vào nửa mặt phẳng mình cho là phải gạch;
  công cụ báo đúng/sai rồi mới gạch. Trước kết luận, học sinh tự bấm các đỉnh.
- Là nơi thử N1–N2 rẻ nhất, trên công cụ đã có người dùng.
- **Công sức:** ~0,3 phiên.

### Đợt 2 — giá trị cao nhất, cần xây nền

#### 4. Khảo sát hàm số: đạo hàm → bảng biến thiên → đồ thị (L12 · chương 1)

- **Phạm vi đúng SGK 12:** bậc ba, bậc bốn trùng phương, `(ax+b)/(cx+d)`,
  `(ax²+bx+c)/(dx+e)`. KHÔNG nhận hàm tuỳ ý — lời giải tuỳ ý cần hệ đại số máy
  tính và sẽ sai ở đâu đó.
- **Công cụ hiện:** TXĐ → y′ → nghiệm y′ = 0 **dạng căn chính xác** (−1 + √3)
  → bảng xét dấu y′ → **bảng biến thiên vẽ như trong sách** (mũi tên, giới hạn
  ±∞, tiệm cận) → cực trị → đồ thị, cả ba đồng bộ.
- **Móc thu hút:** thanh trượt a, b, c, d — thấy BBT và đồ thị đổi cùng lúc
  (hai cực trị nhập làm một rồi biến mất khi Δ′ đổi dấu). Trò *ghép đồ thị với
  BBT*, *đoán dấu y′ trên từng khoảng*.
- **Mở rộng tự nhiên:** *đọc đồ thị f′* — dạng câu rất hay gặp trong đề đúng/sai;
  bài toán tối ưu thực tế (chuyên đề 12.2) dùng chung lõi.
- **Khớp đề:** 3 câu ở cả ba phần; ngân hàng 732 câu.
- **Nền phải xây (dùng lại cho 5, 6):** số dạng `p + q√r` chính xác; bộ đọc đa
  thức/phân thức (mở rộng `parse.ts`); đa thức (đạo hàm, nghiệm bậc ≤ 2 chính
  xác); khối vẽ bảng biến thiên.
- **Rủi ro sai toán:** CAO — phải có bộ test đối chiếu từ ví dụ SGK như đã làm
  với OABC. **Công sức:** ~2 phiên.

#### 5. Tích phân: tổng Riemann, diện tích hình phẳng, quãng đường (L12)

- Nhập f(x) (đa thức) và cận → vùng diện tích; thanh trượt n hình chữ nhật →
  tổng Riemann tiến tới tích phân; diện tích giữa hai đồ thị (tìm giao điểm,
  tách khúc, bỏ trị tuyệt đối từng khúc); v(t) → quãng đường.
- **Khớp đề:** 4 câu, cả ba phần. **Tái dùng:** toàn bộ nền của công cụ 4.
- **Công sức:** ~1 phiên sau khi có nền.

### Đợt 3 — trực quan không gian

#### 6. Hình toạ độ Oxyz xoay được (L12)

- Nhập điểm, vectơ, mặt phẳng, đường thẳng, mặt cầu → hình 3D **kéo để xoay**
  (SVG + phép chiếu tự viết, cùng cách đã dựng hệ Oxyz ở nền trang chủ — không
  cần three.js); phép tính từng bước: phương trình mặt phẳng qua ba điểm (tích
  có hướng), khoảng cách điểm–mặt, góc, hình chiếu, giao điểm.
- **Móc thu hút:** bối cảnh thực tế kiểu đề mới — drone, camera, cáp treo.
- **Khớp đề:** 4 câu — nhiều nhất đề. **Công sức:** ~1,5–2 phiên.

#### 7. Đường tròn lượng giác & đồ thị y = A·sin(ωx + φ) (L11)

- Kéo điểm trên đường tròn → sin, cos, tan; góc nhiều vòng; giải `sin x = a`
  → hai họ nghiệm hiện trên đường tròn; thanh trượt A, ω, φ cho bài toán dao
  động, thuỷ triều, vòng quay (ngân hàng có sẵn các bài này).
- **Khớp đề:** 1 câu; ngân hàng 246 câu. **Công sức:** ~1 phiên.

### Nhỏ, xen kẽ khi có thời gian

- **8. Mô phỏng xác suất** — tung xúc xắc, bốc bi 10.000 lần để KIỂM CHỨNG đáp
  án tự tính. Không bao giờ là máy giải hộ: nó chỉ ra con số gần đúng sau khi
  học sinh đã tính. (~0,3 phiên)
- **9. Cấp số & lãi suất** — khối chồng tầng cho cấp số cộng/nhân, lãi kép và
  trả góp cho chuyên đề 12.3 tài chính. (~0,5 phiên)

---

## 4. Việc nền dùng chung

1. **Tách `CoordinatePlane`** khỏi `InequalityPlot`: lưới, trục, nhãn, khung
   vuông, `computeView`. Công cụ 2, 4, 5, 7 đều cần.
2. **Thư viện số chính xác**: `Frac` đã có; thêm `Surd` (`p + q√r`) khi làm công cụ 4.
3. **Khuôn bước giải**: `Step` + `RichText` + điều hướng bước đã dùng được
   chung. Thêm kiểu bước `predict` (câu hỏi đoán trước, N1) một lần cho mọi công cụ.
4. **Liên kết theo ngữ cảnh** (sau đợt 1): nút "Mở công cụ" trong bài lý thuyết
   `/learn` của chương tương ứng — học sinh gặp công cụ đúng lúc đang học chương đó.

---

## 5. Đã cân nhắc và KHÔNG làm

| Ý tưởng | Vì sao không |
|---|---|
| "Máy giải mọi bài" nhập đề tự do | Cần hệ đại số máy tính; sẽ sai ở đâu đó mà học sinh không biết. Và là đúng loại máy lấy đáp án mục 2 muốn tránh. |
| Bản sao chức năng TABLE của Casio fx-580VN X | Học sinh Việt Nam dùng rất nhiều ([nghiên cứu ĐH Đồng Tháp](https://dthujs.vn/index.php/dthujs/article/view/261)), nhưng đó là thủ thuật đoán đáp án trắc nghiệm, không dạy khảo sát. Công cụ 4 cho thấy VÌ SAO bảng giá trị trông như vậy — đó mới là giá trị. |
| Mô hình 3D hình chóp, lăng trụ (HHKG L11) | Đề có 3 câu nhưng mỗi bài một hình; công cụ chung khó làm đúng. Để sau Oxyz, khi đã có bộ vẽ 3D. |
| Điểm thưởng, huy hiệu, bảng xếp hạng cho công cụ | Kế hoạch trang học sinh đã chốt không bật UI thành tựu khi chưa có cơ chế cấp thật. Công cụ lại không ghi dữ liệu, nên không có gì để chấm. |
| Dùng three.js cho 3D | ~600KB cho vài hình; phép chiếu tự viết đủ dùng và đã chạy ở nền trang chủ. |

---

## 6. Câu hỏi cho chủ dự án

1. **Thứ tự:** đề xuất Đợt 1 (Bayes → ghép nhóm → "Tự làm" cho miền nghiệm)
   trước, vì nhanh và lấp chỗ trống đề thi; hay đi thẳng vào khảo sát hàm số
   vì ngân hàng dồn ở đó?
2. **Lưu tiến độ:** có muốn công cụ nhớ học sinh đã làm đúng chế độ "Tự làm"
   bao nhiêu lần không? Đó là lúc công cụ bắt đầu ghi database — cần bảng mới,
   RLS theo chủ sở hữu, và không đưa vào payload AI.
3. **Giáo viên dùng trên lớp:** route hiện chỉ cho học sinh (`/student/*`).
   Muốn thầy chiếu công cụ khi dạy thì cần một đường vào cho giáo viên.

Câu 1 đã trả lời (2026-09-14): làm Đợt 1 trước, và **gom mọi công cụ về một khu
làm việc**. Câu 2, 3 chưa trả lời.

---

## 7. Đợt 1 — đã làm (2026-09-14)

**Một khu làm việc, công cụ là tab.** `tools/layout.tsx` → `ToolsShell`: đầu trang
+ thanh tab + `MathProvider` dùng chung; mỗi công cụ vẫn là route con để link
thẳng được. `/student/tools` chuyển thẳng vào công cụ đầu, không có trang danh
sách riêng. Thêm công cụ = registry + route con + một dòng trong `clients.tsx`.

| Công cụ | Đoán trước / Tự làm | Thao tác trực tiếp |
|---|---|---|
| Miền nghiệm | Nét liền hay đứt? · Điểm thử đúng hay sai? · Gạch nửa nào? — hình giữ ở `preStage` để không lộ đáp án; điểm cuối bài | — |
| Ghép nhóm | Nhóm nào chứa Me / Q₁ / Q₃ / mốt? — che số trong bảng tóm tắt và vạch trên biểu đồ tới khi trả lời | Nút +/− tần số, số liệu và vạch dịch ngay |
| Bayes | Kéo thanh đoán P(A \| B) rồi chốt · 4 mệnh đề đúng/sai dựng từ lỗi thật · Tự làm khoá lời giải và số ở lá cây | Thanh trượt P(A) |

**Bayes — đề cho gì cũng được (2026-09-15, yêu cầu chủ dự án).** Không còn ba ô cố
định P(A), P(B | A), P(B | Ā): cả 17 đại lượng (biến cố, đối, giao, có điều kiện hai
chiều, hợp) là ô "chờ", đề cho ô nào điền ô đó. `probability/givens.ts` có hai lớp:
khử Gauss chính xác trên bốn lá cây (đủ dữ kiện ⇔ hạng 4; báo mâu thuẫn, xác suất âm,
có điều kiện trên biến cố xác suất 0; thiếu thì đếm số dữ kiện còn thiếu) và chuỗi
suy luận bằng công thức SGK tìm theo vòng để lấy đường ngắn nhất (biến cố đối, toàn
phần, Bayes, công thức nhân, định nghĩa có điều kiện, công thức cộng, giải ngược toàn
phần). Chuỗi không nối được thì lời giải nói thẳng là giải hệ. Đề đúng bộ ba SGK vẫn
ra lời giải bốn phần cũ. Ô trống hiện mờ giá trị suy ra (chế độ Xem mẫu) hoặc "chờ".

Dùng chung: `fraction.ts` (chuyển lên `lib/tools/`), `ModeToggle`, `PredictChoice`
(chỉ tính lần chọn đầu), `RichText` (thêm `$$…$$` khối cuộn ngang được).

Công thức đối chiếu với ví dụ SGK: KNTT 11 Bài 9 (thời gian đến trường: Me = 26,
Q₁ = 21,25, Q₃ ≈ 34,29, Mo ≈ 22,08 — khớp); KNTT 12 Bài 10 (phương sai chia n,
tính tay s² = 164,75 cho bảng chiều cao cây).

**Ba bẫy gặp thật, ghi lại để công cụ sau khỏi dính:**

1. **MathJax đọc `{,}` + ba chữ số là phân cách hàng nghìn.** `0{,}0099` bị tách
   thành số "0,009" và số "9". Mọi số thập phân vào TeX phải qua `decimalTex`
   (`0{,}{0099}`).
2. **Lưới hai cột tràn ngang trên điện thoại.** Dưới `lg` lưới chỉ có một cột
   `auto`; bảng nhập liệu (dù nằm trong khối `overflow-x-auto`) đẩy cột rộng
   521px. Luôn `grid-cols-[minmax(0,1fr)]` + `[&>*]:min-w-0` — cùng bài học đã
   ghi ở `student/page.tsx`.
3. **SSR + MathJax = "Hydration failed".** Công cụ nạp bằng `dynamic(…, { ssr: false })`.

---

## 8. Đợt 2 · Khảo sát hàm số — đã làm (2026-09-15)

`lib/tools/function-analysis/`: `surd.ts` (số a + b√r chính xác), `poly.ts` (đa thức
hệ số phân số, nghiệm chính xác), `parse.ts`, `analyze.ts`, `steps.ts`; giao diện
`FunctionAnalysisTool` + `VariationTable` + `FunctionPlot`. Tab đứng đầu khu công cụ.

**Phạm vi đúng mục 3.4:** bậc hai, bậc ba, bậc bốn (trùng phương; bậc bốn khác chỉ khi
y′ có nghiệm hữu tỉ), `(ax + b)/(cx + d)`, `(ax² + bx + c)/(dx + e)`. Ngoài phạm vi thì
báo lý do, không đoán: phân thức rút gọn được, mẫu bậc 2, bậc ≥ 5, y′ = 0 cần căn bậc ba.

**Sơ đồ 8 bước theo SGK KNTT 12:** TXĐ → y′ (công thức thương viết đủ phép thế) →
y′ = 0 (rút nhân tử x, Δ, x² = k) → dấu y′ bằng điểm thử HỮU TỈ (ưu tiên 0, rồi số
nguyên nhỏ; thế chính xác) → cực trị (giá trị dạng căn kèm ≈) → giới hạn, tiệm cận
đứng/ngang/xiên → bảng biến thiên → đồ thị (giao trục, tâm đối xứng, trục đối xứng).

| Đoán trước / Tự làm | Thao tác trực tiếp |
|---|---|
| Số nghiệm y′ = 0 · dấu y′ TỪNG khoảng (bảng hiện "?" tới khi trả lời) · cực đại/cực tiểu tại đâu (hỏi loại có đúng một điểm) · x → +∞ thì y → ? · đường cong chỉ hiện ở bước cuối · điểm cuối bài | Nút +/− từng hệ số theo dạng: y = x³ − 3x² + cx + 2 bấm c từ 0 lên 4 thấy hai cực trị (3 ± √6)/3 → (3 ± √3)/3 → nghiệm kép x = 1 → hết cực trị |

Đối chiếu tay (14 test): x³ − 3x² + 2; x³ − 3x² − 3x + 1 (cực trị tại 1 ± √2, y = −4 ± 4√2);
−x³ + 3x² − 3x + 2 (nghiệm kép, nghịch biến trên ℝ); x⁴ − 2x² + 1; −x⁴ + 2x² + 3
(giao Ox ±√3); (x + 1)/(x − 1); (x² − x + 1)/(x − 1) (tiệm cận xiên y = x).

**Hai bẫy mới:**

1. **Tên trợ năng của hình lộ đáp án.** `<title>` của bảng biến thiên liệt kê mốc x ngay
   từ bước 1 — trình đọc màn hình đọc được nghiệm y′ = 0 trước câu hỏi. Tên trợ năng phải
   lộ đúng bằng phần hình đang hiện.
2. **Chữ trong SVG co theo hình.** Hình 560 đơn vị trên màn 310px thì chữ 13 còn ~7px.
   `FunctionPlot` đo bề rộng thật (ResizeObserver) và phóng chữ tới 1,7 lần; nét giữ nguyên.

---

## 9. Đợt 2 · Tích phân — đã làm (2026-09-18)

Ba kiểu bài của chương 4 trong MỘT tab, chọn bằng ba nút ở đầu công cụ — thay vì ba
tab rời, vì cả ba dùng chung đúng một lõi (nguyên hàm + tách khúc theo dấu) và học
sinh gặp chúng trong cùng một bài học.

| Kiểu bài | Học sinh nhập | Công cụ làm |
|---|---|---|
| **Tổng Riemann → tích phân** | f(x), hai cận, thanh trượt n ≤ 40, chọn mút trái / trung điểm / mút phải | Δx và các mốc chia, tổng S\_n bằng phân số chính xác, bảng S\_n với n = 4 → 64, rồi Newton – Leibniz và sai số |
| **Diện tích hình phẳng** | f(x), g(x) (trống = trục hoành), cận (trống = lấy giao điểm) | phương trình hoành độ giao điểm, xét dấu f − g bằng điểm thử hữu tỉ, bỏ trị tuyệt đối từng khúc, cộng lại |
| **Quãng đường từ v(t)** | v(t), khoảng thời gian | thời điểm đổi chiều, dấu v từng khúc, ∫\|v\| và ∫v cạnh nhau |

**Nền dùng chung, tách ra trong đợt này:** `poly.ts` và `surd.ts` chuyển lên
`lib/tools/` (đúng đường mà `fraction.ts` đã đi ở đợt 1), và phần đọc biểu thức tách
khỏi `function-analysis/parse.ts` thành `lib/tools/expression.ts` — cùng một bộ đọc
LaTeX/`x²`/nhân ngầm, thêm tham số biến để bài chuyển động gõ được `v(t) = t^2 - 4t + 3`.
`function-analysis/parse.ts` giờ chỉ còn việc xếp hàm vào dạng SGK.

Công cụ ở `lib/tools/integral/`: `integrate.ts` (nguyên hàm, tích phân, tổng Riemann,
tách khúc), `analyze.ts` (dựng bài toán, chọn cận), `steps.ts` (lời giải + câu hỏi đoán
trước); giao diện `IntegralTool` + `IntegralPlot`.

**Phạm vi: chỉ đa thức bậc ≤ 6.** Nguyên hàm của hàm bất kỳ cần hệ đại số máy tính và
sẽ sai ở đâu đó mà học sinh không biết (mục 5). Ngoài phạm vi thì báo lý do, không đoán:
phân thức, bậc > 6, và phương trình giao điểm không giải được bằng căn bậc hai
(x³ = 2 chẳng hạn).

| Đoán trước / Tự làm | Thao tác trực tiếp |
|---|---|
| S\_n thiếu hay thừa so với tích phân (giải thích bằng chiều biến thiên, không bằng số) · n → +∞ thì tổng đi đâu · đồ thị nào nằm trên TỪNG khúc (chưa trả lời thì khúc đó chưa được tô) · quãng đường có bằng độ dịch chuyển không · **tính một tích phân duy nhất có ra diện tích không** | Thanh trượt số hình chữ nhật: n từ 1 tới 40, thấy tổng bò về giá trị tích phân và sai số co lại |

Câu cuối là cái bẫy lớn nhất của chương: với y = x³ − 3x² + 2 trên [0; 2] thì tích phân
bằng **0** trong khi diện tích bằng **5/2**. Công cụ hiện cả hai số cạnh nhau ở bước bỏ
dấu trị tuyệt đối, thay vì chỉ đưa ra đáp án đúng.

Đối chiếu tay (14 test): ∫₀¹x²dx = 1/3; ∫₀²(x³ − 3x² + 2)dx = 0 mà S = 5/2; hai parabol
y = x² và y = 2 − x² cho 8/3; y = x³ và y = x cho 1/4 + 1/4; y = x² và y = x + 1 cắt nhau
tại (1 ± √5)/2 cho 5√5/6 (giao điểm vô tỉ vẫn tính chính xác trong tập a + b√r);
v(t) = t² − 4t + 3 trên [0; 4] cho quãng đường 4 nhưng độ dịch chuyển 4/3; tổng Riemann
mút trái/phải/trung điểm của x² trên [0; 1] với n = 4 là 7/32, 15/32, 21/64.

**Hai bẫy mới:**

1. **Nhãn cận đè lên số trên trục.** Cận dạng căn viết dài cả chục ký tự —
   `(1 − √5)/2` nằm đúng chỗ số `−0,5` của trục. `IntegralPlot` ước lượng bề rộng nhãn
   cận rồi bỏ những số trục rơi vào đó: thiếu một mốc còn đọc được, chồng chữ thì không.
2. **Dấu `$` lẻ trong chuỗi lời giải.** `rootsTex` nối nhiều nghiệm bằng `$ hoặc $`, nên
   đặt nó vào khối `$$…$$` là làm hỏng cả khối. Có một test quét mọi dòng của mọi kiểu
   bài, đếm dấu `$` và bắt khối `$$…$$` có `$` lẫn bên trong.

---

## 10. Đợt 3 · Hình toạ độ Oxyz — đã làm (2026-09-19)

Bốn kiểu bài của chương 5 trong một tab, chọn bằng bốn nút. Chúng dùng chung
đúng một phép tính: **hình chiếu của một điểm lên mặt phẳng** — khoảng cách,
điểm đối xứng, tâm đường tròn giao tuyến của mặt cầu, tiếp điểm đều ra từ đó.

| Kiểu bài | Học sinh nhập | Công cụ làm |
|---|---|---|
| **Mặt phẳng qua ba điểm** | A, B, C, và D tuỳ chọn | hai vectơ, tích có hướng viết đủ ba định thức, rút gọn vtpt, phương trình, thử lại; có D thì xét đồng phẳng |
| **Khoảng cách · hình chiếu** | M và (P) | d(M,(P)) trục căn thức ở mẫu, tham số t, hình chiếu H, điểm đối xứng M′, thử lại MH = d |
| **Đường thẳng và mặt phẳng** | A + vtcp (hoặc hai điểm), (P) | phương trình tham số, xét u·n, giao điểm hoặc song song/nằm trong, góc bằng sin |
| **Mặt cầu và mặt phẳng** | tâm + R, hoặc nguyên phương trình (S) | d(I,(P)), so **bình phương** với R², đường tròn giao tuyến hoặc tiếp điểm |

**Hình kéo để xoay, SVG + phép chiếu song song tự viết** (không three.js, đúng
mục 5): hai tích vô hướng cho mỗi điểm. Kéo chuột hoặc chạm để xoay, phím mũi
tên khi hình đang được chọn, phím R về góc nhìn ban đầu; góc ngẩng chặn ở ±80°
vì nhìn đúng từ đỉnh thì trục Oz co thành một điểm. Mặt phẳng vẽ thành mảnh
hình bình hành, mặt cầu vẽ đường bao tròn kèm một vĩ tuyến, giao tuyến vẽ bằng
72 điểm lấy mẫu — chiếu song song thì đường tròn ra đúng một elip.

**Xoay được mới là giá trị chính**, không phải hình đẹp: hình tĩnh hay làm học
sinh đọc sai vị trí tương đối — đường thẳng "trông như cắt" mà thật ra song
song, điểm trông như nằm trên mặt phẳng. Xoay nửa vòng là thấy.

| Đoán trước / Tự làm | Thao tác trực tiếp |
|---|---|
| Tìm vtpt bằng tích có hướng hay tổng hai vectơ · M có nằm trên (P) không · đường MH nhận vectơ nào làm vtcp · **u·n = 0 nói lên điều gì** · góc đường–mặt tính qua sin hay cos · mặt phẳng cắt / tiếp xúc / không cắt mặt cầu | Kéo xoay hình; hình lớn dần theo lời giải (`reveal` từng phần tử) nên bước 1 không lộ sẵn đáp án |

Đối chiếu tay (15 test): (ABC) qua ba điểm trên ba trục cho 6x + 3y + 2z − 6 = 0;
ba điểm thẳng hàng thì báo, không viết bừa; M(1;−2;3) với 2x − 2y + z + 3 = 0 cho
d = 4, H(−5/3; 2/3; 5/3), M′(−13/3; 10/3; 1/3) và |MH| = 4; d(M,(P)) = √3 và √2/2
ở hai ca có căn; đường thẳng cắt, song song, nằm trong; góc 45°, 90° và một góc lẻ
≈ 35°16′; mặt cầu cắt (r = √65/3), tiếp xúc, không cắt.

**Ba bẫy mới:**

1. **Cộng hai căn khác nhau là không hợp lệ.** Tập a + b√r chỉ đóng khi cùng r,
   nên mọi so sánh phải tránh căn: vị trí tương đối mặt cầu ↔ mặt phẳng so
   **d² với R²** (cả hai hữu tỉ). So d với R qua số thực thì ca **tiếp xúc** sẽ
   trượt thành "cắt" hoặc "không cắt" tuỳ sai số.
2. **Mảnh mặt phẳng vẽ to quá thì che hết hình.** Bản đầu lấy nửa cạnh bằng
   1,15 lần bán kính khung: nó phủ kín khung, nuốt mất trục và lưới. Rút về
   0,78 và lấy một cạnh **nằm ngang** (`e₁ = n × Oz`) thì mặt phẳng đọc như bức
   tường dựng trên nền — đúng kiểu hình trong sách.
3. **Tên vectơ đặt ở đầu mũi tên là đè lên tên điểm.** `\overrightarrow{AC}` kết
   thúc đúng chỗ điểm C. Đặt tên ở **giữa** mũi tên là hết chồng chữ. (SVG không
   dựng được LaTeX, nên tên vectơ phải rút về chữ thường: `\vec{n}` → `n`.)
