/**
 * Kết quả ÔN TẬP theo từng đề: em nào đã làm, đúng bao nhiêu câu, làm mấy lần,
 * đang làm dở tới đâu, em nào trong lớp chưa làm.
 *
 * VÌ SAO CẦN TRANG RIÊNG: số liệu ôn tập đang có ở hai chỗ, và cả hai đều không
 * trả lời được câu "đề này em X đúng mấy câu":
 *   - `/admin/students/[id]` gộp MỌI đề ôn tập của một em thành một độ chính xác.
 *   - `/admin/analytics` gộp MỌI em của một đề thành số người nộp + điểm trung vị.
 * Câu hỏi của giáo viên nằm ở giao điểm: một đề × từng em.
 *
 * NGUỒN SỐ: `exam_attempts`. `submit_practice_attempt` (`20260806`) ghi
 * `total_questions` = số câu của đề và `correct_answers` = số câu ĐÚNG HOÀN
 * TOÀN — câu Đúng/Sai chỉ tính khi đúng cả 4 ý, đúng 3/4 ý vẫn có điểm thành
 * phần nhưng không vào số câu đúng. Trang phải nói rõ điều đó, nếu không giáo
 * viên sẽ thấy "đúng 5/10 câu" mà điểm lại 6,5 và nghĩ hệ thống chấm sai.
 *
 * Đề ôn tập cho làm lại tuỳ ý (`20260906`), nên một em có thể có nhiều lượt:
 * hiện lần GẦN NHẤT (em đang ở đâu), lần TỐT NHẤT, và chuỗi các lần (em có
 * tiến bộ qua từng lần không — đó là toàn bộ ý nghĩa của ôn tập).
 */

export interface PracticeAttemptRow {
  id: string
  exam_id: string
  student_id: string
  status: string | null
  score: number | null
  total_questions: number | null
  correct_answers: number | null
  start_time: string | null
  submit_time: string | null
}

export interface AttemptResult {
  attemptId: string
  correct: number
  total: number
  /** Thang 10, có thể `null` với lượt cũ chưa chấm. */
  score: number | null
  submittedAt: string | null
}

export interface StudentPracticeSummary {
  studentId: string
  /** Các lượt đã nộp, CŨ → MỚI. */
  history: AttemptResult[]
  latest: AttemptResult | null
  best: AttemptResult | null
  /** Lượt đang làm dở (nếu có). `answered` đếm từ bản nháp tự lưu. */
  inProgress: { attemptId: string; answered: number; total: number | null; startedAt: string | null } | null
}

export interface ExamPracticeOverview {
  examId: string
  /** Số em đã nộp ít nhất một lượt. */
  studentsSubmitted: number
  /** Tổng số lượt đã nộp. */
  submissions: number
  /** Số em đang có lượt làm dở. */
  inProgress: number
  /** Tỉ lệ câu đúng trung bình của LẦN GẦN NHẤT mỗi em, 0..1; `null` khi chưa ai nộp. */
  averageLatestRate: number | null
  /** Lần nộp gần nhất của cả đề — để xếp đề nào đang được làm. */
  lastSubmittedAt: string | null
}

export function isSubmitted(status: string | null | undefined): boolean {
  return status === 'submitted' || status === 'graded'
}

