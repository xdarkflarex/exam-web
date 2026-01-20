'use client'

/**
 * Admin OTP Verification Page
 * 
 * This page is shown to admin users after email/password login.
 * They must enter a valid OTP to complete 2FA and access the admin dashboard.
 * 
 * Flow:
 * 1. Admin logs in with email/password
 * 2. Redirected here to verify OTP
 * 3. OTP is sent to admin's email automatically
 * 4. Admin enters OTP
 * 5. On success, redirected to /admin dashboard
 * 
 * SECURITY:
 * - OTP expires after 5 minutes
 * - OTP is single-use
 * - Only admins can access this page
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, RefreshCw, Mail, AlertCircle } from 'lucide-react'

export default function VerifyOTPPage() {
  const router = useRouter()
  const supabase = createClient()

  // OTP input state (6 separate inputs)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  /**
   * Check if user is authenticated admin and send initial OTP
   */
  useEffect(() => {
    const checkAuthAndSendOTP = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.replace('/login')
        return
      }

      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        // Not admin - redirect to student dashboard
        router.replace('/student')
        return
      }

      setUserEmail(user.email || profile.email || '')
      setIsCheckingAuth(false)

      // Send initial OTP
      await sendOTP()
    }

    checkAuthAndSendOTP()
  }, [router, supabase])

  /**
   * Resend cooldown timer
   */
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  /**
   * Send OTP to admin email
   */
  const sendOTP = async () => {
    setIsSending(true)
    setError('')

    try {
      const response = await fetch('/api/admin/send-otp', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Không thể gửi mã OTP')
        setIsSending(false)
        return
      }

      setOtpSent(true)
      setSuccess('Mã OTP đã được gửi đến email của bạn')
      setResendCooldown(60) // 60 second cooldown for resend
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Đã xảy ra lỗi khi gửi OTP')
    } finally {
      setIsSending(false)
    }
  }

  /**
   * Handle OTP input change
   */
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError('')

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits entered
    if (value && index === 5) {
      const fullOtp = newOtp.join('')
      if (fullOtp.length === 6) {
        handleVerify(fullOtp)
      }
    }
  }

  /**
   * Handle backspace key
   */
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  /**
   * Handle paste
   */
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('')
      setOtp(newOtp)
      inputRefs.current[5]?.focus()
      handleVerify(pastedData)
    }
  }

  /**
   * Verify OTP
   */
  const handleVerify = async (otpValue?: string) => {
    const otpToVerify = otpValue || otp.join('')
    
    if (otpToVerify.length !== 6) {
      setError('Vui lòng nhập đủ 6 chữ số')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpToVerify }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Xác thực thất bại')
        setOtp(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        setIsLoading(false)
        return
      }

      // Success - redirect to admin dashboard
      setSuccess('Xác thực thành công!')
      
      // Use window.location.href to ensure the new cookie is picked up
      // router.replace doesn't always pick up newly set cookies from API response
      setTimeout(() => {
        window.location.href = '/admin'
      }, 500)
    } catch (err) {
      setError('Đã xảy ra lỗi khi xác thực')
      setIsLoading(false)
    }
  }

  /**
   * Handle resend OTP
   */
  const handleResend = async () => {
    if (resendCooldown > 0) return
    
    setOtp(['', '', '', '', '', ''])
    inputRefs.current[0]?.focus()
    await sendOTP()
  }

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 dark:text-slate-400">Đang kiểm tra...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-900 transition-colors">
      <div className="w-full max-w-md">
        {/* OTP Verification Card */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-300 dark:border-slate-700">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 dark:bg-teal-500 text-white mb-4 shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Xác thực 2 bước
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Nhập mã OTP đã gửi đến email
            </p>
            {userEmail && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-500 dark:text-slate-500">
                <Mail className="w-4 h-4" />
                <span>{userEmail}</span>
              </div>
            )}
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 rounded-xl bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 text-sm text-center">
              {success}
            </div>
          )}

          {/* OTP Input */}
          <div className="mb-6">
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={el => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isLoading}
                  className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all disabled:opacity-50"
                />
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Verify Button */}
          <button
            onClick={() => handleVerify()}
            disabled={isLoading || otp.join('').length !== 6}
            className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Đang xác thực...
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                Xác thực
              </>
            )}
          </button>

          {/* Resend OTP */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-500 mb-2">
              Không nhận được mã?
            </p>
            <button
              onClick={handleResend}
              disabled={isSending || resendCooldown > 0}
              className="inline-flex items-center gap-2 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSending ? 'animate-spin' : ''}`} />
              {resendCooldown > 0 
                ? `Gửi lại sau ${resendCooldown}s` 
                : isSending 
                  ? 'Đang gửi...' 
                  : 'Gửi lại mã OTP'
              }
            </button>
          </div>

          {/* Security Notice */}
          <div className="mt-6 p-3 rounded-xl bg-slate-300/50 dark:bg-slate-700/50 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mã OTP có hiệu lực trong <strong>5 phút</strong> và chỉ sử dụng được một lần.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
