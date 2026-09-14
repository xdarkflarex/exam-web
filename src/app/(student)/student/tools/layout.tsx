import type { ReactNode } from 'react'
import ToolsShell from '@/components/tools/ToolsShell'

/** Khu công cụ dùng chung một khung: đầu trang + thanh tab + MathJax. */
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <ToolsShell>{children}</ToolsShell>
}
