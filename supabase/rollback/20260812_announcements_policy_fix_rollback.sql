-- 20260812_announcements_policy_fix_rollback.sql
--
-- Trả hai policy của `announcements` về bản gốc trong
-- `database/ANNOUNCEMENTS_SCHEMA.sql` và gỡ hàm `viewer_is_admin()`.
--
-- ĐỌC TRƯỚC KHI CHẠY: **rollback này KHÔI PHỤC LẠI LỖI.** Bản gốc là bản khách
-- chưa đăng nhập nhận 401 và không thấy thông báo nào trên trang chủ. Chạy file
-- này là chọn quay lại trạng thái đó một cách có ý thức.
--
-- Không mất dữ liệu: chỉ đổi policy và gỡ một hàm. Không dòng thông báo nào bị
-- chạm.
--
-- NẾU LO BẢN SỬA NỚI QUÁ TAY thì đừng rollback — kiểm bằng phép thử ngược trước:
-- thông báo `is_active = false` hoặc đã hết hạn phải KHÔNG lọt ra với anon key.
-- Bản sửa giữ nguyên điều kiện lọc của policy gốc, chỉ thêm mệnh đề `TO`.
--
-- MUỐN TẠM ẨN TOÀN BỘ THÔNG BÁO mà không rollback: `UPDATE public.announcements
-- SET is_active = false;` — hiệu quả tức thì, hoàn tác được, không đụng policy.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trả policy về bản gốc
-- ---------------------------------------------------------------------------
--
-- Phải làm TRƯỚC khi gỡ hàm: `announcements_admin_all` đang tham chiếu
-- `viewer_is_admin()`, và `DROP FUNCTION` sẽ bị chặn bởi dependency (hoặc nếu ép
-- CASCADE thì nó xoá luôn policy, để bảng ở trạng thái không ai quản trị được).

DROP POLICY IF EXISTS announcements_public_read ON public.announcements;
DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;

-- Nguyên văn bản gốc, KỂ CẢ phần thiếu mệnh đề `TO` — đó chính là lỗi, và
-- rollback phải trả về đúng trạng thái cũ chứ không phải một bản "cũ nhưng đã sửa
-- một nửa". Nửa vời còn khó chẩn đoán hơn.
CREATE POLICY "Anyone can view active announcements"
ON public.announcements FOR SELECT
USING (
  is_active = true
  AND (start_date IS NULL OR start_date <= NOW())
  AND (end_date IS NULL OR end_date >= NOW())
);

CREATE POLICY "Admins can manage all announcements"
ON public.announcements FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ---------------------------------------------------------------------------
-- 2. Gỡ hàm
-- ---------------------------------------------------------------------------
--
-- KHÔNG dùng CASCADE: nếu còn policy nào (ở bảng khác) tham chiếu hàm này thì
-- Postgres phải raise để ta biết, chứ không âm thầm xoá mất policy đó.
--
-- Lưu ý: nếu về sau có migration khác dùng `viewer_is_admin()`, câu lệnh dưới sẽ
-- đổ — và đó là hành vi đúng. Lúc đó giữ lại hàm, chỉ rollback phần policy ở mục 1.

DROP FUNCTION IF EXISTS public.viewer_is_admin();

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Trạng thái đã biết và mong đợi: khách chưa đăng nhập gọi
-- `/rest/v1/announcements` nhận lại 401 `permission denied for table profiles`,
-- và khối thông báo trên trang chủ trống.
--
-- Kiểm bằng:
--   node --env-file=.env -e '
--     const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
--     fetch(`${u}/rest/v1/announcements?select=id&limit=1`,{headers:{apikey:k,Authorization:`Bearer ${k}`}})
--       .then(r=>console.log(r.status))'
