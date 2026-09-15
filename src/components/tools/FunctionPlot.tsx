'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Analysis, Column } from '@/lib/tools/function-analysis/analyze'
import type { FnStage } from '@/lib/tools/function-analysis/steps'

/**
 * Đồ thị hàm số trên hệ trục Oxy.
 *
 * Hai trục có thể KHÁC tỉ lệ (khác công cụ miền nghiệm): cực trị của hàm bậc ba
 * thường cao gấp nhiều lần khoảng cách giữa hai điểm cực trị, vẽ cùng tỉ lệ thì
 * đồ thị chỉ còn hai vạch dựng đứng. Lưới luôn ghi số để học sinh đọc đúng toạ độ.
 *
 * Phần toán đã tính chính xác ở `analyze.ts`; ở đây chỉ đổi sang số thực để vẽ.
 */

interface Props {
  analysis: Analysis
  stage: FnStage
  showCurve: boolean
  title: string
}

const W = 560
const H = 440

export interface FnView {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  xstep: number
  ystep: number
}

function niceStep(span: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]) if (span / s <= 9) return s
  return 10000
}

function range(values: number[], minSpan: number, padRatio: number): [number, number, number] {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const pad = Math.max(1, (hi - lo) * padRatio)
  lo -= pad
  hi += pad
  const step = niceStep(hi - lo)
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step]
}

export function computeFnView(a: Analysis): FnView {
  const xs = [0]
  const ys = [0]
  for (const c of a.columns) {
    if (c.kind === 'crit') {
      xs.push(c.x.toNumber())
      ys.push(c.y.toNumber())
    } else if (c.kind === 'pole') {
      xs.push(c.x.toNumber())
    }
  }
  if (a.center) {
    xs.push(a.center.x.toNumber())
    ys.push(a.center.y.toNumber())
  }
  if (a.axis) xs.push(a.axis.x.toNumber())
  if (a.yIntercept) ys.push(a.yIntercept.toNumber())
  if (a.horizontal) ys.push(a.horizontal.toNumber())
  for (const r of a.xIntercepts ?? []) xs.push(r.value.toNumber())
  const [xmin, xmax, xstep] = range(xs, 4, 0.3)
  // Phân thức: lấy thêm giá trị ở hai mép khung để thấy nhánh đồ thị tiến sát tiệm cận
  // (đa thức thì không — y ở mép khung của hàm bậc ba lớn tới mức ép dẹt phần giữa).
  if (a.pole) for (const x of [xmin, xmax]) ys.push(a.fn.num.evalNumber(x) / a.fn.den.evalNumber(x))
  const [ymin, ymax, ystep] = range(ys, 4, 0.22)
  return { xmin, xmax, ymin, ymax, xstep, ystep }
}

function fmtTick(v: number): string {
  const r = Math.round(v * 100) / 100
  return String(r).replace('.', ',').replace('-', '−')
}

function fmtNum(v: number): string {
  return fmtTick(v)
}

