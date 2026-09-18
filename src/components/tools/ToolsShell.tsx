'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ChartSpline, GitFork, PencilRuler, Sigma, Wrench } from 'lucide-react'
import { MathProvider } from '@/components/MathContent'
import { findTool, STUDENT_TOOLS, type ToolIcon } from '@/lib/tools/registry'

/**
 * Khu "Công cụ học tập": MỘT trang làm việc, các công cụ là các tab.
 *
 * Chủ dự án yêu cầu gom công cụ về một chỗ thay vì mỗi công cụ một trang rời.
 * Mỗi tab vẫn là một route con (`/student/tools/<slug>`) để link thẳng tới công
 * cụ được, nhưng đầu trang, thanh tab và MathJax nằm ở layout nên chuyển tab
 * không tải lại khung, không nạp lại MathJax.
 */

const ICONS: Record<ToolIcon, typeof Wrench> = {
  region: PencilRuler,
  tree: GitFork,
  histogram: BarChart3,
  curve: ChartSpline,
  integral: Sigma,
}

export default function ToolsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const active = findTool(pathname) ?? STUDENT_TOOLS[0]
  const navRef = useRef<HTMLElement>(null)

  // Trên điện thoại thanh tab cuộn ngang: đưa tab đang mở vào giữa, kẻo học sinh
  // mở "Bayes" mà chỉ thấy nửa chữ "Ghép nhóm" ở mép phải. Chỉ cuộn TRONG thanh
  // tab (scrollLeft), không đụng tới cuộn dọc của trang.
  useEffect(() => {
    const nav = navRef.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current) return
    const n = nav.getBoundingClientRect()
    const c = current.getBoundingClientRect()
    nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2
  }, [pathname])

  return (
    <MathProvider>
      <main className="min-h-screen p-4 lg:p-6">
        <div className="mx-auto max-w-6xl">
          <header className="animate-dash-in bento-tile-lead mb-4 overflow-hidden">
            <div className="paper-grid px-5 pb-4 pt-5 sm:px-6">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Công cụ học tập
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">{active.title}</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {active.grade} · {active.lesson}
              </p>

              {/* Tab = link: giữ URL riêng cho từng công cụ. Trên điện thoại cuộn
                  ngang trong chính thanh này, không đẩy trang tràn. */}
              <nav ref={navRef} aria-label="Chọn công cụ" className="scrollbar-hide -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
                {STUDENT_TOOLS.map((tool) => {
                  const Icon = ICONS[tool.icon]
                  const current = tool.slug === active.slug
                  return (
                    <Link
                      key={tool.slug}
                      href={`/student/tools/${tool.slug}`}
                      aria-current={current ? 'page' : undefined}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                        current
                          ? 'border-teal-600 bg-teal-600 text-white shadow-sm dark:border-teal-500 dark:bg-teal-500'
                          : 'border-slate-300 bg-[var(--background-card)] text-slate-700 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-teal-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {tool.short}
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                          current ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {tool.grade.replace('Lớp ', 'L')}
                      </span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </header>

          {children}
        </div>
      </main>
    </MathProvider>
  )
}
