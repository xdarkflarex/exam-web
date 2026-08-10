import {
  TABULAR_ENV_REGEX,
  normalizeLatexTablesForMarkdown,
  splitLatexTableBody,
} from './latex-normalize.ts'

/**
 * LaTeX Parser: Đọc file .tex và chuyển thành cấu trúc Theory
 * 
 * Hỗ trợ parse:
 * - \LessonBox{TITLE} → title
 * - \begin{theorybox}...\end{theorybox} → phần lý thuyết
 * - \begin{examplebox}...\end{examplebox} → phần ví dụ
 * - \TheoryHeading{...} → headings
 * - Math, TikZ, itemize, enumerate, bold, italic
 */

// ==============================================
// TYPES
// ==============================================

export interface ParsedLesson {
  title: string
  slug: string
  externalId: string       // [id] khai báo trong \LessonBox[id]{...}
  theoryContent: string    // Raw LaTeX trong theorybox
  exampleContent: string   // Raw LaTeX trong examplebox
  contentMd: string        // Đã convert sang Markdown
  tikzBlocks: string[]     // Các TikZ blocks riêng
  blocks: ParsedBlock[]    // Các khối tri thức có kiểu
}

/** Loại khối tri thức (đồng bộ tri-thuc.sty + DB block_type) */
export type ParsedBlockType =
  | 'dinh_nghia'
  | 'dinh_ly'
  | 'tinh_chat'
  | 'he_qua'
  | 'cong_thuc'
  | 'phuong_phap'
  | 'chu_y'
  | 'vi_du'
  | 'bai_tap'

export interface ParsedBlockEdge {
  relation: 'prerequisite' | 'related' | 'extension'
  toExternalId: string
}

/** Một khối tri thức trích từ môi trường tri thức chuẩn */
export interface ParsedBlock {
  externalId: string
  blockType: ParsedBlockType
  title: string
  bodyMd: string
  edges: ParsedBlockEdge[]
}

/** Ánh xạ tên môi trường LaTeX -> block_type */
const ENV_TO_BLOCK_TYPE: Record<string, ParsedBlockType> = {
  dinhnghia: 'dinh_nghia',
  dinhly: 'dinh_ly',
  tinhchat: 'tinh_chat',
  hequa: 'he_qua',
  congthuc: 'cong_thuc',
  phuongphap: 'phuong_phap',
  chuy: 'chu_y',
  vidu: 'vi_du',
  baitap: 'bai_tap',
}

// ==============================================
// MAIN PARSER
// ==============================================

/**
 * Parse 1 file .tex thành ParsedLesson
 */
export function parseTexFile(texContent: string): ParsedLesson {
  const title = extractLessonTitle(texContent)
  const externalId = extractLessonId(texContent)
  const slug = generateSlug(title)
  const theoryContent = extractEnvironment(texContent, 'theorybox')
  const exampleContent = extractEnvironment(texContent, 'examplebox')
  const tikzBlocks = extractTikzBlocks(texContent)

  // Trích các khối tri thức có kiểu (thẻ chuẩn tri-thuc.sty)
  let blocks = parseKnowledgeBlocks(texContent)

  // Fallback: nếu không có thẻ chuẩn nhưng có theorybox/examplebox cũ
  if (blocks.length === 0) {
    blocks = fallbackBlocksFromLegacy(theoryContent, exampleContent)
  }

  // content_md: ưu tiên dựng từ các khối; nếu không có thì dùng legacy
  let contentMd: string
  if (blocks.length > 0) {
    contentMd = blocksToMarkdown(blocks)
  } else {
    const theoryMd = theoryContent
      ? '## 📘 Kiến thức cần nhớ\n\n' + latexToMarkdown(theoryContent)
      : ''
    const exampleMd = exampleContent
      ? '\n\n---\n\n## 📝 Ví dụ minh họa\n\n' + latexToMarkdown(exampleContent)
      : ''
    contentMd = (theoryMd + exampleMd).trim()
  }

  return { title, slug, externalId, theoryContent, exampleContent, contentMd, tikzBlocks, blocks }
}

/**
 * Parse nhiều file .tex (toàn bộ thư mục chapters)
 */
