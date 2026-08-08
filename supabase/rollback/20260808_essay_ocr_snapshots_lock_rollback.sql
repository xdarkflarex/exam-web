-- 20260808_essay_ocr_snapshots_lock_rollback.sql
--
-- Hoàn nguyên `supabase/migrations/20260808_essay_ocr_snapshots_lock_append_only.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo`.
--
-- ĐỌC TRƯỚC KHI CHẠY — rollback này gần như luôn là quyết định sai.
--
-- Migration 20260808 chỉ **gỡ** UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER của
-- service_role trên một bảng nhật ký. Không call-site nào dùng năm quyền đó (đã
-- rà: route OCR chỉ `insert`, worker chỉ `select`), nên nó không thể làm hỏng
-- luồng nào đang chạy. Nếu có gì hỏng sau khi áp 20260808, nguyên nhân gần như
-- chắc chắn KHÔNG phải năm quyền này.
--
-- Chỉ có một triệu chứng khiến rollback là đúng: route `/api/essay-ai/ocr` báo
-- **permission denied khi INSERT**, tức migration đã siết mất cả `INSERT` —
-- nhưng trường hợp đó cổng tự kiểm trong 20260808 đã raise `SIET_QUA_TAY` và
-- transaction rollback, nên migration chưa từng commit và không có gì để hoàn
-- nguyên. Nói cách khác: nếu 20260808 commit thành công thì ACL đã đúng.
--
-- CÁI GIÁ CỦA ROLLBACK. Trả lại quyền sửa/xoá/truncate nhật ký chất lượng OCR
-- cho service_role — role của **mọi** route server. Nhật ký đó là bằng chứng
-- duy nhất cho biết một bài đã được AI chấm trên text do máy đọc với confidence
-- bao nhiêu. Sửa được sau khi ghi thì nó mất toàn bộ giá trị làm bằng chứng, và
-- lúc phụ huynh hỏi vì sao con bị điểm sai thì không còn gì để đối chiếu.
--
-- Nếu chạy vì một việc bảo trì cụ thể (ví dụ phải xoá tay một loạt dòng rác),
-- ĐỪNG dùng file này: chạy câu lệnh cần thiết bằng kết nối chủ sở hữu bảng
-- (Supabase SQL Editor) — chủ sở hữu không bị ACL chặn. Việc đó không cần và
-- không nên nới quyền của service_role.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.essay_ocr_snapshots') IS NULL THEN
    RAISE EXCEPTION 'KHONG_CO_BANG: public.essay_ocr_snapshots không tồn tại'
      USING DETAIL =
        'Không có gì để hoàn nguyên. Nếu bảng đã bị DROP thì rollback cần chạy là '
        || 'supabase/rollback/20260807_essay_ocr_snapshots_rollback.sql, không phải file này.';
  END IF;

  IF to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'KHONG_CO_ROLE: vai trò service_role không tồn tại';
  END IF;
END;
$$;

-- Trả lại đúng năm quyền mà 20260808 đã gỡ, không nhiều hơn.
--
-- Cố ý KHÔNG dùng `GRANT ALL`: `ALL` sẽ theo định nghĩa của phiên bản Postgres
-- đang chạy và có thể gồm quyền mà 20260807 chưa từng cấp — rollback phải quay
-- về đúng trạng thái trước đó, không phải một trạng thái rộng hơn.
GRANT UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.essay_ocr_snapshots
  TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- Xác minh sau rollback — kỳ vọng must_be_zero = 0
-- ---------------------------------------------------------------------------

SELECT 'con_thieu_quyen_da_tra_lai' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (
  SELECT 1
  FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Rollback không được chạm SELECT/INSERT.
SELECT 'mat_quyen_doc_ghi', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['SELECT', 'INSERT']) AS p(priv)
  WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- Rollback KHÔNG được nới quyền cho client. Đây là lỗ hổng thật sự nghiêm trọng
-- của bảng này (học sinh đọc được là biết bài mình có bị gắn cờ hay không), và
-- nó không liên quan gì tới việc hoàn nguyên 20260808.
SELECT 'ro_ri_cho_client', COUNT(*)::bigint
FROM (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated']) AS r(role_name)
  CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
  WHERE has_table_privilege(r.role_name, 'public.essay_ocr_snapshots', p.priv)
) t

UNION ALL
-- RLS phải vẫn BẬT và FORCE. Rollback này không chạm RLS.
SELECT 'rls_bi_thay_doi', COUNT(*)::bigint
FROM pg_class c
WHERE c.oid = 'public.essay_ocr_snapshots'::regclass
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)

ORDER BY check_name;
