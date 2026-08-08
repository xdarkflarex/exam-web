# Việc design còn lại — bàn giao cho phiên làm việc sau

Viết ngày 2026-08-08, sau đợt sửa theme/tương phản đi kèm tính năng chấm tự luận.
Mọi con số trong file này là **đo được**, không phải ước lượng — cách đo ghi ở cuối.

Đọc `docs/DESIGN_SYSTEM.md` mục "Theme" và "Tương phản" trước; file này chỉ liệt kê
việc **chưa làm**.

---

## 0. Bốn bất biến KHÔNG được phá

Ba lỗi thật đã tốn cả ngày 2026-08-07 để tìm ra. Đừng làm lại.

1. **Class `dark` trên `<html>` là nguồn sự thật duy nhất**, do script inline trong
   `src/app/layout.tsx` đặt **trước lượt vẽ đầu**. Không thêm nguồn thứ hai
   (`prefers-color-scheme` trong CSS, biến riêng, state khác).

2. **Không đặt màu nền/chữ toàn cục trên `<body>` bằng utility Tailwind.** Chỉ dùng
   biến `--background` / `--foreground` trong `globals.css`. Utility thắng selector
   `html, body`, nên đặt cả hai nơi thì bảng màu bằng biến không có tác dụng — đó
   đúng là lỗi đã xảy ra.

3. **`ThemeProvider` không được chặn render** (`return null` chờ mount). Bản cũ làm
   vậy và nó **che ba lỗi khác nhau** cùng lúc: hai lỗi hydration mismatch và một
   lỗi build (`useSearchParams` thiếu `<Suspense>`). Chặn SSR không phải là sửa,
   chỉ là giấu.

4. **Markup không được phụ thuộc giá trị `theme` của JS.** Dùng biến thể `dark:`
   của CSS. Trên server `theme` luôn là `'light'`, trên client là giá trị thật →
   lệch hydration. Áp dụng cho cả thuộc tính (`aria-label`, `title`), không chỉ
   `className` — lỗi đã xảy ra ở `StudentSidebar` đúng vì quên thuộc tính.

---

## 1. Tương phản — đã làm một phần, còn nợ có chủ đích

Trạng thái hiện tại đo trên trang chủ:

| Chế độ | Trước | Sau | Còn lại |
|---|---|---|---|
| Light | 27 lỗi WCAG AA | **15** | chủ yếu `text-slate-500` |
| Dark | — | **12** | badge `bg-teal-600` + chữ trắng |

Đã sửa bằng cách ghi đè class dưới `html:not(.dark)` trong `globals.css` (một chỗ,
thay cho ~600 chỗ dùng): `text-teal-600`, `bg-teal-600`, `from-teal-600`,
`text-slate-400`, `text-red-500`.

### Quyết định đang treo, cần chủ dự án chọn

**`text-slate-500` đang ở ~3.9:1, dưới chuẩn 4.5 cho chữ nhỏ.** Đẩy lên
`slate-600` là đạt chuẩn, nhưng chữ chính (`slate-800`) và chữ phụ sẽ đậm gần bằng
nhau → mất phân cấp thị giác. Đây là đánh đổi thẩm mỹ, không phải lỗi máy móc.
531 chỗ dùng.

Ba lựa chọn, chưa chọn cái nào:
- Giữ nguyên, chấp nhận 3.9:1 cho chữ phụ.
- Đẩy `slate-500` → `slate-600`, đồng thời làm nhạt chữ chính hoặc đổi cỡ/độ đậm
  để giữ phân cấp.
- Chỉ đẩy ở nơi chữ nhỏ (`text-xs`, `text-[11px]`), giữ nguyên chỗ khác.

### Hai cách KHÔNG dùng được (đã thử, đã đo)

- **Ghi đè token `--color-teal-600` trong `:root`: KHÔNG CHẠY.** Tailwind v4 ở dự
  án này biên dịch utility thành giá trị màu cứng, không phải `var(--color-*)`.
  Kiểm bằng `document.documentElement.style.setProperty('--color-slate-400','red')`
  lúc chạy — màu chữ không đổi. Đừng thử lại.
- **`.bg-teal-600` không chạm nút gradient** vì màu nằm ở `background-image`. Phải
  ghi đè `--tw-gradient-from` riêng (cách này thì chạy).

---

## 2. Dark mode ở trang quản trị — phần lớn công việc còn lại

**1292 class chỉ-sáng** nằm rải trong **125 file** đã có `dark:` nhưng lẫn lộn.
Không còn file nào thiếu `dark:` hoàn toàn (6 file đó đã xử lý ngày 2026-08-07,
thêm 144 biến thể).

30 file nặng nhất, sắp theo số class chỉ-sáng:

| Số | File |
|---|---|
| 61 | `src/app/admin/theories/import/page.tsx` |
| 54 | `src/app/admin/classes/page.tsx` |
| 50 | `src/app/admin/questions/page.tsx` |
| 47 | `src/app/admin/exams/[examId]/page.tsx` |
| 37 | `src/app/admin/users/page.tsx` |
| 37 | `src/app/admin/analytics/page.tsx` |
| 34 | `src/app/admin/students/page.tsx` |
| 33 | `src/app/admin/theories/[id]/edit/page.tsx` |
| 30 | `src/app/(student)/student/settings/page.tsx` |
| 26 | `src/app/admin/exams/[examId]/results/page.tsx` |
| 26 | `src/app/(student)/student/history/page.tsx` |
| 25 | `src/app/admin/enrollments/page.tsx` |
| 24 | `src/app/admin/knowledge-links/[theoryId]/page.tsx` |
| 23 | `src/app/admin/announcements/page.tsx` |
| 22 | `src/app/admin/latex-templates/page.tsx` |
| 21 | `src/app/admin/students/[id]/page.tsx` |
| 20 | `src/app/admin/landing/page.tsx` |
| 20 | `src/app/admin/attempts/[attemptId]/page.tsx` |
| 20 | `src/app/(student)/student/analytics/page.tsx` |
| 19 | `src/app/admin/reports/page.tsx` |
| 19 | `src/app/admin/exams/[examId]/questions/page.tsx` |
| 19 | `src/app/admin/essay-ai/page.tsx` |
| 18 | `src/app/admin/theories/[id]/edges/page.tsx` |
| 18 | `src/app/admin/exams/[examId]/publish/page.tsx` |
| 17 | `src/app/admin/theories/page.tsx` |
| 17 | `src/app/admin/questions/sources/page.tsx` |
| 17 | `src/app/(student)/student/page.tsx` |
| 16 | `src/app/admin/settings/page.tsx` |
| 15 | `src/app/admin/theories/export/page.tsx` |
| 14 | `src/app/admin/questions/essay/new/page.tsx` |

