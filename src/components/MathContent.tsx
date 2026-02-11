'use client'

import { MathJax, MathJaxContext } from 'better-react-mathjax'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

export default function MathContent({ content, className = '' }: MathContentProps) {
  // Check if content contains HTML tags
  const hasHtml = /<[^>]+>/.test(content)
  const isMarkdown = !hasHtml && hasMarkdown(content)

  return (
    <MathJax className={className} dynamic>
      {isMarkdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-blockquote:my-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : hasHtml ? (
        <div dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <span>{content}</span>
      )}
    </MathJax>
  )
}
