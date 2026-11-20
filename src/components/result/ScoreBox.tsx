/**
 * Ô điểm của trang kết quả — hình ô "Điểm" trên tờ bài kiểm tra: một khung kẻ
 * đôi, bên trái điểm bằng số, bên phải điểm bằng chữ, số được khoanh như nét
 * bút chấm bài.
 *
 * BA NHÁNH, GIỮ ĐÚNG THỨ TỰ CỦA TRANG CŨ: chờ chấm tự luận → chưa công bố →
 * đã công bố. Thứ tự này là chính sách, không phải trình bày: một lượt còn câu
 * tự luận `pending_review` thì không được hiện điểm tổng, kể cả khi cờ công bố
 * đã bật (`AGENTS.md` mục 4, pilot tự luận).
 *
 * Điểm bằng chữ đọc từ chính chuỗi `toFixed(1)` đang hiện (`scoreInWords`), nên
 * hai dòng không bao giờ nói hai con số khác nhau.
 *
 * Không `'use client'`, không hook: chỉ trình bày từ props.
 */

import type { ReactNode } from 'react'
import { scoreInWords } from '@/lib/attempts/score-words'

interface ScoreBoxProps {
  /** `exam_attempts.grading_status`. */
  gradingStatus: string | undefined
  pendingGradingCount: number
  resultReleased: boolean
  /** `null` dù đã công bố là dữ liệu cũ hoặc chốt lỗi giữa đường — hiện "—". */
  score: number | null | undefined
}

/** Ba bậc, ngưỡng 8 / 5 như phần còn lại của app. Thang -700 để chữ nhỏ đi kèm cũng đạt tương phản. */
function scoreTone(score: number): string {
  if (score >= 8) return 'text-emerald-700 dark:text-emerald-300'
  if (score >= 5) return 'text-amber-700 dark:text-amber-300'
  return 'text-rose-700 dark:text-rose-300'
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-double border-slate-600/70 bg-[var(--background-raised)] dark:border-slate-400/50 dark:bg-slate-900/60">
      <div className="border-b border-slate-600/40 px-4 py-1.5 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-700 dark:border-slate-400/40 dark:text-slate-200">
        Điểm
      </div>
      {children}
    </div>
  )
}

const CELL_LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400'

export default function ScoreBox({ gradingStatus, pendingGradingCount, resultReleased, score }: ScoreBoxProps) {
  if (gradingStatus === 'pending_review') {
    return (
      <Frame>
        <div className="px-5 py-4">
          <div className="font-baloo text-2xl font-bold text-amber-700 dark:text-amber-300 sm:text-3xl">
            Đang chờ chấm tự luận
          </div>
          <p className="mt-1.5 text-slate-600 dark:text-slate-300">
            Còn {pendingGradingCount} câu cần giáo viên duyệt; chưa công bố điểm tổng.
          </p>
        </div>
      </Frame>
    )
  }

  if (!resultReleased) {
    return (
      <Frame>
        <div className="px-5 py-4 text-lg font-semibold text-amber-700 dark:text-amber-300">
          Giáo viên chưa công bố kết quả
        </div>
      </Frame>
    )
  }

  const hasScore = typeof score === 'number'
  const words = hasScore ? scoreInWords(score) : null

  return (
    <div>
      <Frame>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] divide-x divide-slate-600/40 dark:divide-slate-400/40">
          <div className="px-5 py-3 text-center">
            <p className={CELL_LABEL}>Bằng số</p>
            <div className="mt-1 flex items-baseline justify-center gap-1.5">
              <span
                className={`relative inline-block px-3 py-1 font-baloo text-5xl font-bold leading-none tabular-nums sm:text-6xl ${
                  hasScore ? scoreTone(score) : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {hasScore ? score.toFixed(1) : '—'}
                {/* Vòng khoanh điểm — nét bút vẽ ra một lần rồi đứng yên
                    (`.pen-stroke`, nằm trong lưới giảm chuyển động). Màu đi
                    theo tông của điểm qua `currentColor`. */}
                {hasScore && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 120 60"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute -left-1.5 -top-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.75rem)] overflow-visible"
                  >
                    <path
                      className="pen-stroke"
                      pathLength={100}
                      vectorEffect="non-scaling-stroke"
                      d="M18 34C12 16 40 5 66 6c30 1 50 13 47 28-3 17-31 24-56 23-26-1-46-10-44-25 2-10 12-17 24-20"
                    />
                  </svg>
                )}
              </span>
              {hasScore && <span className="text-lg text-slate-500 dark:text-slate-400">/ 10</span>}
            </div>
          </div>
          <div className="flex min-w-0 flex-col justify-center px-5 py-3">
            <p className={CELL_LABEL}>Bằng chữ</p>
            <p className="mt-1 font-baloo text-xl font-semibold leading-snug text-slate-800 dark:text-slate-100 sm:text-2xl">
              {words ?? '—'}
            </p>
          </div>
        </div>
      </Frame>
      {/* `score` có thể null dù đã công bố (dữ liệu cũ, chốt lỗi giữa đường) —
          nói thẳng là chưa có điểm thay vì để ô trống không giải thích gì. */}
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {hasScore
          ? 'Điểm tính theo trọng số của đề'
          : 'Chưa có điểm tổng cho lượt thi này. Hãy liên hệ giáo viên.'}
      </p>
    </div>
  )
}
