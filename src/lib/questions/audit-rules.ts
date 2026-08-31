/**
 * Lớp luật của công cụ rà soát ngân hàng câu hỏi — `docs/QUESTION_AUDIT_PLAN.md`
 * mục 1 (sáu dòng đầu bảng) và mục 9 bước 1.
 *
 * Logic thuần, không đụng database và KHÔNG gọi AI. Đó là chủ ý: những lỗi bắt
 * được ở đây đều tất định, nên chạy lại cho cùng một kết quả, không tốn tiền
 * API và không phải chờ. Chỉ hai loại lỗi còn lại — "đáp án đánh dấu sai so với
 * đề" và "hướng dẫn giải sai dù đáp án đúng" — mới cần model giải lại; chúng
 * thuộc `audit-contracts.ts` và tầng worker.
 *
 * Chạy lớp này TRƯỚC khi gọi model. Một câu thiếu đáp án đúng hoặc vỡ LaTeX thì
 * không đáng gửi đi: model sẽ kết luận về một đề mà chính nó cũng đọc sai.
 */

import { compareKey } from './normalize.ts'

export type AuditRuleCode =
  /** Không phương án nào được đánh dấu `is_correct`. */
  | 'khong_co_dap_an_dung'
  /** `multiple_choice` có từ hai phương án đúng trở lên. */
  | 'nhieu_dap_an_dung'
  /** Câu Đúng/Sai không có đúng bốn ý. */
  | 'true_false_khong_du_4_y'
  /** Hai phương án có nội dung trùng nhau sau chuẩn hoá. */
  | 'phuong_an_trung_nhau'
  /** Phương án rỗng hoặc chỉ có khoảng trắng. */
  | 'phuong_an_rong'
  /** Số phương án ít hơn mức tối thiểu của dạng câu. */
  | 'thieu_phuong_an'
  /** LaTeX không cân: `$` lẻ, ngoặc lệch, `\begin`/`\end` lệch. */
  | 'latex_vo'
  /** Nội dung dừng giữa chừng (kết thúc bằng toán tử, lệnh LaTeX cụt...). */
  | 'noi_dung_nghi_cut'
  /** Dấu vết máy đọc sai: ký tự thay thế, ký tự điều khiển, chữ Kirin. */
  | 'rac_ocr'
  /** Nội dung ngắn tới mức không thể là một câu hỏi hoàn chỉnh. */
  | 'thieu_noi_dung'
  /**
   * Câu chỉ có ảnh hình vẽ, không có `tikz_code`.
   *
   * Không phải lỗi dữ liệu, nhưng là lỗi nếu đem gửi cho model: DeepSeek nhận
   * văn bản, nên nó sẽ kết luận về một câu mà nó không nhìn thấy hình. Kế hoạch
   * mục 5 yêu cầu chọn có chủ đích — cờ này là chỗ để chọn.
   */
  | 'khong_kiem_duoc_bang_van_ban'

/**
 * `loi` — sai chắc chắn, không cần ai đọc lại để xác nhận.
 * `canh_bao` — heuristic hoặc trường hợp hiếm-nhưng-hợp-lệ; phải có người đọc.
 *
 * Ranh giới này quan trọng vì nó quyết định cái gì được lọc và xử hàng loạt.
 * Nhét heuristic vào `loi` là cách nhanh nhất để người dùng mất tin vào cả danh
 * sách rồi bỏ qua luôn những lỗi thật.
 */
export type AuditSeverity = 'loi' | 'canh_bao'

export interface AuditIssue {
  code: AuditRuleCode
  severity: AuditSeverity
  /** Chỗ phát sinh: `content`, `explanation`, `solution`, `tikz_code`, `answers`. */
  field: string
  /** Câu tiếng Việt cho người soạn đọc. Không lặp lại `code`. */
  message: string
  /** Phương án liên quan, nếu lỗi thuộc về phương án cụ thể. */
  answerIds?: string[]
}

export interface AnswerLike {
  id: string
  content: string
  is_correct: boolean
}

/**
 * Đủ dùng cho lớp luật; cố ý KHÔNG phải kiểu `Question` đầy đủ của app, để hàm
 * này chạy được trên cả bản export JSON lẫn kết quả truy vấn Supabase.
 */
export interface AuditQuestionInput {
  id: string
  content: string
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  explanation?: string | null
  solution?: string | null
  tikz_code?: string | null
  tikz_image_url?: string | null
  answers?: AnswerLike[] | null
}

export interface QuestionRuleReport {
  questionId: string
  issues: AuditIssue[]
  /** Có ít nhất một issue mức `loi`. */
  hasError: boolean
}

