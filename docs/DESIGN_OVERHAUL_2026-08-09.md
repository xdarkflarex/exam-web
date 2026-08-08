# Đợt làm đẹp giao diện — đêm 2026-08-08 sang 09

Chủ dự án duyệt trước khi đi ngủ: **ưu tiên thị giác cho dashboard học sinh, các
tính năng học sinh, và landing page**; được nới các ràng buộc *thẩm mỹ* trong
`AGENTS.md`/`DESIGN_SYSTEM.md`. Tài liệu này để sáng hôm sau đọc và quyết giữ
hay bỏ.

**Nới cái gì, KHÔNG nới cái gì.** Chỉ nới phần thẩm mỹ. Mọi bất biến về bảo mật,
RLS, chấm điểm, phân quyền, ngữ nghĩa dữ liệu trong `AGENTS.md` mục 4–5 giữ
nguyên tuyệt đối — chúng không phải quy tắc design.

---

## 0. Cách quay lui

Toàn bộ đợt này nằm trên nhánh `design/visual-overhaul`. `main` không bị đụng.

```bash
git checkout main
```

Quay về đúng trạng thái trước đợt làm đẹp (giữ nhánh để xem lại):

```bash
git log --oneline main..design/visual-overhaul
```

Bỏ một phần: mỗi phase là một commit riêng, `git revert <sha>` được từng cái.

---

## 1. Quyết định nền: giữ hệ màu, đổi CẤU TRÚC

Skill `ui-ux-pro-max` (bản chạy 2026-08-09, dials variance 8 / motion 5 /
density 6) đề xuất palette tím `#7C3AED` + cặp font **Baloo 2 + Comic Neue**.

**Đã từ chối phần palette và typography.** Lý do, không phải vì bảo thủ:

- Repo có **1292 biến thể `dark:`** trong 125 file bám vào thang slate/teal
  (`docs/DESIGN_TODO.md` mục 2). Đổi màu gốc là làm hỏng toàn bộ số đó, và đó là
  công việc của nhiều ngày chứ không phải một đêm.
- Khối sửa tương phản trong `globals.css` (dòng 96–129) được đo và hiệu chỉnh
  riêng cho teal/slate. Đổi màu là vứt số đo đi.
- **Comic Neue sai đối tượng.** Nó thuộc nhóm "children's apps, educational
  games". Người dùng ở đây là học sinh THPT ôn thi tốt nghiệp — font chữ kiểu
  truyện tranh làm giảm cảm giác nghiêm túc của một nền tảng luyện thi.

**Đã lấy phần cấu trúc: Bento Grids.** Đây mới là thứ chữa đúng bệnh. Bệnh không
phải "màu xấu" mà là **mọi khối đều cùng một cỡ, cùng một khuôn**: trang chủ có
4 card đề + 3 card bài viết + 4 card lợi ích xếp liên tiếp, cùng `rounded-2xl`,
cùng viền, cùng ô icon teal `w-12 h-12`. Bento sửa bằng cách cho các ô **khác cỡ
nhau theo tầm quan trọng**.

Giữ nguyên: teal/slate, Inter + Baloo 2, `--background` chống chói, bốn bất biến
theme ở `docs/DESIGN_TODO.md` mục 0.

---

## 2. Nguyên tắc áp cho cả đợt

1. **Khác nhau về HÌNH, không chỉ khác nội dung.** Hai section liền nhau không
   được dùng chung công thức card. Đổi cỡ, đổi hướng, đổi việc có/không viền.
2. **Teal là màu của HÀNH ĐỘNG.** Nút bấm, link chính giữ teal. Indigo/amber/
   emerald/rose chỉ dùng trang trí hoặc trạng thái — không dùng cho CTA.
3. **Mỗi trang tối đa MỘT bề mặt gradient**, dành cho hành động quan trọng nhất
   (giữ từ `STUDENT_SKILL_TREE_REDESIGN.md` mục 7.2).
4. **Mỗi yếu tố thị giác neo vào một con số thật.** Không vẽ vòng tiến độ cho dữ
   liệu chưa có; `null` phải hiện khác `0`.
5. **Trạng thái = màu + icon + chữ.** Không bao giờ chỉ màu.
6. **Chuyển động nằm trong lưới `prefers-reduced-motion`** đã có ở cuối
   `globals.css`. Thêm animation mới thì phải nằm trong phạm vi bị tắt.
