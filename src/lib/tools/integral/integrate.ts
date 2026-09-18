/**
 * Lõi toán của công cụ tích phân: nguyên hàm, tích phân xác định, tổng Riemann
 * và phép tách khúc theo dấu để bỏ dấu trị tuyệt đối.
 *
 * MỌI con số ở đây CHÍNH XÁC. Nguyên hàm của đa thức hệ số phân số vẫn là đa
 * thức hệ số phân số, nên `\int_0^1 x^2 dx` ra đúng `1/3` chứ không phải
 * 0,3333. Số thực chỉ xuất hiện lúc vẽ hình. Dấu của biểu thức trên một khoảng
 * lấy bằng cách thế một điểm HỮU TỈ nằm giữa hai nghiệm liên tiếp — cùng cách
 * học sinh xét dấu bằng tay, và không bao giờ đọc dấu từ đồ thị.
 */

import { Frac } from '../fraction.ts'
import { exactRoots, pickTestPoint, Poly, type Root } from '../poly.ts'
import { Surd } from '../surd.ts'

export type Sign = 1 | -1

/** Việc công cụ cố ý không làm, thay vì đoán gần đúng. */
export class UnsupportedError extends Error {}

/** Nguyên hàm có hằng số C = 0: `\int (ax^n) = a x^{n+1}/(n+1)`. */
export function antiderivative(p: Poly): Poly {
  return new Poly([Frac.ZERO, ...p.c.map((v, i) => v.div(Frac.of(i + 1)))])
}

/** `\int_a^b p dx = F(b) - F(a)`, chính xác. */
export function integrate(p: Poly, a: Surd, b: Surd): Surd {
  const F = antiderivative(p)
  try {
    return F.evalSurd(b).sub(F.evalSurd(a))
  } catch {
    // Hai cận chứa hai căn khác nhau (√2 và √3): tập a + b√r không cộng được.
    throw new UnsupportedError('Hai cận chứa hai căn khác nhau nên không cộng chính xác được.')
  }
}

export function integrateFrac(p: Poly, a: Frac, b: Frac): Frac {
  const F = antiderivative(p)
  return F.eval(b).sub(F.eval(a))
}

/** Một khúc mà biểu thức dưới dấu tích phân giữ nguyên dấu. */
export interface Piece {
  from: Surd
  to: Surd
  sign: Sign
  /** Điểm thử hữu tỉ và giá trị tại đó — để lời giải viết được phép thử. */
  test: Frac
  testValue: Frac
  /** Tích phân CÓ DẤU trên khúc. */
  signed: Surd
  /** Trị tuyệt đối của nó — phần đóng góp vào diện tích / quãng đường. */
  area: Surd
}

/**
 * Chia `[from; to]` tại các nghiệm của `p` nằm bên trong, rồi tính tích phân
 * từng khúc. Hai khúc liền nhau cùng dấu được gộp lại: nghiệm bội chẵn làm đồ
 * thị chạm trục rồi bật lại, tách ở đó chỉ làm lời giải dài thêm mà không đổi
 * kết quả.
 */
export function splitBySign(p: Poly, from: Surd, to: Surd): Piece[] {
  if (p.isZero()) return []
  const roots = exactRoots(p)
  if (!roots) {
    throw new UnsupportedError('Không giải chính xác được phương trình hoành độ giao điểm.')
  }
  const marks: Surd[] = [from, ...roots.map((r) => r.value).filter((v) => v.cmp(from) > 0 && v.cmp(to) < 0), to]

  const raw = marks.slice(0, -1).map((lo, i) => {
    const hi = marks[i + 1]
    const test = pickTestPoint(lo, hi)
    const testValue = p.eval(test)
    return { from: lo, to: hi, sign: (testValue.sign() > 0 ? 1 : -1) as Sign, test, testValue }
  })

  const merged: typeof raw = []
  for (const piece of raw) {
    const last = merged[merged.length - 1]
    if (last && last.sign === piece.sign) last.to = piece.to
    else merged.push({ ...piece })
  }

  return merged.map((m) => {
    const signed = integrate(p, m.from, m.to)
    return { ...m, signed, area: signed.sign() < 0 ? signed.neg() : signed }
  })
}

/** Nghiệm của `p` nằm hẳn trong khoảng mở `(from; to)`. */
export function rootsInside(roots: Root[], from: Surd, to: Surd): Root[] {
  return roots.filter((r) => r.value.cmp(from) > 0 && r.value.cmp(to) < 0)
}

/** `1` nếu `p` đồng biến trên `[a; b]`, `-1` nếu nghịch biến, `null` nếu đổi chiều. */
export function monotoneOn(p: Poly, a: Surd, b: Surd): Sign | null {
  const d = p.derivative()
  if (d.isZero()) return null
  const roots = exactRoots(d)
  if (!roots) return null
  if (rootsInside(roots, a, b).length > 0) return null
  const v = d.eval(pickTestPoint(a, b))
  return v.isZero() ? null : v.sign() > 0 ? 1 : -1
}

export type RiemannKind = 'left' | 'right' | 'mid'

export const RIEMANN_LABEL: Record<RiemannKind, string> = {
  left: 'Mút trái',
  right: 'Mút phải',
  mid: 'Trung điểm',
}

export interface Rect {
  x0: Frac
  x1: Frac
  /** Điểm đại diện $x_i^*$ của hình chữ nhật. */
  star: Frac
  /** Chiều cao có dấu: $f(x_i^*)$. */
  height: Frac
}

export interface RiemannResult {
  kind: RiemannKind
  n: number
  dx: Frac
  rects: Rect[]
  /** $S_n = \Delta x \sum f(x_i^*)$ — chính xác. */
  sum: Frac
}

/**
 * Tổng Riemann với n hình chữ nhật bằng nhau trên `[a; b]`.
 *
 * Tính bằng phân số: với n = 64 và hàm bậc ba, mẫu số vẫn nhỏ hơn 2^53 rất
 * nhiều, nên bảng "n tăng thì S_n tiến tới đâu" không lẫn sai số dấu phẩy động
 * vào đúng chỗ học sinh đang nhìn để tin rằng nó hội tụ.
 */
export function riemannSum(p: Poly, a: Frac, b: Frac, n: number, kind: RiemannKind): RiemannResult {
  const dx = b.sub(a).div(Frac.of(n))
  const rects: Rect[] = []
  let total = Frac.ZERO
  for (let i = 0; i < n; i++) {
    const x0 = a.add(dx.mul(Frac.of(i)))
    const x1 = a.add(dx.mul(Frac.of(i + 1)))
    const star = kind === 'left' ? x0 : kind === 'right' ? x1 : x0.add(x1).div(Frac.of(2))
    const height = p.eval(star)
    rects.push({ x0, x1, star, height })
    total = total.add(height)
  }
  return { kind, n, dx, rects, sum: dx.mul(total) }
}
