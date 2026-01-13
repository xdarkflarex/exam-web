import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * POST /api/auth/signup
 * 
 * Creates a new student account with email/password.
 * 
 * SECURITY:
 * - Role is hardcoded as 'student' (no user input)
 * - Email uniqueness check (both auth.users and profiles)
 * - Password validation
 * - No auto-login after signup
 * 
 * ERROR HANDLING:
 * - Explicit handling for all error cases
 * - User-friendly Vietnamese error messages
 * - Handles orphaned auth.users (profile creation failure)
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // PARSE REQUEST BODY
    // ============================================
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu không hợp lệ. Vui lòng thử lại.', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }
    
    const { email, password, fullName, school, classId } = body

    // ============================================
    // INPUT VALIDATION
    // ============================================
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email là bắt buộc', code: 'EMAIL_REQUIRED' },
        { status: 400 }
      )
    }
    
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Mật khẩu là bắt buộc', code: 'PASSWORD_REQUIRED' },
        { status: 400 }
      )
    }
    
    if (!fullName || typeof fullName !== 'string') {
      return NextResponse.json(
        { error: 'Họ tên là bắt buộc', code: 'FULLNAME_REQUIRED' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const trimmedFullName = fullName.trim()

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Định dạng email không hợp lệ', code: 'INVALID_EMAIL_FORMAT' },
        { status: 400 }
      )
    }

    // Password strength validation
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 8 ký tự', code: 'PASSWORD_TOO_SHORT' },
        { status: 400 }
      )
    }
    
    // Check for password complexity
    const hasUppercase = /[A-Z]/.test(password)
    const hasLowercase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return NextResponse.json(
        { error: 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số', code: 'PASSWORD_WEAK' },
        { status: 400 }
      )
    }

    // Full name validation
    if (trimmedFullName.length < 2) {
      return NextResponse.json(
        { error: 'Họ tên phải có ít nhất 2 ký tự', code: 'FULLNAME_TOO_SHORT' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
      }
    )

    // ============================================
    // CHECK IF EMAIL ALREADY EXISTS IN PROFILES
    // ============================================
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (profileCheckError) {
      console.error('Profile check error:', profileCheckError)
      return NextResponse.json(
        { error: 'Không thể kiểm tra email. Vui lòng thử lại.', code: 'PROFILE_CHECK_ERROR' },
        { status: 500 }
      )
    }

    if (existingProfile) {
      return NextResponse.json(
        { error: 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng email khác.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      )
    }

    // ============================================
    // CREATE SUPABASE AUTH USER
    // ============================================
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password,
      options: {
        data: {
          full_name: trimmedFullName,
        }
      }
    })

    if (authError) {
      console.error('Supabase auth signup error:', authError.message, authError.code)
      
      // Handle specific Supabase errors with user-friendly messages
      const errorMessage = authError.message.toLowerCase()
      
      if (errorMessage.includes('user already registered') || 
          errorMessage.includes('email already') ||
          authError.code === 'user_already_exists') {
        return NextResponse.json(
          { error: 'Email này đã được đăng ký. Vui lòng đăng nhập.', code: 'AUTH_EMAIL_EXISTS' },
          { status: 409 }
        )
      }
      
      if (errorMessage.includes('password') && errorMessage.includes('weak')) {
        return NextResponse.json(
          { error: 'Mật khẩu quá yếu. Vui lòng sử dụng mật khẩu mạnh hơn.', code: 'AUTH_PASSWORD_WEAK' },
          { status: 400 }
        )
      }
      
      if (errorMessage.includes('password') && errorMessage.includes('at least')) {
        return NextResponse.json(
          { error: 'Mật khẩu không đáp ứng yêu cầu bảo mật.', code: 'AUTH_PASSWORD_POLICY' },
          { status: 400 }
        )
      }
      
      if (errorMessage.includes('invalid email')) {
        return NextResponse.json(
          { error: 'Email không hợp lệ.', code: 'AUTH_INVALID_EMAIL' },
          { status: 400 }
        )
      }
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
        return NextResponse.json(
          { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau vài phút.', code: 'RATE_LIMITED' },
          { status: 429 }
        )
      }

      // Generic auth error
      return NextResponse.json(
        { error: 'Không thể tạo tài khoản xác thực. Vui lòng thử lại sau.', code: 'AUTH_ERROR' },
        { status: 500 }
      )
    }

    const user = authData.user
    
    // Check for fake signup (email confirmation required but user not created)
    if (!user || !user.id) {
      return NextResponse.json(
        { error: 'Không thể tạo tài khoản. Máy chủ xác thực không phản hồi.', code: 'AUTH_NO_USER' },
        { status: 500 }
      )
    }
    
    // Check if this is a "fake" signup where email confirmation is pending
    // In this case, identities array will be empty
    if (authData.user?.identities?.length === 0) {
      return NextResponse.json(
        { error: 'Email này đã được đăng ký nhưng chưa xác minh. Vui lòng kiểm tra email hoặc đăng nhập.', code: 'EMAIL_UNVERIFIED' },
        { status: 409 }
      )
    }

    // ============================================
    // CREATE PROFILE RECORD
    // ============================================
    // Role is hardcoded as 'student' for security - NEVER from user input
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: normalizedEmail,
        role: 'student', // HARDCODED - no user input for role
        full_name: trimmedFullName,
        school: school?.trim() || null,
        class_id: classId?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      console.error('Profile creation error:', profileError.message, profileError.code)
      
      // Handle specific profile errors
      if (profileError.code === '23505') { // Unique violation
        return NextResponse.json(
          { error: 'Hồ sơ với email này đã tồn tại. Vui lòng đăng nhập.', code: 'PROFILE_EXISTS' },
          { status: 409 }
        )
      }
      
      if (profileError.code === '23503') { // Foreign key violation
        return NextResponse.json(
          { error: 'Lỗi liên kết tài khoản. Vui lòng thử lại.', code: 'PROFILE_FK_ERROR' },
          { status: 500 }
        )
      }
      
      // Profile creation failed but auth user exists
      // This creates an orphaned auth user - log for admin attention
      console.error(`CRITICAL: Orphaned auth user created. User ID: ${user.id}, Email: ${normalizedEmail}`)
      
      return NextResponse.json(
        { 
          error: 'Tạo hồ sơ thất bại. Tài khoản đã được tạo một phần. Vui lòng liên hệ hỗ trợ hoặc thử đăng nhập.', 
          code: 'PROFILE_CREATE_FAILED',
          details: 'Auth user created but profile insert failed'
        },
        { status: 500 }
      )
    }

    // ============================================
    // SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      message: 'Tài khoản đã được tạo thành công. Vui lòng đăng nhập.',
      code: 'SIGNUP_SUCCESS',
      user: {
        id: user.id,
        email: user.email,
        fullName: trimmedFullName,
      }
    })

  } catch (error) {
    console.error('Signup API unexpected error:', error)
    return NextResponse.json(
      { error: 'Lỗi máy chủ không mong đợi. Vui lòng thử lại sau.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

/**
 * Handle non-POST requests
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}
