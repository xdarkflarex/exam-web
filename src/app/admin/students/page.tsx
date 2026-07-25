'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import {
  fetchStudentPerformanceOverview,
  type HomeworkDataAccess,
  type LearningSignal,
  type ManagedClass,
  type StudentPerformanceOverview,
} from '@/lib/analytics/admin-student-performance'
import { logger } from '@/lib/logger'

type SortField = 'attention' | 'name' | 'simulation' | 'homework' | 'activity'

const SIGNAL_META: Record<
  LearningSignal,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  needs_attention: {
    label: 'Cần theo dõi',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    icon: AlertTriangle,
  },
  improving: {
    label: 'Đang tiến bộ',
    className: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    icon: TrendingUp,
  },
  in_progress: {
    label: 'Đang thực hiện',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    icon: BookOpenCheck,
  },
  stable: {
    label: 'Ổn định',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  no_data: {
    label: 'Chưa đủ dữ liệu',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    icon: BarChart3,
  },
}

const SIGNAL_PRIORITY: Record<LearningSignal, number> = {
  needs_attention: 0,
  in_progress: 1,
  improving: 2,
  stable: 3,
  no_data: 4,
}

function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1)
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function formatRelativeTime(value: string | null): string {
  if (!value) return 'Chưa có hoạt động'
  const timestamp = new Date(value).getTime()
  const diffDays = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (diffDays <= 0) return 'Hôm nay'
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) return `${diffDays} ngày trước`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`
  return new Date(value).toLocaleDateString('vi-VN')
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

function SignalBadge({ signal }: { signal: LearningSignal }) {
  const meta = SIGNAL_META[signal]
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  )
}

function ProgressMeter({ value }: { value: number | null }) {
  const width = Math.max(0, Math.min(100, value || 0))
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      aria-label={value === null ? 'Chưa có dữ liệu tiến độ' : `Tiến độ ${value}%`}
    >
      <div
        className={`h-full rounded-full ${
          width >= 80 ? 'bg-emerald-500' : width >= 50 ? 'bg-teal-500' : 'bg-amber-500'
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  note: string
  icon: typeof Users
  tone: 'teal' | 'blue' | 'amber' | 'rose'
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function HomeworkCell({
  student,
  access,
}: {
  student: StudentPerformanceOverview
  access: HomeworkDataAccess
}) {
  if (access !== 'available') {
    return <span className="text-sm text-slate-400">Chưa khả dụng</span>
  }
  if (student.homework.assigned === 0) {
    return <span className="text-sm text-slate-400">Chưa được giao</span>
  }
  return (
    <div className="min-w-36 space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {student.homework.submitted}/{student.homework.assigned} đã nộp
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {formatPercent(student.homework.completionRate)}
        </span>
      </div>
      <ProgressMeter value={student.homework.completionRate} />
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Đúng {formatPercent(student.homework.accuracy)}</span>
        {student.homework.overdue > 0 && (
          <span className="font-medium text-rose-600 dark:text-rose-300">
            {student.homework.overdue} quá hạn
          </span>
        )}
      </div>
    </div>
  )
}

export default function StudentsListPage() {
  const [students, setStudents] = useState<StudentPerformanceOverview[]>([])
  const [classes, setClasses] = useState<ManagedClass[]>([])
  const [homeworkAccess, setHomeworkAccess] = useState<HomeworkDataAccess>('available')
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [signalFilter, setSignalFilter] = useState<'all' | LearningSignal>('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [sortField, setSortField] = useState<SortField>('attention')

  const loadStudents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchStudentPerformanceOverview()
      setStudents(payload.students)
      setClasses(payload.classes)
      setHomeworkAccess(payload.homeworkAccess)
      setWarnings(payload.warnings)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu học sinh.'
      logger.error('Fetch student performance overview error', loadError)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  const filteredStudents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi')
    return students
      .filter((student) => {
        const matchesSearch = !normalizedSearch || [
          student.fullName,
          student.email,
          student.school || '',
          student.className || '',
        ].some((value) => value.toLocaleLowerCase('vi').includes(normalizedSearch))
        const matchesClass = classFilter === 'all' || student.classId === classFilter
        const matchesSignal = signalFilter === 'all' || student.signal === signalFilter
        const matchesTier = tierFilter === 'all' || student.accessTier === tierFilter
        return matchesSearch && matchesClass && matchesSignal && matchesTier
      })
      .sort((a, b) => {
        if (sortField === 'name') return a.fullName.localeCompare(b.fullName, 'vi')
        if (sortField === 'simulation') {
          return (b.simulation.averageScore ?? -1) - (a.simulation.averageScore ?? -1)
        }
        if (sortField === 'homework') {
          return (a.homework.completionRate ?? 101) - (b.homework.completionRate ?? 101)
        }
        if (sortField === 'activity') {
          return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')
        }
        return (
          SIGNAL_PRIORITY[a.signal] - SIGNAL_PRIORITY[b.signal]
          || b.homework.overdue - a.homework.overdue
          || (a.homework.completionRate ?? 101) - (b.homework.completionRate ?? 101)
        )
      })
  }, [classFilter, searchTerm, signalFilter, sortField, students, tierFilter])

  const totals = useMemo(() => {
    const activeSince = Date.now() - 7 * 86_400_000
    const homeworkAssigned = students.reduce((sum, student) => sum + student.homework.assigned, 0)
    const homeworkSubmitted = students.reduce((sum, student) => sum + student.homework.submitted, 0)
    return {
      students: students.length,
      active: students.filter(
        (student) => student.lastActivityAt
          && new Date(student.lastActivityAt).getTime() >= activeSince,
      ).length,
      needsAttention: students.filter((student) => student.signal === 'needs_attention').length,
      homeworkCompletion: homeworkAccess === 'available' && homeworkAssigned > 0
        ? Math.round((homeworkSubmitted / homeworkAssigned) * 100)
        : null,
    }
  }, [homeworkAccess, students])

  const exportCsv = () => {
    const headers = [
      'Họ tên',
      'Email',
      'Lớp',
      'Gói quyền',
      'Thi thử đã chấm',
      'Điểm thi thử TB',
      'Ôn tập hoàn thành',
      'Độ chính xác ôn tập',
      'Bài tập đã nộp',
      'Bài tập được giao',
      'Bài tập quá hạn',
      'Độ chính xác bài tập',
      'Trạng thái',
      'Lý do',
      'Hoạt động gần nhất',
    ]
    const rows = filteredStudents.map((student) => [
      student.fullName,
      student.email,
      student.className || '',
      student.accessTier,
      student.simulation.completed,
      student.simulation.averageScore?.toFixed(2) || '',
      student.practice.completed,
      student.practice.accuracy ?? '',
      student.homework.submitted,
      student.homework.assigned,
      student.homework.overdue,
      student.homework.accuracy ?? '',
      SIGNAL_META[student.signal].label,
      student.signalReason,
      student.lastActivityAt || '',
    ])
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(
      new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `theo-doi-hoc-sinh-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader
        title="Theo dõi học tập"
        subtitle="Kết quả thi, tiến độ bài tập và tín hiệu cần hỗ trợ"
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Học sinh trong phạm vi"
            value={totals.students}
            note="Theo quyền tài khoản hiện tại"
            icon={Users}
            tone="blue"
          />
          <MetricCard
            label="Hoạt động 7 ngày"
            value={totals.active}
            note="Có thi, ôn tập hoặc làm bài"
            icon={Sparkles}
            tone="teal"
          />
          <MetricCard
            label="Cần theo dõi"
            value={totals.needsAttention}
            note="Có lý do cụ thể trong từng hồ sơ"
            icon={AlertTriangle}
            tone="rose"
          />
          <MetricCard
            label="Hoàn thành bài tập"
            value={formatPercent(totals.homeworkCompletion)}
            note={homeworkAccess === 'available' ? 'Đã nộp trên tổng lượt được giao' : 'RLS chưa cho phép đọc homework'}
            icon={ClipboardCheck}
            tone="amber"
          />
        </div>

        {warnings.map((warning) => (
          <div
            key={warning}
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{warning}</p>
          </div>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(150px,auto))]">
            <label className="relative">
              <span className="sr-only">Tìm học sinh</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm theo tên, email, trường hoặc lớp..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Lọc theo lớp"
            >
              <option value="all">Tất cả lớp</option>
              {classes.map((classRow) => (
                <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
              ))}
            </select>
            <select
              value={signalFilter}
              onChange={(event) => setSignalFilter(event.target.value as 'all' | LearningSignal)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Lọc theo trạng thái học tập"
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(SIGNAL_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Lọc theo gói quyền"
            >
              <option value="all">Tất cả gói quyền</option>
              <option value="full">Đầy đủ</option>
              <option value="basic">Cơ bản</option>
            </select>
            <select
              value={sortField}
              onChange={(event) => setSortField(event.target.value as SortField)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Sắp xếp danh sách"
            >
              <option value="attention">Ưu tiên cần theo dõi</option>
              <option value="name">Tên A–Z</option>
              <option value="simulation">Điểm thi thử cao trước</option>
              <option value="homework">Tiến độ bài tập thấp trước</option>
              <option value="activity">Hoạt động mới nhất</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hiển thị <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredStudents.length}</span>/{students.length} học sinh
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadStudents()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredStudents.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Xuất CSV
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              Đang tổng hợp kết quả học tập...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
            <h2 className="mt-3 font-semibold text-rose-900 dark:text-rose-100">Không tải được danh sách</h2>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadStudents()}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Thử lại
            </button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
            <Users className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">Không có học sinh phù hợp</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hãy đổi từ khóa hoặc bộ lọc.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:block">
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/60">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-5 py-3.5">Học sinh</th>
                      <th className="px-5 py-3.5">Lớp & quyền</th>
                      <th className="px-5 py-3.5">Thi thử</th>
                      <th className="px-5 py-3.5">Ôn tập</th>
                      <th className="px-5 py-3.5">Bài tập</th>
                      <th className="px-5 py-3.5">Tín hiệu</th>
                      <th className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1">
                          Hoạt động <ArrowUpDown className="h-3 w-3" />
                        </span>
                      </th>
                      <th className="px-5 py-3.5 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="align-top transition hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 font-bold text-white">
                              {student.fullName.charAt(0).toLocaleUpperCase('vi')}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{student.fullName}</p>
                              <p className="max-w-56 truncate text-sm text-slate-500 dark:text-slate-400">{student.email || 'Chưa có email'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {student.className || 'Chưa xếp lớp'}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                            {student.grade && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                Khối {student.grade}
                              </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {student.accessTier === 'full' ? 'Quyền đầy đủ' : 'Quyền cơ bản'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {formatScore(student.simulation.averageScore)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {student.simulation.completed} bài đã chấm
                          </p>
                          {student.simulation.pendingReview > 0 && (
                            <p className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                              {student.simulation.pendingReview} bài chờ duyệt
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {formatPercent(student.practice.accuracy)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {student.practice.completed} lượt hoàn thành
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <HomeworkCell student={student} access={homeworkAccess} />
                        </td>
                        <td className="px-5 py-4">
                          <SignalBadge signal={student.signal} />
                          <p className="mt-1.5 max-w-48 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {student.signalReason}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {formatRelativeTime(student.lastActivityAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/admin/students/${student.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/30"
                          >
                            Xem
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 lg:hidden">
              {filteredStudents.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-700"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 font-bold text-white">
                      {student.fullName.charAt(0).toLocaleUpperCase('vi')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{student.fullName}</h2>
                          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                            {student.className || 'Chưa xếp lớp'} · {student.accessTier === 'full' ? 'Đầy đủ' : 'Cơ bản'}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                      </div>
                      <div className="mt-2">
                        <SignalBadge signal={student.signal} />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{student.signalReason}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Thi thử</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{formatScore(student.simulation.averageScore)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Ôn tập</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{formatPercent(student.practice.accuracy)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Bài tập</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {homeworkAccess === 'available'
                          ? `${student.homework.submitted}/${student.homework.assigned}`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Hoạt động gần nhất: {formatRelativeTime(student.lastActivityAt)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Trạng thái chỉ là tín hiệu để mở hồ sơ kiểm tra. Hệ thống không cộng điểm thi,
            ôn tập và bài tập thành một điểm chung.
          </p>
        </div>
      </div>
    </div>
  )
}
