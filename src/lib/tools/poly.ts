/**
 * Đa thức một biến hệ số phân số chính xác, và nghiệm CHÍNH XÁC của nó.
 *
 * Nghiệm chỉ tìm được khi đa thức tách hết về nhân tử bậc ≤ 2: rút nhân tử x,
 * thử nghiệm hữu tỉ (định lí nghiệm hữu tỉ), phần còn lại bậc ≤ 2 thì giải bằng
 * Δ. Đủ cho mọi y′ của các dạng hàm SGK 12 (bậc ba, bậc bốn trùng phương, phân
 * thức); không đủ thì trả `null` chứ KHÔNG đoán gần đúng — xem mục 5 của
 * docs/STUDENT_TOOLS_ROADMAP.md ("máy giải mọi bài" sẽ sai ở đâu đó).
 */

import { Frac, lcm } from './fraction.ts'
import { Surd } from './surd.ts'

const B0 = BigInt(0)
const B1 = BigInt(1)

export class Poly {
  /** c[i] là hệ số của xⁱ; không có số 0 thừa ở cuối (đa thức 0 là mảng rỗng). */
  readonly c: readonly Frac[]

  constructor(coefs: readonly Frac[]) {
    const c = [...coefs]
    while (c.length && c[c.length - 1].isZero()) c.pop()
    this.c = c
  }

  static const(f: Frac): Poly {
    return new Poly([f])
  }

  static readonly X = new Poly([Frac.ZERO, Frac.ONE])

  static fromInts(...descending: number[]): Poly {
    return new Poly(descending.map((n) => Frac.of(n)).reverse())
  }

  /** −1 cho đa thức 0. */
  get degree(): number {
    return this.c.length - 1
  }

  isZero(): boolean {
    return this.c.length === 0
  }

  coef(i: number): Frac {
    return this.c[i] ?? Frac.ZERO
  }

  lead(): Frac {
    return this.coef(this.degree)
  }

  add(o: Poly): Poly {
    const n = Math.max(this.c.length, o.c.length)
    return new Poly(Array.from({ length: n }, (_, i) => this.coef(i).add(o.coef(i))))
  }

  sub(o: Poly): Poly {
    return this.add(o.scale(Frac.of(-1)))
  }

  scale(k: Frac): Poly {
    return new Poly(this.c.map((v) => v.mul(k)))
  }

  mul(o: Poly): Poly {
    if (this.isZero() || o.isZero()) return new Poly([])
    const out = Array.from({ length: this.c.length + o.c.length - 1 }, () => Frac.ZERO)
    this.c.forEach((a, i) => o.c.forEach((b, j) => (out[i + j] = out[i + j].add(a.mul(b)))))
    return new Poly(out)
  }

  pow(k: number): Poly {
    let out = Poly.const(Frac.ONE)
    for (let i = 0; i < k; i++) out = out.mul(this)
    return out
  }

  derivative(): Poly {
    return new Poly(this.c.slice(1).map((v, i) => v.mul(Frac.of(i + 1))))
  }

  eval(x: Frac): Frac {
    let acc = Frac.ZERO
    for (let i = this.degree; i >= 0; i--) acc = acc.mul(x).add(this.c[i])
    return acc
  }

  evalSurd(x: Surd): Surd {
    let acc = Surd.int(0)
    for (let i = this.degree; i >= 0; i--) acc = acc.mul(x).add(Surd.frac(this.c[i]))
    return acc
  }

  evalNumber(x: number): number {
    let acc = 0
    for (let i = this.degree; i >= 0; i--) acc = acc * x + this.c[i].toNumber()
    return acc
  }

  /** Chia có dư: this = q·d + r. */
  divmod(d: Poly): { q: Poly; r: Poly } {
    if (d.isZero()) throw new RangeError('Chia cho đa thức 0')
    let r = new Poly(this.c)
    const q: Frac[] = Array.from({ length: Math.max(0, this.degree - d.degree + 1) }, () => Frac.ZERO)
    while (!r.isZero() && r.degree >= d.degree) {
      const k = r.degree - d.degree
      const t = r.lead().div(d.lead())
      q[k] = t
      r = r.sub(d.mul(new Poly([...Array.from({ length: k }, () => Frac.ZERO), t])))
    }
    return { q: new Poly(q), r }
  }

