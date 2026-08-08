/**
 * Đường xu hướng nhỏ, vẽ như đồ thị hàm số.
 *
 * SVG thuần. Có trục nhạt để đọc được là đang lên hay xuống — mô-típ thị giác
 * lấy từ chính môn học (docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.2).
 *
 * Dưới `MIN_POINTS` điểm thì KHÔNG vẽ đường: hai điểm nối nhau trông như một xu
 * hướng rõ ràng trong khi nó chỉ là hai lần đo.
 */

import { toPoints } from './geometry'

export const MIN_POINTS = 3

export type SparkTone = 'teal' | 'amber' | 'rose' | 'slate'

const TONE: Record<SparkTone, { line: string; fill: string; dot: string }> = {
  teal: { line: 'stroke-teal-500 dark:stroke-teal-400', fill: 'fill-teal-500/10', dot: 'fill-teal-600 dark:fill-teal-300' },
  amber: { line: 'stroke-amber-500 dark:stroke-amber-400', fill: 'fill-amber-500/10', dot: 'fill-amber-600 dark:fill-amber-300' },
  rose: { line: 'stroke-rose-500 dark:stroke-rose-400', fill: 'fill-rose-500/10', dot: 'fill-rose-600 dark:fill-rose-300' },
  slate: { line: 'stroke-slate-400 dark:stroke-slate-500', fill: 'fill-slate-400/10', dot: 'fill-slate-500' },
}

interface Props {
  /** Chuỗi giá trị theo thời gian, cũ → mới. */
  values: number[]
  width?: number
  height?: number
  tone?: SparkTone
  /** Bắt buộc: mô tả xu hướng bằng lời cho screen reader. */
  ariaLabel: string
  /** Văn bản thay thế khi chưa đủ điểm. */
  emptyText?: string
}

/**
 * Quy đổi giá trị sang toạ độ SVG — re-export từ `geometry.ts`.
 *
 * Phần tính toán nằm ở file `.ts` thuần để `node --test` chạy được trực tiếp;
 * `--experimental-strip-types` không xử lý được JSX.
 */
export { toPoints } from './geometry'

export default function Sparkline({
  values,
  width = 120,
  height = 36,
  tone = 'teal',
  ariaLabel,
  emptyText = 'Chưa đủ dữ liệu',
}: Props) {
  const clean = values.filter((value) => Number.isFinite(value))

  if (clean.length < MIN_POINTS) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500" role="img" aria-label={`${ariaLabel}. ${emptyText}.`}>
        {emptyText}
      </p>
    )
  }

  const padding = 4
  const points = toPoints(clean, width, height, padding)
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`
  const last = points[points.length - 1]
  const theme = TONE[tone]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      {/* Trục nhạt: không có nó thì đường trôi lơ lửng, không đọc được cao thấp. */}
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        className="stroke-slate-200 dark:stroke-slate-700"
        strokeWidth={1}
      />
      <polygon points={area} className={theme.fill} />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={theme.line}
      />
      {/* Điểm cuối: neo mắt vào giá trị hiện tại. */}
      <circle cx={last.x} cy={last.y} r={2.5} className={theme.dot} />
    </svg>
  )
}
