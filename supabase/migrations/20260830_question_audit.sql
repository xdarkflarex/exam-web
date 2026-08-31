-- =====================================================================
-- RÀ SOÁT NGÂN HÀNG CÂU HỎI BẰNG AI — HAI BẢNG + RPC ÁP DỤNG
-- =====================================================================
--
-- Thiết kế đầy đủ: `docs/QUESTION_AUDIT_PLAN.md`. File này là bước 4 của mục 9.
--
-- VẤN ĐỀ
-- Đợt nhập phần Thống kê bằng OCR sai nhiều; lỗi lộ ra lúc chủ dự án đang đọc
-- đáp án cho học sinh. Cần quét theo chương/bài, để DeepSeek tự giải lại rồi so
-- với đáp án và lời giải đang lưu.
--
-- BẤT BIẾN PHẢI GIỮ
--
--   * AI chỉ ĐỀ XUẤT. Không có đường nào ghi vào `answers`/`questions` mà không
--     đi qua `apply_question_audit_finding` — hàm này chỉ chạy sau khi người
--     duyệt bấm, và chỉ áp đúng bản sửa đã lưu trong dòng finding.
--   * Câu đã có attempt đã nộp là trường hợp riêng. Một lần ghi sai
--     `answers.is_correct` làm sai đáp án cho MỌI học sinh làm câu đó về sau, và
--     làm lệch chuẩn giữa bài đã chấm với bài chấm sau. RPC bắt người gọi truyền
--     đúng số attempt bị ảnh hưởng mà họ ĐÃ NHÌN THẤY; số đó lệch với thực tế
--     lúc ghi thì huỷ, không ghi bừa.
--   * RPC KHÔNG tự chấm lại bài cũ. Đó là quyết định của giáo viên, không phải
--     của công cụ.
--
-- PHÂN QUYỀN — CỐ Ý KHÔNG CÓ POLICY CHO `authenticated`
-- Hai bảng này chỉ `service_role` chạm tới; trang quản trị đọc/ghi qua route
-- handler đã tự xác thực `role = 'admin'`. Đây là lựa chọn có chủ đích sau ba lỗi
-- RLS ngày 2026-08-07 (`AGENTS.md` mục 4): không có policy nào thì không có
-- policy nào chạm bảng khác, nên không có lớp lỗi đó ở đây.
--
-- CÁI BẪY DEFAULT PRIVILEGES
-- Bảng mới trong `public` sinh ra đã có `ALL` cho `anon`/`authenticated`/
-- `service_role`. Phải `REVOKE` TRƯỚC rồi mới `GRANT` đúng tập cần — không được
-- suy "không viết GRANT UPDATE" thành "không có quyền UPDATE".
--
-- HOÀN TÁC
-- `supabase/rollback/20260830_question_audit_rollback.sql`. Không mất dữ liệu
-- ngân hàng câu hỏi: hai bảng này chỉ chứa kết quả quét.

BEGIN;

-- ---------------------------------------------------------------------------
-- PHẦN 0 — TIỀN ĐIỀU KIỆN
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.questions') IS NULL
     OR to_regclass('public.answers') IS NULL
     OR to_regclass('public.student_answers') IS NULL
     OR to_regclass('public.homework_answers') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: thiếu bảng nền (questions/answers/student_answers/homework_answers)';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- PHẦN 1 — MỘT LƯỢT QUÉT
-- ---------------------------------------------------------------------------
-- `question_ids` chụp lại danh sách câu NGAY LÚC bắt đầu lượt, và `next_index`
-- là con trỏ chạy trên danh sách đó. Vì sao không truy vấn lại theo phạm vi ở
-- mỗi bước: người soạn có thể thêm/xoá câu giữa chừng, và một lượt quét mà tập
-- câu tự đổi thì tiến trình hiển thị vô nghĩa (chạy mãi không tới 100%).

