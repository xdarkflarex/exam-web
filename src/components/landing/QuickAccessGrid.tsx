import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Trophy,
  Newspaper,
  Lock,
} from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import { surfaceClass, type SectionSurface } from './sectionSurface'

/**
 * Lưới truy cập nhanh (lấy ý từ "Quick Access Grid" của bản thiết kế mới).
 *
 * Mọi ô đều trỏ tới route THẬT đang có trong app. `/learn`, `/student/practice`,
 * `/student/analytics`, `/leaderboard` nằm sau auth (xem `src/middleware.ts`):
 * khách chưa đăng nhập sẽ được middleware đẩy sang `/login`. Đây là hành vi có
 * chủ đích, giống nav ở header, nên khi CHƯA đăng nhập thì ô đó có nhãn
 * "Cần đăng nhập". Khi đã đăng nhập, nhãn được bỏ vì không còn đúng nữa
 * (`isAuthenticated` do `src/app/page.tsx` truyền xuống).
 *
 * Lưới KHÔNG còn sáu ô bằng nhau. Sáu lối vào không ngang nhau về tầm quan
 * trọng: "Đề thi thử" là thứ khách vào trang đang đi tìm và là ô duy nhất mở
 * được ngay khi chưa đăng nhập, nên nó là ô dẫn dắt (2×2). Bốn ô giữa là lối
 * vào phụ, xếp ngang cho gọn. "Bài viết" là nội dung đọc thêm nên nằm dưới
 * cùng dưới dạng dải chìm — ba CẤP bề mặt, không phải ba kiểu trang trí.
 *
 * Sáu mục là hằng số trong file này (không phải dữ liệu động), nên lưới được
 * xếp vừa khít sáu ô — không có ô trống ở hàng cuối.
 */
type Span = 'lead' | 'tile' | 'wide'

const ITEMS: readonly {
  label: string
  href: string
  Icon: typeof GraduationCap
  needAuth: boolean
  span: Span
  /** Chỉ ô dẫn dắt và ô dải mới có mô tả; ô nhỏ chỉ cần nhãn. */
  description?: string
}[] = [
  {
    label: 'Đề thi thử',
    href: '/#exams',
    Icon: BookOpen,
    needAuth: false,
    span: 'lead',
    description: 'Đề bám cấu trúc thi tốt nghiệp, chấm ngay sau khi nộp và xem lại từng câu.',
  },
  { label: 'Kiến thức', href: '/learn', Icon: GraduationCap, needAuth: true, span: 'tile' },
  { label: 'Luyện đề', href: '/student/practice', Icon: ClipboardList, needAuth: true, span: 'tile' },
  { label: 'Tiến độ', href: '/student/analytics', Icon: BarChart3, needAuth: true, span: 'tile' },
  { label: 'Bảng xếp hạng', href: '/leaderboard', Icon: Trophy, needAuth: true, span: 'tile' },
  {
    label: 'Bài viết',
    href: '/#posts',
    Icon: Newspaper,
    needAuth: false,
    span: 'wide',
    description: 'Tin tức, hướng dẫn ôn tập và kinh nghiệm phòng thi.',
  },
]

/** Vị trí của từng ô trong lưới. Class viết tường minh để Tailwind quét được. */
const SPAN_CLASS: Record<Span, string> = {
  lead: 'col-span-2 lg:col-span-2 lg:row-span-2',
  tile: 'col-span-1',
  wide: 'col-span-2 lg:col-span-4',
}

interface QuickAccessGridProps {
  title?: string
  subtitle?: string
  /** Có session hay không. Chỉ dùng để ẩn/hiện nhãn "Cần đăng nhập". */
  isAuthenticated?: boolean
  surface?: SectionSurface
}

/** Nhãn "cần đăng nhập" — màu + icon + chữ, không bao giờ chỉ màu. */
function AuthHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
      <Lock className="w-3 h-3" aria-hidden="true" />
      Cần đăng nhập
    </span>
  )
}

export default function QuickAccessGrid({
  title = 'Bắt đầu từ đâu?',
  subtitle = 'Sáu lối vào nhanh cho mọi việc bạn cần làm trên nền tảng.',
  isAuthenticated = false,
  surface = 'plain',
}: QuickAccessGridProps) {
  return (
    <section className={`py-16 ${surfaceClass(surface)}`} aria-label="Truy cập nhanh">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
        </ScrollRevealClient>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {ITEMS.map(({ label, href, Icon, needAuth, span, description }, index) => {
            const showHint = needAuth && !isAuthenticated

            if (span === 'lead') {
              return (
                <ScrollRevealClient key={href} className={SPAN_CLASS.lead}>
                  <Link
                    href={href}
                    className="group bento-tile-lead flex h-full flex-col justify-between gap-6 p-6 sm:p-7"
                  >
                    <span className="w-14 h-14 rounded-2xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                      <Icon className="w-7 h-7 text-white" aria-hidden="true" />
                    </span>
                    <span className="block">
                      <span className="block text-xl sm:text-2xl font-bold font-baloo text-slate-800 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                        {label}
                      </span>
                      {description && (
                        <span className="mt-2 block text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {description}
                        </span>
                      )}
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300">
                        Xem đề thi
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                    </span>
                  </Link>
                </ScrollRevealClient>
              )
            }

            if (span === 'wide') {
              return (
                <ScrollRevealClient key={href} className={SPAN_CLASS.wide} delay={index * 50}>
                  <Link
                    href={href}
                    className="group bento-tile-quiet bento-tile-interactive flex h-full items-center gap-4 px-5 py-4"
                  >
                    <Icon
                      className="w-5 h-5 shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                        {label}
                      </span>
                      {description && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {description}
                        </span>
                      )}
                    </span>
                    {showHint && <AuthHint />}
                    <ArrowRight className="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-teal-600 dark:group-hover:text-teal-400" />
                  </Link>
                </ScrollRevealClient>
              )
            }

            return (
              <ScrollRevealClient key={href} className={SPAN_CLASS.tile} delay={index * 50}>
                <Link
                  href={href}
                  className="group bento-tile flex h-full flex-col gap-2 p-4 sm:p-5"
                >
                  <span className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center transition-colors duration-300 group-hover:bg-teal-600 dark:group-hover:bg-teal-500">
                    <Icon
                      className="w-[18px] h-[18px] text-teal-600 dark:text-teal-400 transition-colors duration-300 group-hover:text-white"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-auto block text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                    {label}
                  </span>
                  {showHint && <AuthHint />}
                </Link>
              </ScrollRevealClient>
            )
          })}
        </div>
      </div>
    </section>
  )
}
