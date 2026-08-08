/**
 * Lịch sử làm bài và thống kê theo chủ đề / mức độ.
 *
 * Làm đẹp đợt 2026-08-09. Không thêm truy vấn nào; ngược lại BỚT một: hai hàm
 * `fetchTaxonomyStats` và `fetchDifficultyStats` trước đây gọi **cùng một** RPC
 * `get_my_exam_answer_metadata` với **cùng** tham số, hai lần liên tiếp, rồi mỗi
 * hàm tự gộp một kiểu. Giờ gọi một lần và gộp hai bảng từ cùng tập dòng — cùng
 * dữ liệu, cùng kết quả, một round-trip.
 *
 * Ba chỗ sửa ngữ nghĩa hiển thị (mục 7.1 của docs/STUDENT_SKILL_TREE_REDESIGN.md:
 * `null` phải hiện khác `0`):
 *
 *   1. Chưa thi lần nào — trước hiện "0.0" cho điểm cao nhất, "0.0" cho điểm
 *      trung bình và "0%" cho tỷ lệ đạt. Ba số đó đọc thành "đã thi và trượt
 *      sạch". Nay là dấu gạch kèm câu giải thích.
 *   2. Mức độ chưa gặp câu nào — trước vẽ thanh 0%, nhìn giống "làm sai hết".
 *      Nay nói "chưa gặp câu nào".
 *   3. Vòng tỷ lệ đạt chỉ vẽ khi đã có ít nhất một lần nộp.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart3,
  TrendingUp,
  Target,
  Calendar,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  FileText,
  Clock,
  Award,
} from 'lucide-react'
import ProgressRing, { type RingTone } from '@/components/viz/ProgressRing'
import Sparkline from '@/components/viz/Sparkline'

interface HistoryEntry {
  id: string
  exam_id: string
  exam_title: string
  score: number
  submit_time: string
  total_questions: number
  correct_answers: number
}

interface TaxonomyStats {
  topic_id: string
  topic_name: string
  categories: {
    category_id: string
    category_name: string
    sections: {
      section_id: string
      section_name: string
      total: number
      correct: number
      percentage: number
    }[]
    total: number
    correct: number
    percentage: number
  }[]
  total: number
  correct: number
  percentage: number
}

interface DifficultyStats {
  level: number
  name: string
  total: number
  correct: number
  /** `null` khi chưa gặp câu nào ở mức này — khác hẳn "đúng 0%". */
  percentage: number | null
}

interface SectionAccumulator {
  section_id: string
  section_name: string
  total: number
  correct: number
}

interface CategoryAccumulator {
  category_id: string
  category_name: string
  sections: Map<string, SectionAccumulator>
  total: number
  correct: number
}

interface TopicAccumulator {
  topic_id: string
  topic_name: string
  categories: Map<string, CategoryAccumulator>
  total: number
  correct: number
}

interface AnswerMetadataRow {
  is_correct: boolean | null
  difficulty: number | null
  topic_id: string | null
  topic_name: string | null
  category_id: string | null
  category_name: string | null
  section_id: string | null
  section_name: string | null
}

const DIFFICULTY_NAMES = ['', 'Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']

/** Ba bậc dùng chung cho mọi tỷ lệ đúng trong trang. */
function ratioTone(percentage: number): { bar: string; text: string; chip: string; ring: RingTone } {
  if (percentage >= 70) {
    return {
      bar: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      ring: 'emerald',
    }
  }
  if (percentage >= 50) {
    return {
      bar: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      ring: 'amber',
    }
  }
  return {
    bar: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    ring: 'rose',
  }
}