export function parseMultipleTexFiles(
  files: { name: string; content: string }[]
): ParsedLesson[] {
  return files
    .filter(f => f.name.endsWith('.tex'))
    .map(f => parseTexFile(f.content))
    .filter(lesson => lesson.title.length > 0)
}

// ==============================================
// EXTRACTORS
// ==============================================

/** Trích xuất title từ \LessonBox[id]{...} */
function extractLessonTitle(tex: string): string {
  const match = tex.match(/\\LessonBox(?:\[[^\]]*\])?\{([^}]+)\}/)
  if (match) return match[1].trim()

  // Fallback: thử \SectionBox
  const match2 = tex.match(/\\SectionBox\{([^}]+)\}/)
  if (match2) return match2[1].trim()

  // Fallback: thử \section{...} hoặc \chapter{...}
  const match3 = tex.match(/\\(?:section|chapter)\*?\{([^}]+)\}/)
  if (match3) return match3[1].trim()

  return 'Không có tiêu đề'
}

/** Trích xuất nội dung bên trong environment */
function extractEnvironment(tex: string, envName: string): string {
  const regex = new RegExp(
    `\\\\begin\\{${envName}\\}([\\s\\S]*?)\\\\end\\{${envName}\\}`,
    'g'
  )
  const matches: string[] = []
  let match
  while ((match = regex.exec(tex)) !== null) {
    matches.push(match[1].trim())
  }
  return matches.join('\n\n')
}

/** Trích xuất tất cả TikZ blocks */
function extractTikzBlocks(tex: string): string[] {
  const regex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g
  const blocks: string[] = []
  let match
  while ((match = regex.exec(tex)) !== null) {
    blocks.push(match[0])
  }
  return blocks
}

/** Trích xuất id từ \LessonBox[id]{...} */
function extractLessonId(tex: string): string {
  const match = tex.match(/\\LessonBox\[([^\]]*)\]\{/)
  return match ? match[1].trim() : ''
}

// ==============================================
// KNOWLEDGE BLOCKS (thẻ chuẩn tri-thuc.sty)
// ==============================================

/**
 * Trích các khối tri thức có kiểu từ môi trường chuẩn:
 *   \begin{dinhnghia}[id]{Tiêu đề} ... \end{dinhnghia}
 * Bao gồm cả các cạnh khai báo bằng \tienquyet \lienquan \morong.
 */
export function parseKnowledgeBlocks(tex: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  const envNames = Object.keys(ENV_TO_BLOCK_TYPE).join('|')
  /*
    Bắt: \begin{env}[id]{title} body \end{env}

    Tiêu đề đọc bằng bộ đếm ngoặc chứ không bằng `\{([^}]*)\}`. Có bài đặt tên
    khối là `Phân biệt $\varnothing$, $\{0\}$ và $\{\varnothing\}$` — mẫu cũ
    dừng ở dấu `}` của `\{0\}`, tiêu đề bị cụt và phần đuôi trôi vào thân khối,
    kéo theo cả `\item` sau đó hỏng.
  */
  const openRegex = new RegExp(`\\\\begin\\{(${envNames})\\}(?:\\[([^\\]]*)\\])?\\s*`, 'g')
  let match
  let autoId = 0

  while ((match = openRegex.exec(tex)) !== null) {
    const env = match[1]
    const titleArg = readBalancedArg(tex, match.index + match[0].length)
    if (!titleArg) continue

    const closeTag = `\\end{${env}}`
    const closeAt = tex.indexOf(closeTag, titleArg.end)
    if (closeAt === -1) continue

    const externalId = (match[2] || '').trim() || `auto-${env}-${autoId++}`
    const title = titleArg.value.trim()
    let rawBody = tex.slice(titleArg.end, closeAt)

    // Trích cạnh từ body trước khi convert markdown
    const edges = extractBlockEdges(rawBody)
    // Bỏ các macro liên kết khỏi nội dung hiển thị
    rawBody = rawBody.replace(/\\(tienquyet|lienquan|morong)\{[^}]*\}/g, '')

    blocks.push({
      externalId,
      blockType: ENV_TO_BLOCK_TYPE[env],
      title,
      bodyMd: latexToMarkdown(rawBody.trim()),
      edges,
    })

    openRegex.lastIndex = closeAt + closeTag.length
  }
  return blocks
}

