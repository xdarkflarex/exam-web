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

## 2. ĐANG HỎNG — trang học sinh nói sai một câu

Lưới hoạt động vẽ đủ 28 ô xám, đọc thành "bốn tuần qua không học buổi nào",
trong khi sự thật là **chưa lấy được số liệu**. Cùng lúc, dải "Mảng cần củng cố"
không hiện dù vòng tiến độ vẫn có số (17% / 30 câu).

Hai phần đó lấy từ hai nguồn khác nhau nên lệch được. Cách phân biệt nhanh: mở
`/student/analytics` bằng tài khoản test — nếu phần thống kê theo kiến thức
**cũng** trống thì lỗi nằm ở nguồn dữ liệu, không phải ở đợt làm đẹp.

Việc phải làm **bất kể nguyên nhân là gì**: khi không có dữ liệu thì phải nói
"chưa ghi nhận hoạt động", không được vẽ 28 ô xám như một kết luận.

> Đọc `docs/DESIGN_OVERHAUL_2026-08-09.md` mục 4. Sửa lưới hoạt động ở
> `src/components/student/**`: khi không có dữ liệu phải hiện trạng thái "chưa
> ghi nhận hoạt động" thay vì 28 ô xám trông như "không học buổi nào". Đồng thời
> mở `/student/analytics` để xác định phần "Mảng cần củng cố" trống là do feature
> gate hay do lệch kiểu dữ liệu, rồi ghi kết luận vào mục 4 của tài liệu trên.

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