/** Điểm 0-10 → ba bậc màu. Ngưỡng 8 / 5 giống phần còn lại của app. */
function scoreTone(score: number): { text: string; chip: string } {
  if (score >= 8) {
    return {
      text: 'text-emerald-700 dark:text-emerald-400',
      chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    }
  }
  if (score >= 5) {
    return {
      text: 'text-amber-700 dark:text-amber-400',
      chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    }
  }
  return {
    text: 'text-rose-700 dark:text-rose-400',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  }
}

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), [])

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [taxonomyStats, setTaxonomyStats] = useState<TaxonomyStats[]>([])
  const [difficultyStats, setDifficultyStats] = useState<DifficultyStats[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'taxonomy' | 'history'>('overview')
  const [expandedTopics, setExpandedTopics] = useState<string[]>([])
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  useEffect(() => {
    const fetchHistory = async (userId: string) => {
      const { data, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          exam_id,
          score,
          submit_time,
          exams!exam_id (
            title
          )
        `)
        .eq('student_id', userId)
        .eq('status', 'submitted')
        .not('submit_time', 'is', null)
        .order('submit_time', { ascending: false })

      if (error) {
        console.error('Fetch history error:', error)
        return
      }

      setHistory((data || []).map(item => {
        const exam = Array.isArray(item.exams) ? item.exams[0] : item.exams
        return {
          id: item.id,
          exam_id: item.exam_id,
          exam_title: exam?.title || 'Không rõ',
          score: item.score || 0,
          submit_time: item.submit_time!,
          total_questions: 0,
          correct_answers: 0,
        }
      }))
    }

    // Một lần gọi, hai bảng thống kê. Trước đây RPC này được gọi hai lần với
    // đúng cùng tham số — cùng dữ liệu, gấp đôi round-trip.
    const fetchAnswerStats = async () => {
      const { data, error } = await supabase.rpc('get_my_exam_answer_metadata', {
        p_attempt_id: null,
      })

      if (error) {
        console.error('Fetch answer metadata error:', error)
        return
      }

      const rows = (data || []) as AnswerMetadataRow[]

      // --- Theo chủ đề ---
      const statsMap = new Map<string, TopicAccumulator>()

      for (const answer of rows) {
        if (!answer.topic_id || !answer.topic_name) continue

        let topicStats = statsMap.get(answer.topic_id)
        if (!topicStats) {
          topicStats = {
            topic_id: answer.topic_id,
            topic_name: answer.topic_name,
            categories: new Map(),
            total: 0,
            correct: 0,
          }
          statsMap.set(answer.topic_id, topicStats)
        }
        topicStats.total++
        if (answer.is_correct) topicStats.correct++

        if (!answer.category_id || !answer.category_name) continue

        let categoryStats = topicStats.categories.get(answer.category_id)
        if (!categoryStats) {
          categoryStats = {
            category_id: answer.category_id,
            category_name: answer.category_name,
            sections: new Map(),
            total: 0,
            correct: 0,
          }
          topicStats.categories.set(answer.category_id, categoryStats)
        }
        categoryStats.total++
        if (answer.is_correct) categoryStats.correct++

        if (!answer.section_id || !answer.section_name) continue

        let sectionStats = categoryStats.sections.get(answer.section_id)
        if (!sectionStats) {
          sectionStats = {
            section_id: answer.section_id,
            section_name: answer.section_name,
            total: 0,
            correct: 0,
          }
          categoryStats.sections.set(answer.section_id, sectionStats)
        }
        sectionStats.total++
        if (answer.is_correct) sectionStats.correct++
      }

      setTaxonomyStats(Array.from(statsMap.values()).map(topic => ({
        ...topic,
        percentage: topic.total > 0 ? Math.round((topic.correct / topic.total) * 100) : 0,
        categories: Array.from(topic.categories.values()).map(cat => ({
          ...cat,
          percentage: cat.total > 0 ? Math.round((cat.correct / cat.total) * 100) : 0,
          sections: Array.from(cat.sections.values()).map(sec => ({
            ...sec,
            percentage: sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0,
          })),
        })),
      })))

      // --- Theo mức độ ---
      const difficultyMap = new Map<number, { total: number; correct: number }>()
      for (const answer of rows) {
        const level = answer.difficulty || 1
        const stats = difficultyMap.get(level) || { total: 0, correct: 0 }
        stats.total++
        if (answer.is_correct) stats.correct++
        difficultyMap.set(level, stats)
      }

      setDifficultyStats([1, 2, 3, 4].map(level => {
        const stats = difficultyMap.get(level) || { total: 0, correct: 0 }
        return {
          level,
          name: DIFFICULTY_NAMES[level],
          total: stats.total,
          correct: stats.correct,
          percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null,
        }
      }))
    }

    const load = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await Promise.all([fetchHistory(user.id), fetchAnswerStats()])
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase])

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev =>
      prev.includes(topicId) ? prev.filter(id => id !== topicId) : [...prev, topicId]
    )
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    )
  }

  // `null` ở cả bốn chỉ số dưới đây nghĩa là CHƯA CÓ LẦN NỘP NÀO, không phải 0.
  const totalAttempts = history.length
  const hasHistory = totalAttempts > 0
  const avgScore = hasHistory ? history.reduce((sum, h) => sum + h.score, 0) / totalAttempts : null
  const bestScore = hasHistory ? Math.max(...history.map(h => h.score)) : null
  const passRate = hasHistory
    ? Math.round((history.filter(h => h.score >= 5).length / totalAttempts) * 100)
    : null

  // Xu hướng điểm: cũ → mới, tối đa 12 lần gần nhất. `history` xếp giảm dần theo
  // thời gian nộp nên phải đảo lại; Sparkline tự từ chối vẽ khi dưới 3 điểm.
  const scoreTrend = history.slice(0, 12).map(h => h.score).reverse()

  const weakAreas = taxonomyStats
    .flatMap(t => t.categories.flatMap(c =>
      c.sections.filter(s => s.percentage < 60 && s.total >= 3)
        .map(s => ({ ...s, topic: t.topic_name, category: c.category_name }))
    ))
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 5)

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải lịch sử làm bài...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
          <div className="paper-grid p-5 sm:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
                  <Calendar className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  Lịch sử &amp; Thống kê
                </h1>
                <p className="mt-2 max-w-prose text-slate-600 dark:text-slate-300">
                  Theo dõi tiến trình và phân tích điểm mạnh, điểm yếu của bạn.
                </p>

                {/* Đường điểm vẽ như đồ thị hàm số — mô-típ lấy từ chính môn học.
                    Dưới 3 lần nộp thì Sparkline hiện chữ thay vì vẽ một "xu hướng"
                    dựng từ hai điểm. */}
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Điểm {scoreTrend.length > 1 ? `${scoreTrend.length} lần gần nhất` : 'theo thời gian'}
                  </p>
                  <Sparkline
                    values={scoreTrend}
                    width={200}
                    height={44}
                    tone="teal"
                    ariaLabel={
                      scoreTrend.length
                        ? `Xu hướng điểm ${scoreTrend.length} lần nộp gần nhất, mới nhất là ${scoreTrend[scoreTrend.length - 1].toFixed(1)} điểm`
                        : 'Chưa có lần nộp nào để vẽ xu hướng điểm'
                    }
                    emptyText={hasHistory ? 'Cần ít nhất 3 lần nộp để vẽ xu hướng' : 'Chưa có lần nộp nào'}
                  />
                </div>
              </div>

              <div className="shrink-0 text-center">
                <ProgressRing
                  value={passRate}
                  size={96}
                  tone={passRate === null ? 'slate' : ratioTone(passRate).ring}
                  caption="đạt"
                  ariaLabel={
                    passRate === null
                      ? 'Chưa nộp bài nào nên chưa có tỷ lệ đạt'
                      : `Tỷ lệ đạt ${passRate}%, tính trên ${totalAttempts} lần nộp`
                  }
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {hasHistory ? `${totalAttempts} lần nộp • đạt từ 5,0` : 'Chưa nộp bài nào'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="animate-dash-in-1 mb-6 flex w-fit gap-1 rounded-2xl border border-slate-200 bg-[var(--background-card)] p-1 dark:border-slate-700">
          {([
            { key: 'overview', label: 'Tổng quan', icon: TrendingUp },
            { key: 'taxonomy', label: 'Theo chủ đề', icon: BarChart3 },
            { key: 'history', label: 'Lịch sử', icon: Calendar },
          ] as const).map(tab => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                icon={FileText}
                label="Số lần thi"
                value={totalAttempts.toString()}
                rail="var(--accent)"
              />
              <StatTile
                icon={Target}
                label="Điểm cao nhất"
                value={bestScore === null ? '—' : bestScore.toFixed(1)}
                note={bestScore === null ? 'Chưa có lần nộp nào' : undefined}
                rail="#10b981"
              />
              <StatTile
                icon={TrendingUp}
                label="Điểm trung bình"
                value={avgScore === null ? '—' : avgScore.toFixed(1)}
                note={avgScore === null ? 'Chưa có lần nộp nào' : undefined}
                rail="#3b82f6"
              />
              <StatTile
                icon={Award}
                label="Tỷ lệ đạt"
                value={passRate === null ? '—' : `${passRate}%`}
                note={passRate === null ? 'Chưa có lần nộp nào' : 'Từ 5,0 điểm trở lên'}
                rail="#f59e0b"
              />
            </div>

            <section className="bento-tile p-5 sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-800 dark:text-white">Thống kê theo mức độ</h2>
              <div className="space-y-4">
                {difficultyStats.map(stat => (
                  <div key={stat.level}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{stat.name}</span>
                      {stat.percentage === null ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Chưa gặp câu nào</span>
                      ) : (
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {stat.correct}/{stat.total}{' '}
                          <span className={`font-semibold ${ratioTone(stat.percentage).text}`}>({stat.percentage}%)</span>
                        </span>
                      )}
                    </div>
                    {/* Mức chưa gặp câu nào thì rãnh để trống, KHÔNG vẽ thanh 0% —
                        thanh 0% đọc thành "đã làm và sai hết". */}
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                      role={stat.percentage === null ? undefined : 'progressbar'}
                      aria-valuenow={stat.percentage ?? undefined}
                      aria-valuemin={stat.percentage === null ? undefined : 0}
                      aria-valuemax={stat.percentage === null ? undefined : 100}
                      aria-label={stat.percentage === null ? undefined : `${stat.name}: đúng ${stat.percentage}%`}
                    >
                      {stat.percentage !== null && (
                        <div
                          className={`h-full ${ratioTone(stat.percentage).bar} transition-[width]`}
                          style={{ width: `${stat.percentage}%` }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {weakAreas.length > 0 && (
              <section className="bento-tile bento-rail p-5 sm:p-6" style={{ '--rail': '#f43f5e' } as React.CSSProperties}>
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Phần cần cải thiện</h2>
                </div>
                <ul className="space-y-3">
                  {weakAreas.map((area, index) => {
                    const tone = ratioTone(area.percentage)
                    return (
                      <li
                        key={`${area.section_id}-${index}`}
                        className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 dark:text-white">{area.section_name}</p>
                          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                            {area.topic} → {area.category}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-baloo text-lg font-bold tabular-nums ${tone.text}`}>{area.percentage}%</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{area.correct}/{area.total} câu</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

        {activeTab === 'taxonomy' && (
          <div className="space-y-3">
            {taxonomyStats.length === 0 ? (
              <div className="bento-tile p-12 text-center">
                <BarChart3 className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <p className="font-medium text-slate-700 dark:text-slate-200">Chưa có dữ liệu thống kê</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Thống kê theo chủ đề xuất hiện sau khi bạn nộp bài đầu tiên.
                </p>
              </div>
            ) : (
              taxonomyStats.map(topic => {
                const tone = ratioTone(topic.percentage)
                const open = expandedTopics.includes(topic.topic_id)
                return (
                  <div key={topic.topic_id} className="bento-tile overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleTopic(topic.topic_id)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800 dark:text-white">
                            {topic.topic_name}
                          </span>
                          <span className="block text-sm text-slate-500 dark:text-slate-400">
                            {topic.correct}/{topic.total} câu đúng
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 sm:block">
                          <span className={`block h-full ${tone.bar}`} style={{ width: `${topic.percentage}%` }} />
                        </span>
                        <span className={`font-baloo text-lg font-bold tabular-nums ${tone.text}`}>
                          {topic.percentage}%
                        </span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-slate-200 dark:border-slate-700">
                        {topic.categories.map(category => {
                          const catTone = ratioTone(category.percentage)
                          const catOpen = expandedCategories.includes(category.category_id)
                          return (
                            <div key={category.category_id}>
                              <button
                                type="button"
                                onClick={() => toggleCategory(category.category_id)}
                                aria-expanded={catOpen}
                                className="flex w-full items-center justify-between gap-3 bg-slate-50 py-3 pl-12 pr-4 text-left transition-colors hover:bg-slate-100 dark:bg-slate-700/30 dark:hover:bg-slate-700/60"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <ChevronRight
                                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${catOpen ? 'rotate-90' : ''}`}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {category.category_name}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="text-sm text-slate-500 dark:text-slate-400">
                                    {category.correct}/{category.total}
                                  </span>
                                  <span className={`text-sm font-semibold tabular-nums ${catTone.text}`}>
                                    {category.percentage}%
                                  </span>
                                </span>
                              </button>

                              {catOpen && (
                                <ul className="bg-slate-100 dark:bg-slate-800">
                                  {category.sections.map(section => (
                                    <li
                                      key={section.section_id}
                                      className="flex items-center justify-between gap-3 border-t border-slate-200 py-2 pl-20 pr-4 dark:border-slate-700"
                                    >
                                      <span className="truncate text-sm text-slate-600 dark:text-slate-300">
                                        {section.section_name}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          {section.correct}/{section.total}
                                        </span>
                                        <span className={`rounded px-2 py-0.5 text-sm font-medium tabular-nums ${ratioTone(section.percentage).chip}`}>
                                          {section.percentage}%
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="bento-tile p-12 text-center">
                <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <p className="font-medium text-slate-700 dark:text-slate-200">Chưa có lịch sử làm bài</p>
                <Link
                  href="/student/exams"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Chọn một đề để bắt đầu
                </Link>
              </div>
            ) : (
              history.map(item => {
                const tone = scoreTone(item.score)
                return (
                  <Link
                    key={item.id}
                    href={`/result/${item.id}`}
                    className="bento-tile group flex items-center justify-between gap-4 p-4"
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <span className={`font-baloo flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold tabular-nums ${tone.chip}`}>
                        {item.score.toFixed(1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 transition-colors group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                          {item.exam_title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {new Date(item.submit_time).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                    </span>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-400"
                      aria-hidden="true"
                    />
                  </Link>
                )
              })
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
  rail,
}: {
  icon: typeof FileText
  label: string
  value: string
  note?: string
  rail: string
}) {
  return (
    <div className="bento-tile bento-rail p-4" style={{ '--rail': rail } as React.CSSProperties}>
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </div>
      <p className="font-baloo text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  )
}
