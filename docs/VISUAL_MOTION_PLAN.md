# Kế hoạch làm nổi thị giác — landing + dashboard học sinh

Tiếp nối `DESIGN_OVERHAUL_2026-08-09.md`. Đợt trước sửa **cấu trúc** (bento, bỏ
khuôn card lặp). Đợt này sửa **chuyển động và bề mặt**.

Nguồn tham khảo kỹ thuật: `pythonmaster.vn` (theme Elementor `mindverse`), bóc
token CSS / keyframes / ScrollTrigger đang chạy thật ngày 2026-08-15. **Chỉ lấy
kỹ thuật, không lấy nội dung marketing, không lấy palette.**

> **Bản 2 (2026-08-15).** Bản 1 viết trước khi đọc source, và sai 5 chỗ. Mục 11
> ghi lại từng cái cùng bằng chứng — giữ lại vì hai trong số đó là bài học về
> repo này, không phải lỗi vặt.

---

## 0. Ràng buộc — không được phá

Bảy nguyên tắc ở `DESIGN_OVERHAUL_2026-08-09.md` mục 2 giữ nguyên. Ba cái đợt
này dễ vi phạm nhất:

- **NT2 — teal là màu của hành động.** Không sinh màu accent thứ hai cho nút.
- **NT3 — mỗi trang tối đa MỘT bề mặt gradient.** Trên landing nó thuộc về nút
  CTA cuối trang. Không thêm cái thứ hai.
- **NT6 — chuyển động phải nằm trong lưới `prefers-reduced-motion`**
  (`globals.css:1138`).

Cộng thêm, từ `AGENTS.md`:

- **§6 — ưu tiên primitive hiện có, tránh thêm lớp trùng chức năng.** Đây là
  điều bản 1 vi phạm nặng nhất.
- **§2 — file đang dirty phải đọc diff trước khi chạm.** `TodayHero.tsx` đang
  dirty (bản sửa "Chưa ghi nhận hoạt động" ngày 2026-08-14, chưa commit).
- **§8 — ma trận xác minh:** `npx.cmd tsc --noEmit --incremental false` +
  `npx.cmd eslint <file>`; thêm `npm.cmd run build` nếu đụng route/config.

Hai nguyên tắc mới cho đợt này:

- **NT8 — không animation nào được gây layout shift.** Chỉ `transform`,
  `opacity`, `clip-path`, `stroke-dashoffset`.
- **NT9 — mọi con số chạy phải là số thật**, và phải đọc được kể cả khi
  animation không chạy.

---

## 1. Vốn liếng đã có (kiểm bằng source, không phải trí nhớ)

Trước khi thêm gì, đây là thứ repo **đã có** — bản 1 bỏ sót gần hết:

| Có sẵn | Ở đâu | Ghi chú |
|---|---|---|
| `CountUpNumber` | `components/landing/CountUpNumber.tsx` | IntersectionObserver, easeOutCubic, **đã xử lý reduced-motion bằng JS**, SSR ra số cuối |
| `StatsStrip` đã đếm số | `components/landing/StatsStrip.tsx` | Đã có `tabular-nums`, đã có ngưỡng `MIN_DE_HIEN = 10` |
| `HeroParallax` | `components/landing/HeroParallax.tsx` | rAF + `transform`, đo trên phần tử **cha** để tránh hồi tiếp, `will-change` chỉ bật lúc cuộn |
| Stagger | `globals.css` `.stagger-children` (1–8), `.animate-list-stagger` (1–20) | Cả hai đã nằm trong lưới reduced-motion |
| Nút | `.btn-action`, `.btn-action-sm` | **Chỉ dùng ở 5 file**, không có landing, không có dashboard |
| Bento | `.bento-tile`, `.bento-tile-lead`, `.bento-tile-quiet`, `.bento-rail` | Đã có 3 cấp + dải màu trái |
| `.paper-grid` | `globals.css:784` | Hoạ tiết giấy kẻ ô |
| **GSAP 3.15** | `package.json`, import ở `src/app/learn/page.tsx` | **Đã là dependency** |
| Token màu | `:root` / `html.dark` | `--accent`, `--border`, `--background-card`… |

