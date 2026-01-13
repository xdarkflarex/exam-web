import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ADMIN_2FA_COOKIE, ADMIN_2FA_EXPIRATION_MS, isOTPExpired } from '@/lib/auth/otp'

/**
 * POST /api/admin/verify-otp
 * 
 * Verifies the OTP submitted by admin user.
 * 
 * SECURITY:
 * - Only accessible by authenticated admin users
 * - Checks OTP validity, expiration, and usage status
 * - Marks OTP as used after successful verification
 * - Sets 2FA verification cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { otp } = body

    if (!otp || typeof otp !== 'string' || otp.length !== 6) {
      return NextResponse.json(
        { error: 'Invalid OTP format' },
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

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin only' },
        { status: 403 }
      )
    }

    // Find the OTP record
    const { data: otpRecord, error: otpError } = await supabase
      .from('admin_otp_codes')
      .select('*')
      .eq('user_id', user.id)
      .eq('otp_code', otp)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (otpError || !otpRecord) {
      return NextResponse.json(
        { error: 'Mã OTP không hợp lệ', code: 'INVALID_OTP' },
        { status: 400 }
      )
    }

    // Check if OTP is expired
    if (isOTPExpired(otpRecord.expires_at)) {
      return NextResponse.json(
        { error: 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.', code: 'OTP_EXPIRED' },
        { status: 400 }
      )
    }

    // Mark OTP as used
    const { error: updateError } = await supabase
      .from('admin_otp_codes')
      .update({ is_used: true })
      .eq('id', otpRecord.id)

    if (updateError) {
      console.error('OTP update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to verify OTP' },
        { status: 500 }
      )
    }

    // Create response with 2FA verification cookie
    const response = NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
    })

    // Set 2FA verification cookie
    const expires = new Date(Date.now() + ADMIN_2FA_EXPIRATION_MS)
    response.cookies.set({
      name: ADMIN_2FA_COOKIE,
      value: 'true',
      path: '/',
      expires: expires,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })

    return response

  } catch (error) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
