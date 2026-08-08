/**
 * Bảng màu cho sáu mức năng lực — nguồn duy nhất.
 *
 * Trước đây bảng này bị chép hai nơi: `statusTone`/`barTone` trong
 * `src/app/(student)/student/analytics/page.tsx` và `STATUS_TONE` trong
 * `src/components/student/WeakAreas.tsx`. Hai bản đã bắt đầu lệch nhau ở mức
 * `no_data` (một bên `text-slate-500`, một bên `text-slate-600`), nghĩa là cùng
 * một trạng thái hiện hai màu khác nhau tuỳ trang học sinh đang đứng — đúng loại
 * lệch mà `docs/STUDENT_SKILL_TREE_REDESIGN.md` mục 3.1 muốn tránh khi gom hai
 * thang đo về một.
 *
 * Module này CỐ Ý chỉ chứa chuỗi class: không import React, không import
 * component, nên nó dùng được cả ở file `.ts` thuần lẫn ở JSX.
 *
 * Màu KHÔNG BAO GIỜ đứng một mình. Mọi nơi dùng bảng này phải kèm nhãn chữ
 * (`getMasteryStatusLabel`) — xem `docs/DESIGN_SYSTEM.md`.
 */

import type { MasteryStatus } from './knowledge-mastery'

/**
 * Chip trạng thái: nền nhạt + chữ đậm cùng tông.
 *
 * `no_data` dùng `text-slate-600` (không phải `slate-500`) vì `slate-500` mới đo
 * được 3.9:1 trên nền sáng, dưới chuẩn AA cho chữ nhỏ — xem `docs/DESIGN_TODO.md`
 * mục 1. Chip trạng thái luôn là chữ nhỏ nên đây là chỗ phải chọn bản đậm hơn.
 */
export const MASTERY_CHIP_TONE: Record<MasteryStatus, string> = {
  no_data: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  collecting: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
  needs_work: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
  building: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  stable: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  mastered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
}

/** Màu đặc cho thanh tiến độ / dải cạnh ô. */
export const MASTERY_BAR_TONE: Record<MasteryStatus, string> = {
  no_data: 'bg-slate-300 dark:bg-slate-600',
  collecting: 'bg-violet-400',
  needs_work: 'bg-rose-500',
  building: 'bg-amber-500',
  stable: 'bg-blue-500',
  mastered: 'bg-emerald-500',
}

/**
 * Màu viền/nhấn khi ô cần được phân loại bằng dải cạnh (`.bento-rail`).
 *
 * Trả giá trị CSS đặt được vào biến `--rail`, không phải class Tailwind: biến
 * CSS không nhận tên utility.
 */
export const MASTERY_RAIL_COLOR: Record<MasteryStatus, string> = {
  no_data: 'var(--border)',
  collecting: '#a78bfa',
  needs_work: '#f43f5e',
  building: '#f59e0b',
  stable: '#3b82f6',
  mastered: '#10b981',
}
