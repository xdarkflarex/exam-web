# Hệ thống thiết kế

Mục tiêu: UI tiếng Việt dễ đọc lâu, ít chói, nhất quán giữa public/student/admin và không cản luồng làm bài.

## Token nguồn sự thật

Token runtime nằm trong `src/app/globals.css`.

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--background` | `#eef1f6` | `#0f172a` | Nền trang — tối nhất trong ba bậc nền ở light mode |
| `--background-card` | `#f7f9fc` | `#1e293b` | Card/panel, nổi lên trên nền |
| `--background-raised` | `#ffffff` | `#334155` | Ô nhập, chip trên giấy ô li — chỗ duy nhất được trắng thuần |
| `--foreground` | `#1e293b` | `#e2e8f0` | Text chính |
| `--foreground-secondary` | `#475569` | `#94a3b8` | Text phụ |
| `--foreground-muted` | `#64748b` | `#64748b` | Metadata |
| `--border` | `#dbe1ea` | `#334155` | Border |
| `--accent` | `#0f766e` | `#2dd4bf` | Primary teal |
| `--accent-hover` | `#115e59` | `#14b8a6` | Hover/focus |

Bảng này lệch `globals.css` ở năm giá trị cho tới 2026-11-15; đã khớp lại. Token
chất liệu lớp học (`--mm-grid-*`, `--mm-board*`, `--mm-chalk*`) ở mục
"Chất liệu lớp học Toán" bên dưới.

CSS còn một nhóm semantic token blue/orange/success/warning/error ở cuối file. Khi refactor, hợp nhất dần thay vì tạo hệ màu thứ ba.

## Typography

- Inter cho UI/body; Baloo 2 (`font-baloo`) cho tiêu đề trang, tiêu đề section và con số lớn.
- Root đã cấu hình subset Vietnamese và `display: swap`.
- Class `font-baloo` chỉ tồn tại vì `@theme inline` trong `globals.css` khai báo `--font-baloo` (trỏ vào `--font-baloo-2` của next/font). Trước đó dòng này thiếu nên Tailwind v4 không sinh class, và mọi chỗ `font-baloo` âm thầm hiện bằng Inter. Font mới phải khai báo trong `@theme` theo cùng cách; đừng đặt tên biến next/font trùng namespace `--font-*`.
- Không dùng text slate quá nhạt cho nội dung dài; metadata mới dùng muted.
- Heading mô tả hành động/nội dung, tránh tiêu đề chung chung như “Quản lý”.

## Layout

- Student và admin dùng sidebar desktop 256px, top/bottom navigation phù hợp mobile.
- `/learn` dùng workspace rộng tối đa 1500px.
- Card/panel ưu tiên `rounded-xl/2xl`, border dịu và shadow nhẹ.
- Không thêm `bg-white` gắt như giải pháp mặc định; light mode đã làm mềm `.bg-white` trong CSS.
- Mọi trang cần trạng thái loading, empty, error và retry/CTA rõ.

## Màu trạng thái

| Trạng thái | Màu định hướng |
|---|---|
| Primary/đang chọn | Teal |
| Student navigation/secondary | Indigo/blue có kiểm soát |
| Đúng/thành công | Emerald/green |
| Cảnh báo/thời gian | Amber |
| Sai/nguy hiểm | Red, không chỉ dựa vào màu |

Luôn kèm icon/text cho đúng-sai, không truyền đạt trạng thái chỉ bằng màu.

## Component và interaction

- Tái sử dụng component trong `src/components` và index admin/student trước khi tạo mới.
- Nút chính có một hành động rõ; destructive action cần confirm.
- Disabled phải có lý do hoặc trạng thái; focus ring nhìn thấy bằng bàn phím.
- Không animation vô hạn hoặc chuyển động mạnh trong runner; tôn trọng `prefers-reduced-motion` khi thêm animation.
- Modal giữ focus, có close label và không che mất lỗi form.
- Table admin phải có mobile strategy: scroll ngang, card hóa hoặc cột ưu tiên.

## Nội dung toán