export interface RuleAuditReport {
  /** Tổng số câu đã quét, kể cả câu sạch. */
  scanned: number
  /** Chỉ những câu CÓ issue. Câu sạch không sinh dòng nào. */
  reports: QuestionRuleReport[]
  /** Số câu có ít nhất một issue mức `loi`. */
  withErrors: number
  /** Đếm theo mã lỗi, để biết đợt nhập nào hỏng kiểu gì. */
  byCode: Partial<Record<AuditRuleCode, number>>
}

/** Ngắn hơn mức này thì không thể là một đề Toán hoàn chỉnh. */
const MIN_CONTENT_LENGTH = 15

/** Số phương án tối thiểu theo dạng câu. `essay` không có phương án. */
const MIN_ANSWER_COUNT: Record<AuditQuestionInput['question_type'], number> = {
  multiple_choice: 2,
  true_false: 4,
  short_answer: 1,
  essay: 0,
}

// --- Kiểm LaTeX ------------------------------------------------------------

interface LatexProblem {
  message: string
}

/**
 * Quét LaTeX một lượt, đếm các cặp phải cân.
 *
 * Vì sao tự quét chứ không đếm bằng regex: `\$`, `\{`, `\\` đều là ký tự thoát,
 * và `$` trong `\text{giá \$5}` thì đếm kiểu regex sẽ báo lỗi giả. Bộ quét này
 * ăn ký tự thoát trước nên không nhầm.
 */
function checkLatex(text: string): LatexProblem[] {
  const problems: LatexProblem[] = []
  if (!text) return problems

  let dollars = 0
  let braceDepth = 0
  let braceWentNegative = false
  let left = 0
  let right = 0
  let inlineOpen = 0
  let inlineClose = 0
  let displayOpen = 0
  let displayClose = 0
  const envStack: string[] = []
  let envMismatch: string | null = null

  let i = 0
  while (i < text.length) {
    const ch = text[i]

    if (ch === '\\') {
      const next = text[i + 1]
      if (next === undefined) break

      if (next === '(') { inlineOpen++; i += 2; continue }
      if (next === ')') { inlineClose++; i += 2; continue }
      if (next === '[') { displayOpen++; i += 2; continue }
      if (next === ']') { displayClose++; i += 2; continue }

      const beginEnd = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(text.slice(i))
      if (beginEnd) {
        const [matched, kind, env] = beginEnd
        if (kind === 'begin') {
          envStack.push(env)
        } else {
          const opened = envStack.pop()
          if (opened === undefined) envMismatch ??= `\\end{${env}} không có \\begin tương ứng.`
          else if (opened !== env) envMismatch ??= `\\begin{${opened}} lại đóng bằng \\end{${env}}.`
        }
        i += matched.length
        continue
      }

      const leftRight = /^\\(left|right)(?![a-zA-Z])/.exec(text.slice(i))
      if (leftRight) {
        if (leftRight[1] === 'left') left++
        else right++
        i += leftRight[0].length
        continue
      }

      const command = /^\\[a-zA-Z]+/.exec(text.slice(i))
      if (command) { i += command[0].length; continue }

      // Ký tự thoát đơn: `\$`, `\{`, `\}`, `\\`, `\%`...
      i += 2
      continue
    }

    if (ch === '$') {
      // `$$...$$` là MỘT cặp phân định, không phải hai.
      i += text[i + 1] === '$' ? 2 : 1
      dollars++
      continue
    }

    if (ch === '{') braceDepth++
    else if (ch === '}') {
      braceDepth--
      if (braceDepth < 0) { braceWentNegative = true; braceDepth = 0 }
    }

    i++
  }

  if (dollars % 2 !== 0) problems.push({ message: 'Số dấu $ lẻ — công thức chưa được đóng.' })
  if (braceWentNegative) problems.push({ message: 'Có dấu } thừa, không khớp dấu { nào.' })
  else if (braceDepth > 0) problems.push({ message: `Còn ${braceDepth} dấu { chưa đóng.` })
  if (left !== right) {
    problems.push({ message: `\\left và \\right lệch nhau (${left} so với ${right}).` })
  }
  if (inlineOpen !== inlineClose) {
    problems.push({ message: `\\( và \\) lệch nhau (${inlineOpen} so với ${inlineClose}).` })
  }
  if (displayOpen !== displayClose) {
    problems.push({ message: `\\[ và \\] lệch nhau (${displayOpen} so với ${displayClose}).` })
  }
  if (envMismatch) problems.push({ message: envMismatch })
  else if (envStack.length > 0) {
    problems.push({ message: `\\begin{${envStack[envStack.length - 1]}} chưa có \\end.` })
  }

  return problems
}

// --- Heuristic dấu vết OCR -------------------------------------------------

/**
 * Ký tự điều khiển và ký tự thay thế (U+FFFD): gần như luôn là rác của bộ nhập.
 *
 * Viết bằng code point chứ không phải lớp ký tự trong regex — dải này gồm toàn
 * ký tự không in được, nhét thẳng vào source thì lần sửa sau sẽ vô tình xoá mất.
 */
function hasControlOrReplacementChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 0xfffd) return true
    if (code < 0x20 && ch !== '\n' && ch !== '\t' && ch !== '\r') return true
  }
  return false
}

/**
 * Chữ Kirin trong một câu Toán tiếng Việt là dấu hiệu OCR nhầm mặt chữ (chữ `a`
 * Kirin U+0430 thay cho `a` Latin). Mắt người không thấy được, mà nó làm hỏng cả
 * so trùng lẫn tìm kiếm.
 */
function hasCyrillic(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x0400 && code <= 0x04ff) return true
  }
  return false
}

/**
 * Kết thúc bằng toán tử, dấu phân cách hoặc lệnh LaTeX cụt.
 *
 * Cố ý KHÔNG bắt câu kết thúc bằng "là", "bằng", "khi" — đề trắc nghiệm kết
 * thúc bằng đúng những từ đó suốt ("Nghiệm của phương trình ... là"), nên thêm
 * chúng vào đây sẽ sinh hàng trăm cảnh báo giả và người dùng bỏ đọc cả danh sách.
 */
const TRUNCATED_TAIL = /(?:[-+=<>,;:\/^_([]|\\[a-zA-Z]+)$/

function checkOcrJunk(text: string, field: string): AuditIssue[] {
  const issues: AuditIssue[] = []
  if (!text) return issues

  if (hasControlOrReplacementChar(text)) {
    issues.push({
      code: 'rac_ocr',
      severity: 'loi',
      field,
      message: 'Có ký tự điều khiển hoặc ký tự thay thế — bộ nhập đã đọc hỏng.',
    })
  }
  if (hasCyrillic(text)) {
    issues.push({
      code: 'rac_ocr',
      severity: 'canh_bao',
      field,
      message: 'Có chữ Kirin lẫn trong tiếng Việt — thường là OCR nhận nhầm mặt chữ.',
    })
  }
  if (/\.{4,}/.test(text)) {
    issues.push({
      code: 'rac_ocr',
      severity: 'canh_bao',
      field,
      message: 'Có chuỗi dấu chấm dài — thường là phần bị mất khi quét.',
    })
  }

  const trimmed = text.trim()
  if (trimmed.length > 0 && TRUNCATED_TAIL.test(trimmed)) {
    issues.push({
      code: 'noi_dung_nghi_cut',
      severity: 'canh_bao',
      field,
      message: `Kết thúc giữa chừng: "...${trimmed.slice(-24)}".`,
    })
  }

  return issues
}

// --- Luật trên phương án ---------------------------------------------------

function auditAnswers(question: AuditQuestionInput): AuditIssue[] {
  const issues: AuditIssue[] = []
  // `essay` không có phương án; mọi luật dưới đây vô nghĩa với nó.
  if (question.question_type === 'essay') return issues

  const answers = question.answers ?? []
  const minCount = MIN_ANSWER_COUNT[question.question_type]

  if (question.question_type === 'true_false') {
    if (answers.length !== 4) {
      issues.push({
        code: 'true_false_khong_du_4_y',
        severity: 'loi',
        field: 'answers',
        message: `Câu Đúng/Sai phải có đúng 4 ý, hiện có ${answers.length}.`,
      })
    }
  } else if (answers.length < minCount) {
    issues.push({
      code: 'thieu_phuong_an',
      severity: 'loi',
      field: 'answers',
      message: `Cần ít nhất ${minCount} phương án, hiện có ${answers.length}.`,
    })
  }

  const emptyIds = answers
    .filter((answer) => answer.content.trim().length === 0)
    .map((answer) => answer.id)
  if (emptyIds.length > 0) {
    issues.push({
      code: 'phuong_an_rong',
      severity: 'loi',
      field: 'answers',
      message: `${emptyIds.length} phương án không có nội dung.`,
      answerIds: emptyIds,
    })
  }

  const correct = answers.filter((answer) => answer.is_correct)
  if (correct.length === 0 && answers.length > 0) {
    issues.push({
      code: 'khong_co_dap_an_dung',
      // Câu Đúng/Sai mà cả bốn ý đều sai là HỢP LỆ, chỉ hiếm — và cũng đúng là
      // hình dạng của một đợt nhập quên cột `is_correct`. Cảnh báo, không kết tội.
      severity: question.question_type === 'true_false' ? 'canh_bao' : 'loi',
      field: 'answers',
      message:
        question.question_type === 'true_false'
          ? 'Cả 4 ý đều đánh dấu Sai — hợp lệ nhưng hiếm, kiểm lại đợt nhập.'
          : 'Không phương án nào được đánh dấu là đáp án đúng.',
    })
  }

  if (question.question_type === 'multiple_choice' && correct.length > 1) {
    issues.push({
      code: 'nhieu_dap_an_dung',
      severity: 'loi',
      field: 'answers',
      message: `Trắc nghiệm một lựa chọn nhưng có ${correct.length} phương án được đánh dấu đúng.`,
      answerIds: correct.map((answer) => answer.id),
    })
  }

  // Trùng nội dung: dùng chung khoá chuẩn hoá với bộ tìm câu trùng, nên
  // `$x=1$` và `\(x = 1\)` bị coi là một — đúng cái người soạn muốn biết.
  const byKey = new Map<string, string[]>()
  for (const answer of answers) {
    const key = compareKey(answer.content)
    if (!key) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.push(answer.id)
    else byKey.set(key, [answer.id])
  }
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue
    issues.push({
      code: 'phuong_an_trung_nhau',
      severity: 'loi',
      field: 'answers',
      message: `${ids.length} phương án có nội dung giống hệt nhau.`,
      answerIds: ids,
    })
  }

  return issues
}

// --- API chính -------------------------------------------------------------

/** Rà một câu bằng luật. Không gọi mạng, không phụ thuộc thứ tự gọi. */
export function auditQuestionByRules(question: AuditQuestionInput): AuditIssue[] {
  const issues: AuditIssue[] = []

  const content = question.content ?? ''
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    issues.push({
      code: 'thieu_noi_dung',
      severity: 'loi',
      field: 'content',
      message: `Nội dung chỉ dài ${content.trim().length} ký tự — không đủ để là một câu hỏi.`,
    })
  }

  const textFields: ReadonlyArray<readonly [string, string]> = [
    ['content', content],
    ['explanation', question.explanation ?? ''],
    ['solution', question.solution ?? ''],
    ['tikz_code', question.tikz_code ?? ''],
    ...(question.answers ?? []).map(
      (answer) => [`answer:${answer.id}`, answer.content] as const
    ),
  ]

  for (const [field, text] of textFields) {
    if (!text) continue
    for (const problem of checkLatex(text)) {
      issues.push({ code: 'latex_vo', severity: 'loi', field, message: problem.message })
    }
    // Rác OCR chỉ soi phần đề và phương án. Lời giải dài hay kết thúc bằng dấu
    // `=` của một biến đổi còn dở, và đó không phải lỗi dữ liệu.
    if (field === 'content' || field.startsWith('answer:')) {
      issues.push(...checkOcrJunk(text, field))
    }
  }

  issues.push(...auditAnswers(question))

  const hasImage = Boolean(question.tikz_image_url && question.tikz_image_url.trim())
  const hasTikzSource = Boolean(question.tikz_code && question.tikz_code.trim())
  if (hasImage && !hasTikzSource) {
    issues.push({
      code: 'khong_kiem_duoc_bang_van_ban',
      severity: 'canh_bao',
      field: 'tikz_code',
      message: 'Câu có hình nhưng không có mã TikZ — model đọc văn bản sẽ không thấy hình.',
    })
  }

  return issues
}

