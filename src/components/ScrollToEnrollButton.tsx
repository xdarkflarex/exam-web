'use client'

import { UserPlus } from 'lucide-react'

/**
 * Nút "Đăng ký học thầy Minh" của hero: cuộn xuống form đăng ký học.
 *
 * Không còn prop `variant` — cả hai kiểu hero (ảnh nền và bảng xanh) đều là nền
 * tối nên chỉ còn một bộ màu, xem `HeroActions.tsx`.
 *
 * `text-white` ở đây KHÔNG ra chữ trắng: `globals.css` ghi đè tổ hợp
 * `.bg-amber-500.text-white` thành chữ amber-950, vì trắng trên amber sáng chỉ
 * đạt 2,13:1. Giữ nguyên cặp class để vẫn nằm trong phạm vi quy tắc đó.
 */
export default function ScrollToEnrollButton() {
  const handleClick = () => {
    const el = document.getElementById('enrollment-form')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-8 py-4 font-baloo text-lg font-semibold text-white shadow-lg shadow-black/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-400 active:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60 sm:w-auto"
    >
      <UserPlus className="h-5 w-5" aria-hidden="true" />
      Đăng ký học thầy Minh
    </button>
  )
}