  eq(o: Poly): boolean {
    return this.c.length === o.c.length && this.c.every((v, i) => v.eq(o.c[i]))
  }

  /**
   * LaTeX theo thứ tự bậc giảm dần: `x^3 - 3x^2 + 2`, `-\frac{1}{3}x^3 + x`.
   * Hệ số 1 và −1 không viết ra (trừ số hạng tự do).
   */
  toTex(variable = 'x'): string {
    if (this.isZero()) return '0'
    let out = ''
    for (let i = this.degree; i >= 0; i--) {
      const v = this.c[i]
      if (v.isZero()) continue
      const negative = v.sign() < 0
      const mag = v.abs()
      const body = i === 0 ? mag.toTex() : `${mag.eq(Frac.ONE) ? '' : mag.toTex()}${variable}${i > 1 ? `^${i}` : ''}`
      out += out === '' ? `${negative ? '-' : ''}${body}` : ` ${negative ? '-' : '+'} ${body}`
    }
    return out
  }

  /**
   * Chữ gõ lại được vào ô nhập — bộ đọc `parse.ts` phải đọc ra đúng đa thức này.
   * Hệ số phân số bọc ngoặc: `(1/3)x^3`, vì `1/3x^3` đọc thành 1/(3x³).
   */
  toInput(variable = 'x'): string {
    if (this.isZero()) return '0'
    let out = ''
    for (let i = this.degree; i >= 0; i--) {
      const v = this.c[i]
      if (v.isZero()) continue
      const negative = v.sign() < 0
      const mag = v.abs()
      const num = mag.isInteger() ? mag.toPlain() : `(${mag.toPlain()})`
      const body = i === 0 ? mag.toPlain() : `${mag.eq(Frac.ONE) ? '' : num}${variable}${i > 1 ? `^${i}` : ''}`
      out += out === '' ? `${negative ? '-' : ''}${body}` : ` ${negative ? '-' : '+'} ${body}`
    }
    return out
  }
}

/**
 * Một số hữu tỉ "đẹp" nằm TRONG khoảng (lo; hi): ưu tiên 0, rồi số nguyên có trị
 * tuyệt đối nhỏ nhất — đúng kiểu học sinh chọn khi xét dấu bằng tay. Mọi ứng viên
 * được kiểm tra chính xác trước khi dùng.
 */
export function pickTestPoint(lo: Surd | null, hi: Surd | null): Frac {
  const inside = (t: Frac) => {
    const s = Surd.frac(t)
    return (!lo || s.cmp(lo) > 0) && (!hi || s.cmp(hi) < 0)
  }
  if (inside(Frac.ZERO)) return Frac.ZERO
  for (const den of [1, 2, 4, 10, 100, 1000, 10000, 1000000]) {
    const candidates: number[] = []
    if (hi && (!lo || hi.toNumber() <= 0)) candidates.push(Math.ceil(hi.toNumber() * den) - 1, Math.floor(hi.toNumber() * den) - 1)
    if (lo && (!hi || lo.toNumber() >= 0)) candidates.push(Math.floor(lo.toNumber() * den) + 1, Math.ceil(lo.toNumber() * den) + 1)
    for (const k of candidates) {
      const t = Frac.of(k, den)
      if (inside(t)) return t
    }
  }
  // Khoảng hẹp tới mức trên: lấy trung điểm hai đầu (cả hai hữu hạn mới tới được đây).
  const mid = ((lo?.toNumber() ?? 0) + (hi?.toNumber() ?? 0)) / 2
  return Frac.of(Math.round(mid * 1e9), 1e9)
}

export interface Root {
  value: Surd
  multiplicity: number
}

