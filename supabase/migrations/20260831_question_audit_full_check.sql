-- =====================================================================
-- RÀ SOÁT NGÂN HÀNG CÂU HỎI — SOÁT CẢ ĐỀ, ĐÁP ÁN VÀ LỜI GIẢI
-- =====================================================================
--
-- Tiếp theo `20260830_question_audit.sql` (đã nạp trên Primary 2026-08-30).
--
-- VẤN ĐỀ PHÁT HIỆN KHI CHẠY THẬT
--
-- 1. **Nhánh "cả hai sai" nuốt mất đúng loại câu cần sửa nhất.** Hợp đồng v1 bắt
--    model chọn MỘT kết luận, và quy tắc là: đáp án sai thì chỉ sửa đáp án, lời
--    giải sai thì chỉ sửa lời giải, cả hai sai thì KHÔNG đề xuất gì. Một đợt
--    nhập OCR hỏng thường hỏng cả hai cùng lúc, nên công cụ im lặng ở chỗ nó
--    đáng nói nhất. Chủ dự án phát hiện khi thấy trang chỉ đề xuất sửa đáp án.
--
-- 2. **Bản sửa lời giải rơi nhầm ô.** `questions` có HAI cột lời giải và học
--    sinh thấy cả hai với hai nhãn khác nhau: `explanation` ("Giải thích") và
--    `solution` ("Lời giải"). v1 chỉ có một trường đề xuất và RPC luôn ghi vào
--    `explanation`. Lỗi nằm ở `solution` thì bản sửa ghi sang ô khác, và ô sai
--    vẫn còn nguyên cho học sinh đọc. Đây là lỗi ghi sai dữ liệu, không phải
--    thiếu tính năng.
--
-- 3. **Không có chỗ nào nói "đề bài sai".** Đề mâu thuẫn hoặc thiếu dữ kiện chỉ
--    có thể rơi vào `khong_kiem_duoc`, lẫn với "AI không chắc" — hai thứ cần
--    hành động khác hẳn nhau.
--
-- CÁCH LÀM
-- Tách thành ba phán quyết độc lập (đề / đáp án / lời giải), mỗi phần tự mang mô
-- tả lỗi và bản sửa của nó. `ket_luan` được suy ra ở tầng ứng dụng từ ba phần đó
-- thay vì do model tự phát biểu.
--
-- BẤT BIẾN GIỮ NGUYÊN TỪ 20260830
--   * AI chỉ ĐỀ XUẤT; `apply_question_audit_finding` vẫn là đường ghi duy nhất.
--   * Số attempt bị ảnh hưởng vẫn được kiểm lại trong cùng transaction với lệnh ghi.
--   * Vẫn KHÔNG tự chấm lại bài cũ.
--
-- BẤT BIẾN BỊ THAY THẾ CÓ CHỦ ĐÍCH
--   * "Cả hai sai thì không tự sửa gì" — chủ dự án bỏ quy tắc này ngày
--     2026-08-30. Nay áp được cả hai bản sửa trong MỘT transaction. Đổi lại,
--     nhóm này không bao giờ được áp dụng hàng loạt, và vẫn phải xác nhận hai
--     bước như mọi câu đã có người làm.
--   * "Đề sai" là nhánh MỚI và cố ý KHÔNG có bản sửa tự động: viết lại đề là đổi
--     thứ đang được đo, không phải sửa lỗi. Công cụ chỉ báo để người soạn tự xử.
--
-- HOÀN TÁC
-- `supabase/rollback/20260831_question_audit_full_check_rollback.sql`.

BEGIN;

