/**
 * Khung dùng chung cho hai danh sách đề: Ôn tập và Thi thử.
 *
 * Thi công Phase 10 (docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.5). Trước đây
 * `/student/practice` và `/student/exams` là hai bản chép tay của cùng một trang
 * nên đã trôi khỏi nhau: một bên tách `PRACTICE_FILTERS` thành hằng, một bên viết
 * inline kèm `filterStatus as any`; một bên có icon cạnh `h1`, bên kia không; bên
 * `exams` còn import `Filter` và `AlertCircle` mà không dùng (mục 6.5 và mục 9).
 * Gộp về một component xoá cả bốn khoản nợ đó trong một lần sửa.
 *
 * KHÔNG gộp phần truy vấn của hai chế độ. `practice` cần biết attempt đang dở để
 * cho "Tiếp tục"; `simulation` đi qua trang chuẩn bị `/exam/prepare/:id` và cố ý
 * không đọc attempt. Gộp query lại nghĩa là chế độ thi thử bắt đầu tải dữ liệu nó
 * không dùng, và bề mặt của một mode rò sang mode kia — điều `AGENTS.md` mục 4
 * cấm. Cái được dùng chung là KHUNG, không phải nguồn dữ liệu.
 *
 * Ràng buộc ngữ nghĩa của cột thành tích (mục 7.1):
 *
 *   Đề chưa làm KHÔNG hiện `0%`. "Chưa có kết quả" và "được 0 điểm" là hai
 *   chuyện khác nhau; vẽ vòng 0% cho cả hai là đúng loại nhầm lẫn đã sinh ra lỗi
 *   node emerald "Đã đạt 80%" khi học sinh sai toàn bộ. Đề chưa làm nhận một ô
 *   rỗng có chủ đích, đề được 0 điểm thật thì vẫn vẽ vòng 0%.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  RotateCcw,
  Search,
  Timer,
  Trophy,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProgressRing from '@/components/viz/ProgressRing'

export type AssessmentMode = 'practice' | 'simulation'

/** Bốn trạng thái một đề có thể ở, theo góc nhìn của học sinh. */
type FilterKey = 'all' | 'in_progress' | 'not_started' | 'completed'

interface AssessmentItem {
  id: string
  title: string
  description: string | null
  subject: string
  duration: number
  grade: number | null
  /** Số lần đã nộp. */
  attemptCount: number
  /** `null` = chưa có lần nộp nào. KHÁC HẲN `0` = đã nộp và được 0 điểm. */
  bestScore: number | null
  /** Chỉ chế độ ôn tập mới theo dõi bài đang làm dở. */
  inProgressAttemptId: string | null
  inProgressAnswered: number
}

/** `id` chỉ được đọc ở chế độ ôn tập, nơi cần mở lại bài đang làm dở. */
interface AttemptRow {
  id?: string
  exam_id: string
  score: number | null
  status: string | null
}

interface ModeConfig {
  /** Giá trị lọc `exams.exam_mode`. Đây là ranh giới giữa hai miền. */
  examMode: AssessmentMode
  heading: string
  tagline: string
  searchPlaceholder: string
  loadingText: string
  emptyAll: string
  emptyFiltered: string
  filters: Array<{ key: FilterKey; label: string }>
  startLabel: string
  againLabel: string
  countLabel: (count: number) => string
  /** Chế độ có theo dõi bài đang làm dở hay không. */
  resumable: boolean
}

const MODES: Record<AssessmentMode, ModeConfig> = {
  practice: {
    examMode: 'practice',
    heading: 'Ôn tập',
    tagline: 'Làm bài không giới hạn thời gian, tiến độ được lưu tự động.',
    searchPlaceholder: 'Tìm đề ôn tập...',
    loadingText: 'Đang tải đề ôn tập...',
    emptyAll: 'Chưa có đề ôn tập nào dành cho bạn.',
    emptyFiltered: 'Không có đề ôn tập nào khớp bộ lọc.',
    filters: [
      { key: 'all', label: 'Tất cả' },
      { key: 'in_progress', label: 'Đang làm' },
      { key: 'not_started', label: 'Chưa làm' },
      { key: 'completed', label: 'Đã xong' },
    ],
    startLabel: 'Bắt đầu',
    againLabel: 'Làm lại',
    countLabel: (count) => `Đã làm ${count} lần`,
    resumable: true,
  },
  simulation: {
    examMode: 'simulation',
    heading: 'Thi thử',
    tagline: 'Làm bài có giới hạn thời gian, giống điều kiện thi thật.',
    searchPlaceholder: 'Tìm đề thi thử...',
    loadingText: 'Đang tải đề thi...',
    emptyAll: 'Chưa có đề thi thử nào dành cho bạn.',
    emptyFiltered: 'Không có đề thi nào khớp bộ lọc.',
    filters: [
      { key: 'all', label: 'Tất cả' },
      { key: 'not_started', label: 'Chưa thi' },
      { key: 'completed', label: 'Đã thi' },
    ],
    startLabel: 'Bắt đầu',
    againLabel: 'Thi lại',
    countLabel: (count) => `Đã thi ${count} lần`,
    resumable: false,
  },
}

