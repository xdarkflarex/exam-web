/**
 * Hình học của hệ bất phương trình bậc nhất hai ẩn — logic thuần, không DOM.
 *
 * Làm theo đúng quy trình SGK Toán 10 (Kết nối tri thức, bài "Bất phương trình
 * bậc nhất hai ẩn" và "Hệ bất phương trình bậc nhất hai ẩn"):
 *
 *   Bước 1. Vẽ đường thẳng d: ax + by = c.
 *   Bước 2. Lấy điểm M₀(x₀; y₀) không thuộc d — gốc O nếu c ≠ 0, còn nếu
 *           c = 0 (d đi qua O) thì lấy (1; 0) hoặc (0; 1).
 *   Bước 3. Tính ax₀ + by₀ và so sánh với c.
 *   Bước 4. Kết luận nửa mặt phẳng nào là miền nghiệm; GẠCH BỎ nửa còn lại.
 *   Với hệ: làm lần lượt từng bất phương trình trên cùng một hệ trục; phần
 *   KHÔNG bị gạch là miền nghiệm.
 *
 * Quy ước bờ: dấu ≤, ≥ thì bờ thuộc miền nghiệm (vẽ nét liền); dấu <, > thì bờ
 * không thuộc miền nghiệm (vẽ nét đứt).
 *
 * Mọi toạ độ là phân số chính xác (`Frac`). Miền nghiệm được tính bằng cách cắt
 * một khung vuông rất lớn lần lượt bằng từng nửa mặt phẳng ĐÓNG
 * (Sutherland–Hodgman); đỉnh nằm trên khung nghĩa là miền không bị chặn.
 */

import { Frac } from './fraction.ts'
import { isStrict, type Inequality, type Linear } from './parse.ts'

export interface Pt {
  x: Frac
  y: Frac
}

export interface LineStep {
  /** Hai điểm để vẽ đường thẳng, lấy theo cách học sinh vẫn làm (giao với trục). */
  points: [Pt, Pt]
  testPoint: Pt
  /** true khi điểm thử là gốc toạ độ. */
  testIsOrigin: boolean
  /** a·x₀ + b·y₀ */
  testValue: Frac
  /** Điểm thử có thoả bất phương trình không. */
  testHolds: boolean
  strict: boolean
}

export type RegionStatus = 'empty' | 'degenerate' | 'bounded' | 'unbounded'

export interface NamedPt extends Pt {
  name: string
}

export interface Region {
  status: RegionStatus
  /** Đỉnh HỮU HẠN của bao đóng miền nghiệm, ngược chiều kim đồng hồ. */
  vertices: NamedPt[]
}

// ─── Tiện ích ───────────────────────────────────────────────────────────────

export function evaluate(q: Inequality, p: Pt): Frac {
  return q.a.mul(p.x).add(q.b.mul(p.y))
}

export function holds(q: Inequality, p: Pt): boolean {
  const s = evaluate(q, p).cmp(q.c)
  switch (q.op) {
    case '<':
      return s < 0
    case '<=':
      return s <= 0
    case '>':
      return s > 0
    case '>=':
      return s >= 0
  }
}

/**
 * f(p) ≤ 0 đúng khi p thuộc nửa mặt phẳng ĐÓNG của bất phương trình
 * (bao gồm cả bờ, bất kể dấu chặt hay không).
 */
function closedSide(q: Inequality, p: Pt): Frac {
  const v = evaluate(q, p).sub(q.c)
  return q.op === '<' || q.op === '<=' ? v : v.neg()
}

function samePt(p: Pt, q: Pt): boolean {
  return p.x.eq(q.x) && p.y.eq(q.y)
}

function cross(o: Pt, a: Pt, b: Pt): Frac {
  return a.x.sub(o.x).mul(b.y.sub(o.y)).sub(a.y.sub(o.y).mul(b.x.sub(o.x)))
}

function pt(x: number | Frac, y: number | Frac): Pt {
  return { x: typeof x === 'number' ? Frac.of(x) : x, y: typeof y === 'number' ? Frac.of(y) : y }
}

// ─── Từng bất phương trình ──────────────────────────────────────────────────

/** Hai điểm trên bờ: giao với hai trục nếu được, kiểu bảng giá trị của học sinh. */
function twoPoints(q: Inequality): [Pt, Pt] {
  const { a, b, c } = q
  if (a.isZero()) {
    const y = c.div(b)
    return [pt(0, y), pt(1, y)]
  }
  if (b.isZero()) {
    const x = c.div(a)
    return [pt(x, 0), pt(x, 1)]
  }
  if (!c.isZero()) return [pt(0, c.div(b)), pt(c.div(a), 0)]
  // Qua gốc: (0; 0) và một điểm nguyên (b; −a) — nhân dấu để x dương.
  const flip = b.sign() < 0
  return [pt(0, 0), pt(flip ? b.neg() : b, flip ? a : a.neg())]
}

