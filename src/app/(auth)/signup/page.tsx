'use client'

/**
 * Student Signup Page
 * 
 * Allows students to create new accounts with email/password.
 * After successful signup, users are redirected to login page.
 * 
 * SECURITY:
 * - Role is hardcoded as 'student' (no user input)
 * - Password validation on client and server
 * - Email format validation
 * - No auto-login after signup
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Mail, Lock, Eye, EyeOff, School, Users, CheckCircle } from 'lucide-react'
import Link from 'next/link'

// Password strength checker
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
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

// Email validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export default function SignupPage() {
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    school: '',
    classId: '',
  })

  // UI state
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')

  /**
   * Handle input changes
   */
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
    setServerError('')
  }

  /**
   * Validate form client-side
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email là bắt buộc'
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Email không hợp lệ'
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Mật khẩu là bắt buộc'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự'
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp'
    }

    // Full name validation
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Họ tên là bắt buộc'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setServerError('')

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          fullName: formData.fullName.trim(),
          school: formData.school.trim() || null,
          classId: formData.classId.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setServerError(data.error || 'Đã xảy ra lỗi khi đăng ký')
        setIsLoading(false)
        return
      }

      // Success - redirect to login with success message
      router.push('/login?signup=success')
    } catch (error) {
      setServerError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
      setIsLoading(false)
    }
  }

  const passwordStrength = getPasswordStrength(formData.password)

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-900 transition-colors">
      <div className="w-full max-w-md">
        {/* Signup Card */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-300 dark:border-slate-700 animate-fade-in-up">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-600 dark:bg-teal-500 text-white mb-4 shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20 bounce-in">
              <User className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Tạo tài khoản
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Đăng ký tài khoản học sinh
            </p>
          </div>

          {/* Server Error */}
          {serverError && (
            <div className="mb-4 p-3 rounded-xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm">
              {serverError}
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-4 animate-list-stagger">
            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Mail className="w-4 h-4" />
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="Nhập email của bạn"
                className={`w-full px-4 py-3 rounded-xl border bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all ${
                  errors.email 
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                    : 'border-slate-300 dark:border-slate-600 focus:border-teal-500 dark:focus:border-teal-400'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Lock className="w-4 h-4" />
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all ${
                    errors.password 
                      ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                      : 'border-slate-300 dark:border-slate-600 focus:border-teal-500 dark:focus:border-teal-400'
                  }`}
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
              {formData.password && (
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
              
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <Lock className="w-4 h-4" />
                Xác nhận mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all ${
                    errors.confirmPassword 
                      ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                      : 'border-slate-300 dark:border-slate-600 focus:border-teal-500 dark:focus:border-teal-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <User className="w-4 h-4" />
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Nhập họ tên đầy đủ"
                className={`w-full px-4 py-3 rounded-xl border bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all ${
                  errors.fullName 
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-400' 
                    : 'border-slate-300 dark:border-slate-600 focus:border-teal-500 dark:focus:border-teal-400'
                }`}
              />
              {errors.fullName && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.fullName}</p>
              )}
            </div>

            {/* School - Optional */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                <School className="w-4 h-4" />
                Trường học <span className="text-slate-400 text-xs">(không bắt buộc)</span>
              </label>
              <input
                type="text"
                value={formData.school}
                onChange={(e) => handleChange('school', e.target.value)}
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
                value={formData.classId}
                onChange={(e) => handleChange('classId', e.target.value)}
                placeholder="VD: 12A1"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20 outline-none transition-all"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-teal-600/20 dark:shadow-teal-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Đang tạo tài khoản...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Tạo tài khoản
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Đã có tài khoản?{' '}
              <Link 
                href="/login" 
                className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium transition-colors"
              >
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
