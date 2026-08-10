'use client'

import { useMemo, type ReactNode } from 'react'
import { MathJax, MathJaxContext } from 'better-react-mathjax'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import dynamic from 'next/dynamic'
import { normalizeLatexTablesForMarkdown } from '@/lib/theories/latex-normalize'
import { hasHtmlMarkup, hasMarkdownSyntax } from '@/lib/markdown/content-kind'

// Lazy load TikzRenderer (heavy dependency)
const TikzRenderer = dynamic(() => import('./TikzRenderer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
      <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      Đang tải TikZ renderer...
    </div>
  ),
})

const config = {
  loader: { load: ['input/tex', 'output/chtml'] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
  },
  options: {
    /*
      MathJax phải chừa hình TikZ ra. TikZJax bơm SVG (và trước đó là thẻ
      <script type="text/tikz"> chứa mã LaTeX thô) vào `.tikz-container`; nếu
      MathJax quét vào đó nó sẽ gặp `\begin{tikzpicture}` và báo
      "Unknown environment 'tikzpicture'".
    */
    ignoreHtmlClass: 'tikz-container|tex2jax_ignore',
    processHtmlClass: 'tex2jax_process',
  },
}

interface MathContentProps {
  content: string
  className?: string
  /**
   * Định dạng của `content`.
   *
   * `auto` (mặc định) tự đoán — hợp cho ngân hàng câu hỏi, nơi nội dung khi thì
   * HTML dán từ Word, khi thì Markdown, khi thì chữ thường.
   *
   * `markdown` là khi bên gọi BIẾT CHẮC, ví dụ `content_md` / `body_md` do
   * parser LaTeX sinh ra. Cần nói rõ vì phép đoán không thể đúng hết: đo trên
   * 384 khối lý thuyết thật thì 94 khối chỉ có công thức và đoạn văn, không có
   * dấu hiệu Markdown nào (`**`, `-`, `##`), nên bị coi là chữ thường và mất
   * hết ngắt đoạn.
   */
  format?: 'auto' | 'markdown'
}

export function MathProvider({ children }: { children: ReactNode }) {
  return (
    <MathJaxContext config={config}>
      {children}
    </MathJaxContext>
  )
}


// Custom code renderer that handles tikz blocks
const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''

    // Render TikZ code blocks using TikzRenderer
    if (language === 'tikz') {
      const tikzCode = String(children).replace(/\n$/, '')
      return <TikzRenderer code={tikzCode} />
    }

    // Regular code blocks
    if (language) {
      return (
        <pre className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-200 dark:border-slate-700">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      )
    }

    // Inline code
    return (
      <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm" {...props}>
        {children}
      </code>
    )
  },
  table({ children, ...props }) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full border-collapse text-sm" {...props}>
          {children}
        </table>
      </div>
    )
  },
  th({ children, ...props }) {
    return (
      <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800" {...props}>
        {children}
      </th>
    )
  },
  td({ children, ...props }) {
    return (
      <td className="border border-slate-200 px-3 py-2 align-top dark:border-slate-700" {...props}>
        {children}
      </td>
    )
  },
}

export default function MathContent({ content, className = '', format = 'auto' }: MathContentProps) {
  const normalizedContent = useMemo(() => normalizeLatexTablesForMarkdown(content), [content])
  // Check if content contains HTML tags
  const hasHtml = format === 'auto' && hasHtmlMarkup(normalizedContent)
  const isMarkdown = format === 'markdown' || (!hasHtml && hasMarkdownSyntax(normalizedContent))

  return (
    <MathJax className={className} dynamic>
      {isMarkdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-blockquote:my-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {normalizedContent}
          </ReactMarkdown>
        </div>
      ) : hasHtml ? (
        <div dangerouslySetInnerHTML={{ __html: normalizedContent }} />
      ) : (
        <span>{normalizedContent}</span>
      )}
    </MathJax>
  )
}
