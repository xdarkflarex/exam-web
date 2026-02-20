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
      <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Đề thi gần đây</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-slate-300 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-slate-500 dark:text-slate-400">Chưa có đề thi nào</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Đề thi gần đây</h3>
        <Link 
          href="/admin/exams" 
          className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1"
        >
          Xem tất cả
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      
      <div className="space-y-3 animate-list-stagger">
        {exams.map((exam) => (
          <Link
            key={exam.id}
            href={`/admin/exams/${exam.id}`}
            className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
          >
            <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 dark:text-slate-100 truncate group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                {exam.title}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>{exam.questionCount} câu hỏi</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {exam.createdAt}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  )
}
