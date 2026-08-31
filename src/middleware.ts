import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, isStudent, getDefaultRedirectPath } from '@/lib/auth/roles'

// ============================================
// Session Timeout Constants (duplicated for middleware - cannot import from lib)
// ============================================
const IDLE_TIMEOUT = {
  admin: 15 * 60 * 1000,    // 15 minutes
  student: 30 * 60 * 1000,  // 30 minutes
} as const

const ABSOLUTE_SESSION_TIMEOUT = {
  admin: 6 * 60 * 60 * 1000, // 6 hours
} as const

const SESSION_COOKIE_KEYS = {
  LAST_ACTIVE_AT: 'session_last_active_at',
  SESSION_START_AT: 'session_start_at',
} as const

// Admin 2FA cookie name
const ADMIN_2FA_COOKIE = 'admin_2fa_verified'

// Dòng site_settings chứa cấu hình khu quản trị.
const ADMIN_SETTINGS_KEY = 'admin.settings'

/**
 * Hết hạn phiên của admin có đang bật không.
 *
 * Bản sao của `isAdminSessionTimeoutEnabled` trong `src/lib/session/utils.ts`
 * — middleware trong repo này cố ý không import từ `lib` (xem khối hằng số
 * phía trên, cùng lý do). **Sửa một bên thì phải sửa bên kia.** Bản trong `lib`
 * là bản có test.
 *
 * FAIL-SAFE: CHỈ `false` tường minh mới tắt. Thiếu trường, `null`, chuỗi
 * `"false"`, hay không đọc được cấu hình — tất cả đều giữ BẬT.
 */
function isAdminSessionTimeoutEnabled(settingsValue: unknown): boolean {
  if (!settingsValue || typeof settingsValue !== 'object' || Array.isArray(settingsValue)) {
    return true
  }
  return (settingsValue as Record<string, unknown>).adminSessionTimeout !== false
}

/**
 * Check if the current route is an exam-in-progress route.
 * Exam routes should NEVER be interrupted by idle timeout.
 * Pattern: /student/exam/* or /student/exam/[examId]/*
 */
function isExamRoute(pathname: string): boolean {
  return pathname.startsWith('/student/exam')
}

/**
 * Check if session timeout exceeded based on cookies
 */
function isSessionExpired(
  request: NextRequest,
  role: 'admin' | 'student'
): { expired: boolean; reason: 'idle' | 'absolute' | null } {
  const lastActiveAt = request.cookies.get(SESSION_COOKIE_KEYS.LAST_ACTIVE_AT)?.value
  const sessionStartAt = request.cookies.get(SESSION_COOKIE_KEYS.SESSION_START_AT)?.value
  
  const now = Date.now()
  
  // Check absolute session timeout (admin only)
  if (role === 'admin' && sessionStartAt) {
    const elapsed = now - parseInt(sessionStartAt, 10)
    if (elapsed > ABSOLUTE_SESSION_TIMEOUT.admin) {
      return { expired: true, reason: 'absolute' }
    }
  }
  
  // Check idle timeout
  if (lastActiveAt) {
    const elapsed = now - parseInt(lastActiveAt, 10)
    const timeout = IDLE_TIMEOUT[role]
    if (elapsed > timeout) {
      return { expired: true, reason: 'idle' }
    }
  }
  
  return { expired: false, reason: null }
}