**Chưa có:** token thời lượng/easing, nhóm `reveal-in-*` (clip-path), vẽ vòng
tiến độ theo animation, gờ inset cho nút.

---

## 2. Phase 0 — Vá `ScrollRevealClient` (mới, làm trước tiên)

Đây là việc quan trọng nhất trong cả kế hoạch, và bản 1 không hề nhắc tới.

`components/ScrollRevealClient.tsx` bọc **gần như mọi section của landing**. Nó
render `opacity-0` ở server rồi chờ IntersectionObserver bật lên `opacity-100`.
Hai vấn đề:

1. **Không có phép kiểm `prefers-reduced-motion` nào cả.** Đây là điểm lệch với
   chính chuẩn của repo: `CountUpNumber` và `HeroParallax` đều tự đọc media query
   trong JS, vì cả hai biết lưới CSS ở `globals.css` không với tới chúng.
2. **Nội dung phụ thuộc hoàn toàn vào JS.** `opacity-0` là utility class, không
   phải animation — nên lưới reduced-motion (chỉ ép `opacity: 1` cho
   `.stagger-children > *` và `.animate-list-stagger > *`) **không cứu được nó**.
   JS lỗi hoặc observer không kích hoạt là cả trang chủ vô hình.

Sửa, theo đúng khuôn `CountUpNumber` đã đặt:

```tsx
const [isVisible, setIsVisible] = useState(false)

useEffect(() => {
  // Reduced-motion: hiện ngay, không quan sát gì. Cùng lý do với CountUpNumber —
  // đây là opacity do JS lái, lưới CSS ở globals.css không chạm tới được.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setIsVisible(true)
    return
  }
  // …observer như cũ
}, [delay])
```

Và thêm `.scroll-reveal` vào danh sách ép `opacity: 1` trong khối reduced-motion
của `globals.css`, làm lớp phòng thủ thứ hai.

**Rủi ro:** thấp. **Kiểm:** bật "giảm chuyển động" trong OS → mọi section hiện
đầy đủ ngay khi tải, không chờ cuộn.

---

## 3. Phase 1 — Token motion

```css
:root {
  --mm-motion-fast: .18s;   /* hover, focus, chip        */
  --mm-motion-base: .32s;   /* card, panel, nút          */
  --mm-motion-slow: .6s;    /* reveal khi cuộn, vẽ vòng  */

  --mm-ease-out:    cubic-bezier(.25,.46,.45,.94);
  --mm-ease-in-out: cubic-bezier(.4,0,.2,1);
  --mm-ease-back:   cubic-bezier(.68,-.55,.265,1.55);
}
```

Ba đường cong này **đã tồn tại rải rác** trong `globals.css` (dòng 441, 867,
911). Đây là gom lại.

**BẮT BUỘC tiền tố `--mm-`.** Bản đầu đặt thẳng `--ease-out` và đã âm thầm đổi
đường cong của **mọi** utility `ease-out` trong toàn app — Tailwind v4 coi
`--ease-*` là namespace theme của nó, utility `ease-out` biên dịch thành
`var(--ease-out)`, và `:root` của `globals.css` nằm sau `@import "tailwindcss"`
nên thắng. Đo lúc chạy 2026-08-15: `cubic-bezier(0,0,.2,1)` →
`cubic-bezier(.25,.46,.45,.94)`. Các namespace khác phải tránh khi đặt token
mới: `--color-*`, `--font-*`, `--text-*`, `--spacing-*`, `--radius-*`,
`--shadow-*`, `--blur-*`, `--animate-*`, `--breakpoint-*`, `--tracking-*`,
`--leading-*`, `--aspect-*`.

