/**
 * Khảo sát một hàm số theo sơ đồ SGK Toán 12 (Kết nối tri thức, Bài 5):
 * tập xác định → đạo hàm → nghiệm y′ = 0 → dấu y′ → cực trị → giới hạn, tiệm
 * cận → bảng biến thiên → đồ thị.
 *
 * MỌI kết luận ở đây tính CHÍNH XÁC: dấu của y′ trên một khoảng lấy bằng cách
 * thế một điểm HỮU TỈ trong khoảng đó vào tử của y′ (mẫu (cx + d)² luôn dương),
 * không đọc từ đồ thị hay số thực. Số thực chỉ dùng để chọn điểm thử và để vẽ.
 */

import { Frac } from '../fraction.ts'
import type { ParsedFunction } from './parse.ts'
import { exactRoots, pickTestPoint, Poly, type Root } from '../poly.ts'
import { Surd } from '../surd.ts'

export type Sign = 1 | -1

export type Limit = { kind: 'inf'; sign: Sign } | { kind: 'finite'; value: Frac }

/** Vị trí chữ trong dòng y của bảng biến thiên, như SGK: đỉnh mũi tên lên nằm trên, đáy nằm dưới. */
export type Level = 'top' | 'bottom' | 'mid'

export type Column =
  | { kind: 'minusInf'; limit: Limit; level: Level }
  | { kind: 'plusInf'; limit: Limit; level: Level }
  | { kind: 'crit'; x: Surd; y: Surd; multiplicity: number; extremum: 'max' | 'min' | null; level: Level }
  | { kind: 'pole'; x: Frac; left: Limit; right: Limit; leftLevel: Level; rightLevel: Level }

export interface SignInterval {
  /** Chỉ số cột hai đầu khoảng trong `columns`. */
  from: number
  to: number
  sign: Sign
  test: Frac
  /** y′(test), chính xác. */
  testValue: Frac
}

export type Bound = { kind: 'inf'; sign: Sign } | { kind: 'x'; value: Surd }

export interface MonotoneRun {
  sign: Sign
  from: Bound
  to: Bound
}

export interface Analysis {
  fn: ParsedFunction
  /** y′ = derivNum / derivDen; derivDen = 1 với đa thức, = (mẫu)² với phân thức. */
  derivNum: Poly
  derivDen: Poly
  pole: Frac | null
  /** Nghiệm của tử y′ — các điểm tới hạn. `null` không xảy ra với các dạng `classify` nhận. */
  roots: Root[]
  columns: Column[]
  intervals: SignInterval[]
  monotone: MonotoneRun[]
  horizontal: Frac | null
  /** Tiệm cận xiên y = ax + b (đa thức bậc nhất). */
  oblique: Poly | null
  /** Tâm đối xứng của đồ thị (bậc ba; phân thức có tiệm cận). */
  center: { x: Frac; y: Frac } | null
  /** Trục đối xứng x = …; `Oy` ghi bằng x = 0 kèm cờ `even`. */
  axis: { x: Frac; even: boolean } | null
  yIntercept: Frac | null
  /** Nghiệm của y = 0; `null` khi không giải chính xác được bằng căn bậc hai. */
  xIntercepts: Root[] | null
}

export class UnsupportedError extends Error {}

export function evaluate(fn: ParsedFunction, x: Surd): Surd {
  return fn.num.evalSurd(x).div(fn.den.evalSurd(x))
}

export function evaluateFrac(fn: ParsedFunction, x: Frac): Frac {
  return fn.num.eval(x).div(fn.den.eval(x))
}

function limitAtInfinity(fn: ParsedFunction, dir: Sign): Limit {
  const { num, den } = fn
  const ratio = num.lead().div(den.lead())
  if (num.degree > den.degree) {
    const odd = (num.degree - den.degree) % 2 === 1
    const s = ratio.sign() * (dir === -1 && odd ? -1 : 1)
    return { kind: 'inf', sign: s > 0 ? 1 : -1 }
  }
  if (num.degree === den.degree) return { kind: 'finite', value: ratio }
  return { kind: 'finite', value: Frac.ZERO }
}

function levelBetween(left: Sign, right: Sign): Level {
  if (left > 0 && right < 0) return 'top'
  if (left < 0 && right > 0) return 'bottom'
  return 'mid'
}