CREATE TABLE IF NOT EXISTS public.question_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Phạm vi taxonomy đã chọn: {topic_id, category_id, section_id, subsection_id}.
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Tên đọc được của phạm vi, chụp lại lúc quét. Đổi tên chương về sau không
  -- được làm lịch sử quét trở nên khó hiểu.
  scope_label text NOT NULL DEFAULT '',

  model text NOT NULL,
  status text NOT NULL DEFAULT 'dang_chay'
    CHECK (status IN ('dang_chay', 'xong', 'loi', 'da_huy')),

  question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_index integer NOT NULL DEFAULT 0,

  total_questions integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  -- Câu lớp luật chặn không gửi cho model (vỡ LaTeX, chỉ có hình...).
  skipped integer NOT NULL DEFAULT 0,
  findings integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,

  prompt_tokens bigint NOT NULL DEFAULT 0,
  completion_tokens bigint NOT NULL DEFAULT 0,
  -- Ước tính, phục vụ trần chi phí. KHÔNG phải hoá đơn.
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,

  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS question_audit_runs_created_at_idx
  ON public.question_audit_runs (created_at DESC);

COMMENT ON TABLE public.question_audit_runs IS
  'Một lượt quét ngân hàng câu hỏi bằng AI. Chỉ service_role chạm tới; '
  'trang /admin/questions/audit đi qua route handler đã kiểm role admin.';

-- ---------------------------------------------------------------------------
-- PHẦN 2 — MỘT DÒNG MỖI CÂU
-- ---------------------------------------------------------------------------
-- `trang_thai` nằm ở ĐÂY chứ không ở chỗ khác, để mở lại một lượt quét cũ vẫn
-- biết cái gì đã xử.

