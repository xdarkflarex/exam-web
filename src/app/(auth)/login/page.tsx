'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import LoginView from '@/components/LoginView'
import { getDefaultRedirectPath } from '@/lib/auth/roles'
import { useLoading } from '@/contexts/LoadingContext'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()

  const [error, setError] = useState('')

  const handleLogin = async (email: string, password: string) => {
    setError('')
    showLoading('Đang đăng nhập...')

    const { data, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password
      })

    if (authError) {
      setError(authError.message)
      hideLoading()
      return
    }

    const user = data.user
    if (!user) {
      setError('Không tìm thấy thông tin người dùng')
      hideLoading()
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.role) {
      setError('Tài khoản chưa được gán quyền. Vui lòng liên hệ admin.')
      hideLoading()
      return
    }

    const redirectPath = getDefaultRedirectPath(profile.role)

    router.replace(redirectPath)
    // Note: hideLoading() will be called automatically when component unmounts
  }

  return (
    <LoginView
      onLogin={handleLogin}
      error={error}
    />
  )
}
