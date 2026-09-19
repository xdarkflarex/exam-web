/**
 * Hình học toạ độ Oxyz — điểm, vectơ, mặt phẳng, đường thẳng, mặt cầu.
 *
 * MỌI toạ độ là PHÂN SỐ chính xác, mọi độ dài và tỉ số lượng giác là số dạng
 * a + b√r. Lý do: kết quả của chương này gần như luôn có căn — khoảng cách từ
 * điểm tới mặt phẳng là |ax₀ + by₀ + cz₀ + d| / √(a² + b² + c²), SGK viết
 * "d = 2√3/3" chứ không viết "≈ 1,15". Làm tròn thì học sinh không đối chiếu
 * được với bài giải tay, và phép so sánh d với R (mặt cầu cắt hay tiếp xúc mặt
 * phẳng) sẽ sai ở đúng ca tiếp xúc.
 *
 * Mẹo giữ mọi thứ chính xác: số thực chỉ xuất hiện lúc vẽ hình và lúc đổi một
 * góc "không đẹp" ra độ. So sánh d với R thì so **bình phương** — cả hai đều
 * hữu tỉ nên không cần chạm tới căn.
 */

import { Frac } from '../fraction.ts'
import { Surd } from '../surd.ts'

const B1 = BigInt(1)

export class Vec3 {
  readonly x: Frac
  readonly y: Frac
  readonly z: Frac

  constructor(x: Frac, y: Frac, z: Frac) {
    this.x = x
    this.y = y
    this.z = z
  }

  static of(x: number | Frac, y: number | Frac, z: number | Frac): Vec3 {
    const f = (v: number | Frac) => (typeof v === 'number' ? Frac.of(v) : v)
    return new Vec3(f(x), f(y), f(z))
  }

  static readonly ZERO = Vec3.of(0, 0, 0)

  get parts(): readonly [Frac, Frac, Frac] {
    return [this.x, this.y, this.z]
  }

  add(o: Vec3): Vec3 {
    return new Vec3(this.x.add(o.x), this.y.add(o.y), this.z.add(o.z))
  }

  sub(o: Vec3): Vec3 {
    return new Vec3(this.x.sub(o.x), this.y.sub(o.y), this.z.sub(o.z))
  }

  scale(k: Frac): Vec3 {
    return new Vec3(this.x.mul(k), this.y.mul(k), this.z.mul(k))
  }

  neg(): Vec3 {
    return this.scale(Frac.of(-1))
  }

  dot(o: Vec3): Frac {
    return this.x.mul(o.x).add(this.y.mul(o.y)).add(this.z.mul(o.z))
  }

  /** Tích có hướng [u, v] — vuông góc với cả hai. */
  cross(o: Vec3): Vec3 {
    return new Vec3(
      this.y.mul(o.z).sub(this.z.mul(o.y)),
      this.z.mul(o.x).sub(this.x.mul(o.z)),
      this.x.mul(o.y).sub(this.y.mul(o.x)),
    )
  }

  isZero(): boolean {
    return this.x.isZero() && this.y.isZero() && this.z.isZero()
  }

  eq(o: Vec3): boolean {
    return this.x.eq(o.x) && this.y.eq(o.y) && this.z.eq(o.z)
  }

  /** Bình phương độ dài — luôn hữu tỉ, nên dùng nó để so sánh thay cho độ dài. */
  norm2(): Frac {
    return this.dot(this)
  }

  /** Độ dài, chính xác: √(norm2). */
  norm(): Surd {
    return Surd.sqrt(this.norm2())!
  }

  /**
   * Vectơ cùng phương có toạ độ nguyên, nguyên tố cùng nhau, thành phần khác 0
   * đầu tiên mang dấu dương. SGK viết vtpt là (1; −2; 2) chứ không phải
   * (3; −6; 6) hay (−1; 2; −2).
   */
  primitive(): Vec3 {
    if (this.isZero()) return this
    const L = this.parts.reduce((acc, v) => (acc / gcd(acc, v.d)) * v.d, B1)
    const ints = this.parts.map((v) => (v.n * L) / v.d)
    let g = BigInt(0)
    for (const n of ints) g = gcd(g, n < BigInt(0) ? -n : n)
    const lead = ints.find((n) => n !== BigInt(0))!
    const sign = lead < BigInt(0) ? -B1 : B1
    return new Vec3(...(ints.map((n) => Frac.of((n * sign) / g)) as [Frac, Frac, Frac]))
  }

  /** Cùng phương với `o` (một trong hai có thể là vectơ 0). */
  isParallel(o: Vec3): boolean {
    return this.cross(o).isZero()
  }

