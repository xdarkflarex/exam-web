/**
 * Normalization helpers for LaTeX snippets that are rendered inside Markdown/MathJax.
 *
 * The browser renderer is not a full LaTeX engine. In particular, MathJax does not
 * handle text-mode `tabular` reliably, and a stray `\hline` outside an `array`
 * produces "Misplaced \hline". These helpers convert common table environments
 * into Markdown tables and remove unsupported rule commands outside protected
 * math/code blocks.
 */

const PROTECTED_PREFIX = '%%LATEX_NORMALIZE_PROTECTED_'

function protect(text: string, regex: RegExp, store: string[]) {
  return text.replace(regex, (match) => {
    const token = `${PROTECTED_PREFIX}${store.length}%%`
    store.push(match)
    return token
  })
}

/**
 * Khôi phục các đoạn đã giấu.
 *
 * Bắt buộc dùng HÀM thay thế. Nếu truyền chuỗi, `String.replace` coi `$$`,
 * `$&`, "$`", "$'" là ký hiệu đặc biệt — mà nội dung LaTeX thì đầy dấu `$`.
 * Chính lỗi này từng biến mọi `$$...$$` thành `$...$`.
 */
function restore(text: string, store: string[]) {
  if (!store.length) return text
  return text.replace(
    new RegExp(`${PROTECTED_PREFIX}(\\d+)%%`, 'g'),
    (match, index: string) => store[Number(index)] ?? match,
  )
}

function splitLatexRows(body: string) {
  return body
    .replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g, '\n')
    .replace(/\\cline\{[^}]*\}/g, '\n')
    .split(/\\\\(?:\[[^\]]*\])?/g)
    .map(row => row.trim())
    .filter(Boolean)
}

function splitLatexCells(row: string) {
  return row
    .split(/(?<!\\)&/g)
    .map(cell => cleanupTableCell(cell))
}

/**
 * Tách thân một môi trường bảng thành lưới ô, KHÔNG dọn dẹp gì thêm.
 *
 * Dùng cho những bảng không dựng được thành bảng Markdown (ví dụ có hình TikZ
 * trong ô) — bên gọi tự quyết định trình bày.
 */
export function splitLatexTableBody(body: string): string[][] {
  return splitLatexRows(body)
    .map(row => row.split(/(?<!\\)&/g).map(cell => cell.trim()))
    .filter(row => row.some(Boolean))
}

function cleanupTableCell(cell: string) {
  return cell
    .replace(/\\multicolumn\{[^}]*\}\{[^}]*\}\{([^{}]*)\}/g, '$1')
    .replace(/\\multirow\{[^}]*\}\{[^}]*\}\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g, '')
    .replace(/\\cline\{[^}]*\}/g, '')
    .replace(/\\displaystyle\b/g, '')
    .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^{}]*)\}/g, '*$1*')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim()
}

function padRow(row: string[], length: number) {
  return [...row, ...Array.from({ length: Math.max(0, length - row.length) }, () => '')]
}

function rowsToMarkdownTable(rows: string[][]) {
  if (!rows.length) return ''

  const width = Math.max(...rows.map(row => row.length), 1)
  const normalizedRows = rows.map(row => padRow(row, width))
  const header = normalizedRows[0]
  const body = normalizedRows.slice(1)

  if (normalizedRows.length === 1) {
    body.push(Array.from({ length: width }, () => ''))
  }

  const line = (row: string[]) => `| ${row.map(cell => cell || ' ').join(' | ')} |`
  return [
    '',
    line(header),
    line(Array.from({ length: width }, () => '---')),
    ...body.map(line),
    '',
  ].join('\n')
}

/**
 * `\begin{tabular}` + đối số vị trí + khai báo cột.
 *
 * Khai báo cột chịu được một mức ngoặc lồng: `{|p{0.40\textwidth}|p{0.24\textwidth}|}`
 * là kiểu soạn có thật trong bộ bài, mẫu `\{[^{}]*\}` cũ trượt hoàn toàn.
 */
export const TABULAR_ENV_REGEX =
  /\\begin\{(tabular\*?|tabularx|longtable)\}(?:\[[^\]]*\])?(?:\{(?:[^{}]|\{[^{}]*\})*\}){1,3}([\s\S]*?)\\end\{\1\}/g

function convertTabularToMarkdown(text: string) {
  return text.replace(
    new RegExp(TABULAR_ENV_REGEX.source, 'g'),
    (_match, _env, body) => {
      const rows = splitLatexRows(body).map(splitLatexCells).filter(row => row.some(Boolean))
      return rowsToMarkdownTable(rows)
    },
  )
}

function stripUnsafeRuleCommands(text: string) {
  const protectedBlocks: string[] = []
  let value = text

  value = protect(value, /\\begin\{array\}[\s\S]*?\\end\{array\}/g, protectedBlocks)
  value = protect(value, /\\begin\{aligned\}[\s\S]*?\\end\{aligned\}/g, protectedBlocks)

  value = value
    .replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g, '')
    .replace(/\\cline\{[^}]*\}/g, '')

  return restore(value, protectedBlocks)
}

export function normalizeLatexTablesForMarkdown(input: string) {
  if (!input) return ''

  const protectedBlocks: string[] = []
  let value = input

  value = protect(value, /```[\s\S]*?```/g, protectedBlocks)
  value = convertTabularToMarkdown(value)
  value = stripUnsafeRuleCommands(value)

  return restore(value, protectedBlocks)
}
