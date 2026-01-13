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
    bg: 'bg-amber-50',
    text: 'text-amber-700'
  },
  reviewed: {
    label: 'Đã xem',
    bg: 'bg-blue-50',
    text: 'text-blue-700'
  },
  resolved: {
    label: 'Đã giải quyết',
    bg: 'bg-green-50',
    text: 'text-green-700'
  }
}

export default function RecentFeedbackList({ feedbacks }: RecentFeedbackListProps) {
  if (feedbacks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Góp ý mới</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500">Chưa có góp ý nào</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Góp ý mới</h3>
        <Link 
          href="/admin/feedback" 
          className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
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
              className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{feedback.studentName}</p>
                    <p className="text-xs text-slate-500">
                      {feedback.examTitle} - Câu {feedback.questionNumber}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-sm text-slate-600 line-clamp-2">{feedback.content}</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
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
