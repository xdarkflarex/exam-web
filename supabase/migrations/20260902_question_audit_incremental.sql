-- =====================================================================
-- RÀ SOÁT NGÂN HÀNG — QUÉT DẦN DẦN VÀ PHÂN TRANG
-- =====================================================================
--
-- Tiếp theo `20260901_question_audit_scope.sql` (đã nạp 2026-08-31).
--
-- VẤN ĐỀ — "QUÉT TOÀN BỘ" NHIỀU LƯỢT THÌ QUÉT TRÙNG
-- `question_audit_scope_ids` chọn `ORDER BY id LIMIT p_limit`. Trần mặc định là
-- 300 câu/lượt, mà ngân hàng có 1436 câu — nên bấm "Toàn bộ ngân hàng" năm lần
-- sẽ quét ĐÚNG 300 câu đầu năm lần, và 1136 câu còn lại không bao giờ tới lượt.
-- Tệ hơn: nó im lặng, vì mỗi lượt trông vẫn "chạy xong 300/300".
--
-- CÁCH LÀM
-- Hàm MỚI `question_audit_select_scope` thêm hai tham số:
--
--   * `p_bo_qua_da_quet` — loại những câu đã có dòng trong
--     `question_audit_findings`. Đây là thứ biến "bấm lại lần nữa" thành "quét
--     tiếp phần còn lại". Cũng là thứ khiến quét lại sau vài tháng chỉ tốn tiền
--     cho câu mới nhập.
--   * `p_offset` — để trang phân loại kéo từng trang thay vì nuốt cả 297 câu
--     một lần.
--
-- VÌ SAO HÀM MỚI CHỨ KHÔNG SỬA HÀM CŨ
-- Thêm tham số là đổi chữ ký. DROP rồi CREATE lại mở ra một cửa sổ mà code đang
-- chạy (gọi 6 tham số) không khớp hàm trong database (7 tham số) — nút quét chết
-- trong khoảng giữa migration và deploy. Thêm hàm mới thì code cũ vẫn chạy
-- nguyên vẹn, và rollback code không cần rollback database.
--
-- BẤT BIẾN GIỮ NGUYÊN
--   * Chỉ ĐỌC. Không tạo lượt quét, không ghi gì.
--   * `essay` luôn bị loại.
--   * `ORDER BY id` cố định, để cùng một phạm vi cho cùng một danh sách.
--   * Chế độ `taxonomy` không có tầng nào vẫn phải nổ `SCOPE_REQUIRED`, nếu
--     không "theo chương" âm thầm thành "toàn bộ ngân hàng".
--
-- HOÀN TÁC
-- `supabase/rollback/20260902_question_audit_incremental_rollback.sql`.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.question_audit_scope_ids(text, text, text, text, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: phải nạp 20260901_question_audit_scope.sql trước';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.question_audit_select_scope(
  p_mode text,
  p_topic_id text DEFAULT NULL,
  p_category_id text DEFAULT NULL,
  p_section_id text DEFAULT NULL,
  p_subsection_id text DEFAULT NULL,
  p_limit integer DEFAULT 300,
  p_offset integer DEFAULT 0,
  p_bo_qua_da_quet boolean DEFAULT false
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

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 1; END IF;
  IF p_limit > 5000 THEN p_limit := 5000; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

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
      -- COALESCE để câu có question_type NULL (dữ liệu hỏng) không bị lọc mất:
      -- `NULL <> 'essay'` cho NULL. Ta muốn thấy những dòng đó.
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
      -- "Đã quét" = đã có dòng finding ở BẤT KỲ lượt nào. Cố ý không phân biệt
      -- finding đã xử lý hay chưa: cái ta muốn tránh là trả tiền cho model hai
      -- lần trên cùng một câu, còn việc duyệt xong hay chưa là chuyện khác và
      -- đã có cột `trang_thai` lo.
      AND (
        NOT p_bo_qua_da_quet
        OR NOT EXISTS (
          SELECT 1 FROM public.question_audit_findings f WHERE f.question_id = q.id
        )
      )
  )
  SELECT
    (SELECT COUNT(*)::integer FROM ung_vien),
    ARRAY(SELECT id FROM ung_vien ORDER BY id OFFSET p_offset LIMIT p_limit)
  INTO v_total, v_ids;

  RETURN jsonb_build_object(
    'ids', to_jsonb(COALESCE(v_ids, ARRAY[]::text[])),
    -- Số câu của cả phạm vi SAU khi đã trừ nhóm bỏ qua, TRƯỚC khi cắt theo
    -- offset/limit. Route dùng nó để nói "còn N câu nữa" thay vì im lặng.
    'total', COALESCE(v_total, 0),
    'offset', p_offset
  );
END;
$$;

COMMENT ON FUNCTION public.question_audit_select_scope(text, text, text, text, text, integer, integer, boolean) IS
  'Danh sách id câu cho một lượt rà soát. Thay thế question_audit_scope_ids: '
  'thêm p_offset (phân trang) và p_bo_qua_da_quet (quét tiếp phần chưa quét thay '
  'vì lặp lại 300 câu đầu). Trả jsonb vô hướng nên không đụng trần db-max-rows.';

COMMENT ON FUNCTION public.question_audit_scope_ids(text, text, text, text, text, integer) IS
  'CŨ. Giữ để code trước 2026-09-01 còn chạy được. Đường mới là '
  'question_audit_select_scope — nó quét dần dần được, hàm này thì không.';

REVOKE ALL ON FUNCTION public.question_audit_select_scope(text, text, text, text, text, integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_audit_select_scope(text, text, text, text, text, integer, integer, boolean)
  TO service_role;

-- Anti-join "đã quét" chạy trên `question_audit_findings.question_id`.
-- `20260830` đã có index đúng cột này (`question_audit_findings_question_idx`),
-- nên không cần thêm gì.

-- ---------------------------------------------------------------------------
-- TỰ KIỂM
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tat_ca integer;
  v_chua_quet integer;
  v_ket_qua jsonb;
BEGIN
  v_ket_qua := public.question_audit_select_scope('tat_ca', NULL, NULL, NULL, NULL, 1, 0, false);
  IF NOT (v_ket_qua ? 'ids' AND v_ket_qua ? 'total' AND v_ket_qua ? 'offset') THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: hàm không trả về {ids, total, offset}';
  END IF;
  v_tat_ca := (v_ket_qua->>'total')::integer;

  v_chua_quet := (
    (public.question_audit_select_scope('tat_ca', NULL, NULL, NULL, NULL, 1, 0, true))->>'total'
  )::integer;

  -- Bỏ qua câu đã quét thì tập phải NHỎ HƠN HOẶC BẰNG. Lớn hơn nghĩa là mệnh đề
  -- lọc đang nới ra thay vì siết lại.
  IF v_chua_quet > v_tat_ca THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: bo_qua_da_quet cho tập lớn hơn (% > %)', v_chua_quet, v_tat_ca;
  END IF;

  BEGIN
    PERFORM public.question_audit_select_scope('taxonomy', NULL, NULL, NULL, NULL, 1, 0, false);
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: taxonomy không phạm vi lẽ ra phải báo SCOPE_REQUIRED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SCOPE_REQUIRED%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'POSTFLIGHT OK: toàn bộ = % câu, chưa quét = % câu', v_tat_ca, v_chua_quet;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
-- Xem còn bao nhiêu câu chưa quét lần nào:
--
--   SELECT (public.question_audit_select_scope('tat_ca', NULL,NULL,NULL,NULL, 1, 0, true))->>'total';
--
-- Con số đó giảm dần sau mỗi lượt quét. Về 0 là đã phủ hết ngân hàng.
