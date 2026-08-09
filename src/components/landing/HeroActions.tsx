import Link from 'next/link'
import { ArrowRight, LayoutDashboard } from 'lucide-react'
import ScrollToEnrollButton from '@/components/ScrollToEnrollButton'

/**
 * Nhóm nút hành động của hero.
 *
 * Tách ra khỏi `src/app/page.tsx` vì hero có HAI biến thể (có ảnh nền và không),
 * và logic dưới đây phải giống hệt nhau ở cả hai. Trước đây nó bị chép hai lần
 * nên hai bên lệch nhau lúc nào không biết.
 *
 * Hai vấn đề được sửa ở đây:
 *
 * 1. **Hero không biết người dùng đã đăng nhập.** `page.tsx` đã tính
 *    `isAuthenticated` và dùng cho link card đề, nhưng hero vẫn hardcode
 *    `/login` và `/signup`. Học sinh đang có session vào trang chủ bị mời làm
 *    đúng việc họ vừa làm xong.
 *
 * 2. **Ba nút ngang sức.** "Đăng nhập" / "Bắt đầu ngay" / "Đăng ký học" cùng cỡ,
 *    cùng độ nổi, nên người vào lần đầu không biết bấm gì. Giờ mỗi trạng thái
 *    chỉ có MỘT nút đặc; phần còn lại hạ xuống link chữ.
 *
 * Thứ tự ưu tiên khi CHƯA đăng nhập bám theo mục tiêu thật của lớp học thêm:
 * đăng ký học (form tuyển sinh) là hành động đáng tiền nhất, tạo tài khoản
 * miễn phí chỉ là bước phụ, đăng nhập là đường dành cho người đã quen.
 */
interface HeroActionsProps {
  isAuthenticated: boolean
  /** Nhãn do admin cấu hình, chỉ dùng ở nhánh chưa đăng nhập. */
  ctaPrimary: string
  ctaSecondary: string
  /** `slide` là hero có ảnh nền — chữ luôn trắng, không theo token. */
  variant: 'slide' | 'plain'
}

export default function HeroActions({
  isAuthenticated,
  ctaPrimary,
  ctaSecondary,
  variant,
}: HeroActionsProps) {
  const onImage = variant === 'slide'

  // Link phụ trên ảnh nền phải luôn trắng; trên nền thường thì bám token.
  const quietLink = onImage
    ? 'text-white/90 hover:text-white'
    : 'text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300'

  if (isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Link
          href="/student"
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-teal-600/20 transition-all duration-200 hover:scale-105 hover:bg-teal-700 active:scale-95 dark:bg-teal-500 dark:hover:bg-teal-400 sm:w-auto font-baloo"
        >
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          Vào học tiếp
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link
          href="#exams"
          className={`text-base font-semibold underline-offset-4 transition-colors hover:underline ${quietLink}`}
        >
          Xem đề thi có sẵn
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* MỘT nút đặc duy nhất: đăng ký học. Đây là hành động mang lại học sinh
          thật cho lớp, nên nó được toàn bộ ngân sách thị giác của hero. */}
      <ScrollToEnrollButton variant={onImage ? 'hero-slide' : 'hero-plain'} />

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-base">
        <Link
          href="/login"
          className={`font-semibold underline-offset-4 transition-colors hover:underline ${quietLink}`}
        >
          {ctaPrimary}
        </Link>
        <span className={onImage ? 'text-white/40' : 'text-slate-400 dark:text-slate-600'} aria-hidden="true">
          •
        </span>
        <Link
          href="/signup"
          className={`font-semibold underline-offset-4 transition-colors hover:underline ${quietLink}`}
        >
          {ctaSecondary}
        </Link>
      </div>
    </div>
  )
}
