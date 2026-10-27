-- 20261027_landing_exam_catalog_rollback.sql
--
-- Đóng lại đúng những gì `20261027` đã mở: hai cột, một policy mở rộng, và
-- quyền đếm câu hỏi.
--
-- ĐỌC TRƯỚC KHI CHẠY: trang chủ KHÔNG hỏng sau khi rollback. Mã của nó tự rơi
-- về câu select cũ khi bị từ chối cột `grade`, và phần lọc theo lớp tự ẩn. Thứ
-- mất đi là phân loại và tab "Ôn tập", không phải khối đề.
--
-- Không mất dữ liệu: chỉ đổi quyền và policy.

BEGIN;

REVOKE SELECT (grade, description) ON TABLE public.exams FROM anon;
REVOKE SELECT (id, exam_id) ON TABLE public.exam_questions FROM anon;

DROP POLICY IF EXISTS anon_count_published_exam_questions ON public.exam_questions;
DROP POLICY IF EXISTS anon_read_published_exam_catalog ON public.exams;

-- Nguyên văn bản gốc của `20260722:2890`.
CREATE POLICY anon_read_published_simulation_exams
  ON public.exams FOR SELECT TO anon
  USING (
    COALESCE(is_published, false)
    AND exam_mode = 'simulation'
  );

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.exams', 'grade', 'SELECT') THEN
    RAISE EXCEPTION 'ROLLBACK_CHUA_TRON: anon vẫn đọc được exams.grade';
  END IF;
END;
$$;

COMMIT;

-- Sau rollback: chạy lại preflight. Các dòng `xac_nhan_*` phải khác 0 trở lại.
