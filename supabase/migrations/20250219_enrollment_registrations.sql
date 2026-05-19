-- =============================================
-- ENROLLMENT REGISTRATIONS TABLE
-- Form đăng ký học trên landing page
-- =============================================

CREATE TABLE IF NOT EXISTS enrollment_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  class TEXT NOT NULL CHECK (class IN ('Toán 10', 'Toán 11', 'Toán 12', 'Tin học')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'enrolled', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_enrollment_registrations_status ON enrollment_registrations(status);
CREATE INDEX IF NOT EXISTS idx_enrollment_registrations_created_at ON enrollment_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrollment_registrations_email ON enrollment_registrations(email);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_enrollment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enrollment_updated_at
  BEFORE UPDATE ON enrollment_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_enrollment_updated_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE enrollment_registrations ENABLE ROW LEVEL SECURITY;

-- Public: bất kỳ ai cũng có thể submit form (anon key)
-- Đây là form đăng ký học offline, KHÔNG tạo tài khoản hệ thống
CREATE POLICY "Allow public insert enrollment"
  ON enrollment_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Admin: đọc tất cả đơn đăng ký (user đã đăng nhập = admin vì chỉ admin mới có session)
CREATE POLICY "Admin read all enrollments"
  ON enrollment_registrations
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- Admin: cập nhật trạng thái đơn đăng ký
CREATE POLICY "Admin update enrollments"
  ON enrollment_registrations
  FOR UPDATE
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Admin: xoá đơn đăng ký
CREATE POLICY "Admin delete enrollments"
  ON enrollment_registrations
  FOR DELETE
  TO authenticated
  USING (auth.role() = 'authenticated');

-- =============================================
-- SEED: Add enrollment_form section config to site_settings
-- =============================================

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'landing.enrollment_form_section',
  '{"title": "Đăng ký học ngay hôm nay", "subtitle": "Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ"}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- V2: Thêm cột phụ huynh + ghi chú
-- =============================================

ALTER TABLE enrollment_registrations
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS user_notes TEXT;

-- =============================================
-- RPC Function: bypass RLS cho public insert
-- =============================================

CREATE OR REPLACE FUNCTION public.submit_enrollment(
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_class TEXT,
  p_parent_name TEXT DEFAULT NULL,
  p_parent_phone TEXT DEFAULT NULL,
  p_user_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO enrollment_registrations (full_name, email, phone, class, status, parent_name, parent_phone, user_notes)
  VALUES (p_full_name, p_email, p_phone, p_class, 'new', p_parent_name, p_parent_phone, p_user_notes)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_enrollment TO anon, authenticated;