/**
 * Mọi nghiệm thực, chính xác, tăng dần; `null` nếu còn lại nhân tử bậc ≥ 3 không
 * có nghiệm hữu tỉ (không giải được bằng căn bậc hai).
 */
export function exactRoots(p: Poly): Root[] | null {
  if (p.isZero()) throw new RangeError('Đa thức 0 có vô số nghiệm')
  const roots: Root[] = []
  const push = (value: Surd, m = 1) => {
    const same = roots.find((r) => r.value.eq(value))
    if (same) same.multiplicity += m
    else roots.push({ value, multiplicity: m })
  }

  // Nhân tử x^k.
  let k = 0
  while (p.coef(k).isZero()) k++
  if (k > 0) push(Surd.int(0), k)
  let rest = new Poly(p.c.slice(k))

  // Trùng phương ax⁴ + bx² + c: đặt t = x². Chỉ nhận khi t hữu tỉ — t có căn thì x
  // là căn lồng căn, SGK không viết dạng đó; để rơi xuống bước dưới rồi trả null.
  if (rest.degree === 4 && rest.coef(1).isZero() && rest.coef(3).isZero()) {
    const ts = exactRoots(new Poly([rest.coef(0), rest.coef(2), rest.coef(4)]))
    if (ts && ts.every((t) => t.value.isRational())) {
      for (const t of ts) {
        const v = t.value.toFrac()!
        if (v.sign() < 0) continue
        if (v.isZero()) {
          push(Surd.int(0), 2 * t.multiplicity)
          continue
        }
        const s = Surd.sqrt(v)!
        push(s.neg(), t.multiplicity)
        push(s, t.multiplicity)
      }
      return roots.sort((x, y) => x.value.cmp(y.value))
    }
  }

  // Nghiệm hữu tỉ ±p/q, p | hệ số tự do, q | hệ số cao nhất (sau khi quy về số nguyên).
  while (rest.degree >= 3) {
    const r = rationalRoot(rest)
    if (!r) return null
    push(Surd.frac(r))
    rest = rest.divmod(new Poly([r.neg(), Frac.ONE])).q
  }

  if (rest.degree === 2) {
    const [C, B, A] = rest.c
    const delta = B.mul(B).sub(Frac.of(4).mul(A).mul(C))
    const twoA = Frac.of(2).mul(A)
    if (delta.isZero()) {
      push(Surd.frac(B.neg().div(twoA)), 2)
    } else if (delta.sign() > 0) {
      const sq = Surd.sqrt(delta)!
      const base = Surd.frac(B.neg())
      const inv = Surd.frac(Frac.ONE.div(twoA))
      push(base.sub(sq).mul(inv))
      push(base.add(sq).mul(inv))
    }
  } else if (rest.degree === 1) {
    push(Surd.frac(rest.c[0].neg().div(rest.c[1])))
  }

  return roots.sort((x, y) => x.value.cmp(y.value))
}

/** Một nghiệm hữu tỉ bất kỳ của đa thức, hoặc `null`. */
function rationalRoot(p: Poly): Frac | null {
  const L = p.c.reduce((acc, v) => lcm(acc, v.d), B1)
  const ints = p.c.map((v) => (v.n * L) / v.d)
  const a0 = ints[0]
  const an = ints[ints.length - 1]
  if (a0 === B0) return Frac.ZERO
  const P = divisors(a0)
  const Q = divisors(an)
  if (!P || !Q) return null
  for (const num of P) {
    for (const den of Q) {
      for (const s of [B1, -B1]) {
        const cand = Frac.of(s * num, den)
        if (p.eval(cand).isZero()) return cand
      }
    }
  }
  return null
}

/** Ước dương; bỏ cuộc (null) với số quá lớn để thử hết. */
function divisors(n: bigint): bigint[] | null {
  const m = n < B0 ? -n : n
  if (m > BigInt(1_000_000_000_000)) return null
  const out: bigint[] = []
  for (let i = B1; i * i <= m; i++) {
    if (m % i === B0) {
      out.push(i)
      if (i * i !== m) out.push(m / i)
    }
  }
  return out
}