export default function FunctionPlot({ analysis: a, stage, showCurve, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // Hình 560 đơn vị co vào màn điện thoại ~310px thì chữ 13 còn ~7px. Phóng chữ
  // (không phóng nét) theo bề rộng thật, tối đa 1,7 lần.
  const svgRef = useRef<SVGSVGElement>(null)
  const [k, setK] = useState(1)
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      // Giữ chữ 13 đơn vị hiện ra ≥ 11px: k = (11/13)·(W/w).
      if (w > 0) setK(Math.min(1.7, Math.max(1, (W / w) * 0.85)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const v = computeFnView(a)
  const sx = (x: number) => ((x - v.xmin) / (v.xmax - v.xmin)) * W
  const sy = (y: number) => H - ((y - v.ymin) / (v.ymax - v.ymin)) * H
  const f = (x: number) => a.fn.num.evalNumber(x) / a.fn.den.evalNumber(x)

  const xticks: number[] = []
  for (let t = v.xmin; t <= v.xmax + 1e-9; t += v.xstep) xticks.push(Math.round(t * 1000) / 1000)
  const yticks: number[] = []
  for (let t = v.ymin; t <= v.ymax + 1e-9; t += v.ystep) yticks.push(Math.round(t * 1000) / 1000)
  const ox = sx(0)
  const oy = sy(0)

  // Đường cong: lấy mẫu dày, tách nhánh ở điểm không xác định, kẹp giá trị quá xa
  // để tọa độ SVG luôn hữu hạn (phần ngoài khung bị clipPath cắt).
  const pole = a.pole?.toNumber()
  const segments: [number, number][] = pole === undefined ? [[v.xmin, v.xmax]] : [[v.xmin, pole], [pole, v.xmax]]
  const eps = (v.xmax - v.xmin) / 4000
  const paths = segments
    .filter(([lo, hi]) => hi > lo)
    .map(([lo, hi]) => {
      const from = pole !== undefined && lo === pole ? lo + eps : lo
      const to = pole !== undefined && hi === pole ? hi - eps : hi
      const N = 360
      const pts: string[] = []
      for (let i = 0; i <= N; i++) {
        // Dồn mẫu về phía điểm cực (t³) — gần tiệm cận đứng đồ thị dốc nhất.
        const t = i / N
        const u = pole === undefined ? t : lo === pole ? t ** 3 : 1 - (1 - t) ** 3
        const x = from + (to - from) * u
        const y = Math.max(-3 * H, Math.min(4 * H, sy(f(x))))
        pts.push(`${sx(x).toFixed(1)},${y.toFixed(1)}`)
      }
      return `M${pts.join(' L')}`
    })

  const crits = a.columns.filter((c): c is Extract<Column, { kind: 'crit' }> => c.kind === 'crit')
  const inView = (x: number, y: number) => x >= 0 && x <= W && y >= 0 && y <= H

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none rounded-xl bg-white dark:bg-slate-900" role="img" aria-labelledby={`${uid}-t`}>
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

      {/* Trục — kẹp vào khung khi gốc O nằm ngoài */}
      <g className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.5">
        <line x1={0} y1={Math.min(H, Math.max(0, oy))} x2={W - 2} y2={Math.min(H, Math.max(0, oy))} markerEnd={`url(#${uid}-arrow)`} />
        <line x1={Math.min(W, Math.max(0, ox))} y1={H} x2={Math.min(W, Math.max(0, ox))} y2={2} markerEnd={`url(#${uid}-arrow)`} />
      </g>
      <g className="fill-slate-500 dark:fill-slate-400" fontSize={12 * k}>
        {xticks.map((t) => {
          const x = sx(t)
          if (t === 0 || x < 10 || x > W - 16) return null
          return (
            <text key={`tx${t}`} x={x} y={Math.min(H - 4, Math.max(14 * k, oy + 15 * k))} textAnchor="middle">
              {fmtTick(t)}
            </text>
          )
        })}
        {yticks.map((t) => {
          const y = sy(t)
          if (t === 0 || y < 14 || y > H - 8) return null
          const left = Math.max(0, ox) - 6 < 18
          return (
            <text key={`ty${t}`} x={left ? Math.max(0, ox) + 6 : ox - 6} y={y + 4} textAnchor={left ? 'start' : 'end'}>
              {fmtTick(t)}
            </text>
          )
        })}
      </g>
      <g className="fill-slate-700 dark:fill-slate-200" fontSize={15 * k} fontStyle="italic" fontFamily="ui-serif, Georgia, serif">
        <text x={W - 14} y={Math.min(H, Math.max(0, oy)) - 8} textAnchor="end">
          x
        </text>
        <text x={Math.min(W, Math.max(0, ox)) + 8} y={16}>
          y
        </text>
        {inView(ox, oy) && (
          <text x={ox - 6} y={oy + 16} textAnchor="end">
            O
          </text>
        )}
      </g>

      <g clipPath={`url(#${uid}-clip)`}>
        {/* Tiệm cận */}
        {stage.asymptotes && a.pole && (() => {
          // Nhãn đặt ở mép trên, phía mà nhánh đồ thị đi XUỐNG — phía kia nhánh vọt lên đè chữ.
          const pole = a.columns.find((c) => c.kind === 'pole')
          const rightUp = pole?.kind === 'pole' && pole.right.kind === 'inf' && pole.right.sign > 0
          const px = sx(a.pole.toNumber())
          return (
            <g className="ir-appear">
              <line x1={px} x2={px} y1={0} y2={H} stroke="#d97706" strokeWidth="2" strokeDasharray="8 6" />
              {/* Hạ xuống dưới chữ "y" của trục tung, phòng khi tiệm cận đứng nằm sát trục. */}
              <text x={rightUp ? px - 6 : px + 6} y={40 * k} textAnchor={rightUp ? 'end' : 'start'} fontSize={13 * k} fontWeight="600" fill="#b45309">
                x = {a.pole.toString()}
              </text>
            </g>
          )
        })()}
        {stage.asymptotes && (a.horizontal || a.oblique) && (() => {
          const line = (x: number) => (a.horizontal ? a.horizontal.toNumber() : a.oblique!.evalNumber(x))
          const label = a.horizontal ? `y = ${a.horizontal.toString()}` : `y = ${a.oblique!.toTex().replace(/-/g, '−')}`
          const lx = W - 12
          const ly = Math.min(H - 8, Math.max(16, sy(line(v.xmax)) - 8))
          return (
            <g className="ir-appear">
              <line x1={0} y1={sy(line(v.xmin))} x2={W} y2={sy(line(v.xmax))} stroke="#d97706" strokeWidth="2" strokeDasharray="8 6" />
              <text x={lx} y={ly} textAnchor="end" fontSize={13 * k} fontWeight="600" fill="#b45309" strokeWidth="4" paintOrder="stroke" className="stroke-white dark:stroke-slate-900">
                {label}
              </text>
            </g>
          )
        })()}

        {showCurve &&
          paths.map((d, i) => (
            <path key={`c${i}`} d={d} fill="none" strokeWidth="2.8" strokeLinejoin="round" className="ir-appear stroke-teal-600 dark:stroke-teal-400" />
          ))}

        {/* Điểm cực trị, có đường gióng xuống hai trục */}
        {stage.extrema &&
          crits.map((c, i) => {
            const x = sx(c.x.toNumber())
            const y = sy(c.y.toNumber())
            if (!inView(x, y)) return null
            const exact = c.x.isRational() && c.y.isRational()
            const label = exact ? `(${c.x.toPlain()}; ${c.y.toPlain()})` : `≈ (${fmtNum(c.x.toNumber())}; ${fmtNum(c.y.toNumber())})`
            const name = c.extremum === 'max' ? 'CĐ' : c.extremum === 'min' ? 'CT' : ''
            const above = c.extremum !== 'min'
            const anchor = x > W - 70 * k ? 'end' : x < 70 * k ? 'start' : 'middle'
            return (
              <g key={`e${i}`} className="ir-appear">
                <g className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" strokeDasharray="3 4">
                  <line x1={x} x2={x} y1={y} y2={Math.min(H, Math.max(0, oy))} />
                  <line x1={x} x2={Math.min(W, Math.max(0, ox))} y1={y} y2={y} />
                </g>
                <circle cx={x} cy={y} r="5" className={c.extremum ? 'fill-slate-800 dark:fill-white' : 'fill-white stroke-slate-800 dark:fill-slate-900 dark:stroke-white'} strokeWidth={c.extremum ? 0 : 2} />
                <text
                  x={x}
                  y={above ? y - 12 * k : y + 22 * k}
                  textAnchor={anchor}
                  fontSize={13 * k}
                  fontWeight="600"
                  strokeWidth="4"
                  paintOrder="stroke"
                  className="fill-slate-800 stroke-white dark:fill-slate-100 dark:stroke-slate-900"
                >
                  {name ? `${name} ` : ''}
                  {label.replace(/-/g, '−')}
                </text>
              </g>
            )
          })}

        {/* Giao với trục, tâm đối xứng */}
        {stage.special && (
          <g className="ir-appear">
            {a.yIntercept && inView(ox, sy(a.yIntercept.toNumber())) && (
              <circle cx={ox} cy={sy(a.yIntercept.toNumber())} r="4.5" fill="#0284c7" />
            )}
            {(a.xIntercepts ?? []).map((r, i) =>
              inView(sx(r.value.toNumber()), oy) ? <circle key={`xi${i}`} cx={sx(r.value.toNumber())} cy={oy} r="4.5" fill="#0284c7" /> : null,
            )}
            {a.center && inView(sx(a.center.x.toNumber()), sy(a.center.y.toNumber())) && (
              <g>
                <circle cx={sx(a.center.x.toNumber())} cy={sy(a.center.y.toNumber())} r="5" fill="none" stroke="#9333ea" strokeWidth="2.2" />
                <text
                  x={sx(a.center.x.toNumber()) + 9}
                  y={sy(a.center.y.toNumber()) + 18 * k}
                  fontSize={14 * k}
                  fontWeight="700"
                  fontStyle="italic"
                  fill="#9333ea"
                  strokeWidth="4"
                  paintOrder="stroke"
                  className="stroke-white dark:stroke-slate-900"
                >
                  I
                </text>
              </g>
            )}
          </g>
        )}
      </g>

      {!showCurve && (
        <text x={W / 2} y={H - 14} textAnchor="middle" fontSize={13 * k} className="fill-slate-400 dark:fill-slate-500">
          Tự làm: đường cong hiện ở bước vẽ đồ thị
        </text>
      )}
    </svg>
  )
}
