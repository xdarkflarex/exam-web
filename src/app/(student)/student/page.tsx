'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  MessageSquareText,
  PenTool,
  Play,
  RefreshCcw,
  Timer,
} from 'lucide-react'
import { getFeatureFlags, hasFeatureAccess } from '@/lib/auth/access'
import { createClient } from '@/lib/supabase/client'
import { getStudentHomeworkAssignments } from '@/lib/homework/actions'

interface Exam {
  id: string
  title: string
  subject: string
  duration: number
  startTime: string | null
  endTime: string | null
}

interface RecentAttempt {
  id: string
  examTitle: string
  examMode: 'simulation' | 'practice'
  submitTime: string | null
  pendingReview: boolean
}

interface InProgressAttempt {
  id: string
  examId: string
  examTitle: string
  startTime: string
  endTime: string | null
  examMode: 'simulation' | 'practice'
}

interface HomeworkTask {
  assignmentId: string
  title: string
  deadline: string | null
  totalQuestions: number
  answeredCount: number
  status: string | null
}

interface HomeworkAttemptRow {
  assignment_id: string
  status: string | null
  answered_questions: number | null
  total_questions: number | null
}

interface TodayFeatureAccess {
  simulation: boolean
  practice: boolean
  homework: boolean
  history: boolean
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'object' && value[0] !== null
      ? value[0] as Record<string, unknown>
      : null
  }

  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
}

function relationString(value: unknown, key: string, fallback = ''): string {
  const record = relationRecord(value)
  return typeof record?.[key] === 'string' ? record[key] : fallback
}

function relationBoolean(value: unknown, key: string, fallback = false): boolean {
  const record = relationRecord(value)
  return typeof record?.[key] === 'boolean' ? record[key] : fallback
}

function relationNumber(value: unknown, key: string, fallback = 0): number {
  const record = relationRecord(value)
  const parsed = Number(record?.[key])
  return Number.isFinite(parsed) ? parsed : fallback
}

function isFinished(status: string | null): boolean {
  return status === 'submitted' || status === 'graded'
}

function isPastDeadline(deadline: string | null, now: number): boolean {
  if (!deadline) return false
  const timestamp = new Date(deadline).getTime()
  return Number.isFinite(timestamp) && timestamp < now
}

