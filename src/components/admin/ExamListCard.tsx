'use client'

import { FileText, Clock, Users, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface ExamListCardProps {
  exam: {
    id: string
    title: string
    questionCount: number
    attemptCount: number
    duration: number
    status: 'active' | 'draft' | 'archived'
    createdAt: string
  }
}

const statusConfig = {
  active: {
    label: 'Đang mở',
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500'
  },
  draft: {
    label: 'Bản nháp',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500'
  },
  archived: {
    label: 'Đã lưu trữ',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    dot: 'bg-slate-400'
  }
}

export default function ExamListCard({ exam }: ExamListCardProps) {
  const status = statusConfig[exam.status]

  return (
    <Link 
      href={`/admin/exams/${exam.id}`}
      className="block bg-white rounded-xl border border-slate-100 p-5 hover:shadow-md hover:border-teal-200 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">
              {exam.title}
            </h3>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {exam.questionCount} câu
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {exam.duration} phút
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {exam.attemptCount} lượt
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text} flex items-center gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
            {status.label}
          </span>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-teal-500 transition-colors" />
        </div>
      </div>
    </Link>
  )
}
