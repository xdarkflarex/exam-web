'use client'

import { useId } from 'react'
import type { Analysis, Column, Level, Limit } from '@/lib/tools/function-analysis/analyze'
import type { TableLevel } from '@/lib/tools/function-analysis/steps'

/**
 * Bảng biến thiên vẽ như trong SGK: ba dòng x, y′, y; giá trị của y đặt ở mép
 * TRÊN khi là đỉnh (cực đại, +∞) và mép DƯỚI khi là đáy, mũi tên chéo nối nhau;
 * điểm không xác định là hai vạch song song xuyên dòng y′ và y.
 *
 * Bảng lộ dần theo `level` (xem `TableLevel`) để đi cùng lời giải từng bước. Chữ
 * trong SVG là chữ thường (`1 − √2`), không qua MathJax: SVG không chứa được
 * phần tử MathJax dựng ra.
 */

interface Props {
  analysis: Analysis
  level: TableLevel
  /** Khoảng mà chế độ Tự làm chưa cho xem dấu (chỉ số trong `analysis.intervals`). */
  hiddenSigns?: ReadonlySet<number>
}

const LABEL_W = 56
const PAD_L = 42
const GAP = 108
const PAD_R = 40
const ROW = { x: [0, 40], d: [40, 80], y: [80, 204] } as const
const H = 204
const LEVEL_Y: Record<Level, number> = { top: 102, mid: 142, bottom: 184 }
const POLE_TEXT = 7
/** Khoảng từ vạch kép tới đầu mũi tên — chừa chỗ cho chữ ±∞ cạnh vạch. */
const POLE_ARROW = 34

const minus = (s: string) => s.replace(/-/g, '−')

function limitText(l: Limit): string {
  return l.kind === 'inf' ? (l.sign > 0 ? '+∞' : '−∞') : l.value.toString()
}

function xText(c: Column): string {
  if (c.kind === 'minusInf') return '−∞'
  if (c.kind === 'plusInf') return '+∞'
  return c.kind === 'crit' ? c.x.toPlain() : c.x.toString()
}