/** Trích các cạnh \tienquyet \lienquan \morong trong body một khối */
function extractBlockEdges(body: string): ParsedBlockEdge[] {
  const edges: ParsedBlockEdge[] = []
  const map: Record<string, ParsedBlockEdge['relation']> = {
    tienquyet: 'prerequisite',
    lienquan: 'related',
    morong: 'extension',
  }
  const regex = /\\(tienquyet|lienquan|morong)\{([^}]*)\}/g
  let m
  while ((m = regex.exec(body)) !== null) {
    const relation = map[m[1]]
    const ids = m[2].split(',').map(s => s.trim()).filter(Boolean)
    for (const id of ids) edges.push({ relation, toExternalId: id })
  }
  return edges
}

/** Fallback: dựng 2 khối (định lý + ví dụ) từ theorybox/examplebox cũ */
function fallbackBlocksFromLegacy(
  theoryContent: string,
  exampleContent: string
): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  if (theoryContent) {
    blocks.push({
      externalId: `legacy-theory-${generateSlug(theoryContent.slice(0, 30))}`,
      blockType: 'dinh_ly',
      title: 'Kiến thức cần nhớ',
      bodyMd: latexToMarkdown(theoryContent),
      edges: [],
    })
  }
  if (exampleContent) {
    blocks.push({
      externalId: `legacy-example-${generateSlug(exampleContent.slice(0, 30))}`,
      blockType: 'vi_du',
      title: 'Ví dụ minh họa',
      bodyMd: latexToMarkdown(exampleContent),
      edges: [],
    })
  }
  return blocks
}

/** Nhãn hiển thị theo block_type */
const BLOCK_LABEL: Record<ParsedBlockType, string> = {
  dinh_nghia: '📘 Định nghĩa',
  dinh_ly: '📐 Định lý',
  tinh_chat: '🔧 Tính chất',
  he_qua: '↪️ Hệ quả',
  cong_thuc: '🧮 Công thức',
  phuong_phap: '🧭 Phương pháp',
  chu_y: '⚠️ Chú ý',
  vi_du: '📝 Ví dụ',
  bai_tap: '✏️ Bài tập',
}

/** Gộp các khối tri thức thành 1 chuỗi Markdown (cho content_md tổng) */
export function blocksToMarkdown(blocks: ParsedBlock[]): string {
  return blocks
    .map(b => {
      const label = BLOCK_LABEL[b.blockType] || ''
      const heading = b.title ? `## ${label}: ${b.title}` : `## ${label}`
      return `${heading}\n\n${b.bodyMd}`.trim()
    })
    .join('\n\n---\n\n')
    .trim()
}

// ==============================================
// LATEX → MARKDOWN CONVERTER
// ==============================================

/** Đọc một đối số `{...}` có ngoặc cân bằng, bắt đầu tại chỉ số của dấu `{`. */
function readBalancedArg(src: string, openIndex: number): { value: string; end: number } | null {
  if (src[openIndex] !== '{') return null
  let depth = 0
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\\') {
      i++ // ký tự sau dấu chéo là literal: \{ \} \\
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { value: src.slice(openIndex + 1, i), end: i + 1 }
    }
  }
  return null
}

/**
 * Thay `\name{...}` với ngoặc CÂN BẰNG.
 *
 * Regex `\\textbf\{([^}]+)\}` cắt ngay dấu `}` đầu tiên, nên `\textbf{$\vec{a}$}`
 * bị bỏ sót và `\textbf` rơi nguyên vào Markdown.
 */
function replaceCommand(
  src: string,
  name: string,
  argCount: number,
  render: (args: string[]) => string,
): string {
  const marker = `\\${name}`
  let out = ''
  let cursor = 0

  while (cursor < src.length) {
    const at = src.indexOf(marker, cursor)
    if (at === -1) {
      out += src.slice(cursor)
      break
    }

    let scan = at + marker.length
    // `\text` không được ăn nhầm `\textbf`
    if (/[a-zA-Z]/.test(src[scan] ?? '')) {
      out += src.slice(cursor, scan)
      cursor = scan
      continue
    }

    const args: string[] = []
    for (let i = 0; i < argCount; i++) {
      while (src[scan] === ' ' || src[scan] === '\n') scan++
      const arg = readBalancedArg(src, scan)
      if (!arg) break
      args.push(arg.value)
      scan = arg.end
    }

    if (args.length < argCount) {
      // Thiếu đối số: bỏ qua, giữ nguyên văn bản
      out += src.slice(cursor, at + marker.length)
      cursor = at + marker.length
      continue
    }

    out += src.slice(cursor, at) + render(args)
    cursor = scan
  }

  return out
}