/** Thang điểm của cả hệ thống là 0-10 (docs/SCORING.md). */
const MAX_SCORE = 10

function readAttemptId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('attempt_id' in value)) {
    return null
  }
  const attemptId = (value as { attempt_id?: unknown }).attempt_id
  return typeof attemptId === 'string' && attemptId.length > 0 ? attemptId : null
}

/** Điểm 0-10 quy sang phần trăm của điểm tối đa. Kẹp lại để dữ liệu xấu không vẽ tràn vòng. */
function scorePercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round((score / MAX_SCORE) * 100)))
}

/** Ba trạng thái hiển thị. Dùng cho cả dải màu cạnh ô lẫn huy hiệu trong tiêu đề. */
type ItemState = 'in_progress' | 'completed' | 'not_started'

function stateOf(item: AssessmentItem): ItemState {
  if (item.inProgressAttemptId) return 'in_progress'
  if (item.attemptCount > 0) return 'completed'
  return 'not_started'
}

/** Màu dải cạnh ô. Giá trị CSS thô vì `--rail` không nhận tên utility. */
const RAIL: Record<ItemState, string> = {
  in_progress: '#f59e0b',
  completed: '#10b981',
  not_started: 'var(--border)',
}

export default function AssessmentListPage({ mode }: { mode: AssessmentMode }) {
  const config = MODES[mode]
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<AssessmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterKey>('all')
  const [studentGrade, setStudentGrade] = useState<number | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('grade')
        .eq('id', user.id)
        .single()

      const grade = profile?.grade || null
      setStudentGrade(grade)

      let query = supabase
        .from('exams')
        .select('id, title, description, subject, duration, is_published, created_at, grade')
        .eq('is_published', true)
        .eq('exam_mode', config.examMode)
        .order('created_at', { ascending: false })

      if (grade) query = query.eq('grade', grade)

      const { data: examsData, error } = await query
      if (error) {
        console.error('Fetch exams error:', error)
        return
      }

      const examIds = (examsData || []).map((exam) => exam.id)

      // Chế độ không resume chỉ đọc `exam_id, score, status` — giữ đúng tập cột
      // mà trang cũ đã đọc, không mở rộng theo kiểu "gộp cho tiện".
      //
      // Hai nhánh viết tách ra chứ không truyền chuỗi động vào `.select()`: chuỗi
      // cột của supabase-js được suy kiểu ở mức type, nên một biểu thức điều kiện
      // biến kết quả thành `ParserError` và mất luôn kiểu trả về.
      let attemptRows: AttemptRow[] = []
      if (examIds.length) {
        const { data } = config.resumable
          ? await supabase
              .from('exam_attempts')
              .select('id, exam_id, score, status')
              .eq('student_id', user.id)
              .in('exam_id', examIds)
          : await supabase
              .from('exam_attempts')
              .select('exam_id, score, status')
              .eq('student_id', user.id)
              .in('exam_id', examIds)
        attemptRows = (data || []) as AttemptRow[]
      }

      const answeredCounts: Record<string, number> = {}
      if (config.resumable) {
        const openAttemptIds = attemptRows
          .filter((row) => row.status === 'in_progress')
          .map((row) => row.id)
          .filter((id): id is string => Boolean(id))

        if (openAttemptIds.length > 0) {
          const { data: answerRows } = await supabase
            .from('student_answers')
            .select('attempt_id')
            .in('attempt_id', openAttemptIds)

          for (const row of answerRows || []) {
            answeredCounts[row.attempt_id] = (answeredCounts[row.attempt_id] || 0) + 1
          }
        }
      }

      setItems((examsData || []).map((exam) => {
        const forExam = attemptRows.filter((row) => row.exam_id === exam.id)
        const submitted = forExam.filter((row) => row.status === 'submitted')
        const open = config.resumable ? forExam.find((row) => row.status === 'in_progress') : undefined

        return {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          subject: exam.subject,
          duration: exam.duration,
          grade: exam.grade,
          attemptCount: submitted.length,
          // `null` khi chưa nộp lần nào — cột thành tích dựa vào đúng chỗ này để
          // phân biệt "chưa có kết quả" với "được 0 điểm".
          bestScore: submitted.length > 0 ? Math.max(...submitted.map((row) => row.score || 0)) : null,
          inProgressAttemptId: open?.id || null,
          inProgressAnswered: open?.id ? answeredCounts[open.id] || 0 : 0,
        }
      }))
    } catch (error) {
      console.error('Error fetching exams:', error)
    } finally {
      setLoading(false)
    }
  }, [config.examMode, config.resumable, supabase])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const handleStartPractice = async (examId: string) => {
    setStarting(examId)
    try {
      const { data: attemptResult, error } = await supabase.rpc('start_exam_attempt', {
        p_exam_id: examId,
      })
      const startedAttemptId = readAttemptId(attemptResult)

      if (error || !startedAttemptId) {
        console.error('Create attempt error:', error)
        setStarting(null)
        return
      }

      router.push(`/practice/${startedAttemptId}`)
    } catch (error) {
      console.error('Error starting practice:', error)
      setStarting(null)
    }
  }

  const filtered = items.filter((item) => {
    const needle = searchQuery.trim().toLowerCase()
    const matchesSearch =
      !needle ||
      item.title.toLowerCase().includes(needle) ||
      item.subject.toLowerCase().includes(needle)

    return matchesSearch && (filterStatus === 'all' || stateOf(item) === filterStatus)
  })

  // Tóm tắt ở đầu trang tính từ chính mảng đã tải, nên không thêm truy vấn nào và
  // không thể lệch với danh sách bên dưới.
  const doneCount = items.filter((item) => item.attemptCount > 0).length
  const openCount = items.filter((item) => item.inProgressAttemptId).length
  const scored = items.map((item) => item.bestScore).filter((value): value is number => value !== null)
  const topScore = scored.length ? Math.max(...scored) : null

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-slate-500 dark:text-slate-400">{config.loadingText}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-4xl">
        {/* Đầu trang: giấy kẻ ô + ba con số thật. Không gradient — trang này không
            có một hành động nào quan trọng hơn hẳn phần còn lại, nên suất gradient
            duy nhất của trang (mục 7.2) để dành, không tiêu bừa. */}
        <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
          <div className="paper-grid p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
                  {mode === 'practice'
                    ? <BookOpen className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    : <Timer className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />}
                  {config.heading}
                  {studentGrade && (
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      Lớp {studentGrade}
                    </span>
                  )}
                </h1>
                <p className="mt-2 max-w-prose text-slate-600 dark:text-slate-300">{config.tagline}</p>
              </div>

              <dl className="flex flex-wrap gap-2">
                <SummaryChip label="đề" value={String(items.length)} />
                {config.resumable && openCount > 0 && (
                  <SummaryChip
                    label="đang làm dở"
                    value={String(openCount)}
                    className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  />
                )}
                <SummaryChip
                  label="đã hoàn thành"
                  value={String(doneCount)}
                  className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                />
                {/* Chưa nộp bài nào thì hiện dấu gạch, không hiện "0,0" — 0 điểm là
                    một kết quả, còn đây là chưa có kết quả. */}
                <SummaryChip
                  label="điểm cao nhất"
                  value={topScore === null ? '—' : topScore.toFixed(1)}
                  className="border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200"
                />
              </dl>
            </div>
          </div>
        </header>

        <div className="animate-dash-in-1 mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              aria-label={config.searchPlaceholder}
              placeholder={config.searchPlaceholder}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-[var(--background-raised)] py-2.5 pl-10 pr-4 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Lọc theo trạng thái">
            {config.filters.map((filter) => {
              const active = filterStatus === filter.key
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setFilterStatus(filter.key)}
                  aria-pressed={active}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-[var(--background-card)] text-slate-600 hover:border-teal-400 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bento-tile p-12 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="text-slate-600 dark:text-slate-300">
                {searchQuery || filterStatus !== 'all' ? config.emptyFiltered : config.emptyAll}
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <AssessmentCard
                key={item.id}
                item={item}
                config={config}
                starting={starting === item.id}
                onStartPractice={handleStartPractice}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )
}

