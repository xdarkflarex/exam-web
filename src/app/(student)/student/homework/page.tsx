'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardList, Play, CheckCircle, Loader2, CalendarClock, AlertTriangle
} from 'lucide-react'

interface HomeworkItem {
  examId: string
  title: string
  description: string | null
  deadline: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  done: boolean
}

function formatDeadline(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso))
}

export default function StudentHomeworkPage() {
  const router = useRouter()
  const supabase = createClient()
  const [items, setItems] = useState<HomeworkItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles').select('class_id').eq('id', user.id).single()
      const classId = profile?.class_id || null

      // Lấy các assignment cho HS này (theo lớp hoặc cá nhân)
      const orFilter = classId
        ? `student_id.eq.${user.id},class_id.eq.${classId}`
        : `student_id.eq.${user.id}`
      const { data: assignments } = await supabase
        .from('exam_assignments')
        .select('exam_id')
        .or(orFilter)

      const examIds = [...new Set((assignments || []).map(a => a.exam_id))]
      if (examIds.length === 0) { setItems([]); return }

      const { data: exams } = await supabase
        .from('exams')
        .select('id, title, description, end_time, is_published')
        .in('id', examIds)
        .eq('is_published', true)

      const publishedIds = (exams || []).map(e => e.id)
      if (publishedIds.length === 0) { setItems([]); return }

      // Tổng số câu mỗi bài
      const { data: examQuestions } = await supabase
        .from('exam_questions')
        .select('exam_id')
        .in('exam_id', publishedIds)
      const totalByExam: Record<string, number> = {}
      for (const eq of examQuestions || []) {
        totalByExam[eq.exam_id] = (totalByExam[eq.exam_id] || 0) + 1
      }

      // Attempt bài tập về nhà của HS
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('id, exam_id')
        .eq('student_id', user.id)
        .in('exam_id', publishedIds)
      const attemptByExam: Record<string, string> = {}
      for (const a of attempts || []) {
        if (!attemptByExam[a.exam_id]) attemptByExam[a.exam_id] = a.id
      }

      // Tiến độ từ student_answers (câu đã xem đáp án)
      const attemptIds = Object.values(attemptByExam)
      const progressByAttempt: Record<string, { answered: number; correct: number }> = {}
      if (attemptIds.length > 0) {
        const { data: answers } = await supabase
          .from('student_answers')
          .select('attempt_id, is_correct, shown_feedback')
          .in('attempt_id', attemptIds)
        for (const sa of answers || []) {
          if (!sa.shown_feedback) continue
          const p = (progressByAttempt[sa.attempt_id] ||= { answered: 0, correct: 0 })
          p.answered++
          if (sa.is_correct) p.correct++
        }
      }

      const result: HomeworkItem[] = (exams || []).map(e => {
        const total = totalByExam[e.id] || 0
        const attemptId = attemptByExam[e.id]
        const prog = attemptId ? progressByAttempt[attemptId] : undefined
        const answered = prog?.answered || 0
        return {
          examId: e.id,
          title: e.title,
          description: e.description,
          deadline: e.end_time,
          totalQuestions: total,
          answeredCount: answered,
          correctCount: prog?.correct || 0,
          done: total > 0 && answered >= total,
        }
      })

      // Sắp xếp: chưa làm trước, theo deadline gần nhất
      result.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
        return da - db
      })

      setItems(result)
    } catch (err) {
      console.error('load homework', err)
    } finally {
      setLoading(false)
    }
  }

  const now = Date.now()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Bài tập về nhà
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Các bài tập được giáo viên giao cho bạn</p>
        </div>

        {items.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Hiện chưa có bài tập nào được giao.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const overdue = !!item.deadline && new Date(item.deadline).getTime() < now
              return (
                <div key={item.examId} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-slate-800 dark:text-white truncate">{item.title}</h3>
                        {item.done && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                            <CheckCircle className="w-3 h-3" /> Đã nộp
                          </span>
                        )}
                        {!item.done && overdue && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Quá hạn
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{item.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" />Đã làm {item.answeredCount}/{item.totalQuestions} câu</span>
                        {item.deadline && (
                          <span className={`flex items-center gap-1 ${overdue ? 'text-red-500' : ''}`}>
                            <CalendarClock className="w-4 h-4" /> Hạn: {formatDeadline(item.deadline)}
                          </span>
                        )}
                        {item.answeredCount > 0 && (
                          <span className="text-teal-600 dark:text-teal-400 font-medium">Đúng {item.correctCount}/{item.answeredCount}</span>
                        )}
                      </div>
                      {item.totalQuestions > 0 && (
                        <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden max-w-xs">
                          <div className="h-full bg-teal-500 transition-all" style={{ width: `${(item.answeredCount / item.totalQuestions) * 100}%` }} />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => router.push(`/homework/prepare/${item.examId}`)}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-medium transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span className="hidden sm:inline">{item.done ? 'Xem lại' : item.answeredCount > 0 ? 'Làm tiếp' : 'Làm bài'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