/** Lệnh chỉ có nghĩa với LaTeX thật; để lại trong math thì MathJax báo lỗi. */
function sanitizeMathBody(inner: string): string {
  return inner
    .replace(/\\renewcommand\s*\{[^}]*\}\s*\{[^}]*\}/g, '')
    .replace(/\\setlength\s*\{[^}]*\}\s*\{[^}]*\}/g, '')
}

/**
 * Trải những bảng có hình TikZ trong ô thành từng đoạn văn.
 *
 * Ô của bảng Markdown không chứa nổi khối ```` ```tikz ````, nên với các bảng
 * kiểu "tên gọi | dạng đặc trưng | biểu diễn trên trục số" ta bỏ lưới kẻ và
 * xuống dòng: nhãn cột đứng trước nội dung, hình đứng riêng một đoạn. Mất cái
 * khung nhưng giữ đủ chữ và hình — và đọc dễ hơn trên màn 375px.
 *
 * Chỉ chạy khi trong bảng thật sự có hình; bảng thường vẫn thành bảng Markdown.
 */
function flattenTablesWithFigures(text: string): string {
  const figureToken = /%%PROTECTED_\d+%%/

  return text.replace(new RegExp(TABULAR_ENV_REGEX.source, 'g'), (match, _env: string, body: string) => {
    if (!figureToken.test(body)) return match

    const rows = splitLatexTableBody(body)
    if (!rows.length) return match

    // Dòng đầu là tiêu đề cột nếu nó không chứa hình và bảng có nhiều dòng
    const hasHeader = rows.length > 1 && !rows[0].some(cell => figureToken.test(cell))
    const header = hasHeader ? rows[0] : []
    const dataRows = hasHeader ? rows.slice(1) : rows

    const parts: string[] = []
    for (const row of dataRows) {
      const texts: string[] = []
      const figures: string[] = []

      row.forEach((cell, i) => {
        if (!cell) return
        // Nhãn cột thường được soạn là \textbf{...}; gỡ ra rồi tự in đậm một lần
        const label = ['textbf', 'textit', 'emph']
          .reduce((text, cmd) => replaceCommand(text, cmd, 1, ([inner]) => inner), header[i] || '')
          .trim()
        const withoutFigures = cell.replace(new RegExp(figureToken.source, 'g'), '').trim()
        for (const found of cell.match(new RegExp(figureToken.source, 'g')) || []) {
          figures.push(found)
        }
        if (!withoutFigures) return
        // Cột đầu là tên của dòng — in đậm, không cần nhắc lại nhãn cột
        if (i === 0) texts.push(`**${withoutFigures}**`)
        else texts.push(label ? `**${label}:** ${withoutFigures}` : withoutFigures)
      })

      if (texts.length) parts.push(texts.join(' — '))
      for (const figure of figures) parts.push(figure)
    }

    return '\n\n' + parts.join('\n\n') + '\n\n'
  })
}

/** Lặp một phép thay cho tới khi không còn đổi (dùng cho môi trường lồng nhau). */
function replaceUntilStable(
  src: string,
  regex: RegExp,
  replacer: (match: string, body: string) => string,
): string {
  let current = src
  for (let guard = 0; guard < 20; guard++) {
    const next = current.replace(regex, replacer)
    if (next === current) return current
    current = next
  }
  return current
}

/**
 * Chuyển LaTeX → Markdown + MathJax
 * Giữ nguyên math syntax (MathJax hỗ trợ cả $...$ và $$...$$)
 */