function toResult(row: PracticeAttemptRow): AttemptResult {
  return {
    attemptId: row.id,
    correct: Math.max(0, row.correct_answers ?? 0),
    total: Math.max(0, row.total_questions ?? 0),
    score: typeof row.score === 'number' ? row.score : null,
    submittedAt: row.submit_time,
  }
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * "Tốt nhất" so theo TỈ LỆ đúng, hoà thì theo điểm, hoà nữa thì lấy lần mới hơn.
 *
 * So theo số câu đúng tuyệt đối là sai khi đề bị sửa giữa chừng (thêm/bớt
 * câu): 8/12 không tốt hơn 7/8.
 */
function better(a: AttemptResult, b: AttemptResult): AttemptResult {
  const rateA = a.total > 0 ? a.correct / a.total : 0
  const rateB = b.total > 0 ? b.correct / b.total : 0
  if (rateA !== rateB) return rateA > rateB ? a : b
  if ((a.score ?? -1) !== (b.score ?? -1)) return (a.score ?? -1) > (b.score ?? -1) ? a : b
  return time(a.submittedAt) >= time(b.submittedAt) ? a : b
}

/**
 * Gom lượt làm của MỘT đề thành một dòng cho mỗi em.
 *
 * `answeredCounts`: attemptId → số câu đã trả lời, cho lượt đang làm dở (đọc
 * từ `student_answers` mà PracticeRunner tự lưu). Thiếu thì coi là 0.
 */
export function summarizeExamAttempts(
  examId: string,
  attempts: readonly PracticeAttemptRow[],
  answeredCounts: ReadonlyMap<string, number> = new Map()
): StudentPracticeSummary[] {
  const byStudent = new Map<string, PracticeAttemptRow[]>()
  for (const row of attempts) {
    if (row.exam_id !== examId) continue
    const list = byStudent.get(row.student_id) ?? []
    list.push(row)
    byStudent.set(row.student_id, list)
  }

  const summaries: StudentPracticeSummary[] = []
  for (const [studentId, rows] of byStudent) {
    const history = rows
      .filter((row) => isSubmitted(row.status))
      .map(toResult)
      .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))

    // Lượt dở mới nhất. Bình thường chỉ có một (`start_exam_attempt` trả lại
    // lượt dở đang mở thay vì tạo mới), nhưng dữ liệu cũ có thể có nhiều.
    const open = rows
      .filter((row) => row.status === 'in_progress')
      .sort((a, b) => time(b.start_time) - time(a.start_time))[0]

    summaries.push({
      studentId,
      history,
      latest: history.at(-1) ?? null,
      best: history.length ? history.reduce(better) : null,
      inProgress: open
        ? {
            attemptId: open.id,
            answered: answeredCounts.get(open.id) ?? 0,
            total: open.total_questions,
            startedAt: open.start_time,
          }
        : null,
    })
  }
  return summaries
}

export function examOverview(
  examId: string,
  attempts: readonly PracticeAttemptRow[]
): ExamPracticeOverview {
  const summaries = summarizeExamAttempts(examId, attempts)
  const latestRates = summaries
    .map((summary) => summary.latest)
    .filter((latest): latest is AttemptResult => Boolean(latest && latest.total > 0))
    .map((latest) => latest.correct / latest.total)

  const lastSubmittedAt = summaries
    .flatMap((summary) => summary.history.map((item) => item.submittedAt))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => time(b) - time(a))[0] ?? null

  return {
    examId,
    studentsSubmitted: summaries.filter((summary) => summary.history.length > 0).length,
    submissions: summaries.reduce((sum, summary) => sum + summary.history.length, 0),
    inProgress: summaries.filter((summary) => summary.inProgress).length,
    averageLatestRate: latestRates.length
      ? latestRates.reduce((sum, rate) => sum + rate, 0) / latestRates.length
      : null,
    lastSubmittedAt,
  }
}

export type PracticeSort = 'recent' | 'name' | 'best'

export interface StudentRowInput {
  id: string
  name: string
  summary: StudentPracticeSummary | null
}

/**
 * Thứ tự dòng trong bảng. Ba nhóm luôn đi theo thứ tự: đã nộp → đang làm dở →
 * chưa làm. Trộn "chưa làm" lẫn vào giữa là giấu đúng những em giáo viên cần
 * nhắc nhất.
 */
export function sortStudentRows(rows: readonly StudentRowInput[], sort: PracticeSort): StudentRowInput[] {
  const group = (row: StudentRowInput) =>
    row.summary?.latest ? 0 : row.summary?.inProgress ? 1 : 2
  const rate = (row: StudentRowInput) => {
    const best = row.summary?.best
    return best && best.total > 0 ? best.correct / best.total : -1
  }
  return [...rows].sort((a, b) => {
    const byGroup = group(a) - group(b)
    if (byGroup !== 0) return byGroup
    if (sort === 'recent') {
      const diff = time(b.summary?.latest?.submittedAt) - time(a.summary?.latest?.submittedAt)
      if (diff !== 0) return diff
    }
    if (sort === 'best') {
      const diff = rate(b) - rate(a)
      if (diff !== 0) return diff
    }
    return a.name.localeCompare(b.name, 'vi')
  })
}

/** `7/10` → `70%`. */
export function formatRate(correct: number, total: number): string {
  return total > 0 ? `${Math.round((correct / total) * 100)}%` : '–'
}
