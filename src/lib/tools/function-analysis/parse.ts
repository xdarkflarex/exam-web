/**
 * Xếp hàm số học sinh gõ (hoặc dán từ đề) vào một trong các dạng SGK Toán 12 mà
 * công cụ khảo sát được.
 *
 * Phần đọc biểu thức — LaTeX, `x²`, phân số, nhân ngầm — nằm ở `../expression.ts`
 * và dùng chung với công cụ tích phân.
 */

import { Frac } from '../fraction.ts'
import { parseRational, tidy, type Rat } from '../expression.ts'
import { Poly } from '../poly.ts'

export type { Rat }

export type FunctionKind = 'quadratic' | 'cubic' | 'biquadratic' | 'quartic' | 'homographic' | 'rational21'

export interface ParsedFunction {
  kind: FunctionKind
  /** Tử; với đa thức thì là chính hàm số và `den` = 1. */
  num: Poly
  den: Poly
}

export type ParseResult = { ok: true; fn: ParsedFunction } | { ok: false; error: string }

export const KIND_LABEL: Record<FunctionKind, string> = {
  quadratic: 'Hàm số bậc hai',
  cubic: 'Hàm số bậc ba',
  biquadratic: 'Hàm số bậc bốn trùng phương',
  quartic: 'Hàm số bậc bốn',
  homographic: 'Hàm phân thức bậc nhất trên bậc nhất',
  rational21: 'Hàm phân thức bậc hai trên bậc nhất',
}

export function parseFunction(src: string): ParseResult {
  const r = parseRational(src)
  if (!r.ok) return { ok: false, error: r.error.replace('Nhập biểu thức', 'Nhập hàm số') }
  return classify(r.rat)
}

/** Xếp dạng — cũng dùng khi học sinh bấm +/− hệ số. */
export function classify(input: Rat): ParseResult {
  const { num, den } = tidy(input)
  if (den.degree === 0) {
    const d = num.degree
    if (d <= 0) return { ok: false, error: 'Đây là hàm hằng — không có gì để khảo sát.' }
    if (d === 1) return { ok: false, error: 'Đây là hàm bậc nhất: đồ thị là đường thẳng, không cần khảo sát.' }
    if (d === 2) return { ok: true, fn: { kind: 'quadratic', num, den } }
    if (d === 3) return { ok: true, fn: { kind: 'cubic', num, den } }
    if (d === 4) {
      const even = num.coef(3).isZero() && num.coef(1).isZero()
      return { ok: true, fn: { kind: even ? 'biquadratic' : 'quartic', num, den } }
    }
    return { ok: false, error: 'Công cụ nhận đa thức bậc 2, 3, 4 — đúng các dạng trong SGK Toán 12.' }
  }
  if (den.degree > 1 || num.degree > 2) {
    return {
      ok: false,
      error: 'Phân thức chỉ nhận dạng (ax + b)/(cx + d) và (ax² + bx + c)/(dx + e) như SGK Toán 12.',
    }
  }
  const x0 = den.c[0].neg().div(den.c[1])
  if (num.eval(x0).isZero()) {
    return {
      ok: false,
      error: `Tử và mẫu cùng bằng 0 tại x = ${x0.toString()}: phân thức rút gọn được, nên không phải dạng SGK. Rút gọn rồi nhập lại.`,
    }
  }
  return { ok: true, fn: { kind: num.degree === 2 ? 'rational21' : 'homographic', num, den } }
}

/** `x^3 - 3x^2 + 2` hoặc `\frac{x + 1}{x - 1}`. */
export function functionTex(fn: ParsedFunction): string {
  if (fn.den.degree === 0) return fn.num.toTex()
  return `\\frac{${fn.num.toTex()}}{${fn.den.toTex()}}`
}

/** Chữ gõ lại được vào ô nhập. */
export function functionInput(fn: Rat): string {
  if (fn.den.degree === 0 && fn.den.c[0].eq(Frac.ONE)) return fn.num.toInput()
  return `(${fn.num.toInput()})/(${fn.den.toInput()})`
}

/** Tên và giá trị các hệ số theo dạng — để hiện nút +/−. */
export interface CoefSlot {
  name: string
  /** 'num' hoặc 'den', và bậc của số hạng. */
  part: 'num' | 'den'
  power: number
}

export function coefSlots(kind: FunctionKind): CoefSlot[] {
  const n = (name: string, power: number): CoefSlot => ({ name, part: 'num', power })
  const d = (name: string, power: number): CoefSlot => ({ name, part: 'den', power })
  switch (kind) {
    case 'quadratic':
      return [n('a', 2), n('b', 1), n('c', 0)]
    case 'cubic':
      return [n('a', 3), n('b', 2), n('c', 1), n('d', 0)]
    case 'biquadratic':
      return [n('a', 4), n('b', 2), n('c', 0)]
    case 'quartic':
      return [n('a', 4), n('b', 3), n('c', 2), n('d', 1), n('e', 0)]
    case 'homographic':
      return [n('a', 1), n('b', 0), d('c', 1), d('d', 0)]
    case 'rational21':
      return [n('a', 2), n('b', 1), n('c', 0), d('d', 1), d('e', 0)]
  }
}

/** Công thức tổng quát của dạng, để đặt cạnh các nút hệ số. */
export const KIND_TEMPLATE_TEX: Record<FunctionKind, string> = {
  quadratic: 'y = ax^2 + bx + c',
  cubic: 'y = ax^3 + bx^2 + cx + d',
  biquadratic: 'y = ax^4 + bx^2 + c',
  quartic: 'y = ax^4 + bx^3 + cx^2 + dx + e',
  homographic: 'y = \\frac{ax + b}{cx + d}',
  rational21: 'y = \\frac{ax^2 + bx + c}{dx + e}',
}

export function coefOf(fn: Rat, slot: CoefSlot): Frac {
  return (slot.part === 'num' ? fn.num : fn.den).coef(slot.power)
}

/** Đổi một hệ số — KHÔNG kiểm tra dạng; gọi `classify` trên kết quả. */
export function withCoef(fn: Rat, slot: CoefSlot, value: Frac): Rat {
  const target = slot.part === 'num' ? fn.num : fn.den
  const c = Array.from({ length: Math.max(target.c.length, slot.power + 1) }, (_, i) => target.coef(i))
  c[slot.power] = value
  const next = new Poly(c)
  return slot.part === 'num' ? { num: next, den: fn.den } : { num: fn.num, den: next }
}