export function latexToMarkdown(latex: string): string {
  if (!latex) return ''

  // ---- Bước 0: Bảo vệ các math blocks và TikZ ----
  const protected_blocks: string[] = []
  const protect = (value: string) => {
    protected_blocks.push(value)
    return `%%PROTECTED_${protected_blocks.length - 1}%%`
  }

  /*
    TikZ phải được giấu TRƯỚC khi đụng tới bảng. Trong bộ bài này có hình nằm
    ngay trong ô của `tabular` (bảng các tập con của R, lớp 10 bài 2); nếu đổi
    bảng trước thì `cleanupTableCell` bóp cả hình xuống một dòng và thoát dấu
    `|`, hình hỏng không cứu lại được.
  */
  let md = latex.replace(
    /\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g,
    (_match, inner) => {
      const tikzCode = `\\begin{tikzpicture}${inner}\\end{tikzpicture}`
      return protect(`\n\n\`\`\`tikz\n${tikzCode.trim()}\n\`\`\`\n\n`)
    }
  )

  // Bảng có hình bên trong: trải thành từng dòng (ô bảng Markdown không chứa
  // nổi khối ```tikz). Phải chạy trước khi đổi các bảng còn lại.
  md = flattenTablesWithFigures(md)

  md = normalizeLatexTablesForMarkdown(md)

  // Bảo vệ display math: \[...\] → $$...$$  (gồm cả \boxed{...} nhiều dòng)
  md = md.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_match, inner) => protect(`\n\n$$\n${sanitizeMathBody(inner).trim()}\n$$\n\n`)
  )

  // Bảo vệ align/aligned/array/cases environments
  md = md.replace(
    /\\begin\{(align\*?|aligned|array|cases|gather\*?|equation\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, env, inner) =>
      protect(`\n\n$$\n\\begin{${env}}${sanitizeMathBody(inner)}\\end{${env}}\n$$\n\n`)
  )

  /*
    Bảo vệ luôn math trong dòng `$...$`. Không có bước này thì các bước dọn dẹp
    phía dưới (`\quad` → dấu cách, `\,` → dấu cách, xoá `\underline`...) chui
    vào trong công thức và đổi nghĩa. Từ chối đoạn có dòng trống ở giữa vì đó
    gần như chắc chắn là hai dấu `$` lẻ chứ không phải một công thức.
  */
  md = md.replace(
    /(?<!\\)\$(?!\$)([^$]+?)(?<!\\)\$/g,
    (match, inner: string) => (inner.includes('\n\n') ? match : protect(match))
  )

  // ---- Bước 1: Headings ----
  md = replaceCommand(md, 'TheoryHeading', 1, ([text]) => `\n## ${text}\n`)
  md = md.replace(/\\subsection\*?\{([^}]+)\}/g, '\n## $1\n')
  md = md.replace(/\\subsubsection\*?\{([^}]+)\}/g, '\n### $1\n')

  // ---- Bước 2: Text formatting ----
  md = replaceCommand(md, 'textbf', 1, ([text]) => `**${text}**`)
  md = replaceCommand(md, 'textit', 1, ([text]) => `*${text}*`)
  md = replaceCommand(md, 'texttt', 1, ([text]) => `\`${text}\``)
  md = replaceCommand(md, 'emph', 1, ([text]) => `*${text}*`)
  md = replaceCommand(md, 'underline', 1, ([text]) => text)

  // Câu trắc nghiệm của ex_test.sty: \choice{A}{B}{C}{D}
  // Xuống dòng cứng (hai dấu cách cuối dòng) để đọc được trên màn 375px.
  md = replaceCommand(md, 'choice', 4, args =>
    '  \n' +
    args
      .map((arg, i) => `**${'ABCD'[i]}.** ${arg.replace(/\s*\n\s*/g, ' ').trim()}`)
      .join('  \n')
  )

  // ---- Bước 3: Lists ----
  // enumerate → danh sách đánh số. Xử lý từ trong ra ngoài để chịu được lồng nhau.
  md = replaceUntilStable(
    md,
    /\\begin\{enumerate\}(?:\[[^\]]*\])?((?:(?!\\begin\{enumerate\})[\s\S])*?)\\end\{enumerate\}/g,
    (_match: string, body: string) => {
      let n = 0
      return '\n' + body.replace(/\\item\s*/g, () => `\n${++n}. `) + '\n'
    }
  )

  // itemize → gạch đầu dòng
  md = replaceUntilStable(
    md,
    /\\begin\{itemize\}(?:\[[^\]]*\])?((?:(?!\\begin\{itemize\})[\s\S])*?)\\end\{itemize\}/g,
    (_match: string, body: string) => '\n' + body.replace(/\\item\s*/g, '\n- ') + '\n'
  )

  // \item còn sót ngoài mọi môi trường danh sách
  md = md.replace(/\\begin\{(itemize|enumerate)\}(\[.*?\])?/g, '')
  md = md.replace(/\\end\{(itemize|enumerate)\}/g, '')
  md = md.replace(/\\item\s*/g, '- ')

  // ---- Bước 4: Spacing & layout ----
  md = md.replace(/\\\\(\[[^\]]*\])?/g, '\n') // ngắt dòng LaTeX ngoài math
  md = md.replace(/\\medskip/g, '\n')
  md = md.replace(/\\bigskip/g, '\n\n')
  md = md.replace(/\\smallskip/g, '\n')
  md = md.replace(/\\vspace\{[^}]*\}/g, '\n')
  md = md.replace(/\\hspace\{[^}]*\}/g, ' ')
  md = md.replace(/\\noindent/g, '')
  md = md.replace(/\\par\b/g, '\n\n')
  md = md.replace(/\\clearpage/g, '\n\n---\n\n')
  md = md.replace(/\\newpage/g, '\n\n---\n\n')

  // ---- Bước 5: Environments to remove ----
  md = md.replace(/\\begin\{center\}/g, '')
  md = md.replace(/\\end\{center\}/g, '')
  md = md.replace(/\\begin\{minipage\}(\{[^}]*\}|\[[^\]]*\])*/g, '')
  md = md.replace(/\\end\{minipage\}/g, '')
  md = md.replace(/\\centering/g, '')
  md = md.replace(/\\hfill/g, '')

  // ---- Bước 6: Special chars ----
  md = md.replace(/\\colon/g, ':')
  md = md.replace(/~+/g, ' ')
  md = md.replace(/\\,/g, ' ')
  md = md.replace(/\\;/g, ' ')
  md = md.replace(/\\quad/g, '  ')
  md = md.replace(/\\qquad/g, '    ')
  md = md.replace(/\\&/g, '&')
  md = md.replace(/\\%/g, '%')
  md = md.replace(/\\\$/g, '\\$')
  md = md.replace(/\\#/g, '#')

  // ---- Bước 7: Remove remaining LaTeX commands that don't matter ----
  md = md.replace(/\\renewcommand\{[^}]*\}\{[^}]*\}/g, '')
  md = md.replace(/\\setlength\{[^}]*\}\{[^}]*\}/g, '')
  md = md.replace(/\\addcontentsline\{[^}]*\}\{[^}]*\}\{[^}]*\}/g, '')
  md = md.replace(/\\label\{[^}]*\}/g, '')
  md = md.replace(/\\ref\{[^}]*\}/g, '')
  md = md.replace(/\\color\{[^}]*\}/g, '')
  md = md.replace(/\\fontfamily\{[^}]*\}\\selectfont/g, '')
  // Lệnh chỉnh cỡ chữ: không có nghĩa gì trên web
  md = md.replace(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/g, '')

  /*
    Không còn dòng xoá `\node[...]` của bản cũ. Mọi TikZ đã được giấu ở bước 0
    nên nó chẳng còn gì để dọn, mà mẫu `.*?` của nó thì nuốt được cả văn bản
    thường nếu bài soạn tình cờ có chữ "node[".
  */

  // ---- Bước 8: Restore protected blocks ----
  // Dùng hàm thay thế: chuỗi thay thế coi `$$` là một dấu `$`, mà nội dung ở
  // đây toàn công thức — chính lỗi này làm mọi display math tụt xuống inline.
  md = md.replace(
    /%%PROTECTED_(\d+)%%/g,
    (match, index: string) => protected_blocks[Number(index)] ?? match
  )

  // ---- Bước 9: Clean up ----
  // Multiple blank lines → max 2
  md = md.replace(/\n{4,}/g, '\n\n\n')
  // Trim lines
  md = md
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
  // Trim overall
  md = md.trim()

  return md
}