- Dùng `MathContent`/`MathProvider` thay vì render công thức tùy ý.
- TikZ đi qua `TikzRenderer`; luôn có fallback khi ảnh/compile lỗi.
- Markdown đi qua pipeline hiện có (`react-markdown`, GFM, normalize LaTeX).
- Không đưa raw HTML không tin cậy vào `dangerouslySetInnerHTML` nếu chưa sanitize.
- Nội dung câu hỏi, đáp án và lời giải phải giữ xuống dòng/ký hiệu khi responsive.

## Runner

- Điều hướng câu, thời gian, trạng thái lưu và nút nộp luôn nhìn thấy/hiểu được.
- Không đổi answer sau khi policy khóa; không dùng UI disable làm security boundary.
- Simulation/homework không hiển thị đáp án/lời giải khi đang làm.
- Progress phải clamp `0..100`, mẫu số không được là 0 và phải nói rõ “phiên” hay “toàn bài”.
- Auto-save cần trạng thái `Đang lưu / Đã lưu / Lỗi lưu`, không chỉ console.

## Theme: một nguồn sự thật, đặt trước lượt vẽ đầu (2026-08-07)

- **Class `dark` trên `<html>` là nguồn sự thật duy nhất.** Nó được đặt bởi script inline trong `src/app/layout.tsx`, **trước** khi trình duyệt vẽ khung hình đầu tiên. Không thêm nơi thứ hai quyết định theme (media query `prefers-color-scheme` trong CSS, biến riêng, state khác) — hai nơi cùng quyết định là hai nơi lệch nhau, và triệu chứng của lệch là "bật light mode nhưng chữ vẫn trắng".
- **Không đặt màu nền/chữ trên `<body>` bằng utility.** Trước đây `body` mang `bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200` trong khi `globals.css` cũng đặt `html, body { background-color: var(--background) }`. Utility thắng selector `html, body`, nên toàn bộ bảng màu "chống mỏi mắt" khai báo bằng biến **không bao giờ có tác dụng**. Màu nền/chữ toàn cục chỉ do biến `--background` / `--foreground` quyết định.
- **`ThemeProvider` không được chặn render.** Bản cũ `return null` cho tới khi effect chạy xong: trang trắng ở lượt vẽ đầu và HTML server render bị vứt đi. Có script inline rồi thì không còn lý do chặn.
- **Đổi theme phải đặt cả `style.colorScheme`.** Thiếu nó thì scrollbar, ô nhập và control mặc định của trình duyệt vẫn giữ màu chế độ cũ — một trong những chỗ "không đồng nhất" dễ thấy nhất mà lại hay bị bỏ qua.

## Tương phản: sửa ở một chỗ, không sửa 600 chỗ

Đo ngày 2026-08-07 trên trang chủ (script tính tỉ số WCAG trên từng phần tử chữ): **27 lỗi ở light mode**. Ba khuôn mẫu lặp lại ~600 lần trong ~100 file, nên sửa từng chỗ là không khả thi.

Cách đã dùng, ghi ở đầu `globals.css`: ghi đè chính các class dưới tiền tố `html:not(.dark)`. Kết quả **27 → 15** ở light mode; dark mode 12.

