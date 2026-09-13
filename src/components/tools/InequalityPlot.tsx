'use client'

import { useId } from 'react'
import type { Frac } from '@/lib/tools/inequality-region/fraction'
import type { Inequality } from '@/lib/tools/inequality-region/parse'
import type { PlotStage } from '@/lib/tools/inequality-region/steps'
import { holds, type LineStep, type NamedPt, type Pt, type Region } from '@/lib/tools/inequality-region/solve'

/**
 * Hệ trục Oxy vẽ theo QUY ƯỚC SGK:
 *
 *  - Miền nghiệm KHÔNG tô màu. Nửa mặt phẳng KHÔNG là nghiệm bị GẠCH; phần còn
 *    trắng là miền nghiệm. (Chủ dự án nhấn mạnh điểm này: học sinh học rằng
 *    miền nghiệm là vùng không bị gạch — tô màu miền nghiệm là dạy ngược.)
 *  - Bờ của dấu ≤, ≥ vẽ nét liền; bờ của dấu <, > vẽ nét đứt.
 *
 * Mỗi bất phương trình một màu và một HƯỚNG gạch riêng. Cùng hướng thì chỗ hai
 * nửa mặt phẳng chồng nhau thành một mảng sọc dày, không đọc ra được đường nào
 * gạch bỏ phần nào; khác hướng thì chỗ chồng thành ô lưới, vẫn thấy từng lớp.
 *
 * Hai trục cùng một tỉ lệ (khung vuông) để góc và độ dốc đúng như hình vẽ tay.
 * Phần tính toán dùng phân số chính xác; chỉ ở đây mới đổi sang số thực để vẽ.
 */

export const LINE_COLORS = ['#6366f1', '#e11d48', '#d97706', '#059669', '#0284c7', '#9333ea', '#c2410c', '#db2777']
const HATCH_ANGLES = [45, -45, 0, 90, 30, -60, 60, -30]

export interface View {
  xmin: number
  ymin: number
  /** Cạnh khung vuông, tính bằng đơn vị toạ độ. */
  size: number
  step: number
}

interface Props {
  inequalities: Inequality[]
  lines: LineStep[]
  region: Region
  view: View
  stage: PlotStage
  probe?: { pt: Pt; inside: boolean } | null
  highlight?: string[]
  title: string
}

const W = 560
type XY = [number, number]

/** Khung nhìn: gồm gốc O, mọi điểm quan trọng, chừa lề, và vuông. */
export function computeView(points: Pt[]): View {
  const xs = [0, ...points.map((p) => p.x.toNumber())]
  const ys = [0, ...points.map((p) => p.y.toNumber())]
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const span = Math.max(x1 - x0, y1 - y0, 6)
  const pad = Math.max(1.5, span * 0.15)

  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => (span + 2 * pad) / s <= 16) ?? 2000
  // Mép dưới/trái làm tròn XUỐNG theo bước lưới; cạnh khung là bội của bước và
  // đủ phủ cả hai chiều kèm lề. Nhờ vậy vạch lưới trùng số nguyên đẹp.
  const xmin = Math.floor((x0 - pad) / step) * step
  const ymin = Math.floor((y0 - pad) / step) * step
  const need = Math.max(x1 + pad - xmin, y1 + pad - ymin)
  const size = Math.ceil(need / step) * step
  // Căn giữa phần dư theo chiều hẹp hơn để hình không dồn về một góc.
  const slackX = Math.floor((size - (x1 + pad - xmin)) / 2 / step) * step
  const slackY = Math.floor((size - (y1 + pad - ymin)) / 2 / step) * step
  return { xmin: xmin - slackX, ymin: ymin - slackY, size, step }
}

function toScreen(view: View, x: number, y: number): XY {
  return [((x - view.xmin) / view.size) * W, W - ((y - view.ymin) / view.size) * W]
}

/** Cắt đa giác (số thực) bằng nửa mặt phẳng g(x, y) ≤ 0. */
function clipFloat(poly: XY[], g: (p: XY) => number): XY[] {
  const out: XY[] = []
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % poly.length]
    const gp = g(P)
    const gq = g(Q)
    if (gp <= 0) out.push(P)
    if ((gp < 0 && gq > 0) || (gp > 0 && gq < 0)) {
      const t = gp / (gp - gq)
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t])
    }
  }
  return out
}

function viewRect(view: View): XY[] {
  const { xmin, ymin, size } = view
  return [
    [xmin, ymin],
    [xmin + size, ymin],
    [xmin + size, ymin + size],
    [xmin, ymin + size],
  ]
}

