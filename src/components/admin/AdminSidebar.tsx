'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  LayoutDashboard, 
  FileText, 
  HelpCircle, 
  ClipboardList,
  MessageSquare,
  Settings,
  LogOut,
  GraduationCap
} from 'lucide-react'

const menuItems = [
  { 
    label: 'Tổng quan', 
    href: '/admin', 
    icon: LayoutDashboard 
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

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

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
      // Fallback: redirect anyway
      router.push('/login')
    }
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 text-lg">ExamHub</h1>
          <p className="text-xs text-slate-500">Quản lý đề thi</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${active 
                      ? 'bg-teal-50 text-teal-700 font-medium' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}
