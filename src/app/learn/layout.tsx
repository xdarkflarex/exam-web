'use client'

import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import MinhMathLogo from '@/components/MinhMathLogo'

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Navigation */}
      <nav className="bg-white/80 dark:bg-slate-900/90 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left: Logo + Back */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-2 group"
              >
                <MinhMathLogo size={32} />
                <span className="text-lg font-bold text-slate-800 dark:text-slate-100 font-baloo hidden sm:inline">
                  Minh Math
                </span>
              </Link>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 hidden sm:block" />
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Trang chủ</span>
              </Link>
            </div>

            {/* Center: Page indicator */}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span className="hidden sm:inline">Kiến thức</span>
            </div>

            {/* Right: Theme toggle */}
            <div className="flex items-center">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
