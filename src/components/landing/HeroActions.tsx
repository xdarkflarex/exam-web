import Link from 'next/link'
import { ArrowRight, LayoutDashboard, LogIn, Sparkles } from 'lucide-react'
import ScrollToEnrollButton from '@/components/ScrollToEnrollButton'

/**
 * Nhóm nút hành động của hero.
 *
 * Tách ra khỏi `src/app/page.tsx` vì hero có HAI biến thể (có ảnh nền và không),
 * và logic dưới đây phải giống hệt nhau ở cả hai. Trước đây nó bị chép hai lần
 * nên hai bên lệch nhau lúc nào không biết.
 *
 * Hero biết người dùng đã đăng nhập hay chưa: `page.tsx` truyền `isAuthenticated`
 * xuống, nên học sinh đang có session không bị mời làm lại đúng việc vừa xong.
 *
 * VỀ ĐỘ NỔI CỦA BA NÚT (đổi 2026-09-03 theo yêu cầu chủ dự án). Bản trước hạ
 * "Đăng nhập" và "Bắt đầu ngay" xuống link chữ mờ để dồn toàn bộ chú ý cho nút
 * đăng ký học. Trên máy thật thì nó mờ tới mức học sinh cũ không tìm thấy chỗ
 * đăng nhập — mà học sinh cũ mới là người vào trang này nhiều nhất. Giờ cả ba
 * là nút thật, cùng một hàng, cùng cỡ chạm; thứ bậc giữ bằng MÀU chứ không bằng
 * độ mờ:
 *
 *   1. Đăng ký học  — amber đặc, hành động mang lại học sinh mới cho lớp;
 *   2. Đăng nhập    — teal đặc, đường về của học sinh đang học;
 *   3. Bắt đầu ngay — viền, tạo tài khoản miễn phí.
 *
 * Ba nút cùng nổi thì không còn nút nào nổi, nên đừng tô đặc nốt nút thứ ba.
 */
interface HeroActionsProps {
  isAuthenticated: boolean
  /** Nhãn do admin cấu hình, chỉ dùng ở nhánh chưa đăng nhập. */
  ctaPrimary: string
  ctaSecondary: string
  /** `slide` là hero có ảnh nền — chữ luôn trắng, không theo token. */
  variant: 'slide' | 'plain'
}

/** Cỡ và hình dáng dùng chung cho cả ba nút, để hàng nút không so le. */
const BUTTON_BASE =
  'group inline-flex w-full items-center justify-center gap-2 rounded-xl px-7 py-4 text-lg font-semibold ' +
  'transition-all duration-200 hover:scale-105 active:scale-95 font-baloo sm:w-auto'

export default function HeroActions({
  isAuthenticated,
  ctaPrimary,
  ctaSecondary,
  variant,
}: HeroActionsProps) {
  const onImage = variant === 'slide'

  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Link
          href="/student"
          className={`${BUTTON_BASE} bg-teal-600 text-white shadow-lg shadow-teal-600/20 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400`}
        >
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          Vào học tiếp
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link
          href="#exams"
          className={`text-base font-semibold underline-offset-4 transition-colors hover:underline ${
            onImage
              ? 'text-white/90 hover:text-white'
              : 'text-slate-600 hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300'
          }`}
        >
          Xem đề thi có sẵn
        </Link>
      </div>
    )
  }

  /* Nút thứ ba dùng viền. Trên ảnh nền thì viền trắng + nền kính mờ mới đọc
     được; trên nền thường thì viền teal trên nền trang. */
  const outlined = onImage
    ? 'border-2 border-white/80 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'
    : 'border-2 border-teal-600 bg-white/80 text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:bg-slate-900/60 dark:text-teal-300 dark:hover:bg-slate-800'

  return (
    <div className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4">
      <ScrollToEnrollButton variant={onImage ? 'hero-slide' : 'hero-plain'} />

      <Link
        href="/login"
        className={`${BUTTON_BASE} bg-teal-600 text-white shadow-lg shadow-teal-600/25 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400`}
      >
        <LogIn className="h-5 w-5" aria-hidden="true" />
        {ctaPrimary}
      </Link>

      <Link href="/signup" className={`${BUTTON_BASE} ${outlined}`}>
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        {ctaSecondary}
      </Link>
    </div>
  )
}