**Phạm vi thật, nói thẳng:** token này **không** ảnh hưởng các utility Tailwind
kiểu `duration-300` rải khắp component — Tailwind v4 ở dự án này biên dịch ra
giá trị cứng (đã ghi tại `globals.css:87–95`). Nó chỉ phục vụ CSS viết tay trong
`globals.css`. Bản 1 gọi đây là "nền cho mọi phase sau" là nói quá; đúng hơn nó
là dọn dẹp để phase 2–4 không rải thêm số lẻ.

Declare ở `:root` thường, **không** dùng `@theme` — khớp với cách file này đang
làm.

---

## 4. Phase 2 — Nhóm `reveal-in-*` (clip-path)

Nhóm duy nhất trong ~80 keyframes của pythonmaster mà ta thật sự thiếu. Khác
`fade-in-up` ở chỗ nội dung **bị lộ ra** thay vì trượt vào.

```css
@keyframes reveal-in-left {
  from { clip-path: inset(0 100% 0 0) }
  to   { clip-path: inset(0 0 0 0)    }
}
@keyframes reveal-in-bottom {
  from { clip-path: inset(100% 0 0 0) }
  to   { clip-path: inset(0 0 0 0)    }
}

.reveal-left   { animation: reveal-in-left   var(--motion-slow) var(--ease-out) both }
.reveal-bottom { animation: reveal-in-bottom var(--motion-slow) var(--ease-out) both }
```

**Không animate `opacity` kèm theo.** Bản 1 đề xuất `opacity: .4 → 1`; bỏ, vì
`clip-path` một mình đã đủ và thêm opacity là thêm một thứ có thể kẹt ở trạng
thái mờ. Với `both` + lưới reduced-motion (`animation-duration: .01ms`) thì
trạng thái cuối luôn được áp — nội dung không bao giờ mất.

Dùng ở: dải khâu học `/learn`, tiêu đề section landing, ô dẫn dắt bento.

---

## 5. Phase 3 — Mở rộng đếm số sang dashboard

**Không viết component mới.** `CountUpNumber` đã đúng chuẩn cần có.

Việc thật:

1. **Chuyển `components/landing/CountUpNumber.tsx` → `components/motion/CountUpNumber.tsx`.**
   Nó sắp được dùng ngoài landing nên chỗ hiện tại thành sai tên. Sửa 1 import ở
   `StatsStrip.tsx`. (Grep `CountUpNumber` trước khi chuyển để chắc chỉ 1 nơi dùng.)
2. **`TodayHero`** — bọc số ngày chuỗi (`{streak} ngày liên tiếp`) khi `streak >= 2`.
   **Đọc diff của file này trước** (AGENTS.md §2): nó đang dirty với bản sửa
   `hasActivity` chưa commit, phải giữ nguyên phần đó.
3. **Chip tóm tắt ở `student/page.tsx`**: **không** đếm. Giá trị thường là 1–3;
   đếm từ 0 lên 2 là chuyển động vô nghĩa. Chỉ đếm khi `value >= 10` — nếu muốn
   quy tắc này áp chung thì thêm ngưỡng vào chính `CountUpNumber`.

**Không làm:** đếm số bên trong `ProgressRing`. Nó là **server component thuần**
(`viz/ProgressRing.tsx`, không `'use client'`), dùng ở nhiều trang. Biến nó
thành client component chỉ để đếm một con số là đánh đổi sai. Xem phase 3b cho
cách đạt hiệu ứng tương đương mà không tốn gì.

---

## 6. Phase 3b — Vẽ vòng tiến độ bằng CSS thuần (thay cho ý tưởng counter)

`ProgressRing` vẽ cung bằng `strokeDasharray={`${dash} ${circumference - dash}`}`.
Cho cung **chạy từ 0 tới giá trị** chỉ cần animate `stroke-dashoffset` — làm được
hoàn toàn bằng CSS, **không cần `'use client'`, không thêm một byte JS nào**:

```css
@keyframes ring-draw { from { stroke-dashoffset: var(--ring-len) } to { stroke-dashoffset: 0 } }

.ring-arc {
  stroke-dashoffset: 0;
  animation: ring-draw var(--motion-slow) var(--ease-out) both;
}
```

