/**
 * Đọc bất phương trình bậc nhất hai ẩn do học sinh gõ.
 *
 * Nhận những cách viết học sinh thật sự dùng, không bắt các em học cú pháp:
 *   `2x + y <= 4`   `2x+y≤4`   `y >= 2x - 1`   `x/2 + y < 3`   `3(x - y) ≥ 1`
 *   `0 ≤ x ≤ 5`     (chuỗi hai dấu → HAI bất phương trình)
 *   `0,5x + y > 2`  (dấu phẩy thập phân)
 *   `$x \leq 3$`    (dán từ LaTeX)
 *
 * Kết quả luôn ở dạng `ax + by (dấu) c`. Hai phép biến đổi được GHI LẠI để
 * công cụ trình bày thành một bước cho học sinh thấy, thay vì âm thầm đổi đề:
 *   1. Quy đồng khử mẫu (nhân hai vế với số dương, giữ chiều).
 *   2. Hệ số đầu âm thì nhân −1 và ĐỔI CHIỀU — `y ≥ 2x − 1` thành `2x − y ≤ 1`.
 *
 * Không nhận: dấu `=` (đó là phương trình), `≠`, và mọi thứ không bậc nhất
 * (`x²`, `xy`, chia cho biểu thức chứa ẩn). Mỗi lỗi có một câu tiếng Việt nói
 * đúng chỗ sai.
 */

import { Frac, lcm } from './fraction.ts'

export type Op = '<' | '<=' | '>' | '>='

/** a·x + b·y + k */
export interface Linear {
  a: Frac
  b: Frac
  k: Frac
}

export interface Inequality {
  a: Frac
  b: Frac
  c: Frac
  op: Op
}

export interface ParsedInequality {
  /** Dạng cuối cùng dùng để vẽ và tính. */
  inequality: Inequality
  /** Dạng ngay sau khi chuyển vế, trước khi khử mẫu / đổi dấu. */
  moved: Inequality
  /** Đã nhân hai vế với số nào (1 nếu không đổi). Âm nghĩa là đã đổi chiều. */
  multiplier: Frac
}

export type ParseResult =
  | { ok: true; items: ParsedInequality[] }
  | { ok: false; error: string }

// ─── Chuẩn hoá chuỗi ────────────────────────────────────────────────────────

function normalize(input: string): string {
  let s = input
  s = s.replace(/\$/g, '')
  // \frac{a}{b} → (a)/(b); lặp để gỡ lồng một tầng.
  for (let i = 0; i < 3; i++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
  s = s
    .replace(/\\leq?(?![a-z])|\\leqslant|⩽|≤/g, '<=')
    .replace(/\\geq?(?![a-z])|\\geqslant|⩾|≥/g, '>=')
    .replace(/\\lt(?![a-z])/g, '<')
    .replace(/\\gt(?![a-z])/g, '>')
    .replace(/\\neq?(?![a-z])|≠|!=/g, '≠')
    .replace(/\\cdot|\\times|·|×/g, '*')
    .replace(/\\left|\\right/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[{}]/g, (m) => (m === '{' ? '(' : ')'))
    .replace(/=</g, '<=')
    .replace(/=>/g, '>=')
    .replace(/X/g, 'x')
    .replace(/Y/g, 'y')
  return s
}

// ─── Tách token ─────────────────────────────────────────────────────────────

type Tok =
  | { t: 'num'; v: Frac; raw: string }
  | { t: 'var'; v: 'x' | 'y' }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'rel'; v: Op | '=' | '≠' }

class ParseError extends Error {}

function tokenize(s: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const num = /^(\d+(?:[.,]\d+)?|[.,]\d+)/.exec(s.slice(i))
    if (num) {
      const v = Frac.parse(num[1])
      if (!v) throw new ParseError(`Không đọc được số "${num[1]}".`)
      out.push({ t: 'num', v, raw: num[1] })
      i += num[1].length
      continue
    }
    if (ch === 'x' || ch === 'y') {
      out.push({ t: 'var', v: ch })
      i++
      continue
    }
    if (ch === '<' || ch === '>') {
      const eq = s[i + 1] === '='
      out.push({ t: 'rel', v: (eq ? `${ch}=` : ch) as Op })
      i += eq ? 2 : 1
      continue
    }
    if (ch === '=') {
      out.push({ t: 'rel', v: '=' })
      i++
      continue
    }
    if (ch === '≠') {
      out.push({ t: 'rel', v: '≠' })
      i++
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      out.push({ t: 'op', v: ch })
      i++
      continue
    }
    if (ch === '(' || ch === '[') {
      out.push({ t: 'lp' })
      i++
      continue
    }
    if (ch === ')' || ch === ']') {
      out.push({ t: 'rp' })
      i++
      continue
    }
    if (ch === '^' || ch === '²') {
      throw new ParseError('Chỉ nhận bất phương trình BẬC NHẤT — không có luỹ thừa như x².')
    }
    if (ch === ',' || ch === ';') {
      throw new ParseError('Mỗi dòng một bất phương trình — tách sang dòng mới (hoặc ngăn bằng dấu ;).')
    }
    if (/[a-zA-Zà-ỹÀ-Ỹ]/.test(ch)) {
      throw new ParseError(`Chỉ dùng hai ẩn x và y (gặp "${ch}").`)
    }
    throw new ParseError(`Không hiểu ký tự "${ch}".`)
  }
  return out
}

