-- 20261027_landing_exam_catalog.sql
--
-- Mở đúng những gì trang chủ cần để PHÂN LOẠI ĐỀ cho người chưa đăng nhập:
-- cột `grade`, cột `description`, và đề ôn tập.
--
-- ---------------------------------------------------------------------------
-- VÌ SAO
-- ---------------------------------------------------------------------------
--
-- Trang chủ là chỗ DUY NHẤT người lạ nhìn thấy đề trước khi có tài khoản. Hôm
-- nay nó đổ ra một danh sách phẳng: không lớp, không loại đề. Phần "phân loại"
-- duy nhất đang có là dải màu bên trái card, băm từ `exams.subject` — mà cả
-- ngân hàng chỉ có môn Toán, nên MỌI đề ra cùng một màu. Có code phân loại,
-- không có phân loại.
--
-- Thứ phân loại được nằm sẵn trong bảng: `grade` (10/11/12, NULL = mọi lớp) và
-- `exam_mode` (thi thử / ôn tập). `exam_mode` đã cấp cho `anon`; `grade` thì
-- chưa, và `20260722:3339` cấp cho `anon` theo DANH SÁCH CỘT ĐÓNG:
--
--   GRANT SELECT (id, title, subject, duration, is_published, exam_mode,
--                 created_at) ON TABLE public.exams TO anon;
--
-- Grant theo cột của Postgres từ chối **cả câu lệnh** khi chạm một cột chưa
-- cấp. Nên thêm `grade` vào câu select của trang chủ mà chưa chạy file này là
-- khối đề biến mất sạch khỏi trang chủ với mọi khách, im lặng — đúng họ lỗi
-- ngày 2026-09-03 (`max_attempts` trong câu INSERT làm đứt cả trang tạo đề,
-- xem RUNBOOK mục 9).
--
-- Mã của trang chủ đã viết để chạy ĐƯỢC CẢ HAI phía: chưa nạp file này thì nó
-- tự rơi về câu select cũ và ẩn phần lọc theo lớp. Nạp file này là bật phần
-- lọc lên, không phải sửa lỗi.
--
-- ---------------------------------------------------------------------------
-- ĐỀ ÔN TẬP: policy cũ cố ý chỉ cho `simulation`
-- ---------------------------------------------------------------------------
--
--   CREATE POLICY anon_read_published_simulation_exams
--     ON public.exams FOR SELECT TO anon
--     USING (COALESCE(is_published, false) AND exam_mode = 'simulation');
--
-- Hệ quả: đề ÔN TẬP — thứ dễ mời người lạ làm thử nhất vì không bấm giờ và
-- không giới hạn lượt — không bao giờ xuất hiện trên trang chủ. Người lạ chỉ
-- được mời vào đúng loại đề đáng sợ nhất.
--
-- File này thay policy đó bằng một policy cho CẢ HAI chế độ. Vẫn chỉ đề đã
-- xuất bản, vẫn chỉ những cột đã cấp.
--
-- ---------------------------------------------------------------------------
-- PHẠM VI — đọc kỹ phần này trước khi chạy
-- ---------------------------------------------------------------------------
--
-- Sau khi chạy, người CHƯA ĐĂNG NHẬP đọc được, với đề đã xuất bản:
--   id, title, subject, duration, is_published, exam_mode, created_at,
--   grade (MỚI), description (MỚI)
--
-- `description` là chữ do giáo viên nhập. Preflight in ra TOÀN BỘ description
-- của đề đã xuất bản — đọc chúng trước, vì sau khi chạy file này chúng là nội
-- dung công khai. Có ghi chú nội bộ trong đó thì sửa trước, đừng chạy rồi sửa.
--
-- KHÔNG mở thêm: `created_by`, `class_id`, `max_attempts`, `passing_score`,
-- `total_score`, `start_time`, `end_time`, `scoring_profile` vẫn đóng với
-- `anon`, và tự kiểm trong transaction chứng minh lại điều đó.
--
-- KHÔNG đổi: dữ liệu, cấu trúc bảng, quyền của `authenticated`.
--
-- PREFLIGHT:  supabase/preflight/20261027_landing_exam_catalog_preflight.sql
-- POSTFLIGHT: supabase/preflight/20261027_landing_exam_catalog_postflight.sql
-- ROLLBACK:   supabase/rollback/20261027_landing_exam_catalog_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.exams') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.exams không tồn tại';
  END IF;

  IF to_regclass('public.exam_questions') IS NULL THEN
    RAISE EXCEPTION 'THIEU_BANG: public.exam_questions không tồn tại';
  END IF;

  -- Hai cột này là toàn bộ lý do của file. Thiếu là database khác hẳn cái
  -- repo đang mô tả — dừng, đừng cấp quyền mò.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'grade'
  ) THEN
    RAISE EXCEPTION 'THIEU_COT: public.exams.grade';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'description'
  ) THEN
    RAISE EXCEPTION 'THIEU_COT: public.exams.description';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Hai cột mới cho `anon`
-- ---------------------------------------------------------------------------
--
-- Cấp THÊM theo cột, không `GRANT SELECT` cả bảng: danh sách cột đóng là quyết
-- định đúng của `20260722` và file này không phá nó.

