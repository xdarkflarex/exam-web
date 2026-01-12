'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import LoginView from '@/components/LoginView'
import { getDefaultRedirectPath } from '@/lib/auth/roles'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [error, setError] = useState('')

  const handleLogin = async (email: string, password: string) => {
    setError('')

    const { data, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password
      })

    if (authError) {
      setError(authError.message)
      return
    }

    const user = data.user
    if (!user) {
      setError('Không tìm thấy thông tin người dùng')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.role) {
      setError('Tài khoản chưa được gán quyền. Vui lòng liên hệ admin.')
      return
    }

    const redirectPath = getDefaultRedirectPath(profile.role)

    router.replace(redirectPath)
  }

  return (
    <LoginView
      onLogin={handleLogin}
      error={error}
    />
  )
}