Component truyền `--ring-len: {circumference}` qua `style` và đặt `dasharray` là
`${dash} ${circumference - dash}` như cũ. Reduced-motion tự tắt qua lưới có sẵn,
và vì `both` nên trạng thái cuối luôn đúng.

Đây là một prop `animate?: boolean` mặc định `false` — các chỗ dùng khác của
`ProgressRing` (analytics, history) không đổi hành vi.

---

## 7. Phase 4 — Nút: gờ sáng inset

Kỹ thuật lấy từ họ: `box-shadow: inset 0 3.1px .78px rgba(255,255,255,.14)` —
giả ánh sáng rọi từ trên, làm nút có khối thay vì là vệt màu phẳng.

**Bản 1 định tạo class `.btn-solid` mới. Bỏ** — trùng chức năng `.btn-action`
(AGENTS.md §6). Mở rộng cái đang có, nhưng **gờ sáng phải đặt ở `::after`**, không
phải `box-shadow` của chính nút:

```css
.btn-action { position: relative }
.btn-action::after {
  content: ''; position: absolute; inset: 0;
  border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .18);
}
.btn-action:hover { transform: translateY(-1px) }        /* bỏ scale() */
.btn-action:active::after { box-shadow: inset 0 2px 4px rgb(15 23 42 / .25) }
```

**Vì sao `::after`, đo lúc chạy trên `/login` ngày 2026-08-15:** quy tắc trong
`globals.css` nằm ngoài `@layer` nên **thắng utility Tailwind v4**. Viết
`box-shadow` thẳng vào `.btn-action` sẽ XOÁ `shadow-lg shadow-teal-600/20` của
nút đăng nhập và nút hoàn tất hồ sơ. Lớp phủ cộng thêm thay vì thay thế.

**Vì sao bỏ `scale()`:** `.btn-action` đang dùng trên nút `w-full` (LoginView,
complete-profile). Phóng to 3% một nút rộng cả khung làm mép trượt ra lề; thu
97% lúc bấm thì trông như nút co rúm.

**Điểm phải biết trước khi làm:** `.btn-action` hiện **chỉ dùng ở 5 file**
(`LoginView`, `admin/exams`, `complete-profile`, `exam/prepare`, và định nghĩa ở
`globals.css`) — **không có landing, không có dashboard học sinh**. Hai trang
đích đang viết nút bằng Tailwind thô, lặp lại chuỗi
`rounded-xl bg-teal-600 … active:scale-[.97]` khoảng 8–10 lần.

Nên phase này thực chất là **hai việc**, và việc thứ hai mới là phần lớn công sức:

- (a) thêm inset vào `.btn-action`;
- (b) thay các chuỗi Tailwind lặp ở landing + dashboard bằng `.btn-action`.

(b) là dọn nợ có thật (một nơi để sửa thay vì mười), nhưng nó **đụng nhiều JSX**
nên rủi ro cao hơn (a) nhiều. Có thể dừng sau (a) — chỉ là sẽ không thấy gì đổi
trên hai trang đích, nên nếu chỉ làm (a) thì đừng tính nó vào đợt làm đẹp này.

Kèm theo, hai micro-interaction rẻ:

```css
.btn-action .btn-icon { transition: transform var(--motion-fast) var(--ease-out) }
.btn-action:hover .btn-icon { transform: translateX(3px) }

.link-slide { background-image: linear-gradient(currentColor,currentColor);
  background-size: 0 1px; background-position: 0 100%; background-repeat: no-repeat;
  transition: background-size var(--motion-base) }
.link-slide:hover { background-size: 100% 1px }
```

---

## 8. Phase 5 — Dashboard: chống lặp khuôn

`/student` đang mắc đúng bệnh mà landing đã chữa: **năm loại thẻ, một khuôn**
(`rounded-2xl border p-4` + ô icon `h-10 w-10 rounded-xl`) — card đang làm,
`HomeworkCard`, card thi thử, card cập nhật, card quá hạn. Vi phạm NT1.

