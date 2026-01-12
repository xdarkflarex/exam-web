'use client'

import { MathJax, MathJaxContext } from 'better-react-mathjax'

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

export default function MathContent({ content, className = '' }: MathContentProps) {
  return (
    <MathJax className={className}>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </MathJax>
  )
}
