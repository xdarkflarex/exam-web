'use client'

/**
 * Login Page
 * 
 * IMPORTANT: This page uses LOCAL loading state only.
 * Global loading overlay is NOT used here to prevent stuck loading issues
 * when redirecting to OTP verification or OAuth flows.
 */

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import LoginView from '@/components/LoginView'
import { getDefaultRedirectPath } from '@/lib/auth/roles'
import { clearSessionData } from '@/lib/session/utils'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [error, setError] = useState('')
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Handle session expiry message and signup success from redirect
  // Also check if user already has a valid session
  useEffect(() => {
    const checkExistingSession = async () => {
      const expired = searchParams.get('expired')
      const reason = searchParams.get('reason')
      const signup = searchParams.get('signup')
      
      // If not coming from session expiry, check if user already has valid session
      if (!expired) {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          // User has valid Supabase session - check profile and redirect
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
          
          if (profile?.role) {
            // Has profile - redirect to appropriate dashboard
            if (profile.role === 'admin') {
              router.replace('/admin/verify-otp')
            } else {
              const redirectPath = getDefaultRedirectPath(profile.role)
              router.replace(redirectPath)
            }
            return
          } else {
            // Has session but no profile - redirect to complete profile
            router.replace('/complete-profile')
            return
          }
        }
      }
      
      if (expired === 'true') {
        // Clear any remaining session data
        clearSessionData()
        
        // Also sign out from Supabase to ensure clean state
        await supabase.auth.signOut()
        
        if (reason === 'idle') {
          setSessionExpiredMessage('Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.')
        } else if (reason === 'absolute') {
          setSessionExpiredMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
        } else {
          setSessionExpiredMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
        }
        
        // Clean up URL
        router.replace('/login')
      } else if (signup === 'success') {
        setSessionExpiredMessage('Tài khoản đã được tạo thành công! Vui lòng đăng nhập.')
        
        // Clean up URL
        router.replace('/login')
      }
    }
    
    checkExistingSession()
  }, [searchParams, router, supabase])

  const handleLogin = async (email: string, password: string) => {
    setError('')
    setIsLoading(true)

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password
        })

      if (authError) {
        // Handle specific auth errors with Vietnamese messages
        if (authError.message.includes('Invalid login credentials')) {
          setError('Email hoặc mật khẩu không đúng')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Email chưa được xác minh. Vui lòng kiểm tra hộp thư.')
        } else if (authError.message.includes('Too many requests')) {
          setError('Quá nhiều lần thử. Vui lòng đợi vài phút.')
        } else {
          setError(authError.message)
        }
        setIsLoading(false)
        return
      }

      const user = data.user
      if (!user) {
        setError('Không tìm thấy thông tin người dùng')
        setIsLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.role) {
        // User exists in auth but no profile - redirect to complete profile
        if (profileError?.code === 'PGRST116') {
          router.replace('/complete-profile')
          return
        }
        setError('Tài khoản chưa được gán quyền. Vui lòng liên hệ admin.')
        setIsLoading(false)
        return
      }

      // ============================================
      // ADMIN 2FA FLOW
      // ============================================
      if (profile.role === 'admin') {
        router.replace('/admin/verify-otp')
        return
      }

      // Student users go directly to their dashboard
      const redirectPath = getDefaultRedirectPath(profile.role)
      router.replace(redirectPath)
    } catch (err) {
      console.error('Login error:', err)
      setError('Đã xảy ra lỗi. Vui lòng thử lại.')
      setIsLoading(false)
    }
  }

  return (
    <LoginView
      onLogin={handleLogin}
      error={error}
      sessionExpiredMessage={sessionExpiredMessage}
    />
  )
}
