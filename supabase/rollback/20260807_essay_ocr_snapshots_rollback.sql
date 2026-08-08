-- 20260807_essay_ocr_snapshots_rollback.sql
--
-- Hoàn nguyên `supabase/migrations/20260807_essay_ocr_snapshots.sql`.
--
-- CÁCH CHẠY: chạy được trong Supabase SQL Editor, psql, hay client SQL nào cũng
-- được — không dùng meta-command `\echo` của psql.
--
-- ĐƠN GIẢN VÌ MIGRATION CHỈ TẠO MỚI. Không hàm nào bị `CREATE OR REPLACE`,
-- không bảng nào bị sửa, không dữ liệu nào bị backfill. Bỏ bảng là xong.
--
-- MẤT MÁT: toàn bộ lịch sử chất lượng OCR. Không phục hồi được và không suy lại
-- được từ đâu — `student_answers` chỉ giữ text cuối cùng, không giữ text đó do
-- máy đọc hay người gõ. Nếu đã chạy benchmark dựa trên bảng này thì xuất kết quả
-- ra ngoài trước (mục 0).
--
-- CẢNH BÁO PHỐI HỢP SOURCE. Sau rollback, `worker.ts` và route OCR vẫn cố đọc
-- ghi bảng đã bị xoá:
--   - Route OCR sẽ lỗi khi INSERT → học sinh không dùng được chức năng chụp ảnh.
--   - Worker sẽ coi mọi bài là "mất dấu vết OCR" và chặn auto-chốt — fail-closed,
--     đúng hướng an toàn, nhưng nghĩa là auto-chốt ngừng hoạt động hoàn toàn.
-- Vì vậy rollback SQL phải đi kèm hoàn nguyên source (git revert đợt 20260807).

SELECT '=== 0. Lưu ra ngoài trước khi xoá ===' AS muc;

-- Tổng quan dữ liệu sắp mất. Copy kết quả ra ngoài nếu còn cần cho benchmark.
SELECT
  COUNT(*)::bigint AS tong_dong,
  COUNT(DISTINCT attempt_id)::bigint AS so_attempt,
  MIN(created_at) AS som_nhat,
  MAX(created_at) AS muon_nhat,
  round(AVG(confidence), 4) AS confidence_trung_binh,
  COUNT(*) FILTER (WHERE confidence < 0.9)::bigint AS so_dong_duoi_nguong,
  COUNT(*) FILTER (WHERE 'math_unreadable' = ANY(warning_kinds))::bigint AS so_dong_toan_khong_doc_duoc
FROM public.essay_ocr_snapshots;

BEGIN;

-- DROP TABLE gỡ luôn index, CHECK constraint, FK, COMMENT và mọi GRANT của
-- bảng — không cần câu lệnh riêng cho từng thứ.
DROP TABLE IF EXISTS public.essay_ocr_snapshots;

COMMIT;

-- ---------------------------------------------------------------------------
-- Xác minh sau rollback — kỳ vọng must_be_zero = 0
-- ---------------------------------------------------------------------------

SELECT 'con_bang' AS check_name, COUNT(*)::bigint AS must_be_zero
FROM (SELECT 1 WHERE to_regclass('public.essay_ocr_snapshots') IS NOT NULL) t

UNION ALL
-- Rollback không được chạm bảng nào khác. Hai bảng được FK tham chiếu phải còn
-- nguyên; mất chúng nghĩa là ai đó chạy DROP ... CASCADE nhầm chỗ.
SELECT 'mat_bang_lien_quan', COUNT(*)::bigint
FROM (
  SELECT 1 WHERE to_regclass('public.exam_attempts') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regclass('public.questions') IS NULL
  UNION ALL
  SELECT 1 WHERE to_regclass('public.essay_ai_usage') IS NULL
) t

ORDER BY check_name;
