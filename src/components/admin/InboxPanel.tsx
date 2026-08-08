'use client'

/**
 * "Cần bạn xử lý" — danh sách việc đang chờ, mỗi dòng dẫn tới đúng chỗ giải quyết.
 *
 * Thay cho bốn vanity metric (tổng đề, tổng câu hỏi, lượt làm bài, số học sinh):
 * không con số nào trong đó trả lời được "hôm nay tôi cần làm gì".
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.6.
 *
 * Dòng có `count = 0` vẫn hiện, ở trạng thái đã xong — biết mình không còn việc
 * cũng là thông tin. Dòng chưa đo được thì nói rõ là chưa đo được, không hiện 0.
 */

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react'

export interface InboxItem {
  id: string
  label: string
  /** `null` = không đo được (thiếu bảng/quyền), khác hẳn với 0 = đã xong. */
  count: number | null
  href: string
  /** Giải thích khi count là null, hoặc chú thích thêm. */
  note?: string
  tone: 'rose' | 'amber' | 'teal'
}

const TONE: Record<InboxItem['tone'], { chip: string; text: string }> = {
  rose: {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    text: 'text-rose-700 dark:text-rose-300',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  teal: {
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    text: 'text-teal-700 dark:text-teal-300',
  },
}

export default function InboxPanel({ items, loading }: { items: InboxItem[]; loading?: boolean }) {
  const pending = items.filter((item) => (item.count ?? 0) > 0).length

  return (
    <section
      aria-labelledby="inbox-heading"
      className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-300 p-4 dark:border-slate-700 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
            Hôm nay
          </p>
          <h2 id="inbox-heading" className="font-bold text-slate-800 dark:text-slate-100">
            Cần bạn xử lý
          </h2>
        </div>
        {!loading && (
          <span className="shrink-0 rounded-full bg-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {pending > 0 ? `${pending} việc` : 'Đã xong'}
          </span>
        )}
      </div>

      <ul className="divide-y divide-slate-300 dark:divide-slate-700">
        {items.map((item) => {
          const tone = TONE[item.tone]
          const unknown = item.count === null
          const done = item.count === 0

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-slate-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 dark:hover:bg-slate-700/50 sm:px-5"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    unknown
                      ? 'bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      : done
                        ? 'bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        : tone.chip
                  }`}
                >
                  {unknown ? (
                    <HelpCircle className="h-5 w-5" />
                  ) : done ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="font-baloo text-base font-bold">{item.count}</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {item.label}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      unknown || done ? 'text-slate-500 dark:text-slate-400' : tone.text
                    }`}
                  >
                    {loading
                      ? 'Đang tính...'
                      : unknown
                        ? item.note || 'Chưa đo được'
                        : done
                          ? 'Không còn việc'
                          : item.note || 'Cần xử lý'}
                  </span>
                </span>

                {!loading && !unknown && !done && (
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${tone.text}`} />
                )}
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
