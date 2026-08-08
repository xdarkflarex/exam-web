-- 20260808_essay_ocr_snapshots_lock_append_only.sql
--
-- Thực thi thật tính append-only của `public.essay_ocr_snapshots`, thứ mà
-- `20260807` chỉ *tuyên bố* bằng comment.
--
-- VÌ SAO CẦN MIGRATION NÀY — postflight 20260807 báo
-- `service_role_thua_quyen_sua = 2` trên Primary Database.
--
-- `20260807` khoá quyền như sau:
--
--   REVOKE ALL ON TABLE public.essay_ocr_snapshots FROM PUBLIC, anon, authenticated;
--   GRANT SELECT, INSERT ON TABLE public.essay_ocr_snapshots TO service_role;
--   -- comment: "Cố ý KHÔNG grant UPDATE/DELETE cho service_role"
--
-- Sai lầm nằm ở chữ "không grant". Project Supabase mặc định có
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
--
-- nên MỌI bảng mới trong schema `public` sinh ra đã có sẵn ALL cho bốn role đó.
-- "Không grant" không đồng nghĩa "không có quyền" — quyền đã có từ trước khi
-- câu GRANT chạy. Câu `REVOKE` của 20260807 gỡ được anon/authenticated (vì thế
-- `quyen_ro_ri_cho_client` = 0, đúng), nhưng **không liệt kê service_role**, nên
-- service_role giữ nguyên ALL và câu `GRANT SELECT, INSERT` chỉ là no-op.
--
-- Hệ quả: `ALL` gồm UPDATE, DELETE **và TRUNCATE**. Nhật ký chất lượng OCR —
-- toàn bộ giá trị làm bằng chứng của bảng, thứ dùng để chứng minh một bài đã
-- được chấm trên text do máy đọc với confidence bao nhiêu — hiện có thể bị sửa
-- hoặc xoá sạch bởi bất cứ route server nào, vì service_role là role của mọi
-- route server. Không có gì cản.
--
-- KHÔNG PHẢI SỰ CỐ ĐANG DIỄN RA. Đã rà toàn bộ call-site: chỉ
-- `POST /api/essay-ai/ocr` (`.insert()`) và `worker.ts` (`.select()`) chạm bảng
-- này. Không có UPDATE/DELETE/TRUNCATE nào đang chạy, nên chưa có dòng nào bị
-- sửa. Migration này đóng đường, không dọn thiệt hại.
--
-- VÌ SAO KHÔNG SỬA THẲNG 20260807. `AGENTS.md` mục 2: không sửa migration đã có
-- thể đã chạy. 20260807 **đã chạy** trên Primary Database (bằng chứng: chính
-- postflight của nó trả về số liệu). File mới, có thứ tự, có rollback.
--
-- PHẠM VI. Chỉ đổi ACL của một bảng. Không DDL, không dữ liệu, không hàm. Chạy
-- lại nhiều lần vô hại (`REVOKE` quyền không có là no-op).
--
-- PREFLIGHT:  supabase/preflight/20260808_essay_ocr_snapshots_lock_preflight.sql
-- POSTFLIGHT: supabase/preflight/20260808_essay_ocr_snapshots_lock_postflight.sql
-- ROLLBACK:   supabase/rollback/20260808_essay_ocr_snapshots_lock_rollback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cổng chặn
-- ---------------------------------------------------------------------------
--
-- Migration này chỉ có nghĩa khi bảng đã tồn tại. Chạy `REVOKE` trên bảng chưa
-- có thì Postgres raise một lỗi "relation does not exist" không nói được rằng
-- nguyên nhân là chạy sai thứ tự.
DO $$
BEGIN
  IF to_regclass('public.essay_ocr_snapshots') IS NULL THEN
    RAISE EXCEPTION 'CHAY_SAI_THU_TU: chưa áp 20260807_essay_ocr_snapshots.sql'
      USING DETAIL =
        'Bảng public.essay_ocr_snapshots không tồn tại. Migration này chỉ siết '
        || 'quyền của bảng do 20260807 tạo ra; áp 20260807 trước.';
  END IF;

  -- `REVOKE ... FROM service_role` raise nếu role không tồn tại, và
  -- `has_table_privilege('service_role', ...)` ở cổng tự kiểm cũng vậy. Kiểm
  -- trước bằng `to_regrole` (trả NULL thay vì raise) để lỗi nói được nguyên nhân
  -- thật, không phải "role does not exist" giữa một migration về quyền.
  IF to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'KHONG_CO_ROLE: vai trò service_role không tồn tại'
      USING DETAIL =
        'Đang chạy trên database không phải Supabase, hoặc role đã bị đổi tên. '
        || 'Migration này giả định bộ role chuẩn của Supabase (anon, '
        || 'authenticated, service_role).';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Siết quyền service_role về đúng append-only