function getAttemptDeadline(
  startTime: string,
  examEndTime: string | null,
  durationMinutes: number
): string | null {
  const candidates: number[] = []
  if (examEndTime) {
    const examEnd = new Date(examEndTime).getTime()
    if (Number.isFinite(examEnd)) candidates.push(examEnd)
  }
  if (durationMinutes > 0) {
    const startedAt = new Date(startTime).getTime()
    if (Number.isFinite(startedAt)) {
      candidates.push(startedAt + durationMinutes * 60_000)
    }
  }
  return candidates.length > 0 ? new Date(Math.min(...candidates)).toISOString() : null
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function StudentPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [userName, setUserName] = useState('Học sinh')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [availableExams, setAvailableExams] = useState<Exam[]>([])
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([])
  const [inProgressAttempts, setInProgressAttempts] = useState<InProgressAttempt[]>([])
  const [homeworkTasks, setHomeworkTasks] = useState<HomeworkTask[]>([])
  const [featureAccess, setFeatureAccess] = useState<TodayFeatureAccess>({
    simulation: false,
    practice: false,
    homework: false,
    history: false,
  })
  const [now, setNow] = useState(() => Date.now())

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWarning(null)
    setAvailableExams([])
    setRecentAttempts([])
    setInProgressAttempts([])
    setHomeworkTasks([])

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) {
        router.replace('/login')
        return
      }

      const [profileResult, flags] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, grade, class_id, access_tier')
          .eq('id', user.id)
          .single(),
        getFeatureFlags(),
      ])
      const { data: profile, error: profileError } = profileResult

      if (profileError) throw profileError

      setUserName(profile?.full_name || 'Học sinh')
      const studentGrade = profile?.grade || null
      const snapshotNow = Date.now()
      const access: TodayFeatureAccess = {
        simulation: hasFeatureAccess(
          profile?.access_tier,
          'simulation',
          flags
        ),
        practice: hasFeatureAccess(profile?.access_tier, 'practice', flags),
        homework: hasFeatureAccess(profile?.access_tier, 'homework', flags),
        history: hasFeatureAccess(profile?.access_tier, 'history', flags),
      }
      setFeatureAccess(access)
      setNow(snapshotNow)

      const loadAvailableExams = async () => {
        if (!access.simulation) {
          setAvailableExams([])
          return
        }
        const snapshotIso = new Date(snapshotNow).toISOString()
        let query = supabase
          .from('exams')
          .select('id, title, subject, duration, start_time, end_time')
          .eq('is_published', true)
          .eq('exam_mode', 'simulation')
          .or(`start_time.is.null,start_time.lte.${snapshotIso}`)
          .or(`end_time.is.null,end_time.gte.${snapshotIso}`)
          .order('end_time', { ascending: true, nullsFirst: false })
          .limit(12)

        if (studentGrade) {
          query = query.eq('grade', studentGrade)
        }

        const { data, error: examsError } = await query
        if (examsError) throw examsError

        const visible = (data || [])
          .filter((exam) => {
            const startsAt = exam.start_time ? new Date(exam.start_time).getTime() : null
            const endsAt = exam.end_time ? new Date(exam.end_time).getTime() : null
            return (!startsAt || startsAt <= snapshotNow) && (!endsAt || endsAt >= snapshotNow)
          })
          .slice(0, 3)
          .map((exam) => ({
            id: exam.id,
            title: exam.title,
            subject: exam.subject,
            duration: exam.duration,
            startTime: exam.start_time,
            endTime: exam.end_time,
          }))

        setAvailableExams(visible)
      }

      const loadRecentAttempts = async () => {
        const accessibleModes = (['simulation', 'practice'] as const).filter(
          (mode) => access[mode]
        )
        if (!access.history || accessibleModes.length === 0) {
          setRecentAttempts([])
          return
        }
        const { data, error: attemptsError } = await supabase
          .from('exam_attempts')
          .select(`
            id,
            submit_time,
            grading_status,
            exams!inner (title, exam_mode, show_results_immediately)
          `)
          .eq('student_id', user.id)
          .in('status', ['submitted', 'graded'])
          .in('exams.exam_mode', accessibleModes)
          .order('submit_time', { ascending: false })
          .limit(8)

        if (attemptsError) throw attemptsError

        const updates = (data || [])
          .map((attempt): RecentAttempt | null => {
            const examMode = relationString(attempt.exams, 'exam_mode')
            if (examMode !== 'simulation' && examMode !== 'practice') return null
            if (
              (examMode === 'simulation' && !access.simulation) ||
              (examMode === 'practice' && !access.practice)
            ) {
              return null
            }

            const gradingStatus = attempt.grading_status || ''
            const resultReleased = examMode === 'practice'
              || (
                gradingStatus === 'completed'
                && relationBoolean(attempt.exams, 'show_results_immediately')
              )
            const pendingReview = examMode === 'simulation' && gradingStatus === 'pending_review'

            if (!resultReleased && !pendingReview) return null

            return {
              id: attempt.id,
              examTitle: relationString(attempt.exams, 'title', 'Bài làm'),
              examMode,
              submitTime: attempt.submit_time,
              pendingReview,
            }
          })
          .filter((attempt): attempt is RecentAttempt => attempt !== null)
          .slice(0, 3)

        setRecentAttempts(updates)
      }

      const loadInProgressAttempts = async () => {
        const accessibleModes = (['simulation', 'practice'] as const).filter(
          (mode) => access[mode]
        )
        if (accessibleModes.length === 0) {
          setInProgressAttempts([])
          return
        }
        const { data, error: attemptsError } = await supabase
          .from('exam_attempts')
          .select(`
            id,
            exam_id,
            start_time,
            exams!inner (title, exam_mode, end_time, duration)
          `)
          .eq('student_id', user.id)
          .eq('status', 'in_progress')
          .in('exams.exam_mode', accessibleModes)
          .order('start_time', { ascending: false })

        if (attemptsError) throw attemptsError

        const attempts = (data || [])
          .map((attempt): InProgressAttempt | null => {
            const examMode = relationString(attempt.exams, 'exam_mode')
            if (examMode !== 'simulation' && examMode !== 'practice') return null
            if (
              (examMode === 'simulation' && !access.simulation) ||
              (examMode === 'practice' && !access.practice)
            ) {
              return null
            }

            return {
              id: attempt.id,
              examId: attempt.exam_id,
              examTitle: relationString(attempt.exams, 'title', 'Bài đang làm'),
              startTime: attempt.start_time,
              endTime: getAttemptDeadline(
                attempt.start_time,
                relationString(attempt.exams, 'end_time') || null,
                relationNumber(attempt.exams, 'duration')
              ),
              examMode,
            }
          })
          .filter((attempt): attempt is InProgressAttempt => attempt !== null)
          .filter(
            (attempt) => !isPastDeadline(attempt.endTime, snapshotNow)
          )
          .sort((left, right) => {
            if (left.examMode === right.examMode) {
              return right.startTime.localeCompare(left.startTime)
            }
            return left.examMode === 'simulation' ? -1 : 1
          })

        setInProgressAttempts(attempts)
      }

      const loadHomeworkTasks = async () => {
        if (!access.homework) {
          setHomeworkTasks([])
          return
        }
        const assignments = await getStudentHomeworkAssignments(user.id, profile?.class_id)
        if (!assignments.length) {
          setHomeworkTasks([])
          return
        }

        const assignmentIds = assignments.map((assignment) => assignment.id)
        const attemptsResult = await supabase
          .from('homework_attempts')
          .select('assignment_id, status, answered_questions, total_questions')
          .eq('student_id', user.id)
          .in('assignment_id', assignmentIds)
        if (attemptsResult.error) throw attemptsResult.error

        const attemptByAssignment = new Map(
          ((attemptsResult.data || []) as HomeworkAttemptRow[])
            .map((attempt) => [attempt.assignment_id, attempt])
        )

        const tasks: HomeworkTask[] = assignments.map((assignment) => {
          const attempt = attemptByAssignment.get(assignment.id)
          return {
            assignmentId: assignment.id,
            title: assignment.title || relationString(assignment.homeworks, 'title', 'Bài tập'),
            deadline: assignment.deadline,
            totalQuestions: attempt?.total_questions || 0,
            answeredCount: attempt?.answered_questions || 0,
            status: attempt?.status || null,
          }
        })

        setHomeworkTasks(tasks)
      }

      const sectionResults = await Promise.allSettled([
        loadAvailableExams(),
        loadRecentAttempts(),
        loadInProgressAttempts(),
        loadHomeworkTasks(),
      ])
      const failedSections = sectionResults.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      for (const result of failedSections) {
        console.error('Load student today section:', result.reason)
      }
      if (failedSections.length === sectionResults.length) {
        throw new Error('Không tải được các mục công việc hôm nay.')
      }
      if (failedSections.length > 0) {
        setWarning('Một số mục chưa tải được. Bạn có thể thử làm mới để xem đủ dữ liệu.')
      }

    } catch (dashboardError) {
      console.error('Load student today dashboard:', dashboardError)
      setError('Không thể tải đầy đủ công việc hôm nay. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    void fetchDashboardData()
  }, [fetchDashboardData])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const activeHomeworks = useMemo(
    () => homeworkTasks
      .filter((task) => (
        !isFinished(task.status)
        && task.answeredCount > 0
        && !isPastDeadline(task.deadline, now)
      ))
      .sort((left, right) => {
        if (!left.deadline) return 1
        if (!right.deadline) return -1
        return left.deadline.localeCompare(right.deadline)
      }),
    [homeworkTasks, now]
  )

  const dueHomeworks = useMemo(
    () => homeworkTasks
      .filter((task) => (
        !isFinished(task.status)
        && task.answeredCount === 0
        && !isPastDeadline(task.deadline, now)
      ))
      .sort((left, right) => {
        if (!left.deadline) return 1
        if (!right.deadline) return -1
        return left.deadline.localeCompare(right.deadline)
      }),
    [homeworkTasks, now]
  )

  const overdueHomeworks = useMemo(
    () => homeworkTasks
      .filter((task) => !isFinished(task.status) && isPastDeadline(task.deadline, now))
      .sort((left, right) => (right.deadline || '').localeCompare(left.deadline || '')),
    [homeworkTasks, now]
  )

  const activeInProgressAttempts = useMemo(
    () => inProgressAttempts.filter(
      (attempt) => !isPastDeadline(attempt.endTime, now)
    ),
    [inProgressAttempts, now]
  )

  const activeExamIds = useMemo(
    () => new Set(
      activeInProgressAttempts
        .filter((attempt) => attempt.examMode === 'simulation')
        .map((attempt) => attempt.examId)
    ),
    [activeInProgressAttempts]
  )

  const examsToStart = useMemo(
    () => availableExams.filter(
      (exam) =>
        !activeExamIds.has(exam.id)
        && !isPastDeadline(exam.endTime, now)
        && (!exam.startTime || new Date(exam.startTime).getTime() <= now)
    ),
    [activeExamIds, availableExams, now]
  )

  const hasActiveWork = activeInProgressAttempts.length > 0 || activeHomeworks.length > 0
  const hasDueWork = dueHomeworks.length > 0 || examsToStart.length > 0

  // Chip tóm tắt ở header. Đếm lại từ chính các mảng đã lọc ở trên để con số
  // luôn khớp với danh sách hiển thị bên dưới; chip 0 bị loại thay vì hiện "0".
  const summaryChips = useMemo(() => {
    const chips: { label: string; value: number; className: string }[] = []
    const continuing = activeInProgressAttempts.length + activeHomeworks.length

    if (continuing > 0) {
      chips.push({
        label: 'đang làm',
        value: continuing,
        className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
      })
    }
    if (dueHomeworks.length + examsToStart.length > 0) {
      chips.push({
        label: 'chờ bắt đầu',
        value: dueHomeworks.length + examsToStart.length,
        className: 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200',
      })
    }
    if (overdueHomeworks.length > 0) {
      chips.push({
        label: 'quá hạn',
        value: overdueHomeworks.length,
        className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
      })
    }
    return chips
  }, [activeInProgressAttempts, activeHomeworks, dueHomeworks, examsToStart, overdueHomeworks])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang chuẩn bị công việc hôm nay...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-red-200 bg-slate-50 p-6 text-center shadow-sm dark:border-red-900 dark:bg-slate-800">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Chưa tải được trang Hôm nay</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <button
            type="button"
            onClick={() => void fetchDashboardData()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
          >
            <RefreshCcw className="h-4 w-4" />
            Thử lại
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-5xl">
        {/*
          Header là "bản tóm tắt hôm nay": ngày, tên, rồi ba con số nói ngay còn
          bao nhiêu việc. Ba số này lấy từ chính các mảng đã lọc bên dưới nên
          không thể lệch với danh sách thật; ô nào bằng 0 thì không hiện, tránh
          bắt học sinh đọc "0 quá hạn" mỗi ngày.
        */}
        <header className="mb-6 animate-dash-in">
          <p className="text-sm font-medium text-teal-600 dark:text-teal-400">
            {new Intl.DateTimeFormat('vi-VN', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }).format(new Date(now))}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
            Hôm nay, {userName}
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {summaryChips.length > 0
              ? 'Bắt đầu từ việc quan trọng nhất, rồi xem phản hồi khi kết quả đã được công bố.'
              : 'Không còn việc nào đang chờ. Bạn có thể chọn một hoạt động để luyện thêm.'}
          </p>

          {summaryChips.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-2">
              {summaryChips.map((chip) => (
                <div
                  key={chip.label}
                  className={`inline-flex items-baseline gap-2 rounded-xl border px-3 py-2 ${chip.className}`}
                >
                  <dd className="text-lg font-bold tabular-nums leading-none">{chip.value}</dd>
                  <dt className="text-xs font-medium">{chip.label}</dt>
                </div>
              ))}
            </dl>
          )}
        </header>

        {warning && (
          <div
            className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <span>{warning}</span>
            <button
              type="button"
              onClick={() => void fetchDashboardData()}
              className="inline-flex items-center gap-2 font-semibold hover:underline"
            >
              <RefreshCcw className="h-4 w-4" />
              Tải lại
            </button>
          </div>
        )}

        {hasActiveWork && (
          <section aria-labelledby="continue-heading" className="mb-6 animate-dash-in-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Ưu tiên trước
                </p>
                <h2 id="continue-heading" className="text-lg font-bold text-slate-800 dark:text-white">
                  Tiếp tục việc đang làm
                </h2>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {activeInProgressAttempts.length + activeHomeworks.length} việc
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {activeInProgressAttempts.map((attempt) => {
                const isSimulation = attempt.examMode === 'simulation'
                return (
                  <article
                    key={attempt.id}
                    className={`rounded-2xl border p-4 ${
                      isSimulation
                        ? 'border-teal-200 bg-teal-50/80 dark:border-teal-800 dark:bg-teal-950/30'
                        : 'border-indigo-200 bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-950/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                        isSimulation
                          ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                          : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                      }`}>
                        {isSimulation ? <Timer className="h-5 w-5" /> : <PenTool className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {isSimulation ? 'Thi thử đang diễn ra' : 'Ôn tập đang làm'}
                        </p>
                        <h3 className="mt-0.5 truncate font-semibold text-slate-800 dark:text-white">
                          {attempt.examTitle}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Bắt đầu {formatDateTime(attempt.startTime)}
                        </p>
                        {attempt.endTime && (
                          <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Hết thời gian {formatDateTime(attempt.endTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(
                        isSimulation
                          ? `/exam/prepare/${attempt.examId}`
                          : `/practice/${attempt.id}`
                      )}
                      className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                        isSimulation
                          ? 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500'
                          : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                      }`}
                    >
                      <Play className="h-4 w-4" />
                      Tiếp tục
                    </button>
                  </article>
                )
              })}

              {activeHomeworks.map((task) => (
                <HomeworkCard key={task.assignmentId} task={task} mode="continue" />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr] animate-dash-in-2">
          <section aria-labelledby="todo-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                  Việc cần làm
                </p>
                <h2 id="todo-heading" className="text-lg font-bold text-slate-800 dark:text-white">
                  Còn hạn và có thể bắt đầu
                </h2>
              </div>
              {featureAccess.homework && (
                <Link
                  href="/student/homework"
                  className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  Xem bài tập
                </Link>
              )}
            </div>

            <div className="space-y-3">
              {dueHomeworks.slice(0, 4).map((task) => (
                <HomeworkCard key={task.assignmentId} task={task} mode="start" />
              ))}

              {examsToStart.map((exam) => (
                <article
                  key={exam.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-700"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">Thi thử đang mở</p>
                      <h3 className="mt-0.5 font-semibold text-slate-800 dark:text-white">{exam.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {exam.duration > 0 ? `${exam.duration} phút` : 'Không giới hạn thời gian'}
                        </span>
                        <span>{exam.subject}</span>
                        {exam.endTime && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <CalendarClock className="h-3.5 w-3.5" />
                            Hạn {formatDateTime(exam.endTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/exam/prepare/${exam.id}`)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                  >
                    <Play className="h-4 w-4" />
                    Xem và bắt đầu
                  </button>
                </article>
              ))}

              {!hasDueWork && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-800/60">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-teal-500" />
                  <h3 className="font-semibold text-slate-800 dark:text-white">Không có việc mới đang chờ</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {featureAccess.practice || featureAccess.simulation
                      ? 'Bạn có thể chọn một hoạt động học tập khác.'
                      : 'Hiện chưa có hoạt động nào được mở cho tài khoản của bạn.'}
                  </p>
                  {featureAccess.practice ? (
                    <Link
                      href="/student/practice"
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40"
                    >
                      <PenTool className="h-4 w-4" />
                      Mở ôn tập
                    </Link>
                  ) : featureAccess.simulation ? (
                    <Link
                      href="/student/exams"
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40"
                    >
                      <BookOpen className="h-4 w-4" />
                      Xem đề thi thử
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section
              aria-labelledby="updates-heading"
              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="border-b border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  Cập nhật
                </p>
                <h2 id="updates-heading" className="mt-0.5 font-bold text-slate-800 dark:text-white">
                  Phản hồi và trạng thái
                </h2>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {recentAttempts.map((attempt) => (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => router.push(`/result/${attempt.id}`)}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 dark:hover:bg-slate-700/50"
                  >
                    <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                      attempt.pendingReview
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    }`}>
                      {attempt.pendingReview
                        ? <Clock className="h-5 w-5" />
                        : <MessageSquareText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800 dark:text-white">{attempt.examTitle}</p>
                      <p className={`mt-0.5 text-xs font-medium ${
                        attempt.pendingReview
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}>
                        {attempt.pendingReview
                          ? 'Đang chờ giáo viên duyệt'
                          : 'Phản hồi đã được công bố'}
                      </p>
                      {attempt.submitTime && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(attempt.submitTime)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400" />
                  </button>
                ))}

                {recentAttempts.length === 0 && (
                  <div className="p-6 text-center">
                    <MessageSquareText className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Chưa có phản hồi được công bố.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {overdueHomeworks.length > 0 && (
              <section
                aria-labelledby="overdue-heading"
                className="rounded-2xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/20"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <h2 id="overdue-heading" className="font-semibold text-red-800 dark:text-red-300">
                      {overdueHomeworks.length} bài đã quá hạn
                    </h2>
                    <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
                      Các bài này chỉ hiển thị trạng thái; không thể tiếp tục từ trang Hôm nay.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {overdueHomeworks.slice(0, 3).map((task) => (
                        <li key={task.assignmentId} className="text-sm text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{task.title}</span>
                          {task.deadline && (
                            <span className="block text-xs text-red-600 dark:text-red-400">
                              Hết hạn {formatDateTime(task.deadline)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </aside>
        </div>

      </div>
    </main>
  )
}

function HomeworkCard({ task, mode }: {
  task: HomeworkTask
  mode: 'continue' | 'start'
}) {
  const progress = task.totalQuestions > 0
    ? Math.min(100, Math.max(0, Math.round(task.answeredCount / task.totalQuestions * 100)))
    : 0

  return (
    <article className={`rounded-2xl border p-4 transition-colors ${
      mode === 'continue'
        ? 'border-amber-200 bg-amber-50/80 hover:border-amber-300 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:border-amber-700'
        : 'border-slate-200 bg-slate-50 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-700'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
          mode === 'continue'
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            : 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
        }`}>
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${
            mode === 'continue'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-teal-600 dark:text-teal-400'
          }`}>
            {mode === 'continue' ? 'Bài tập đang làm' : 'Bài tập được giao'}
          </p>
          <h3 className="mt-0.5 font-semibold text-slate-800 dark:text-white">{task.title}</h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {task.totalQuestions > 0
                ? `Đã làm ${task.answeredCount}/${task.totalQuestions} câu`
                : task.answeredCount > 0
                  ? `Đã làm ${task.answeredCount} câu`
                  : 'Chưa bắt đầu'}
            </span>
            {task.deadline && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Hạn {formatDateTime(task.deadline)}
              </span>
            )}
          </div>
          {task.totalQuestions > 0 && (
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              role="progressbar"
              aria-label={`Tiến độ ${task.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
      <Link
        href={`/homework/prepare/${task.assignmentId}`}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
          mode === 'continue'
            ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
            : 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500'
        }`}
      >
        <Play className="h-4 w-4" />
        {mode === 'continue' ? 'Làm tiếp' : 'Bắt đầu'}
      </Link>
    </article>
  )
}
