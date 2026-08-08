'use client'

/**
 * Bốn việc giáo viên làm thường xuyên nhất, đặt ngay đầu dashboard.
 *
 * Thay cho banner "Xin chào, Giáo viên! 👋" — banner đó chiếm vị trí đẹp nhất
 * trang mà không có một CTA nào, nên mọi tác vụ đều phải đi qua sidebar.
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 6.4.
 */

import Link from 'next/link'
import { ClipboardList, FilePlus2, HelpCircle, Users } from 'lucide-react'

const actions = [
  {
    label: 'Nhập câu hỏi',
    detail: 'Thêm vào ngân hàng đề',
    href: '/admin/questions',
    icon: HelpCircle,
  },
  {
    label: 'Tạo đề thi',
    detail: 'Thi thử hoặc ôn tập',
    href: '/admin/exams/create',
    icon: FilePlus2,
  },
  {
    label: 'Giao bài tập',
    detail: 'Chọn lớp và hạn nộp',
    href: '/admin/homework',
    icon: ClipboardList,
  },
  {
    label: 'Xem học sinh',
    detail: 'Ai đang chậm lại',
    href: '/admin/students',
    icon: Users,
  },
]

export default function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">
        Việc thường làm
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-3 rounded-2xl border border-slate-300 bg-slate-200 p-4 transition-colors hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-teal-600 dark:hover:bg-teal-950/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {action.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{action.detail}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
