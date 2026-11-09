# SQL đề xuất

Các file ở đây **chưa được chạy**. Chúng là bản đề xuất để chủ dự án soát rồi tự
chạy trên Supabase, vì đều ghi vào dữ liệu thật.

## Nhánh SGK cho lý thuyết (2026-08-09)

| File | Trạng thái |
|---|---|
| `20260809c_nhanh_sgk_gop_chay_mot_lan.sql` | **DÙNG FILE NÀY** |
| `20260809_nhanh_sgk_cho_ly_thuyet.sql` | ❌ bỏ, xem lý do dưới |
| `20260809b_chuyen_3_bai_cu_sang_sgk.sql` | ❌ bỏ, xem lý do dưới |

Hai file đầu mở `BEGIN;` nhưng để `COMMIT;` ở dạng chú thích, chờ người chạy đọc
hậu kiểm rồi tự bỏ comment. **Supabase SQL Editor chạy hết script mà không gặp
`COMMIT` thì huỷ toàn bộ.** Hệ quả: câu đếm bên trong trả về đúng số nhưng dữ
liệu không hề được ghi, và bước sau đổ lỗi khoá ngoại
(`Key (category_id)=(sgk-l12-c01) is not present in table "categories"`).

Bản gộp bỏ hẳn transaction tường minh và dùng `ON CONFLICT DO NOTHING`, nên chạy
lại nhiều lần vẫn an toàn.

**Bài học cho các file sau:** đừng viết `BEGIN;` mà không có `COMMIT;` trong file
dành cho SQL Editor. Muốn kiểm trước khi chốt thì chạy câu `SELECT` riêng.

## Đề ôn tập Nguyên hàm – Tích phân lớp 12 (2026-11-09)

| File | Trạng thái |
|---|---|
| `20261109_on_tap_nguyen_ham_tich_phan.sql` | **đã chạy trên Primary 2026-11-09** (qua `DATABASE_URL`, hậu kiểm trong giao dịch đạt) — 149 câu `Q_NBV25_*`, 5 đề ôn tập, 149/149 câu đã phân loại |
| `20261109_on_tap_nguyen_ham_tich_phan_rollback.sql` | hoàn tác; từ chối nếu đã có học sinh làm bài |

Nguồn là 4 file `.md` đặt cạnh PDF trong thư mục ngân hàng NBV 2025
(`TNKQ22.NGUYÊN HÀM`, `TNKQ23.TÍCH PHÂN`, `DS11. NGUYÊN HÀM - TÍCH PHÂN`,
`TLN16. ỨNG DỤNG TÍCH PHÂN …`). Từng câu đã đối chiếu với ảnh PDF gốc. Hai file
`.md` trắc nghiệm có sẵn từ trước có 26 câu sai so với PDF (đề, phương án, đáp án
hoặc thiếu hình; riêng đáp án sai hẳn: Nguyên hàm câu 54, 56, 60 và Tích phân câu
8) và 3 câu lời giải chỉ có chữ "Chọn X" — đã sửa, bản cũ giữ ở
`*.md.bak-20261109`.

Ba điều cần biết khi đọc hay chạy lại file này:

- **Một giao dịch, có hậu kiểm.** Sai bất kỳ ràng buộc nào (4 phương án / 1 đáp án
  đúng, 4 mệnh đề, tổng điểm đề…) là `RAISE`, không ghi gì. Chạy lần hai dừng ở
  `DA_CHAY_ROI`.
- **Công thức viết để sống sót qua Markdown.** Bản `MathContent` trên `main` đưa
  nội dung có từ hai dấu `_` trở lên (gần như mọi câu tích phân) qua Markdown
  **trước** MathJax mà không bảo vệ công thức, nên `\\`, `\{`, `\,` và cặp
  `\Big|_a^b … \int_{` bị nuốt hoặc biến thành chữ nghiêng. Bộ sinh chặn các mẫu
  đó: hệ nhiều dòng dùng `\cr`, thế cận viết thành hiệu $F(b)-F(a)$.
- **Hình nhúng thẳng vào `tikz_image_url`** dưới dạng `data:image/svg+xml;base64`
  (dựng từ TikZ bằng pdflatex + dvisvgm), nên không cần tải ảnh lên Storage.
  Mã TikZ gốc nằm ở `tikz_code`. Không dùng `pattern=` của TikZ: dvisvgm ra
  `opacity='0'` và pdftocairo ra SVG 2 MB — gạch chéo vẽ bằng `\clip` + đường thẳng.

Đề Đúng/Sai (`ontap12-nhtp-dungsai`) tạo ở trạng thái **nháp**: `PracticeRunner`
trên `main` không in nội dung mệnh đề (chỉ có nhãn a–d và nút Đúng/Sai). Xuất bản
sau khi deploy bản sửa `PracticeRunner` cùng ngày.
