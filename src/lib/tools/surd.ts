/**
 * Số dạng a + b√r CHÍNH XÁC (a, b phân số, r nguyên dương không chính phương).
 *
 * VÌ SAO CẦN: nghiệm của y′ = 0 với hàm bậc ba thường là căn — y = x³ − 3x² − 3x + 1
 * có y′ = 0 tại x = 1 ± √2. SGK viết "x = 1 − √2", không viết "x ≈ −0,41". Làm
 * tròn thì bảng biến thiên không đối chiếu được với bài giải tay, và giá trị cực
 * trị y(1 ± √2) = −4 ∓ 4√2 chỉ ra đúng dạng nếu tính trong tập số này.
 *
 * Tập {a + b√r} với r cố định đóng với cộng, trừ, nhân, chia — đủ để thế nghiệm
 * của một phương trình bậc hai vào đa thức hoặc phân thức. Hai số khác r chỉ
 * được so sánh gần đúng (không xảy ra với các dạng hàm công cụ nhận).
 */

import { Frac } from './fraction.ts'

const B1 = BigInt(1)
const B2 = BigInt(2)

export class Surd {
  readonly a: Frac
  readonly b: Frac
  /** 1 khi số là hữu tỉ (lúc đó b = 0). */
  readonly r: bigint

  private constructor(a: Frac, b: Frac, r: bigint) {
    this.a = a
    this.b = b
    this.r = r
  }

  static of(a: Frac, b: Frac = Frac.ZERO, r: bigint = B1): Surd {
    if (b.isZero() || r === B1) return new Surd(r === B1 ? a.add(b) : a, Frac.ZERO, B1)
    const { outside, inside } = squareFree(r)
    if (inside === B1) return new Surd(a.add(b.mul(Frac.of(outside))), Frac.ZERO, B1)
    return new Surd(a, b.mul(Frac.of(outside)), inside)
  }

  static frac(f: Frac): Surd {
    return new Surd(f, Frac.ZERO, B1)
  }

  static int(n: number): Surd {
    return Surd.frac(Frac.of(n))
  }

  /** √f, hoặc `null` khi f < 0. √(p/q) = √(pq)/q. */
  static sqrt(f: Frac): Surd | null {
    if (f.sign() < 0) return null
    if (f.isZero()) return Surd.int(0)
    return Surd.of(Frac.ZERO, Frac.of(B1, f.d), f.n * f.d)
  }

  isRational(): boolean {
    return this.b.isZero()
  }

  private radical(o: Surd): bigint {
    if (this.isRational()) return o.r
    if (o.isRational() || o.r === this.r) return this.r
    throw new RangeError('Hai căn khác nhau không gộp được')
  }

  add(o: Surd): Surd {
    return Surd.of(this.a.add(o.a), this.b.add(o.b), this.radical(o))
  }

  sub(o: Surd): Surd {
    return this.add(o.neg())
  }

  neg(): Surd {
    return new Surd(this.a.neg(), this.b.neg(), this.r)
  }

  mul(o: Surd): Surd {
    const r = this.radical(o)
    const rr = Frac.of(r)
    return Surd.of(this.a.mul(o.a).add(this.b.mul(o.b).mul(rr)), this.a.mul(o.b).add(this.b.mul(o.a)), r)
  }

  /** Nhân liên hợp: 1/(a + b√r) = (a − b√r)/(a² − b²r). */
  inv(): Surd {
    const norm = this.a.mul(this.a).sub(this.b.mul(this.b).mul(Frac.of(this.r)))
    if (norm.isZero()) throw new RangeError('Chia cho 0')
    return Surd.of(this.a.div(norm), this.b.neg().div(norm), this.r)
  }

  div(o: Surd): Surd {
    return this.mul(o.inv())
  }

