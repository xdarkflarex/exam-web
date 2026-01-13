'use client'

import { useTheme } from '@/contexts/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="
        p-2 rounded-md
        text-slate-600 dark:text-slate-300
        hover:bg-slate-100 dark:hover:bg-slate-700
        transition-colors
      "
    >
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  )
}