export function analyze(fn: ParsedFunction): Analysis {
  const { num, den } = fn
  const rational = den.degree >= 1
  const derivNum = rational ? num.derivative().mul(den).sub(num.mul(den.derivative())) : num.derivative()
  const derivDen = rational ? den.mul(den) : Poly.const(Frac.ONE)
  const pole = rational ? den.c[0].neg().div(den.c[1]) : null

  const found = derivNum.isZero() ? [] : exactRoots(derivNum)
  if (!found) throw new UnsupportedError('Không giải chính xác được phương trình y′ = 0.')
  const roots = found

  // Các mốc trên trục x, tăng dần: nghiệm y′ và điểm không xác định.
  type Mark = { kind: 'crit'; root: Root } | { kind: 'pole'; x: Frac }
  const marks: Mark[] = roots.map((root) => ({ kind: 'crit' as const, root }))
  if (pole) marks.push({ kind: 'pole', x: pole })
  const markX = (m: Mark) => (m.kind === 'crit' ? m.root.value : Surd.frac(m.x))
  marks.sort((p, q) => markX(p).cmp(markX(q)))

  // Dấu y′ trên từng khoảng giữa hai mốc liên tiếp.
  const intervals: SignInterval[] = []
  for (let i = 0; i <= marks.length; i++) {
    const lo = i === 0 ? null : markX(marks[i - 1])
    const hi = i === marks.length ? null : markX(marks[i])
    const test = pickTestPoint(lo, hi)
    const testValue = derivNum.eval(test).div(derivDen.eval(test))
    // Tử y′ khác 0 trên khoảng mở giữa hai nghiệm liên tiếp nên dấu tại điểm thử là dấu cả khoảng.
    intervals.push({ from: i, to: i + 1, sign: testValue.sign() > 0 ? 1 : -1, test, testValue })
  }

  const columns: Column[] = []
  columns.push({ kind: 'minusInf', limit: limitAtInfinity(fn, -1), level: intervals[0].sign > 0 ? 'bottom' : 'top' })
  marks.forEach((m, i) => {
    const left = intervals[i].sign
    const right = intervals[i + 1].sign
    if (m.kind === 'crit') {
      const extremum = left > 0 && right < 0 ? 'max' : left < 0 && right > 0 ? 'min' : null
      columns.push({
        kind: 'crit',
        x: m.root.value,
        y: evaluate(fn, m.root.value),
        multiplicity: m.root.multiplicity,
        extremum,
        level: levelBetween(left, right),
      })
    } else {
      // Bên phải điểm cực, mẫu cx + d cùng dấu c; tử khác 0 tại đó (đã loại phân thức rút gọn được).
      const s = fn.num.eval(m.x).sign() * den.c[1].sign()
      const right_: Limit = { kind: 'inf', sign: s > 0 ? 1 : -1 }
      const left_: Limit = { kind: 'inf', sign: s > 0 ? -1 : 1 }
      columns.push({
        kind: 'pole',
        x: m.x,
        left: left_,
        right: right_,
        leftLevel: left > 0 ? 'top' : 'bottom',
        rightLevel: right > 0 ? 'bottom' : 'top',
      })
    }
  })
  columns.push({
    kind: 'plusInf',
    limit: limitAtInfinity(fn, 1),
    level: intervals[intervals.length - 1].sign > 0 ? 'top' : 'bottom',
  })

  // Gộp các khoảng cùng dấu nối nhau qua một nghiệm y′ (không qua điểm cực):
  // y = x³ đồng biến trên ℝ dù y′(0) = 0.
  const bound = (col: Column): Bound =>
    col.kind === 'minusInf'
      ? { kind: 'inf', sign: -1 }
      : col.kind === 'plusInf'
        ? { kind: 'inf', sign: 1 }
        : { kind: 'x', value: col.kind === 'crit' ? col.x : Surd.frac(col.x) }
  const monotone: MonotoneRun[] = []
  intervals.forEach((iv) => {
    const last = monotone[monotone.length - 1]
    const joint = columns[iv.from]
    if (last && last.sign === iv.sign && joint.kind === 'crit') last.to = bound(columns[iv.to])
    else monotone.push({ sign: iv.sign, from: bound(columns[iv.from]), to: bound(columns[iv.to]) })
  })

  let horizontal: Frac | null = null
  let oblique: Poly | null = null
  if (rational) {
    if (num.degree <= den.degree) horizontal = (limitAtInfinity(fn, 1) as { value: Frac }).value
    else if (num.degree === den.degree + 1) oblique = num.divmod(den).q
  }

  let center: Analysis['center'] = null
  let axis: Analysis['axis'] = null
  if (fn.kind === 'cubic') {
    const x = num.coef(2).neg().div(Frac.of(3).mul(num.coef(3)))
    center = { x, y: num.eval(x) }
  } else if (pole && horizontal) {
    center = { x: pole, y: horizontal }
  } else if (pole && oblique) {
    center = { x: pole, y: oblique.eval(pole) }
  } else if (fn.kind === 'quadratic') {
    axis = { x: num.coef(1).neg().div(Frac.of(2).mul(num.coef(2))), even: false }
  } else if (fn.kind === 'biquadratic') {
    axis = { x: Frac.ZERO, even: true }
  }

  const yIntercept = pole && pole.isZero() ? null : evaluateFrac(fn, Frac.ZERO)
  const xIntercepts = num.isZero() ? null : exactRoots(num)

  return { fn, derivNum, derivDen, pole, roots, columns, intervals, monotone, horizontal, oblique, center, axis, yIntercept, xIntercepts }
}
