/**
 * Đọc biểu thức học sinh gõ (hoặc dán từ đề) thành phân thức N(x)/D(x) chính xác.
 *
 * Nhận: `x^3 - 3x^2 + 2`, `y = -x^4 + 2x^2`, `(2x+1)/(x-1)`, `x + 1 + 1/(x-1)`,
 * `2(x-1)^2(x+1)`, số thập phân dấu phẩy, phân số, `x²`, `−`, và LaTeX dán từ đề
 * (`\frac{2x+1}{x-1}`, `\dfrac`, `\left(`).
 *
 * Tách khỏi `function-analysis/parse.ts` ngày 2026-09-18 để công cụ tích phân
 * dùng lại: phần xếp hàm số vào dạng SGK vẫn nằm bên đó. Biến đổi được (`t` cho
 * bài chuyển động) — mọi chữ cái biến được đổi về `x` ngay từ bước chuẩn hoá,
 * nên phần sau chỉ biết một biến duy nhất.
 */

import { Frac, lcm } from './fraction.ts'
import { Poly } from './poly.ts'

export interface Rat {
  num: Poly
  den: Poly
}

export type RatResult = { ok: true; rat: Rat } | { ok: false; error: string }
export type PolyResult = { ok: true; poly: Poly } | { ok: false; error: string }

type Token = { t: 'num'; v: Frac } | { t: 'x' } | { t: 'op'; v: string }

const ONE = Poly.const(Frac.ONE)

function latexToPlain(src: string): string {
  // `0{,}5` là cách LaTeX viết số thập phân dấu phẩy.
  let s = src.replace(/\{,\}/g, ',')
  // \frac{A}{B} → ((A)/(B)); lặp để xử lý phân số lồng nhau.
  for (let guard = 0; guard < 20; guard++) {
    const i = s.search(/\\[dt]?frac\s*\{/)
    if (i < 0) break
    const open1 = s.indexOf('{', i)
    const close1 = matchBrace(s, open1)
    if (close1 < 0) break
    const open2 = s.slice(close1 + 1).search(/\S/) + close1 + 1
    if (s[open2] !== '{') break
    const close2 = matchBrace(s, open2)
    if (close2 < 0) break
    s = `${s.slice(0, i)}((${s.slice(open1 + 1, close1)})/(${s.slice(open2 + 1, close2)}))${s.slice(close2 + 1)}`
  }
  return s
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\,|\\;|\\!|\\ /g, '')
    .replace(/[{}]/g, (m) => (m === '{' ? '(' : ')'))
}

function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

function normalize(src: string, variable: string): string {
  const supers: Record<string, string> = { '²': '^2', '³': '^3', '⁴': '^4' }
  let s = latexToPlain(src)
    .replace(/[²³⁴]/g, (m) => supers[m])
    .replace(/[−–—]/g, '-')
    .replace(/[·×]/g, '*')
    .trim()
  // Bỏ vế trái "y =", "f(x) =", "v(t) =". Biểu thức hợp lệ không bao giờ có dấu
  // "=" nên cắt tới đó là an toàn.
  s = s.replace(/^\s*[a-zA-Z]\s*(?:\(\s*[a-zA-Z]\s*\)\s*)?=\s*/, '')
  // Mọi cách viết biến về `x`: `X`, và chữ biến của bài (t, u…).
  return s.replace(new RegExp(`[${variable}${variable.toUpperCase()}X]`, 'g'), 'x')
}

function tokenize(s: string, variable: string): Token[] | string {
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i))
    if (num) {
      out.push({ t: 'num', v: Frac.parse(num[0])! })
      i += num[0].length
      continue
    }
    if (ch === 'x') {
      out.push({ t: 'x' })
      i++
      continue
    }
    if ('+-*/^()'.includes(ch)) {
      out.push({ t: 'op', v: ch })
      i++
      continue
    }
    return `Không hiểu ký tự “${ch}”. Chỉ dùng biến ${variable}, số, + − * / ^ và dấu ngoặc.`
  }
  return out
}

class Parser {
  private readonly tokens: Token[]
  private readonly variable: string
  private pos = 0

