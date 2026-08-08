/**
 * Lưới hoạt động theo ngày.
 *
 * Toàn bộ tính toán nằm ở `@/lib/analytics/activity-streak` để test được không
 * cần DOM; component này chỉ vẽ.
 */

import { buildHeatmap, describeCell, type HeatmapCell } from '@/lib/analytics/activity-streak'

const LEVEL_CLASS = [
  'fill-slate-200 dark:fill-slate-700',
  'fill-teal-200 dark:fill-teal-900',
  'fill-teal-300 dark:fill-teal-700',
  'fill-teal-500 dark:fill-teal-500',
  'fill-teal-600 dark:fill-teal-400',
]

interface Props {
  /** Số câu đã làm theo ngày, khóa `YYYY-MM-DD` giờ địa phương. */
  counts: Map<string, number>
  /** Số ngày hiển thị. Mặc định 28 = 4 tuần. */
  days?: number
  cell?: number
  gap?: number
  /** Cho phép test cố định ngày. */
  today?: Date
}

export default function ActivityHeatmap({ counts, days = 28, cell = 12, gap = 3, today }: Props) {
  const cells = buildHeatmap(counts, days, today)
  if (!cells.length) return null

  // Mỗi cột là một tuần; hàng là thứ trong tuần. Ô đầu tiên có thể không rơi vào
  // Chủ nhật, nên cột đầu được đệm bằng chỗ trống thay vì dồn lệch cả lưới.
  const columns: HeatmapCell[][] = []
  let column: HeatmapCell[] = []
  for (const item of cells) {
    if (item.weekday === 0 && column.length) {
      columns.push(column)
      column = []
    }
    column.push(item)
  }
  if (column.length) columns.push(column)

  const width = columns.length * (cell + gap) - gap
  const height = 7 * (cell + gap) - gap
  const activeDays = cells.filter((item) => item.count > 0).length

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Hoạt động ${days} ngày gần nhất: học ${activeDays} ngày.`}
    >
      {columns.map((week, columnIndex) =>
        week.map((item) => (
          <rect
            key={item.key}
            x={columnIndex * (cell + gap)}
            y={item.weekday * (cell + gap)}
            width={cell}
            height={cell}
            rx={2.5}
            className={LEVEL_CLASS[item.level]}
          >
            <title>{describeCell(item)}</title>
          </rect>
        ))
      )}
    </svg>
  )
}
