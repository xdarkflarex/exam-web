/**
 * Đầu trang dùng chung cho các thẻ của khu học sinh: Bài tập, Ôn tập, Thi thử,
 * Lịch sử, Phân tích, Công cụ, Cài đặt.
 *
 * Trước đây mỗi trang tự chép một khối `bento-tile-lead` + `paper-grid` + `h1`
 * — bảy bản, lệch nhau ở cỡ chữ, ở việc có hay không có icon cạnh tiêu đề, ở
 * khoảng đệm. Cùng lý do đã gộp hai trang danh sách đề về `AssessmentListPage`:
 * cái được dùng chung là KHUNG, còn dữ liệu của trang nào thì trang đó tự tải.
 *
 * Hình thức là TRANG ĐẦU CỦA MỘT CHƯƠNG trong vở Toán: giấy ô li hai cấp, mép
 * thước ở cạnh trên, nhãn nhỏ mở đầu bằng một khúc trục số, tiêu đề Baloo 2, và
 * (tuỳ trang) một ký hiệu toán rất nhạt ở góc. Xem khối "LỚP HỌC TOÁN" trong
 * `globals.css`.
 *
 * KHÔNG `'use client'`, không hook, không truy vấn: chỉ là khung trình bày, nên
 * dùng được từ cả Server lẫn Client Component.
 *
 * Trang không có một hành động nào quan trọng hơn hẳn phần còn lại thì đầu
 * trang KHÔNG mang gradient — suất gradient duy nhất của mỗi trang
 * (DESIGN_OVERHAUL_2026-08-09.md mục 2.3) để dành cho hành động chính.
 */

import type { ComponentType, ReactNode } from 'react'

interface PageHeroProps {
  /** Icon của trang, đặt trong ô teal nhạt bên trái. Ẩn dưới `sm` cho đỡ chật. */
  icon?: ComponentType<{ className?: string }>
  /** Thay cho ô icon: ảnh đại diện, chữ cái đầu… Luôn hiện, kể cả trên điện thoại. */
  media?: ReactNode
  /** Nhãn nhỏ phía trên tiêu đề. */
  kicker?: ReactNode
  title: ReactNode
  /** Đứng cạnh tiêu đề, cùng dòng nếu đủ chỗ (huy hiệu lớp…). */
  badge?: ReactNode
  description?: ReactNode
  /**
   * Ký hiệu toán làm hình nền ở góc phải trên. Thuần trang trí (`aria-hidden`).
   * Đừng dùng khi `aside` là vòng tiến độ: vòng trong suốt ở giữa, ký hiệu sẽ
   * lộ qua lòng vòng và tranh chỗ với con số.
   */
  glyph?: string
  /** Cột phải: chip tóm tắt, vòng tiến độ. */
  aside?: ReactNode
  /** Nội dung nối dưới phần mô tả: đường xu hướng, thanh tab… */
  children?: ReactNode
  className?: string
}

export default function PageHero({
  icon: Icon,
  media,
  kicker,
  title,
  badge,
  description,
  glyph,
  aside,
  children,
  className = 'mb-6',
}: PageHeroProps) {
  return (
    <header className={`animate-dash-in bento-tile-lead paper-grid ruler-edge overflow-hidden ${className}`}>
      {glyph && (
        <span aria-hidden="true" className="glyph-mark right-5 top-1 text-[6rem] sm:text-[7.5rem]">
          {glyph}
        </span>
      )}
      {/* Đệm trên dày hơn ba cạnh còn lại: chừa chỗ cho vạch thước 9px. */}
      <div className="relative flex flex-col gap-5 p-5 pt-8 sm:p-6 sm:pt-9 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {media}
          {!media && Icon && (
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 sm:flex">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {kicker && <p className="kicker">{kicker}</p>}
            <h1 className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-baloo text-3xl font-bold leading-tight text-slate-800 dark:text-white sm:text-4xl">
              {title}
              {badge}
            </h1>
            {description && (
              <p className="mt-2 max-w-prose text-slate-600 dark:text-slate-300">{description}</p>
            )}
            {children}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </header>
  )
}