export function analyzeLine(q: Inequality): LineStep {
  const testIsOrigin = !q.c.isZero()
  const testPoint = testIsOrigin ? pt(0, 0) : q.a.isZero() ? pt(0, 1) : pt(1, 0)
  return {
    points: twoPoints(q),
    testPoint,
    testIsOrigin,
    testValue: evaluate(q, testPoint),
    testHolds: holds(q, testPoint),
    strict: isStrict(q.op),
  }
}

// ─── Cắt đa giác ────────────────────────────────────────────────────────────

type Side = (p: Pt) => Frac

function clip(poly: Pt[], side: Side): Pt[] {
  if (poly.length === 0) return poly
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % poly.length]
    const fP = side(P)
    const fQ = side(Q)
    if (fP.sign() <= 0) out.push(P)
    if (fP.sign() * fQ.sign() < 0) {
      // Giao của PQ với bờ: P + t(Q − P), t = fP / (fP − fQ).
      const t = fP.div(fP.sub(fQ))
      out.push(pt(P.x.add(Q.x.sub(P.x).mul(t)), P.y.add(Q.y.sub(P.y).mul(t))))
    }
  }
  return simplify(out)
}

/** Bỏ điểm trùng liên tiếp và điểm thẳng hàng — chỉ giữ đỉnh thật. */
function simplify(poly: Pt[]): Pt[] {
  let pts = poly.filter((p, i) => !samePt(p, poly[(i + 1) % poly.length]))
  let changed = true
  while (changed && pts.length >= 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const next = pts[(i + 1) % pts.length]
      if (cross(prev, pts[i], next).isZero()) {
        pts = pts.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return pts
}

function area2(poly: Pt[]): Frac {
  let s = Frac.ZERO
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % poly.length]
    s = s.add(P.x.mul(Q.y).sub(Q.x.mul(P.y)))
  }
  return s
}

/** Giao điểm hai bờ, hoặc null nếu song song. */
export function intersect(p: Inequality, q: Inequality): Pt | null {
  const det = p.a.mul(q.b).sub(p.b.mul(q.a))
  if (det.isZero()) return null
  return pt(p.c.mul(q.b).sub(p.b.mul(q.c)).div(det), p.a.mul(q.c).sub(p.c.mul(q.a)).div(det))
}

/** Nửa cạnh khung cắt: lớn hơn hẳn mọi toạ độ hữu hạn có thể xuất hiện. */
function boxHalf(qs: Inequality[]): Frac {
  let max = Frac.ONE
  const consider = (p: Pt) => {
    for (const v of [p.x.abs(), p.y.abs()]) if (v.cmp(max) > 0) max = v
  }
  for (let i = 0; i < qs.length; i++) {
    for (const p of twoPoints(qs[i])) consider(p)
    for (let j = i + 1; j < qs.length; j++) {
      const p = intersect(qs[i], qs[j])
      if (p) consider(p)
    }
  }
  return Frac.of(max.n / max.d + BigInt(1)).mul(Frac.of(8)).add(Frac.of(16))
}

function box(half: Frac): Pt[] {
  const m = half.neg()
  return [pt(m, m), pt(half, m), pt(half, half), pt(m, half)]
}

function onBox(p: Pt, half: Frac): boolean {
  return p.x.abs().eq(half) || p.y.abs().eq(half)
}

/** Bao đóng miền nghiệm đã cắt trong khung — dùng chung cho vẽ và tối ưu. */
export function clippedClosure(qs: Inequality[]): { polygon: Pt[]; half: Frac } {
  const half = boxHalf(qs)
  let poly = box(half)
  for (const q of qs) poly = clip(poly, (p) => closedSide(q, p))
  return { polygon: poly, half }
}

function nameVertices(pts: Pt[]): NamedPt[] {
  if (pts.length === 0) return []
  // Bắt đầu từ đỉnh thấp nhất (rồi trái nhất), giữ chiều ngược kim đồng hồ —
  // khớp cách SGK đặt tên OABC cho ví dụ ở góc phần tư thứ nhất.
  let start = 0
  for (let i = 1; i < pts.length; i++) {
    const c = pts[i].y.cmp(pts[start].y)
    if (c < 0 || (c === 0 && pts[i].x.cmp(pts[start].x) < 0)) start = i
  }
  const ordered = [...pts.slice(start), ...pts.slice(0, start)]
  const letters = 'ABCDEFGHIKLMNPQRSTUV'
  let li = 0
  return ordered.map((p) => {
    if (p.x.isZero() && p.y.isZero()) return { ...p, name: 'O' }
    return { ...p, name: letters[li++] ?? `P${li}` }
  })
}

