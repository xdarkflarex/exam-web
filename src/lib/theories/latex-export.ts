/**
 * LaTeX Export Engine cho Theories
 * 
 * Chuyển đổi Markdown → LaTeX đơn giản và ghép template
 */

import { createClient } from '@/lib/supabase/client'
import type { Theory, LatexTemplate } from '@/types/theories'

// ==============================================
// MARKDOWN → LATEX CONVERTER
// ==============================================

/**
 * Chuyển đổi Markdown cơ bản → LaTeX
 * Hỗ trợ: bold, italic, headings, lists, math, blockquote
 */
export function markdownToLatex(md: string): string {
  if (!md) return ''

  let latex = md

  // Headings
  latex = latex.replace(/^### (.+)$/gm, '\\subsubsection*{$1}')
  latex = latex.replace(/^## (.+)$/gm, '\\subsection*{$1}')
  latex = latex.replace(/^# (.+)$/gm, '\\section*{$1}')

  // Bold: **text** → \textbf{text}
  latex = latex.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')

  // Italic: *text* → \textit{text} (avoid matching ** or math $)
  latex = latex.replace(/(^|[^*\\])\*([^*\n]+)\*(?!\*)/g, '$1\\textit{$2}')

  // Inline code: `code` → \texttt{code}
  latex = latex.replace(/`([^`]+)`/g, '\\texttt{$1}')

  // Display math: $$...$$ → \[...\]
  latex = latex.replace(/\$\$([\s\S]*?)\$\$/g, '\\[$1\\]')

  // Inline math: $...$ giữ nguyên (tương thích MathJax → LaTeX)

  // Unordered list items: - item → \item item
  latex = latex.replace(/^[-*+]\s+(.+)$/gm, '\\item $1')

  // Ordered list items: 1. item → \item item
  latex = latex.replace(/^\d+\.\s+(.+)$/gm, '\\item $1')

  // Wrap consecutive \item blocks in \begin{itemize}
  latex = wrapListEnvironments(latex)

  // Blockquote: > text → \begin{quote}text\end{quote}
  latex = wrapBlockquotes(latex)

  // Horizontal rule: --- → \noindent\rule{\textwidth}{0.4pt}
  latex = latex.replace(/^---+$/gm, '\\noindent\\rule{\\textwidth}{0.4pt}')

  // Triple+ newlines → paragraph break
  latex = latex.replace(/\n{3,}/g, '\n\n\\par\\vspace{0.5em}\n\n')

  // Double newlines → paragraph
  latex = latex.replace(/\n\n/g, '\n\n\\par\n')

  return latex.trim()
}

/**
 * Wraps consecutive \item lines in \begin{itemize}...\end{itemize}
 */
function wrapListEnvironments(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    if (line.trim().startsWith('\\item ')) {
      if (!inList) {
        result.push('\\begin{itemize}')
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

  if (inList) {
    result.push('\\end{itemize}')
  }

  return result.join('\n')
}

/**
 * Wraps consecutive > lines in \begin{quote}...\end{quote}
 */
function wrapBlockquotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inQuote = false

  for (const line of lines) {
    if (line.trim().startsWith('> ')) {
      if (!inQuote) {
        result.push('\\begin{quote}')
        inQuote = true
      }
      result.push(line.replace(/^>\s*/, ''))
    } else {
      if (inQuote) {
        result.push('\\end{quote}')
        inQuote = false
      }
      result.push(line)
    }
  }

  if (inQuote) {
    result.push('\\end{quote}')
  }

  return result.join('\n')
}

// ==============================================
// LATEX EXPORT ENGINE
// ==============================================

/**
 * Sinh file LaTeX từ danh sách theories và template
 */
export async function generateLatex(
  theoryIds: string[],
  templateId: string
): Promise<{ latex: string; filename: string }> {
  const supabase = createClient()

  // Lấy template
  const { data: template, error: tplErr } = await supabase
    .from('latex_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (tplErr || !template) {
    throw new Error('Không tìm thấy template LaTeX')
  }

  // Lấy theories theo order
  const { data: theories, error: thErr } = await supabase
    .from('theories')
    .select(`
      *,
      sections!inner(name)
    `)
    .in('id', theoryIds)
    .order('order_index', { ascending: true })

  if (thErr || !theories || theories.length === 0) {
    throw new Error('Không tìm thấy bài lý thuyết nào')
  }

  // Chuyển nội dung markdown → latex
  const contentParts = theories.map((theory: any, idx: number) => {
    const latex = markdownToLatex(theory.content_md || '')
    const sectionHeader = theories.length > 1
      ? `\\subsection*{${idx + 1}. ${theory.title}}\n`
      : ''
    return sectionHeader + latex
  })

  const combinedContent = contentParts.join('\n\n\\vspace{1em}\n\n')

  // Tạo title
  const title = theories.length === 1
    ? theories[0].title
    : `Lý thuyết - ${(theories[0] as any).sections?.name || 'Tổng hợp'}`

  // Format date
  const now = new Date()
  const dateStr = now.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  // Thay placeholder
  let latex = (template as LatexTemplate).template_text
  latex = latex.replace(/\{\{title\}\}/g, title)
  latex = latex.replace(/\{\{content\}\}/g, combinedContent)
  latex = latex.replace(/\{\{section_name\}\}/g, (theories[0] as any).sections?.name || '')
  latex = latex.replace(/\{\{date\}\}/g, dateStr)

  // Filename
  const slugTitle = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const filename = `ly-thuyet-${slugTitle || 'export'}.tex`

  return { latex, filename }
}

/**
 * Xuất LaTeX cho theories theo section
 */
export async function generateLatexBySection(
  sectionId: string,
  templateId: string
): Promise<{ latex: string; filename: string }> {
  const supabase = createClient()

  const { data: theories, error } = await supabase
    .from('theories')
    .select('id')
    .eq('section_id', sectionId)
    .eq('is_published', true)
    .order('order_index', { ascending: true })

  if (error || !theories || theories.length === 0) {
    throw new Error('Không có bài lý thuyết nào đã publish trong section này')
  }

  return generateLatex(
    theories.map((t) => t.id),
    templateId
  )
}