CREATE TABLE IF NOT EXISTS public.question_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.question_audit_runs(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_type text NOT NULL,

  -- `luat`: lớp luật tất định bắt được, chưa từng gửi cho model.
  -- `ai`:   model đã giải lại và kết luận.
  nguon text NOT NULL CHECK (nguon IN ('luat', 'ai')),

  ket_luan text
    CHECK (ket_luan IN ('dung', 'dap_an_sai', 'loi_giai_sai', 'ca_hai_sai', 'khong_kiem_duoc')),
  khop_dap_an_dang_luu boolean,
  loi_giai_tu_lam text,
  dap_an_tu_lam text,

  -- Đề xuất. Với `multiple_choice` là một `answers.id`; với `true_false` là danh
  -- sách id các ý phải mang `is_correct = true`, nối bằng dấu phẩy; với
  -- `short_answer` là giá trị đáp án.
  de_xuat_dap_an text,
  de_xuat_loi_giai text,

  loi_latex jsonb NOT NULL DEFAULT '[]'::jsonb,
  do_tin_cay numeric(4, 3),
  -- Kết quả lớp luật, giữ nguyên kể cả khi model nói câu này đúng.
  rule_issues jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Ghi chú tự do của lượt quét: lý do bỏ qua, hoặc message lỗi provider đã cắt
  -- gọn. CỐ Ý tách khỏi `rule_issues` — trộn lỗi hạ tầng vào kết quả lớp luật
  -- sẽ làm hỏng mọi phép đếm theo mã lỗi.
  ghi_chu text,

  -- Số attempt ĐÃ NỘP có câu này, chụp lúc tạo finding. Hiển thị ngay cạnh nút
  -- áp dụng; RPC kiểm lại trước khi ghi.
  affected_attempts integer NOT NULL DEFAULT 0,

  trang_thai text NOT NULL DEFAULT 'cho_duyet'
    CHECK (trang_thai IN ('cho_duyet', 'da_ap_dung', 'da_bo_qua')),
  -- Giá trị TRƯỚC khi áp dụng, ghi lại lúc ghi. Đây là đường lui duy nhất khi
  -- một bản sửa hoá ra sai.
  gia_tri_cu jsonb,
  xu_ly_boi uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  xu_ly_luc timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_audit_findings_run_idx
  ON public.question_audit_findings (run_id, ket_luan);
CREATE INDEX IF NOT EXISTS question_audit_findings_question_idx
  ON public.question_audit_findings (question_id);

-- ---------------------------------------------------------------------------
-- PHẦN 3 — ĐẾM ATTEMPT BỊ ẢNH HƯỞNG
-- ---------------------------------------------------------------------------
-- Gộp cả hai miền: `simulation`/`practice` (student_answers) và `homework`
-- (homework_answers). Chỉ đếm attempt ĐÃ NỘP — bài đang làm dở chưa có điểm để
-- lệch chuẩn.
--
-- SECURITY DEFINER vì nó đọc hai bảng mà người gọi không nhất thiết đọc được,
-- và nó chỉ trả về MỘT con số nên không rò rỉ dữ liệu học sinh.

CREATE OR REPLACE FUNCTION public.question_audit_affected_attempts(p_question_id text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    (
      SELECT COUNT(*)
      FROM public.student_answers sa
      JOIN public.exam_attempts ea ON ea.id = sa.attempt_id
      WHERE sa.question_id = p_question_id
        AND ea.status IN ('submitted', 'graded')
    )
    + (
      SELECT COUNT(*)
      FROM public.homework_answers ha
      JOIN public.homework_attempts hat ON hat.id = ha.attempt_id
      WHERE ha.question_id = p_question_id
        AND hat.status IN ('submitted', 'graded')
    )
  )::integer;
$$;

COMMENT ON FUNCTION public.question_audit_affected_attempts(text) IS
  'Số bài ĐÃ NỘP có chứa câu này, gộp exam và homework. Hiện cạnh nút áp dụng '
  'để người duyệt biết đổi đáp án sẽ làm lệch chuẩn bao nhiêu bài đã chấm.';

-- ---------------------------------------------------------------------------
-- PHẦN 4 — ÁP DỤNG MỘT ĐỀ XUẤT
-- ---------------------------------------------------------------------------
-- Đây là ĐƯỜNG GHI DUY NHẤT của công cụ. Ba lý do nó phải là một hàm trong
-- database chứ không phải vài lệnh UPDATE trong route handler:
--
--   1. Câu Đúng/Sai cần đổi `is_correct` của cả bốn ý CÙNG LÚC. Bốn lệnh UPDATE
--      rời nhau có thể áp được nửa chừng, để lại câu ở trạng thái không ai định.
--   2. `FOR UPDATE` trên dòng finding chặn hai tab cùng bấm áp dụng.
--   3. Số attempt bị ảnh hưởng phải được kiểm LẠI ngay trước khi ghi, trong cùng
--      transaction. Kiểm ở tầng ứng dụng rồi mới ghi là một cửa sổ chạy đua.
--
-- Hàm KHÔNG chấm lại bài cũ và KHÔNG tự quyết định gì: nó chỉ áp đúng bản sửa
-- đã nằm sẵn trong dòng finding do người duyệt đọc và bấm.

CREATE OR REPLACE FUNCTION public.apply_question_audit_finding(
  p_finding_id uuid,
  p_actor uuid,
  p_expected_attempts integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f public.question_audit_findings%ROWTYPE;
  v_attempts integer;
  v_ids text[];
  v_answer_count integer;
  v_old jsonb;
BEGIN
  SELECT * INTO f
  FROM public.question_audit_findings
  WHERE id = p_finding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINDING_NOT_FOUND';
  END IF;
  IF f.trang_thai <> 'cho_duyet' THEN
    RAISE EXCEPTION 'FINDING_ALREADY_HANDLED: %', f.trang_thai;
  END IF;

  -- Người duyệt bấm dựa trên con số họ NHÌN THẤY. Nếu giữa lúc nhìn và lúc bấm
  -- có thêm học sinh nộp bài, con số đó không còn là cái họ đã cân nhắc.
  v_attempts := public.question_audit_affected_attempts(f.question_id);
  IF v_attempts <> p_expected_attempts THEN
    RAISE EXCEPTION 'ATTEMPTS_CHANGED: thực tế % , người duyệt thấy %',
      v_attempts, p_expected_attempts;
  END IF;

  IF f.ket_luan = 'dap_an_sai' THEN
    IF f.de_xuat_dap_an IS NULL OR btrim(f.de_xuat_dap_an) = '' THEN
      RAISE EXCEPTION 'NO_ANSWER_FIX';
    END IF;

    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'content', a.content, 'is_correct', a.is_correct)
             ORDER BY a.order_index)
      INTO v_old
    FROM public.answers a
    WHERE a.question_id = f.question_id;

    IF f.question_type = 'short_answer' THEN
      -- Nhiều dòng đáp án nghĩa là ngân hàng đang chấp nhận nhiều dạng viết.
      -- Ghi đè tất cả bằng một giá trị sẽ xoá mất các dạng còn lại, nên dừng và
      -- để người soạn tự sửa.
      SELECT COUNT(*) INTO v_answer_count
      FROM public.answers WHERE question_id = f.question_id;
      IF v_answer_count <> 1 THEN
        RAISE EXCEPTION 'SHORT_ANSWER_MULTIPLE_ROWS: % dòng đáp án, phải sửa tay', v_answer_count;
      END IF;

      UPDATE public.answers
         SET content = f.de_xuat_dap_an,
             is_correct = true
       WHERE question_id = f.question_id;
    ELSE
      -- `multiple_choice`: một id. `true_false`: danh sách id nối bằng dấu phẩy;
      -- chuỗi rỗng sau khi tách nghĩa là cả bốn ý đều Sai, và đó là bản sửa hợp lệ.
      v_ids := ARRAY(
        SELECT btrim(part)
        FROM unnest(string_to_array(f.de_xuat_dap_an, ',')) AS part
        WHERE btrim(part) <> ''
      );

      -- Id lạ phải chặn ở đây, không chỉ ở validator tầng ứng dụng: hàm này là
      -- chốt cuối trước khi dữ liệu đổi.
      IF EXISTS (
        SELECT 1 FROM unnest(v_ids) AS wanted(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.answers a
          WHERE a.id = wanted.id AND a.question_id = f.question_id
        )
      ) THEN
        RAISE EXCEPTION 'ANSWER_ID_NOT_IN_QUESTION';
      END IF;

      IF f.question_type = 'multiple_choice' AND array_length(v_ids, 1) <> 1 THEN
        RAISE EXCEPTION 'MULTIPLE_CHOICE_NEEDS_EXACTLY_ONE_ANSWER';
      END IF;

      UPDATE public.answers
         SET is_correct = (id = ANY(v_ids))
       WHERE question_id = f.question_id;
    END IF;

  ELSIF f.ket_luan = 'loi_giai_sai' THEN
    IF f.de_xuat_loi_giai IS NULL OR btrim(f.de_xuat_loi_giai) = '' THEN
      RAISE EXCEPTION 'NO_SOLUTION_FIX';
    END IF;

    SELECT jsonb_build_object('explanation', q.explanation)
      INTO v_old
    FROM public.questions q WHERE q.id = f.question_id;

    UPDATE public.questions
       SET explanation = f.de_xuat_loi_giai,
           updated_at = now()
     WHERE id = f.question_id;

  ELSE
    -- `dung`, `ca_hai_sai`, `khong_kiem_duoc` đều không có gì để áp dụng.
    -- `ca_hai_sai` là chủ ý: câu hỏng cả đáp án lẫn lời giải phải để người soạn
    -- viết lại, không vá tự động.
    RAISE EXCEPTION 'NOTHING_TO_APPLY: %', COALESCE(f.ket_luan, 'null');
  END IF;

  UPDATE public.question_audit_findings
     SET trang_thai = 'da_ap_dung',
         gia_tri_cu = v_old,
         xu_ly_boi = p_actor,
         xu_ly_luc = now()
   WHERE id = p_finding_id;

  RETURN jsonb_build_object(
    'ok', true,
    'question_id', f.question_id,
    'affected_attempts', v_attempts
  );
