import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getDefaultRedirectPath, type UserRole } from '@/lib/auth/roles'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

type ApiResponse = {
  success?: boolean
  error?: string
  code: string
  redirectTo?: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'student' || value === 'teacher' || value === 'admin'
}

function validatePassword(newPassword: unknown, confirmPassword: unknown): string | null {
  if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
    return 'Mật khẩu mới và mật khẩu xác nhận là bắt buộc.'
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.`
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return 'Mật khẩu cần ít nhất 1 chữ hoa, 1 chữ thường và 1 số.'
  }
  if (newPassword !== confirmPassword) {
    return 'Mật khẩu xác nhận không khớp.'
  }
  return null
}

/**
 * POST /api/auth/change-password
 *
 * Changes the password for the authenticated cookie user, then clears the
 * forced-password flag with the server-only service role. The profile flag is
 * never accepted from the client and remains true if either operation fails.
 */
export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    return json({ error: 'Yêu cầu không hợp lệ.', code: 'CROSS_SITE_REQUEST' }, 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ. Vui lòng thử lại.', code: 'INVALID_JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Dữ liệu không hợp lệ. Vui lòng thử lại.', code: 'INVALID_BODY' }, 400)
  }

  const { newPassword, confirmPassword } = body as Record<string, unknown>
  const validationError = validatePassword(newPassword, confirmPassword)
  if (validationError) {
    return json({ error: validationError, code: 'INVALID_PASSWORD' }, 400)
  }
  const password = newPassword as string

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(
      { error: 'Hệ thống chưa sẵn sàng để đổi mật khẩu. Vui lòng liên hệ quản trị viên.', code: 'SERVER_CONFIG_ERROR' },
      503
    )
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', code: 'UNAUTHENTICATED' }, 401)
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the exact authenticated profile and all data needed for the final
    // response before changing Auth, reducing partial-completion failure modes.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, must_change_password')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile || profile.id !== user.id || !isUserRole(profile.role)) {
      return json(
        { error: 'Không thể xác minh hồ sơ tài khoản. Vui lòng liên hệ quản trị viên.', code: 'PROFILE_VERIFICATION_FAILED' },
        500
      )
    }

    if (profile.must_change_password !== true) {
      return json({ error: 'Tài khoản này không còn yêu cầu đổi mật khẩu.', code: 'PASSWORD_CHANGE_NOT_REQUIRED' }, 409)
    }

    const { data: updatedAuth, error: passwordError } = await supabase.auth.updateUser({
      password,
    })

    if (passwordError || updatedAuth.user?.id !== user.id) {
      const status = passwordError?.status === 429 ? 429 : 400
      const message = status === 429
        ? 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.'
        : 'Không thể đổi mật khẩu. Vui lòng chọn mật khẩu khác và thử lại.'
      return json({ error: message, code: 'PASSWORD_UPDATE_FAILED' }, status)
    }

    const { data: updatedProfile, error: clearFlagError } = await admin
    .from('profiles')
    .update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
      .eq('id', user.id)
      .eq('must_change_password', true)
      .select('id, must_change_password')
      .maybeSingle()

    if (
      clearFlagError ||
      !updatedProfile ||
      updatedProfile.id !== user.id ||
      updatedProfile.must_change_password !== false
    ) {
      return json(
        {
          error: 'Chưa thể hoàn tất cập nhật bảo mật. Vui lòng đặt một mật khẩu mới khác và thử lại.',
          code: 'PROFILE_FLAG_UPDATE_FAILED',
        },
        500
      )
    }

    return json({
      success: true,
      code: 'PASSWORD_CHANGED',
      redirectTo: getDefaultRedirectPath(profile.role),
    })
  } catch {
    return json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.', code: 'INTERNAL_ERROR' }, 500)
  }
}
