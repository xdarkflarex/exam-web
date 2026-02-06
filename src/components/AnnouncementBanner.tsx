'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Info, AlertCircle, Sparkles, Bell, X, 
  ChevronLeft, ChevronRight, ExternalLink, Pin
} from 'lucide-react'
import Link from 'next/link'

interface Announcement {
  id: string
  title: string
  content: string | null
  type: 'info' | 'warning' | 'update' | 'new_exam'
  link_url: string | null
  link_text: string | null
  is_pinned: boolean
}

const typeConfig = {
  info: { 
    icon: Info, 
    bg: 'bg-blue-50 dark:bg-blue-950/50', 
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    iconColor: 'text-blue-500'
  },
  warning: { 
    icon: AlertCircle, 
    bg: 'bg-amber-50 dark:bg-amber-950/50', 
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    iconColor: 'text-amber-500'
  },
  update: { 
    icon: Sparkles, 
    bg: 'bg-purple-50 dark:bg-purple-950/50', 
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    iconColor: 'text-purple-500'
  },
  new_exam: { 
    icon: Bell, 
    bg: 'bg-green-50 dark:bg-green-950/50', 
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    iconColor: 'text-green-500'
  }
}

export default function AnnouncementBanner() {
  const supabase = createClient()
  
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnnouncements()
    
    // Load dismissed announcements from localStorage
    const savedDismissed = localStorage.getItem('dismissedAnnouncements')
    if (savedDismissed) {
      try {
        setDismissed(new Set(JSON.parse(savedDismissed)))
      } catch {}
    }
  }, [])

  const fetchAnnouncements = async () => {
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, content, type, link_url, link_text, is_pinned')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5)

      if (!error && data) {
        setAnnouncements(data)
      }
    } catch (err) {
      // Silently fail - announcements are not critical
    } finally {
      setLoading(false)
    }
  }

  const dismiss = (id: string) => {
    const newDismissed = new Set(dismissed)
    newDismissed.add(id)
    setDismissed(newDismissed)
    localStorage.setItem('dismissedAnnouncements', JSON.stringify([...newDismissed]))
  }

  const visibleAnnouncements = announcements.filter(a => !dismissed.has(a.id))

  if (loading || visibleAnnouncements.length === 0) {
    return null
  }

  const current = visibleAnnouncements[currentIndex % visibleAnnouncements.length]
  const config = typeConfig[current.type]
  const TypeIcon = config.icon

  const goNext = () => {
    setCurrentIndex((currentIndex + 1) % visibleAnnouncements.length)
  }

  const goPrev = () => {
    setCurrentIndex((currentIndex - 1 + visibleAnnouncements.length) % visibleAnnouncements.length)
  }

  return (
    <div className={`${config.bg} ${config.border} border-b`}>
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="flex-shrink-0">
            <TypeIcon className={`w-5 h-5 ${config.iconColor}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {current.is_pinned && (
              <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            )}
            <p className={`text-sm font-medium ${config.text} truncate`}>
              {current.title}
              {current.content && (
                <span className="font-normal opacity-80 hidden sm:inline">
                  {' — '}{current.content}
                </span>
              )}
            </p>
          </div>

          {/* Link */}
          {current.link_url && (
            <Link
              href={current.link_url}
              className={`flex-shrink-0 flex items-center gap-1 text-sm font-medium ${config.text} hover:underline`}
            >
              {current.link_text || 'Xem'}
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}

          {/* Navigation */}
          {visibleAnnouncements.length > 1 && (
            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={goPrev}
                className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${config.text}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-xs ${config.text} opacity-60`}>
                {currentIndex + 1}/{visibleAnnouncements.length}
              </span>
              <button
                onClick={goNext}
                className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${config.text}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Dismiss */}
          <button
            onClick={() => dismiss(current.id)}
            className={`flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${config.text} opacity-60 hover:opacity-100`}
            title="Ẩn thông báo này"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
