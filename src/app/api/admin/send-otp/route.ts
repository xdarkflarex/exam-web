import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { generateOTP, getOTPExpiration } from '@/lib/auth/otp'

/**
 * POST /api/admin/send-otp
 * 
 * Generates and sends OTP to admin user's email.
 * 
 * SECURITY:
 * - Only accessible by authenticated admin users
 * - Generates new OTP and invalidates old ones
 * - Sends OTP via email (using Supabase or SMTP)
 */
export async function POST() {
  try {
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
      .select('role, email, full_name')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin only' },
        { status: 403 }
      )
    }

    // Generate OTP
    const otp = generateOTP()
    const expiresAt = getOTPExpiration()

    // Invalidate any existing unused OTPs for this user
    await supabase
      .from('admin_otp_codes')
      .update({ is_used: true })
      .eq('user_id', user.id)
      .eq('is_used', false)

    // Insert new OTP
    const { error: insertError } = await supabase
      .from('admin_otp_codes')
      .insert({
        user_id: user.id,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        is_used: false,
      })

    if (insertError) {
      console.error('OTP insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to generate OTP' },
        { status: 500 }
      )
    }

    // Send OTP via email
    // Using Supabase Edge Function or direct SMTP
    const emailResult = await sendOTPEmail({
      to: user.email!,
      otp: otp,
      userName: profile.full_name || 'Admin',
    })

    if (!emailResult.success) {
      console.error('Email send error:', emailResult.error)
      return NextResponse.json(
        { error: 'Failed to send OTP email' },
        { status: 500 }
      )
    }

    // Return success (don't return OTP in response for security)
    return NextResponse.json({
      success: true,
      message: 'OTP sent to your email',
      expiresAt: expiresAt.toISOString(),
    })

  } catch (error) {
    console.error('Send OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Send OTP email
 * 
 * This function sends the OTP to the admin's email.
 * You can implement this using:
 * 1. Supabase Edge Functions with Resend/SendGrid
 * 2. Direct SMTP (nodemailer)
 * 3. Any email service API
 * 
 * For now, we'll use a simple implementation that can be extended.
 */
async function sendOTPEmail({
  to,
  otp,
  userName,
}: {
  to: string
  otp: string
  userName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Option 1: Use Supabase Edge Function (if configured)
    // const { data, error } = await supabase.functions.invoke('send-otp-email', {
    //   body: { to, otp, userName }
    // })

    // Option 2: Use external email service API
    // For production, replace this with your actual email sending logic
    
    // Check if we have email configuration
    const resendApiKey = process.env.RESEND_API_KEY
    
    if (resendApiKey) {
      // Use Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'ExamHub <noreply@examhub.com>',
          to: [to],
          subject: 'Mã xác thực đăng nhập Admin - ExamHub',
          html: generateOTPEmailHTML(otp, userName),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        return { success: false, error: errorData.message || 'Email send failed' }
      }

      return { success: true }
    }

    // Fallback: Development mode only - log OTP to console
    // In production, this should NEVER be reached - always configure RESEND_API_KEY
    if (process.env.NODE_ENV === 'development') {
      console.log('========================================')
      console.log(`[DEV MODE] OTP for ${to}: ${otp}`)
      console.log('========================================')
      return { success: true }
    }
    
    // Production without email config - return error
    console.error('CRITICAL: No email provider configured in production')
    return { success: false, error: 'Email service not configured' }

  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Generate HTML email template for OTP
 */
function generateOTPEmailHTML(otp: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác thực OTP</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e2e8f0; border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0d9488; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px; font-weight: bold;">ExamHub Admin</h1>
              <p style="margin: 8px 0 0 0; color: #99f6e4; font-size: 14px;">Xác thực đăng nhập</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 16px 0; color: #334155; font-size: 16px;">
                Xin chào <strong>${userName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Bạn đang đăng nhập vào trang quản trị ExamHub. Vui lòng sử dụng mã OTP bên dưới để xác thực:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Mã xác thực</p>
                <p style="margin: 0; color: #0f172a; font-size: 36px; font-weight: bold; letter-spacing: 8px;">${otp}</p>
              </div>
              
              <p style="margin: 24px 0 0 0; color: #ef4444; font-size: 13px; text-align: center;">
                ⏱ Mã này sẽ hết hạn sau <strong>5 phút</strong>
              </p>
              
              <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 32px 0;">
              
              <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.6;">
                Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.<br>
                Không chia sẻ mã OTP với bất kỳ ai.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #cbd5e1; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                © ${new Date().getFullYear()} ExamHub. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
