/**
 * Hồ sơ năng lực học sinh.
 *
 * Làm đẹp đợt 2026-08-09. Không đổi truy vấn, không đổi phân quyền: gating theo
 * `access_tier` giữ nguyên (`canViewAdvancedAnalytics`), vì ẩn/hiện ở đây là
 * quyết định sản phẩm chứ không phải design.
 *
 * Bảng màu sáu mức năng lực KHÔNG còn định nghĩa tại chỗ. Nó nằm ở
 * `@/lib/analytics/mastery-tone` và dùng chung với `components/student/WeakAreas`
 * — trước đây hai nơi chép tay và đã lệch nhau ở mức `no_data`.
 *
 * Ba chỗ sửa ngữ nghĩa hiển thị (mục 7.1: `null` phải hiện khác `0`):
 *
 *   1. Độ chính xác khi chưa trả lời câu nào — trước hiện "0%", nghĩa là "làm và
 *      sai hết". Nay hiện dấu gạch.
 *   2. Tỷ lệ hoàn thành khi chưa được giao bài nào — trước "0%", đọc thành "được
 *      giao mà chưa làm". Nay nói thẳng là chưa có bài.
 *   3. Thanh tiến độ của một bài chưa rõ số câu — không vẽ thanh 0%.
 */

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
import ProgressRing, { type RingTone } from '@/components/viz/ProgressRing'
import { MASTERY_BAR_TONE, MASTERY_CHIP_TONE } from '@/lib/analytics/mastery-tone'
import {
  getCapabilityStatusLabel,
  getStudentCapabilitySummary,
  type CapabilityStat,
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

/** Tông vòng tiến độ theo chính con số nó đang vẽ, không theo tông của CTA. */
function accuracyTone(accuracy: number | null): RingTone {
  if (accuracy === null) return 'slate'
  if (accuracy >= 80) return 'emerald'
  if (accuracy >= 50) return 'amber'
  return 'rose'
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
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang dựng hồ sơ năng lực...</p>
        </div>
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
    amber: 'from-amber-600 to-orange-500',
    rose: 'from-rose-600 to-red-500',
    slate: 'from-slate-700 to-slate-900',
  }[summary.recommendedAction.tone]

  // Ba giá trị dưới đây phân biệt "chưa có" với "bằng 0". `percent()` trong
  // student-capability trả 0 cho cả hai trường hợp, nên phải kiểm mẫu số ở đây.
  const accuracy = summary.totals.answered > 0 ? summary.totals.accuracy : null
  const completion = summary.totals.assigned > 0 ? summary.totals.completionRate : null

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pt-16 lg:p-6">
      <header className="animate-dash-in bento-tile-lead overflow-hidden">
        <div className="paper-grid p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {advanced ? 'Phân tích nâng cao' : 'Tổng quan học tập'}
              </div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">Hồ sơ năng lực</h1>
              <p className="mt-2 max-w-prose text-slate-600 dark:text-slate-300">
                Theo dõi bài được giao, độ chính xác và các mảng cần củng cố.
              </p>
              <p className="mt-3">
                <span className="rounded-full border border-slate-200 bg-[var(--background-card)] px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {advanced ? 'Gói nâng cao' : 'Gói cơ bản'}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-6 sm:gap-8">
              <div className="text-center">
                <ProgressRing
                  value={accuracy}
                  size={96}
                  tone={accuracyTone(accuracy)}
                  caption="đúng"
                  ariaLabel={
                    accuracy === null
                      ? 'Chưa trả lời câu nào nên chưa tính được độ chính xác'
                      : `Độ chính xác ${accuracy}%, trên ${summary.totals.answered} câu đã trả lời`
                  }
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {accuracy === null
                    ? 'Chưa có câu trả lời'
                    : `${summary.totals.correct}/${summary.totals.answered} câu đúng`}
                </p>
              </div>

              <div className="text-center">
                <ProgressRing
                  value={completion}
                  size={96}
                  tone="teal"
                  caption="đã nộp"
                  ariaLabel={
                    completion === null
                      ? 'Chưa được giao bài nào nên chưa có tỷ lệ hoàn thành'
                      : `Đã nộp ${summary.totals.submitted} trên ${summary.totals.assigned} bài được giao`
                  }
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {completion === null
                    ? 'Chưa có bài được giao'
                    : `${summary.totals.submitted}/${summary.totals.assigned} bài`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Bề mặt gradient DUY NHẤT của trang, dành cho hành động quan trọng nhất
          (docs/DESIGN_OVERHAUL_2026-08-09.md mục 2.3). Đừng thêm cái thứ hai. */}
      <section className={`animate-dash-in-1 overflow-hidden rounded-2xl bg-gradient-to-r ${recommendedTone} p-5 text-white shadow-lg`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-white/80">Việc nên làm tiếp theo</p>
            <h2 className="mt-1 text-xl font-semibold">{summary.recommendedAction.label}</h2>
            <p className="mt-1 text-sm text-white/85">{summary.recommendedAction.detail}</p>
          </div>
          <Link
            href={summary.recommendedAction.href}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent"
          >
            Mở ngay
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="animate-dash-in-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={ClipboardList}
          label="Bài được giao"
          value={summary.totals.assigned.toString()}
          note={`${summary.totals.submitted} đã nộp`}
          rail="var(--accent)"
        />
        <MetricCard
          icon={TrendingUp}
          label="Hoàn thành"
          value={completion === null ? '—' : `${completion}%`}
          note={completion === null ? 'Chưa có bài được giao' : `${summary.totals.pending} bài đang chờ`}
          rail="#3b82f6"
        />
        <MetricCard
          icon={Target}
          label="Độ chính xác"
          value={accuracy === null ? '—' : `${accuracy}%`}
          note={accuracy === null ? 'Chưa trả lời câu nào' : `${summary.totals.correct}/${summary.totals.answered} câu đúng`}
          rail="#10b981"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Quá hạn"
          value={summary.totals.overdue.toString()}
          note={summary.totals.overdue > 0 ? 'Cần xử lý trước' : 'Không có bài quá hạn'}
          rail={summary.totals.overdue > 0 ? '#f43f5e' : 'var(--border)'}
        />
      </section>

      {!advanced && <BasicView summary={summary} />}

      {advanced && (
        <>
          <nav
            aria-label="Nhóm thống kê"
            className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--background-card)] p-1 dark:border-slate-700"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={active}
                  className={`inline-flex min-w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {activeTab === 'overview' && <OverviewTab summary={summary} />}
          {activeTab === 'knowledge' && (
            <StatList
              title="Năng lực theo kiến thức"
              items={summary.knowledgeStats}
              emptyText="Chưa có dữ liệu liên kết câu hỏi với kiến thức."
            />
          )}
          {activeTab === 'levels' && (
            <StatList
              title="Độ chính xác theo mức nhận thức"
              items={summary.levelStats}
              emptyText="Chưa có câu trả lời để thống kê theo mức độ."
            />
          )}
          {activeTab === 'homework' && <HomeworkList items={summary.homeworks} />}
        </>
      )}
    </main>
  )
}

function BasicView({ summary }: { summary: StudentCapabilitySummary }) {
  const pending = summary.homeworks.filter((item) => item.status !== 'submitted' && item.status !== 'graded')
  const completion = summary.totals.assigned > 0 ? summary.totals.completionRate : null

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="bento-tile p-5">
        <h2 className="font-bold text-slate-800 dark:text-white">Tiến độ bài được giao</h2>
        {completion === null ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Chưa có bài nào được giao cho bạn. Khi giáo viên giao bài, tiến độ sẽ hiện ở đây.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Bạn đang có {summary.totals.pending} bài cần hoàn thành.
            </p>
            <div
              className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              role="progressbar"
              aria-valuenow={completion}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Đã nộp ${summary.totals.submitted} trên ${summary.totals.assigned} bài`}
            >
              <div className="h-full rounded-full bg-teal-500 transition-[width]" style={{ width: `${completion}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm text-slate-600 dark:text-slate-300">
              <span>{summary.totals.submitted}/{summary.totals.assigned} bài đã nộp</span>
              <span className="font-semibold">{completion}%</span>
            </div>
          </>
        )}
      </section>

      <section className="bento-tile-quiet p-5">
        <div className="mb-3 flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-slate-400" aria-hidden="true" />
          <h2 className="font-bold text-slate-800 dark:text-white">Phân tích nâng cao</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tài khoản cơ bản xem được tiến độ và kết quả chính. Phân tích chi tiết theo kiến thức,
          mức nhận thức và xu hướng học tập nằm trong gói nâng cao.
        </p>
      </section>

      <section className="bento-tile p-5 lg:col-span-2">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-800 dark:text-white">
          <CalendarClock className="h-5 w-5 text-amber-500" aria-hidden="true" />
          Bài đang chờ
        </h2>
        <div className="space-y-2">
          {pending.slice(0, 5).map((item) => (
            <HomeworkRow key={item.assignmentId} item={item} />
          ))}
          {!pending.length && (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Không có bài đang chờ.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function OverviewTab({ summary }: { summary: StudentCapabilitySummary }) {
  const weakKnowledge = summary.knowledgeStats
    .filter((item) => item.status === 'needs_work' || item.status === 'building')
    .slice(0, 4)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
    <section className="bento-tile p-5">
      <h2 className="font-bold text-slate-800 dark:text-white">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.correct}/{item.total} câu đúng</p>
              </div>
              {/* Trạng thái = màu + chữ; bảng màu dùng chung với WeakAreas. */}
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${MASTERY_CHIP_TONE[item.status]}`}>
                {getCapabilityStatusLabel(item.status)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuenow={item.accuracy}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label}: đúng ${item.accuracy}%`}
              >
                <div className={`h-full rounded-full ${MASTERY_BAR_TONE[item.status]}`} style={{ width: `${item.accuracy}%` }} />
              </div>
              <span className="font-baloo w-10 text-right text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {item.accuracy}%
              </span>
            </div>
          </div>
        ))}
        {!items.length && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>}
      </div>
      {!compact && items.length > 0 && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Mốc đánh giá dựa trên số câu đã làm và tỷ lệ đúng.
        </p>
      )}
    </section>
  )
}

function HomeworkList({ items, compact = false }: { items: HomeworkCapabilityItem[]; compact?: boolean }) {
  return (
    <section className="bento-tile p-5">
      <h2 className="font-bold text-slate-800 dark:text-white">Bài được giao</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => <HomeworkRow key={item.assignmentId} item={item} />)}
        {!items.length && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Chưa có bài được giao.</p>
        )}
      </div>
      {!compact && items.length > 0 && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Độ chính xác tính trên số câu đã trả lời.</p>
      )}
    </section>
  )
}

function HomeworkRow({ item }: { item: HomeworkCapabilityItem }) {
  const done = item.status === 'submitted' || item.status === 'graded'
  // Bài chưa biết có bao nhiêu câu thì không có tiến độ để vẽ.
  const progress = item.total > 0 ? item.completionRate : null

  return (
    <Link
      href={`/homework/prepare/${item.assignmentId}`}
      className="group block rounded-xl border border-slate-200 p-3 transition-all hover:border-teal-300 hover:bg-teal-50/40 dark:border-slate-700 dark:hover:border-teal-800 dark:hover:bg-teal-950/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
            {item.title}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {item.deadline ? new Date(item.deadline).toLocaleString('vi-VN') : 'Không hạn nộp'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
          done
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
            : item.overdue
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
        }`}>
          {done ? 'Đã nộp' : item.overdue ? 'Quá hạn' : 'Đang chờ'}
        </span>
      </div>
      {progress === null ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Chưa rõ số câu của bài này</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Đã trả lời ${item.answered} trên ${item.total} câu`}
          >
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
            {item.answered}/{item.total}
          </span>
        </div>
      )}
    </Link>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  rail,
}: {
  icon: typeof BarChart3
  label: string
  value: string
  note: string
  rail: string
}) {
  return (
    <div className="bento-tile bento-rail p-4" style={{ '--rail': rail } as React.CSSProperties}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="font-baloo text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  )
}
