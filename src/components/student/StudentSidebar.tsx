'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Home, 
  FileText, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  X,
  User,
  Moon,
  Sun
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

const menuItems = [
  { 
    label: 'Trang chủ', 
    href: '/student', 
    icon: Home 
  },
  { 
    label: 'Đề thi', 
    href: '/student/exams', 
    icon: FileText 
  },
  { 
    label: 'Lịch sử thi', 
    href: '/student/history', 
    icon: BarChart3 
  },
  { 
    label: 'Cài đặt', 
    href: '/student/settings', 
    icon: Settings 
  },
]

export default function StudentSidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    setMounted(true)
    fetchUserInfo()
  }, [])

  const fetchUserInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      
      setUserInfo({
        name: profile?.full_name || 'Học sinh',
        email: user.email || ''
      })
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) => {
    if (href === '/student') {
      return pathname === '/student'
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-40 flex items-center justify-between px-4">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
        >
          <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
        <span className="font-semibold text-slate-800 dark:text-white">Luyện Thi THPT</span>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          disabled={!mounted}
        >
          {mounted && (theme === 'dark' ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          ))}
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">📚</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800 dark:text-white text-sm">Luyện Thi THPT</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Toán học</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 dark:text-white text-sm truncate">
                {userInfo?.name || 'Đang tải...'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {userInfo?.email || ''}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active 
                    ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-teal-600 dark:text-teal-400' : ''}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            disabled={!mounted}
          >
            {mounted && (theme === 'dark' ? (
              <>
                <Sun className="w-5 h-5 text-yellow-500" />
                Chế độ sáng
              </>
            ) : (
              <>
                <Moon className="w-5 h-5" />
                Chế độ tối
              </>
            ))}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Bottom Navigation for Mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-40 flex items-center justify-around px-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all min-w-[60px]
                ${active 
                  ? 'text-teal-600 dark:text-teal-400' 
                  : 'text-slate-500 dark:text-slate-400'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
