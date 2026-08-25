import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * POST /api/admin/create-account
 *
 * Tạo tài khoản học sinh theo hai đường:
 *  1. Duyệt đơn:  BODY { enrollmentId }        → đọc `enrollment_registrations`.
 *  2. Nhập tay:   BODY { manual: {...fields} } → admin tự gõ đúng các trường như
 *                  form đăng ký công khai (`/api/enrollments`), tạo luôn tài khoản
 *                  và ghi một dòng đơn `enrolled` để danh sách đăng ký vẫn đủ.
 *
 * BẢO MẬT (như nhau cho cả hai đường):
 * - Chỉ admin (role='admin') mới được gọi (kiểm tra qua session cookie).
 * - Dùng service_role để tạo auth user + bỏ qua xác minh email.
 * - Sinh mật khẩu tạm ngẫu nhiên, đặt must_change_password=true.
 *
 * RETURN: { success, email, tempPassword, fullName, manual }
 */

// Giữ đồng bộ với `/api/enrollments` và CHECK constraint của
// `enrollment_registrations.class`. Đổi ở một nơi thì phải đổi cả hai.
const ALLOWED_CLASSES = ['Toán 10', 'Toán 11', 'Toán 12', 'Tin học'] as const
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[0-9]{9,11}$/

/** Dữ liệu một học sinh, chuẩn hoá sẵn — nguồn từ đơn có sẵn hoặc do admin gõ. */
interface EnrollmentData {
  full_name: string
  email: string
  phone: string | null
  class: string | null
  parent_name: string | null
  parent_phone: string | null
  user_notes: string | null
}