- **Đã thử và KHÔNG chạy:** ghi đè token `--color-teal-600` trong `:root`. Tailwind v4 ở dự án này biên dịch utility thành giá trị màu cứng, không phải `var(--color-*)`. Kiểm bằng cách đặt `--color-slate-400: red` lúc chạy — màu chữ không đổi. Đừng thử lại cách này.
- **Gradient cần override riêng.** `.bg-teal-600` không chạm nút gradient vì màu nằm ở `background-image`. Ghi đè `--tw-gradient-from` thì được, vì Tailwind v4 dựng `--tw-gradient-stops` từ nó.
- **Đánh đổi phải biết:** trong light mode, `teal-600` không còn đúng là teal-600 của Tailwind. Ai tra bảng màu gốc sẽ thấy lệch.
- **Còn nợ, đã đo:** chữ phụ `text-slate-500` đạt ~3.9:1, vẫn dưới 4.5 cho chữ nhỏ. Đẩy lên `slate-600` sẽ đạt chuẩn nhưng làm phẳng phân cấp chữ chính/phụ — đó là quyết định thiết kế, không phải việc sửa máy móc.
- **Sửa thêm 2026-11-20**, chuyển tay từ nhánh chưa gộp `claude/design-system-extraction-y42xka` (viết 2026-09-27). Số đo dùng màu `oklch()` của Tailwind v4 trong `node_modules/tailwindcss/theme.css`, không dùng hex v3 (v4 `teal-700` là `#00786f`, v3 là `#0f766e`):
  - Vòng focus và vòng "câu đang xem" `ring-teal-500` ở light mode chỉ 2,0–2,4:1 → ghi đè `--tw-ring-color` sang teal-700 trong khối sửa light mode của `globals.css` (4,4–5,4:1). Chỉ vòng đặc, đúng bốn biến thể đang dùng: `ring-`, `focus:`, `focus-visible:`, `has-[:focus-visible]:` — thêm biến thể mới (vd. `focus-within:`) thì phải thêm vào selector. Quầng mờ có `/opacity` đi kèm `focus:border-*` giữ nguyên; dark mode không đổi.
  - Ô "đã làm" của `ExamSidebar`/`PracticeSidebar`: số trắng trên green-500/600 chỉ 2,2/3,2:1 → green-700 ở cả hai chế độ (4,95:1), hover green-800. `PracticeSidebar` có thêm `aria-label` "Câu N — đã làm/chưa làm", `aria-current` và vòng `focus-visible` như `ExamSidebar`.
  - Avatar chữ cái đầu ở `/admin/users`, `/admin/access`, `/admin/students`, `/admin/students/[id]`, `/leaderboard`: chữ trắng trên teal-400/500 chỉ 1,9/2,4:1 → `from-teal-700 to-blue-700` (5,4 / 6,8:1).
  - Banner "Thứ hạng của bạn" ở `/leaderboard` và đầu thẻ `/exam/prepare/[examId]` có chữ phụ nhỏ trắng/80, chỉ 2,0:1 ở đầu sáng → đầu teal xuống -800 (`from-teal-800 to-blue-700`, `from-teal-800 to-emerald-800`), chữ phụ ≥ 4,9:1.
  - Bục vinh danh: chữ trắng trên bạc/vàng 1,5–2,6:1 → chữ `slate-800` / `amber-950` (≥ 5,6:1). Bục đồng vốn đã hiện amber-950 nhờ khối `.from-amber-500.text-white` của `globals.css`; đổi class chỉ để source nói đúng cái đang hiện.
- **Quy tắc rút ra:** chữ trên gradient phải đạt chuẩn ở **cả hai đầu**, kể cả chữ phụ có độ trong suốt (`text-white/80` trên teal-700 chỉ còn 4,0:1 — vì thế banner dùng teal-800). Nền sáng (amber, yellow, kim loại) đi với chữ tối, không đi với chữ trắng.

## Chất liệu lớp học Toán (2026-11-15)

Đợt phục dựng trang chủ và khu học sinh. Không thêm màu hay font mới — chỉ thêm
CHẤT LIỆU lấy từ chính lớp học, nối tiếp hướng "giấy kẻ ô và mực" ở
`STUDENT_SKILL_TREE_REDESIGN.md` mục 7.2. Toàn bộ nằm ở khối "LỚP HỌC TOÁN" trong
`globals.css`; đọc chú thích ở đó trước khi sửa.

