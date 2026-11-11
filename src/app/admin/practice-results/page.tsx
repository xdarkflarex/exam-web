'use client'

/**
 * Kết quả ôn tập theo từng đề: em nào đã làm, đúng bao nhiêu câu, làm mấy lần,
 * đang làm dở tới đâu, và — khi chọn một lớp — em nào chưa làm.
 *
 * Phần tính nằm ở `src/lib/analytics/practice-results.ts` (có test); phần đọc
 * database ở `practice-results-data.ts` (có phân trang). Trang này chỉ lọc và vẽ.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, BookOpenCheck, CheckCircle2, ClipboardCheck, Clock,
  Loader2, RefreshCw, Search, UserX, Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import {
  examOverview,
  formatRate,
  sortStudentRows,
  summarizeExamAttempts,
  type PracticeSort,
  type StudentRowInput,
} from '@/lib/analytics/practice-results'
import {
  fetchPracticeResultsData,
  type PracticeResultsData,
} from '@/lib/analytics/practice-results-data'

/** `14:05 10/11` — giờ trước ngày, đúng cách giáo viên đọc lịch sử nộp bài. */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const two = (value: number) => String(value).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())} ${two(date.getDate())}/${two(date.getMonth() + 1)}`
}

function formatScore(score: number | null): string {
  return score === null ? '' : score.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

const SORT_LABELS: Record<PracticeSort, string> = {
  recent: 'Mới nộp nhất',
  name: 'Tên A–Z',
  best: 'Kết quả tốt nhất',
}

/** Chuỗi các lần quá dài thì chỉ giữ mấy lần cuối — xu hướng gần đây mới đáng xem. */
const MAX_HISTORY = 6

export default function PracticeResultsPage() {
  const [data, setData] = useState<PracticeResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<PracticeSort>('recent')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchPracticeResultsData())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không tải được dữ liệu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const studentById = useMemo(
    () => new Map((data?.students ?? []).map((student) => [student.id, student])),
    [data]
  )
  const classById = useMemo(
    () => new Map((data?.classes ?? []).map((classRow) => [classRow.id, classRow])),
    [data]
  )

  // Lọc lượt theo lớp TRƯỚC khi gom: số liệu tổng quan của đề phải là của lớp
  // đang xem, không phải của cả trường.
  const scopedAttempts = useMemo(() => {
    const attempts = data?.attempts ?? []
    if (classFilter === 'all') return attempts
    return attempts.filter((attempt) => studentById.get(attempt.student_id)?.class_id === classFilter)
  }, [data, classFilter, studentById])

  // Đề có người làm gần đây nhất lên đầu; đề chưa ai làm xếp theo ngày tạo.
  const examList = useMemo(() => {
    const exams = data?.exams ?? []
    return exams
      .map((exam) => ({ exam, overview: examOverview(exam.id, scopedAttempts) }))
      .sort((a, b) => {
        const timeA = a.overview.lastSubmittedAt ? Date.parse(a.overview.lastSubmittedAt) : 0
        const timeB = b.overview.lastSubmittedAt ? Date.parse(b.overview.lastSubmittedAt) : 0
        if (timeA !== timeB) return timeB - timeA
        return Date.parse(b.exam.created_at ?? '') - Date.parse(a.exam.created_at ?? '')
      })
  }, [data, scopedAttempts])

  const activeExamId = selectedExamId ?? examList[0]?.exam.id ?? null
  const active = examList.find((item) => item.exam.id === activeExamId) ?? null

  const rows = useMemo(() => {
    if (!active || !data) return []
    const summaries = summarizeExamAttempts(active.exam.id, scopedAttempts, data.answeredCounts)
    const bySummary = new Map(summaries.map((summary) => [summary.studentId, summary]))

    // Chọn một lớp thì hiện CẢ các em chưa làm — đó là danh sách cần nhắc.
    // "Tất cả lớp" thì không: chưa làm của cả trường là một danh sách vô dụng.
    const ids = new Set(summaries.map((summary) => summary.studentId))
    if (classFilter !== 'all') {
      for (const student of data.students) if (student.class_id === classFilter) ids.add(student.id)
    }

    const needle = search.trim().toLowerCase()
    const inputs: StudentRowInput[] = [...ids]
      .map((id) => {
        const student = studentById.get(id)
        return { id, name: student?.full_name || student?.email || 'Không rõ tên', summary: bySummary.get(id) ?? null }
      })
      .filter((row) => {
        if (!needle) return true
        const student = studentById.get(row.id)
        return `${row.name} ${student?.email ?? ''}`.toLowerCase().includes(needle)
      })
    return sortStudentRows(inputs, sort)
  }, [active, data, scopedAttempts, classFilter, search, sort, studentById])

  const notStarted = classFilter === 'all' ? null : rows.filter((row) => !row.summary).length

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader title="Kết quả ôn tập" subtitle="Đề ôn tập nào, em nào đã làm, đúng bao nhiêu câu" />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-3 py-24 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang tải kết quả ôn tập…
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>Không tải được dữ liệu: {error}</p>
              <button onClick={() => void load()} className="mt-2 font-semibold underline">Thử lại</button>
            </div>
          </div>
        ) : examList.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-800">
            <BookOpenCheck className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">Chưa có đề ôn tập nào</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tạo đề và chọn loại &ldquo;Ôn tập&rdquo; ở{' '}
              <Link href="/admin/exams" className="font-semibold text-teal-700 underline dark:text-teal-300">Đề thi</Link>.
            </p>
          </div>
        ) : (
          <>
            {data?.warnings.map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{warning}</p>
              </div>
            ))}

            {/* Bộ lọc dùng chung cho danh sách đề và bảng học sinh. */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_auto_auto_auto]">
                <label className="relative">
                  <span className="sr-only">Tìm học sinh</span>
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm học sinh theo tên hoặc email…"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <select
                  value={classFilter}
                  onChange={(event) => setClassFilter(event.target.value)}
                  aria-label="Lọc theo lớp"
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="all">Tất cả lớp</option>
                  {(data?.classes ?? []).map((classRow) => (
                    <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
                  ))}
                </select>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as PracticeSort)}
                  aria-label="Sắp xếp học sinh"
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  {(Object.keys(SORT_LABELS) as PracticeSort[]).map((key) => (
                    <option key={key} value={key}>{SORT_LABELS[key]}</option>
                  ))}
                </select>
                <button
                  onClick={() => void load()}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-400"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              {/* Danh sách đề. Điện thoại: một ô chọn; màn rộng: một cột để nhìn
                  cả các đề cùng lúc — đề nào đang được làm nhiều thấy ngay. */}
              <div>
                <label className="lg:hidden">
                  <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Đề ôn tập</span>
                  <select
                    value={activeExamId ?? ''}
                    onChange={(event) => setSelectedExamId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {examList.map(({ exam, overview }) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} — {overview.studentsSubmitted} em
                      </option>
                    ))}
                  </select>
                </label>

                <nav aria-label="Đề ôn tập" className="hidden max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1 lg:block">
                  {examList.map(({ exam, overview }) => {
                    const selected = exam.id === activeExamId
                    return (
                      <button
                        key={exam.id}
                        onClick={() => setSelectedExamId(exam.id)}
                        aria-current={selected ? 'true' : undefined}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? 'border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-900/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                        }`}
                      >
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{exam.title}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {exam.grade ? `Lớp ${exam.grade} · ` : ''}
                          {overview.studentsSubmitted} em · {overview.submissions} lượt
                          {overview.averageLatestRate !== null && ` · đúng TB ${Math.round(overview.averageLatestRate * 100)}%`}
                        </p>
                        {exam.is_published === false && (
                          <span className="mt-1.5 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            Chưa xuất bản
                          </span>
                        )}
                      </button>
                    )
                  })}
                </nav>
              </div>

              {active && (
                <div className="min-w-0 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{active.exam.title}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {classFilter === 'all'
                        ? 'Tất cả lớp — chọn một lớp để thấy cả các em chưa làm.'
                        : `Lớp ${classById.get(classFilter)?.name ?? ''}`}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Metric icon={CheckCircle2} label="Đã nộp" value={`${active.overview.studentsSubmitted} em`} note={`${active.overview.submissions} lượt nộp`} />
                    <Metric
                      icon={ClipboardCheck}
                      label="Đúng trung bình"
                      value={active.overview.averageLatestRate === null ? '–' : `${Math.round(active.overview.averageLatestRate * 100)}%`}
                      note="Tính trên lần gần nhất của mỗi em"
                    />
                    <Metric icon={Clock} label="Đang làm dở" value={`${active.overview.inProgress} em`} note="Đã mở đề, chưa nộp" />
                    <Metric
                      icon={UserX}
                      label="Chưa làm"
                      value={notStarted === null ? '–' : `${notStarted} em`}
                      note={notStarted === null ? 'Chọn một lớp để đếm' : 'Trong lớp đang chọn'}
                    />
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {rows.length === 0 ? (
                      <div className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
                        <Users className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                        {search.trim()
                          ? 'Không có học sinh nào khớp từ khoá.'
                          : classFilter === 'all'
                            ? 'Chưa em nào làm đề này. Chọn một lớp để xem danh sách các em chưa làm.'
                            : 'Lớp này chưa có học sinh nào.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-sm">
                          <thead className="bg-slate-100 text-left text-xs font-medium uppercase text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                            <tr>
                              <th className="px-3 py-3">Học sinh</th>
                              <th className="px-3 py-3">Lần gần nhất</th>
                              <th className="px-3 py-3">Các lần — số câu đúng</th>
                              <th className="px-3 py-3">Trạng thái</th>
                              <th className="px-3 py-3 text-right">Bài làm</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {rows.map((row) => {
                              const student = studentById.get(row.id)
                              const summary = row.summary
                              const latest = summary?.latest ?? null
                              const best = summary?.best ?? null
                              const history = summary?.history ?? []
                              const shown = history.slice(-MAX_HISTORY)
                              return (
                                <tr key={row.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                  <td className="px-3 py-3">
                                    <Link
                                      href={`/admin/students/${row.id}`}
                                      className="whitespace-nowrap font-medium text-slate-800 hover:text-teal-700 hover:underline dark:text-slate-100 dark:hover:text-teal-300"
                                    >
                                      {row.name}
                                    </Link>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {(student?.class_id && classById.get(student.class_id)?.name) || 'Chưa xếp lớp'}
                                    </p>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3">
                                    {latest ? (
                                      <>
                                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                                          Đúng {latest.correct}/{latest.total} câu{' '}
                                          <span className="font-normal text-slate-500 dark:text-slate-400">
                                            ({formatRate(latest.correct, latest.total)})
                                          </span>
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                          {latest.score !== null && `Điểm ${formatScore(latest.score)} · `}
                                          {formatTime(latest.submittedAt)}
                                        </p>
                                      </>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {shown.length > 0 ? (
                                      <>
                                        <p className="font-mono text-xs text-slate-600 dark:text-slate-300" title={history.map((item) => `${item.correct}/${item.total}`).join(' → ')}>
                                          {history.length > shown.length && '… → '}
                                          {shown.map((item) => item.correct).join(' → ')}
                                        </p>
                                        {/* Chỉ nói "tốt nhất" khi nó KHÁC lần gần nhất — tức là
                                            em đang làm tệ đi so với chính mình, điều đáng để ý. */}
                                        {best && latest && best.attemptId !== latest.attemptId && (
                                          <p className="mt-0.5 whitespace-nowrap text-xs text-amber-700 dark:text-amber-400">
                                            Tốt nhất: {best.correct}/{best.total} câu
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3">
                                    {summary?.inProgress ? (
                                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                        Đang làm: {summary.inProgress.answered}
                                        {summary.inProgress.total ? `/${summary.inProgress.total}` : ''} câu
                                      </span>
                                    ) : !summary ? (
                                      <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                        Chưa làm
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-600 dark:text-slate-300">Đã nộp {history.length} lần</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-right">
                                    {latest ? (
                                      <Link
                                        href={`/admin/attempts/${latest.attemptId}`}
                                        className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                                      >
                                        Xem bài
                                      </Link>
                                    ) : null}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Câu Đúng/Sai chỉ tính là đúng khi đúng cả 4 ý. Đúng một phần vẫn được điểm thành phần, nên điểm
                    có thể cao hơn tỉ lệ câu đúng.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  )
}