function genTempPassword(): string {
  // 4 chữ + 4 số + 1 ký tự đặc biệt → đảm bảo độ phức tạp.
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const pwd =
    pick(upper) + pick(upper) +
    pick(lower) + pick(lower) + pick(lower) +
    pick(digits) + pick(digits) + pick(digits) + '@'
  // xáo trộn
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * Kiểm tra & chuẩn hoá payload nhập tay. Trả về lỗi (chuỗi) khi không hợp lệ,
 * hoặc dữ liệu đã chuẩn hoá khi hợp lệ. Quy tắc bám sát `/api/enrollments` để
 * đường nhập tay không lỏng hơn form công khai.
 */
function validateManual(
  raw: unknown
): { error: string } | { data: EnrollmentData } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Thiếu thông tin học sinh.' }
  }
  const m = raw as Record<string, unknown>

  const fullName = typeof m.full_name === 'string' ? m.full_name.trim() : ''
  if (fullName.length < 2) {
    return { error: 'Vui lòng nhập tên đầy đủ (tối thiểu 2 ký tự).' }
  }

  const email = typeof m.email === 'string' ? m.email.trim().toLowerCase() : ''
  if (!EMAIL_REGEX.test(email)) {
    return { error: 'Vui lòng nhập email hợp lệ.' }
  }

  const phone = typeof m.phone === 'string' ? m.phone.trim().replace(/\s/g, '') : ''
  if (!PHONE_REGEX.test(phone)) {
    return { error: 'Vui lòng nhập số điện thoại hợp lệ (9–11 chữ số).' }
  }

  const studentClass = typeof m.class === 'string' ? m.class : ''
  if (!ALLOWED_CLASSES.includes(studentClass as (typeof ALLOWED_CLASSES)[number])) {
    return { error: 'Vui lòng chọn lớp học.' }
  }

  let parentPhone: string | null = null
  if (typeof m.parent_phone === 'string' && m.parent_phone.trim()) {
    parentPhone = m.parent_phone.trim().replace(/\s/g, '')
    if (!PHONE_REGEX.test(parentPhone)) {
      return { error: 'Số điện thoại phụ huynh không hợp lệ (9–11 chữ số).' }
    }
  }

  const parentName =
    typeof m.parent_name === 'string' && m.parent_name.trim() ? m.parent_name.trim() : null
  const userNotes =
    typeof m.user_notes === 'string' && m.user_notes.trim() ? m.user_notes.trim() : null

  return {
    data: {
      full_name: fullName,
      email,
      phone,
      class: studentClass,
      parent_name: parentName,
      parent_phone: parentPhone,
      user_notes: userNotes,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, { status: 400 })
    }

    const { enrollmentId, manual } = body ?? {}
    const isManual = manual !== undefined && manual !== null

    // ============================================
    // XÁC THỰC ADMIN qua session cookie
    // (làm trước mọi thao tác ghi để non-admin không tạo được đơn/tài khoản)
    // ============================================
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
          remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }) },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' }, { status: 401 })
    }
    const { data: adminProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (adminProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền.', code: 'FORBIDDEN' }, { status: 403 })
    }

    // ============================================
    // SERVICE ROLE CLIENT
    // ============================================
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ============================================
    // NGUỒN DỮ LIỆU HỌC SINH: đơn có sẵn HOẶC admin gõ tay
    // ============================================
    let enrollment: EnrollmentData
    if (isManual) {
      const result = validateManual(manual)
      if ('error' in result) {
        return NextResponse.json({ error: result.error, code: 'INVALID_MANUAL' }, { status: 400 })
      }
      enrollment = result.data
    } else {
      if (!enrollmentId || typeof enrollmentId !== 'string') {
        return NextResponse.json({ error: 'Thiếu enrollmentId.', code: 'MISSING_ID' }, { status: 400 })
      }
      const { data: row, error: enrollErr } = await admin
        .from('enrollment_registrations')
        .select('*')
        .eq('id', enrollmentId)
        .single()

      if (enrollErr || !row) {
        return NextResponse.json({ error: 'Không tìm thấy đơn đăng ký.', code: 'ENROLLMENT_NOT_FOUND' }, { status: 404 })
      }
      if (row.created_account_id) {
        return NextResponse.json({ error: 'Đơn này đã được tạo tài khoản.', code: 'ALREADY_CREATED' }, { status: 409 })
      }
      enrollment = row
    }

    const normalizedEmail = (enrollment.email || '').toLowerCase().trim()
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Email trong đơn không hợp lệ.', code: 'INVALID_EMAIL' }, { status: 400 })
    }

    // Kiểm tra email đã tồn tại trong profiles
    const { data: existing } = await admin
      .from('profiles').select('id').eq('email', normalizedEmail).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Email này đã có tài khoản.', code: 'EMAIL_EXISTS' }, { status: 409 })
    }

    // ============================================
    // TẠO AUTH USER (email đã xác nhận sẵn)
    // ============================================
    const tempPassword = genTempPassword()
    const fullName = (enrollment.full_name || '').trim()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createErr || !created.user) {
      console.error('admin.createUser error:', createErr?.message)
      const msg = (createErr?.message || '').toLowerCase()
      if (msg.includes('already')) {
        return NextResponse.json({ error: 'Email này đã được đăng ký.', code: 'AUTH_EMAIL_EXISTS' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Không thể tạo tài khoản xác thực.', code: 'AUTH_ERROR' }, { status: 500 })
    }

    const newUserId = created.user.id
    const nowIso = new Date().toISOString()

    // Đường nhập tay không có đơn sẵn nên `source_enrollment_id` để trống — dòng
    // đơn `enrolled` ghi bên dưới trỏ ngược về tài khoản là đủ để truy vết.
    const baseProfile: Record<string, unknown> = {
      id: newUserId,
      email: normalizedEmail,
      role: 'student',
      full_name: fullName,
      created_at: nowIso,
      updated_at: nowIso,
    }

    // Các cột mở rộng (chỉ có khi migration đã chạy). Nếu schema chưa có thì fallback.
    const extendedProfile: Record<string, unknown> = {
      ...baseProfile,
      access_tier: 'full', // HS được admin duyệt → full access
      must_change_password: true,
      source_enrollment_id: isManual ? null : enrollmentId,
    }

    let { error: profileErr } = await admin.from('profiles').insert(extendedProfile)

    // Fallback nếu cột mở rộng chưa tồn tại trong schema cache.
    if (profileErr) {
      const msg = (profileErr.message || '').toLowerCase()
      const isMissingColumn =
        msg.includes('must_change_password') ||
        msg.includes('access_tier') ||
        msg.includes('source_enrollment_id') ||
        msg.includes('schema cache') ||
        msg.includes('column')
      if (isMissingColumn) {
        console.warn('create-account: cột mở rộng chưa có, fallback insert profile cơ bản.')
        const retry = await admin.from('profiles').insert(baseProfile)
        profileErr = retry.error
      }
    }

    if (profileErr) {
      // rollback auth user để tránh orphan
      await admin.auth.admin.deleteUser(newUserId)
      console.error('profile insert error:', profileErr.message)
      return NextResponse.json({ error: 'Tạo hồ sơ thất bại.', code: 'PROFILE_FAILED' }, { status: 500 })
    }

    // ============================================
    // GHI/GẮN ĐƠN ĐĂNG KÝ
    // ============================================
    if (isManual) {
      // Tạo một dòng đơn `enrolled` gắn sẵn tài khoản để trang Đơn đăng ký vẫn
      // thấy học sinh này. Best-effort: tài khoản đã tạo xong nên dù ghi đơn hỏng
      // vẫn trả về thành công, chỉ log lại.
      const { error: insertErr } = await admin.from('enrollment_registrations').insert({
        full_name: fullName,
        email: normalizedEmail,
        phone: enrollment.phone,
        class: enrollment.class,
        status: 'enrolled',
        parent_name: enrollment.parent_name,
        parent_phone: enrollment.parent_phone,
        user_notes: enrollment.user_notes,
        created_account_id: newUserId,
        account_created_at: nowIso,
      })
      if (insertErr) {
        console.warn('create-account (manual): ghi đơn đăng ký thất bại:', insertErr.message)
      }
    } else {
      await admin.from('enrollment_registrations').update({
        created_account_id: newUserId,
        account_created_at: nowIso,
        status: 'enrolled',
      }).eq('id', enrollmentId)
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      tempPassword,
      fullName,
      manual: isManual,
    })
  } catch (error) {
    console.error('create-account unexpected error:', error)
    return NextResponse.json({ error: 'Lỗi máy chủ.', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