| Class / component | Là gì | Dùng ở |
|---|---|---|
| `.paper-grid` | Giấy ô li hai cấp: ô 16px, cứ năm ô một đường đậm pha teal | Đầu trang, ô dẫn dắt, form |
| `.ruler-edge` | Vạch thước (80px / 16px) dọc cạnh trên | Thanh điều hướng, đầu trang, footer |
| `.board` (+ `.board-ledge`) | Bảng xanh + phấn, có khay phấn | Hero trang chủ, khối kêu gọi cuối trang, đầu `/learn` |
| `.chalk-dim`, `.chalk-teal`, `.chalk-yellow`, `.chalk-stroke` | Chữ và nét phấn trên bảng | Chỉ bên trong `.board` |
| `.kicker` | Nhãn nhỏ trên tiêu đề, mở đầu bằng một khúc trục số | Mọi tiêu đề section / đầu trang |
| `.glyph-mark` | Ký hiệu toán cỡ lớn, rất nhạt, ở góc ô | Ô truy cập nhanh, đầu trang |
| `.toc-dots` | Hàng chấm dẫn của trang mục lục | Chuyên mục kiến thức |
| `landing/SectionHeading` | Nhãn + tiêu đề + trục số + mô tả | Mọi section trang chủ |
| `student/PageHero` | Đầu trang dùng chung: icon/ảnh, nhãn, tiêu đề, cột phải | Bài tập, Ôn tập, Thi thử, Lịch sử, Phân tích, Công cụ, Cài đặt |

Quy tắc, mỗi cái đến từ một lỗi thật trong đợt này:

- **`.ruler-edge` và `.kicker` nằm trong `@layer components`**, khác phần còn lại
  của file. Quy tắc viết trần thắng mọi utility Tailwind v4 bất kể độ ưu tiên:
  `.ruler-edge { position: relative }` viết trần đã đè `fixed` của thanh điều
  hướng học sinh, và `.kicker` viết trần làm `text-amber-700` trên nhãn không có
  tác dụng. Class nào mang giá trị MẶC ĐỊNH mà chỗ dùng cần đè được thì phải vào
  layer.
- **`.ruler-edge` không đứng chung phần tử với `.bento-rail`** — cả hai vẽ bằng
  `::before`, cái viết sau đè cái viết trước.
- **Nút trên bảng dùng teal SÁNG chữ tối** (`bg-teal-300 text-teal-950`), không
  dùng `bg-teal-600 text-white` — teal đậm chìm vào mặt bảng cùng sắc.
- **Nút teal đặc ngoài bảng luôn đi cặp `dark:bg-teal-500`**: khối sửa tương phản
  dark mode đổi `text-white` trên nền đó sang teal-950. Thiếu cặp này thì dark
  mode giữ teal-600 tối trên nền tối.
- **Mỗi trang vẫn tối đa một bề mặt gradient** (trang chủ: nút "Đăng ký miễn
  phí"; Hôm nay: nút việc-nên-làm; Phân tích: thẻ việc-nên-làm). Vệt phấn
  `radial-gradient` của `.board` là chất liệu bảng, không phải bề mặt gradient.
  Các nút ở header và nút nổi "Đăng ký học" đã bỏ dải `from-teal-600 to-teal-500`
  (chữ trắng 2,4:1 ở đầu sáng) sang teal đặc.
- **Hoạ tiết luôn `aria-hidden`**: ký hiệu `.glyph-mark`, trục số của
  `SectionHeading`, và cả số thứ tự trong mục lục (`<ol>` đã nói thứ tự; để số
  lọt vào tên link thì trình đọc màn hình đọc "không một Hàm số…"). Không đặt
  `.glyph-mark` sau vòng tiến độ — nó lộ qua lòng vòng.
- **Sửa `globals.css` lúc dev server đang tắt thì khởi động lại có thể nhận CSS
  cũ** (gặp hai lần trong đợt này: class mới không có trong CSS trả về, dù biên
  dịch trực tiếp thì có). Xoá `.next` rồi chạy lại `next dev`.

## Checklist UI

- [ ] Tiếng Việt nhất quán, có dấu.
- [ ] Desktop/mobile; light/dark.
- [ ] Keyboard focus và accessible name.
- [ ] Loading/empty/error/disabled.
- [ ] Không có raw `<img>` thiếu alt hoặc kích thước.
- [ ] Không có text/nền tương phản quá thấp.
- [ ] Math/TikZ/Markdown dài không vỡ layout.
- [ ] Không lộ dữ liệu/đáp án qua UI state hoặc payload.
