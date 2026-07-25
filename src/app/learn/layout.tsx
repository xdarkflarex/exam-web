import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import MinhMathLogo from '@/components/MinhMathLogo'

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="sticky top-0 z-30 border-b border-slate-200/50 bg-white/80 backdrop-blur-lg dark:border-slate-800/50 dark:bg-slate-900/90">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2"><MinhMathLogo size={32} /><span className="hidden text-lg font-bold sm:inline">Minh Math</span></Link>
              <div className="hidden h-6 w-px bg-slate-200 sm:block" />
              <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Trang chủ</span></Link>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium"><BookOpen className="h-4 w-4 text-teal-600" /><span className="hidden sm:inline">Kiến thức</span></div>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
