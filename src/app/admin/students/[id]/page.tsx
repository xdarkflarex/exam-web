'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  Layers3,
  Loader2,
  Mail,
  RefreshCw,
  School,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import {
  fetchStudentPerformanceDetail,
  type AssessmentAttempt,
  type EvidenceStat,
  type HomeworkActivity,
  type StudentPerformanceDetail,
} from '@/lib/analytics/admin-student-performance'
import { logger } from '@/lib/logger'

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number): string {
  if (!seconds) return 'Chưa ghi nhận'
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes} phút`
    : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`
}

function completedStatus(status: string): boolean {
  return status === 'submitted' || status === 'graded'
}

function scoreTrend(attempts: AssessmentAttempt[]): number | null {
  const scores = attempts
    .filter((attempt) => attempt.score !== null)
    .map((attempt) => attempt.score as number)
  if (scores.length < 4) return null
  const recent = average(scores.slice(0, 3))
  const previous = average(scores.slice(3, 6))
  return recent !== null && previous !== null ? recent - previous : null
}

function Metric({
  label,
  value,
  note,
}: {
  label: string
  value: string | number
  note?: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  )
}

function DomainCard({
  title,
  description,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  description: string
  icon: typeof FileText
  tone: 'blue' | 'teal' | 'amber'
  children: React.ReactNode
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

function EvidencePanel({
  title,
  description,
  icon: Icon,
  stats,
}: {
  title: string
  description: string
  icon: typeof Layers3
  stats: EvidenceStat[]
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {stats.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Chưa đủ câu đã chấm để phân tích.</div>
      ) : (
        <div className="mt-5 space-y-4">
          {stats.slice(0, 6).map((stat) => (
            <div key={stat.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{stat.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stat.correct}/{stat.total} câu đúng
                    {' · '}
                    Thi thử {stat.simulationTotal}
                    {' · '}
                    Ôn tập {stat.practiceTotal}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold ${
                  stat.accuracy >= 70
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : stat.accuracy >= 50
                      ? 'text-amber-600 dark:text-amber-300'
                      : 'text-rose-600 dark:text-rose-300'
                }`}>
                  {stat.accuracy}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full ${
                    stat.accuracy >= 70
                      ? 'bg-emerald-500'
                      : stat.accuracy >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${stat.accuracy}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function assessmentStatus(attempt: AssessmentAttempt): {
  label: string
  className: string
} {
  if (attempt.gradingStatus === 'pending_review') {
    return {
      label: 'Chờ duyệt tự luận',
      className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
    }
  }
  if (completedStatus(attempt.status)) {
    return {
      label: 'Đã hoàn thành',
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    }
  }
  return {
    label: 'Đang làm',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }
}

function homeworkStatus(activity: HomeworkActivity): {
  label: string
  className: string
} {
  if (activity.overdue) {
    return {
      label: 'Quá hạn',
      className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    }
  }
  if (completedStatus(activity.status)) {
    return {
      label: 'Đã nộp',
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    }
  }
  if (activity.status === 'not_started') {
    return {
      label: 'Chưa bắt đầu',
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    }
  }
  return {
    label: 'Đang làm',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }
}

export default function StudentDetailPage() {
  const { id: studentId } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<StudentPerformanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    setError(null)
    try {
      setDetail(await fetchStudentPerformanceDetail(studentId))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không thể tải hồ sơ học sinh.'
      logger.error('Fetch student performance detail error', loadError)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const metrics = useMemo(() => {
    if (!detail) return null
    const simulation = detail.attempts.filter((attempt) => attempt.mode === 'simulation')
    const simulationScored = simulation.filter((attempt) => attempt.score !== null)
    const simulationScores = simulationScored.map((attempt) => attempt.score as number)
    const practice = detail.attempts.filter((attempt) => attempt.mode === 'practice')
    const practiceCompleted = practice.filter((attempt) => completedStatus(attempt.status))
    const practiceAnswered = practiceCompleted.reduce(
      (sum, attempt) => sum + attempt.totalQuestions,
      0,
    )
    const practiceCorrect = practiceCompleted.reduce(
      (sum, attempt) => sum + attempt.correctAnswers,
      0,
    )
    const homeworkAssigned = detail.homeworkActivities.length
    const homeworkStarted = detail.homeworkActivities.filter(
      (activity) => activity.status !== 'not_started',
    ).length
    const homeworkSubmitted = detail.homeworkActivities.filter(
      (activity) => completedStatus(activity.status),
    ).length
    const homeworkOverdue = detail.homeworkActivities.filter((activity) => activity.overdue).length
    const homeworkAnswered = detail.homeworkActivities.reduce(
      (sum, activity) => sum + activity.answeredQuestions,
      0,
    )
    const homeworkCorrect = detail.homeworkActivities.reduce(
      (sum, activity) => sum + activity.correctAnswers,
      0,
    )
    const lastActivityAt = [
      ...detail.attempts.map((attempt) => attempt.occurredAt),
      ...detail.homeworkActivities.map((activity) => activity.occurredAt),
    ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null

    return {
      simulation,
      simulationScored,
      simulationAverage: average(simulationScores),
      simulationBest: simulationScores.length ? Math.max(...simulationScores) : null,
      simulationTrend: scoreTrend(simulationScored),
      pendingReview: simulation.filter(
        (attempt) => attempt.gradingStatus === 'pending_review',
      ).length,
      practice,
      practiceCompleted,
      practiceAccuracy: percent(practiceCorrect, practiceAnswered),
      homeworkAssigned,
      homeworkStarted,
      homeworkSubmitted,
      homeworkOverdue,
      homeworkCompletion: percent(homeworkSubmitted, homeworkAssigned),
      homeworkAccuracy: percent(homeworkCorrect, homeworkAnswered),
      lastActivityAt,
    }
  }, [detail])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          Đang tổng hợp hồ sơ học tập...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
          <AlertTriangle className="mx-auto h-9 w-9 text-rose-500" />
          <h1 className="mt-3 font-semibold text-rose-900 dark:text-rose-100">Không tải được hồ sơ</h1>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/admin/students" className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 dark:border-rose-800 dark:text-rose-200">
              Quay lại
            </Link>
            <button type="button" onClick={() => void loadDetail()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
              Thử lại
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!detail || !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-900">
        <div className="text-center">
          <User className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600" />
          <h1 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">Không tìm thấy học sinh</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hồ sơ không tồn tại hoặc nằm ngoài phạm vi được xem.</p>
          <Link href="/admin/students" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách
          </Link>
        </div>
      </div>
    )
  }

  const attentionItems = [
    metrics.homeworkOverdue > 0
      ? `${metrics.homeworkOverdue} bài tập đã quá hạn`
      : null,
    metrics.pendingReview > 0
      ? `${metrics.pendingReview} bài thi thử đang chờ duyệt tự luận`
      : null,
    metrics.simulationScored.length >= 2
      && metrics.simulationAverage !== null
      && metrics.simulationAverage < 5
      ? `Điểm thi thử trung bình ${metrics.simulationAverage.toFixed(1)}`
      : null,
    metrics.homeworkAccuracy !== null
      && detail.homeworkActivities.reduce((sum, item) => sum + item.answeredQuestions, 0) >= 5
      && metrics.homeworkAccuracy < 50
      ? `Độ chính xác bài tập ${metrics.homeworkAccuracy}%`
      : null,
  ].filter((item): item is string => Boolean(item))

  const recentActivities = [
    ...detail.attempts.map((attempt) => ({
      key: `exam:${attempt.id}`,
      occurredAt: attempt.occurredAt,
      mode: attempt.mode === 'simulation' ? 'Thi thử' : 'Ôn tập',
      title: attempt.title,
      detail: attempt.gradingStatus === 'pending_review'
        ? `${attempt.pendingGradingCount} câu tự luận chờ duyệt`
        : `${attempt.correctAnswers}/${attempt.totalQuestions} câu đúng · ${formatDuration(attempt.timeSpent)}`,
      score: attempt.score,
      status: assessmentStatus(attempt),
      href: `/admin/attempts/${attempt.id}`,
      icon: attempt.mode === 'simulation' ? FileText : BookOpenCheck,
    })),
    ...detail.homeworkActivities.map((activity) => ({
      key: `homework:${activity.assignmentId}`,
      occurredAt: activity.occurredAt,
      mode: 'Bài tập',
      title: activity.title,
      detail: activity.status === 'not_started'
        ? activity.deadline
          ? `Hạn nộp ${formatDate(activity.deadline)}`
          : 'Chưa bắt đầu'
        : `${activity.answeredQuestions}/${activity.totalQuestions} câu đã làm`,
      score: completedStatus(activity.status) ? activity.score : null,
      status: homeworkStatus(activity),
      href: `/admin/homework/${activity.homeworkId}/results`,
      icon: ClipboardCheck,
    })),
  ]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12)

  const trendAttempts = [...metrics.simulationScored].reverse().slice(-10)
  const maxTrendScore = Math.max(10, ...trendAttempts.map((attempt) => attempt.score || 0))

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader
        title="Hồ sơ học tập"
        subtitle={detail.student.fullName}
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/students"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Danh sách học sinh
          </Link>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 text-2xl font-bold text-white">
              {detail.student.fullName.charAt(0).toLocaleUpperCase('vi')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{detail.student.fullName}</h1>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  detail.student.accessTier === 'full'
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {detail.student.accessTier === 'full' ? 'Quyền đầy đủ' : 'Quyền cơ bản'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  {detail.student.email || 'Chưa có email'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <School className="h-4 w-4" />
                  {detail.student.className || 'Chưa xếp lớp'}
                  {detail.student.grade ? ` · Khối ${detail.student.grade}` : ''}
                </span>
                {detail.student.school && (
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4" />
                    {detail.student.school}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Tham gia {new Date(detail.student.createdAt).toLocaleDateString('vi-VN')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" />
                  Gần nhất {metrics.lastActivityAt ? formatDate(metrics.lastActivityAt) : 'chưa có'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {detail.warnings.map((warning) => (
          <div
            key={warning}
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{warning}</p>
          </div>
        ))}

        {attentionItems.length > 0 && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" />
              <div>
                <h2 className="font-semibold text-rose-900 dark:text-rose-100">Điểm cần kiểm tra</h2>
                <ul className="mt-2 space-y-1 text-sm text-rose-800 dark:text-rose-200">
                  {attentionItems.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <DomainCard
            title="Thi thử"
            description="Chỉ tính bài đã chấm xong, không biến bài chờ duyệt thành 0 điểm."
            icon={FileText}
            tone="blue"
          >
            <Metric label="Đã chấm" value={metrics.simulationScored.length} />
            <Metric label="Điểm trung bình" value={formatScore(metrics.simulationAverage)} />
            <Metric label="Điểm cao nhất" value={formatScore(metrics.simulationBest)} />
            <Metric
              label="Xu hướng"
              value={metrics.simulationTrend === null
                ? 'Chưa đủ mẫu'
                : `${metrics.simulationTrend >= 0 ? '+' : ''}${metrics.simulationTrend.toFixed(1)}`}
              note={metrics.pendingReview > 0 ? `${metrics.pendingReview} bài chờ duyệt` : undefined}
            />
          </DomainCard>

          <DomainCard
            title="Ôn tập"
            description="Theo dõi riêng số lượt hoàn thành và độ chính xác."
            icon={BookOpenCheck}
            tone="teal"
          >
            <Metric label="Lượt hoàn thành" value={metrics.practiceCompleted.length} />
            <Metric label="Độ chính xác" value={formatPercent(metrics.practiceAccuracy)} />
            <Metric label="Tổng lượt" value={metrics.practice.length} />
            <Metric
              label="Đang làm"
              value={metrics.practice.filter((attempt) => !completedStatus(attempt.status)).length}
            />
          </DomainCard>

          <DomainCard
            title="Bài tập"
            description="Tiến độ tính trên số bài được giao, đã loại trùng giao theo lớp và trực tiếp."
            icon={ClipboardCheck}
            tone="amber"
          >
            {detail.homeworkAccess === 'available' ? (
              <>
                <Metric label="Được giao" value={metrics.homeworkAssigned} />
                <Metric label="Đã nộp" value={`${metrics.homeworkSubmitted}/${metrics.homeworkAssigned}`} />
                <Metric label="Hoàn thành" value={formatPercent(metrics.homeworkCompletion)} />
                <Metric
                  label="Độ chính xác"
                  value={formatPercent(metrics.homeworkAccuracy)}
                  note={metrics.homeworkOverdue > 0 ? `${metrics.homeworkOverdue} bài quá hạn` : undefined}
                />
              </>
            ) : (
              <div className="col-span-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                RLS hiện chưa cho vai trò này đọc dữ liệu bài tập của học sinh.
              </div>
            )}
          </DomainCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  Xu hướng điểm thi thử
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tối đa 10 bài đã chấm gần nhất, theo thứ tự thời gian.</p>
              </div>
              {metrics.simulationTrend !== null && (
                <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  metrics.simulationTrend >= 0
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                }`}>
                  {metrics.simulationTrend >= 0
                    ? <TrendingUp className="h-3.5 w-3.5" />
                    : <TrendingDown className="h-3.5 w-3.5" />}
                  {metrics.simulationTrend >= 0 ? '+' : ''}{metrics.simulationTrend.toFixed(1)}
                </div>
              )}
            </div>
            {trendAttempts.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-400">Chưa có bài thi thử đã chấm.</div>
            ) : (
              <div className="mt-6 flex h-56 items-end gap-2">
                {trendAttempts.map((attempt) => {
                  const score = attempt.score || 0
                  return (
                    <div key={attempt.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{score.toFixed(1)}</span>
                      <div className="flex h-40 w-full items-end">
                        <div
                          className={`w-full rounded-t-lg ${
                            score >= 8 ? 'bg-emerald-500' : score >= 5 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ height: `${Math.max(8, (score / maxTrendScore) * 100)}%` }}
                          title={`${attempt.title}: ${score.toFixed(1)}`}
                        />
                      </div>
                      <span className="w-full truncate text-center text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(attempt.occurredAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Target className="h-5 w-5 text-teal-600 dark:text-teal-300" />
              Gợi ý quan sát
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Các tín hiệu có thể đối chiếu nhanh trước khi mở từng bài làm.
            </p>
            <div className="mt-5 space-y-3">
              {attentionItems.length > 0 ? attentionItems.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {item}
                </div>
              )) : (
                <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  Chưa có tín hiệu quá hạn hoặc kết quả thấp đủ mẫu.
                </div>
              )}
              {metrics.simulationTrend !== null && metrics.simulationTrend >= 0.5 && (
                <div className="flex items-start gap-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950/30 dark:text-teal-200">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  Điểm 3 bài thi thử gần đây tăng {metrics.simulationTrend.toFixed(1)} so với nhóm trước.
                </div>
              )}
              {detail.knowledgeStats[0] && detail.knowledgeStats[0].total >= 3 && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <Layers3 className="mt-0.5 h-4 w-4 shrink-0" />
                  Kiến thức cần xem trước: {detail.knowledgeStats[0].label} ({detail.knowledgeStats[0].accuracy}% trên {detail.knowledgeStats[0].total} câu).
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <EvidencePanel
            title="Kiến thức cần củng cố"
            description="Mỗi câu chỉ lấy liên kết tri thức chính; sắp từ độ chính xác thấp lên."
            icon={Layers3}
            stats={detail.knowledgeStats}
          />
          <EvidencePanel
            title="Theo mức nhận thức"
            description="Độ chính xác trên các câu đã chấm, tách số câu thi thử và ôn tập."
            icon={Award}
            stats={detail.cognitiveStats}
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Hoạt động gần đây</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Thi thử, ôn tập và bài tập được giữ nhãn riêng; không quy đổi thành điểm chung.
            </p>
          </div>
          {recentActivities.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">Chưa có hoạt động học tập.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {recentActivities.map((activity) => {
                const Icon = activity.icon
                return (
                  <Link
                    key={activity.key}
                    href={activity.href}
                    className="flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  >
                    <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{activity.mode}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${activity.status.className}`}>
                          {activity.status.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-medium text-slate-900 dark:text-slate-100">{activity.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{activity.detail}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(activity.occurredAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {activity.score !== null && (
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{activity.score.toFixed(1)}</span>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Phân tích kiến thức dùng các câu có kết quả đúng/sai đã được lưu. Câu tự luận đang
            chờ duyệt không bị tính là sai và không làm giảm điểm trung bình.
          </p>
        </div>
      </div>
    </div>
  )
}
