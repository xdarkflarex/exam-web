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

## 3b. Cây kỹ năng mới — nền tảng thiết kế (2026-08-09)

Chủ dự án quyết: **dựng lại hoàn toàn, thay CẢ HAI chế độ, gỡ ReactFlow**, và
lấy `D:\ToanTHPT\LATEX\HethongtrithucToanTHPT` cùng taxonomy ngân hàng câu hỏi
làm nguồn.

### Nguồn thật là các file `.ttk`

Hệ thống LaTeX sinh ra `filechinh-lop{10,11,12}.ttk`, và đó chính là đồ thị tri
thức, không phải sản phẩm phụ của việc biên dịch:

```
BLOCK ĐỊNH NGHĨA {bai01-dn-daoham} {Định nghĩa đạo hàm}
BLOCK ĐỊNH LÝ {bai01-dl-tiep-tuyen} {Phương trình tiếp tuyến của đồ thị}
EDGE prerequisite bai01-dl-tiep-tuyen{bai01-dn-daoham}
```

Quy mô đo được:

| Lớp | BLOCK | EDGE |
|---|---:|---:|
| 10 | 70 | 43 |
| 11 | 110 | 98 |
| 12 | 202 | 141 |
| **Tổng** | **382** | **296** (292 `prerequisite`, 4 `related`) |

### Chín loại BLOCK khớp 1:1 với `BlockType` của web

Đây là điểm mấu chốt. `src/types/theories.ts` đã có đúng chín giá trị, chỉ khác
cách viết:

| `.ttk` | `BlockType` | Số lượng |
|---|---|---:|
| ĐỊNH NGHĨA | `dinh_nghia` | 62 |
| ĐỊNH LÝ | `dinh_ly` | 15 |
| TÍNH CHẤT | `tinh_chat` | 34 |
| HỆ QUẢ | `he_qua` | 1 |
| CÔNG THỨC | `cong_thuc` | 38 |
| PHƯƠNG PHÁP | `phuong_phap` | 63 |
| CHÚ Ý | `chu_y` | 34 |
| VÍ DỤ | `vi_du` | 125 |
| BÀI TẬP | `bai_tap` | 47 |

Không cần migration, không cần đổi bảng: web đã mô hình hoá đúng thứ LaTeX sinh
ra. Việc còn lại thuần là trình bày.

### Hai trục, và vì sao điều đó quyết định thiết kế

Loại BLOCK **không phải nhãn phân loại tuỳ ý** — chúng là một trình tự học có
thật, và đó là thứ cây cũ bỏ lỡ hoàn toàn:

```
ĐỊNH NGHĨA → ĐỊNH LÝ / TÍNH CHẤT / HỆ QUẢ → CÔNG THỨC
           → PHƯƠNG PHÁP → VÍ DỤ → BÀI TẬP
```

Trục thứ hai đến từ ngân hàng câu hỏi: `cognitive_level` **NB → TH → VD → VDC**
(`LEVEL_LABELS` trong `src/lib/analytics/student-capability.ts`).

Cây cũ vẽ một đồ thị quan hệ phẳng, không thể hiện trục nào trong hai trục này —
nên nó chỉ nói "bài A nối bài B" mà không nói "học tới đâu rồi". Cây mới phải
đọc được **trình tự** (đang ở khâu nào trong một bài) và **độ sâu** (đã lên tới
mức nhận thức nào), vì đó mới là hai câu hỏi học sinh thật sự cần trả lời.

### Ràng buộc giữ nguyên

- Không đổi bảng, không migration: `theories`, `knowledge_blocks`,
  `knowledge_block_edges`, `question_knowledge_links` giữ nguyên.
- Màu vẫn lấy theo `mastery` (độ chính xác), không theo tiến độ — bất biến từ
  mục 2.1 của `STUDENT_SKILL_TREE_REDESIGN.md`.
- Gỡ `@xyflow/react` và `dagre` khỏi bundle sau khi xoá `SkillTree.tsx`.
- Phải đọc được trên màn 375px — đây là lý do gốc khiến chủ dự án bỏ cây cũ.

### Đã làm (2026-08-11)

1. Kiểu dùng chung tách ra `src/types/skill-tree.ts`; `/learn` và `LearningPath`
   đã nối vào đó.
2. Chế độ Sơ đồ gỡ khỏi `/learn`, `SkillTree.tsx` đã xoá. Kéo theo: công tắc
   chế độ + bộ nhớ `localStorage` `learnViewMode`, và truy vấn
   `knowledge_block_edges` trong `preloadGroup` — chỉ chế độ Sơ đồ dùng, nên
   giờ là một round-trip Supabase thừa. Khâu học trong mỗi bài (việc 4) sẽ đọc
   lại bảng này khi cần.
3. `@xyflow/react`, `dagre`, `@types/dagre` gỡ khỏi `package.json` (npm gỡ 24
   gói). `tsc`, `eslint`, `next build` đều sạch.
