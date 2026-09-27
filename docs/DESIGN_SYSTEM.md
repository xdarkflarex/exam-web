# Hệ thống thiết kế

Mục tiêu: UI tiếng Việt dễ đọc lâu, ít chói, nhất quán giữa public/student/admin và không cản luồng làm bài.

## Token nguồn sự thật

Token runtime nằm trong `src/app/globals.css`.

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--background` | `#eef1f6` | `#0f172a` | Nền trang — tối nhất trong ba bậc nền ở light mode |
| `--background-card` | `#f7f9fc` | `#1e293b` | Card/panel, nổi lên trên nền |
| `--background-raised` | `#ffffff` | `#334155` | Ô nhập, vùng cần nổi rõ nhất (chỗ duy nhất được trắng thuần) |
| `--background-overlay` | `rgba(238,241,246,.92)` | `rgba(15,23,42,.9)` | Lớp phủ loading |
| `--foreground` | `#1e293b` | `#e2e8f0` | Text chính |
| `--foreground-secondary` | `#475569` | `#94a3b8` | Text phụ |
| `--foreground-muted` | `#64748b` | `#64748b` | Hiện chỉ dùng cho thanh cuộn. Dark mode chỉ đạt 3,1–3,75:1 — đừng dùng cho chữ |
| `--border` | `#dbe1ea` | `#334155` | Border |
| `--border-strong` | `#94a3b8` | `#475569` | Thanh cuộn. Dưới 3:1 — đừng dùng làm viền control |
| `--accent` | `#0f766e` | `#2dd4bf` | Primary teal |
| `--accent-hover` | `#115e59` | `#14b8a6` | Hover/focus |
| `--accent-soft` | `#ccfbf1` | `#134e4a` | Nền badge/nút phụ |
| `--accent-soft-text` | `#115e59` | `#99f6e4` | Chữ trên `--accent-soft` |

Token chuyển động (`--mm-motion-*`, `--mm-ease-*`) nằm cùng file; tiền tố `--mm-` là bắt buộc vì Tailwind v4 giữ namespace `--ease-*`, `--color-*`, `--font-*`…

**Bảng màu utility là của Tailwind v4, không phải v3.** `teal-500`, `green-700`… biên dịch ra `oklch()` và lệch mã hex quen thuộc của v3 (v4 `teal-700` ≈ `#00786f`, v3 là `#0f766e`). Đo tương phản phải dùng màu v4; các token viết tay ở bảng trên thì đúng như ghi.

CSS còn một nhóm semantic token blue/orange/success/warning/error ở cuối file. Khi refactor, hợp nhất dần thay vì tạo hệ màu thứ ba.

## Typography

- Inter cho UI/body; Baloo 2 có thể dùng cho điểm nhấn thân thiện với học sinh.
- Root đã cấu hình subset Vietnamese và `display: swap`.
- Class `font-baloo` chỉ tồn tại vì `@theme inline` trong `globals.css` khai báo `--font-baloo` (trỏ vào `--font-baloo-2` của next/font). Trước 2026-09-27 dòng đó thiếu nên Tailwind v4 không sinh class, và 49 chỗ `font-baloo` âm thầm hiện bằng Inter. Font mới phải khai báo trong `@theme` theo cùng cách; đừng đặt tên biến next/font trùng namespace `--font-*`.
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
- **Sửa thêm 2026-09-27** (cùng cách, cùng khối trong `globals.css`):
  - Vòng focus và vòng "câu đang xem" `ring-teal-500` ở light mode chỉ 2,0–2,4:1 → ghi đè `--tw-ring-color` sang teal-700 (4,4–5,4:1). Chỉ vòng đặc; quầng mờ `/20` `/30` đi kèm `focus:border-*` giữ nguyên.
  - Nút gradient `from-teal-600 to-teal-500 text-white`: khối cũ chỉ sửa đầu trái, đầu phải vẫn 2,4:1 → cả dải teal-800 → teal-700.
  - Ô "đã làm" của `ExamSidebar`/`PracticeSidebar`: số trắng trên green-500/600 chỉ 2,2/3,2:1 → green-700 ở cả hai chế độ (4,95:1).
  - CTA "Hôm nay" (`TodayHero`): mỗi tông mang cả màu chữ; amber dùng chữ amber-950, không bao giờ chữ trắng.
  - Mọi gradient chữ trắng còn lại (quét toàn `src`, 12 chỗ): avatar chữ cái đầu ở admin và leaderboard → teal-700 → blue-700; banner leaderboard, header trang chuẩn bị thi và thẻ "Việc nên làm tiếp theo" ở analytics → dải -800 để chữ phụ trắng/80 vẫn đạt 4,5:1; bục vinh danh bạc/vàng/đồng → chữ tối (slate-800 / amber-950).
- **Quy tắc rút ra:** chữ trên gradient phải đạt chuẩn ở **cả hai đầu**, kể cả chữ phụ có độ trong suốt (`text-white/80` trên teal-700 chỉ còn 4,0:1). Nền sáng (amber, yellow, kim loại) đi với chữ tối, không đi với chữ trắng.

## Checklist UI

- [ ] Tiếng Việt nhất quán, có dấu.
- [ ] Desktop/mobile; light/dark.
- [ ] Keyboard focus và accessible name.
- [ ] Loading/empty/error/disabled.
- [ ] Không có raw `<img>` thiếu alt hoặc kích thước.
- [ ] Không có text/nền tương phản quá thấp.
- [ ] Math/TikZ/Markdown dài không vỡ layout.
- [ ] Không lộ dữ liệu/đáp án qua UI state hoặc payload.
