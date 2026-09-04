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
  /* CÀI ĐẶT KHÔNG NẰM Ở ĐÂY — nó ở cụm tài khoản bên phải, cạnh nút đăng xuất.

     Hai lý do. Thứ nhất là bố cục: thanh ngang bị giới hạn trong `max-w-7xl`
     (1280px), trừ logo và cụm tài khoản thì phần điều hướng chỉ còn khoảng
     740px. Tám mục không vừa, và vì `nav` có `overflow-x-auto` kèm
     `scrollbar-hide` nên mục cuối bị CẮT MẤT MÀ KHÔNG CÓ DẤU HIỆU GÌ — không
     thanh cuộn, không dấu ba chấm. Chủ dự án nhìn thấy đúng chữ "Cài đặt" bị
     cụt còn mỗi cái bánh răng.

     Thứ hai, và quan trọng hơn: cài đặt không cùng loại với bảy mục kia. Bảy
     mục là NƠI HỌC; cài đặt là thao tác trên tài khoản, cùng họ với đổi giao
     diện và đăng xuất. Nó ở nhầm nhóm ngay từ đầu; chật chỗ chỉ là thứ làm lộ
     ra điều đó. */
  { label: 'Hôm nay', href: '/student', icon: Home, feature: null, primary: true },
  { label: 'Bài tập', href: '/student/homework', icon: ClipboardList, feature: 'homework', primary: true },
  // Trỏ thẳng `/learn`. `/learn/map` chỉ là redirect tương thích cho link cũ,
  // không nên là đích của điều hướng chính.
  { label: 'Cây kỹ năng', href: '/learn', icon: BookOpen, feature: 'theories', primary: true },
  { label: 'Ôn tập', href: '/student/practice', icon: PenTool, feature: 'practice', primary: true },
  { label: 'Thi thử', href: '/student/exams', icon: FileText, feature: 'simulation' },
  { label: 'Lịch sử', href: '/student/history', icon: BarChart3, feature: 'history' },
  { label: 'Phân tích', href: '/student/analytics', icon: TrendingUp, feature: 'analytics' },
]

/** Số mục tối đa trên bottom nav để không phải cuộn ngang trên máy 360px. */
const MAX_BOTTOM_ITEMS = 4

