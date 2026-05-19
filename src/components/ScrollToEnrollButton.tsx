'use client'

import { UserPlus } from 'lucide-react'

interface ScrollToEnrollButtonProps {
  variant?: 'hero-slide' | 'hero-plain'
}

export default function ScrollToEnrollButton({ variant = 'hero-plain' }: ScrollToEnrollButtonProps) {
  const handleClick = () => {
    const el = document.getElementById('enrollment-form')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  if (variant === 'hero-slide') {
    return (
      <button
        onClick={handleClick}
        className="w-full sm:w-auto px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-lg shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 font-baloo"
      >
        <UserPlus className="w-5 h-5" />
        Đăng ký học thầy Minh
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="w-full sm:w-auto px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 text-white font-semibold text-lg shadow-lg shadow-amber-500/20 transition-all duration-75 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 font-baloo"
    >
      <UserPlus className="w-5 h-5" />
      Đăng ký học thầy Minh
    </button>
  )
}