Lấy lại danh sách này bất cứ lúc nào:

```bash
for f in $(grep -rl "dark:" src/app src/components --include=*.tsx); do \
  l=$(grep -o "bg-white\b\|bg-slate-50\b\|text-slate-900\b\|text-slate-800\b\|text-slate-700\b" "$f" | wc -l); \
  [ "$l" -gt 8 ] && printf "%3s | %s\n" "$l" "$f"; done | sort -rn
```

### Cặp thay thế đã dùng ngày 2026-08-07 (giữ nhất quán)

| Class sáng | Thêm biến thể |
|---|---|
| `bg-white` | `dark:bg-slate-800` |
| `bg-slate-50` | `dark:bg-slate-900` |
| `bg-slate-100` | `dark:bg-slate-700` |
| `text-slate-900` | `dark:text-slate-50` |
| `text-slate-800` | `dark:text-slate-100` |
| `text-slate-700` | `dark:text-slate-200` |
| `text-slate-600` | `dark:text-slate-300` |
| `text-slate-500` | `dark:text-slate-400` |
| `border-slate-200` | `dark:border-slate-700` |
| `border-slate-300` | `dark:border-slate-600` |

**Cảnh báo về cách làm hàng loạt.** Ngày 2026-08-07 tôi dùng script Node thêm 144
biến thể vào 6 file — chạy được, nhưng nó **máy móc**: không phân biệt nền sáng cố
ý (badge, nút màu, vùng nhấn) với nền sáng do thiếu dark mode. Với 1292 chỗ còn
lại, script mù sẽ tạo ra kết quả xấu ở nhiều nơi. Nên đi theo trang, nhìn bằng
mắt, ưu tiên trang dùng nhiều.

---

## 3. Chưa nhìn bằng mắt bao giờ

- **144 biến thể `dark:` thêm ngày 2026-08-07** trong 6 file (`exams/[examId]/questions`,
  `exams/[examId]/publish`, `attempts/[attemptId]`, `QuestionEditor`,
  `ExamListCard`, `ImageCarousel`) — đúng về mặt cơ học, chưa ai mở ra xem.
- **Mọi trang cần đăng nhập.** Số đo tương phản trong file này chỉ lấy từ trang
  chủ; trang admin và trang học sinh chưa đo lần nào.

---

## 4. Nền và thẻ — đã đổi, có thể cần chỉnh tiếp

```css
--background: #eef1f6;        /* nền trang, hạ từ gần-trắng để bớt chói */
--background-card: #f7f9fc;   /* thẻ nổi lên trên nền */
--background-raised: #ffffff; /* chỉ cho ô nhập/vùng cần nổi nhất */
```

Nhưng **phần lớn component vẫn hardcode `bg-white`** (346 chỗ), nên ba biến này
mới chỉ ảnh hưởng nền trang. Muốn thẻ thật sự dịu hơn thì phải đổi `bg-white` ở
từng nơi — chưa làm, và cần quyết định thiết kế trước: thẻ trắng trên nền xám nhạt
là mẫu quen thuộc và dễ chịu, có thể không cần đổi.

---

## 5. Cách đo lại

Script quét tương phản WCAG chạy trong Console trình duyệt. Ba điểm phải giữ,
nếu không số đo sẽ sai:

1. **Chuyển màu bằng canvas**, đừng parse chuỗi. Chrome trả màu dạng `lab(...)` cho
   Tailwind v4; regex kiểu RGB cho ra tỉ số vô nghĩa (lần đầu tôi đo 27 lỗi với
   tỉ số 1.02 — sai hoàn toàn).
2. **Đổi theme bằng `localStorage` + `location.reload()`**, đừng bật/tắt class bằng
   JS giữa trang. Bật class bằng tay cho ra 50 lỗi giả ở dark mode; đo lại đúng
   cách ra 12.
3. **Ngưỡng theo cỡ chữ**: 4.5:1 cho chữ thường, 3:1 cho chữ ≥24px hoặc ≥18.66px
   in đậm.

Script đầy đủ nằm trong lịch sử phiên 2026-08-07; dựng lại theo ba điểm trên là đủ.

---

## 6. Thứ tự đề nghị

1. Chốt quyết định `text-slate-500` (mục 1) — nó ảnh hưởng 531 chỗ, làm trước thì
   khỏi sửa hai lần.
2. Mở 6 file đã sửa máy móc ngày 2026-08-07, xem bằng mắt ở cả hai chế độ (mục 3).
3. Đo tương phản trên trang admin và trang học sinh — hiện chưa có số nào.
4. Đi theo trang trong bảng mục 2, ưu tiên trang dùng nhiều: `questions`,
   `classes`, `exams/[examId]`.
5. Cân nhắc `bg-white` → `--background-card` (mục 4), sau khi đã quyết mục 1.