  /** `(1; -2; 3)` cho LaTeX. */
  toTex(): string {
    return `\\left(${this.x.toTex()}; ${this.y.toTex()}; ${this.z.toTex()}\\right)`
  }

  /** `(1; −2; 3)` cho SVG và ô nhập. */
  toPlain(): string {
    return `(${this.x.toString()}; ${this.y.toString()}; ${this.z.toString()})`
  }

  toInput(): string {
    return `${this.x.toPlain()}; ${this.y.toPlain()}; ${this.z.toPlain()}`
  }

  toNumbers(): [number, number, number] {
    return [this.x.toNumber(), this.y.toNumber(), this.z.toNumber()]
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== BigInt(0)) [a, b] = [b, a % b]
  return a === BigInt(0) ? B1 : a
}

/** Mặt phẳng n·X + d = 0, với n ≠ 0. */
export interface Plane {
  n: Vec3
  d: Frac
}

/** Đường thẳng qua A, vectơ chỉ phương u ≠ 0. */
export interface Line {
  A: Vec3
  u: Vec3
}

/** Mặt cầu tâm I, bán kính bình phương r2 (giữ bình phương để mọi so sánh vẫn hữu tỉ). */
export interface Sphere {
  I: Vec3
  r2: Frac
}

export function plane(n: Vec3, d: Frac): Plane {
  return { n, d }
}

/** Mặt phẳng qua P nhận n làm vectơ pháp tuyến. */
export function planeThroughNormal(P: Vec3, n: Vec3): Plane {
  return { n, d: n.dot(P).neg() }
}

/** Mặt phẳng (ABC); `null` khi ba điểm thẳng hàng. */
export function planeThrough3(A: Vec3, B: Vec3, C: Vec3): Plane | null {
  const n = B.sub(A).cross(C.sub(A))
  if (n.isZero()) return null
  return planeThroughNormal(A, n.primitive())
}

/** Giá trị vế trái ax + by + cz + d tại P — dấu của nó cho biết P ở phía nào. */
export function planeValue(p: Plane, P: Vec3): Frac {
  return p.n.dot(P).add(p.d)
}

export function onPlane(p: Plane, P: Vec3): boolean {
  return planeValue(p, P).isZero()
}

/** d(M, (P)) = |n·M + d| / |n|, chính xác. */
export function distancePointPlane(p: Plane, M: Vec3): Surd {
  return ratioOverSqrt(planeValue(p, M).abs(), p.n.norm2())
}

/** Bình phương khoảng cách — hữu tỉ, dùng để so sánh với R². */
export function distance2PointPlane(p: Plane, M: Vec3): Frac {
  const v = planeValue(p, M)
  return v.mul(v).div(p.n.norm2())
}

/**
 * Tham số t của hình chiếu: H = M + t·n với t = −(n·M + d)/|n|².
 * Hữu tỉ, nên H luôn có toạ độ phân số — không bao giờ phải làm tròn.
 */
export function projectionParam(p: Plane, M: Vec3): Frac {
  return planeValue(p, M).neg().div(p.n.norm2())
}

/** Hình chiếu vuông góc của M lên (P). */
export function projectOntoPlane(p: Plane, M: Vec3): Vec3 {
  return M.add(p.n.scale(projectionParam(p, M)))
}

/** Điểm đối xứng của M qua (P): M′ = 2H − M. */
export function reflectInPlane(p: Plane, M: Vec3): Vec3 {
  return projectOntoPlane(p, M).scale(Frac.of(2)).sub(M)
}

export function lineThrough(A: Vec3, B: Vec3): Line | null {
  const u = B.sub(A)
  return u.isZero() ? null : { A, u: u.primitive() }
}

export type LinePlaneKind = 'cat' | 'songSong' | 'nam'

export interface LinePlanePosition {
  kind: LinePlaneKind
  /** Tham số t và giao điểm — chỉ khi cắt. */
  t?: Frac
  point?: Vec3
  /** Đường thẳng vuông góc với mặt phẳng (u cùng phương n). */
  perpendicular: boolean
}

export function linePlanePosition(l: Line, p: Plane): LinePlanePosition {
  const un = l.u.dot(p.n)
  const perpendicular = l.u.isParallel(p.n)
  if (un.isZero()) {
    return { kind: onPlane(p, l.A) ? 'nam' : 'songSong', perpendicular }
  }
  const t = planeValue(p, l.A).neg().div(un)
  return { kind: 'cat', t, point: l.A.add(l.u.scale(t)), perpendicular }
}

export type SpherePlaneKind = 'cat' | 'tiepXuc' | 'khongCat'

