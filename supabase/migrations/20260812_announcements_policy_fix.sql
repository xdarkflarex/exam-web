-- 20260812_announcements_policy_fix.sql
--
-- Sửa lỗi: khách CHƯA ĐĂNG NHẬP không xem được thông báo nào trên trang chủ.
--
-- TRIỆU CHỨNG. `GET /rest/v1/announcements?...` bằng anon key trả HTTP 401 với
-- `{"code":"42501","message":"permission denied for table profiles"}`. Thông báo
-- biến mất khỏi trang chủ với mọi người chưa đăng nhập.
--
-- NGUYÊN NHÂN. `database/ANNOUNCEMENTS_SCHEMA.sql` tạo hai policy:
--
--   "Anyone can view active announcements"  FOR SELECT  -- không đọc profiles
--   "Admins can manage all announcements"   FOR ALL
--       USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
--
-- Cả hai đều KHÔNG có mệnh đề `TO`, nên áp cho mọi vai trò — kể cả `anon`. Và
-- `FOR ALL` bao gồm `SELECT`. Vì policy permissive được OR với nhau, một truy vấn
-- SELECT của `anon` phải đánh giá CẢ policy admin, tức là phải đọc `public.profiles`
-- — bảng mà `anon` không có quyền. Postgres raise `42501` và **toàn bộ** truy vấn
-- đổ, kể cả khi policy thứ nhất đã đủ cho qua.
--
-- Đây là điểm dễ hiểu sai nhất về RLS: policy permissive được OR ở KẾT QUẢ, nhưng
-- biểu thức của chúng vẫn phải CHẠY ĐƯỢC. Một policy không áp dụng cho bạn vẫn
-- làm hỏng truy vấn của bạn nếu nó không đánh giá nổi.
--
-- ĐÂY LÀ LẦN THỨ BA CÙNG MỘT NGUYÊN NHÂN trong ngày 2026-08-07:
--
--   1. Policy storage đọc `exam_attempts`  -> sửa ở 20260811
--   2. `gateAttempt()` đọc `exam_attempts` -> sửa bằng service_role + so tường minh
--   3. Policy announcements đọc `profiles` -> file này
--
-- Quy tắc rút ra, đã ghi vào `AGENTS.md`: **đừng để một quyết định phân quyền phụ
-- thuộc vào việc vai trò gọi có đọc được bảng khác hay không.** Bọc phép kiểm vào
-- hàm `SECURITY DEFINER` và giới hạn policy bằng `TO`.
--
-- PHẠM VI. Một hàm helper + dựng lại hai policy. Không đổi dữ liệu, không đổi
-- cấu trúc bảng, không đụng quyền GRANT.
--
-- PREFLIGHT:  supabase/preflight/20260812_announcements_policy_fix_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260812_announcements_policy_fix_postflight.sql
-- ROLLBACK:   supabase/rollback/20260812_announcements_policy_fix_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.announcements') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.announcements không tồn tại'
      USING DETAIL = 'Áp database/ANNOUNCEMENTS_SCHEMA.sql trước.';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.profiles không tồn tại';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Hàm kiểm quyền admin, không phụ thuộc RLS/GRANT của `profiles`
-- ---------------------------------------------------------------------------
--
-- Đặt tên chung (`viewer_is_admin`) chứ không gắn với announcements: cùng một
-- phép kiểm này đang bị lặp lại trong nhiều policy khắp dự án, và mỗi bản sao là
-- một chỗ để mắc lại đúng lỗi trên.
--
-- `role = 'admin'` EXACT, KHÔNG nhận `teacher`. Đây là hành vi hiện tại của hệ
-- thống, giữ nguyên có chủ đích: `AGENTS.md` mục 4 ghi semantics `teacher` so với
-- `admin` là P1 đang mở, và thống nhất nó trong một migration về thông báo là sửa
-- sai chỗ. Nếu sau này chốt cho `teacher` quyền admin, sửa MỘT hàm này thay vì đi
-- tìm từng policy.
CREATE OR REPLACE FUNCTION public.viewer_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.viewer_is_admin() IS
  'Người gọi có phải admin hệ thống. SECURITY DEFINER để policy dùng nó không phụ '
  'thuộc quyền đọc public.profiles của vai trò gọi — nguyên nhân lỗi 401 mà '
  '20260812 sửa. role = ''admin'' exact, không nhận teacher (P1 đang mở).';

