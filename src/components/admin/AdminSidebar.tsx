'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  FileText, 
  HelpCircle, 
  ClipboardList,
  MessageSquare,
  Settings,
  LogOut,
  GraduationCap,
  Menu,
  X,
  Users,
  BarChart3,
  School,
  Megaphone,
  FileSpreadsheet
} from 'lucide-react'

const menuItems = [
  { 
    label: 'Tổng quan', 
    href: '/admin', 
    icon: LayoutDashboard 
  },
  { 
    label: 'Thống kê', 
    href: '/admin/analytics', 
    icon: BarChart3 
  },
  { 
    label: 'Đề thi', 
    href: '/admin/exams', 
    icon: FileText 
  },
  { 
    label: 'Câu hỏi', 
    href: '/admin/questions', 
    icon: HelpCircle 
  },
  { 
    label: 'Học sinh', 
    href: '/admin/students', 
    icon: Users 
  },
  { 
    label: 'Lớp học', 
    href: '/admin/classes', 
    icon: School 
  },
  { 
    label: 'Tài khoản', 
    href: '/admin/users', 
    icon: GraduationCap 
  },
  { 
    label: 'Xuất báo cáo', 
    href: '/admin/reports', 
    icon: FileSpreadsheet 
  },
  { 
    label: 'Thông báo', 
    href: '/admin/announcements', 
    icon: Megaphone 
  },
  { 
    label: 'Góp ý', 
    href: '/admin/feedback', 
    icon: MessageSquare 
  },
  { 
    label: 'Cài đặt', 
    href: '/admin/settings', 
    icon: Settings 
  },
]

interface AdminSidebarProps {
  isOpen?: boolean
  onToggle?: () => void
}

export default function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
      router.push('/login')
    }
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="h-14 sm:h-16 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-slate-300 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg">ExamHub</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Quản lý đề thi</p>
          </div>
        </div>
        {/* Close button for mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 sm:py-6 px-3 sm:px-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all duration-200
                    ${active 
                      ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-medium' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="text-sm sm:text-base">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-3 sm:p-4 border-t border-slate-300 dark:border-slate-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm sm:text-base">Đăng xuất</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Menu Button - Fixed at top */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-lg"
      >
        <Menu className="w-5 h-5 text-slate-700 dark:text-slate-300" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`
        lg:hidden fixed left-0 top-0 h-full w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 flex flex-col z-50
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 flex-col z-40">
        {sidebarContent}
      </aside>
    </>
  )
}
