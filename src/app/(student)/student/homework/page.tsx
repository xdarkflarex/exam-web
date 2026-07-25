'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle, ClipboardList, Loader2, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getStudentHomeworkAssignments } from '@/lib/homework/actions'

interface HomeworkItem {
  assignmentId: string
  title: string
  description: string | null
  deadline: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  status: string | null
}

export default function StudentHomeworkPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<HomeworkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase.from('profiles').select('class_id').eq('id', user.id).single()
        const assignments = await getStudentHomeworkAssignments(user.id, profile?.class_id)
        const assignmentIds = assignments.map(row => row.id)
        const homeworkIds = assignments.map(row => row.homework_id)
        const [questionsRes, attemptsRes] = await Promise.all([
          homeworkIds.length
            ? supabase.rpc('get_my_homework_question_metadata')
            : Promise.resolve({ data: [], error: null }),
          assignmentIds.length
            ? supabase.from('homework_attempts')
                .select('assignment_id, status, answered_questions, correct_answers')
                .eq('student_id', user.id)
                .in('assignment_id', assignmentIds)
            : Promise.resolve({ data: [], error: null }),
        ])
        const totals = new Map<string, number>()
        for (const row of questionsRes.data || []) totals.set(row.homework_id, (totals.get(row.homework_id) || 0) + 1)
        const attempts = new Map((attemptsRes.data || []).map(row => [row.assignment_id, row]))
        setItems(assignments.map(row => {
          const homework = row.homeworks as unknown as { title: string; description: string | null }
          const attempt = attempts.get(row.id)
          return {
            assignmentId: row.id,
            title: row.title || homework.title,
            description: homework.description,
            deadline: row.deadline,
            totalQuestions: totals.get(row.homework_id) || 0,
            answeredCount: attempt?.answered_questions || 0,
            correctCount: attempt?.correct_answers || 0,
            status: attempt?.status || null,
          }
        }))
      } catch (error) {
        console.error('Load homework assignments:', error)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [supabase])

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white">
          <ClipboardList className="h-7 w-7 text-teal-600" /> Bài tập về nhà
        </h1>
        <p className="mb-6 text-slate-500">Các bài giáo viên đã giao riêng cho bạn</p>
        <div className="space-y-3">
          {items.map(item => {
            const done = item.status === 'submitted' || item.status === 'graded'
            const overdue = Boolean(item.deadline && new Date(item.deadline).getTime() < now && !done)
            const progress = item.totalQuestions ? Math.round(item.answeredCount / item.totalQuestions * 100) : 0
            return (
              <article key={item.assignmentId} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-800 dark:text-white">{item.title}</h2>
                      {done && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"><CheckCircle className="h-3 w-3" />Đã nộp</span>}
                      {overdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700"><AlertTriangle className="h-3 w-3" />Quá hạn</span>}
                    </div>
                    {item.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>Đã làm {item.answeredCount}/{item.totalQuestions} câu</span>
                      {item.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" />{new Date(item.deadline).toLocaleString('vi-VN')}</span>}
                      {item.answeredCount > 0 && <span className="font-medium text-teal-600">Đúng {item.correctCount}/{item.answeredCount}</span>}
                    </div>
                    <div className="mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/homework/prepare/${item.assignmentId}`)}
                    className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700"
                  >
                    <Play className="h-4 w-4" />
                    <span className="hidden sm:inline">{done ? 'Xem lại' : item.answeredCount ? 'Làm tiếp' : 'Làm bài'}</span>
                  </button>
                </div>
              </article>
            )
          })}
          {!items.length && <div className="rounded-xl border bg-white p-12 text-center text-slate-500 dark:bg-slate-800">Chưa có bài tập nào được giao.</div>}
        </div>
      </div>
    </main>
  )
}