7. **Không thêm thư viện chart.** Ba primitive SVG ở `src/components/viz/` đã đủ.

---

## 3. Đã làm

### Phase 9 — hero "Hôm nay" của `/student` (commit `fb27672`)

- `TodayHero`: hai cột. Trái là ngày + tên + chip số việc + CTA lấy từ
  `recommendedAction`. Phải là `ProgressRing` độ chính xác + `ActivityHeatmap`
  4 tuần + chuỗi ngày (chỉ hiện từ 2 ngày).
- Nền hoạ tiết giấy kẻ ô `.paper-grid` — `repeating-linear-gradient`, không ảnh.
- `WeakAreas`: dải "Mảng cần củng cố", tối đa 3, deep-link `/learn?theory=`.
- `student-capability.ts` thêm `activityTimestamps`, lấy từ dữ liệu đã tải nên
  **không thêm truy vấn nào**.
- Tải riêng, không chặn: hero hiện ngay, cột phải xuất hiện sau. Hỏng thì mất
  cột phải chứ không hiện lỗi.

**Quyết định đáng nhớ:** vòng tiến độ dùng tông theo *độ chính xác*, không theo
tông của CTA. Dùng chung sẽ khiến một bài quá hạn (rose) làm vòng đỏ lên dù học
sinh đang đúng 90% — hai con số nói hai chuyện khác nhau.

### Footer (commit `fb27672`)

Hai link Facebook tách riêng, có nhãn: fanpage
`facebook.com/profile.php?id=100092483586525` và Facebook thầy
`facebook.com/minh.bam`. Ghi đè được qua `landing.brand.facebook_page` /
`facebook_teacher` mà không sửa code.

### Landing đợt 1 (commit `fb27672`)

- Khối "Tại sao chọn Minh Math?": bỏ khung card, đánh số lớn 01–04, bốn tông màu
  khác nhau, gạch chân giãn khi hover.
- Khối "Bài viết mới nhất": bỏ lưới 3 cột đều nhau → bài nổi bật nửa trái +
  3 bài nhỏ xếp dọc phải.
- `PostCard` chuyển sang mẫu *stretched link*: `<article>` + `<h3>` + `<button>`
  chỉ chứa chữ, phủ kín thẻ bằng `after:absolute`. Bản trước bọc cả thẻ trong
  `<button>` là HTML không hợp lệ (`button` chỉ nhận phrasing content).

### Lỗi thật tìm được (commit `fb27672`)

**`backdrop-filter` bị xoá khỏi bản build.** Dự án không khai báo `browserslist`
nên mặc định gồm `op_mini all`; Lightning CSS của Tailwind v4 thấy target không
hỗ trợ thì **xoá hẳn thuộc tính**. Đọc CSSOM lúc chạy: `.glass-strong` chỉ còn
`background` và `border`. Hệ quả là thanh nav dính không có blur, tiêu đề section
cuộn qua đọc xuyên lên.

Sửa bằng cách đảo chiều phụ thuộc: nền tự nó đủ đục (0.97), `@supports` mới hạ
độ đục và thêm blur. Đã xác minh blur sống sót và computed ra `blur(20px)`.

Cùng cách đó, `.mm-logo-wrap { aspect-ratio }` cũng bị xoá — nhưng vô hại vì
component đã đặt `width`/`height` inline.

**Còn treo:** có nên khai báo `browserslist` tường minh không. Nó sửa tận gốc
nhưng đổi CSS toàn site, nên để chủ dự án quyết.

---

## 4. Chưa xác minh được

- **Lưới hoạt động trống và "Mảng cần củng cố" không hiện** trên tài khoản test,
  dù vòng tiến độ có số. Hai thứ đó lấy từ RPC `get_my_homework_answer_metadata`;
  vòng tiến độ lấy từ bộ đếm attempt (`answered_questions`, `correct_answers`) —
  **hai nguồn khác nhau**. Nghi RPC không trả dòng nào cho tài khoản đó. Cách
  kiểm: mở `/student/analytics`, phần thống kê theo kiến thức có trống không.
  Nếu trống thì là nợ có sẵn, không phải do đợt này.
- **Chưa xem bằng mắt ở light mode** cho các trang cần đăng nhập.
