'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Scene } from '@/lib/tools/space/analyze'
import type { Plane, Vec3 } from '@/lib/tools/space/geometry'

/**
 * Hệ trục Oxyz **kéo để xoay**, vẽ bằng SVG và một phép chiếu song song tự viết.
 *
 * VÌ SAO KHÔNG three.js: ~600KB cho vài cái điểm và một mảnh mặt phẳng, trong
 * khi phép chiếu song song chỉ là hai tích vô hướng (roadmap mục 5). Nét vẽ SVG
 * cũng ăn theo được màu của giao diện tối và phóng to không vỡ.
 *
 * Xoay được là phần quan trọng nhất của công cụ: hình tĩnh trong SGK hay làm
 * học sinh đọc sai vị trí tương đối — điểm nằm trước hay sau mặt phẳng, đường
 * thẳng cắt hay chỉ "trông như cắt". Xoay nửa vòng là thấy ngay.
 *
 * Phần toán đã tính chính xác ở `geometry.ts`; ở đây chỉ đổi sang số thực để vẽ.
 */

interface Props {
  scene: Scene
  /** Chỉ vẽ phần tử có `reveal` ≤ số này. */
  reveal: number
  title: string
}

const W = 520
const H = 440
const DEG = Math.PI / 180

type P3 = [number, number, number]

const v3 = (v: Vec3): P3 => v.toNumbers()
const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: P3) => Math.sqrt(dot(a, a))
const unit = (a: P3): P3 => {
  const l = len(a)
  return l < 1e-12 ? [0, 0, 0] : mul(a, 1 / l)
}

/**
 * Hai vectơ đơn vị vuông góc nhau, cùng nằm trong mặt phẳng có pháp tuyến n.
 * Lấy `e1 = n × Oz` để một cạnh của mảnh mặt phẳng **nằm ngang** — đúng kiểu
 * hình trong sách vẽ mặt phẳng như một bức tường đứng trên nền; mặt phẳng nằm
 * ngang thì mới đổi sang trục Ox.
 */
function basisOf(n: P3): [P3, P3] {
  const vertical = Math.abs(unit(n)[2]) > 0.98
  const e1 = unit(cross(n, vertical ? [1, 0, 0] : [0, 0, 1]))
  return [e1, unit(cross(n, e1))]
}

