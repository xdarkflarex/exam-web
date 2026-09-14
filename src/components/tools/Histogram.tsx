'use client'

import { useId } from 'react'
import type { Frac } from '@/lib/tools/fraction'
import type { GroupRow } from '@/lib/tools/statistics/grouped'

/**
 * Biểu đồ tần số của mẫu số liệu ghép nhóm.
 *
 * Trục ngang tỉ lệ THẬT theo đầu mút nhóm (nhóm rộng gấp đôi thì cột rộng gấp
 * đôi) để vạch trung vị/tứ phân vị rơi đúng chỗ nội suy đặt nó — học sinh thấy
 * vì sao Me = 26 nằm một phần năm chiều rộng nhóm [25; 30).
 */

interface Props {
  rows: GroupRow[]
  /** Nhóm tô sáng (vd nhóm chứa trung vị). */
  highlight: number[]
  marker: { label: string; value: Frac } | null
  title: string
}

const W = 440
const H = 270
const PAD = { l: 34, r: 14, t: 28, b: 38 }

function niceStep(max: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]) if (max / s <= 6) return s
  return Math.ceil(max / 6)
}

export default function Histogram({ rows, highlight, marker, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const x0 = rows[0].lo.toNumber()
  const x1 = rows[rows.length - 1].hi.toNumber()
  const maxF = Math.max(1, ...rows.map((r) => r.freq))
  const step = niceStep(maxF)
  const yTop = Math.ceil(maxF / step) * step
  const X = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const Y = (f: number) => H - PAD.b - (f / yTop) * (H - PAD.t - PAD.b)
  const yTicks: number[] = []
  for (let f = 0; f <= yTop; f += step) yTicks.push(f)

  // Nhãn đầu mút dày quá thì chỉ ghi cách một.
  const every = rows.length > 9 ? 2 : 1
  const bounds = [rows[0].lo, ...rows.map((r) => r.hi)]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-labelledby={`${uid}-t`}>
      <title id={`${uid}-t`}>{title}</title>

      <g className="stroke-slate-200 dark:stroke-slate-800">
        {yTicks.map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={Y(f)} y2={Y(f)} />
        ))}
      </g>
      <g className="fill-slate-500 dark:fill-slate-400" fontSize="13">
        {yTicks.map((f) => (
          <text key={f} x={PAD.l - 6} y={Y(f) + 4} textAnchor="end">
            {f}
          </text>
        ))}
      </g>

      {rows.map((r, i) => {
        const hot = highlight.includes(i)
        const left = X(r.lo.toNumber())
        const right = X(r.hi.toNumber())
        return (
          <g key={i}>
            <rect
              x={left + 1}
              y={Y(r.freq)}
              width={Math.max(0, right - left - 2)}
              height={H - PAD.b - Y(r.freq)}
              rx="2"
              className={
                hot
                  ? 'fill-teal-500/80 stroke-teal-700 dark:fill-teal-400/70 dark:stroke-teal-300'
                  : 'fill-slate-300/80 stroke-slate-400 dark:fill-slate-600/70 dark:stroke-slate-500'
              }
              strokeWidth={hot ? 2 : 1}
            />
            {r.freq > 0 && (
              <text
                x={(left + right) / 2}
                y={Y(r.freq) - 6}
                textAnchor="middle"
                fontSize="13"
                fontWeight={hot ? 700 : 500}
                className={hot ? 'fill-teal-800 dark:fill-teal-200' : 'fill-slate-600 dark:fill-slate-300'}
              >
                {r.freq}
              </text>
            )}
          </g>
        )
      })}

      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.5" />
      <g className="fill-slate-600 dark:fill-slate-300" fontSize="13">
        {bounds.map((b, i) =>
          i % every === 0 || i === bounds.length - 1 ? (
            <text key={i} x={X(b.toNumber())} y={H - PAD.b + 16} textAnchor="middle">
              {b.toDecimal(2).text}
            </text>
          ) : null,
        )}
      </g>

      {marker && (
        <g className="ir-appear">
          <line
            x1={X(marker.value.toNumber())}
            x2={X(marker.value.toNumber())}
            y1={PAD.t - 8}
            y2={H - PAD.b}
            stroke="#d97706"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />
          <text
            // Nhãn rộng ~70px: kẹp vào trong khung khi vạch nằm sát mép trái/phải.
            x={Math.min(W - PAD.r - 36, Math.max(PAD.l + 36, X(marker.value.toNumber())))}
            y={PAD.t - 12}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="#b45309"
            strokeWidth="4"
            paintOrder="stroke"
            className="stroke-white dark:stroke-slate-900"
          >
            {marker.label} {marker.value.toDecimal(2).exact ? '=' : '≈'} {marker.value.toDecimal(2).text}
          </text>
        </g>
      )}
    </svg>
  )
}