GRANT SELECT (grade, description) ON TABLE public.exams TO anon;

-- ---------------------------------------------------------------------------
-- 2. Policy: thêm đề ôn tập
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS anon_read_published_simulation_exams ON public.exams;
DROP POLICY IF EXISTS anon_read_published_exam_catalog ON public.exams;

-- Tên mới vì NGHĨA đã đổi: không còn là "đề thi thử" mà là "danh mục đề công
-- khai". Giữ tên cũ cho một policy đã đổi nghĩa là để lại một cái bẫy cho
-- người đọc sau.
CREATE POLICY anon_read_published_exam_catalog
  ON public.exams FOR SELECT TO anon
  USING (
    COALESCE(is_published, false)
    AND exam_mode IN ('simulation', 'practice')
  );

-- ---------------------------------------------------------------------------
-- 3. Đếm số câu của đề đã xuất bản
-- ---------------------------------------------------------------------------
--
-- Card đề có dòng "22 câu", nhưng `anon` không có GRANT lẫn policy nào trên
-- `exam_questions`, nên với khách con số luôn là 0 và dòng đó LUÔN bị ẩn. Thứ
-- duy nhất cần mở là quyền ĐẾM: hai cột khoá, không nội dung.
--
-- `questions` và `answers` vẫn đóng hoàn toàn với `anon` — nội dung câu hỏi và
-- đáp án không đi qua cửa này. Postflight kiểm lại.
GRANT SELECT (id, exam_id) ON TABLE public.exam_questions TO anon;

DROP POLICY IF EXISTS anon_count_published_exam_questions ON public.exam_questions;

CREATE POLICY anon_count_published_exam_questions
  ON public.exam_questions FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND COALESCE(e.is_published, false)
        AND e.exam_mode IN ('simulation', 'practice')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Tự kiểm trong transaction
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_cot_thua text;
  v_thieu integer;
BEGIN
  IF NOT has_column_privilege('anon', 'public.exams', 'grade', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.exams', 'description', 'SELECT') THEN
    RAISE EXCEPTION 'THIEU_QUYEN_COT: anon vẫn chưa đọc được grade/description';
  END IF;

  -- Chốt NGƯỢC: bản nới này phải nới đúng hai cột, không hơn.
  SELECT string_agg(cot, ', ')
  INTO v_cot_thua
  FROM unnest(ARRAY[
    'created_by', 'class_id', 'max_attempts', 'passing_score',
    'total_score', 'start_time', 'end_time', 'scoring_profile'
  ]) AS cot
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'exams' AND c.column_name = cot
  )
  AND has_column_privilege('anon', 'public.exams', cot, 'SELECT');

  IF v_cot_thua IS NOT NULL THEN
    RAISE EXCEPTION 'NOI_QUA_TAY: anon đọc được cột không nên đọc: %', v_cot_thua;
  END IF;

  IF has_table_privilege('anon', 'public.questions', 'SELECT')
     OR has_table_privilege('anon', 'public.answers', 'SELECT') THEN
    RAISE EXCEPTION 'NOI_QUA_TAY: anon đọc được nội dung câu hỏi hoặc đáp án';
  END IF;

  SELECT COUNT(*)::integer INTO v_thieu
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN ('anon_read_published_exam_catalog', 'anon_count_published_exam_questions');

  IF v_thieu <> 2 THEN
    RAISE EXCEPTION 'THIEU_POLICY: chỉ thấy % / 2 policy mới', v_thieu;
  END IF;

  -- Policy thiếu mệnh đề `TO` áp cho MỌI vai trò (AGENTS.md mục 4).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('exams', 'exam_questions')
      AND 'public' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'CON_POLICY_KHONG_GIOI_HAN_ROLE trên exams/exam_questions';
  END IF;

  -- Đề chưa xuất bản phải nằm ngoài policy — kiểm bằng chính biểu thức.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'anon_read_published_exam_catalog'
      AND COALESCE(qual, '') LIKE '%is_published%'
  ) THEN
    RAISE EXCEPTION 'POLICY_SAI: biểu thức không còn ràng buộc is_published';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION — catalog không chứng minh được
-- ---------------------------------------------------------------------------
--
-- Phải gọi thật bằng anon key, đúng con đường trang chủ đi (RUNBOOK mục
-- 8vicies bước 4):
--
--   node --env-file=.env -e 'const u=process.env.NEXT_PUBLIC_SUPABASE_URL,
--     k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
--     fetch(`${u}/rest/v1/exams?select=id,title,grade,exam_mode&is_published=eq.true`,
--     {headers:{apikey:k,Authorization:`Bearer ${k}`}}).then(r=>r.json().then(b=>
--     console.log(r.status, JSON.stringify(b).slice(0,400))))'
--
-- Trước khi chạy file này: 403 kèm `42501`. Sau: 200 kèm danh sách có `grade`.
-- Và phép thử NGƯỢC, bắt buộc: đề `is_published = false` phải KHÔNG có trong
-- kết quả, `created_by` phải vẫn bị từ chối.
