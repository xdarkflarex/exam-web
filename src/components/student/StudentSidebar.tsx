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
  Sun,
  PenTool,
  BookOpen,
  ClipboardList,
  TrendingUp
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import MinhMathLogo from '@/components/MinhMathLogo'
import { getFeatureFlags, hasFeatureAccess, FeatureFlags, FeatureKey, DEFAULT_FEATURE_FLAGS } from '@/lib/auth/access'

// feature: null => luôn hiển thị
// primary: có mặt trên bottom nav mobile. Tối đa 4 mục — xem chú thích ở bottom nav.
const menuItems: {
  label: string
  href: string
  icon: typeof Home
  feature: FeatureKey | null
  primary?: boolean
}[] = [
  { label: 'Hôm nay', href: '/student', icon: Home, feature: null, primary: true },
  { label: 'Bài tập', href: '/student/homework', icon: ClipboardList, feature: 'homework', primary: true },
  // Trỏ thẳng `/learn`. `/learn/map` chỉ là redirect tương thích cho link cũ,
  // không nên là đích của điều hướng chính.
  { label: 'Cây kỹ năng', href: '/learn', icon: BookOpen, feature: 'theories', primary: true },
  { label: 'Ôn tập', href: '/student/practice', icon: PenTool, feature: 'practice', primary: true },
  { label: 'Thi thử', href: '/student/exams', icon: FileText, feature: 'simulation' },
  { label: 'Lịch sử', href: '/student/history', icon: BarChart3, feature: 'history' },
  { label: 'Phân tích', href: '/student/analytics', icon: TrendingUp, feature: 'analytics' },
  { label: 'Cài đặt', href: '/student/settings', icon: Settings, feature: null },
]

/** Số mục tối đa trên bottom nav để không phải cuộn ngang trên máy 360px. */
const MAX_BOTTOM_ITEMS = 4

export default function StudentSidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null)
  const [accessTier, setAccessTier] = useState<string>('basic')
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)

  async function fetchUserInfo() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, access_tier')
        .eq('id', user.id)
        .single()
      
      setUserInfo({
        name: profile?.full_name || 'Học sinh',
        email: user.email || ''
      })
      setAccessTier(profile?.access_tier || 'basic')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true)
      void fetchUserInfo()
      getFeatureFlags().then(setFlags).catch(() => {})
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleItems = menuItems.filter(item =>
    item.feature === null || hasFeatureAccess(accessTier, item.feature, flags)
  )

  // Bottom nav chỉ lấy các mục chính, tối đa 4. Trước đây nó map qua toàn bộ
  // `visibleItems`: 8 mục × 60px = 480px+, tràn khỏi màn hình 360px và thành dải
  // cuộn ngang không có affordance nào cho biết còn mục bên phải.
  // Các mục còn lại vẫn truy cập được qua drawer.
  const bottomItems = visibleItems.filter(item => item.primary).slice(0, MAX_BOTTOM_ITEMS)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) => {
    // `/student` là tiền tố của mọi route học sinh khác nên phải khớp chính xác.
    // `/learn` cũng vậy: `/learn/map` là route riêng.
    if (href === '/student' || href === '/learn') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-40 flex items-center justify-between px-4">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Mở menu"
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
        >
          <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
        <span className="font-semibold text-slate-800 dark:text-white">Luyện Thi THPT</span>
        {/*
          `aria-label` phải TĨNH, không đọc `theme`. Phần icon bên dưới đã được
          `mounted &&` che khỏi lệch hydration, nhưng thuộc tính thì không: trên
          server `theme` luôn là 'light' còn trên client là giá trị thật, nên nhãn
          hai bên khác nhau. Trước 2026-08-07 lỗi này không lộ vì `ThemeProvider`
          chặn SSR toàn bộ children.
        */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Đổi giao diện sáng/tối"
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
            <MinhMathLogo size={36} />
            <div>
              <h1 className="font-bold text-slate-800 dark:text-white text-sm">Luyện Thi THPT</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Toán học</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Đóng menu"
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
        <nav aria-label="Điều hướng học sinh" className="flex-1 p-3 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                aria-current={active ? 'page' : undefined}
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
      <nav
        aria-label="Điều hướng nhanh"
        className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-slate-200 bg-white px-1 dark:border-slate-700 dark:bg-slate-800 lg:hidden"
      >
        {bottomItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`
                flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors
                ${active
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400'
                }
              `}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full truncate text-center text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
        {/* Lối vào phần còn lại của menu. Không có nút này thì các mục ngoài
            bottom nav sẽ không có cách nào mở trên mobile. */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Mở toàn bộ menu"
          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-slate-500 transition-colors dark:text-slate-400"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="w-full truncate text-center text-[10px] font-medium">Thêm</span>
        </button>
      </nav>
    </>
  )
}