// ==============================================
// MARKDOWN → LATEX CONVERTER (ngược lại cho export)
// ==============================================

/**
 * Chuyển Markdown (từ web) → LaTeX format tương thích filechinh.tex
 */
export function markdownToTexLesson(
  title: string,
  contentMd: string
): string {
  const tex = contentMd

  // Tách phần theory và example dựa vào markers
  const theorySplit = tex.split(/---\s*\n+## 📝 Ví dụ minh họa/)
  let theoryPart = theorySplit[0] || ''
  const examplePart = theorySplit[1] || ''

  // Bỏ header "📘 Kiến thức cần nhớ"
  theoryPart = theoryPart.replace(/^## 📘 Kiến thức cần nhớ\s*\n*/m, '')

  // Convert markdown → LaTeX
  const theoryTex = mdPartToLatex(theoryPart)
  const exampleTex = mdPartToLatex(examplePart)

  let result = `\\LessonBox{${title}}\n\n`

  if (theoryTex.trim()) {
    result += `\\begin{theorybox}\n\n${theoryTex}\n\n\\end{theorybox}\n\n`
  }

  if (exampleTex.trim()) {
    result += `\\begin{examplebox}\n\n${exampleTex}\n\n\\end{examplebox}\n`
  }

  return result
}

/** Convert 1 phần markdown → LaTeX */
function mdPartToLatex(md: string): string {
  if (!md) return ''

  let tex = md.trim()

  // Headings → \TheoryHeading
  tex = tex.replace(/^### (.+)$/gm, '\\TheoryHeading{$1}')
  tex = tex.replace(/^## (.+)$/gm, '\\TheoryHeading{$1}')

  // Bold/Italic
  tex = tex.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
  tex = tex.replace(/(^|[^*\\])\*([^*\n]+)\*(?!\*)/g, '$1\\textit{$2}')

  // Code → \texttt
  tex = tex.replace(/`([^`]+)`/g, '\\texttt{$1}')

  // Lists: - item → \item
  tex = tex.replace(/^- (.+)$/gm, '\\item $1')

  // Wrap consecutive \item in \begin{itemize}
  const lines = tex.split('\n')
  const result: string[] = []
  let inList = false
  for (const line of lines) {
    if (line.trim().startsWith('\\item ')) {
      if (!inList) {
        result.push('\\begin{itemize}[leftmargin=2em]')
        inList = true
      }
      result.push(line)
    } else {
      if (inList) {
        result.push('\\end{itemize}')
        inList = false
      }
      result.push(line)
    }
  }
  if (inList) result.push('\\end{itemize}')
  tex = result.join('\n')

  // Display math $$...$$ → \[...\]
  tex = tex.replace(/\$\$([\s\S]*?)\$\$/g, '\\[\n$1\n\\]')

  // TikZ code blocks → raw tikz
  tex = tex.replace(/```tikz\n([\s\S]*?)```/g, '$1')

  // Horizontal rule
  tex = tex.replace(/^---+$/gm, '\\medskip')

  // Clean up extra newlines
  tex = tex.replace(/\n{3,}/g, '\n\n')

  return tex.trim()
}

// ==============================================
// HELPERS
// ==============================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Parse filechinh.tex để tìm cấu trúc chapters + files
 */
export function parseMainFile(mainTexContent: string): {
  title: string
  chapters: { name: string; files: string[] }[]
} {
  const titleMatch = mainTexContent.match(/\\MainTitle\{([^}]+)\}/)
  const title = titleMatch ? titleMatch[1].trim() : 'Tài liệu'

  const chapters: { name: string; files: string[] }[] = []
  let currentChapter: { name: string; files: string[] } | null = null

  const lines = mainTexContent.split('\n')
  for (const line of lines) {
    const chapterMatch = line.match(/\\ChapterBox\{([^}]+)\}/)
    if (chapterMatch) {
      currentChapter = { name: chapterMatch[1].trim(), files: [] }
      chapters.push(currentChapter)
    }

    const inputMatch = line.match(/\\input\{chapters\/([^}]+)\}/)
    if (inputMatch && currentChapter) {
      let filename = inputMatch[1].trim()
      if (!filename.endsWith('.tex')) filename += '.tex'
      currentChapter.files.push(filename)
    }
  }

  return { title, chapters }
}
