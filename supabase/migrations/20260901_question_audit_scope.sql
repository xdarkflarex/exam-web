-- =====================================================================
-- RÀ SOÁT NGÂN HÀNG — QUÉT CÂU CHƯA PHÂN LOẠI VÀ QUÉT TOÀN BỘ
-- =====================================================================
--
-- Tiếp theo `20260830_question_audit.sql` và `20260831_question_audit_full_check.sql`.
--
-- VẤN ĐỀ 1 — CÂU CHƯA PHÂN LOẠI LÀ ĐIỂM MÙ HOÀN TOÀN
-- Route `/api/admin/questions/audit/start` chọn câu bằng
-- `questions ... question_taxonomy!inner(...)` — một phép NỐI TRONG. Câu nào
-- chưa có dòng trong `question_taxonomy` thì **không lượt quét nào chạm tới
-- được**, chọn phạm vi kiểu gì cũng vậy. Đây đúng là nhóm nguy hiểm nhất: một
-- đợt nhập OCR mới thường chưa kịp phân loại tay, tức là nhóm dễ sai nhất lại
-- là nhóm công cụ không nhìn thấy.
--
-- VẤN ĐỀ 2 — TRẦN 1000 DÒNG CỦA POSTGREST
-- Supabase đặt `db-max-rows` mặc định 1000. `.limit(2000)` từ client vẫn chỉ
-- nhận về 1000 dòng, IM LẶNG. Một lượt "quét toàn bộ" dựng bằng truy vấn
-- thường sẽ tự cắt cụt mà không báo gì — và người dùng tưởng đã quét hết.
--
-- CÁCH LÀM
-- Một hàm trả về `jsonb` gồm `{ ids, total }`. Trả MỘT giá trị vô hướng nên
-- không đụng trần `db-max-rows`, và `total` là số đếm TRƯỚC khi cắt theo
-- `p_limit` — nhờ đó route biết mình có bị cắt cụt hay không và nói thẳng ra.
--
-- BẤT BIẾN
--   * Hàm này chỉ ĐỌC. Nó không tạo lượt quét, không ghi gì.
--   * `essay` luôn bị loại: pilot tự luận chấm theo rubric, không có đáp án
--     đánh dấu để đối chiếu.
--   * Thứ tự `ORDER BY id` là cố định, để một lượt quét bị ngắt rồi chạy lại
--     trên cùng phạm vi cho ra cùng danh sách.
--
-- HOÀN TÁC
-- `supabase/rollback/20260901_question_audit_scope_rollback.sql`.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.question_audit_runs') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: phải nạp 20260830_question_audit.sql trước';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- HÀM CHỌN PHẠM VI
-- ---------------------------------------------------------------------------
-- `p_mode`:
--   'taxonomy'       — theo cây chủ đề, đúng hành vi cũ. Phải có ít nhất một
--                      tầng, nếu không thì nó thành 'tat_ca' một cách tình cờ.
--   'chua_phan_loai' — câu KHÔNG có dòng nào trong question_taxonomy.
--   'tat_ca'         — toàn bộ ngân hàng, bỏ qua taxonomy.
--
-- SECURITY DEFINER vì nó đọc `question_taxonomy`, và chỉ trả về danh sách id
-- câu hỏi — không có dữ liệu học sinh, không có đáp án.

