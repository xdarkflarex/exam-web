-- =====================================================================
-- SỬA LỖI: `apply_question_audit_finding` KHÔNG ÁP DỤNG ĐƯỢC GÌ
-- =====================================================================
--
-- TRIỆU CHỨNG
-- Bấm "Áp dụng" trên bất kỳ đề xuất nào cũng trả 409 kèm
-- `malformed array literal`. Không phụ thuộc dạng câu, không phụ thuộc loại kết
-- luận — MỌI lần áp dụng đều hỏng kể từ khi `20260831` được nạp.
--
-- NGUYÊN NHÂN
-- `20260831` gom danh sách phần đã ghi bằng:
--
--     v_applied := v_applied || 'dap_an';
--
-- `v_applied` là `text[]`, còn `'dap_an'` là literal KHÔNG CÓ KIỂU (`unknown`).
-- Toán tử `||` có hai dạng khớp được: `anyarray || anyelement` và
-- `anyarray || anyarray`. Với toán hạng phải chưa có kiểu, Postgres chọn dạng
-- mảng-với-mảng, tức là nó cố đọc `dap_an` như MỘT ARRAY LITERAL — và ném
-- `malformed array literal`.
--
-- Cái bẫy nằm ở chỗ nó chỉ nổ lúc CHẠY. Hàm tạo ra bình thường, postflight của
-- `20260831` (đếm cột và đếm quyền) đạt hết, và không có gì báo động cho tới khi
-- có người bấm nút thật. Đó cũng là lý do postflight ở cuối file này GỌI hàm
-- thật thay vì chỉ kiểm nó có tồn tại.
--
-- CÁCH SỬA
-- `array_append(v_applied, 'dap_an'::text)` — không còn chỗ nào để Postgres
-- chọn nhầm dạng toán tử.
--
-- Thân hàm còn lại giữ NGUYÊN từ `20260831`. Chữ ký không đổi nên REVOKE/GRANT
-- của `20260830` còn nguyên hiệu lực.
--
-- HOÀN TÁC
-- Không cần: bản trước không áp dụng được gì, hoàn tác về nó là quay lại đúng
-- lỗi này. Muốn thì chạy lại phần 3 của `20260831`.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.apply_question_audit_finding(uuid, uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: phải nạp 20260830 và 20260831 trước';
  END IF;
END;
$$;

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
  v_applied text[] := ARRAY[]::text[];
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

  -- Đề sai hoặc không đọc được câu: không có bản sửa nào hợp lệ.
  IF f.ket_luan IN ('de_sai', 'khong_kiem_duoc') THEN
    RAISE EXCEPTION 'NOTHING_TO_APPLY: %', f.ket_luan;
  END IF;

  -- Người duyệt bấm dựa trên con số họ NHÌN THẤY.
  v_attempts := public.question_audit_affected_attempts(f.question_id);
  IF v_attempts <> p_expected_attempts THEN
    RAISE EXCEPTION 'ATTEMPTS_CHANGED: thực tế % , người duyệt thấy %',
      v_attempts, p_expected_attempts;
  END IF;

  -- Chụp giá trị cũ TRƯỚC mọi lệnh ghi — đường lui duy nhất khi bản sửa hoá ra sai.
  SELECT jsonb_build_object(
           'answers', (
             SELECT jsonb_agg(jsonb_build_object(
                      'id', a.id, 'content', a.content, 'is_correct', a.is_correct)
                    ORDER BY a.order_index)
             FROM public.answers a WHERE a.question_id = f.question_id
           ),
           'explanation', q.explanation,
           'solution', q.solution
         )
    INTO v_old
  FROM public.questions q
  WHERE q.id = f.question_id;

  -- --- Đáp án -------------------------------------------------------------
  IF f.de_xuat_dap_an IS NOT NULL THEN
    IF f.question_type = 'short_answer' THEN
      SELECT COUNT(*) INTO v_answer_count
      FROM public.answers WHERE question_id = f.question_id;
      IF v_answer_count <> 1 THEN
        RAISE EXCEPTION 'SHORT_ANSWER_MULTIPLE_ROWS: % dòng đáp án, phải sửa tay', v_answer_count;
      END IF;

      UPDATE public.answers
         SET content = f.de_xuat_dap_an, is_correct = true
       WHERE question_id = f.question_id;
    ELSE
      v_ids := ARRAY(
        SELECT btrim(part)
        FROM unnest(string_to_array(f.de_xuat_dap_an, ',')) AS part
        WHERE btrim(part) <> ''
      );

      IF EXISTS (
        SELECT 1 FROM unnest(v_ids) AS wanted(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.answers a
          WHERE a.id = wanted.id AND a.question_id = f.question_id
        )
      ) THEN
        RAISE EXCEPTION 'ANSWER_ID_NOT_IN_QUESTION';
      END IF;

      IF f.question_type = 'multiple_choice' AND COALESCE(array_length(v_ids, 1), 0) <> 1 THEN
        RAISE EXCEPTION 'MULTIPLE_CHOICE_NEEDS_EXACTLY_ONE_ANSWER';
      END IF;

      UPDATE public.answers
         SET is_correct = (id = ANY(v_ids))
       WHERE question_id = f.question_id;
    END IF;

    -- BẢN SỬA. `v_applied || 'dap_an'` khiến Postgres đọc literal như một array
    -- literal và ném `malformed array literal` ngay lúc chạy.
    v_applied := array_append(v_applied, 'dap_an'::text);
  END IF;

  -- --- Hai ô lời giải, mỗi ô ghi đúng cột của nó --------------------------
  IF f.de_xuat_explanation IS NOT NULL AND btrim(f.de_xuat_explanation) <> '' THEN
    UPDATE public.questions
       SET explanation = f.de_xuat_explanation, updated_at = now()
     WHERE id = f.question_id;
    v_applied := array_append(v_applied, 'explanation'::text);
  END IF;

  IF f.de_xuat_solution IS NOT NULL AND btrim(f.de_xuat_solution) <> '' THEN
    UPDATE public.questions
       SET solution = f.de_xuat_solution, updated_at = now()
     WHERE id = f.question_id;
    v_applied := array_append(v_applied, 'solution'::text);
  END IF;

  IF array_length(v_applied, 1) IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_APPLY: dòng này không có bản sửa nào';
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
    'affected_attempts', v_attempts,
    'applied', to_jsonb(v_applied)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- TỰ KIỂM — GỌI HÀM THẬT
-- ---------------------------------------------------------------------------
-- Postflight của `20260831` chỉ đếm cột và đếm quyền, nên nó ĐẠT trong khi hàm
-- hỏng hoàn toàn. Bài học: lỗi chỉ nổ lúc chạy thì phải kiểm bằng cách chạy.
--
-- Gọi với một id không tồn tại: hàm phải đi tới `FINDING_NOT_FOUND`. Bất kỳ lỗi
-- nào khác nghĩa là thân hàm vẫn hỏng. Không đụng tới dữ liệu thật.

DO $$
DECLARE
  v_den_duoc_cuoi boolean := false;
BEGIN
  BEGIN
    PERFORM public.apply_question_audit_finding(
      '00000000-0000-0000-0000-000000000000'::uuid,
      NULL::uuid,
      0
    );
  EXCEPTION WHEN OTHERS THEN
    -- Chỉ MỘT lỗi được coi là đạt. Mọi lỗi khác nghĩa là thân hàm còn hỏng ở
    -- một chỗ nào đó trước khi tới được phép kiểm "không tìm thấy".
    IF SQLERRM LIKE '%FINDING_NOT_FOUND%' THEN
      v_den_duoc_cuoi := true;
    ELSE
      RAISE EXCEPTION 'POSTFLIGHT_FAIL: thân hàm còn lỗi -> %', SQLERRM;
    END IF;
  END;

  IF NOT v_den_duoc_cuoi THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: gọi với id không tồn tại mà không báo FINDING_NOT_FOUND';
  END IF;

  RAISE NOTICE 'POSTFLIGHT OK: apply_question_audit_finding chạy tới FINDING_NOT_FOUND';
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
-- Không cần quét lại. Mọi finding đang ở `cho_duyet` vẫn nguyên vẹn — bản hỏng
-- ném lỗi TRƯỚC khi ghi bất cứ thứ gì, nên không có dữ liệu nào bị sửa dở.
-- Mở lại lượt quét cũ và bấm Áp dụng là chạy.
