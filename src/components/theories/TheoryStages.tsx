'use client'

/**
 * Nội dung một bài, đọc theo KHÂU HỌC.
 *
 * Trước đây panel của `/learn` đổ thẳng danh sách khối: mười lăm thẻ màu nối
 * đuôi nhau, không chỗ nào nói thẻ này là bước nào trong việc học. Loại khối
 * lại chính là trình tự — xem `src/lib/theories/learning-stage.ts` và
 * docs/DESIGN_OVERHAUL_2026-08-09.md mục 3b.
 *
 * Ba quyết định định hình file này:
 *
 * 1. KHÔNG SẮP LẠI KHỐI. Thứ tự đọc vẫn là `order_index` của tác giả; component
 *    chỉ chèn tiêu đề khâu vào chỗ khâu đổi. Gom khối cùng khâu về một chỗ đọc
 *    gọn hơn nhưng làm sai nội dung bài (xem chú thích của `splitIntoStageRuns`).
 *
 * 2. KHÔNG SỐ THỨ TỰ KHÂU. Bài lý thuyết thuần không có BÀI TẬP là chuyện bình
 *    thường; ghi "Khâu 6" cạnh một dải chỉ có ba khâu khiến học sinh đi tìm ba
 *    khâu không tồn tại. Trình tự đã nằm ở vị trí và dấu mũi tên.
 *
 * 3. DẢI KHÂU KHÔNG PHẢI THANH TIẾN ĐỘ. Nó nói bài này CÓ những khâu nào, không
 *    nói học sinh đã qua khâu nào — dữ liệu đó chưa đo được (năng lực hiện tính
 *    theo bài, không theo khối). Tô "đã xong" bằng suy đoán là đúng loại lỗi mục
 *    7.1 cấm.
 */

import { useCallback, useMemo, useRef } from 'react'
import {
  BookOpen,
  Compass,
  GraduationCap,
  PencilLine,
  ScrollText,
  Sigma,
  type LucideIcon,
} from 'lucide-react'
import MathContent from '@/components/MathContent'
import { getBlockStyle } from '@/lib/theories/block-style'
import {
  splitIntoStageRuns,
  summarizeStages,
  type LearningStageKey,
} from '@/lib/theories/learning-stage'
import type { KnowledgeBlock } from '@/types/theories'

/**
 * Icon sống ở lớp giao diện, không ở `learning-stage.ts`.
 *
 * Module kia là logic thuần và được test bằng `node --test`; kéo `lucide-react`
 * vào đó là kéo cả React vào một chỗ không cần React.
 */
const STAGE_ICON: Record<LearningStageKey, LucideIcon> = {
  khai_niem: BookOpen,
  ket_qua: ScrollText,
  cong_thuc: Sigma,
  phuong_phap: Compass,
  vi_du: PencilLine,
  bai_tap: GraduationCap,
}

interface Props {
  blocks: KnowledgeBlock[]
}

export default function TheoryStages({ blocks }: Props) {
  const runRefs = useRef(new Map<number, HTMLElement>())

  const runs = useMemo(() => splitIntoStageRuns(blocks), [blocks])
  const summary = useMemo(() => summarizeStages(blocks), [blocks])

  /**
   * Khâu → đoạn ĐẦU TIÊN mang khâu đó.
   *
   * Một bài có thể quay lại khâu cũ, nên một khâu có thể ứng với nhiều đoạn.
   * Dải khâu đưa về đoạn đầu vì đó là chỗ khâu bắt đầu.
   */
  const firstRunOfStage = useMemo(() => {
    const map = new Map<LearningStageKey, number>()
    runs.forEach((run, index) => {
      if (run.stage && !map.has(run.stage.key)) map.set(run.stage.key, index)
    })
    return map
  }, [runs])

  const jumpToStage = useCallback((key: LearningStageKey) => {
    const index = firstRunOfStage.get(key)
    if (index === undefined) return
    const element = runRefs.current.get(index)
    if (!element) return
    element.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [firstRunOfStage])

  if (!blocks.length) return null

  return (
    <div className="space-y-4">
      {/*
        Dải khâu chỉ có nghĩa khi có ÍT NHẤT HAI khâu. Một bài chỉ toàn ví dụ mà
        vẫn vẽ dải "Ví dụ" là thêm một hàng chữ không nói thêm điều gì.
      */}
      {summary.length > 1 && (
        <nav
          aria-label="Các khâu của bài học"
          className="rounded-2xl border border-slate-200 bg-[var(--background)] p-3 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Bài này đi qua {summary.length} khâu
          </p>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
            {summary.map((entry, index) => {
              const Icon = STAGE_ICON[entry.stage.key]
              return (
                <li key={entry.stage.key} className="flex items-center gap-1">
                  {/* Mũi tên là thứ nói "trình tự"; ẩn với trình đọc màn hình vì
                      thứ tự đã nằm trong `<ol>`. */}
                  {index > 0 && (
                    <span aria-hidden="true" className="px-0.5 text-slate-400 dark:text-slate-500">
                      →
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => jumpToStage(entry.stage.key)}
                    title={entry.stage.hint}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-[var(--background-card)] px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-600/50 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 dark:border-slate-600 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-teal-400/50 dark:hover:text-teal-200 dark:focus-visible:outline-teal-400"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {entry.stage.label}
                    <span className="font-normal tabular-nums text-slate-500 dark:text-slate-400">
                      {entry.count}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      {runs.map((run, index) => {
        const Icon = run.stage ? STAGE_ICON[run.stage.key] : null
        /*
          Bài thật hay quay lại khâu cũ: "CỰC TRỊ CỦA HÀM SỐ" đi Phương pháp →
          Ví dụ → Phương pháp → Ví dụ, mỗi cặp cho một dạng bài. Lần lặp lại vẫn
          hiện tiêu đề khâu (nó vẫn là mốc điều hướng) nhưng bỏ câu mô tả — nhắc
          lại "Các bước làm cho một dạng bài" lần thứ hai không thêm thông tin,
          chỉ thêm chữ.
        */
        const firstOfStage = run.stage ? firstRunOfStage.get(run.stage.key) === index : true

        return (
          <section
            key={index}
            ref={element => {
              if (element) runRefs.current.set(index, element)
              else runRefs.current.delete(index)
            }}
            aria-label={run.stage ? `Khâu ${run.stage.label}` : 'Lưu ý trước khi vào bài'}
            // Bù phần bị header dính của panel che khi nhảy từ dải khâu xuống.
            className="scroll-mt-24 space-y-3"
          >
            {run.stage && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-200 pb-1.5 dark:border-white/10">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">
                  {Icon && <Icon className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden="true" />}
                  {run.stage.label}
                </h3>
                {firstOfStage && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{run.stage.hint}</p>
                )}
              </div>
            )}

            {run.blocks.map(block => {
              const style = getBlockStyle(block.block_type)
              return (
                <article
                  key={block.id}
                  className="min-w-0 overflow-hidden rounded-2xl border bg-[var(--background)] p-4 shadow-sm dark:bg-white/[0.035] dark:shadow-lg dark:shadow-black/20"
                  style={{ borderColor: style.color }}
                >
                  <p
                    className="mb-2 text-xs font-black uppercase tracking-[0.16em]"
                    style={{ color: style.color }}
                  >
                    {style.icon} {style.label}
                  </p>
                  {block.title && (
                    <h4 className="mb-3 text-lg font-black leading-snug text-slate-900 dark:text-white">
                      {block.title}
                    </h4>
                  )}
                  {block.body_md && (
                    <div className="min-w-0 max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
                      <MathContent content={block.body_md} format="markdown" className="max-w-full" />
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
