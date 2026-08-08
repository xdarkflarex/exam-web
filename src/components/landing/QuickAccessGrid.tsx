import Link from 'next/link'
import {
  BookOpen,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Trophy,
  Newspaper,
} from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'

/**
 * Lưới truy cập nhanh (lấy ý từ "Quick Access Grid" của bản thiết kế mới).
 *
 * Mọi ô đều trỏ tới route THẬT đang có trong app. `/learn`, `/student/practice`,
 * `/student/analytics`, `/leaderboard` nằm sau auth (xem `src/middleware.ts`):
 * khách chưa đăng nhập sẽ được middleware đẩy sang `/login`. Đây là hành vi có
 * chủ đích, giống nav ở header, nên khi CHƯA đăng nhập thì ô đó có nhãn
 * "Cần đăng nhập". Khi đã đăng nhập, nhãn được bỏ vì không còn đúng nữa
 * (`isAuthenticated` do `src/app/page.tsx` truyền xuống).
 */
const ITEMS = [
  { label: 'Kiến thức', href: '/learn', Icon: GraduationCap, needAuth: true },
  { label: 'Luyện đề', href: '/student/practice', Icon: ClipboardList, needAuth: true },
  { label: 'Đề thi thử', href: '/#exams', Icon: BookOpen, needAuth: false },
  { label: 'Tiến độ', href: '/student/analytics', Icon: BarChart3, needAuth: true },
  { label: 'Bảng xếp hạng', href: '/leaderboard', Icon: Trophy, needAuth: true },
  { label: 'Bài viết', href: '/#posts', Icon: Newspaper, needAuth: false },
] as const

interface QuickAccessGridProps {
  title?: string
  subtitle?: string
  /** Có session hay không. Chỉ dùng để ẩn/hiện nhãn "Cần đăng nhập". */
  isAuthenticated?: boolean
}

export default function QuickAccessGrid({
  title = 'Bắt đầu từ đâu?',
  subtitle = 'Sáu lối vào nhanh cho mọi việc bạn cần làm trên nền tảng.',
  isAuthenticated = false,
}: QuickAccessGridProps) {
  return (
    <section className="py-16" aria-label="Truy cập nhanh">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
        </ScrollRevealClient>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5">
          {ITEMS.map(({ label, href, Icon, needAuth }, index) => (
            <ScrollRevealClient key={href} delay={index * 60}>
              <Link
                href={href}
                className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-5 text-center bento-hover hover:border-teal-500/50 dark:hover:border-teal-400/50"
              >
                <span className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center transition-all duration-300 group-hover:bg-teal-600 dark:group-hover:bg-teal-500 group-hover:scale-110">
                  <Icon className="w-6 h-6 text-teal-600 dark:text-teal-400 transition-colors duration-300 group-hover:text-white" />
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                  {label}
                </span>
                {needAuth && !isAuthenticated && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cần đăng nhập
                  </span>
                )}
              </Link>
            </ScrollRevealClient>
          ))}
        </div>
      </div>
    </section>
  )
}