/** g ≤ 0 ⇔ điểm thuộc nửa mặt phẳng nghiệm (đóng). `sign = -1` cho phần bù. */
function sideFn(q: Inequality, sign: 1 | -1): (p: XY) => number {
  const a = q.a.toNumber()
  const b = q.b.toNumber()
  const c = q.c.toNumber()
  const dir = q.op === '<' || q.op === '<=' ? 1 : -1
  return ([x, y]) => sign * dir * (a * x + b * y - c)
}

/** Đoạn của đường bờ nằm trong khung. */
function lineSegment(q: Inequality, view: View): [XY, XY] | null {
  const a = q.a.toNumber()
  const b = q.b.toNumber()
  const c = q.c.toNumber()
  const rect = viewRect(view)
  const hits: XY[] = []
  for (let i = 0; i < 4; i++) {
    const P = rect[i]
    const Q = rect[(i + 1) % 4]
    const gp = a * P[0] + b * P[1] - c
    const gq = a * Q[0] + b * Q[1] - c
    if (gp === 0) hits.push(P)
    if ((gp < 0 && gq > 0) || (gp > 0 && gq < 0)) {
      const t = gp / (gp - gq)
      hits.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t])
    }
  }
  if (hits.length < 2) return null
  return [hits[0], hits[hits.length - 1]]
}

function centroid(poly: XY[]): { at: XY; area: number } | null {
  if (poly.length < 3) return null
  let A = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    const f = x0 * y1 - x1 * y0
    A += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(A) < 1e-9) return null
  return { at: [cx / (3 * A), cy / (3 * A)], area: Math.abs(A) / 2 }
}

function points(poly: XY[], view: View): string {
  return poly.map(([x, y]) => toScreen(view, x, y).map((v) => v.toFixed(1)).join(',')).join(' ')
}

function fmt(f: Frac): string {
  return f.toString()
}

