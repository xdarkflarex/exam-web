/**
 * Dải "Mảng cần củng cố".
 *
 * Thi công phần còn lại của Phase 9 (docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.5):
 * đưa tín hiệu năng lực lên `/student` thay vì để nó bị chôn trong tab của
 * `/student/analytics`.
 *
 * Chỉ lấy mảng ở mức CHUYÊN ĐỀ (`theory:`), bỏ mức khối kiến thức (`block:`).
 * Lý do là đường dẫn: `/learn` nhận `?theory=<id>`, không nhận id khối, nên một
 * dòng `block:` sẽ chỉ dẫn được về `/learn` chung chung — một liên kết trông như
 * đưa tới đúng chỗ nhưng không đưa tới đâu cả.
 */

'use client'

import Link from 'next/link'
import { ChevronRight, LifeBuoy } from 'lucide-react'
import { getMasteryStatusLabel, type MasteryStatus } from '@/lib/analytics/knowledge-mastery'
import { MASTERY_CHIP_TONE, MASTERY_RAIL_COLOR } from '@/lib/analytics/mastery-tone'
import type { CapabilityStat } from '@/lib/analytics/student-capability'

/** Chỉ hai mức này là "cần củng cố". `collecting` chưa đủ bằng chứng để kết luận. */
const WEAK: MasteryStatus[] = ['needs_work', 'building']

interface Props {
  stats: CapabilityStat[]
  /** Tối đa bao nhiêu dòng. Mục 3.5 chốt 3 — dài hơn thì thành bảng thống kê thứ hai. */
  limit?: number
}

export default function WeakAreas({ stats, limit = 3 }: Props) {
  const items = stats
    .filter((stat) => stat.id.startsWith('theory:') && WEAK.includes(stat.status))
    .slice(0, limit)

  if (!items.length) return null

  return (
    <section aria-labelledby="weak-areas-heading" className="animate-dash-in-1 mb-6">
      <div className="mb-3 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <h2 id="weak-areas-heading" className="text-lg font-bold text-slate-800 dark:text-white">
          Mảng cần củng cố
        </h2>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/learn?theory=${encodeURIComponent(item.id.slice('theory:'.length))}`}
              className="bento-tile bento-rail group flex h-full flex-col justify-between gap-3 p-4"
              style={{ '--rail': MASTERY_RAIL_COLOR[item.status] } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-800 dark:text-white">{item.label}</span>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Trạng thái = màu + chữ, không bao giờ chỉ màu (DESIGN_SYSTEM.md). */}
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${MASTERY_CHIP_TONE[item.status]}`}>
                  {getMasteryStatusLabel(item.status)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  đúng {item.accuracy}% / {item.total} câu
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
