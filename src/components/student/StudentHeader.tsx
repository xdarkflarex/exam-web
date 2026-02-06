'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GraduationCap, User, LogOut, Settings, ChevronDown, Trophy, BookOpen, Home, Award, Bookmark, Target } from 'lucide-react'
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

interface StudentHeaderProps {
  title?: string
  minimal?: boolean
}

export default function StudentHeader({ 
  title = 'Luyện Thi THPT', 
  minimal = false 
}: StudentHeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [showMenu, setShowMenu] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-lg border-b border-slate-300/50 dark:border-slate-700/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Title */}
          <button 
            onClick={() => router.push('/student')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-sm">
              <GraduationCap className="w-4.5 h-4.5 text-white" />
            </div>
            {!minimal && (
              <span className="font-semibold text-slate-800 dark:text-slate-100 hidden sm:block">
                {title}
              </span>
            )}
          </button>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link
              href="/student"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Home className="w-4 h-4" />
              Trang chủ
            </Link>
            <Link
              href="/practice"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Luyện tập
            </Link>
            <Link
              href="/leaderboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Trophy className="w-4 h-4" />
              Xếp hạng
            </Link>
            <Link
              href="/badges"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Award className="w-4 h-4" />
              Huy hiệu
            </Link>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            
            {/* Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowMenu(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-lg border border-slate-300 dark:border-slate-700 py-1 z-20">
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        router.push('/bookmarks')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <Bookmark className="w-4 h-4" />
                      Câu hỏi đã lưu
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        router.push('/goals')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <Target className="w-4 h-4" />
                      Mục tiêu
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        router.push('/student/settings')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Cài đặt
                    </button>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
