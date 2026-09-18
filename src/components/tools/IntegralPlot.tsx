'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { IntegralAnalysis } from '@/lib/tools/integral/analyze'
import type { IntStage } from '@/lib/tools/integral/steps'

/**
 * Hình của công cụ tích phân: hai đường, vùng được tô theo dấu, và hình chữ nhật
 * của tổng Riemann.
 *
 * Vùng tô đổi màu theo dấu — xanh khi đường thứ nhất nằm trên, hồng khi nằm dưới
 * — vì đó chính là thứ quyết định phải bỏ dấu trị tuyệt đối thế nào. Khúc nào
 * học sinh chưa trả lời (chế độ Tự làm) thì để trắng: tô sẵn là lộ đáp án.
 *
 * Phần toán đã tính chính xác ở `integrate.ts`; ở đây chỉ đổi sang số thực để vẽ.
 */

interface Props {
  analysis: IntegralAnalysis
  stage: IntStage
  /** Chỉ số các khúc chưa được trả lời — không tô, không ghi giá trị. */
  hiddenPieces: Set<number>
  title: string
}

const W = 560
const H = 400
const SAMPLES = 240

function niceStep(span: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000]) if (span / s <= 9) return s
  return 2000
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100)
    .replace('.', ',')
    .replace('-', '−')
}

