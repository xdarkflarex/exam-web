-- ==============================================
-- DUYỆT ĐƠN → TẠO TÀI KHOẢN (Phần 1)
-- Chạy trên Supabase SQL Editor.
-- ==============================================

-- 1. Liên kết đơn đăng ký với tài khoản đã tạo
ALTER TABLE enrollment_registrations
  ADD COLUMN IF NOT EXISTS created_account_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollment_account
  ON enrollment_registrations(created_account_id);

-- 2. Bắt buộc đổi mật khẩu + truy vết nguồn đơn trên profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_enrollment_id UUID;