1. **"Tiếp tục việc đang làm" phải nặng hơn hẳn.** Nó là ưu tiên số một mà trông
   y như mục dưới. Dùng `.bento-rail` với `--rail` amber + bỏ ô icon vuông
   (icon inline cạnh tiêu đề). Tái dùng primitive đã có, không tạo class mới.
2. **Thanh tiến độ `HomeworkCard` phải chạy.** Hiện `style={{width: '40%'}}` tĩnh.
   Animate bằng `transform: scaleX()` + `transform-origin: left` — **không phải
   `width`**, tránh reflow mỗi frame. Đây là chuyển động **mang thông tin**.
   Lưu ý: `role="progressbar"` + `aria-valuenow` giữ nguyên, animation không được
   đụng vào giá trị a11y.
3. **Stagger cho danh sách:** dùng `.animate-list-stagger` **đã có sẵn** (hỗ trợ
   tới 20 phần tử, đã nằm trong lưới reduced-motion). Bản 1 định thêm biến
   `--stagger` theo index — đó là lớp thứ ba, bỏ.
4. **`TodayHero` là chỗ duy nhất trên dashboard được phép "đẹp"**: `.paper-grid`
   đã có, thêm vòng vẽ (phase 3b) + counter chuỗi ngày (phase 3).

**Từ chối:** đổi `TodayHero` sang nền tối. Dashboard là nơi vào mỗi ngày, không
phải nơi gây ấn tượng lần đầu. Muốn thử nền tối thì thử ở hero landing.

---

## 9. Đã bỏ: GSAP ScrollTrigger

Bản 1 xếp đây là phase cuối với lý do "+27KB". **Cả tiền đề lẫn kết luận đều
sai, nhưng vẫn ra đúng quyết định là bỏ** — cần ghi lại cho đúng lý do:

- `gsap ^3.15.0` **đã là dependency**, đang import ở `src/app/learn/page.tsx`.
  Chi phí thật của ScrollTrigger là **plugin (~11KB gz)**, không phải cả thư viện.
- Quan trọng hơn: **quyết định này đã được ra rồi**, ghi ngay trong docstring của
  `HeroParallax.tsx` — "kéo nó vào chỉ để chạy đúng một hiệu ứng trang trí trên
  trang chủ là không đáng". Và bản rAF hiện tại xử lý ba thứ mà một bản
  ScrollTrigger viết vội sẽ bỏ sót: đo trên phần tử **cha** (tránh hồi tiếp khi
  vừa đo vừa transform chính nó), `will-change` chỉ bật trong lúc cuộn, và
  reduced-motion chặn ngay từ việc gắn listener.

Viết lại nó bằng ScrollTrigger là re-litigate một quyết định đã có lập luận tốt
hơn. Nếu sau này thật sự cần `scrub` cho một hiệu ứng phức tạp hơn thì mở lại,
nhưng phải là vì hiệu ứng đó, không phải vì "dùng thư viện cho chuẩn".

---

## 10. Typography

Họ dùng ba font ba vai (`Goldman` h1 72px / `Space Grotesk` nút / `Golos Text`
thân). Ta có `Baloo 2` + `Inter`.

**Không thêm font thứ ba.** `DESIGN_OVERHAUL_2026-08-09.md` mục 1 đã từ chối đổi
typography, lý do vẫn đúng. Lấy *cách dùng*:

- h1 hero landing đang `text-4xl … lg:text-6xl`. Nâng `lg:text-7xl` +
  `tracking-tight` + `leading-[.95]` — cùng font, cảm giác display khác hẳn.
- `tabular-nums`: `StatsStrip` **đã có**. Cần bổ sung ở các số của dashboard
  (`TodayHero` chuỗi ngày, `HomeworkCard` "đã làm x/y") trước khi cho chúng đếm.

---

## 11. Bản 1 sai ở đâu (giữ lại làm bài học)

