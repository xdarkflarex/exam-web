# Parser LaTeX hỏng khi nhập bài thật — bàn giao cho phiên sau

Viết ngày 2026-08-09, sau khi thử nhập file thật đầu tiên qua
`/admin/theories/import`.

## Hiện trạng

Nhánh SGK trong database đã dựng xong và **đúng** (3 topic = 3 lớp, 8 chương,
3 bài cũ tháng 6 đã chuyển vào Chương 1 lớp 12 ở thứ tự 1/3/4). Xem
`docs/sql/20260809c_nhanh_sgk_gop_chay_mot_lan.sql`.

Việc chặn tiếp theo là **parser**, không phải database.

File thử: `chapters/lop12/chuong01-ung-dham/bai02-tinh-don-dieu-cua-ham-so.tex`
(249 dòng).

## Ba nhóm lỗi quan sát được ở màn hình Preview

1. `Unknown environment 'tikzpicture'` — lặp lại nhiều lần.
2. `You can't use 'macro parameter character #' in math mode` — lặp lại nhiều lần.
3. `Extra close brace or missing open brace` ở `\node[Primary] at (3.45,5.1) {$x_1f(x_2)`.

Kèm theo, chữ dính liền không có dấu cách:
`y=f(x)cóđạohàmtrênkhoảngK` — nên khoảng trắng/xuống dòng cũng đang bị nuốt.

## Số đo, không phải phỏng đoán

| Đo trên file nguồn | Kết quả |
|---|---:|
| Số lần xuất hiện `tikzpicture` | 16 (tức 8 hình) |
| Số ký tự `#` | **0** |
| Số `\node` | 4 |

**Điểm mấu chốt: file nguồn KHÔNG có ký tự `#` nào.** Vậy `#` trong thông báo
lỗi là do đường xử lý sinh ra, không phải từ nội dung thầy soạn. Đây là đầu mối
mạnh nhất — đừng đi tìm `#` trong file `.tex`.

## Giả thuyết hàng đầu, cần kiểm chứng trước khi sửa

`src/lib/theories/latex-parser.ts` có **hai đường xử lý khác nhau**, và nhiều
khả năng đường được dùng cho khối tri thức bỏ qua bước bảo vệ TikZ:

- `latexToMarkdown()` (dòng ~290 trở đi) **CÓ** bảo vệ TikZ: đổi
  `\begin{tikzpicture}...\end{tikzpicture}` thành placeholder `%%PROTECTED_n%%`
  rồi khôi phục thành code block ```` ```tikz ````.
- `parseKnowledgeBlocks()` (dòng ~180) tách thân từng khối
  (`\begin{dinhnghia}[id]{Tiêu đề}...`). **Cần kiểm xem thân khối có được đưa
  qua `latexToMarkdown()` hay không.** Nếu không, TikZ nằm nguyên trong
  `body_md`, và MathJax phía web gặp `tikzpicture` thì báo "Unknown environment"
  — đúng triệu chứng 1.

Việc đầu tiên của phiên sau nên là: viết một test nhỏ gọi
`parseKnowledgeBlocks()` trên file `bai02` thật và in ra `body_md` của khối đầu
tiên. Nhìn chuỗi đó là biết ngay TikZ có bị bỏ sót không, không cần đoán.

Dự án đã có `node --test` (`npm test`, 211 test đang xanh) nên thêm test không
tốn hạ tầng gì.

## Phạm vi cần rà

30 file `.tex` trong `HethongtrithucToanTHPT/chapters/`, phân bố:

| Lớp | Chương | Số bài |
|---|---|---:|
| 10 | chuong01-menh-de-va-tap-hop | 2 |
| 10 | chuong02-bat-phuong-trinh... | 2 |
| 11 | chuong01-ham-so-luong-giac... | 4 |
| 11 | chuong02-day-so-cap-so-cong... | 4 |
| 12 | chuong01-ung-dung-dao-ham | 8 |
| 12 | chuong02-vecto-va-he-truc-toa-do | 4 |
| 12 | chuong03-thong-ke | 3 |
| 12 | phu-luc-kien-thuc-nen | 3 |

Nên viết một script rà **tất cả 30 file** một lượt, đếm theo từng file: số
`tikzpicture`, số môi trường khối (`dinhnghia`, `dinhly`, ...), số `#`, và
những macro lạ chưa được `latexToMarkdown()` xử lý. Có bảng đó thì biết lỗi là
cá biệt ở một file hay hệ thống ở mọi file.

## Bẫy đã biết, đừng dẫm lại

- **File trùng:** `chuong01-ung-dung-dao-ham` có cả `bai01-on-tap-dao-ham.tex`
  và `bai01-on-tap-dao-ham-chuan.tex`. Chỉ nạp một.
- **Bốn bài của Chương 1 đã có theory rồi** (bài 1, 3, 4 từ tháng 6). Chỉ cần
  nạp `bai02`, `bai05`, `bai06`, `bai07`.
- **`order_index` khi nhập lấy theo thứ tự file trong lượt chọn** (0, 1, 2...),
  không phải số bài trong SGK. Sau khi nạp xong cả chương phải chạy một câu
  `UPDATE` chỉnh lại cho khớp.
- **Đừng viết `BEGIN;` mà thiếu `COMMIT;`** trong file dành cho Supabase SQL
  Editor — xem `docs/sql/README.md`, lỗi này đã xảy ra một lần.
- Chế độ **"Chọn chương — tự tạo bài theo file"** ở trang import là mới thêm
  ngày 2026-08-09, sạch `tsc`/`eslint` nhưng **chưa ai bấm thử thành công** vì
  parser chặn trước đó.

## Việc còn treo sau khi parser chạy được

Dựng lại cây kỹ năng hoàn toàn mới — nền tảng thiết kế đã ghi ở
`docs/DESIGN_OVERHAUL_2026-08-09.md` mục 3b. Tóm tắt: gom theo **Chương → Bài**
đúng SGK, trong mỗi bài là trình tự *định nghĩa → định lý → công thức → phương
pháp → ví dụ → bài tập*, đọc được trên màn 375px, nối cả homework lẫn đề ôn tập
qua `question_knowledge_links`, và **gỡ `@xyflow/react` + `dagre`** khỏi bundle.
