'use client'

import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import RichText from './RichText'

/**
 * Câu hỏi "đoán trước" dùng chung cho các công cụ (nguyên tắc N1 —
 * docs/STUDENT_TOOLS_ROADMAP.md): học sinh chọn trước, rồi mới thấy đúng/sai và
 * lời giải. Chỉ tính lần chọn ĐẦU TIÊN; chọn lại không đổi kết quả, để chế độ
 * Tự làm không thành trò bấm thử cho tới khi đúng.
 *
 * Trạng thái đúng/sai luôn đi kèm icon + chữ, không chỉ màu (NT5).
 * Phải nằm trong một `<MathJax>` nếu câu hỏi có công thức.
 */

export interface ChoiceOption {
  id: string
  label: string
}

interface Props {
  question: string
  options: ChoiceOption[]
  correct: string
  /** `null` = chưa trả lời. */
  chosen: string | null
  onChoose: (id: string) => void
  explain?: string
  /** Nhãn nhỏ phía trên câu hỏi. */
  kicker?: string
}

export default function PredictChoice({ question, options, correct, chosen, onChoose, explain, kicker = 'Em đoán trước' }: Props) {
  const answered = chosen !== null
  const right = chosen === correct
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {kicker}
      </p>
      <p className="mt-1 text-[15px] text-slate-800 dark:text-slate-100">
        <RichText text={question} />
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Các lựa chọn">
        {options.map((opt) => {
          const isChosen = chosen === opt.id
          const isCorrect = opt.id === correct
          let tone =
            'border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
          if (answered && isCorrect) tone = 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
          else if (answered && isChosen) tone = 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
          else if (answered) tone = 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'
          return (
            <button
              key={opt.id}
              type="button"
              disabled={answered}
              aria-pressed={isChosen}
              onClick={() => onChoose(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-default ${tone}`}
            >
              {answered && isCorrect && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {answered && isChosen && !isCorrect && <XCircle className="h-4 w-4" aria-hidden="true" />}
              <RichText text={opt.label} />
            </button>
          )
        })}
      </div>
      {answered && (
        <p
          role="status"
          className={`mt-3 text-sm ${right ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}
        >
          <strong>{right ? '✓ Chính xác.' : '✗ Chưa đúng.'}</strong> {explain && <RichText text={explain} />}
        </p>
      )}
    </div>
  )
}
