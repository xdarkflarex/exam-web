'use client'

import { BookOpenCheck, Eye } from 'lucide-react'

export type ToolMode = 'guided' | 'self'

/**
 * Chuyển giữa "Xem lời giải mẫu" và "Tự làm" — dùng chung cho mọi công cụ có
 * câu hỏi đoán trước (nguyên tắc N1–N2, docs/STUDENT_TOOLS_ROADMAP.md).
 */
export default function ModeToggle({ mode, onChange }: { mode: ToolMode; onChange: (m: ToolMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Chế độ"
      className="inline-flex shrink-0 self-start rounded-xl border border-slate-300 bg-[var(--background-card)] p-1 dark:border-slate-600"
    >
      {(
        [
          ['guided', 'Xem lời giải mẫu', Eye],
          ['self', 'Tự làm', BookOpenCheck],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          onClick={() => mode !== id && onChange(id)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === id ? 'bg-teal-600 text-white dark:bg-teal-500' : 'text-slate-600 hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
