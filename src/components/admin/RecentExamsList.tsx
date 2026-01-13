'use client'

import { FileText, Clock, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface RecentExam {
  id: string
  title: string
  questionCount: number
  createdAt: string
}

interface RecentExamsListProps {
  exams: RecentExam[]
}

export default function RecentExamsList({ exams }: RecentExamsListProps) {
  if (exams.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Đề thi gần đây</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500">Chưa có đề thi nào</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Đề thi gần đây</h3>
        <Link 
          href="/admin/exams" 
          className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
        >
          Xem tất cả
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      
      <div className="space-y-3">
        {exams.map((exam) => (
          <Link
            key={exam.id}
            href={`/admin/exams/${exam.id}`}
            className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
          >
            <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 truncate group-hover:text-teal-700 transition-colors">
                {exam.title}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span>{exam.questionCount} câu hỏi</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {exam.createdAt}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  )
}