4. **Khâu học trong mỗi bài.** `src/lib/theories/learning-stage.ts` (logic
   thuần, 10 test) + `src/components/theories/TheoryStages.tsx` (panel của
   `/learn`). Sáu khâu: Khái niệm → Kết quả lý thuyết → Công thức → Phương pháp
   → Ví dụ → Bài tập; ĐỊNH LÝ/TÍNH CHẤT/HỆ QUẢ gộp một khâu, CHÚ Ý không phải
   khâu mà nhập vào khâu đang đọc.

Ba quyết định của việc 4, cùng lý do:

- **Không sắp lại khối.** Component chỉ chèn tiêu đề khâu vào chỗ khâu đổi, thứ
  tự đọc vẫn là `order_index`. Dữ liệu thật cho thấy vì sao: "CỰC TRỊ CỦA HÀM
  SỐ" và "GIÁ TRỊ LỚN NHẤT…" đều đi Phương pháp → Ví dụ → Phương pháp → Ví dụ
  (mỗi cặp một dạng bài), còn "ÔN TẬP ĐẠO HÀM" đi Định lý → Công thức → Tính
  chất. Gom theo khâu sẽ trộn hai dạng bài vào nhau và tách chú ý khỏi ví dụ mà
  nó nói về.
- **Không đánh số khâu.** Bài nào cũng chỉ có bốn trong sáu khâu; ghi "Khâu 5"
  cạnh một dải bốn mục làm học sinh đi tìm phần không tồn tại. Dải khâu cũng chỉ
  liệt kê khâu CÓ, không hiện khâu vắng kèm nhãn "chưa có".
- **Dải khâu không phải thanh tiến độ.** Nó nói bài này có những khâu nào, không
  nói học sinh đã qua khâu nào. Năng lực hiện đo theo BÀI (`mastery` từ
  `question_knowledge_links` gộp lên theory), chưa đo theo KHỐI, nên tô "đã
  xong" cho từng khâu là suy đoán — đúng loại lỗi mục 7.1 cấm. Muốn có thật thì
  phải gộp năng lực theo `knowledge_block_id`, là một việc riêng.

Kiểm bằng dữ liệu thật trên `/learn` (bốn bài Chương 1 lớp 12): dải khâu, tiêu
đề khâu và thứ tự khối đều đúng; 375px không tràn ngang; dark mode đạt tương
phản. Nút nhảy tới khâu gọi đúng `scrollIntoView` trên đúng `<section>` — không
quan sát được cú cuộn vì trình duyệt kiểm thử không dựng khung hình nên
`behavior: 'smooth'` đứng yên (`'auto'` cuộn bình thường), đây là giới hạn của
môi trường kiểm, không phải của trang.

## 4. Chưa xác minh được

### Lưới hoạt động trống và "Mảng cần củng cố" không hiện

Trên tài khoản test, vòng tiến độ có số (17% / 30 câu) nhưng lưới hoạt động
trống trơn và dải "Mảng cần củng cố" không xuất hiện. Hai bên lấy từ **hai
nguồn khác nhau**:

| Hiển thị | Nguồn |
|---|---|
| Vòng tiến độ, "30 câu đã làm" | bộ đếm của `homework_attempts` (`answered_questions`, `correct_answers`), đọc thẳng qua RLS |
| Lưới hoạt động, mảng cần củng cố | RPC `get_my_homework_answer_metadata` |

Đọc thân RPC ở `supabase/migrations/20260722_runtime_security_hardening.sql`
dòng 1795–1826, có hai chỗ khiến nó trả rỗng trong khi đường kia vẫn có số:

1. **`AND public.student_has_feature('homework')`** — đường đọc attempt không có
   điều kiện này. Feature gate tắt là RPC trả 0 dòng **im lặng**, không báo lỗi.
2. Phía client lọc lại `attemptIds.has(row.attempt_id)`
   (`student-capability.ts` khoảng dòng 245–250). RPC khai `attempt_id text`;
   nếu kiểu/định dạng id hai bên lệch nhau thì lọc rơi hết.

Chưa kiểm được vì không có quyền truy vấn database. Cách kiểm nhanh: mở
`/student/analytics` — nếu phần thống kê theo kiến thức **cũng** trống thì đúng
là RPC, và đó là nợ có sẵn chứ không phải do đợt làm đẹp này.

**Việc phải làm bất kể nguyên nhân là gì:** hiện tại khi không có dữ liệu, lưới
vẫn vẽ đủ 28 ô xám — trông như "bốn tuần qua bạn không học buổi nào", một câu
**sai** nếu nguyên nhân thật là thiếu dữ liệu. Đúng loại lỗi mà mục 7.1 của bản
thiết kế cấm. Phải đổi thành trạng thái "chưa ghi nhận hoạt động" tường minh.
Ghi ở đây vì lúc phát hiện thì `src/components/student/**` đang do một luồng
khác giữ; xử lý ở bước tích hợp cuối.
- **Chưa xem bằng mắt ở light mode** cho các trang cần đăng nhập.