export default function StudentSidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
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
          `aria-label` TĨNH, và cả hai icon luôn có trong DOM — CSS quyết định
          cái nào hiện. Bản cũ đọc giá trị `theme` của JS nên phải nuôi state
          `mounted` và `disabled={!mounted}` chỉ để tránh lệch hydration: trên
          server `theme` luôn là 'light', trên client là giá trị thật. Dùng biến
          thể `dark:` thì vấn đề biến mất, và nút bấm được ngay từ lượt vẽ đầu
          thay vì chờ JS chạy xong (DESIGN_TODO.md mục 0 bất biến 4).
        */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Đổi giao diện sáng/tối"
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
        >
          <Sun className="hidden w-5 h-5 text-amber-500 dark:block" aria-hidden="true" />
          <Moon className="w-5 h-5 text-slate-600 dark:hidden" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/*
        THANH NGANG TRÊN CÙNG — CHỈ DESKTOP

        Thay cho thanh dọc 256px bên trái. Lý do đổi (chủ dự án nêu 2026-08-11):
        thanh dọc kiểu bảng quản trị khiến học sinh khó thao tác. Nghiên cứu về
        điều hướng cũng nói cùng hướng — thanh dọc hợp với sản phẩm nhiều tầng
        như SaaS/admin, còn với 3–5 đích chính thì thanh ngang dễ quét mắt hơn.

        Học sinh ở đây chỉ có 8 mục và dùng vài lần mỗi tuần, không phải người
        dùng thành thạo như giáo viên trong trang quản trị. Thanh ngang cũng là
        thứ các em gặp hằng ngày trên mọi website khác.

        Đổi sang ngang còn trả lại toàn bộ 256px chiều ngang cho nội dung — đáng
        kể với bảng lịch sử và biểu đồ phân tích.
      */}
      <header className="fixed inset-x-0 top-0 z-40 hidden h-16 border-b border-slate-200 bg-[var(--background-card)] lg:block dark:border-slate-700">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-6">
          <Link href="/student" className="flex shrink-0 items-center gap-2.5">
            <MinhMathLogo size={32} />
            <span className="font-baloo text-base font-bold text-slate-800 dark:text-white">
              Luyện Thi THPT
            </span>
          </Link>

          {/* Điều hướng chính. `overflow-x-auto` là lưới an toàn cho màn hình
              hẹp bất thường, không phải cách dùng thường ngày. */}
          <nav
            aria-label="Điều hướng học sinh"
            className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {visibleItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            {/*
              Nút đổi giao diện dùng biến thể `dark:` của CSS, KHÔNG đọc giá trị
              `theme` của JS. Bản cũ đọc `theme` nên phải nuôi state `mounted`
              chỉ để tránh lệch hydration — xem DESIGN_TODO.md mục 0 bất biến 4.
              Cả hai icon luôn có trong DOM, CSS quyết định cái nào hiện.
            */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Đổi giao diện sáng/tối"
              className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Sun className="hidden h-5 w-5 text-amber-500 dark:block" aria-hidden="true" />
              <Moon className="h-5 w-5 dark:hidden" aria-hidden="true" />
            </button>

            <span className="mx-1 flex items-center gap-2 rounded-xl bg-slate-100 py-1.5 pl-1.5 pr-3 dark:bg-slate-700/60">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40">
                <User className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden="true" />
              </span>
              {/* Tên là thứ rộng nhất và ít cấp thiết nhất trong cụm này. Dưới
                  `xl` thì giấu chữ, giữ lại avatar — nhường chỗ cho điều hướng,
                  vốn là thứ học sinh thật sự bấm. */}
              <span className="hidden max-w-[9rem] truncate text-sm font-medium text-slate-700 xl:inline dark:text-slate-200">
                {userInfo?.name || 'Đang tải...'}
              </span>
            </span>

            {/* `title` cho chuột, `aria-label` cho trình đọc màn hình. Icon
                trần không có nhãn là mất tên mục với người dùng bàn phím. */}
            <Link
              href="/student/settings"
              aria-label="Cài đặt"
              title="Cài đặt"
              aria-current={isActive('/student/settings') ? 'page' : undefined}
              className={`rounded-xl p-2 transition-colors ${
                isActive('/student/settings')
                  ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
            </Link>

            <button
              onClick={handleLogout}
              aria-label="Đăng xuất"
              className="rounded-xl p-2 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Ngăn kéo — giờ CHỈ dùng cho mobile. Desktop đã có thanh ngang ở trên. */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50
        transform transition-transform duration-300 ease-in-out lg:hidden
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
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
          {/* Cài đặt nằm ở CHÂN ngăn kéo cùng đổi giao diện và đăng xuất, khớp
              với chỗ của nó trên thanh ngang desktop. Nó bị gỡ khỏi danh sách
              điều hướng chính, nên thiếu dòng này là mobile mất luôn đường vào
              trang cài đặt — thanh dưới cùng chỉ chở các mục `primary`. */}
          <Link
            href="/student/settings"
            onClick={() => setIsOpen(false)}
            aria-current={isActive('/student/settings') ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive('/student/settings')
                ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
            Cài đặt
          </Link>

          {/* Theme Toggle */}
          {/* Cả hai nhãn nằm sẵn trong DOM, CSS chọn cái hiện — không đọc `theme`
              của JS. Xem chú thích ở nút cùng loại trên thanh mobile. */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
          >
            <Sun className="hidden w-5 h-5 text-amber-500 dark:block" aria-hidden="true" />
            <Moon className="w-5 h-5 dark:hidden" aria-hidden="true" />
            <span className="dark:hidden">Chế độ tối</span>
            <span className="hidden dark:inline">Chế độ sáng</span>
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
