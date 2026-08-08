/**
 * Danh sách bài tập về nhà được giao.
 *
 * Làm đẹp đợt 2026-08-09 (docs/DESIGN_OVERHAUL_2026-08-09.md). Chỉ đổi phần thị
 * giác: truy vấn, quyền và ngữ nghĩa dữ liệu giữ nguyên từng dòng — `homework` là
 * miền riêng, không dùng chung `exams.exam_mode` (AGENTS.md mục 4).
 *
 * Hai chỗ cố ý KHÔNG vẽ số 0:
 *
 *   - chưa trả lời câu nào → không có độ chính xác để hiện, ô bên phải là vòng
 *     gạch đứt chứ không phải vòng 0%;
 *   - chưa biết bài có bao nhiêu câu (`totalQuestions = 0`, xảy ra khi RPC không
 *     trả metadata) → nói thẳng "chưa rõ số câu" thay vì vẽ thanh tiến độ 0%,
 *     vốn đọc thành "đã giao nhưng chưa làm gì".
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Play,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getStudentHomeworkAssignments } from '@/lib/homework/actions'
import ProgressRing from '@/components/viz/ProgressRing'

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

type ItemState = 'done' | 'overdue' | 'doing' | 'todo'

/** Màu dải cạnh ô. Giá trị CSS thô vì biến `--rail` không nhận tên utility. */
const RAIL: Record<ItemState, string> = {
  done: '#10b981',
  overdue: '#f43f5e',
  doing: '#f59e0b',
  todo: 'var(--border)',
}

export default function StudentHomeworkPage() {
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

  const stateOf = (item: HomeworkItem): ItemState => {
    if (item.status === 'submitted' || item.status === 'graded') return 'done'
    if (item.deadline && new Date(item.deadline).getTime() < now) return 'overdue'
    return item.answeredCount > 0 ? 'doing' : 'todo'
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải bài được giao...</p>
        </div>
      </main>
    )
  }

  const states = items.map(stateOf)
  const doneCount = states.filter(state => state === 'done').length
  const overdueCount = states.filter(state => state === 'overdue').length
  const waitingCount = states.filter(state => state === 'doing' || state === 'todo').length

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
          <div className="paper-grid p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
                  <ClipboardList className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  Bài tập về nhà
                </h1>
                <p className="mt-2 max-w-prose text-slate-600 dark:text-slate-300">
                  Các bài giáo viên đã giao riêng cho bạn.
                </p>
              </div>

              {/* Chip 0 bị loại thay vì hiện "0 quá hạn" mỗi ngày. */}
              <dl className="flex flex-wrap gap-2">
                {overdueCount > 0 && (
                  <SummaryChip
                    value={overdueCount}
                    label="quá hạn"
                    className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
                  />
                )}
                {waitingCount > 0 && (
                  <SummaryChip
                    value={waitingCount}
                    label="đang chờ"
                    className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  />
                )}
                {doneCount > 0 && (
                  <SummaryChip
                    value={doneCount}
                    label="đã nộp"
                    className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  />
                )}
              </dl>
            </div>
          </div>
        </header>

        <div className="space-y-3">
          {items.map(item => (
            <HomeworkCard key={item.assignmentId} item={item} state={stateOf(item)} />
          ))}

          {!items.length && (
            <div className="bento-tile p-12 text-center">
              <ClipboardList className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="font-medium text-slate-700 dark:text-slate-200">Chưa có bài tập nào được giao</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Khi giáo viên giao bài, bài sẽ hiện ở đây và ở trang Hôm nay.
              </p>
              <Link
                href="/student/practice"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
              >
                Tự ôn tập trong lúc chờ
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/** `flex-row-reverse` để `<dt>` đứng trước `<dd>` trong DOM như `<dl>` yêu cầu,
 *  mà số vẫn hiện trước nhãn. */
function SummaryChip({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={`inline-flex flex-row-reverse items-baseline gap-2 rounded-xl border px-3 py-2 ${className}`}>
      <dt className="text-xs font-medium">{label}</dt>
      <dd className="font-baloo text-lg font-bold leading-none tabular-nums">{value}</dd>
    </div>
  )
}

function HomeworkCard({ item, state }: { item: HomeworkItem; state: ItemState }) {
  const done = state === 'done'
  const knownTotal = item.totalQuestions > 0
  const progress = knownTotal ? Math.round((item.answeredCount / item.totalQuestions) * 100) : null
  // Độ chính xác chỉ tồn tại khi đã có câu trả lời. `null` ở đây đi thẳng vào
  // ProgressRing, vốn hiện "Chưa có dữ liệu" thay vì vẽ cung 0%.
  const accuracy = item.answeredCount > 0
    ? Math.round((item.correctCount / item.answeredCount) * 100)
    : null

  return (
    <article className="bento-tile bento-rail p-4 sm:p-5" style={{ '--rail': RAIL[state] } as React.CSSProperties}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-white">{item.title}</h2>
            {/* Trạng thái = màu + icon + chữ. */}
            {done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Đã nộp
              </span>
            )}
            {state === 'overdue' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Quá hạn
              </span>
            )}
            {state === 'doing' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Play className="h-3 w-3" aria-hidden="true" />
                Đang làm dở
              </span>
            )}
          </div>

          {item.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {knownTotal ? `Đã làm ${item.answeredCount}/${item.totalQuestions} câu` : `Đã làm ${item.answeredCount} câu`}
            </span>
            {item.deadline && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                  state === 'overdue'
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {new Date(item.deadline).toLocaleString('vi-VN')}
              </span>
            )}
          </div>

          {progress === null ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Chưa rõ bài này gồm bao nhiêu câu — mở bài để xem đầy đủ.
            </p>
          ) : (
            <div className="mt-3 max-w-sm">
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Đã trả lời ${item.answeredCount} trên ${item.totalQuestions} câu`}
              >
                <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 sm:w-40 sm:shrink-0 sm:flex-col sm:justify-center sm:gap-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
            <ProgressRing
              value={accuracy}
              size={64}
              thickness={6}
              caption="đúng"
              tone={accuracy === null ? 'slate' : accuracy >= 80 ? 'emerald' : accuracy >= 50 ? 'amber' : 'rose'}
              ariaLabel={
                accuracy === null
                  ? 'Chưa trả lời câu nào nên chưa tính được độ chính xác'
                  : `Đúng ${item.correctCount} trên ${item.answeredCount} câu đã trả lời`
              }
            />
            {accuracy !== null && (
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Đúng {item.correctCount}/{item.answeredCount}
              </p>
            )}
          </div>

          <Link
            href={`/homework/prepare/${item.assignmentId}`}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 sm:w-full sm:flex-none"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {done ? 'Xem lại' : item.answeredCount ? 'Làm tiếp' : 'Làm bài'}
          </Link>
        </div>
      </div>
    </article>
  )
}