// ─── Biểu thức tuyến tính ───────────────────────────────────────────────────

const ZERO: Linear = { a: Frac.ZERO, b: Frac.ZERO, k: Frac.ZERO }

function isConst(l: Linear): boolean {
  return l.a.isZero() && l.b.isZero()
}

function add(p: Linear, q: Linear): Linear {
  return { a: p.a.add(q.a), b: p.b.add(q.b), k: p.k.add(q.k) }
}

function scale(p: Linear, f: Frac): Linear {
  return { a: p.a.mul(f), b: p.b.mul(f), k: p.k.mul(f) }
}

class Parser {
  private pos = 0
  // Không dùng parameter property: `node --experimental-strip-types` (bộ chạy test)
  // chỉ gỡ kiểu, không biên dịch cú pháp riêng của TypeScript.
  private readonly toks: Tok[]
  constructor(toks: Tok[]) {
    this.toks = toks
  }

  peek(): Tok | undefined {
    return this.toks[this.pos]
  }

  next(): Tok | undefined {
    return this.toks[this.pos++]
  }

  atEnd(): boolean {
    return this.pos >= this.toks.length
  }

  expr(): Linear {
    let acc = this.term()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next()
        const rhs = this.term()
        acc = add(acc, t.v === '+' ? rhs : scale(rhs, Frac.of(-1)))
      } else return acc
    }
  }

  private term(): Linear {
    let acc = this.unary()
    for (;;) {
      const t = this.peek()
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next()
        const rhs = this.unary()
        acc = t.v === '*' ? this.mul(acc, rhs) : this.div(acc, rhs)
      } else if (t && (t.t === 'num' || t.t === 'var' || t.t === 'lp')) {
        // Nhân ngầm: 2x, 3(x + 1), x(2)
        acc = this.mul(acc, this.unary())
      } else return acc
    }
  }

  private unary(): Linear {
    const t = this.peek()
    if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
      this.next()
      const inner = this.unary()
      return t.v === '-' ? scale(inner, Frac.of(-1)) : inner
    }
    return this.factor()
  }

  private factor(): Linear {
    const t = this.next()
    if (!t) throw new ParseError('Biểu thức bị cụt ở cuối.')
    if (t.t === 'num') return { ...ZERO, k: t.v }
    if (t.t === 'var') return t.v === 'x' ? { ...ZERO, a: Frac.ONE } : { ...ZERO, b: Frac.ONE }
    if (t.t === 'lp') {
      const inner = this.expr()
      const close = this.next()
      if (close?.t !== 'rp') throw new ParseError('Thiếu dấu ngoặc đóng ")".')
      return inner
    }
    if (t.t === 'rp') throw new ParseError('Thừa dấu ngoặc đóng ")".')
    if (t.t === 'rel') throw new ParseError('Thiếu biểu thức cạnh dấu so sánh.')
    throw new ParseError(`Dấu "${t.v}" đứng sai chỗ.`)
  }

  private mul(p: Linear, q: Linear): Linear {
    if (isConst(p)) return scale(q, p.k)
    if (isConst(q)) return scale(p, q.k)
    throw new ParseError('Chỉ nhận bất phương trình BẬC NHẤT — không có tích như xy hay x·x.')
  }

  private div(p: Linear, q: Linear): Linear {
    if (!isConst(q)) throw new ParseError('Không chia cho biểu thức chứa ẩn — như vậy không còn là bậc nhất.')
    if (q.k.isZero()) throw new ParseError('Có phép chia cho 0.')
    return scale(p, Frac.ONE.div(q.k))
  }
}

/** Đọc một biểu thức không có dấu so sánh, ví dụ hàm mục tiêu `F = 3x + 2y`. */
export function parseLinearExpression(input: string): { ok: true; value: Linear } | { ok: false; error: string } {
  try {
    let s = normalize(input)
    // Cho phép gõ kèm tên hàm: "F = 3x + 2y", "F(x;y) = ...", "T = ...".
    s = s.replace(/^\s*[a-zA-Z]\s*(\(\s*x\s*[;,]\s*y\s*\))?\s*=/, '')
    const toks = tokenize(s)
    if (toks.length === 0) return { ok: false, error: 'Chưa nhập biểu thức.' }
    if (toks.some((t) => t.t === 'rel')) return { ok: false, error: 'Biểu thức không được chứa dấu so sánh.' }
    const p = new Parser(toks)
    const value = p.expr()
    if (!p.atEnd()) throw new ParseError('Có phần thừa không đọc được ở cuối biểu thức.')
    return { ok: true, value }
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message }
    throw e
  }
}

// ─── Bất phương trình ───────────────────────────────────────────────────────

const FLIP: Record<Op, Op> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }

function toInequality(left: Linear, op: Op, right: Linear): ParsedInequality {
  const diff = add(left, scale(right, Frac.of(-1)))
  if (isConst(diff)) {
    throw new ParseError('Sau khi chuyển vế không còn ẩn x, y — đây không phải bất phương trình hai ẩn.')
  }
  const moved: Inequality = { a: diff.a, b: diff.b, c: diff.k.neg(), op }

  // Khử mẫu: nhân với BCNN các mẫu (số dương, không đổi chiều).
  let m = BigInt(1)
  for (const f of [moved.a, moved.b, moved.c]) m = lcm(m, f.d)
  let multiplier = Frac.of(m)

  // Hệ số đầu âm → nhân −1, đổi chiều.
  const lead = moved.a.isZero() ? moved.b : moved.a
  if (lead.sign() < 0) multiplier = multiplier.neg()

  const flip = multiplier.sign() < 0
  const inequality: Inequality = {
    a: moved.a.mul(multiplier),
    b: moved.b.mul(multiplier),
    c: moved.c.mul(multiplier),
    op: flip ? FLIP[op] : op,
  }
  return { inequality, moved, multiplier }
}

/**
 * Đọc MỘT dòng. Dòng có hai dấu so sánh (`0 ≤ x ≤ 5`) cho ra hai bất phương trình.
 */
export function parseInequalityLine(input: string): ParseResult {
  try {
    const toks = tokenize(normalize(input))
    if (toks.length === 0) return { ok: false, error: 'Dòng trống.' }

    const parts: Linear[] = []
    const rels: Op[] = []
    const p = new Parser(toks)
    parts.push(p.expr())
    while (!p.atEnd()) {
      const t = p.next()
      if (t?.t !== 'rel') throw new ParseError('Có phần thừa không đọc được — kiểm tra lại dấu và ngoặc.')
      if (t.v === '=') {
        throw new ParseError('Đây là phương trình (dấu =). Hãy dùng một trong các dấu <, >, ≤, ≥.')
      }
      if (t.v === '≠') throw new ParseError('Dấu ≠ không biểu diễn được bằng một nửa mặt phẳng.')
      rels.push(t.v)
      parts.push(p.expr())
    }
    if (rels.length === 0) return { ok: false, error: 'Thiếu dấu so sánh <, >, ≤ hoặc ≥.' }
    if (rels.length > 2) return { ok: false, error: 'Mỗi dòng tối đa hai dấu so sánh, ví dụ 0 ≤ x ≤ 5.' }

    const items: ParsedInequality[] = []
    for (let i = 0; i < rels.length; i++) items.push(toInequality(parts[i], rels[i], parts[i + 1]))
    return { ok: true, items }
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message }
    throw e
  }
}

// ─── Trình bày ──────────────────────────────────────────────────────────────

const OP_TEX: Record<Op, string> = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' }
const OP_TEXT: Record<Op, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }

export function isStrict(op: Op): boolean {
  return op === '<' || op === '>'
}

function termsTex(a: Frac, b: Frac): string {
  const parts: string[] = []
  for (const [coef, name] of [
    [a, 'x'],
    [b, 'y'],
  ] as const) {
    if (coef.isZero()) continue
    const absC = coef.abs()
    const body = absC.eq(Frac.ONE) ? name : `${absC.toTex()}${name}`
    if (parts.length === 0) parts.push(coef.sign() < 0 ? `-${body}` : body)
    else parts.push(coef.sign() < 0 ? `- ${body}` : `+ ${body}`)
  }
  return parts.join(' ')
}

function termsText(a: Frac, b: Frac): string {
  const parts: string[] = []
  for (const [coef, name] of [
    [a, 'x'],
    [b, 'y'],
  ] as const) {
    if (coef.isZero()) continue
    const absC = coef.abs()
    const body = absC.eq(Frac.ONE) ? name : `${absC.toString()}${name}`
    if (parts.length === 0) parts.push(coef.sign() < 0 ? `−${body}` : body)
    else parts.push(coef.sign() < 0 ? `− ${body}` : `+ ${body}`)
  }
  return parts.join(' ')
}

export function inequalityTex(q: Inequality): string {
  return `${termsTex(q.a, q.b)} ${OP_TEX[q.op]} ${q.c.toTex()}`
}

export function inequalityText(q: Inequality): string {
  return `${termsText(q.a, q.b)} ${OP_TEXT[q.op]} ${q.c.toString()}`
}

/** Đường thẳng bờ `ax + by = c`. */
export function boundaryTex(q: Inequality): string {
  return `${termsTex(q.a, q.b)} = ${q.c.toTex()}`
}

export function boundaryText(q: Inequality): string {
  return `${termsText(q.a, q.b)} = ${q.c.toString()}`
}

export function opTex(op: Op): string {
  return OP_TEX[op]
}

export function opText(op: Op): string {
  return OP_TEXT[op]
}

/** Biểu thức `px + qy + r` (hàm mục tiêu). */
export function linearTex(l: Linear): string {
  const t = termsTex(l.a, l.b)
  if (l.k.isZero()) return t || '0'
  if (!t) return l.k.toTex()
  return l.k.sign() < 0 ? `${t} - ${l.k.abs().toTex()}` : `${t} + ${l.k.toTex()}`
}
