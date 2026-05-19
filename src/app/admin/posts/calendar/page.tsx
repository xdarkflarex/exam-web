'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { 
  Calendar, ChevronLeft, ChevronRight, 
  Clock, CheckCircle, AlertCircle, PenLine 
} from 'lucide-react'

interface PostSummary {
  id: string
  title: string
  status: 'draft' | 'review' | 'published'
  published_at: string | null
  created_at: string
}

const MONTHS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const STATUS_DOT = {
  draft: 'bg-slate-400',
  review: 'bg-amber-400',
  published: 'bg-green-400',
}

export default function EditorialCalendarPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const { data } = await supabase
        .from('posts')
        .select('id, title, status, published_at, created_at')
        .order('published_at', { ascending: false })
      if (data) setPosts(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const getPostsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return posts.filter(p => {
      const d = p.published_at || p.created_at
      return d?.startsWith(dateStr)
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <Calendar className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              Lịch biên tập
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Kế hoạch xuất bản bài viết</p>
          </div>
          <Link
            href="/admin/posts"
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm"
          >
            <PenLine className="w-4 h-4" />
            Danh sách bài viết
          </Link>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4 bg-slate-200 dark:bg-slate-800 rounded-xl p-3 border border-slate-300 dark:border-slate-700">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {MONTHS_VI[month]} {year}
            </h2>
            <button
              onClick={goToday}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
            >
              Hôm nay
            </button>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
            <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Nháp</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Chờ duyệt</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Đã xuất bản</span>
        </div>

        {/* Calendar Grid */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-300 dark:border-slate-700">
            {DAYS_VI.map(day => (
              <div key={day} className="p-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {day}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {/* Empty cells for days before first of month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px] p-2 border-b border-r border-slate-300/50 dark:border-slate-700/50 bg-slate-100/50 dark:bg-slate-900/30" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayPosts = getPostsForDay(day)
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

              return (
                <div
                  key={day}
                  className={`min-h-[80px] sm:min-h-[100px] p-2 border-b border-r border-slate-300/50 dark:border-slate-700/50 ${
                    isToday ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                  }`}
                >
                  <span className={`text-xs font-medium ${
                    isToday 
                      ? 'bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center' 
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map(post => (
                      <Link
                        key={post.id}
                        href={`/admin/posts/${post.id}/edit`}
                        className="block"
                      >
                        <div className="flex items-center gap-1 group">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[post.status]}`} />
                          <span className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {post.title}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{dayPosts.length - 3} thêm</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
