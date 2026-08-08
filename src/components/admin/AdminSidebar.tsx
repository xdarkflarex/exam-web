'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
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
  FileSpreadsheet,
  PenLine,
  Image,
  Globe,
  UserPlus,
  BookOpen,
  FileCode,
  Network,
  Link2,
  FolderInput,
  ShieldCheck,
  Sparkles,
  ChevronDown
} from 'lucide-react'
import MinhMathLogo from '@/components/MinhMathLogo'

/**
 * Menu quản trị, gom nhóm theo việc thay vì một danh sách phẳng 22 dòng.
 *
 * Bối cảnh: một giáo viên duy nhất. Nhóm "Dạy học" là việc hằng ngày nên luôn
 * mở; ba nhóm còn lại thu gọn mặc định vì chỉ chạm tới thỉnh thoảng.
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.6.
 */
interface MenuItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  /** Route con của một mục khác: chỉ sáng khi khớp chính xác tiền tố của chính nó. */
  child?: boolean
}

interface MenuGroup {
  id: string
  label: string
  items: MenuItem[]
  /** Nhóm dùng hằng ngày thì mở sẵn. */
  defaultOpen: boolean
}

/** Mục đứng ngoài mọi nhóm, luôn ở trên cùng. */
const overviewItem: MenuItem = { label: 'Tổng quan', href: '/admin', icon: LayoutDashboard }

