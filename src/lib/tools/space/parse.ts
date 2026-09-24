/**
 * Đọc những gì học sinh gõ cho bài Oxyz: điểm/vectơ, phương trình mặt phẳng,
 * phương trình mặt cầu.
 *
 * Quy ước dấu phân cách là **dấu chấm phẩy**, đúng như SGK viết `M(1; 2; 3)` —
 * dấu phẩy ở Việt Nam là dấu thập phân (`0,5`), nên dùng nó làm dấu phân cách
 * thì `0,5; 1; 2` và `0; 5; 1; 2` không phân biệt được.
 */

import { Frac } from '../fraction.ts'
import { Vec3, type Plane, type Sphere } from './geometry.ts'

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function clean(src: string): string {
  return src
    .replace(/\\left|\\right|\\,|\\;|\\!/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[·×]/g, '*')
    .replace(/[²]/g, '^2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `1; 2; 3`, `(1; 2; 3)`, `1 2 3`, `1/2; 0,5; -1`. */
export function parsePoint(src: string, name = 'Điểm'): Parsed<Vec3> {
  const text = clean(src).replace(/^[A-Za-z]\s*=?\s*/, '').replace(/^\(|\)$/g, '').trim()
  if (!text) return { ok: false, error: `${name} còn trống — nhập ba toạ độ, ví dụ 1; 2; 3.` }
  const parts = (text.includes(';') ? text.split(';') : text.split(' ')).map((s) => s.trim()).filter(Boolean)
  if (parts.length !== 3) {
    return { ok: false, error: `${name} phải có đúng ba toạ độ, cách nhau bằng dấu chấm phẩy: 1; 2; 3.` }
  }
  const nums = parts.map((s) => Frac.parse(s))
  const bad = nums.findIndex((v) => v === null)
  if (bad >= 0) return { ok: false, error: `${name}: “${parts[bad]}” không phải số. Dùng 3, -1, 1/2 hoặc 0,5.` }
  return { ok: true, value: new Vec3(nums[0]!, nums[1]!, nums[2]!) }
}

interface LinearTerms {
  x: Frac
  y: Frac
  z: Frac
  /** Hệ số của x², y², z² — bằng 0 với phương trình bậc nhất. */
  x2: Frac
  y2: Frac
  z2: Frac
  c: Frac
}

const ZERO_TERMS = (): LinearTerms => ({
  x: Frac.ZERO,
  y: Frac.ZERO,
  z: Frac.ZERO,
  x2: Frac.ZERO,
  y2: Frac.ZERO,
  z2: Frac.ZERO,
  c: Frac.ZERO,
})

/**
 * Đọc một vế của phương trình thành các hệ số. Không có dấu ngoặc: đề dạng
 * `2(x - 1) + ...` phải khai triển trước — công cụ nói rõ thay vì đoán.
 */
function parseSide(src: string): Parsed<LinearTerms> {
  const out = ZERO_TERMS()
  const text = src.replace(/\s/g, '')
  if (text.includes('(') || text.includes(')')) {
    return { ok: false, error: 'Khai triển hết dấu ngoặc rồi nhập lại, ví dụ x + 2y - 2z + 1 = 0.' }
  }
  if (!text) return { ok: true, value: out }
  const terms = text.match(/[+-]?[^+-]+/g)
  if (!terms) return { ok: false, error: 'Không đọc được phương trình.' }
  for (const raw of terms) {
    const m = /^([+-]?)(\d+(?:[.,]\d+)?(?:\/\d+)?)?\*?([xyz])?(\^2)?$/.exec(raw)
    if (!m) return { ok: false, error: `Không hiểu số hạng “${raw}”. Chỉ dùng x, y, z, số và dấu + −.` }
    const [, sign, num, variable, square] = m
    if (!num && !variable) return { ok: false, error: `Không hiểu số hạng “${raw}”.` }
    let k = num ? Frac.parse(num) : Frac.ONE
    if (!k) return { ok: false, error: `“${num}” không phải số.` }
    if (sign === '-') k = k.neg()
    if (!variable) out.c = out.c.add(k)
    else if (square) out[`${variable}2` as 'x2' | 'y2' | 'z2'] = out[`${variable}2` as 'x2' | 'y2' | 'z2'].add(k)
    else out[variable as 'x' | 'y' | 'z'] = out[variable as 'x' | 'y' | 'z'].add(k)
  }
  return { ok: true, value: out }
}

function parseEquation(src: string): Parsed<LinearTerms> {
  const sides = clean(src).split('=')
  if (sides.length > 2) return { ok: false, error: 'Phương trình chỉ được có một dấu “=”.' }
  const left = parseSide(sides[0])
  if (!left.ok) return left
  if (sides.length === 1) return left
  const right = parseSide(sides[1])
  if (!right.ok) return right
  const l = left.value
  const r = right.value
  return {
    ok: true,
    value: {
      x: l.x.sub(r.x),
      y: l.y.sub(r.y),
      z: l.z.sub(r.z),
      x2: l.x2.sub(r.x2),
      y2: l.y2.sub(r.y2),
      z2: l.z2.sub(r.z2),
      c: l.c.sub(r.c),
    },
  }
}

/** `x + 2y - 2z + 1 = 0`, hoặc bốn hệ số `1; 2; -2; 1`. */
export function parsePlane(src: string): Parsed<Plane> {
  const text = clean(src)
  if (!text) return { ok: false, error: 'Nhập phương trình mặt phẳng, ví dụ x + 2y - 2z + 1 = 0.' }
  if (!/[xyz]/.test(text)) {
    const parts = text.split(';').map((s) => s.trim()).filter(Boolean)
    if (parts.length !== 4) {
      return { ok: false, error: 'Nhập phương trình dạng x + 2y - 2z + 1 = 0, hoặc bốn hệ số a; b; c; d.' }
    }
    const nums = parts.map((s) => Frac.parse(s))
    if (nums.some((v) => v === null)) return { ok: false, error: 'Bốn hệ số phải là số, ví dụ 1; 2; -2; 1.' }
    const n = new Vec3(nums[0]!, nums[1]!, nums[2]!)
    if (n.isZero()) return { ok: false, error: 'Vectơ pháp tuyến bằng 0 — đây không phải mặt phẳng.' }
    return { ok: true, value: { n, d: nums[3]! } }
  }
  const eq = parseEquation(text)
  if (!eq.ok) return eq
  const t = eq.value
  if (!t.x2.isZero() || !t.y2.isZero() || !t.z2.isZero()) {
    return { ok: false, error: 'Phương trình mặt phẳng là bậc nhất — không có x², y², z².' }
  }
  const n = new Vec3(t.x, t.y, t.z)
  if (n.isZero()) {
    return { ok: false, error: 'Không có x, y, z nào trong phương trình — đây không phải mặt phẳng.' }
  }
  return { ok: true, value: { n, d: t.c } }
}

/**
 * Mặt cầu: hoặc phương trình `x^2 + y^2 + z^2 - 2x + 4y - 6z + 5 = 0`, hoặc
 * tâm và bán kính nhập riêng (`sphereFromCenterRadius`).
 */
export function parseSphereEquation(src: string): Parsed<Sphere> {
  const eq = parseEquation(clean(src))
  if (!eq.ok) return eq
  const t = eq.value
  if (t.x2.isZero() || !t.x2.eq(t.y2) || !t.x2.eq(t.z2)) {
    return {
      ok: false,
      error: 'Phương trình mặt cầu phải có x², y², z² với hệ số bằng nhau và khác 0.',
    }
  }
  // Chia cho hệ số chung rồi lấy I(−a/2; −b/2; −c/2), R² = |I|² − d.
  const k = t.x2
  const I = new Vec3(t.x.div(k).div(Frac.of(-2)), t.y.div(k).div(Frac.of(-2)), t.z.div(k).div(Frac.of(-2)))
  const r2 = I.norm2().sub(t.c.div(k))
  if (r2.sign() <= 0) {
    return { ok: false, error: 'Phương trình này không phải mặt cầu: bán kính bình phương ≤ 0.' }
  }
  return { ok: true, value: { I, r2 } }
}

export function sphereFromCenterRadius(I: Vec3, R: Frac): Parsed<Sphere> {
  if (R.sign() <= 0) return { ok: false, error: 'Bán kính phải là số dương.' }
  return { ok: true, value: { I, r2: R.mul(R) } }
}