  /** Dấu chính xác: a + b√r > 0 khi a, b cùng dấu, hoặc khác dấu mà phần lớn hơn (so bình phương) dương. */
  sign(): number {
    const sa = this.a.sign()
    const sb = this.b.sign()
    if (sb === 0) return sa
    if (sa === 0 || sa === sb) return sb
    const a2 = this.a.mul(this.a)
    const b2r = this.b.mul(this.b).mul(Frac.of(this.r))
    return a2.cmp(b2r) > 0 ? sa : sb
  }

  cmp(o: Surd): number {
    if (this.isRational() || o.isRational() || this.r === o.r) return this.sub(o).sign()
    return Math.sign(this.toNumber() - o.toNumber())
  }

  eq(o: Surd): boolean {
    return this.a.eq(o.a) && this.b.eq(o.b) && this.r === o.r
  }

  isZero(): boolean {
    return this.a.isZero() && this.b.isZero()
  }

  toNumber(): number {
    return this.a.toNumber() + this.b.toNumber() * Math.sqrt(Number(this.r))
  }

  /** Nếu hữu tỉ thì trả phân số, không thì `null`. */
  toFrac(): Frac | null {
    return this.isRational() ? this.a : null
  }

  /**
   * Viết như SGK, gộp chung mẫu: `1 - \sqrt{2}`, `\frac{-1 + \sqrt{3}}{2}`,
   * `-\frac{\sqrt{2}}{2}`, `2\sqrt{3}`.
   */
  toTex(): string {
    if (this.isRational()) return this.a.toTex()
    const L = lcmBig(this.a.d, this.b.d)
    const A = (this.a.n * L) / this.a.d
    const B = (this.b.n * L) / this.b.d
    const rad = `\\sqrt{${this.r}}`
    const coef = (v: bigint) => (abs(v) === B1 ? '' : `${abs(v)}`)
    if (A === BigInt(0)) {
      const body = `${coef(B)}${rad}`
      if (L === B1) return B < 0 ? `-${body}` : body
      return `${B < 0 ? '-' : ''}\\frac{${body}}{${L}}`
    }
    const numer = `${A} ${B < 0 ? '-' : '+'} ${coef(B)}${rad}`
    return L === B1 ? numer : `\\frac{${numer}}{${L}}`
  }

  /** Chữ thường cho SVG (bảng biến thiên): `1 − √2`, `(−1 + √3)/2`. */
  toPlain(): string {
    if (this.isRational()) return this.a.toString()
    const L = lcmBig(this.a.d, this.b.d)
    const A = (this.a.n * L) / this.a.d
    const B = (this.b.n * L) / this.b.d
    const rad = `√${this.r}`
    const coef = (v: bigint) => (abs(v) === B1 ? '' : `${abs(v)}`)
    const minus = '−'
    let body: string
    if (A === BigInt(0)) {
      body = `${B < 0 ? minus : ''}${coef(B)}${rad}`
      return L === B1 ? body : `${B < 0 ? minus : ''}${coef(B)}${rad}/${L}`
    }
    body = `${A < 0 ? minus : ''}${abs(A)} ${B < 0 ? minus : '+'} ${coef(B)}${rad}`
    return L === B1 ? body : `(${body})/${L}`
  }
}

function abs(v: bigint): bigint {
  return v < BigInt(0) ? -v : v
}

function gcdBig(a: bigint, b: bigint): bigint {
  a = abs(a)
  b = abs(b)
  while (b !== BigInt(0)) [a, b] = [b, a % b]
  return a
}

function lcmBig(a: bigint, b: bigint): bigint {
  return (a / gcdBig(a, b)) * b
}

/**
 * n = outside² · inside với inside không có ước chính phương. Thử chia tới 10⁶ —
 * hệ số học sinh gõ nhỏ hơn thế rất nhiều; phần còn lại (nếu có) để nguyên trong căn.
 */
function squareFree(n: bigint): { outside: bigint; inside: bigint } {
  let outside = B1
  let inside = n
  for (let p = B2; p * p <= inside && p < BigInt(1_000_000); p += p === B2 ? B1 : B2) {
    const pp = p * p
    while (inside % pp === BigInt(0)) {
      inside /= pp
      outside *= p
    }
  }
  return { outside, inside }
}
