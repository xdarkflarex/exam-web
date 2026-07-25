'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Loader2,
  LockKeyhole,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getCapabilityStatusLabel,
  getStudentCapabilitySummary,
  type CapabilityStat,
  type CapabilityStatus,
  type HomeworkCapabilityItem,
  type StudentCapabilitySummary,
} from '@/lib/analytics/student-capability'

type TabKey = 'overview' | 'knowledge' | 'levels' | 'homework'

const tabs: Array<{ id: TabKey; label: string; icon: typeof BarChart3 }> = [
  { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
  { id: 'knowledge', label: 'Theo kiến thức', icon: BookOpen },
  { id: 'levels', label: 'Theo mức độ', icon: Target },
  { id: 'homework', label: 'Bài được giao', icon: ClipboardList },
]

const statusTone: Record<CapabilityStatus, string> = {
  no_data: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  needs_work: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  building: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  stable: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  mastered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
}

const barTone: Record<CapabilityStatus, string> = {
  no_data: 'bg-slate-300',
  needs_work: 'bg-rose-500',
  building: 'bg-amber-500',
  stable: 'bg-blue-500',
  mastered: 'bg-emerald-500',
}

export default function StudentAnalyticsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<StudentCapabilitySummary | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Phiên đăng nhập không hợp lệ.')
        setSummary(await getStudentCapabilitySummary(user.id))
      } catch (err) {
        console.error('Student analytics error:', err)
        setError(err instanceof Error ? err.message : 'Không thể tải hồ sơ năng lực.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <main className="mx-auto max-w-4xl p-4 pt-16 lg:p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error || 'Không có dữ liệu để hiển thị.'}
        </div>
      </main>
    )
  }

  const advanced = summary.student.canViewAdvancedAnalytics
  const recommendedTone = {
    teal: 'from-teal-600 to-cyan-600',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-red-500',
    slate: 'from-slate-700 to-slate-900',
  }[summary.recommendedAction.tone]

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pt-16 lg:p-6">
      <header className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
            <Sparkles className="h-3.5 w-3.5" />
            {advanced ? 'Phân tích nâng cao' : 'Tổng quan học tập'}
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Hồ sơ năng lực
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi bài được giao, độ chính xác và các mảng cần củng cố.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {advanced ? 'Gói nâng cao' : 'Gói cơ bản'}
        </span>
      </header>

      <section className={`animate-fade-in-up-delay-1 overflow-hidden rounded-xl bg-gradient-to-r ${recommendedTone} p-5 text-white shadow-sm`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/75">Việc nên làm tiếp theo</p>
            <h2 className="mt-1 text-xl font-semibold">{summary.recommendedAction.label}</h2>
            <p className="mt-1 text-sm text-white/80">{summary.recommendedAction.detail}</p>
          </div>
          <Link
            href={summary.recommendedAction.href}
            className="btn-action-sm inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
          >
            Mở ngay
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-list-stagger">
        <MetricCard
          icon={ClipboardList}
          label="Bài được giao"
          value={summary.totals.assigned.toString()}
          note={`${summary.totals.submitted} đã nộp`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Hoàn thành"
          value={`${summary.totals.completionRate}%`}
          note={`${summary.totals.pending} bài đang chờ`}
        />
        <MetricCard
          icon={Target}
          label="Độ chính xác"
          value={`${summary.totals.accuracy}%`}
          note={`${summary.totals.correct}/${summary.totals.answered} câu đúng`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Quá hạn"
          value={summary.totals.overdue.toString()}
          note="Cần xử lý trước"
        />
      </section>

      {!advanced && <BasicView summary={summary} />}

      {advanced && (
        <>
          <nav className="animate-fade-in-up-delay-2 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {activeTab === 'overview' && <OverviewTab summary={summary} />}
          {activeTab === 'knowledge' && <StatList title="Năng lực theo kiến thức" items={summary.knowledgeStats} emptyText="Chưa có dữ liệu liên kết câu hỏi với kiến thức." />}
          {activeTab === 'levels' && <StatList title="Độ chính xác theo mức nhận thức" items={summary.levelStats} emptyText="Chưa có câu trả lời để thống kê theo mức độ." />}
          {activeTab === 'homework' && <HomeworkList items={summary.homeworks} />}
        </>
      )}
    </main>
  )
}

function BasicView({ summary }: { summary: StudentCapabilitySummary }) {
  const pending = summary.homeworks.filter((item) => item.status !== 'submitted' && item.status !== 'graded')
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="animate-fade-in-up-delay-2 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="font-semibold text-slate-800 dark:text-white">Tiến độ bài được giao</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bạn đang có {summary.totals.pending} bài cần hoàn thành.
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${summary.totals.completionRate}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm text-slate-500">
          <span>{summary.totals.submitted}/{summary.totals.assigned} bài đã nộp</span>
          <span>{summary.totals.completionRate}%</span>
        </div>
      </section>

      <section className="animate-fade-in-up-delay-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-800 dark:text-white">Phân tích nâng cao</h2>
        </div>
        <p className="text-sm text-slate-500">
          Tài khoản cơ bản xem được tiến độ và kết quả chính. Phân tích chi tiết theo kiến thức, mức nhận thức và xu hướng học tập nằm trong gói nâng cao.
        </p>
      </section>

      <section className="animate-fade-in-up-delay-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 lg:col-span-2">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white">
          <CalendarClock className="h-5 w-5 text-amber-500" />
          Bài đang chờ
        </h2>
        <div className="space-y-2">
          {pending.slice(0, 5).map((item) => (
            <HomeworkRow key={item.assignmentId} item={item} />
          ))}
          {!pending.length && (
            <p className="py-6 text-center text-sm text-slate-500">Không có bài đang chờ.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function OverviewTab({ summary }: { summary: StudentCapabilitySummary }) {
  const weakKnowledge = summary.knowledgeStats.filter((item) => item.status === 'needs_work' || item.status === 'building').slice(0, 4)
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <StatList title="Mảng cần ưu tiên" items={weakKnowledge} emptyText="Chưa có mảng yếu rõ ràng." compact />
      <HomeworkList items={summary.homeworks.slice(0, 5)} compact />
    </div>
  )
}

function StatList({
  title,
  items,
  emptyText,
  compact = false,
}: {
  title: string
  items: CapabilityStat[]
  emptyText: string
  compact?: boolean
}) {
  return (
    <section className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="font-semibold text-slate-800 dark:text-white">{title}</h2>
      <div className="mt-4 space-y-3 animate-list-stagger">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.correct}/{item.total} câu đúng</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone[item.status]}`}>
                {getCapabilityStatusLabel(item.status)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className={`h-full rounded-full ${barTone[item.status]}`} style={{ width: `${item.accuracy}%` }} />
              </div>
              <span className="w-10 text-right text-sm font-semibold text-slate-700 dark:text-slate-200">{item.accuracy}%</span>
            </div>
          </div>
        ))}
        {!items.length && <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>}
      </div>
      {!compact && items.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">Mốc đánh giá dựa trên số câu đã làm và tỷ lệ đúng.</p>
      )}
    </section>
  )
}

function HomeworkList({ items, compact = false }: { items: HomeworkCapabilityItem[]; compact?: boolean }) {
  return (
    <section className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="font-semibold text-slate-800 dark:text-white">Bài được giao</h2>
      <div className="mt-4 space-y-3 animate-list-stagger">
        {items.map((item) => <HomeworkRow key={item.assignmentId} item={item} />)}
        {!items.length && <p className="py-8 text-center text-sm text-slate-500">Chưa có bài được giao.</p>}
      </div>
      {!compact && items.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">Độ chính xác tính trên số câu đã trả lời.</p>
      )}
    </section>
  )
}

function HomeworkRow({ item }: { item: HomeworkCapabilityItem }) {
  const done = item.status === 'submitted' || item.status === 'graded'
  return (
    <Link
      href={`/homework/prepare/${item.assignmentId}`}
      className="group block rounded-lg border border-slate-100 p-3 transition-all hover:border-teal-200 hover:bg-teal-50/40 dark:border-slate-700 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
            {item.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {item.deadline ? new Date(item.deadline).toLocaleString('vi-VN') : 'Không hạn nộp'}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
          done
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
            : item.overdue
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
        }`}>
          {done ? 'Đã nộp' : item.overdue ? 'Quá hạn' : 'Đang chờ'}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${item.completionRate}%` }} />
        </div>
        <span className="text-xs font-medium text-slate-500">{item.answered}/{item.total}</span>
      </div>
    </Link>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof BarChart3
  label: string
  value: string
  note: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-900">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  )
}