const menuGroups: MenuGroup[] = [
  {
    id: 'teaching',
    label: 'Dạy học',
    defaultOpen: true,
    items: [
      { label: 'Đề thi', href: '/admin/exams', icon: FileText },
      { label: 'Câu hỏi', href: '/admin/questions', icon: HelpCircle },
      { label: 'Gom nguồn câu hỏi', href: '/admin/questions/sources', icon: FolderInput, child: true },
      { label: 'Bài tập về nhà', href: '/admin/homework', icon: ClipboardList },
      { label: 'Lý thuyết', href: '/admin/theories', icon: BookOpen },
      { label: 'Liên kết tri thức', href: '/admin/knowledge-links', icon: Link2 },
    ],
  },
  {
    id: 'students',
    label: 'Học sinh',
    defaultOpen: true,
    items: [
      { label: 'Học sinh', href: '/admin/students', icon: Users },
      { label: 'Lớp học', href: '/admin/classes', icon: School },
      { label: 'Thống kê', href: '/admin/analytics', icon: BarChart3 },
      { label: 'Góp ý', href: '/admin/feedback', icon: MessageSquare },
    ],
  },
  {
    id: 'public',
    label: 'Nội dung công khai',
    defaultOpen: false,
    items: [
      { label: 'Landing Page', href: '/admin/landing', icon: Globe },
      { label: 'Bài viết', href: '/admin/posts', icon: PenLine },
      { label: 'Thư viện media', href: '/admin/media', icon: Image },
      { label: 'Thông báo', href: '/admin/announcements', icon: Megaphone },
      { label: 'Đơn đăng ký học', href: '/admin/enrollments', icon: UserPlus },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    defaultOpen: false,
    items: [
      { label: 'Tài khoản', href: '/admin/users', icon: GraduationCap },
      { label: 'Phân quyền', href: '/admin/access', icon: ShieldCheck },
      // Trang vận hành, không phải trang dạy học: nó theo dõi chi phí và tỷ lệ
      // giáo viên phải chấm đè điểm AI, tức là để quyết định có tin worker hay không.
      { label: 'Chấm AI (tự luận)', href: '/admin/essay-ai', icon: Sparkles },
      { label: 'Template LaTeX', href: '/admin/latex-templates', icon: FileCode },
      { label: 'Xuất báo cáo', href: '/admin/reports', icon: FileSpreadsheet },
      { label: 'Cài đặt', href: '/admin/settings', icon: Settings },
    ],
  },
]

/**
 * Các route con phải được liệt kê ở đây để mục cha không sáng cùng lúc với chúng.
 * Trước đây `isActive` dùng `startsWith` cho mọi mục, nên đứng ở
 * `/admin/questions/sources` thì cả "Câu hỏi" lẫn "Gom nguồn câu hỏi" đều sáng.
 */
const childRoutes = menuGroups
  .flatMap((group) => group.items)
  .filter((item) => item.child)
  .map((item) => item.href)

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(menuGroups.map((group) => [group.id, !group.defaultOpen]))
  )

  const isActive = (href: string) => {
    // `/admin` là tiền tố của mọi route admin nên phải khớp chính xác.
    if (href === '/admin') return pathname === '/admin'

    // Mục cha không được sáng khi đang ở route con đã khai báo riêng.
    const shadowed = childRoutes.some(
      (child) => child !== href && child.startsWith(`${href}/`) && pathname.startsWith(child)
    )
    if (shadowed) return false

    return pathname === href || pathname.startsWith(`${href}/`)
  }

  /** Nhóm chứa trang đang mở phải bung ra, dù người dùng đã thu gọn nó. */
  const groupHasActive = (group: MenuGroup) => group.items.some((item) => isActive(item.href))

  const toggleGroup = (id: string) => {
    setCollapsed((current) => ({ ...current, [id]: !current[id] }))
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

  const renderLink = (item: MenuItem) => {
    const Icon = item.icon
    const active = isActive(item.href)

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setMobileOpen(false)}
          aria-current={active ? 'page' : undefined}
          className={`
            relative flex items-center gap-3 rounded-xl py-2.5 pr-3 transition-colors duration-200
            ${item.child ? 'pl-8' : 'pl-3 sm:pl-4'}
            ${active
              ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-medium'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
            }
          `}
        >
          {active && (
            <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-teal-500 dark:bg-teal-400" />
          )}
          <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`} />
          <span className="text-sm">{item.label}</span>
        </Link>
      </li>
    )
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="h-14 sm:h-16 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-slate-300 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <MinhMathLogo size={36} />
          <div>
            <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg">Minh Math</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Quản lý nội dung</p>
          </div>
        </div>
        {/* Close button for mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu"
          className="lg:hidden p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Điều hướng quản trị" className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <ul className="space-y-1">{renderLink(overviewItem)}</ul>

        {menuGroups.map((group) => {
          const hasActive = groupHasActive(group)
          const open = hasActive || !collapsed[group.id]

          return (
            <div key={group.id} className="mt-4">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {group.label}
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
              {open && <ul className="mt-1 space-y-1">{group.items.map(renderLink)}</ul>}
            </div>
          )
        })}
      </nav>

      {/* Xem như học sinh + Đăng xuất */}
      <div className="space-y-1 border-t border-slate-300 p-3 dark:border-slate-700 sm:p-4">
        {/* `/learn` là trang học sinh, không phải màn quản trị — để trong menu
            chính sẽ gây nhầm là một mục quản lý. */}
        <Link
          href="/learn"
          onClick={() => setMobileOpen(false)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:px-4"
        >
          <Network className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">Xem như học sinh</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-900/20 dark:hover:text-red-400 sm:px-4"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">Đăng xuất</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Menu Button - Fixed at top */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Mở menu quản trị"
        aria-expanded={mobileOpen}
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

      {/*
        Một `aside` duy nhất cho cả mobile và desktop.
        Trước đây `sidebarContent` được render hai lần (một cho drawer, một cho
        desktop), nhân đôi toàn bộ link trong DOM và tạo ra id/aria-current trùng.
        Giờ khác biệt chỉ nằm ở cách trình bày: drawer trượt trên mobile,
        cố định trên desktop.
      */}
      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-slate-300 bg-slate-100 transition-transform duration-300 ease-in-out dark:border-slate-700 dark:bg-slate-900
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:z-40 lg:h-screen lg:translate-x-0
        `}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