/** Rà một lô câu. Chỉ trả về câu CÓ issue; `scanned` giữ mẫu số. */
export function auditQuestionsByRules(questions: AuditQuestionInput[]): RuleAuditReport {
  const reports: QuestionRuleReport[] = []
  const byCode: Partial<Record<AuditRuleCode, number>> = {}
  let withErrors = 0

  for (const question of questions) {
    const issues = auditQuestionByRules(question)
    if (issues.length === 0) continue

    const hasError = issues.some((issue) => issue.severity === 'loi')
    if (hasError) withErrors++
    for (const issue of issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1

    reports.push({ questionId: question.id, issues, hasError })
  }

  return { scanned: questions.length, reports, withErrors, byCode }
}

/**
 * Những mã lỗi khiến một câu KHÔNG đáng gửi cho model.
 *
 * Kế hoạch mục 5: không được để model kết luận về một câu mà nó không nhìn thấy
 * đủ dữ kiện. Câu vỡ LaTeX hoặc thiếu phương án cũng thuộc loại đó — model sẽ
 * trả lời tự tin về một đề mà chính nó cũng đọc sai.
 */
const BLOCKING_CODES: readonly AuditRuleCode[] = [
  'thieu_noi_dung',
  'latex_vo',
  'thieu_phuong_an',
  'phuong_an_rong',
  'true_false_khong_du_4_y',
  'khong_kiem_duoc_bang_van_ban',
]

export function shouldSkipAiAudit(issues: AuditIssue[]): {
  skip: boolean
  reasons: AuditRuleCode[]
} {
  const reasons = [
    ...new Set(
      issues.filter((issue) => BLOCKING_CODES.includes(issue.code)).map((issue) => issue.code)
    ),
  ]
  return { skip: reasons.length > 0, reasons }
}