export default function VariationTable({ analysis, level, hiddenSigns }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const cols = analysis.columns
  const X = (i: number) => LABEL_W + PAD_L + i * GAP
  const W = X(cols.length - 1) + PAD_R

  // Điểm neo mũi tên ở mỗi phía của một cột.
  const anchor = (i: number, side: 'left' | 'right'): [number, number] | null => {
    const c = cols[i]
    if (c.kind === 'pole') {
      return side === 'left' ? [X(i) - POLE_ARROW, LEVEL_Y[c.leftLevel]] : [X(i) + POLE_ARROW, LEVEL_Y[c.rightLevel]]
    }
    return [X(i), LEVEL_Y[c.level]]
  }

  const signs = analysis.intervals.map((iv, k) => {
    const x = (X(iv.from) + X(iv.to)) / 2
    const hidden = hiddenSigns?.has(k)
    return { k, x, text: hidden ? '?' : iv.sign > 0 ? '+' : '−', hidden }
  })

  // Tên trợ năng lộ đúng bằng phần bảng đang hiện — không đọc trước đáp án của chế độ Tự làm.
  const describe =
    level === 0
      ? 'Bảng biến thiên chưa lập.'
      : [
          `Bảng biến thiên, các mốc x: ${cols.map(xText).join(', ')}.`,
          level >= 2 ? `Dấu y′: ${signs.map((s) => (s.hidden ? 'chưa biết' : s.text)).join(', ')}.` : '',
        ].join(' ')

  return (
    // Bảng nhiều cột (trùng phương có 5 mốc) rộng hơn điện thoại: cuộn ngang trong khung, chữ không co quá nhỏ.
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        style={{ minWidth: Math.round(W * 0.78) }}
        role="img"
        aria-labelledby={`${uid}-t`}
      >
        <title id={`${uid}-t`}>{describe}</title>
        <defs>
          <marker id={`${uid}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="fill-slate-700 dark:fill-slate-200" />
          </marker>
        </defs>

        {/* Khung */}
        <g className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1.2" fill="none">
          <rect x="0.6" y="0.6" width={W - 1.2} height={H - 1.2} rx="6" />
          <line x1="0" x2={W} y1={ROW.d[0]} y2={ROW.d[0]} />
          <line x1="0" x2={W} y1={ROW.y[0]} y2={ROW.y[0]} />
          <line x1={LABEL_W} x2={LABEL_W} y1="0" y2={H} />
        </g>
        <g className="fill-slate-800 dark:fill-slate-100" fontSize="16" fontStyle="italic" fontFamily="ui-serif, Georgia, serif" textAnchor="middle">
          <text x={LABEL_W / 2} y={26}>x</text>
          <text x={LABEL_W / 2} y={66}>y′</text>
          <text x={LABEL_W / 2} y={148}>y</text>
        </g>

        {level === 0 && (
          <text x={(LABEL_W + W) / 2} y={148} textAnchor="middle" fontSize="13" className="fill-slate-400 dark:fill-slate-500">
            Bảng được lập dần từ bước 3
          </text>
        )}

        {level >= 1 && (
          <g fontSize="14" textAnchor="middle" className="fill-slate-800 dark:fill-slate-100">
            {cols.map((c, i) => (
              <text key={`x${i}`} x={X(i)} y={26} fontWeight={c.kind === 'crit' || c.kind === 'pole' ? 600 : 400}>
                {xText(c)}
              </text>
            ))}
            {cols.map((c, i) =>
              c.kind === 'crit' ? (
                <text key={`z${i}`} x={X(i)} y={65}>
                  0
                </text>
              ) : null,
            )}
          </g>
        )}

        {/* Vạch kép ở điểm không xác định */}
        {level >= 1 &&
          cols.map((c, i) =>
            c.kind === 'pole' ? (
              <g key={`p${i}`} className="stroke-slate-700 dark:stroke-slate-200" strokeWidth="1.4">
                <line x1={X(i) - 2.5} x2={X(i) - 2.5} y1={ROW.d[0]} y2={H} />
                <line x1={X(i) + 2.5} x2={X(i) + 2.5} y1={ROW.d[0]} y2={H} />
              </g>
            ) : null,
          )}

        {level >= 2 &&
          signs.map((s) => (
            <text
              key={`s${s.k}`}
              x={s.x}
              y={s.hidden ? 66 : 67}
              textAnchor="middle"
              fontSize={s.hidden ? 15 : 20}
              fontWeight="700"
              className={
                s.hidden
                  ? 'fill-amber-600 dark:fill-amber-400'
                  : `ir-appear ${s.text === '+' ? 'fill-teal-700 dark:fill-teal-300' : 'fill-rose-700 dark:fill-rose-300'}`
              }
            >
              {s.text}
            </text>
          ))}

        {/* Giá trị ở dòng y */}
        <g fontSize="14" fontWeight="600" className="fill-slate-800 dark:fill-slate-100">
          {cols.map((c, i) => {
            if (c.kind === 'crit' && level >= 3) {
              return (
                <text key={`v${i}`} x={X(i)} y={LEVEL_Y[c.level] + 5} textAnchor="middle" className="ir-appear">
                  {minus(c.y.toPlain())}
                </text>
              )
            }
            if ((c.kind === 'minusInf' || c.kind === 'plusInf') && level >= 4) {
              return (
                <text key={`v${i}`} x={X(i)} y={LEVEL_Y[c.level] + 5} textAnchor="middle" className="ir-appear">
                  {limitText(c.limit)}
                </text>
              )
            }
            if (c.kind === 'pole' && level >= 4) {
              return (
                <g key={`v${i}`} className="ir-appear">
                  <text x={X(i) - POLE_TEXT} y={LEVEL_Y[c.leftLevel] + 5} textAnchor="end">
                    {limitText(c.left)}
                  </text>
                  <text x={X(i) + POLE_TEXT} y={LEVEL_Y[c.rightLevel] + 5} textAnchor="start">
                    {limitText(c.right)}
                  </text>
                </g>
              )
            }
            return null
          })}
        </g>

        {level >= 5 && (
          <g className="ir-appear stroke-slate-700 dark:stroke-slate-200" strokeWidth="1.6">
            {analysis.intervals.map((iv, k) => {
              const p = anchor(iv.from, 'right')!
              const q = anchor(iv.to, 'left')!
              const dx = q[0] - p[0]
              const dy = q[1] - p[1]
              const len = Math.hypot(dx, dy) || 1
              // Lùi hai đầu để mũi tên không đâm vào chữ.
              const cut = (c: Column) => (c.kind === 'pole' ? 6 : 20)
              const a = cut(cols[iv.from]) / len
              const b = cut(cols[iv.to]) / len
              return (
                <line
                  key={`a${k}`}
                  x1={p[0] + dx * a}
                  y1={p[1] + dy * a}
                  x2={q[0] - dx * b}
                  y2={q[1] - dy * b}
                  markerEnd={`url(#${uid}-a)`}
                />
              )
            })}
          </g>
        )}
      </svg>
    </div>
  )
}
