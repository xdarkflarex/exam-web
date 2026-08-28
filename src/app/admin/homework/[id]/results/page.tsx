'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BarChart3, CheckCircle2, Clock3, Loader2, Target, Users } from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface AssignmentRow {
  id: string
  title: string | null
  deadline: string | null
  created_at: string
}

interface AttemptRow {
  id: string
  assignment_id: string
  status: string
  answered_questions: number
  total_questions: number
  correct_answers: number
  score: number | null
  submitted_at: string | null
  profiles: { full_name: string | null; email: string | null }
}

export default function HomeworkResultsPage() {
  const homeworkId = useParams<{ id: string }>().id
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  /** Số câu ở đoạn kiểm tra. 0 = bài tập thường, điểm tính trên toàn bài. */
  const [testQuestionCount, setTestQuestionCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [homeworkRes, assignmentRes, testCountRes] = await Promise.all([
          supabase.from('homeworks').select('title').eq('id', homeworkId).single(),
          supabase
            .from('homework_assignments')
            .select('id, title, deadline, created_at')
            .eq('homework_id', homeworkId)
            .order('created_at', { ascending: false }),
          supabase
            .from('homework_questions')
            .select('question_id', { count: 'exact', head: true })
            .eq('homework_id', homeworkId)
            .eq('phase', 'test'),
        ])
        setTitle(homeworkRes.data?.title || '')
        setTestQuestionCount(testCountRes.count ?? 0)
        const rows = assignmentRes.data || []
        setAssignments(rows)
        if (rows.length) {
          const { data } = await supabase
            .from('homework_attempts')
            .select('id, assignment_id, status, answered_questions, total_questions, correct_answers, score, submitted_at, profiles!student_id(full_name, email)')
            .in('assignment_id', rows.map(row => row.id))
            .order('started_at', { ascending: false })
          setAttempts((data || []) as unknown as AttemptRow[])
        } else {
          setAttempts([])
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [homeworkId, supabase])

  const totals = useMemo(() => {
    const submitted = attempts.filter(isSubmitted).length
    const answered = attempts.reduce((sum, row) => sum + row.answered_questions, 0)
    const totalQuestions = attempts.reduce((sum, row) => sum + row.total_questions, 0)
    const correct = attempts.reduce((sum, row) => sum + row.correct_answers, 0)
    const scoredAttempts = attempts.filter((row) => row.score != null)
    const averageScore = scoredAttempts.length
      ? scoredAttempts.reduce((sum, row) => sum + (row.score || 0), 0) / scoredAttempts.length
      : 0
    return {
      attempts: attempts.length,
      submitted,
      completionRate: attempts.length ? Math.round((submitted / attempts.length) * 100) : 0,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      progress: totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0,
      averageScore,
    }
  }, [attempts])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader title="Kết quả bài tập" subtitle={title} />
      <main className="space-y-6 p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-list-stagger">
              <Metric icon={Users} label="Đã bắt đầu" value={totals.attempts.toString()} note={`${totals.submitted} đã nộp`} />
              <Metric icon={CheckCircle2} label="Hoàn thành" value={`${totals.completionRate}%`} note="Tính trên lượt bắt đầu" />
              <Metric icon={Target} label="Độ chính xác" value={`${totals.accuracy}%`} note="Đúng / đã trả lời" />
              <Metric icon={BarChart3} label="Điểm TB" value={totals.averageScore.toFixed(1)} note={`${totals.progress}% tiến độ câu`} />
            </section>

            {testQuestionCount > 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Bài này có đoạn kiểm tra. <strong>Điểm chỉ tính trên {testQuestionCount} câu của đoạn
                kiểm tra</strong>, còn “Độ chính xác” và cột đúng/sai tính trên toàn bài, kể cả các
                câu luyện. Hai con số lệch nhau là đúng, không phải lỗi.
              </p>
            )}

            {assignments.map(assignment => {
              const rows = attempts.filter(attempt => attempt.assignment_id === assignment.id)
              const submitted = rows.filter(isSubmitted).length
              const completion = rows.length ? Math.round((submitted / rows.length) * 100) : 0
              return (
                <section key={assignment.id} className="animate-fade-in-up rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  <div className="border-b border-slate-100 p-5 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-slate-800 dark:text-white">{assignment.title || title}</h2>
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                          <Clock3 className="h-4 w-4" />
                          {assignment.deadline ? `Hạn ${new Date(assignment.deadline).toLocaleString('vi-VN')}` : 'Không hạn nộp'}
                        </p>
                      </div>
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                        {completion}% hoàn thành
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${completion}%` }} />
                    </div>
                  </div>

                  {!rows.length ? (
                    <p className="p-10 text-center text-sm text-slate-500">Chưa có học sinh bắt đầu.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-slate-500 dark:border-slate-700">
                            <th className="px-5 py-3">Học sinh</th>
                            <th>Trạng thái</th>
                            <th>Tiến độ</th>
                            <th>Đúng</th>
                            <th>Điểm</th>
                          </tr>
                        </thead>
                        <tbody className="animate-list-stagger">
                          {rows.map(row => {
                            const progress = row.total_questions ? Math.round((row.answered_questions / row.total_questions) * 100) : 0
                            return (
                              <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-700">
                                <td className="px-5 py-4">
                                  <p className="font-medium text-slate-800 dark:text-white">{row.profiles?.full_name || row.profiles?.email}</p>
                                  {row.submitted_at && <p className="mt-1 text-xs text-slate-500">{new Date(row.submitted_at).toLocaleString('vi-VN')}</p>}
                                </td>
                                <td>
                                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSubmitted(row) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                                    {isSubmitted(row) ? 'Đã nộp' : 'Đang làm'}
                                  </span>
                                </td>
                                <td className="min-w-36 pr-5">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className="text-xs text-slate-500">{row.answered_questions}/{row.total_questions}</span>
                                  </div>
                                </td>
                                <td>{row.correct_answers}/{Math.max(row.answered_questions, 1)}</td>
                                <td className="font-semibold text-slate-800 dark:text-white">{row.score == null ? '-' : row.score.toFixed(1)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )
            })}

            {!assignments.length && (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                Bài này chưa được giao.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function isSubmitted(row: AttemptRow) {
  return row.status === 'submitted' || row.status === 'graded'
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Users
  label: string
  value: string
  note: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  )
}