export default function SpacePlot({ scene, reveal, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  // Góc nhìn mặc định giống hình trong SGK: Ox chếch xuống trái, Oy sang phải, Oz thẳng đứng.
  const [yaw, setYaw] = useState(62 * DEG)
  const [pitch, setPitch] = useState(22 * DEG)
  const drag = useRef<{ x: number; y: number } | null>(null)

  // Hình 520 đơn vị co vào màn điện thoại thì chữ 13 còn ~7px: phóng chữ, giữ nét.
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

  const visible = <T extends { reveal: number }>(items: T[]) => items.filter((i) => i.reveal <= reveal)

  const points = visible(scene.points)
  const vectors = visible(scene.vectors)
  const segments = visible(scene.segments)
  const planes = visible(scene.planes)
  const lines = visible(scene.lines)
  const spheres = visible(scene.spheres)
  const circles = visible(scene.circles)

  // ── Khung hình: gom mọi thứ đang hiện rồi co cho vừa ──────────────────────
  const marks: P3[] = [[0, 0, 0]]
  for (const p of points) marks.push(v3(p.v))
  for (const v of vectors) marks.push(v3(v.from), v3(v.to))
  for (const s of segments) marks.push(v3(s.from), v3(s.to))
  for (const l of lines) {
    const A = v3(l.line.A)
    const u = unit(v3(l.line.u))
    marks.push(add(A, mul(u, 2)), sub(A, mul(u, 2)))
  }
  for (const s of spheres) {
    const I = v3(s.sphere.I)
    const R = Math.sqrt(s.sphere.r2.toNumber())
    marks.push(add(I, [R, R, R]), sub(I, [R, R, R]))
  }
  for (const c of circles) marks.push(v3(c.center))
  for (const p of planes) marks.push(v3(p.anchor))

  const reach = Math.max(1.5, ...marks.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))))
  const axis = Math.ceil(reach) + 1
  const scale = Math.min(W, H) / (2.6 * axis)

  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  const right: P3 = [-sinY, cosY, 0]
  const up: P3 = [-sinP * cosY, -sinP * sinY, cosP]

  const project = (p: P3): [number, number] => [W / 2 + dot(p, right) * scale, H / 2 - dot(p, up) * scale]
  const xy = (v: Vec3) => project(v3(v))
  const str = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    setYaw((y) => y + (e.clientX - d.x) * 0.01)
    // Chặn ở ±80°: nhìn đúng từ trên đỉnh thì trục Oz thành một điểm, hình vô nghĩa.
    setPitch((p) => Math.max(-80 * DEG, Math.min(80 * DEG, p - (e.clientY - d.y) * 0.01)))
    drag.current = { x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const step = 6 * DEG
    if (e.key === 'ArrowLeft') setYaw((y) => y - step)
    else if (e.key === 'ArrowRight') setYaw((y) => y + step)
    else if (e.key === 'ArrowUp') setPitch((p) => Math.min(80 * DEG, p + step))
    else if (e.key === 'ArrowDown') setPitch((p) => Math.max(-80 * DEG, p - step))
    else if (e.key.toLowerCase() === 'r') {
      setYaw(62 * DEG)
      setPitch(22 * DEG)
    } else return
    e.preventDefault()
  }

  // ── Các mảnh hình ─────────────────────────────────────────────────────────

  const axisEnds: { label: string; p: P3 }[] = [
    { label: 'x', p: [axis, 0, 0] },
    { label: 'y', p: [0, axis, 0] },
    { label: 'z', p: [0, 0, axis] },
  ]

  /** Lưới trên mặt phẳng Oxy — chỗ dựa để mắt đọc được độ sâu. */
  const grid: string[] = []
  for (let i = -axis; i <= axis; i++) {
    grid.push(`M${str(project([i, -axis, 0]))} L${str(project([i, axis, 0]))}`)
    grid.push(`M${str(project([-axis, i, 0]))} L${str(project([axis, i, 0]))}`)
  }

  function planePatch(p: Plane, anchor: Vec3): string {
    const n = unit(v3(p.n))
    const [e1, e2] = basisOf(n)
    const s = axis * 0.78
    const A = v3(anchor)
    const corners = [
      add(add(A, mul(e1, s)), mul(e2, s)),
      add(add(A, mul(e1, -s)), mul(e2, s)),
      add(add(A, mul(e1, -s)), mul(e2, -s)),
      add(add(A, mul(e1, s)), mul(e2, -s)),
    ]
    return `M${corners.map((c) => str(project(c))).join(' L')} Z`
  }

  function circlePath(center: P3, normal: P3, r: number): string {
    const [e1, e2] = basisOf(unit(normal))
    const pts: string[] = []
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * 2 * Math.PI
      pts.push(str(project(add(center, add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t)))))))
    }
    return `M${pts.join(' L')} Z`
  }

  /** Mũi tên hai nét chữ V ở đầu đoạn thẳng đã chiếu. */
  function arrowHead(from: [number, number], to: [number, number], size = 9): string {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const l = Math.hypot(dx, dy) || 1
    const ux = dx / l
    const uy = dy / l
    const bx = to[0] - ux * size
    const by = to[1] - uy * size
    const h = size * 0.45
    return `M${(bx - uy * h).toFixed(1)},${(by + ux * h).toFixed(1)} L${str(to)} L${(bx + uy * h).toFixed(1)},${(by - ux * h).toFixed(1)}`
  }

  /** `\\vec{n}` → `n`, `\\overrightarrow{AB}` → `AB`: SVG không dựng được LaTeX. */
  const plainLabel = (tex: string) => tex.replace(/\\(vec|overrightarrow)\{([^}]*)\}/g, '$2')

  const toneClass: Record<string, string> = {
    given: 'fill-teal-600 dark:fill-teal-400',
    result: 'fill-violet-600 dark:fill-violet-400',
    aux: 'fill-amber-600 dark:fill-amber-400',
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full cursor-grab touch-none select-none rounded-xl bg-white active:cursor-grabbing dark:bg-slate-900"
      role="img"
      tabIndex={0}
      aria-label={`${title}. Kéo hoặc dùng phím mũi tên để xoay hình, phím R để về góc nhìn ban đầu.`}
      aria-labelledby={`${uid}-t`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <title id={`${uid}-t`}>{title}</title>

      {/* Lưới mặt phẳng Oxy */}
      <g className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" fill="none">
        {grid.map((d, i) => (
          <path key={`g${i}`} d={d} />
        ))}
      </g>

      {/* Mặt phẳng của bài toán */}
      {planes.map((p, i) => (
        <path
          key={`pl${i}`}
          d={planePatch(p.plane, p.anchor)}
          className="fill-sky-500/20 stroke-sky-600 dark:fill-sky-400/15 dark:stroke-sky-400"
          strokeWidth="1.5"
        />
      ))}

      {/* Mặt cầu: đường bao tròn + một vĩ tuyến cho cảm giác khối */}
      {spheres.map((s, i) => {
        const I = v3(s.sphere.I)
        const R = Math.sqrt(s.sphere.r2.toNumber())
        const c = project(I)
        return (
          <g key={`sp${i}`}>
            <circle
              cx={c[0]}
              cy={c[1]}
              r={R * scale}
              className="fill-rose-500/10 stroke-rose-500/70 dark:fill-rose-400/10 dark:stroke-rose-400/70"
              strokeWidth="1.5"
            />
            <path d={circlePath(I, [0, 0, 1], R)} fill="none" className="stroke-rose-500/40 dark:stroke-rose-400/40" strokeWidth="1" />
          </g>
        )
      })}

      {/* Trục toạ độ */}
      <g className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.6" fill="none">
        {axisEnds.map(({ label, p }) => {
          const o = project([0, 0, 0])
          const e = project(p)
          const back = project(mul(p, -1))
          return (
            <g key={label}>
              <path d={`M${str(back)} L${str(o)}`} strokeDasharray="4 5" className="opacity-50" />
              <path d={`M${str(o)} L${str(e)}`} />
              <path d={arrowHead(o, e)} />
            </g>
          )
        })}
      </g>
      <g className="fill-slate-600 dark:fill-slate-300" fontSize={15 * k} fontStyle="italic" fontFamily="ui-serif, Georgia, serif">
        {axisEnds.map(({ label, p }) => {
          const e = project(mul(p, 1.09))
          return (
            <text key={label} x={e[0]} y={e[1]} textAnchor="middle" dominantBaseline="middle">
              {label}
            </text>
          )
        })}
        <text x={project([0, 0, 0])[0] - 9 * k} y={project([0, 0, 0])[1] + 14 * k} textAnchor="middle">
          O
        </text>
      </g>

      {/* Đường thẳng của bài toán */}
      {lines.map((l, i) => {
        const A = v3(l.line.A)
        const u = unit(v3(l.line.u))
        const T = axis * 2.2
        return (
          <path
            key={`ln${i}`}
            d={`M${str(project(sub(A, mul(u, T))))} L${str(project(add(A, mul(u, T))))}`}
            className="stroke-teal-600 dark:stroke-teal-400"
            strokeWidth="2.4"
            fill="none"
          />
        )
      })}

      {/* Đường tròn giao tuyến */}
      {circles.map((c, i) => (
        <path
          key={`ci${i}`}
          d={circlePath(v3(c.center), v3(c.normal), Math.sqrt(c.r2.toNumber()))}
          className="fill-violet-500/20 stroke-violet-600 dark:stroke-violet-400"
          strokeWidth="2"
        />
      ))}

      {/* Đoạn thẳng phụ (đường vuông góc, nét đứt) */}
      {segments.map((s, i) => (
        <path
          key={`sg${i}`}
          d={`M${str(xy(s.from))} L${str(xy(s.to))}`}
          className="stroke-slate-500 dark:stroke-slate-300"
          strokeWidth="1.8"
          strokeDasharray={s.dashed ? '6 5' : undefined}
          fill="none"
        />
      ))}

      {/* Vectơ, kèm tên viết ở gần đầu mũi tên */}
      {vectors.map((v, i) => {
        const a = xy(v.from)
        const b = xy(v.to)
        return (
          <g key={`vc${i}`}>
            <g className="stroke-violet-600 dark:stroke-violet-400" strokeWidth="2.2" fill="none">
              <path d={`M${str(a)} L${str(b)}`} />
              <path d={arrowHead(a, b)} />
            </g>
            <text
              x={a[0] + (b[0] - a[0]) * 0.55 + 7 * k}
              y={a[1] + (b[1] - a[1]) * 0.55 - 7 * k}
              textAnchor="start"
              fontSize={13 * k}
              fontWeight="600"
              fontStyle="italic"
              strokeWidth="4"
              paintOrder="stroke"
              className="fill-violet-700 stroke-white dark:fill-violet-300 dark:stroke-slate-900"
            >
              {plainLabel(v.label)}
            </text>
          </g>
        )
      })}

      {/* Điểm: đường gióng xuống mặt Oxy rồi tới chấm và nhãn */}
      {points.map((p, i) => {
        const [x, y, z] = v3(p.v)
        const c = project([x, y, z])
        const foot = project([x, y, 0])
        return (
          <g key={`pt${i}`}>
            {Math.abs(z) > 1e-9 && (
              <path
                d={`M${str(c)} L${str(foot)}`}
                className="stroke-slate-400 dark:stroke-slate-500"
                strokeWidth="1"
                strokeDasharray="3 4"
                fill="none"
              />
            )}
            <circle cx={c[0]} cy={c[1]} r="4.5" className={toneClass[p.tone]} />
            <text
              x={c[0] + 9 * k}
              y={c[1] - 8 * k}
              fontSize={14 * k}
              fontWeight="700"
              strokeWidth="4"
              paintOrder="stroke"
              className={`${toneClass[p.tone]} stroke-white dark:stroke-slate-900`}
            >
              {p.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