export default function IntegralPlot({ analysis: a, stage, hiddenPieces, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // Cùng cách với FunctionPlot: hình 560 đơn vị co vào màn điện thoại thì chữ 13
  // chỉ còn ~7px, nên phóng chữ (không phóng nét) theo bề rộng thật.
  const svgRef = useRef<SVGSVGElement>(null)
  const [k, setK] = useState(1)
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setK(Math.min(1.7, Math.max(1, (W / w) * 0.85)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const lo = a.from.toNumber()
  const hi = a.to.toNumber()
  const padX = Math.max((hi - lo) * 0.25, 0.5)
  const xmin = Math.min(0, lo - padX)
  const xmax = Math.max(0, hi + padX)

  const f = (x: number) => a.f.evalNumber(x)
  const g = (x: number) => (a.g ? a.g.evalNumber(x) : 0)

  const ys: number[] = [0]
  for (let i = 0; i <= SAMPLES; i++) {
    const x = xmin + ((xmax - xmin) * i) / SAMPLES
    ys.push(f(x))
    if (a.g) ys.push(g(x))
  }
  // Riemann: chiều cao hình chữ nhật luôn nằm trong khung, kể cả khi ngoài đoạn
  // lấy tích phân đường cong vọt lên rất cao.
  const spanLo = Math.min(...ys)
  const spanHi = Math.max(...ys)
  const padY = Math.max((spanHi - spanLo) * 0.15, 0.5)
  const ystep = niceStep(spanHi - spanLo + 2 * padY)
  const ymin = Math.floor((spanLo - padY) / ystep) * ystep
  const ymax = Math.ceil((spanHi + padY) / ystep) * ystep
  const xstep = niceStep(xmax - xmin)

  const sx = (x: number) => ((x - xmin) / (xmax - xmin)) * W
  const sy = (y: number) => H - ((y - ymin) / (ymax - ymin)) * H
  const clampY = (y: number) => Math.max(-2 * H, Math.min(3 * H, sy(y)))
  const ox = Math.min(W, Math.max(0, sx(0)))
  const oy = Math.min(H, Math.max(0, sy(0)))

  const curve = (fn: (x: number) => number) => {
    const pts: string[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const x = xmin + ((xmax - xmin) * i) / SAMPLES
      pts.push(`${sx(x).toFixed(1)},${clampY(fn(x)).toFixed(1)}`)
    }
    return `M${pts.join(' L')}`
  }

  const band = (from: number, to: number) => {
    const N = 90
    const top: string[] = []
    const bottom: string[] = []
    for (let i = 0; i <= N; i++) {
      const x = from + ((to - from) * i) / N
      top.push(`${sx(x).toFixed(1)},${clampY(f(x)).toFixed(1)}`)
      bottom.push(`${sx(x).toFixed(1)},${clampY(g(x)).toFixed(1)}`)
    }
    return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`
  }

  const xticks: number[] = []
  for (let t = Math.ceil(xmin / xstep) * xstep; t <= xmax + 1e-9; t += xstep) xticks.push(Math.round(t * 1000) / 1000)

  // Nhãn hai cận nằm ngay dưới trục hoành, cùng chỗ với số trên trục. Cận dạng
  // căn viết dài tới cả chục ký tự ((1 − √5)/2), nên số nào của trục rơi vào bề
  // rộng ấy thì bỏ đi — hai chữ chồng lên nhau còn khó đọc hơn là thiếu một mốc.
  const bounds = [a.from, a.to].map((bound) => {
    const text = bound.toPlain()
    return { x: sx(bound.toNumber()), text, half: (text.length * 7.2 * k) / 2 }
  })
  const clearOfBounds = (tx: number) => bounds.every((b) => Math.abs(tx - b.x) > b.half + 8 * k)
  const yticks: number[] = []
  for (let t = ymin; t <= ymax + 1e-9; t += ystep) yticks.push(Math.round(t * 1000) / 1000)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none rounded-xl bg-white dark:bg-slate-900"
      role="img"
      aria-labelledby={`${uid}-t`}
    >
      <title id={`${uid}-t`}>{title}</title>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="fill-slate-500 dark:fill-slate-400" />
        </marker>
      </defs>

      <g className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1">
        {xticks.map((t) => (
          <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={0} y2={H} />
        ))}
        {yticks.map((t) => (
          <line key={`gy${t}`} x1={0} x2={W} y1={sy(t)} y2={sy(t)} />
        ))}
      </g>

      <g clipPath={`url(#${uid}-clip)`}>
        {/* Vùng lấy tích phân, tô theo dấu từng khúc */}
        {stage.shade &&
          a.pieces.map((p, i) =>
            hiddenPieces.has(i) ? null : (
              <path
                key={`b${i}`}
                d={band(p.from.toNumber(), p.to.toNumber())}
                className={p.sign > 0 ? 'fill-emerald-500/25' : 'fill-rose-500/25'}
              />
            ),
          )}

        {/* Hình chữ nhật Riemann */}
        {stage.rects &&
          a.riemann?.rects.map((rect, i) => {
            const x0 = sx(rect.x0.toNumber())
            const x1 = sx(rect.x1.toNumber())
            const h = rect.height.toNumber()
            // Hình chữ nhật dựng giữa trục hoành và chiều cao f(x*): âm thì nằm dưới trục.
            const top = clampY(Math.max(h, 0))
            const bottom = clampY(Math.min(h, 0))
            return (
              <rect
                key={`r${i}`}
                x={Math.min(x0, x1)}
                y={top}
                width={Math.abs(x1 - x0)}
                height={Math.max(1, bottom - top)}
                className="fill-amber-400/30 stroke-amber-600 dark:stroke-amber-400"
                strokeWidth="1.2"
              />
            )
          })}

        {/* Cận lấy tích phân */}
        {stage.marks &&
          bounds.map((bound, i) => (
            <g key={`bd${i}`}>
              <line
                x1={bound.x}
                x2={bound.x}
                y1={0}
                y2={H}
                className="stroke-slate-400 dark:stroke-slate-500"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
              <text
                x={Math.min(W - bound.half - 2, Math.max(bound.half + 2, bound.x))}
                y={Math.min(H - 6, oy + 16 * k)}
                textAnchor="middle"
                fontSize={13 * k}
                fontWeight="600"
                strokeWidth="4"
                paintOrder="stroke"
                className="fill-slate-700 stroke-white dark:fill-slate-200 dark:stroke-slate-900"
              >
                {bound.text}
              </text>
            </g>
          ))}

        {/* Giao điểm nằm trong đoạn */}
        {stage.marks &&
          a.inside.map((r, i) => {
            const x = sx(r.value.toNumber())
            const y = clampY(f(r.value.toNumber()))
            return <circle key={`i${i}`} cx={x} cy={y} r="5" fill="#9333ea" />
          })}

        <path d={curve(f)} fill="none" strokeWidth="2.8" strokeLinejoin="round" className="stroke-teal-600 dark:stroke-teal-400" />
        {a.g && (
          <path d={curve(g)} fill="none" strokeWidth="2.6" strokeLinejoin="round" className="stroke-violet-600 dark:stroke-violet-400" />
        )}

        {/* Giá trị từng khúc, đặt giữa vùng đã tô */}
        {stage.values &&
          a.pieces.map((p, i) => {
            if (hiddenPieces.has(i)) return null
            const x0 = p.from.toNumber()
            const x1 = p.to.toNumber()
            const mx = (x0 + x1) / 2
            const my = (f(mx) + g(mx)) / 2
            const x = sx(mx)
            const y = clampY(my)
            if (x < 0 || x > W || y < 0 || y > H) return null
            return (
              <text
                key={`v${i}`}
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={14 * k}
                fontWeight="700"
                strokeWidth="4"
                paintOrder="stroke"
                className={`stroke-white dark:stroke-slate-900 ${p.sign > 0 ? 'fill-emerald-800 dark:fill-emerald-300' : 'fill-rose-800 dark:fill-rose-300'}`}
              >
                {p.area.toPlain()}
              </text>
            )
          })}
      </g>

      {/* Trục — kẹp vào khung khi gốc O nằm ngoài */}
      <g className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.5">
        <line x1={0} y1={oy} x2={W - 2} y2={oy} markerEnd={`url(#${uid}-arrow)`} />
        <line x1={ox} y1={H} x2={ox} y2={2} markerEnd={`url(#${uid}-arrow)`} />
      </g>
      <g className="fill-slate-500 dark:fill-slate-400" fontSize={12 * k}>
        {xticks.map((t) => {
          const x = sx(t)
          if (t === 0 || x < 10 || x > W - 16) return null
          if (stage.marks && !clearOfBounds(x)) return null
          return (
            <text key={`tx${t}`} x={x} y={Math.min(H - 4, Math.max(14 * k, oy + 15 * k))} textAnchor="middle">
              {fmt(t)}
            </text>
          )
        })}
        {yticks.map((t) => {
          const y = sy(t)
          if (t === 0 || y < 14 || y > H - 8) return null
          const left = ox - 6 < 18
          return (
            <text key={`ty${t}`} x={left ? ox + 6 : ox - 6} y={y + 4} textAnchor={left ? 'start' : 'end'}>
              {fmt(t)}
            </text>
          )
        })}
      </g>
      <g className="fill-slate-700 dark:fill-slate-200" fontSize={15 * k} fontStyle="italic" fontFamily="ui-serif, Georgia, serif">
        <text x={W - 14} y={oy - 8} textAnchor="end">
          {a.variable}
        </text>
        <text x={ox + 8} y={16}>
          {a.kind === 'motion' ? 'v' : 'y'}
        </text>
      </g>
    </svg>
  )
}
