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
  // Bắt: \begin{env}[id]{title} body \end{env}
  const regex = new RegExp(
    `\\\\begin\\{(${envNames})\\}(?:\\[([^\\]]*)\\])?\\{([^}]*)\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
    'g'
  )
  let match
  let autoId = 0
  while ((match = regex.exec(tex)) !== null) {
    const env = match[1]
    const externalId = (match[2] || '').trim() || `auto-${env}-${autoId++}`
    const title = (match[3] || '').trim()
    let rawBody = match[4] || ''

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

/**
 * Chuyển LaTeX → Markdown + MathJax
 * Giữ nguyên math syntax (MathJax hỗ trợ cả $...$ và $$...$$)
 */
export function latexToMarkdown(latex: string): string {
  if (!latex) return ''

  let md = latex

  // ---- Bước 0: Bảo vệ các math blocks và TikZ ----
  const protected_blocks: string[] = []

  // Bảo vệ TikZ blocks (chuyển thành code blocks tikz)
  md = md.replace(
    /\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g,
    (_match, inner) => {
      const idx = protected_blocks.length
      const tikzCode = `\\begin{tikzpicture}${inner}\\end{tikzpicture}`
      protected_blocks.push(`\n\n\`\`\`tikz\n${tikzCode.trim()}\n\`\`\`\n\n`)
      return `%%PROTECTED_${idx}%%`
    }
  )

  // Bảo vệ display math: \[...\] → $$...$$
  md = md.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_match, inner) => {
      const idx = protected_blocks.length
      protected_blocks.push(`\n\n$$\n${inner.trim()}\n$$\n\n`)
      return `%%PROTECTED_${idx}%%`
    }
  )

  // Bảo vệ align/aligned/array/cases environments
  md = md.replace(
    /\\begin\{(align\*?|aligned|array|cases|gather\*?|equation\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, env, inner) => {
      const idx = protected_blocks.length
      protected_blocks.push(
        `\n\n$$\n\\begin{${env}}${inner}\\end{${env}}\n$$\n\n`
      )
      return `%%PROTECTED_${idx}%%`
    }
  )

  // Bảo vệ \boxed{...} (có thể nhiều dòng)
  md = md.replace(
    /\\\[([\s\S]*?\\boxed\{[\s\S]*?\}[\s\S]*?)\\\]/g,
    (_match, inner) => {
      const idx = protected_blocks.length
      protected_blocks.push(`\n\n$$\n${inner.trim()}\n$$\n\n`)
      return `%%PROTECTED_${idx}%%`
    }
  )

  // ---- Bước 1: Headings ----
  md = md.replace(/\\TheoryHeading\{([^}]+)\}/g, '\n## $1\n')
  md = md.replace(/\\subsection\*?\{([^}]+)\}/g, '\n## $1\n')
  md = md.replace(/\\subsubsection\*?\{([^}]+)\}/g, '\n### $1\n')

  // ---- Bước 2: Text formatting ----
  md = md.replace(/\\textbf\{([^}]+)\}/g, '**$1**')
  md = md.replace(/\\textit\{([^}]+)\}/g, '*$1*')
  md = md.replace(/\\texttt\{([^}]+)\}/g, '`$1`')
  md = md.replace(/\\emph\{([^}]+)\}/g, '*$1*')
  md = md.replace(/\\underline\{([^}]+)\}/g, '$1')

  // ---- Bước 3: Lists ----
  // itemize
  md = md.replace(/\\begin\{itemize\}(\[.*?\])?/g, '')
  md = md.replace(/\\end\{itemize\}/g, '')
  md = md.replace(/\\item\s*/g, '- ')

  // enumerate
  md = md.replace(/\\begin\{enumerate\}(\[.*?\])?/g, '')
  md = md.replace(/\\end\{enumerate\}/g, '')
  // Items in enumerate → numbered (simplified: just use -)
  // Already handled by \item above

  // ---- Bước 4: Spacing & layout ----
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
  md = md.replace(/\\node\[.*?\]/g, '') // leftover from removed tikz

  // ---- Bước 8: Restore protected blocks ----
  for (let i = 0; i < protected_blocks.length; i++) {
    md = md.replace(`%%PROTECTED_${i}%%`, protected_blocks[i])
  }

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
  let tex = contentMd

  // Tách phần theory và example dựa vào markers
  const theorySplit = tex.split(/---\s*\n+## 📝 Ví dụ minh họa/)
  let theoryPart = theorySplit[0] || ''
  let examplePart = theorySplit[1] || ''

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