export default function InequalityPlot({ inequalities, lines, region, view, stage, probe, highlight = [], title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const rect = viewRect(view)
  const n = inequalities.length

  // Lưới + nhãn trục.
  const ticks: number[] = []
  for (let v = Math.ceil(view.xmin / view.step) * view.step; v <= view.xmin + view.size + 1e-9; v += view.step) ticks.push(v)
  const yticks: number[] = []
  for (let v = Math.ceil(view.ymin / view.step) * view.step; v <= view.ymin + view.size + 1e-9; v += view.step) yticks.push(v)
  const [ox, oy] = toScreen(view, 0, 0)

  const solution = stage.final
    ? inequalities.reduce<XY[]>((poly, q) => clipFloat(poly, sideFn(q, 1)), rect)
    : []
  const label = stage.final ? centroid(solution) : null
  // Nhãn hai dòng rộng ~60px, cao ~36px: chỉ đặt khi phần miền nghiệm TRONG
  // khung đủ chỗ chứa, đo theo pixel chứ không theo tỉ lệ diện tích — miền hẹp
  // mà dài vẫn có diện tích lớn nhưng không nhét chữ vào được.
  const solutionPx = solution.map(([x, y]) => toScreen(view, x, y))
  const spanPx = (k: 0 | 1) =>
    solutionPx.length ? Math.max(...solutionPx.map((p) => p[k])) - Math.min(...solutionPx.map((p) => p[k])) : 0
  const showLabel = label && spanPx(0) >= 70 && spanPx(1) >= 48

  return (
    <svg
      viewBox={`0 0 ${W} ${W}`}
      className="h-auto w-full select-none rounded-xl bg-white dark:bg-slate-900"
      role="img"
      aria-labelledby={`${uid}-title`}
    >
      <title id={`${uid}-title`}>{title}</title>
      <defs>
        {inequalities.map((_, i) => (
          <pattern
            key={i}
            id={`${uid}-h${i}`}
            width="11"
            height="11"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${HATCH_ANGLES[i % HATCH_ANGLES.length]})`}
          >
            <line x1="0" y1="0" x2="0" y2="11" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth="1.6" strokeOpacity="0.75" />
          </pattern>
        ))}
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="fill-slate-500 dark:fill-slate-400" />
        </marker>
      </defs>

      {/* Lưới */}
      <g className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1">
        {ticks.map((v) => {
          const [x] = toScreen(view, v, 0)
          return <line key={`gx${v}`} x1={x} y1={0} x2={x} y2={W} />
        })}
        {yticks.map((v) => {
          const [, y] = toScreen(view, 0, v)
          return <line key={`gy${v}`} x1={0} y1={y} x2={W} y2={y} />
        })}
      </g>

      {/* Nửa mặt phẳng bị gạch bỏ */}
      {inequalities.slice(0, stage.hatched).map((q, i) => {
        const removed = clipFloat(rect, sideFn(q, -1))
        if (removed.length < 3) return null
        return (
          <polygon
            key={`h${i}`}
            className={i === stage.hatched - 1 && stage.focus === i ? 'ir-appear' : undefined}
            points={points(removed, view)}
            fill={`url(#${uid}-h${i})`}
          />
        )
      })}

      {/* Trục */}
      <g className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.5">
        <line x1={0} y1={oy} x2={W - 2} y2={oy} markerEnd={`url(#${uid}-arrow)`} />
        <line x1={ox} y1={W} x2={ox} y2={2} markerEnd={`url(#${uid}-arrow)`} />
      </g>
      <g className="fill-slate-500 dark:fill-slate-400" fontSize="12">
        {ticks.map((v) => {
          if (v === 0) return null
          const [x] = toScreen(view, v, 0)
          if (x < 10 || x > W - 14) return null
          return (
            <text key={`tx${v}`} x={x} y={Math.min(W - 4, oy + 15)} textAnchor="middle">
              {v}
            </text>
          )
        })}
        {yticks.map((v) => {
          if (v === 0) return null
          const [, y] = toScreen(view, 0, v)
          if (y < 14 || y > W - 8) return null
          return (
            <text key={`ty${v}`} x={Math.max(4, ox - 6)} y={y + 4} textAnchor={ox - 6 < 4 ? 'start' : 'end'}>
              {v}
            </text>
          )
        })}
      </g>
      <g className="fill-slate-700 dark:fill-slate-200" fontSize="15" fontStyle="italic" fontFamily="ui-serif, Georgia, serif">
        <text x={W - 14} y={oy - 8} textAnchor="end">x</text>
        <text x={ox + 8} y={16}>y</text>
        <text x={ox - 6} y={oy + 16} textAnchor="end">O</text>
      </g>

      {/* Đường bờ */}
      {inequalities.slice(0, stage.drawn).map((q, i) => {
        const seg = lineSegment(q, view)
        if (!seg) return null
        const [p1, p2] = seg.map(([x, y]) => toScreen(view, x, y))
        const color = LINE_COLORS[i % LINE_COLORS.length]
        const focused = stage.focus === i
        // Nhãn d_i sát MÉP KHUNG phía trên-phải của đường, lệch vuông góc 16px.
        // Đặt giữa đoạn thì hay đè lên nhãn giao điểm với trục, vốn nằm gần O.
        const [from, to] = p1[0] - p1[1] > p2[0] - p2[1] ? [p2, p1] : [p1, p2]
        // Bờ trùng trục (x = 0, y = 0) thì lùi vào trong, khỏi đè chữ "x", "y" ở đầu mũi tên.
        const onAxis = (q.a.isZero() && q.c.isZero()) || (q.b.isZero() && q.c.isZero())
        const t = onAxis ? 0.72 : 0.93
        const lx = from[0] + (to[0] - from[0]) * t
        const ly = from[1] + (to[1] - from[1]) * t
        const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1
        const nx = -(p2[1] - p1[1]) / len
        const ny = (p2[0] - p1[0]) / len
        return (
          <g key={`l${i}`} className={focused && stage.drawn - 1 === i && stage.hatched === i ? 'ir-appear' : undefined}>
            <line
              x1={p1[0]}
              y1={p1[1]}
              x2={p2[0]}
              y2={p2[1]}
              stroke={color}
              strokeWidth={focused ? 3.2 : 2.4}
              strokeDasharray={lines[i].strict ? '10 7' : undefined}
              strokeLinecap="round"
            />
            <text
              x={Math.min(W - 24, Math.max(8, lx + nx * 16))}
              y={Math.min(W - 6, Math.max(16, ly + ny * 16))}
              fill={color}
              fontSize="15"
              fontWeight="600"
              fontStyle="italic"
              fontFamily="ui-serif, Georgia, serif"
            >
              d<tspan fontSize="11" dy="4">{i + 1}</tspan>
            </text>
          </g>
        )
      })}

      {/* Hai điểm dùng để vẽ bờ */}
      {stage.showPoints !== null &&
        lines[stage.showPoints].points.map((p, k) => {
          const [x, y] = toScreen(view, p.x.toNumber(), p.y.toNumber())
          if (x < -1 || x > W + 1 || y < -1 || y > W + 1) return null
          const color = LINE_COLORS[stage.showPoints! % LINE_COLORS.length]
          return (
            <g key={`p${k}`} className="ir-appear">
              <circle cx={x} cy={y} r="5" fill={color} />
              <text x={x + 8} y={y - 8} fontSize="13" className="fill-slate-700 dark:fill-slate-200">
                ({fmt(p.x)}; {fmt(p.y)})
              </text>
            </g>
          )
        })}

      {/* Điểm thử */}
      {stage.showTest !== null &&
        (() => {
          const s = lines[stage.showTest]
          const [x, y] = toScreen(view, s.testPoint.x.toNumber(), s.testPoint.y.toNumber())
          const color = s.testHolds ? '#059669' : '#e11d48'
          const name = s.testIsOrigin ? 'O' : 'M'
          return (
            <g className="ir-appear">
              <circle cx={x} cy={y} r="11" fill="none" stroke={color} strokeWidth="2" />
              <circle cx={x} cy={y} r="4.5" fill={color} />
              <text x={x > W - 170 ? x - 14 : x + 14} y={y + 22} textAnchor={x > W - 170 ? 'end' : 'start'} fontSize="13" fontWeight="600" fill={color}>
                {name}({fmt(s.testPoint.x)}; {fmt(s.testPoint.y)}) {s.testHolds ? '✓ thoả' : '✗ không thoả'}
              </text>
            </g>
          )
        })()}

      {/* Bước cuối: nhãn miền nghiệm và đỉnh */}
      {stage.final && region.status !== 'empty' && showLabel && label && (
        <text
          x={toScreen(view, label.at[0], label.at[1])[0]}
          y={toScreen(view, label.at[0], label.at[1])[1] - 4}
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          strokeWidth="4"
          strokeLinejoin="round"
          paintOrder="stroke"
          className="ir-appear fill-teal-700 stroke-white dark:fill-teal-300 dark:stroke-slate-900"
        >
          <tspan x={toScreen(view, label.at[0], label.at[1])[0]}>Miền</tspan>
          <tspan x={toScreen(view, label.at[0], label.at[1])[0]} dy="16">
            nghiệm
          </tspan>
        </text>
      )}
      {stage.final && region.status === 'empty' && (
        <text x={W / 2} y={W / 2} textAnchor="middle" fontSize="18" fontWeight="700" className="ir-appear fill-rose-600 dark:fill-rose-400">
          Hệ vô nghiệm
        </text>
      )}
      {stage.final &&
        region.vertices.map((v: NamedPt) => {
          const [x, y] = toScreen(view, v.x.toNumber(), v.y.toNumber())
          // Đỉnh nằm trên bờ nét đứt thì KHÔNG thuộc miền nghiệm: vẽ chấm rỗng.
          const inside = inequalities.every((q) => holds(q, v))
          const hot = highlight.includes(v.name)
          return (
            <g key={v.name} className="ir-appear">
              {hot && <circle cx={x} cy={y} r="12" fill="none" stroke="#d97706" strokeWidth="2.5" />}
              <circle
                cx={x}
                cy={y}
                r="5"
                className={inside ? 'fill-slate-800 dark:fill-white' : 'fill-white stroke-slate-800 dark:fill-slate-900 dark:stroke-white'}
                strokeWidth={inside ? 0 : 2}
              />
              <text x={x + 9} y={y - 9} fontSize="14" fontWeight="600" className="fill-slate-800 dark:fill-slate-100">
                {v.name}
              </text>
            </g>
          )
        })}

      {/* Điểm học sinh tự kiểm tra */}
      {probe &&
        (() => {
          const [x, y] = toScreen(view, probe.pt.x.toNumber(), probe.pt.y.toNumber())
          const color = probe.inside ? '#059669' : '#e11d48'
          return (
            <g className="ir-appear">
              <path d={`M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}`} stroke={color} strokeWidth="3" strokeLinecap="round" />
              <text x={x + 10} y={y + 18} fontSize="13" fontWeight="600" fill={color}>
                ({fmt(probe.pt.x)}; {fmt(probe.pt.y)})
              </text>
            </g>
          )
        })()}

      {n === 0 && (
        <text x={W / 2} y={W / 2} textAnchor="middle" fontSize="15" className="fill-slate-400">
          Nhập hệ bất phương trình rồi bấm Vẽ
        </text>
      )}
    </svg>
  )
}
