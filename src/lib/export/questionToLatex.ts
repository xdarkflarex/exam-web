/**
 * Utilities to convert questions from the database into LaTeX `\begin{ex}` blocks
 * matching the MyLT / ex_test template used for exporting exam papers.
 *
 * Rules:
 *  - multiple_choice -> \choice with all options
 *  - true_false      -> \choiceTF with all statements
 *  - short_answer    -> no answer macro
 *  - tikz_code present -> wrap content + macro inside \immini{...}{<tikz>}
 *  - Correct answers are NOT marked (paper is for students to solve).
 */

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | string

export interface ExportAnswer {
  content: string
  is_correct?: boolean
  order_index?: number
}

export interface ExportQuestion {
  content: string
  question_type: QuestionType
  tikz_code?: string | null
  answers?: ExportAnswer[]
}

/**
 * Minimal sanitization of stored content to LaTeX.
 * Content is mostly plain text + inline math ($...$), so we keep math intact
 * and only convert basic markdown emphasis and line breaks.
 */
export function sanitizeForLatex(input: string | null | undefined): string {
  if (!input) return ''
  let text = input.replace(/\r\n/g, '\n').trim()

  // Markdown bold: **text** or __text__ -> \textbf{text}
  text = text.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
  text = text.replace(/__([^_]+)__/g, '\\textbf{$1}')

  // Markdown italic: *text* -> \textit{text} (avoid matching math/already-converted)
  text = text.replace(/(^|[^*\\])\*([^*\n]+)\*(?!\*)/g, '$1\\textit{$2}')

  // Do NOT force "\\" on every newline: that breaks tabular/array/align (& and rows),
  // math environments and tikz content. LaTeX treats a single newline as a space and a
  // blank line as a paragraph break. Only collapse 3+ newlines into a single blank line.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/**
 * Strips a single trailing period from an answer option (kept by the data but
 * redundant in \choice / \choiceTF). Avoids touching ellipsis "...".
 */
function stripTrailingPeriod(s: string): string {
  return s.replace(/\s+$/, '').replace(/(?<!\.)\.$/, '')
}

function sortedAnswers(answers: ExportAnswer[]): ExportAnswer[] {
  return [...answers].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}

/** Cleaned option text (sanitized + trailing period removed). */
function cleanOption(content: string): string {
  return stripTrailingPeriod(sanitizeForLatex(content))
}

function buildAnswerOptions(answers: ExportAnswer[]): string {
  return sortedAnswers(answers)
    .map((a) => `{${cleanOption(a.content)}}`)
    .join('\n')
}

/** Max visible length among answer options (used to decide \immini layout). */
function maxAnswerLength(answers: ExportAnswer[]): number {
  return answers.reduce((max, a) => Math.max(max, cleanOption(a.content).length), 0)
}

/** Max answer length (chars) for which the figure can sit beside via \immini. */
const IMMINI_MAX_ANSWER_LENGTH = 6

/** Returns the answer macro line ('\choice' or '\choiceTF') or '' if none. */
function answerMacro(q: ExportQuestion): string {
  if (q.question_type === 'multiple_choice') return '\\choice'
  if (q.question_type === 'true_false') return '\\choiceTF'
  return ''
}

/**
 * Decides whether the tikz figure should be placed beside the content (\immini).
 * Only for multiple_choice with short options (e.g. 1-2 chars). Long options
 * (true_false statements, short_answer, or long MCQ options) push the figure below.
 */
function shouldUseImmini(q: ExportQuestion): boolean {
  if (q.question_type !== 'multiple_choice') return false
  const answers = q.answers || []
  if (answers.length === 0) return false
  return maxAnswerLength(answers) <= IMMINI_MAX_ANSWER_LENGTH
}

/**
 * Builds a single `\begin{ex}...\end{ex}` block.
 */
export function buildExBlock(q: ExportQuestion, index: number): string {
  const content = sanitizeForLatex(q.content)
  const macro = answerMacro(q)
  const options = macro ? buildAnswerOptions(q.answers || []) : ''
  const choiceBlock = macro ? `${macro}\n${options}` : ''
  const tikz = q.tikz_code?.trim()

  let inner: string
  if (tikz && shouldUseImmini(q)) {
    // Short answers: figure beside content (two columns).
    const body = choiceBlock ? `${content}\n${choiceBlock}` : content
    inner = `\\immini{\n${body}\n}{\n${tikz}\n}`
  } else if (tikz) {
    // Long answers / non-MCQ: figure on its own line below the statement.
    const parts = [content, `\\centerline{\n${tikz}\n}`]
    if (choiceBlock) parts.push(choiceBlock)
    inner = parts.join('\n')
  } else {
    inner = choiceBlock ? `${content}\n${choiceBlock}` : content
  }

  return `\\begin{ex}%Câu ${index}\n${inner}\n\\end{ex}`
}

export interface PartGroup {
  /** Header label, e.g. "PHẦN I." */
  label: string
  questions: ExportQuestion[]
}

/**
 * Groups questions by question_type into the 3 standard parts.
 */
export function groupByPart(questions: ExportQuestion[]): PartGroup[] {
  const mc = questions.filter((q) => q.question_type === 'multiple_choice')
  const tf = questions.filter((q) => q.question_type === 'true_false')
  const sa = questions.filter(
    (q) => q.question_type !== 'multiple_choice' && q.question_type !== 'true_false'
  )

  const groups: PartGroup[] = []
  if (mc.length) {
    groups.push({
      label:
        'PHẦN I. Thí sinh trả lời từ câu 1 đến câu ' +
        mc.length +
        '. Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
      questions: mc,
    })
  }
  if (tf.length) {
    groups.push({
      label:
        'PHẦN II. Thí sinh trả lời từ câu 1 đến câu ' +
        tf.length +
        '. Mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.',
      questions: tf,
    })
  }
  if (sa.length) {
    groups.push({
      label: 'PHẦN III. Thí sinh trả lời từ câu 1 đến câu ' + sa.length + '.',
      questions: sa,
    })
  }
  return groups
}

/**
 * Builds the full export string containing only the `\begin{ex}` blocks,
 * grouped by part with comment headers. Each part renumbers from 1.
 */
export function buildExBlocks(questions: ExportQuestion[]): string {
  const groups = groupByPart(questions)
  const parts: string[] = []

  for (const group of groups) {
    const header = `%====================\n% ${group.label}\n%====================`
    const blocks = group.questions
      .map((q, i) => buildExBlock(q, i + 1))
      .join('\n\n')
    parts.push(`${header}\n\\setcounter{ex}{0}\n${blocks}`)
  }

  return parts.join('\n\n')
}

/**
 * Builds export preserving the given order (e.g. exam order), without regrouping.
 * Still inserts part headers when the part changes.
 */
export function buildExBlocksOrdered(
  items: { question: ExportQuestion; part_number?: number }[]
): string {
  const labelFor = (part: number | undefined): string => {
    if (part === 1) return 'PHẦN I.'
    if (part === 2) return 'PHẦN II.'
    if (part === 3) return 'PHẦN III.'
    return ''
  }

  const out: string[] = []
  let lastPart: number | undefined = undefined
  let counter = 0

  for (const item of items) {
    if (item.part_number !== lastPart) {
      lastPart = item.part_number
      counter = 0
      const label = labelFor(item.part_number)
      if (label) {
        out.push(
          `%====================\n% ${label}\n%====================\n\\setcounter{ex}{0}`
        )
      }
    }
    counter += 1
    out.push(buildExBlock(item.question, counter))
  }

  return out.join('\n\n')
}
