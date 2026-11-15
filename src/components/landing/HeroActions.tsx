import Link from 'next/link'
import { ArrowRight, LayoutDashboard, LogIn, Sparkles } from 'lucide-react'
import ScrollToEnrollButton from '@/components/ScrollToEnrollButton'

/**
 * Nhóm nút hành động của hero.
 *
 * Tách ra khỏi `src/app/page.tsx` vì hero có HAI biến thể (có ảnh nền và bảng
 * xanh), và logic dưới đây phải giống hệt nhau ở cả hai. Trước đây nó bị chép
 * hai lần nên hai bên lệch nhau lúc nào không biết.
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
 *
 * KHÔNG CÒN PROP `variant` (2026-11-15). Hero không ảnh giờ là bảng xanh, tức
 * cả hai biến thể đều là NỀN TỐI — ảnh có lớp phủ đen, bảng thì xanh sẫm. Hai
 * bộ màu trước đây vì thế thành một: nút teal dùng tông SÁNG với chữ tối
 * (teal-300 trên bảng `--mm-board` đạt ~7,5:1 so với nền, chữ teal-950 trên nút
 * ~9:1), thay cho teal-600 chữ trắng vốn chìm hẳn vào mặt bảng cùng sắc.
 */
interface HeroActionsProps {
  isAuthenticated: boolean
  /** Nhãn do admin cấu hình, chỉ dùng ở nhánh chưa đăng nhập. */
  ctaPrimary: string
  ctaSecondary: string
}

/** Cỡ và hình dáng dùng chung cho cả ba nút, để hàng nút không so le. */
const BUTTON_BASE =
  'group inline-flex w-full items-center justify-center gap-2 rounded-2xl px-7 py-4 text-lg font-semibold ' +
  'transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 font-baloo sm:w-auto ' +
  'focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60'

/** Nút teal trên nền tối: tông sáng, chữ tối. */
const SOLID_TEAL = 'bg-teal-300 text-teal-950 shadow-lg shadow-black/25 hover:bg-teal-200'

export default function HeroActions({
  isAuthenticated,
  ctaPrimary,
  ctaSecondary,
}: HeroActionsProps) {
  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Link href="/student" className={`${BUTTON_BASE} ${SOLID_TEAL}`}>
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          Vào học tiếp
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link
          href="#exams"
          className="rounded text-base font-semibold text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          Xem đề thi có sẵn
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4">
      <ScrollToEnrollButton />

      <Link href="/login" className={`${BUTTON_BASE} ${SOLID_TEAL}`}>
        <LogIn className="h-5 w-5" aria-hidden="true" />
        {ctaPrimary}
      </Link>

      {/* Nút thứ ba dùng viền: viền phấn trắng + nền kính mờ, đọc được cả trên
          ảnh lẫn trên bảng. */}
      <Link
        href="/signup"
        className={`${BUTTON_BASE} border-2 border-white/75 bg-white/10 text-white hover:bg-white/20`}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        {ctaSecondary}
      </Link>
    </div>
  )
}