export function analyzeRegion(qs: Inequality[]): Region {
  if (qs.length === 0) return { status: 'unbounded', vertices: [] }
  const { polygon, half } = clippedClosure(qs)
  if (polygon.length === 0) return { status: 'empty', vertices: [] }

  const finite = polygon.filter((p) => !onBox(p, half))
  if (area2(polygon).isZero()) {
    // Bao đóng chỉ là đoạn/điểm: nó nằm TRÊN bờ, nên có dấu chặt là rỗng.
    const probe = polygon.reduce((acc, p) => pt(acc.x.add(p.x), acc.y.add(p.y)), pt(0, 0))
    const n = Frac.of(polygon.length)
    const mid = pt(probe.x.div(n), probe.y.div(n))
    const ok = qs.every((q) => holds(q, mid))
    return ok ? { status: 'degenerate', vertices: nameVertices(finite) } : { status: 'empty', vertices: [] }
  }

  const unbounded = polygon.some((p) => onBox(p, half))
  return { status: unbounded ? 'unbounded' : 'bounded', vertices: nameVertices(finite) }
}

// ─── Kiểm tra một điểm ──────────────────────────────────────────────────────

export interface PointCheckRow {
  value: Frac
  holds: boolean
}

export function checkPoint(qs: Inequality[], p: Pt): { rows: PointCheckRow[]; inside: boolean } {
  const rows = qs.map((q) => ({ value: evaluate(q, p), holds: holds(q, p) }))
  return { rows, inside: rows.every((r) => r.holds) }
}

// ─── GTLN – GTNN của F = px + qy + r ────────────────────────────────────────

export function evalLinear(f: Linear, p: Pt): Frac {
  return f.a.mul(p.x).add(f.b.mul(p.y)).add(f.k)
}

export interface Extremum {
  /** `null` khi không tồn tại (không bị chặn). */
  value: Frac | null
  /** Đạt được không. `false` khi chỉ tiến tới giá trị đó trên bờ nét đứt. */
  attained: boolean
  /** Tên các đỉnh đạt giá trị (một đỉnh, hoặc hai đỉnh = cả cạnh). */
  at: string[]
}

export interface Optimization {
  table: { vertex: NamedPt; value: Frac }[]
  max: Extremum
  min: Extremum
}

/**
 * Hàm bậc nhất trên miền đa giác đạt GTLN/GTNN tại đỉnh. Miền không bị chặn
 * thì phải xét thêm HƯỚNG VÔ HẠN của miền: nếu có một hướng đi mãi trong miền
 * làm F tăng, F không có GTLN.
 */
export function optimize(qs: Inequality[], region: Region, f: Linear): Optimization | null {
  if (region.status === 'empty') return null
  const table = region.vertices.map((vertex) => ({ vertex, value: evalLinear(f, vertex) }))

  const { polygon } = clippedClosure(qs)
  // Nón lùi xa: các hướng d thoả a·dx + b·dy (dấu) 0 với mọi bất phương trình.
  let cone = box(Frac.ONE)
  for (const q of qs) {
    const h: Inequality = { a: q.a, b: q.b, c: Frac.ZERO, op: q.op }
    cone = clip(cone, (p) => closedSide(h, p))
  }
  const dir = (p: Pt) => f.a.mul(p.x).add(f.b.mul(p.y))

  const extreme = (sign: 1 | -1): Extremum => {
    // F hằng số: mọi điểm của miền đều đạt, khỏi dò mặt.
    if (f.a.isZero() && f.b.isZero()) return { value: f.k, attained: true, at: region.vertices.map((v) => v.name) }
    const growsForever = cone.some((d) => dir(d).sign() * sign > 0)
    if (growsForever) return { value: null, attained: false, at: [] }

    let best: Frac | null = null
    for (const p of polygon) {
      const v = evalLinear(f, p)
      if (best === null || v.cmp(best) * sign > 0) best = v
    }
    if (best === null) return { value: null, attained: false, at: [] }
    const face = polygon.filter((p) => evalLinear(f, p).eq(best!))
    // Mặt đạt cực trị là một đỉnh hoặc một cạnh; thử điểm giữa để biết có
    // thuộc miền nghiệm thật (tính cả dấu chặt) hay chỉ nằm trên bờ nét đứt.
    const probe =
      face.length === 1 ? face[0] : pt(face[0].x.add(face[1].x).div(Frac.of(2)), face[0].y.add(face[1].y).div(Frac.of(2)))
    const at = region.vertices.filter((v) => face.some((p) => samePt(p, v))).map((v) => v.name)
    return { value: best, attained: qs.every((q) => holds(q, probe)), at }
  }

  return { table, max: extreme(1), min: extreme(-1) }
}