-- ---------------------------------------------------------------------------
--
-- Liệt kê tường minh từng quyền thay vì `REVOKE ALL` rồi `GRANT` lại: cách này
-- không có khoảnh khắc nào service_role mất SELECT/INSERT, nên một route OCR
-- chạy đồng thời với migration không bị permission denied. (Trong một
-- transaction thì ACL chỉ hiện ra lúc COMMIT, nhưng viết tường minh vẫn đúng
-- hơn về ý định: câu lệnh nói chính xác cái gì bị gỡ.)
--
-- TRUNCATE nằm trong danh sách vì nó xoá sạch bảng mà KHÔNG cần quyền DELETE —
-- gỡ UPDATE/DELETE mà bỏ TRUNCATE thì nhật ký vẫn xoá được bằng một câu lệnh.
-- REFERENCES và TRIGGER cũng gỡ: chúng cho phép tạo FK và trigger trỏ vào bảng,
-- tức là gắn thêm hành vi lên một bảng chỉ-ghi-thêm.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.essay_ocr_snapshots
  FROM service_role;

-- Lặp lại GRANT của 20260807 cho đủ ý định. No-op nếu quyền đã có; cần thiết
-- nếu ai đó từng chạy `REVOKE ALL ... FROM service_role` bằng tay.
GRANT SELECT, INSERT ON TABLE public.essay_ocr_snapshots TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Siết cùng cách cho anon/authenticated
-- ---------------------------------------------------------------------------
--
-- 20260807 đã `REVOKE ALL` khỏi hai role này và postflight xác nhận sạch. Câu
-- dưới đây là no-op ở trạng thái hiện tại — giữ lại để migration tự đủ nghĩa:
-- ai đọc file này thấy được trạng thái cuối mong muốn của toàn bộ ACL, không
-- phải ghép từ hai file.
REVOKE ALL ON TABLE public.essay_ocr_snapshots FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tự kiểm trong transaction — sai thì rollback, không commit nửa vời
-- ---------------------------------------------------------------------------
--
-- Postflight chạy sau khi COMMIT nên nếu nó phát hiện lỗi thì lỗi đã live. Cổng
-- này raise **trước** COMMIT: hoặc ACL đúng hoàn toàn, hoặc không có gì đổi.
DO $$
DECLARE
  con_thua text[];
  thieu    text[];
BEGIN
  SELECT array_agg(p.priv ORDER BY p.priv) INTO con_thua
  FROM unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p(priv)
  WHERE has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv);

  IF con_thua IS NOT NULL THEN
    RAISE EXCEPTION 'REVOKE_KHONG_AN: service_role vẫn còn %', array_to_string(con_thua, ', ')
      USING DETAIL =
        'Quyền có thể đến từ một GRANT trực tiếp khác, từ vai trò mà service_role '
        || 'là member (kiểm pg_auth_members), hoặc service_role là chủ sở hữu bảng '
        || '(chủ sở hữu luôn có đủ quyền, REVOKE không gỡ được). Kiểm: '
        || 'SELECT relowner::regrole, relacl FROM pg_class '
        || 'WHERE oid = ''public.essay_ocr_snapshots''::regclass;';
  END IF;

  SELECT array_agg(p.priv ORDER BY p.priv) INTO thieu
  FROM unnest(ARRAY['SELECT', 'INSERT']) AS p(priv)
  WHERE NOT has_table_privilege('service_role', 'public.essay_ocr_snapshots', p.priv);

  IF thieu IS NOT NULL THEN
    RAISE EXCEPTION 'SIET_QUA_TAY: service_role thiếu %', array_to_string(thieu, ', ')
      USING DETAIL =
        'Route /api/essay-ai/ocr sẽ không ghi được snapshot và worker sẽ coi mọi '
        || 'bài có ảnh là mất dấu vết → chặn auto-chốt toàn bộ. Rollback ngay.';
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- CHƯA XONG VIỆC — cái bẫy này rộng hơn một bảng
-- ---------------------------------------------------------------------------
--
-- `ALTER DEFAULT PRIVILEGES` là cấu hình **cấp schema**, không phải của bảng
-- nào. Mọi bảng tạo trong `public` từ nay về sau vẫn sinh ra với ALL cho bốn
-- role mặc định, và migration tiếp theo viết "cố ý không grant UPDATE" sẽ mắc
-- đúng lỗi này lần nữa.
--
-- Migration này KHÔNG chạm default privileges cấp project — làm vậy là đổi hành
-- vi của mọi bảng tương lai, vượt phạm vi một bản sửa và cần chủ dự án quyết.
-- Việc còn lại:
--
--   1. Chạy `supabase/preflight/20260808_default_privileges_audit.sql` để biết
--      còn bảng nào có ACL rộng hơn ý định vì cùng nguyên nhân.
--   2. Quy ước cho migration sau: bảng chỉ-service_role phải viết
--      `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role;`
--      **trước** khi `GRANT` đúng tập quyền cần. Không dựa vào việc "không viết
--      GRANT" để suy ra "không có quyền".
