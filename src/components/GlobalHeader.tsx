'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Sigma } from 'lucide-react'
import LogoutConfirmModal from './LogoutConfirmModal'
import { getRoleDisplayLabel, UserRole } from '@/lib/auth/roles'
import ThemeToggle from './ThemeToggle'

interface GlobalHeaderProps {
  title?: string
  showLogout?: boolean
}

export default function GlobalHeader({ title, showLogout = true }: GlobalHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    fetchUserRole()
  }, [])

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setUserRole(profile.role)
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
    }
  }

  const isInExam = pathname?.includes('/exam/') && !pathname?.includes('/result')
  const isInResult = pathname?.includes('/result/')
  const shouldShowLogout = showLogout && !isInExam && !isInResult

  const handleLogoutClick = () => {
    setShowLogoutModal(true)
  }

  const handleLogoutConfirm = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
    setShowLogoutModal(false)
  }

  const handleLogoutCancel = () => {
    setShowLogoutModal(false)
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
              <Sigma className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">
                {title || 'Luyện Thi Toán THPT'}
              </h1>
              {userRole && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {getRoleDisplayLabel(userRole as UserRole)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            
            {shouldShowLogout && (
              <button
                onClick={handleLogoutClick}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={handleLogoutCancel}
        onConfirm={handleLogoutConfirm}
        isInExam={isInExam}
      />
    </>
  )
}
