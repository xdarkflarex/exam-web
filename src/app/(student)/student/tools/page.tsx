/**
 * Danh sách công cụ học tập. Đọc thẳng `STUDENT_TOOLS` — thêm công cụ mới chỉ
 * cần thêm vào registry và tạo route con, trang này tự hiện thêm thẻ.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, PencilRuler, Wrench } from 'lucide-react'
import { STUDENT_TOOLS } from '@/lib/tools/registry'

export const metadata: Metadata = {
  title: 'Công cụ học tập',
}

export default function StudentToolsPage() {
  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
          <div className="paper-grid p-5 sm:p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
              <Wrench className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Công cụ học tập
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Tự nhập đề của mình và xem từng bước giải. Công cụ chạy ngay trên máy, không lưu lại gì.
            </p>
          </div>
        </header>

        <ul className="animate-list-stagger grid gap-4 md:grid-cols-2">
          {STUDENT_TOOLS.map((tool) => (
            <li key={tool.slug}>
              <Link
                href={`/student/tools/${tool.slug}`}
                className="bento-tile bento-hover group flex h-full flex-col gap-3 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                    <PencilRuler className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-800 dark:text-white">{tool.title}</h2>
                    <p className="mt-0.5 text-xs font-medium text-teal-700 dark:text-teal-400">
                      Lớp {tool.grade} · {tool.lesson}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{tool.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-teal-700 dark:text-teal-300">
                  Mở công cụ
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
