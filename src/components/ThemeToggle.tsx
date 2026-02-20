'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="
        relative p-2 rounded-xl
        text-slate-600 dark:text-slate-300
        hover:bg-slate-200/80 dark:hover:bg-slate-700/80
        transition-all duration-200
        active:scale-90
      "
    >
      <div className="relative w-5 h-5">
        <Sun className={`w-5 h-5 absolute inset-0 transition-all duration-300 ${
          theme === 'dark' 
            ? 'opacity-0 rotate-90 scale-0' 
            : 'opacity-100 rotate-0 scale-100 text-amber-500'
        }`} />
        <Moon className={`w-5 h-5 absolute inset-0 transition-all duration-300 ${
          theme === 'dark' 
            ? 'opacity-100 rotate-0 scale-100 text-blue-400' 
            : 'opacity-0 -rotate-90 scale-0'
        }`} />
      </div>
    </button>
  )
}