| # | Bản 1 nói | Thực tế | Bằng chứng |
|---|---|---|---|
| 1 | "Viết `CountUp` mới — tác động cao nhất" | Đã có `CountUpNumber`, đã dùng, đã xử lý reduced-motion | `components/landing/CountUpNumber.tsx` |
| 2 | "Thêm GSAP +27KB" | GSAP đã là dep; và đã có quyết định ngược, có lập luận tốt hơn | `package.json:18`, `HeroParallax.tsx` docstring |
| 3 | "Tạo class `.btn-solid`" | Trùng `.btn-action`; vi phạm AGENTS.md §6 | `globals.css:947` |
| 4 | "Thêm `--stagger` theo index" | `.animate-list-stagger` đã hỗ trợ tới 20 phần tử | `globals.css:920–944` |
| 5 | "Phải thêm `tabular-nums` trước phase 3" | `StatsStrip` đã có sẵn | `StatsStrip.tsx:88,112` |

Hai bài học về repo này, không phải về CSS:

- **Repo đã giải quyết phần lớn vấn đề bản 1 định giải quyết**, và giải kỹ hơn.
  Mọi kế hoạch cho repo này phải bắt đầu bằng đọc `globals.css` + grep primitive,
  không phải bằng danh sách kỹ thuật lấy từ site tham khảo.
- **Docstring ở đây chứa quyết định, không chỉ mô tả.** `HeroParallax` và
  `CountUpNumber` đều ghi rõ *vì sao không làm cách khác*. Đề xuất đi ngược chúng
  phải bác được lập luận đã ghi, không được lờ đi.

---

## 12. Thứ tự thi công

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Vá `ScrollRevealClient` reduced-motion (bằng CSS) | ✅ xong |
| 1 | Token motion `--mm-*` | ✅ xong |
| 2 | `reveal-in-left` / `reveal-in-bottom` | ✅ xong |
| 3 | `CountUpNumber` → `components/motion/`, ngưỡng 10, dùng ở `TodayHero` | ✅ xong |
| 3b | `ProgressRing` prop `animate`, vẽ cung bằng CSS | ✅ xong |
| 4a | Gờ inset `::after` cho `.btn-action`, bỏ `scale()` | ✅ xong |
| 4b | `.btn-action` cho 4 nút dashboard | ✅ xong |
| 5 | Dashboard chống lặp khuôn (rail, thanh tiến độ, stagger) | ✅ xong |

**Cố ý KHÔNG làm:** nút CTA gradient cuối landing giữ nguyên, không gắn
`.btn-action`. Nó có bộ bóng riêng (`shadow-lg shadow-teal-600/25` →
`hover:shadow-xl hover:shadow-teal-600/30`) mà `.btn-action:hover` sẽ đè mất.
Đây là nút mang bề mặt gradient duy nhất của trang (NT3), không đáng đánh đổi.

Mỗi phase một commit trên `design/visual-overhaul` để `revert` được từng cái.

---

## 13. Kiểm trước khi giao

- [ ] `npx.cmd tsc --noEmit --incremental false` sạch.
- [ ] `npx.cmd eslint <file đã sửa>` — không nới rule, không thêm `any`
      (AGENTS.md §9: lint toàn repo đang fail 113 error / 192 warning từ trước;
      ghi số trước/sau cho file đã sửa, không được để tăng).
- [ ] `npm.cmd run build` nếu đụng config.
- [ ] 375px: không tràn ngang ở landing và `/student`.
- [ ] **Bật "giảm chuyển động" → mọi section landing hiện ngay** (đây là phép thử
      của phase 0, và là bẫy lớn nhất của cả đợt).
- [ ] Dark mode: gờ inset không tạo viền sáng chói trên nền `#1e293b`.
- [ ] CLS = 0 trên landing (NT8).
- [ ] Đếm số bề mặt gradient trên landing — phải đúng **1** (NT3).
- [ ] `backdrop-filter` vẫn sống qua Lightning CSS (nợ đã biết ở mục 3 của
      `DESIGN_OVERHAUL_2026-08-09.md`).
- [ ] `TodayHero.tsx`: phần `hasActivity` chưa commit còn nguyên (AGENTS.md §2).