CREATE OR REPLACE FUNCTION public.question_audit_scope_ids(
  p_mode text,
  p_topic_id text DEFAULT NULL,
  p_category_id text DEFAULT NULL,
  p_section_id text DEFAULT NULL,
  p_subsection_id text DEFAULT NULL,
  p_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids text[];
  v_total integer;
BEGIN
  IF p_mode NOT IN ('taxonomy', 'chua_phan_loai', 'tat_ca') THEN
    RAISE EXCEPTION 'UNKNOWN_MODE: %', p_mode;
  END IF;

  -- Chặn cấu hình vô lý từ phía gọi. Trần cứng 5000 là chốt cuối: một lượt
  -- quét lớn hơn thế thì tiền và thời gian đọc đều vượt xa mức một người soạn
  -- xử lý nổi, và nên chia nhỏ.
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 1; END IF;
  IF p_limit > 5000 THEN p_limit := 5000; END IF;

  IF p_mode = 'taxonomy'
     AND p_topic_id IS NULL AND p_category_id IS NULL
     AND p_section_id IS NULL AND p_subsection_id IS NULL THEN
    RAISE EXCEPTION 'SCOPE_REQUIRED';
  END IF;

  WITH ung_vien AS (
    SELECT q.id
    FROM public.questions q
    LEFT JOIN public.question_taxonomy qt ON qt.question_id = q.id
    WHERE
      -- COALESCE để câu có question_type NULL (dữ liệu hỏng) KHÔNG bị loại
      -- lặng lẽ: `NULL <> 'essay'` cho NULL, tức là bị lọc mất. Ta muốn thấy
      -- những dòng đó, lớp luật sẽ gắn cờ chúng.
      COALESCE(q.question_type, '') <> 'essay'
      AND CASE p_mode
            WHEN 'tat_ca' THEN true
            WHEN 'chua_phan_loai' THEN qt.question_id IS NULL
            ELSE
              qt.question_id IS NOT NULL
              AND (p_topic_id IS NULL OR qt.topic_id = p_topic_id)
              AND (p_category_id IS NULL OR qt.category_id = p_category_id)
              AND (p_section_id IS NULL OR qt.section_id = p_section_id)
              AND (p_subsection_id IS NULL OR qt.subsection_id = p_subsection_id)
          END
  )
  SELECT
    -- `total` đếm TRƯỚC khi cắt: route dùng nó để nói "phạm vi có N câu, lượt
    -- này chỉ lấy p_limit câu đầu" thay vì im lặng cắt cụt.
    (SELECT COUNT(*)::integer FROM ung_vien),
    ARRAY(SELECT id FROM ung_vien ORDER BY id LIMIT p_limit)
  INTO v_total, v_ids;

  RETURN jsonb_build_object(
    'ids', to_jsonb(COALESCE(v_ids, ARRAY[]::text[])),
    'total', COALESCE(v_total, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.question_audit_scope_ids(text, text, text, text, text, integer) IS
  'Danh sách id câu cho một lượt rà soát, theo cây chủ đề / chỉ câu chưa phân '
  'loại / toàn bộ. Trả jsonb {ids, total} — vô hướng nên không đụng trần '
  'db-max-rows 1000 của PostgREST, và total là số đếm trước khi cắt theo p_limit.';

REVOKE ALL ON FUNCTION public.question_audit_scope_ids(text, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_audit_scope_ids(text, text, text, text, text, integer)
  TO service_role;

-- Câu chưa phân loại được tìm bằng anti-join trên khoá chính của
-- `question_taxonomy`, nên không cần index thêm. Index này phục vụ `ORDER BY id
-- LIMIT` trên `questions` khi quét toàn bộ.
CREATE INDEX IF NOT EXISTS questions_type_id_idx
  ON public.questions (question_type, id);

-- ---------------------------------------------------------------------------
-- TỰ KIỂM
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_ket_qua jsonb;
BEGIN
  IF to_regprocedure('public.question_audit_scope_ids(text, text, text, text, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: thiếu hàm question_audit_scope_ids';
  END IF;

  -- Gọi thật một lượt: hàm phải chạy được và trả đúng hình dạng.
  v_ket_qua := public.question_audit_scope_ids('chua_phan_loai', NULL, NULL, NULL, NULL, 1);
  IF NOT (v_ket_qua ? 'ids' AND v_ket_qua ? 'total') THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: hàm không trả về {ids, total}';
  END IF;

  -- Chế độ taxonomy KHÔNG có tầng nào phải nổ, nếu không thì "theo chương" sẽ
  -- âm thầm biến thành "toàn bộ ngân hàng".
  BEGIN
    PERFORM public.question_audit_scope_ids('taxonomy', NULL, NULL, NULL, NULL, 1);
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: taxonomy không phạm vi lẽ ra phải báo SCOPE_REQUIRED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SCOPE_REQUIRED%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'POSTFLIGHT OK: question_audit_scope_ids chạy được, total=%',
    v_ket_qua->>'total';
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
-- Đếm nhanh nhóm điểm mù trước khi quét, để biết mình sắp trả tiền cho bao nhiêu câu:
--
--   SELECT (public.question_audit_scope_ids('chua_phan_loai'))->>'total' AS chua_phan_loai,
--          (public.question_audit_scope_ids('tat_ca'))->>'total'         AS tong_cong;
--
-- Trang `/admin/questions/audit` cũng hiện đúng hai con số này kèm ước tính chi
-- phí, tính từ chi phí thật của các lượt quét trước.