export interface SpherePlanePosition {
  kind: SpherePlaneKind
  /** Khoảng cách từ tâm tới mặt phẳng. */
  d: Surd
  d2: Frac
  /** Tâm đường tròn giao tuyến / tiếp điểm — hình chiếu của I. */
  H: Vec3
  /** Bán kính đường tròn giao tuyến, chỉ khi cắt. */
  r?: Surd
  r2?: Frac
}

export function spherePlanePosition(s: Sphere, p: Plane): SpherePlanePosition {
  const d2 = distance2PointPlane(p, s.I)
  const cmp = d2.cmp(s.r2)
  const base = { d: distancePointPlane(p, s.I), d2, H: projectOntoPlane(p, s.I) }
  if (cmp > 0) return { ...base, kind: 'khongCat' }
  if (cmp === 0) return { ...base, kind: 'tiepXuc' }
  const r2 = s.r2.sub(d2)
  return { ...base, kind: 'cat', r2, r: Surd.sqrt(r2)! }
}

/** num/√rad viết đúng dạng SGK: num·√rad / rad (trục căn thức ở mẫu). */
export function ratioOverSqrt(num: Frac, rad: Frac): Surd {
  if (num.isZero()) return Surd.int(0)
  const root = Surd.sqrt(rad)!
  return root.mul(Surd.frac(num.div(rad)))
}

export type AngleRatio = 'sin' | 'cos'

export interface AngleValue {
  /** Góc giữa đường và mặt tính qua sin; hai mặt hoặc hai đường tính qua cos. */
  ratio: AngleRatio
  /** Tỉ số chính xác, luôn ≥ 0 (mọi công thức của chương đều lấy trị tuyệt đối). */
  value: Surd
  /** Số đo độ khi là góc quen thuộc (0, 30, 45, 60, 90); `null` thì chỉ có xấp xỉ. */
  exactDegrees: number | null
  approxDegrees: number
  /** Tử số |u·v| và hai bình phương độ dài — để lời giải viết được phép thế. */
  numerator: Frac
  norm2A: Frac
  norm2B: Frac
}

function angleFrom(ratio: AngleRatio, a: Vec3, b: Vec3): AngleValue {
  const numerator = a.dot(b).abs()
  const norm2A = a.norm2()
  const norm2B = b.norm2()
  const value = ratioOverSqrt(numerator, norm2A.mul(norm2B))
  const x = Math.min(1, Math.max(0, value.toNumber()))
  const rad = ratio === 'sin' ? Math.asin(x) : Math.acos(x)
  return {
    ratio,
    value,
    exactDegrees: niceDegrees(ratio, value),
    approxDegrees: (rad * 180) / Math.PI,
    numerator,
    norm2A,
    norm2B,
  }
}

/** Góc giữa hai mặt phẳng: cos = |n₁·n₂| / (|n₁|·|n₂|). */
export function anglePlanes(p: Plane, q: Plane): AngleValue {
  return angleFrom('cos', p.n, q.n)
}

/** Góc giữa đường thẳng và mặt phẳng: sin = |u·n| / (|u|·|n|). */
export function angleLinePlane(l: Line, p: Plane): AngleValue {
  return angleFrom('sin', l.u, p.n)
}

/** Góc giữa hai đường thẳng: cos = |u₁·u₂| / (|u₁|·|u₂|). */
export function angleLines(a: Line, b: Line): AngleValue {
  return angleFrom('cos', a.u, b.u)
}

/**
 * Số đo độ khi tỉ số là một trong năm giá trị quen thuộc; ngoài ra trả `null`
 * để lời giải viết "≈ 37°12′" thay vì bịa ra một góc đẹp.
 */
function niceDegrees(ratio: AngleRatio, value: Surd): number | null {
  const table: [Surd, number][] = [
    [Surd.int(0), 0],
    [Surd.frac(Frac.of(1, 2)), 30],
    [Surd.sqrt(Frac.of(1, 2))!, 45],
    [Surd.sqrt(Frac.of(3, 4))!, 60],
    [Surd.int(1), 90],
  ]
  for (const [s, deg] of table) {
    if (s.eq(value)) return ratio === 'sin' ? deg : 90 - deg
  }
  return null
}

/** `12°34′` — cách SGK ghi góc không đẹp. */
export function degreesText(deg: number): string {
  const whole = Math.floor(deg)
  const minutes = Math.round((deg - whole) * 60)
  if (minutes === 0) return `${whole}^\\circ`
  if (minutes === 60) return `${whole + 1}^\\circ`
  return `${whole}^\\circ ${minutes}'`
}
