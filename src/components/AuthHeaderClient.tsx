'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LogIn, UserPlus, LayoutDashboard, LogOut } from 'lucide-react'

interface UserInfo {
  name: string
  email: string
  role: 'admin' | 'student' | null
}

export default function AuthHeaderClient() {
  const supabase = createClient()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
          setLoading(false)
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role, email')
          .eq('id', authUser.id)
          .single()

        setUser({
          name: profile?.full_name || authUser.email?.split('@')[0] || 'Người dùng',
          email: authUser.email || '',
          role: profile?.role || null,
        })
      } catch {
        // Not logged in or error - show login buttons
      } finally {
        setLoading(false)
      }
    }

    fetchUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const dashboardHref = user?.role === 'admin' ? '/admin' : '/student'

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
        <div className="w-24 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <Link
          href="/login"
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-xl transition-all duration-200"
        >
          <LogIn className="w-4 h-4" />
          <span className="hidden sm:inline">Đăng nhập</span>
        </Link>
        <Link
          href="/signup"
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-600 to-teal-500 dark:from-teal-500 dark:to-teal-400 rounded-xl shadow-md shadow-teal-600/20 dark:shadow-teal-500/15 hover:shadow-lg hover:shadow-teal-600/30 dark:hover:shadow-teal-400/25 hover:scale-[1.03] active:scale-[0.97] transition-all duration-200"
        >
          <UserPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Đăng ký</span>
        </Link>
      </>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Avatar + Name */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-200/60 dark:bg-slate-700/60">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 dark:from-teal-400 dark:to-teal-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
          {user.name}
        </span>
      </div>

      {/* Dashboard button */}
      <Link
        href={dashboardHref}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-600 to-teal-500 dark:from-teal-500 dark:to-teal-400 rounded-xl shadow-md shadow-teal-600/20 hover:shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-all duration-200"
      >
        <LayoutDashboard className="w-4 h-4" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200"
        title="Đăng xuất"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden lg:inline">Đăng xuất</span>
      </button>
    </div>
  )
}
