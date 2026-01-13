'use client'

import { MessageSquare, Clock, ChevronRight, User } from 'lucide-react'
import Link from 'next/link'

interface Feedback {
  id: string
  studentName: string
  examTitle: string
  questionNumber: number
  content: string
  createdAt: string
  status: 'pending' | 'reviewed' | 'resolved'
}

interface RecentFeedbackListProps {
  feedbacks: Feedback[]
}

const statusConfig = {
  pending: {
    label: 'Chờ xử lý',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400'
  },
  reviewed: {
    label: 'Đã xem',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400'
  },
  resolved: {
    label: 'Đã giải quyết',
    bg: 'bg-green-50 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400'
  }
}

export default function RecentFeedbackList({ feedbacks }: RecentFeedbackListProps) {
  if (feedbacks.length === 0) {
    return (
      <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Góp ý mới</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-slate-300 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-slate-500 dark:text-slate-400">Chưa có góp ý nào</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Góp ý mới</h3>
        <Link 
          href="/admin/feedback" 
          className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1"
        >
          Xem tất cả
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      
      <div className="space-y-3">
        {feedbacks.map((feedback) => {
          const status = statusConfig[feedback.status]
          return (
            <div
              key={feedback.id}
              className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{feedback.studentName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {feedback.examTitle} - Câu {feedback.questionNumber}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{feedback.content}</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" />
                {feedback.createdAt}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