/**
 * `flex-row-reverse` chứ không đảo thứ tự thẻ: `<dl>` bắt buộc `<dt>` đứng trước
 * `<dd>` trong DOM, còn thị giác thì cần số đứng trước nhãn. Một class giải quyết
 * cả hai, thay vì viết HTML sai để lấy đúng bố cục.
 */
function SummaryChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div
      className={`inline-flex flex-row-reverse items-baseline gap-2 rounded-xl border px-3 py-2 ${
        className || 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      <dt className="text-xs font-medium">{label}</dt>
      <dd className="font-baloo text-lg font-bold leading-none tabular-nums">{value}</dd>
    </div>
  )
}

function AssessmentCard({
  item,
  config,
  starting,
  onStartPractice,
}: {
  item: AssessmentItem
  config: ModeConfig
  starting: boolean
  onStartPractice: (examId: string) => void
}) {
  const state = stateOf(item)

  return (
    <article
      className="bento-tile bento-rail p-4 sm:p-5"
      style={{ '--rail': RAIL[state] } as React.CSSProperties}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-white">{item.title}</h2>
            {/* Trạng thái = màu + icon + chữ (DESIGN_SYSTEM.md). */}
            {state === 'in_progress' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Đang làm dở
              </span>
            )}
            {state === 'completed' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Đã hoàn thành
              </span>
            )}
          </div>

          {item.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {config.resumable ? 'Không giới hạn thời gian' : `${item.duration} phút`}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {item.subject}
            </span>
            {state === 'in_progress' && (
              <span className="font-medium text-amber-700 dark:text-amber-300">
                Đã trả lời {item.inProgressAnswered} câu
              </span>
            )}
          </div>
        </div>

        <AchievementColumn
          item={item}
          config={config}
          state={state}
          starting={starting}
          onStartPractice={onStartPractice}
        />
      </div>
    </article>
  )
}

/**
 * Cột thành tích + hành động.
 *
 * Ba nhánh, và ba nhánh này KHÔNG được gộp:
 *
 *   - đã nộp ít nhất một lần → vòng tiến độ theo điểm cao nhất (kể cả 0 điểm);
 *   - đang làm dở            → không có điểm nào để vẽ, hiện số câu đã trả lời;
 *   - chưa làm               → ô rỗng có chủ đích, chỉ còn lời mời bắt đầu.
 *
 * Nhánh thứ ba là lý do component này tồn tại. Trước Phase 10 hai trang hiển thị
 * "Điểm cao nhất" bằng một dòng chữ teal, và đề chưa làm thì đơn giản là mất dòng
 * đó — mắt đọc thành "chưa có gì ở đây" chứ không thành "chưa có kết quả".
 */
function AchievementColumn({
  item,
  config,
  state,
  starting,
  onStartPractice,
}: {
  item: AssessmentItem
  config: ModeConfig
  state: ItemState
  starting: boolean
  onStartPractice: (examId: string) => void
}) {
  const buttonClass =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-60'

  return (
    <div className="flex items-center gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 sm:w-40 sm:shrink-0 sm:flex-col sm:justify-center sm:gap-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
        {item.bestScore !== null ? (
          <>
            <ProgressRing
              value={scorePercent(item.bestScore)}
              size={64}
              thickness={6}
              tone={item.bestScore >= 8 ? 'emerald' : item.bestScore >= 5 ? 'amber' : 'rose'}
              ariaLabel={`Điểm cao nhất ${item.bestScore.toFixed(1)} trên ${MAX_SCORE}`}
            />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Cao nhất {item.bestScore.toFixed(1)}/{MAX_SCORE}
            </p>
            <p className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Trophy className="h-3 w-3" aria-hidden="true" />
              {config.countLabel(item.attemptCount)}
            </p>
          </>
        ) : (
          <>
            {/* Vòng gạch đứt, KHÔNG phải vòng 0%. Hình cũng phải nói "chưa đo",
                không chỉ có chữ nói vậy. */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-dashed border-slate-300 text-slate-400 dark:border-slate-600 dark:text-slate-500"
              aria-hidden="true"
            >
              {state === 'in_progress' ? <Clock className="h-6 w-6" /> : <Play className="h-5 w-5" />}
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {state === 'in_progress' ? 'Chưa nộp lần nào' : 'Chưa có kết quả'}
            </p>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
        {state === 'in_progress' && item.inProgressAttemptId ? (
          <Link
            href={`/practice/${item.inProgressAttemptId}`}
            className={`${buttonClass} bg-amber-600 hover:bg-amber-700 focus:ring-amber-500`}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Tiếp tục
          </Link>
        ) : config.resumable ? (
          <button
            type="button"
            onClick={() => onStartPractice(item.id)}
            disabled={starting}
            className={`${buttonClass} bg-teal-600 hover:bg-teal-700 focus:ring-teal-500`}
          >
            {item.attemptCount > 0
              ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
              : <Play className="h-4 w-4" aria-hidden="true" />}
            {starting ? 'Đang mở...' : item.attemptCount > 0 ? config.againLabel : config.startLabel}
          </button>
        ) : (
          <Link
            href={`/exam/prepare/${item.id}`}
            className={`${buttonClass} bg-teal-600 hover:bg-teal-700 focus:ring-teal-500`}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {item.attemptCount > 0 ? config.againLabel : config.startLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