END;
$$;

COMMENT ON FUNCTION public.apply_question_audit_finding(uuid, uuid, integer) IS
  'Đường ghi DUY NHẤT của công cụ rà soát. Áp đúng bản sửa đã lưu trong finding, '
  'trong một transaction, sau khi kiểm lại số attempt bị ảnh hưởng. Không chấm '
  'lại bài cũ — đó là quyết định của giáo viên.';

-- ---------------------------------------------------------------------------
-- PHẦN 5 — QUYỀN
-- ---------------------------------------------------------------------------
-- REVOKE TRƯỚC, GRANT SAU. Xem ghi chú đầu file về default privileges.

ALTER TABLE public.question_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_audit_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.question_audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_audit_findings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_audit_runs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.question_audit_findings
  FROM PUBLIC, anon, authenticated, service_role;

-- `service_role` cần UPDATE thật: con trỏ tiến trình và trạng thái xử lý đều
-- nằm trên hai bảng này. DELETE chỉ cấp trên `runs` để xoá được lượt quét cũ;
-- finding đi theo qua ON DELETE CASCADE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_audit_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.question_audit_findings TO service_role;

REVOKE ALL ON FUNCTION public.question_audit_affected_attempts(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_audit_affected_attempts(text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_question_audit_finding(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_question_audit_finding(uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- PHẦN 6 — TỰ KIỂM TRONG TRANSACTION
-- ---------------------------------------------------------------------------
-- Postflight đọc catalog KHÔNG chứng minh được lớp lỗi RLS (bài học 20260809),
-- nhưng nó chứng minh được đúng thứ nó nhìn: quyền trên bảng và sự tồn tại của
-- hàm. Phần còn lại kiểm bằng runtime qua PostgREST — xem `docs/RUNBOOK.md`.

DO $$
DECLARE
  v_thua_quyen integer;
  v_thieu_ham integer;
BEGIN
  SELECT COUNT(*) INTO v_thua_quyen
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('question_audit_runs', 'question_audit_findings')
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF v_thua_quyen <> 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: anon/authenticated còn % quyền trên bảng audit', v_thua_quyen;
  END IF;

  SELECT COUNT(*) INTO v_thieu_ham
  FROM (VALUES
    ('public.question_audit_affected_attempts(text)'),
    ('public.apply_question_audit_finding(uuid, uuid, integer)')
  ) AS f(sig)
  WHERE to_regprocedure(f.sig) IS NULL;

  IF v_thieu_ham <> 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: thiếu % hàm', v_thieu_ham;
  END IF;

  RAISE NOTICE 'POSTFLIGHT OK: must_be_zero thua_quyen=%, thieu_ham=%', v_thua_quyen, v_thieu_ham;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
-- 1. Đặt `QUESTION_AUDIT_ENABLED=true` và `DEEPSEEK_API_KEY` ở biến môi trường
--    server. Không có cờ thì mọi route audit trả 503 — fail-closed.
-- 2. Chạy thử trên MỘT bài nhỏ trước một chương. Đối chiếu tay 20 câu rồi ghi
--    con số "công cụ nói đúng bao nhiêu phần" vào `docs/QUESTION_AUDIT_PLAN.md`
--    mục 10. Chưa có con số thì chưa biết nên tin nó tới đâu.
-- 3. Negative test bằng anon key qua PostgREST: `SELECT` trên hai bảng phải trả
--    lỗi quyền, không phải mảng rỗng.