  constructor(tokens: Token[], variable: string) {
    this.tokens = tokens
    this.variable = variable
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private isOp(v: string): boolean {
    const t = this.peek()
    return t?.t === 'op' && t.v === v
  }

  parse(): Rat {
    const r = this.expr()
    if (this.pos < this.tokens.length) throw new Error('Biểu thức thừa ký tự ở cuối — kiểm tra lại dấu ngoặc.')
    return r
  }

  private expr(): Rat {
    let acc = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { v: string }).v
      const rhs = this.term()
      acc = op === '+' ? addRat(acc, rhs) : addRat(acc, negRat(rhs))
    }
    return acc
  }

  private term(): Rat {
    let acc = this.unary()
    for (;;) {
      if (this.isOp('*')) {
        this.pos++
        acc = mulRat(acc, this.unary())
      } else if (this.isOp('/')) {
        this.pos++
        const rhs = this.unary()
        if (rhs.num.isZero()) throw new Error('Có phép chia cho 0.')
        acc = mulRat(acc, { num: rhs.den, den: rhs.num })
      } else {
        const t = this.peek()
        // Nhân ngầm: 2x, 3(x+1), (x+1)(x-2), x(x-1).
        if (t && (t.t === 'x' || (t.t === 'op' && t.v === '(') || (t.t === 'num' && this.prevIsNotNumber()))) {
          acc = mulRat(acc, this.power())
        } else {
          return acc
        }
      }
    }
  }

  private prevIsNotNumber(): boolean {
    const prev = this.tokens[this.pos - 1]
    return prev?.t !== 'num'
  }

  private unary(): Rat {
    if (this.isOp('-')) {
      this.pos++
      return negRat(this.unary())
    }
    if (this.isOp('+')) {
      this.pos++
      return this.unary()
    }
    return this.power()
  }

  private power(): Rat {
    const base = this.atom()
    if (!this.isOp('^')) return base
    this.pos++
    const t = this.peek()
    let exp: Frac | null = null
    if (t?.t === 'num') {
      exp = t.v
      this.pos++
    } else if (this.isOp('(')) {
      this.pos++
      const inner = this.peek()
      if (inner?.t === 'num') {
        exp = inner.v
        this.pos++
      }
      if (!this.isOp(')')) throw new Error(`Số mũ phải là số tự nhiên, ví dụ ${this.variable}^3.`)
      this.pos++
    }
    if (!exp || !exp.isInteger() || exp.sign() < 0 || exp.toNumber() > 8) {
      throw new Error(`Số mũ phải là số tự nhiên từ 0 đến 8, ví dụ ${this.variable}^3.`)
    }
    const k = exp.toNumber()
    return { num: base.num.pow(k), den: base.den.pow(k) }
  }

  private atom(): Rat {
    const t = this.peek()
    if (!t) throw new Error('Biểu thức bị thiếu ở cuối.')
    if (t.t === 'num') {
      this.pos++
      return { num: Poly.const(t.v), den: ONE }
    }
    if (t.t === 'x') {
      this.pos++
      return { num: Poly.X, den: ONE }
    }
    if (t.v === '(') {
      this.pos++
      const inner = this.expr()
      if (!this.isOp(')')) throw new Error('Thiếu dấu ngoặc đóng “)”.')
      this.pos++
      return inner
    }
    throw new Error(`Thiếu số hoặc ${this.variable} trước “${t.v}”.`)
  }
}

function addRat(a: Rat, b: Rat): Rat {
  if (a.den.eq(b.den)) return { num: a.num.add(b.num), den: a.den }
  return { num: a.num.mul(b.den).add(b.num.mul(a.den)), den: a.den.mul(b.den) }
}

function negRat(a: Rat): Rat {
  return { num: a.num.scale(Frac.of(-1)), den: a.den }
}

function mulRat(a: Rat, b: Rat): Rat {
  return { num: a.num.mul(b.num), den: a.den.mul(b.den) }
}

/**
 * Quy về hệ số nguyên nguyên tố cùng nhau, mẫu có hệ số cao nhất dương:
 * `(x/2 + 1)/(x - 1)` → `(x + 2)/(2x − 2)`. Mẫu là hằng thì chia hẳn vào tử.
 */
export function tidy({ num, den }: Rat): Rat {
  if (den.degree === 0) return { num: num.scale(Frac.ONE.div(den.c[0])), den: ONE }
  const all = [...num.c, ...den.c]
  const L = all.reduce((acc, v) => lcm(acc, v.d), BigInt(1))
  let g = BigInt(0)
  for (const v of all) {
    const n = (v.n * L) / v.d
    g = gcdBig(g, n < 0 ? -n : n)
  }
  const k = Frac.of(L, g === BigInt(0) ? BigInt(1) : g).mul(Frac.of(den.lead().sign()))
  return { num: num.scale(k), den: den.scale(k) }
}

function gcdBig(a: bigint, b: bigint): bigint {
  while (b !== BigInt(0)) [a, b] = [b, a % b]
  return a
}

/** Đọc biểu thức thành phân thức đã quy gọn hệ số. */
export function parseRational(src: string, variable = 'x'): RatResult {
  const text = normalize(src, variable)
  if (!text) return { ok: false, error: `Nhập biểu thức, ví dụ ${variable}^3 - 3${variable}^2 + 2.` }
  const tokens = tokenize(text, variable)
  if (typeof tokens === 'string') return { ok: false, error: tokens }
  try {
    return { ok: true, rat: tidy(new Parser(tokens, variable).parse()) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không đọc được biểu thức.' }
  }
}

/**
 * Như `parseRational` nhưng chỉ nhận ĐA THỨC — phân thức bị từ chối kèm lý do,
 * không rút gọn ngầm. `maxDegree` chặn bậc quá cao so với phạm vi công cụ.
 */
export function parsePolynomial(src: string, variable = 'x', maxDegree = 6): PolyResult {
  const r = parseRational(src, variable)
  if (!r.ok) return r
  if (r.rat.den.degree > 0) {
    return { ok: false, error: 'Công cụ chỉ nhận đa thức — biểu thức này còn biến ở dưới mẫu.' }
  }
  const poly = tidy(r.rat).num
  if (poly.degree > maxDegree) return { ok: false, error: `Công cụ nhận đa thức bậc không quá ${maxDegree}.` }
  return { ok: true, poly }
}
