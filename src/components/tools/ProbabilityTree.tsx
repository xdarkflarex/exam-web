'use client'

import { useId } from 'react'
import type { Frac } from '@/lib/tools/fraction'
import type { BayesInput, BayesResult } from '@/lib/tools/probability/bayes'

/**
 * Sơ đồ hình cây hai tầng như SGK Toán 12: tầng 1 tách A / Ā, tầng 2 tách B / B̄.
 * Xác suất trên nhánh là dữ kiện; xác suất ở lá (tích dọc nhánh) là kết quả —
 * chế độ Tự làm giấu phần kết quả cho tới khi học sinh làm xong.
 */

export type TreeFocus = 'none' | 'level1' | 'Bpaths' | 'bayes'

interface Props {
  input: BayesInput
  result: BayesResult
  focus: TreeFocus
  showLeaves: boolean
}

const W = 560
const H = 330
const ROOT: [number, number] = [36, 165]
const L1: [number, number][] = [
  [220, 88],
  [220, 242],
]
const LEAF: [number, number][] = [
  [400, 40],
  [400, 132],
  [400, 198],
  [400, 290],
]

function txt(f: Frac): string {
  const d = f.toDecimal(4)
  return d.exact ? d.text : `≈ ${d.text}`
}

export default function ProbabilityTree({ input, result, focus, showLeaves }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const edges = [
    { from: ROOT, to: L1[0], label: `P(A) = ${txt(input.pA)}`, hot: focus === 'level1' || focus === 'Bpaths' || focus === 'bayes' },
    { from: ROOT, to: L1[1], label: `P(Ā) = ${txt(result.pNotA)}`, hot: focus === 'level1' || focus === 'Bpaths' },
    { from: L1[0], to: LEAF[0], label: `P(B|A) = ${txt(input.pBgivenA)}`, hot: focus === 'Bpaths' || focus === 'bayes' },
    { from: L1[0], to: LEAF[1], label: `P(B̄|A) = ${txt(result.pNotBgivenA)}`, hot: focus === 'level1' },
    { from: L1[1], to: LEAF[2], label: `P(B|Ā) = ${txt(input.pBgivenNotA)}`, hot: focus === 'Bpaths' },
    { from: L1[1], to: LEAF[3], label: `P(B̄|Ā) = ${txt(result.pNotBgivenNotA)}`, hot: focus === 'level1' },
  ]
  const leaves = [
    { name: 'A ∩ B', value: result.pAB, hasB: true, main: true },
    { name: 'A ∩ B̄', value: result.pANotB, hasB: false, main: false },
    { name: 'Ā ∩ B', value: result.pNotAB, hasB: true, main: false },
    { name: 'Ā ∩ B̄', value: result.pNotANotB, hasB: false, main: false },
  ]

  return (
    // Dưới ~460px chữ trên nhánh nhỏ hơn 10px: cho cuộn ngang trong khung thay vì co tiếp.
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[460px] select-none" role="img" aria-labelledby={`${uid}-t`}>
      <title id={`${uid}-t`}>
        Sơ đồ hình cây: P(A) = {txt(input.pA)}, P(B|A) = {txt(input.pBgivenA)}, P(B|Ā) = {txt(input.pBgivenNotA)}
      </title>

      {edges.map((e, i) => {
        const [x1, y1] = e.from
        const [x2, y2] = e.to
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        const above = y2 < y1
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={e.hot ? 3 : 1.6}
              strokeLinecap="round"
              className={e.hot ? 'stroke-teal-600 dark:stroke-teal-400' : 'stroke-slate-400 dark:stroke-slate-500'}
            />
            <text
              x={mx}
              y={my + (above ? -8 : 16)}
              textAnchor="middle"
              fontSize="13"
              fontWeight={e.hot ? 700 : 500}
              strokeWidth="4"
              paintOrder="stroke"
              className={`stroke-white dark:stroke-slate-900 ${e.hot ? 'fill-teal-800 dark:fill-teal-200' : 'fill-slate-600 dark:fill-slate-300'}`}
            >
              {e.label}
            </text>
          </g>
        )
      })}

      <circle cx={ROOT[0]} cy={ROOT[1]} r="6" className="fill-slate-700 dark:fill-slate-200" />
      {(['A', 'Ā'] as const).map((name, i) => (
        <g key={name}>
          <circle cx={L1[i][0]} cy={L1[i][1]} r="16" className="fill-white stroke-slate-500 dark:fill-slate-900 dark:stroke-slate-400" strokeWidth="1.5" />
          <text x={L1[i][0]} y={L1[i][1] + 5} textAnchor="middle" fontSize="15" fontWeight="700" fontStyle="italic" className="fill-slate-800 dark:fill-slate-100">
            {name}
          </text>
        </g>
      ))}

      {leaves.map((leaf, i) => {
        const [x, y] = LEAF[i]
        const emphasis =
          (focus === 'Bpaths' && leaf.hasB) || (focus === 'bayes' && leaf.main) ? 'strong' : focus === 'bayes' && leaf.hasB ? 'soft' : 'none'
        return (
          <g key={leaf.name}>
            <rect
              x={x}
              y={y - 17}
              width="150"
              height="34"
              rx="9"
              strokeWidth={emphasis === 'strong' ? 2.5 : 1.2}
              className={
                emphasis === 'strong'
                  ? 'fill-amber-50 stroke-amber-500 dark:fill-amber-950/40 dark:stroke-amber-400'
                  : emphasis === 'soft'
                    ? 'fill-amber-50/40 stroke-amber-300 dark:fill-amber-950/20 dark:stroke-amber-700'
                    : 'fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600'
              }
            />
            <text x={x + 10} y={y + 5} fontSize="13" fontWeight="600" fontStyle="italic" className="fill-slate-800 dark:fill-slate-100">
              {leaf.name}
            </text>
            <text x={x + 140} y={y + 5} textAnchor="end" fontSize="13" fontWeight="700" className="tabular-nums fill-slate-700 dark:fill-slate-200">
              {showLeaves ? txt(leaf.value) : '?'}
            </text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}
