-- Hoàn tác `20260831_question_audit_full_check.sql`, quay về hành vi của
-- `20260830_question_audit.sql`.
--
-- AN TOÀN VỚI NGÂN HÀNG CÂU HỎI: file này KHÔNG hoàn tác những bản sửa đã áp
-- vào `answers`/`questions`. Giá trị cũ nằm ở `question_audit_findings.gia_tri_cu`.
--
-- MẤT DỮ LIỆU: xoá năm cột thêm ở 20260831 sẽ mất mô tả lỗi theo từng phần và
-- các bản sửa `solution` chưa áp. Xuất ra trước nếu còn cần:
--
--   SELECT id, question_id, loi_de, mo_ta_dap_an, mo_ta_loi_giai,
--          de_xuat_explanation, de_xuat_solution
--     FROM public.question_audit_findings
--    WHERE trang_thai = 'cho_duyet';

BEGIN;

-- Dựng lại thân hàm v1: chỉ áp MỘT loại sửa, và lời giải luôn ghi vào explanation.
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
  SELECT * INTO f FROM public.question_audit_findings WHERE id = p_finding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINDING_NOT_FOUND'; END IF;
  IF f.trang_thai <> 'cho_duyet' THEN
    RAISE EXCEPTION 'FINDING_ALREADY_HANDLED: %', f.trang_thai;
  END IF;

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
    FROM public.answers a WHERE a.question_id = f.question_id;

    IF f.question_type = 'short_answer' THEN
      SELECT COUNT(*) INTO v_answer_count FROM public.answers WHERE question_id = f.question_id;
      IF v_answer_count <> 1 THEN
        RAISE EXCEPTION 'SHORT_ANSWER_MULTIPLE_ROWS: % dòng đáp án, phải sửa tay', v_answer_count;
      END IF;
      UPDATE public.answers SET content = f.de_xuat_dap_an, is_correct = true
       WHERE question_id = f.question_id;
    ELSE
      v_ids := ARRAY(
        SELECT btrim(part) FROM unnest(string_to_array(f.de_xuat_dap_an, ',')) AS part
        WHERE btrim(part) <> ''
      );
      IF EXISTS (
        SELECT 1 FROM unnest(v_ids) AS wanted(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.answers a WHERE a.id = wanted.id AND a.question_id = f.question_id
        )
      ) THEN
        RAISE EXCEPTION 'ANSWER_ID_NOT_IN_QUESTION';
      END IF;
      IF f.question_type = 'multiple_choice' AND COALESCE(array_length(v_ids, 1), 0) <> 1 THEN
        RAISE EXCEPTION 'MULTIPLE_CHOICE_NEEDS_EXACTLY_ONE_ANSWER';
      END IF;
      UPDATE public.answers SET is_correct = (id = ANY(v_ids)) WHERE question_id = f.question_id;
    END IF;

  ELSIF f.ket_luan = 'loi_giai_sai' THEN
    IF f.de_xuat_loi_giai IS NULL OR btrim(f.de_xuat_loi_giai) = '' THEN
      RAISE EXCEPTION 'NO_SOLUTION_FIX';
    END IF;
    SELECT jsonb_build_object('explanation', q.explanation) INTO v_old
    FROM public.questions q WHERE q.id = f.question_id;
    UPDATE public.questions SET explanation = f.de_xuat_loi_giai, updated_at = now()
     WHERE id = f.question_id;

  ELSE
    RAISE EXCEPTION 'NOTHING_TO_APPLY: %', COALESCE(f.ket_luan, 'null');
  END IF;

  UPDATE public.question_audit_findings
     SET trang_thai = 'da_ap_dung', gia_tri_cu = v_old,
         xu_ly_boi = p_actor, xu_ly_luc = now()
   WHERE id = p_finding_id;

  RETURN jsonb_build_object('ok', true, 'question_id', f.question_id,
                            'affected_attempts', v_attempts);
END;
$$;

-- Dòng mang `ket_luan = 'de_sai'` không hợp lệ với ràng buộc cũ. Chuyển về
-- `khong_kiem_duoc` — đó đúng là chỗ v1 xếp loại câu này.
UPDATE public.question_audit_findings
   SET ket_luan = 'khong_kiem_duoc',
       ghi_chu = COALESCE(ghi_chu || ' | ', '') || 'Trước rollback: ket_luan = de_sai'
 WHERE ket_luan = 'de_sai';

ALTER TABLE public.question_audit_findings
  DROP CONSTRAINT IF EXISTS question_audit_findings_ket_luan_check;
ALTER TABLE public.question_audit_findings
  ADD CONSTRAINT question_audit_findings_ket_luan_check
  CHECK (ket_luan IN ('dung', 'dap_an_sai', 'loi_giai_sai', 'ca_hai_sai', 'khong_kiem_duoc'));

ALTER TABLE public.question_audit_findings
  DROP COLUMN IF EXISTS loi_de,
  DROP COLUMN IF EXISTS mo_ta_dap_an,
  DROP COLUMN IF EXISTS mo_ta_loi_giai,
  DROP COLUMN IF EXISTS de_xuat_explanation,
  DROP COLUMN IF EXISTS de_xuat_solution;

COMMIT;
