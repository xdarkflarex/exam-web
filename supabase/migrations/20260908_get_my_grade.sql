-- =====================================================================
-- get_my_grade() — HỌC SINH BIẾT ĐƯỢC MÌNH ĐANG HỌC LỚP MẤY
-- =====================================================================
--
-- VẤN ĐỀ
-- `/learn` muốn mở sẵn đúng lớp của học sinh thay vì đổ chung 29 bài của cả ba
-- lớp. Nhưng phiên học sinh không có đường nào biết lớp của chính mình:
--
--   * `profiles.grade` đang NULL ở 23/24 hồ sơ (đo 2026-09-04);
--   * `profiles.class_id` thì đọc được, nhưng nó chỉ là một khoá — muốn đổi ra
--     khối thì phải đọc `classes.grade`, mà RLS trên `classes` (`20260722`) chỉ
--     mở cho `is_system_admin()` và giáo viên chủ nhiệm. Học sinh nhận 0 dòng.
--
-- Sau `20260907`, `class_id` của học sinh đã trỏ đúng lớp thật, nên `classes.grade`
-- là nguồn đáng tin nhất về khối. Chỉ thiếu đường đọc.
--
-- CÁCH LÀM
-- Một hàm `SECURITY DEFINER` trả về ĐÚNG MỘT SỐ NGUYÊN về chính người gọi. Đây
-- là khuôn mà `20260722` đã dùng cho các helper `get_my_*`: hàm chỉ trả kết luận,
-- không trả dữ liệu, nên không mở thêm bề mặt nào của bảng `classes`.
--
-- VÌ SAO KHÔNG NỚI RLS CỦA `classes` CHO HỌC SINH ĐỌC LỚP CỦA MÌNH
-- Vì như thế là mở cả bảng cho một nhu cầu bằng một con số. `classes` còn có
-- `teacher_id`, `school`, `student_count`; không có lý do gì để học sinh thấy
-- chúng. AGENTS.md mục 4 nói thẳng: bọc phép kiểm vào hàm `SECURITY DEFINER` trả
-- giá trị, đừng viết `EXISTS (SELECT ... FROM bảng_khác)` trong policy.
--
-- VÌ SAO KHÔNG BACKFILL `profiles.grade` TỪ `classes.grade`
-- Đó là cách rõ ràng hơn, và nó SAI ở đây. `AssessmentListPage` lọc đề bằng
-- `query.eq('grade', studentGrade)` khi cột này có giá trị. Hiện có 3 đề mang
-- `grade = NULL`, 2 trong đó đã xuất bản — điền `profiles.grade` là lập tức GIẤU
-- hai đề đó khỏi mọi học sinh. Hàm này chỉ phục vụ việc sắp xếp giao diện, không
-- đụng tới đường lọc đề.
--
-- ĐỌC ĐƯỢC GÌ: một số trong {10, 11, 12}, hoặc NULL.
-- NULL nghĩa là "chưa biết" — 9 học sinh chưa được xếp lớp và 1 hồ sơ còn
-- `class_id = '9/1'` (xem VIEC_DANG_MO mục 14). Client phải coi NULL là hợp lệ và
-- hiện cả ba lớp, không được đoán bừa một lớp.
--
-- HOÀN TÁC: `DROP FUNCTION public.get_my_grade();`. Không có thay đổi dữ liệu.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_grade()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- `profiles.grade` được ưu tiên vì đó là thứ giáo viên đặt tay khi muốn ghi đè;
  -- lớp chỉ là đường suy ra. Cùng thứ tự với `admin-student-performance.ts`, để
  -- giao diện học sinh và bảng thống kê của giáo viên không nói hai con số khác nhau.
  SELECT COALESCE(p.grade, c.grade)
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.id = p.class_id
  WHERE p.id = auth.uid();
$$;

-- `REVOKE` trước rồi mới `GRANT`: hàm tạo trong `public` sinh ra đã cho PUBLIC
-- chạy được. Bỏ bước này là `anon` gọi được — mà `anon` thì `auth.uid()` là NULL
-- nên chỉ nhận NULL, không rò rỉ gì; vẫn revoke, vì đúng khuôn của `20260722` và
-- vì một hàm không dành cho `anon` thì không nên nằm trong bề mặt của `anon`.
REVOKE ALL ON FUNCTION public.get_my_grade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_grade() TO authenticated;

COMMIT;

-- =====================================================================
-- HẬU KIỂM — chạy sau COMMIT, mọi cột `must_be_zero` phải bằng 0
-- =====================================================================
--
-- SELECT
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'get_my_grade'
--       AND NOT p.prosecdef)                                  AS must_be_zero_mat_security_definer,
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'get_my_grade'
--       AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS must_be_zero_anon_goi_duoc,
--   (SELECT count(*) FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'get_my_grade'
--       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
--                                                             AS must_be_zero_hoc_sinh_khong_goi_duoc;
--
-- Và một phép kiểm hành vi, vì hậu kiểm catalog không chứng minh hàm chạy đúng.
-- Đăng nhập bằng JWT của một học sinh ĐÃ được xếp lớp rồi gọi:
--
--   select public.get_my_grade();
--
-- Phải ra đúng khối của lớp em đó. Chạy trong Supabase SQL Editor KHÔNG có giá
-- trị: editor chạy bằng vai trò chủ sở hữu nên `auth.uid()` là NULL và hàm luôn
-- trả NULL — trông y hệt "hàm hỏng".
