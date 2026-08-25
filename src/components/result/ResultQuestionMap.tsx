'use client'

import type { AttemptQuestionView } from '@/lib/attempts/attemptView'
import {
  CELL_STATE_TEXT as STATE_TEXT,
  cellState,
  type CellState,
} from '@/lib/attempts/resultCellState'

/**
 * Bản đồ câu của một lượt làm bài.
 *
 * VÌ SAO CẦN. Trang kết quả trước đây chỉ có một danh sách dọc 22 câu, mỗi câu
 * bung đầy đủ đề + đáp án + giải thích + lời giải. Muốn biết "mình sai những
 * câu nào" thì phải cuộn hết trang và tự nhớ. Bản đồ trả lời câu đó trong một
 * lần nhìn, và là chỗ bấm để nhảy tới đúng câu.
 *
 * NHÓM THEO PHẦN, SUY TỪ `questionType`. Cấu trúc đề của Bộ GD&ĐT chính là
 * cấu trúc theo dạng câu: Phần 1 trắc nghiệm, Phần 2 đúng/sai, Phần 3 trả lời
 * ngắn (xem `docs/SCORING.md` và `ExamData.part1/2/3`). Nên không cần đọc thêm
 * `part_number` — thứ `AttemptQuestionView` không mang sang — mà vẫn ra đúng
 * cách chia mà học sinh thấy trong phòng thi.
 *
 * TRẠNG THÁI KHÔNG BAO GIỜ CHỈ BẰNG MÀU (`DESIGN_SYSTEM.md`). Mỗi ô khác nhau
 * cả về HÌNH: đúng là ô đặc, sai là ô đặc có gạch dưới đậm, chưa làm là ô viền
 * nét đứt không nền, chờ chấm là ô viền liền. Kèm `aria-label` đọc ra chữ.
 */

/** Nhãn phần theo dạng câu — đúng thứ tự đề Bộ GD&ĐT. */
const PART_LABEL: Record<string, string> = {
  multiple_choice: 'Phần 1 · Trắc nghiệm',
  true_false: 'Phần 2 · Đúng / Sai',
  short_answer: 'Phần 3 · Trả lời ngắn',
  essay: 'Phần 4 · Tự luận',
}

const PART_ORDER = ['multiple_choice', 'true_false', 'short_answer', 'essay'] as const

/**
 * Lớp CSS của ô. Mỗi trạng thái khác cả nền lẫn viền lẫn hình, không chỉ màu.
 * Thang 600/700 cho nền đặc để chữ trắng đạt tương phản ở light mode — cùng lý
 * do đã ghi ở khối "SỬA TƯƠNG PHẢN" trong `globals.css`.
 */
const STATE_CLASS: Record<CellState, string> = {
  correct: 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
  wrong:
    'bg-rose-600 text-white border-rose-600 border-b-[3px] border-b-rose-900 dark:bg-rose-500 dark:border-rose-500 dark:border-b-rose-800',
  unanswered:
    'border-dashed border-slate-400 text-slate-500 dark:border-slate-500 dark:text-slate-400',
  pending: 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300',
  hidden: 'border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-300',
}

interface Props {
  questions: AttemptQuestionView[]
  /** `exam_attempts.answer_key_revealed` — chưa công bố thì không hé đúng/sai. */
  revealed: boolean
  /** Nhảy tới câu. Nhận số thứ tự 1-based đúng như nhãn hiển thị. */
  onJump: (questionNumber: number) => void
}

export default function ResultQuestionMap({ questions, revealed, onJump }: Props) {
  if (questions.length === 0) return null

  // Số thứ tự phải tính TRƯỚC khi nhóm: nhãn "Câu 13" của học sinh là vị trí
  // trong cả đề, không phải vị trí trong phần.
  const numbered = questions.map((question, index) => ({
    question,
    number: index + 1,
    state: cellState(question, revealed),
  }))

  const groups = PART_ORDER.map((type) => ({
    type,
    label: PART_LABEL[type],
    items: numbered.filter((item) => item.question.questionType === type),
  })).filter((group) => group.items.length > 0)

  const legend: CellState[] = revealed
    ? ['correct', 'wrong', 'unanswered']
    : ['hidden', 'unanswered']
  const hasPending = numbered.some((item) => item.state === 'pending')
  if (hasPending) legend.push('pending')

  return (
    <section aria-label="Bản đồ câu hỏi" className="space-y-4">
      {groups.map((group) => (
        <div key={group.type}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {group.label}
            <span className="ml-2 font-normal normal-case tracking-normal">
              {group.items.length} câu
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map(({ number, state }) => (
              <button
                key={number}
                type="button"
                onClick={() => onJump(number)}
                aria-label={`Câu ${number}, ${STATE_TEXT[state]}. Bấm để xem chi tiết.`}
                title={`Câu ${number} — ${STATE_TEXT[state]}`}
                className={`h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${STATE_CLASS[state]}`}
              >
                {number}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
        {legend.map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-3.5 w-3.5 rounded border ${STATE_CLASS[state]}`}
            />
            {STATE_TEXT[state]}
          </span>
        ))}
      </div>
    </section>
  )
}
