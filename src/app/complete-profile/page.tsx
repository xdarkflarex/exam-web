'use client'

/**
 * Complete Profile Page
 * 
 * This page is shown to new Google OAuth users who don't have a profile yet.
 * They must complete their profile before accessing the student dashboard.
 * 
 * Flow:
 * 1. User signs in with Google
 * 2. OAuth callback detects no profile exists
 * 3. User is redirected here to complete their profile
 * 4. OPTIONAL: User can set a password to enable email/password login later
 * 5. After submission, profile is created with role='student'
 * 6. User is redirected to /student dashboard
 * 
 * SECURITY:
 * - Role is always 'student' (hardcoded, no user input)
 * - User ID comes from authenticated session
 * - Email comes from authenticated session
 * - Password is NEVER stored in profiles table (only via Supabase Auth)
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User, CheckCircle, School, Users, Lock, Eye, EyeOff, Info } from 'lucide-react'

// Password strength checker
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' }
  
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  
  if (score <= 2) return { score, label: 'Yếu', color: 'text-red-600 dark:text-red-400' }
  if (score <= 3) return { score, label: 'Trung bình', color: 'text-amber-600 dark:text-amber-400' }
  return { score, label: 'Mạnh', color: 'text-green-600 dark:text-green-400' }
}

export default function CompleteProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [classId, setClassId] = useState('')
  
  // Password state (optional for Google users)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  
  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [isGoogleUser, setIsGoogleUser] = useState(false)

  /**
   * Check if user is authenticated and doesn't already have a profile
   */
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        // Not authenticated - redirect to login
        router.replace('/login')
        return
      }

      // Check if profile already exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        // Profile already exists - redirect to dashboard
        router.replace('/student')
        return
      }

      // User is authenticated but has no profile - show form
      setUserId(user.id)
      setUserEmail(user.email || '')
      
      // Check if this is a Google OAuth user (has google in app_metadata.provider)
      const provider = user.app_metadata?.provider
      const isGoogle = !!(
        provider === 'google' ||
        user.identities?.some(i => i.provider === 'google')
      )      
      setIsGoogleUser(isGoogle)
      
      // Pre-fill name from Google metadata if available
      if (user.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name)
      } else if (user.user_metadata?.name) {
        setFullName(user.user_metadata.name)
      }
      
      setIsCheckingAuth(false)
    }

    checkAuth()
  }, [router, supabase])

  /**
   * Handle form submission - create profile and optionally set password
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate required fields
    if (!fullName.trim()) {
      setError('Vui lòng nhập họ tên của bạn')
      return
    }

    // Validate password if provided (optional for Google users)
    if (password) {
      if (password.length < 8) {
        setError('Mật khẩu phải có ít nhất 8 ký tự')
        return
      }
      
      const hasUppercase = /[A-Z]/.test(password)
      const hasLowercase = /[a-z]/.test(password)
      const hasNumber = /[0-9]/.test(password)
      
      if (!hasUppercase || !hasLowercase || !hasNumber) {
        setError('Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số')
        return
      }
      
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận không khớp')
        return
      }
    }

    setIsLoading(true)

    try {
      // ============================================
      // STEP 1: Set password if provided (BEFORE profile creation)
      // ============================================
      if (password) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: password
        })
        
        if (passwordError) {
          console.error('Password set error:', passwordError)
          setError('Không thể thiết lập mật khẩu. Vui lòng thử lại.')
          setIsLoading(false)
          return
        }
      }

      // ============================================
      // STEP 2: Create profile with role='student'
      // ============================================
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: userEmail,
          role: 'student', // ALWAYS student - no user input for role
          full_name: fullName.trim(),
          school: school.trim() || null,
          class_id: classId.trim() || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('Profile creation error:', insertError)
        setError('Không thể tạo hồ sơ. Vui lòng thử lại.')
        setIsLoading(false)
        return
      }

      // Success - redirect to student dashboard
      router.replace('/student')
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Đã xảy ra lỗi. Vui lòng thử lại.')
      setIsLoading(false)
    }
  }
  
  const passwordStrength = getPasswordStrength(password)

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
        {/* Profile Completion Card */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-300 dark:border-slate-700">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 dark:bg-teal-500 text-white mb-4 shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20">
              <User className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Hoàn tất hồ sơ
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Vui lòng điền thông tin để tiếp tục
            </p>
            {userEmail && (
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                {userEmail}
              </p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name - Required */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <User className="w-4 h-4" />
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nhập họ tên đầy đủ"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
              />
            </div>

            {/* School - Optional */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <School className="w-4 h-4" />
                Trường học <span className="text-slate-400 text-xs">(không bắt buộc)</span>
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="VD: THPT Nguyễn Du"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
              />
            </div>

            {/* Class - Optional */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Users className="w-4 h-4" />
                Lớp <span className="text-slate-400 text-xs">(không bắt buộc)</span>
              </label>
              <input
                type="text"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                placeholder="VD: 12A1"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
              />
            </div>

            {/* Password Section - Optional for Google OAuth users */}
            {isGoogleUser && (
              <div className="pt-4 border-t border-slate-300 dark:border-slate-600">
                {!showPasswordSection ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordSection(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-400 hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-400 dark:hover:text-teal-400 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Thiết lập mật khẩu (không bắt buộc)</span>
                  </button>
                ) : (
                  <div className="space-y-4">
                    {/* Info Banner */}
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                      <Info className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-teal-700 dark:text-teal-300">
                        Thiết lập mật khẩu để có thể đăng nhập bằng email mà không cần Google sau này.
                      </p>
                    </div>

                    {/* Password Input */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        <Lock className="w-4 h-4" />
                        Mật khẩu <span className="text-slate-400 text-xs">(không bắt buộc)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Nhập mật khẩu"
                          className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      
                      {/* Password Strength Indicator */}
                      {password && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  passwordStrength.score <= 2 ? 'bg-red-500' :
                                  passwordStrength.score <= 3 ? 'bg-amber-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${passwordStrength.color}`}>
                              {passwordStrength.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Sử dụng ít nhất 8 ký tự với chữ hoa, chữ thường và số
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Confirm Password Input */}
                    {password && (
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          <Lock className="w-4 h-4" />
                          Xác nhận mật khẩu
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu"
                            className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cancel button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordSection(false)
                        setPassword('')
                        setConfirmPassword('')
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    >
                      Bỏ qua thiết lập mật khẩu
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></div>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !fullName.trim()}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Đang lưu...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Hoàn tất đăng ký
                </>
              )}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Bạn sẽ đăng nhập với tư cách Học sinh
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