export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // ============================================
  // PUBLIC ROUTES - Allow without authentication
  // ============================================
  // IMPORTANT: "/" (root/landing page) is PUBLIC and should NEVER redirect to login
  const publicRoutes = ['/', '/login', '/signup', '/auth/callback']
  const isPublicRoute = publicRoutes.some(route => 
    route === '/' ? pathname === '/' : pathname.startsWith(route)
  )

  // ============================================
  // API ROUTES - Allow API routes for OTP (handled by API auth)
  // ============================================
  if (pathname.startsWith('/api/')) {
    return response
  }

  // ============================================
  // LANDING PAGE "/" - ALWAYS PUBLIC
  // ============================================
  // The root path is the landing page and should NEVER redirect to login
  // Authenticated users can still see the landing page
  if (pathname === '/') {
    return response
  }

  // Allow login page for everyone
  if (pathname === '/login') {
    // If already authenticated, check profile and redirect
    if (user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role) {
          // Has profile - redirect to dashboard
          const redirectPath = getDefaultRedirectPath(profile.role)
          return NextResponse.redirect(new URL(redirectPath, request.url))
        } else {
          // Authenticated but no profile - redirect to complete-profile
          return NextResponse.redirect(new URL('/complete-profile', request.url))
        }
      } catch (error) {
        console.error('Profile fetch error in middleware:', error)
      }
    }
    return response
  }

  // Allow signup page for everyone
  if (pathname === '/signup') {
    // If already authenticated, redirect to dashboard
    if (user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role) {
          // Has profile - redirect to dashboard
          const redirectPath = getDefaultRedirectPath(profile.role)
          return NextResponse.redirect(new URL(redirectPath, request.url))
        } else {
          // Authenticated but no profile - redirect to complete-profile
          return NextResponse.redirect(new URL('/complete-profile', request.url))
        }
      } catch (error) {
        console.error('Profile fetch error in middleware:', error)
      }
    }
    return response
  }

  // Allow auth callback (OAuth flow)
  if (pathname.startsWith('/auth/callback')) {
    return response
  }

  // ============================================
  // COMPLETE-PROFILE ROUTE - Special handling
  // ============================================
  if (pathname === '/complete-profile') {
    // Must be authenticated to access
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    
    // Check if already has profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    if (profile?.role) {
      // Already has profile - redirect to dashboard
      const redirectPath = getDefaultRedirectPath(profile.role)
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
    
    // No profile yet - allow access to complete-profile
    return response
  }

  // ============================================
  // PROTECTED ROUTES - Require authentication + profile
  // ============================================
  
  // Redirect unauthenticated users to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Get user profile and role
  let userRole = null
  let hasProfile = false
  let mustChangePassword = false

  // Fetch role separately so missing columns don't break profile detection
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!error) {
      userRole = profile?.role
      hasProfile = !!profile
    }
  } catch (error) {
    console.error('Profile fetch error in middleware:', error)
  }

  // Fetch must_change_password separately so unapplied migrations don't cause redirect loops
  try {
    const { data: pwdProfile, error } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single()

    if (!error) {
      mustChangePassword = !!pwdProfile?.must_change_password
    }
  } catch (error) {
    console.error('must_change_password fetch error in middleware:', error)
  }

  // ============================================
  // PROFILE CHECK - Redirect to complete-profile if missing
  // ============================================
  if (!hasProfile || !userRole) {
    // Authenticated but no profile - must complete profile first
    return NextResponse.redirect(new URL('/complete-profile', request.url))
  }

  // ============================================
  // FORCE CHANGE PASSWORD - HS được tạo từ đơn đăng ký
  // ============================================
  if (mustChangePassword && pathname !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', request.url))
  }
  // Nếu đã đổi xong mà cố vào trang change-password thì cho về dashboard
  if (!mustChangePassword && pathname === '/change-password') {
    return NextResponse.redirect(new URL(getDefaultRedirectPath(userRole), request.url))
  }

  // Route protection logic
  const isAdminRoute = pathname.startsWith('/admin')
  const isStudentRoute = pathname.startsWith('/student') || pathname.startsWith('/result') || pathname.startsWith('/learn')
  // /learn (kiến thức) dùng chung cho cả admin lẫn student
  const isLearnRoute = pathname.startsWith('/learn')
  const isExamInProgress = isExamRoute(pathname)

  // ============================================
  // CẤU HÌNH KHU QUẢN TRỊ — đọc MỘT LẦN, dùng cho hai việc
  // ============================================
  // Hai chỗ cần dòng này: công tắc hết hạn phiên (ngay dưới) và công tắc OTP
  // (phía sau). Đọc một lần rồi dùng lại, thay vì hai truy vấn cho cùng một
  // dòng trong cùng một request.
  //
  // Chỉ đọc khi người gọi là admin: học sinh không có công tắc nào ở đây, và
  // thêm một truy vấn vào mọi request của các em là trả giá cho một thứ không
  // dùng tới.
  let adminSettingsValue: unknown = null
  if (userRole === 'admin' && (isAdminRoute || isStudentRoute)) {
    try {
      const { data: settingRow } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', ADMIN_SETTINGS_KEY)
        .single()
      adminSettingsValue = settingRow?.value ?? null
    } catch {
      // Giữ null -> cả hai công tắc đều về mặc định AN TOÀN (bật).
    }
  }

  // Công tắc ở /admin/settings. Tắt thì admin không bị đá ra vì idle hay vì
  // chạm mốc 6 giờ. KHÔNG áp cho học sinh — hết hạn phiên của các em là một
  // phần của chống gian lận, không phải tiện nghi vận hành.
  const adminSessionTimeoutOn =
    userRole !== 'admin' || isAdminSessionTimeoutEnabled(adminSettingsValue)

  // ============================================
  // SESSION TIMEOUT CHECK
  // ============================================
  // IMPORTANT: Skip idle timeout for exam routes!
  // Students should NEVER be logged out while taking an exam.
  // Anti-cheat tracking handles exam monitoring instead.
  // ============================================
  if ((isAdminRoute || isStudentRoute) && adminSessionTimeoutOn) {
    // Exam routes are EXEMPT from idle timeout
    if (isExamInProgress) {
      // For admin absolute timeout, still apply (but students don't have absolute timeout)
      if (userRole === 'admin') {
        const sessionStartAt = request.cookies.get(SESSION_COOKIE_KEYS.SESSION_START_AT)?.value
        if (sessionStartAt) {
          const elapsed = Date.now() - parseInt(sessionStartAt, 10)
          if (elapsed > ABSOLUTE_SESSION_TIMEOUT.admin) {
            const redirectResponse = NextResponse.redirect(
              new URL('/login?expired=true&reason=absolute', request.url)
            )
            redirectResponse.cookies.delete(SESSION_COOKIE_KEYS.LAST_ACTIVE_AT)
            redirectResponse.cookies.delete(SESSION_COOKIE_KEYS.SESSION_START_AT)
            return redirectResponse
          }
        }
      }
      // Skip idle timeout for exam routes - let them continue
    } else {
      // Non-exam routes: apply normal timeout logic
      const { expired, reason } = isSessionExpired(request, userRole as 'admin' | 'student')
      
      if (expired) {
        const redirectResponse = NextResponse.redirect(
          new URL(`/login?expired=true&reason=${reason}`, request.url)
        )
        redirectResponse.cookies.delete(SESSION_COOKIE_KEYS.LAST_ACTIVE_AT)
        redirectResponse.cookies.delete(SESSION_COOKIE_KEYS.SESSION_START_AT)
        return redirectResponse
      }
    }
  }

  if (isAdminRoute && !isAdmin(userRole)) {
    // Non-admin trying to access admin routes
    return NextResponse.redirect(new URL('/student', request.url))
  }

  // ============================================
  // ADMIN 2FA CHECK
  // ============================================
  // Only exact system admins complete 2FA. Teacher accounts may use scoped
  // admin surfaces, but the OTP APIs intentionally reject non-admin roles.
  // Exception: /admin/verify-otp page itself
  // Can be disabled via admin.settings -> requireAdminOTP = false
  // ============================================
  const isVerifyOtpPage = pathname === '/admin/verify-otp'

  if (isVerifyOtpPage && userRole !== 'admin') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  if (isAdminRoute && userRole === 'admin') {
    const is2FAVerified = request.cookies.get(ADMIN_2FA_COOKIE)?.value === 'true'

    // Check if OTP requirement is disabled in site settings.
    // Dùng lại `adminSettingsValue` đã đọc phía trên — cùng một dòng, cùng một
    // request. Đọc lỗi ở trên để lại `null`, và `null` giữ OTP BẬT (fail-safe),
    // đúng hành vi cũ.
    let otpRequired = true
    if (
      adminSettingsValue &&
      typeof adminSettingsValue === 'object' &&
      (adminSettingsValue as Record<string, unknown>).requireAdminOTP === false
    ) {
      otpRequired = false
    }

    if (!otpRequired) {
      // OTP disabled: skip verify-otp page entirely
      if (isVerifyOtpPage) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      return response
    }

    if (isVerifyOtpPage) {
      // Already verified - redirect to admin dashboard
      if (is2FAVerified) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      // Not verified yet - allow access to verify-otp page
      return response
    }
    
    // Other admin routes require 2FA verification
    if (!is2FAVerified) {
      return NextResponse.redirect(new URL('/admin/verify-otp', request.url))
    }
  }

  if (isStudentRoute && !isStudent(userRole) && !(isLearnRoute && isAdmin(userRole))) {
    // Non-student trying to access student routes (admin được phép xem /learn)
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // Root path "/" is PUBLIC - handled by landing page
  // Do NOT redirect authenticated users from "/" - let them see landing page
  // They can navigate to dashboard via navbar or CTA buttons

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
