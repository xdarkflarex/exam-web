import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * POST /api/admin/create-account
 *
 * Duyệt một đơn đăng ký (enrollment_registrations) → tạo tài khoản học sinh.
 *
 * BẢO MẬT:
 * - Chỉ admin (role='admin') mới được gọi (kiểm tra qua session cookie).
 * - Dùng service_role để tạo auth user + bỏ qua xác minh email.
 * - Sinh mật khẩu tạm ngẫu nhiên, đặt must_change_password=true.
 *
 * BODY: { enrollmentId: string }
 * RETURN: { success, email, tempPassword }
 */

function genTempPassword(): string {
  // 4 chữ + 4 số + 1 ký tự đặc biệt → đảm bảo độ phức tạp.
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  let pwd =
    pick(upper) + pick(upper) +
    pick(lower) + pick(lower) + pick(lower) +
    pick(digits) + pick(digits) + pick(digits) + '@'
  // xáo trộn
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

export async function POST(request: NextRequest) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, { status: 400 })
    }

    const { enrollmentId } = body
    if (!enrollmentId || typeof enrollmentId !== 'string') {
      return NextResponse.json({ error: 'Thiếu enrollmentId.', code: 'MISSING_ID' }, { status: 400 })
    }

    // ============================================
    // XÁC THỰC ADMIN qua session cookie
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

    // Lấy đơn đăng ký
    const { data: enrollment, error: enrollErr } = await admin
      .from('enrollment_registrations')
      .select('*')
      .eq('id', enrollmentId)
      .single()

    if (enrollErr || !enrollment) {
      return NextResponse.json({ error: 'Không tìm thấy đơn đăng ký.', code: 'ENROLLMENT_NOT_FOUND' }, { status: 404 })
    }

    if (enrollment.created_account_id) {
      return NextResponse.json({ error: 'Đơn này đã được tạo tài khoản.', code: 'ALREADY_CREATED' }, { status: 409 })
    }

    const normalizedEmail = (enrollment.email || '').toLowerCase().trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
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

    // Map lớp đăng ký ('Toán 12'...) → grade để gợi ý (không bắt buộc).
    const baseProfile: Record<string, unknown> = {
      id: newUserId,
      email: normalizedEmail,
      role: 'student',
      full_name: fullName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Các cột mở rộng (chỉ có khi migration đã chạy). Nếu schema chưa có thì fallback.
    const extendedProfile: Record<string, unknown> = {
      ...baseProfile,
      access_tier: 'full', // HS được duyệt từ đơn → full access
      must_change_password: true,
      source_enrollment_id: enrollmentId,
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

    // Cập nhật đơn đăng ký
    await admin.from('enrollment_registrations').update({
      created_account_id: newUserId,
      account_created_at: new Date().toISOString(),
      status: 'enrolled',
    }).eq('id', enrollmentId)

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      tempPassword,
      fullName,
    })
  } catch (error) {
    console.error('create-account unexpected error:', error)
    return NextResponse.json({ error: 'Lỗi máy chủ.', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
