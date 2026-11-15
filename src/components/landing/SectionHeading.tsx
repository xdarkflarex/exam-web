/**
 * Tiêu đề section của trang chủ.
 *
 * Trước đây mỗi section tự chép một khối `text-center mb-12` + `h2` + `p` — mười
 * hai bản, lệch nhau ở `mb-8`/`mb-10`/`mb-12` và ở việc có hay không có nhãn
 * nhỏ phía trên. Gom về một chỗ để nhịp tiêu đề của cả trang là MỘT quyết định.
 *
 * Hình thức lấy từ sách giáo khoa Toán: nhãn nhỏ mở đầu bằng một khúc trục số
 * (`.kicker` trong `globals.css`), tiêu đề bằng Baloo 2, và ngay dưới là một
 * trục số có điểm đánh dấu — thay cho đường gạch trang trí vô nghĩa.
 *
 * KHÔNG `'use client'`, không hook: dùng được cả trong Server Component
 * (`src/app/page.tsx`) lẫn trong các section là Client Component.
 */

interface SectionHeadingProps {
  /** Nhãn nhỏ phía trên tiêu đề. Bỏ trống thì không vẽ. */
  kicker?: string
  title: string
  subtitle?: string
  /** `id` của `<h2>`, để `<section aria-labelledby>` trỏ tới. */
  id?: string
  /** Khoảng cách dưới khối tiêu đề; mặc định khớp với lưới nội dung bên dưới. */
  className?: string
}

/** Vạch chia hai bên điểm đánh dấu, đối xứng qua tâm x = 66. */
const TICKS = [26, 46, 86, 106] as const

export default function SectionHeading({
  kicker,
  title,
  subtitle,
  id,
  className = 'mb-10 sm:mb-12',
}: SectionHeadingProps) {
  return (
    <div className={`text-center ${className}`}>
      {kicker && <p className="kicker mb-3">{kicker}</p>}
      <h2
        id={id}
        className="font-baloo text-3xl font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-4xl"
      >
        {title}
      </h2>
      {/* Trục số: thuần trang trí nên `aria-hidden`. Nét dùng thang slate để
          không tranh màu teal của hành động; chỉ điểm đánh dấu là teal. */}
      <svg
        width="132"
        height="14"
        viewBox="0 0 132 14"
        aria-hidden="true"
        className="mx-auto mt-3 fill-none stroke-slate-400 dark:stroke-slate-500"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7H124" />
        <path d="M119 3l6 4-6 4" />
        {TICKS.map((x) => (
          <path key={x} d={`M${x} 4v6`} />
        ))}
        <circle cx="66" cy="7" r="3.5" className="fill-teal-600 stroke-none dark:fill-teal-400" />
      </svg>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-400">{subtitle}</p>
      )}
    </div>
  )
}
