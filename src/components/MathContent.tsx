'use client'

import { MathJax, MathJaxContext } from 'better-react-mathjax'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import dynamic from 'next/dynamic'

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
}

interface MathContentProps {
  content: string
  className?: string
}

export function MathProvider({ children }: { children: React.ReactNode }) {
  return (
    <MathJaxContext config={config}>
      {children}
    </MathJaxContext>
  )
}

// Detect if content has markdown syntax
function hasMarkdown(text: string): boolean {
  return /(?:^|\n)#{1,6}\s|(?:^|\n)[-*+]\s|(?:^|\n)\d+\.\s|\*\*.+?\*\*|__.+?__|\*.+?\*|_[^_]+_|~~.+?~~|`.+?`|(?:^|\n)>\s|(?:^|\n)```|\[.+?\]\(.+?\)|(?:^|\n)\|.+\|/.test(text)
}

// Custom code renderer that handles tikz blocks
const markdownComponents = {
  code({ className, children, ...props }: any) {
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
}

export default function MathContent({ content, className = '' }: MathContentProps) {
  // Check if content contains HTML tags
  const hasHtml = /<[^>]+>/.test(content)
  const isMarkdown = !hasHtml && hasMarkdown(content)

  return (
    <MathJax className={className} dynamic>
      {isMarkdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-blockquote:my-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : hasHtml ? (
        <div dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <span>{content}</span>
      )}
    </MathJax>
  )
}