-- `anon` KHÔNG cần gọi hàm này: sau bản sửa, policy admin chỉ áp cho
-- `authenticated`. Thu hẹp bề mặt gọi được của một hàm SECURITY DEFINER là việc
-- nên làm mặc định.
REVOKE ALL ON FUNCTION public.viewer_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewer_is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dựng lại hai policy, lần này có `TO` tường minh
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view active announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage all announcements" ON public.announcements;

-- Ai cũng đọc được thông báo đang hiệu lực. `TO anon, authenticated` tường minh
-- thay cho việc bỏ trống: đọc một dòng là biết ai áp dụng, không phải nhớ luật
-- mặc định.
--
-- Biểu thức KHÔNG chạm bảng nào khác — đó là điều làm nó luôn đánh giá được, kể
-- cả với vai trò không có quyền đọc gì ngoài bảng này.
CREATE POLICY announcements_public_read
  ON public.announcements
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
  );

-- Admin toàn quyền. `TO authenticated` là dòng SỬA LỖI: nó khiến `anon` không bao
-- giờ phải đánh giá biểu thức này, nên truy vấn của khách không còn chết vì một
-- policy không dành cho họ.
CREATE POLICY announcements_admin_all
  ON public.announcements
  FOR ALL TO authenticated
  USING (public.viewer_is_admin())
  WITH CHECK (public.viewer_is_admin());

-- ---------------------------------------------------------------------------
-- 3. Tự kiểm trong transaction
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_khong_co_to integer;
  v_con_doc_profiles integer;
BEGIN
  -- Policy không có `TO` sẽ hiện `{public}` trong `pg_policies.roles` — tức áp cho
  -- mọi vai trò, đúng nguyên nhân lỗi.
  SELECT COUNT(*)::integer INTO v_khong_co_to
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'announcements'
    AND 'public' = ANY (roles);

  IF v_khong_co_to > 0 THEN
    RAISE EXCEPTION 'CON_POLICY_KHONG_GIOI_HAN_ROLE: % policy còn áp cho mọi vai trò', v_khong_co_to
      USING DETAIL = 'Mỗi policy phải có TO tường minh, nếu không anon vẫn phải đánh giá nó.';
  END IF;

  -- Không policy nào được đọc `profiles` trực tiếp nữa.
  SELECT COUNT(*)::integer INTO v_con_doc_profiles
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'announcements'
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%';

  IF v_con_doc_profiles > 0 THEN
    RAISE EXCEPTION 'CON_DOC_PROFILES: % policy còn đọc profiles trực tiếp', v_con_doc_profiles
      USING DETAIL = 'Dùng public.viewer_is_admin() thay thế.';
  END IF;

  IF to_regprocedure('public.viewer_is_admin()') IS NULL
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure('public.viewer_is_admin()')) THEN
    RAISE EXCEPTION 'HAM_SAI: thiếu viewer_is_admin() hoặc nó không phải SECURITY DEFINER';
  END IF;

  IF NOT has_function_privilege('authenticated', to_regprocedure('public.viewer_is_admin()'), 'EXECUTE') THEN
    RAISE EXCEPTION 'THIEU_QUYEN_EXECUTE: authenticated không gọi được viewer_is_admin()'
      USING DETAIL = 'Thiếu quyền này thì admin nhận lỗi thay vì nhận 0 dòng.';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — xác minh bằng đúng con đường production
-- ---------------------------------------------------------------------------
--
-- Postflight chỉ đọc catalog. Phép thử thật, chạy được ngay từ máy:
--
--   node --env-file=.env -e '
--     const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
--     fetch(`${u}/rest/v1/announcements?select=id,title&limit=5`,{headers:{apikey:k,Authorization:`Bearer ${k}`}})
--       .then(r=>r.json().then(b=>console.log(r.status,JSON.stringify(b).slice(0,200))))'
--
-- Trước sửa: 401 + "permission denied for table profiles".
-- Sau sửa:   200 + danh sách thông báo đang hiệu lực (có thể rỗng nếu chưa có
--            thông báo nào bật `is_active`).
--
-- Rồi kiểm nhánh ngược, vì bản sửa NỚI quyền đọc cho khách: thông báo đã tắt
-- (`is_active = false`) hoặc hết hạn KHÔNG được lọt ra.