-- ---------------------------------------------------------------------------
-- PHẦN 0 — TIỀN ĐIỀU KIỆN
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.question_audit_findings') IS NULL
     OR to_regprocedure('public.apply_question_audit_finding(uuid, uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_MISSING: phải nạp 20260830_question_audit.sql trước';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- PHẦN 1 — CỘT CHO BA PHÁN QUYẾT
-- ---------------------------------------------------------------------------
-- Quyền: `20260830` cấp GRANT ở mức BẢNG, nên cột mới thừa hưởng. Không đổi
-- sang grant theo cột ở đây — làm thế là âm thầm thu hẹp quyền của cột khác.

ALTER TABLE public.question_audit_findings
  -- Mô tả lỗi của từng phần, do model viết cho người soạn đọc.
  ADD COLUMN IF NOT EXISTS loi_de text,
  ADD COLUMN IF NOT EXISTS mo_ta_dap_an text,
  ADD COLUMN IF NOT EXISTS mo_ta_loi_giai text,
  -- Bản sửa TÁCH THEO ĐÚNG CỘT ĐÍCH. Đây là bản vá của lỗi số 2 ở đầu file:
  -- một trường chung không đủ để nói bản sửa thuộc về ô nào.
  ADD COLUMN IF NOT EXISTS de_xuat_explanation text,
  ADD COLUMN IF NOT EXISTS de_xuat_solution text;

-- Dữ liệu cũ: `de_xuat_loi_giai` của v1 luôn được RPC ghi vào `explanation`,
-- nên đó là ô đúng để chuyển sang. Giữ nguyên cột cũ làm hồ sơ, không xoá.
UPDATE public.question_audit_findings
   SET de_xuat_explanation = de_xuat_loi_giai
 WHERE de_xuat_loi_giai IS NOT NULL
   AND de_xuat_explanation IS NULL;

COMMENT ON COLUMN public.question_audit_findings.de_xuat_loi_giai IS
  'CŨ (v1). Giữ làm hồ sơ; đã chuyển sang de_xuat_explanation. Đường ghi mới '
  'dùng de_xuat_explanation / de_xuat_solution vì hai ô lời giải là hai cột khác nhau.';

-- ---------------------------------------------------------------------------
-- PHẦN 2 — KẾT LUẬN MỚI `de_sai`
-- ---------------------------------------------------------------------------

ALTER TABLE public.question_audit_findings
  DROP CONSTRAINT IF EXISTS question_audit_findings_ket_luan_check;
ALTER TABLE public.question_audit_findings
  ADD CONSTRAINT question_audit_findings_ket_luan_check
  CHECK (ket_luan IN ('dung', 'de_sai', 'dap_an_sai', 'loi_giai_sai', 'ca_hai_sai', 'khong_kiem_duoc'));

-- ---------------------------------------------------------------------------
-- PHẦN 3 — ÁP DỤNG NHIỀU PHẦN TRONG MỘT TRANSACTION
-- ---------------------------------------------------------------------------
-- Thay thân hàm, GIỮ NGUYÊN chữ ký `(uuid, uuid, integer)` để REVOKE/GRANT của
-- `20260830` còn nguyên hiệu lực. Đổi chữ ký ở đây sẽ tạo một hàm MỚI không có
-- REVOKE — tức là mở rộng quyền một cách im lặng.
--
-- Khác v1: không còn nhánh loại trừ theo `ket_luan`. Hàm áp ĐÚNG những bản sửa
-- có mặt trong dòng finding, và từ chối khi không có bản sửa nào. `ket_luan` chỉ
-- còn dùng để chặn hai nhánh không được phép ghi.

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

  -- Đề sai hoặc không đọc được câu: không có bản sửa nào hợp lệ. Chốt chặn này
  -- lặp lại ràng buộc của validator tầng ứng dụng một cách CỐ Ý — đây là chốt
  -- cuối ngay trước khi dữ liệu đổi.
  IF f.ket_luan IN ('de_sai', 'khong_kiem_duoc') THEN
    RAISE EXCEPTION 'NOTHING_TO_APPLY: %', f.ket_luan;
  END IF;

  -- Người duyệt bấm dựa trên con số họ NHÌN THẤY. Nếu giữa lúc nhìn và lúc bấm
  -- có thêm học sinh nộp bài, con số đó không còn là cái họ đã cân nhắc.
  v_attempts := public.question_audit_affected_attempts(f.question_id);
  IF v_attempts <> p_expected_attempts THEN
    RAISE EXCEPTION 'ATTEMPTS_CHANGED: thực tế % , người duyệt thấy %',
      v_attempts, p_expected_attempts;
  END IF;

  -- Chụp toàn bộ giá trị cũ TRƯỚC mọi lệnh ghi. Đây là đường lui duy nhất khi
  -- một bản sửa hoá ra sai.
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
      -- Nhiều dòng đáp án nghĩa là ngân hàng đang chấp nhận nhiều dạng viết.
      -- Ghi đè tất cả bằng một giá trị sẽ xoá mất các dạng còn lại.
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

    v_applied := v_applied || 'dap_an';
  END IF;

  -- --- Hai ô lời giải, mỗi ô ghi đúng cột của nó --------------------------
  IF f.de_xuat_explanation IS NOT NULL AND btrim(f.de_xuat_explanation) <> '' THEN
    UPDATE public.questions
       SET explanation = f.de_xuat_explanation, updated_at = now()
     WHERE id = f.question_id;
    v_applied := v_applied || 'explanation';
  END IF;

  IF f.de_xuat_solution IS NOT NULL AND btrim(f.de_xuat_solution) <> '' THEN
    UPDATE public.questions
       SET solution = f.de_xuat_solution, updated_at = now()
     WHERE id = f.question_id;
    v_applied := v_applied || 'solution';
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

COMMENT ON FUNCTION public.apply_question_audit_finding(uuid, uuid, integer) IS
  'Đường ghi DUY NHẤT của công cụ rà soát. Áp mọi bản sửa có trong finding — đáp '
  'án và/hoặc hai ô lời giải — trong MỘT transaction, sau khi kiểm lại số attempt '
  'bị ảnh hưởng. Từ chối khi ket_luan là de_sai/khong_kiem_duoc. Không chấm lại bài cũ.';

-- ---------------------------------------------------------------------------
-- PHẦN 4 — TỰ KIỂM TRONG TRANSACTION
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_thieu_cot integer;
  v_thua_quyen integer;
BEGIN
  SELECT COUNT(*) INTO v_thieu_cot
  FROM (VALUES
    ('loi_de'), ('mo_ta_dap_an'), ('mo_ta_loi_giai'),
    ('de_xuat_explanation'), ('de_xuat_solution')
  ) AS c(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_audit_findings'
      AND column_name = c.name
  );

  -- ALTER TABLE không cấp lại quyền, nhưng kiểm cho chắc: một lần chạy nhầm
  -- GRANT ở đâu đó cũng lộ ra ở đây.
  SELECT COUNT(*) INTO v_thua_quyen
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('question_audit_runs', 'question_audit_findings')
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF v_thieu_cot <> 0 OR v_thua_quyen <> 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL: thieu_cot=%, thua_quyen=%', v_thieu_cot, v_thua_quyen;
  END IF;

  RAISE NOTICE 'POSTFLIGHT OK: must_be_zero thieu_cot=%, thua_quyen=%', v_thieu_cot, v_thua_quyen;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- SAU MIGRATION
-- ---------------------------------------------------------------------------
-- Kết quả của những lượt quét CŨ không tự nâng cấp: chúng được sinh bằng hợp
-- đồng v1 nên không có mô tả lỗi theo từng phần. Quét lại chương đó để có dữ
-- liệu đầy đủ — lượt quét cũ vẫn đọc được, chỉ là thiếu ba cột mô tả.
