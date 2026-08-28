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

## 1. ĐANG HỎNG — hình vẽ trong bài lý thuyết không hiện

Mở `/learn` chọn bài bất kỳ của Chương 1 lớp 12: chỗ nào có hình cũng dừng ở chữ
"Đang tải hình…" và không bao giờ ra hình. Quan sát lại ngày 2026-08-13 trên cả
bốn bài.

Đã biết: 110/110 hình đã dựng thành SVG trong `public/tikz/`, và parser sinh
đúng khối ```` ```tikz ````. Chưa biết: đoạn nối giữa `TikzRenderer` và tệp SVG
đứt ở đâu. Danh sách nghi can và cách đo có sẵn.

> Đọc `docs/RUNBOOK.md` mục 12 và `docs/LATEX_PARSER_DEBUG.md` mục "Còn treo".
> Hình TikZ của bài lý thuyết không hiện trên `/learn`: SVG đã dựng đủ trong
> `public/tikz/`, khối ```tikz sinh đúng, nhưng trình duyệt chỉ hiện "Đang tải
> hình…". Tìm chỗ đứt giữa `TikzRenderer` và tệp SVG, sửa, rồi mở `/learn` xem
> tận mắt một bài có hình để xác nhận.

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

## 11. CHƯA BẮT ĐẦU — rà soát lời giải/đáp án bằng AI, và gợi ý phân loại

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

> Đọc `AGENTS.md` rồi `docs/QUESTION_AUDIT_PLAN.md`. Làm công cụ rà soát ngân
> hàng câu hỏi theo tài liệu đó, bắt đầu từ mục 9 bước 1 và 2 (lớp luật tất định
> + contracts/validator), chưa gọi API. Ràng buộc quan trọng nhất ở mục 3: AI chỉ
> đề xuất, người duyệt mới được ghi, và câu đã có attempt đã nộp phải cảnh báo
> riêng. Trước khi viết phần phân loại, đọc mục 8 và phần đầu
> `src/lib/questions/classify.ts` — repo đã cố ý chọn luật thay vì AI ở chỗ đó.
