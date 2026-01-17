'use client'

import { Bell, Search, User, ChevronLeft } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import Link from 'next/link'

interface AdminHeaderProps {
  title?: string
  subtitle?: string
}

export default function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  return (
    <header className="h-14 sm:h-16 bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Left: Page Title */}
      <div className="min-w-0 flex-1 pl-10 lg:pl-0">
        {title && (
          <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h1>
        )}
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* Search - hidden on small screens */}
        <div className="relative hidden lg:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            className="w-48 xl:w-64 pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
          <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Admin</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Giáo viên</p>
          </div>
        </div>
      </div>
    </header>
  )
}
