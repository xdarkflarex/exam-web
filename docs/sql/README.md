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
