/**
 * Mẫu số liệu ghép nhóm — logic thuần, có test.
 *
 * Công thức theo SGK Kết nối tri thức:
 *  - Toán 11, Bài 9 (số đặc trưng đo xu thế trung tâm): số trung bình, trung
 *    vị, tứ phân vị, mốt.
 *  - Toán 12, Bài 9–10 (đo mức độ phân tán): khoảng biến thiên, khoảng tứ phân
 *    vị, phương sai (chia cho n), độ lệch chuẩn.
 *
 * Nhóm viết [aᵢ; aᵢ₊₁), tần số mᵢ, cỡ mẫu n = m₁ + … + mₖ, giá trị đại diện
 * xᵢ = (aᵢ + aᵢ₊₁)/2.
 *
 * Mọi số là phân số chính xác. Chỉ ở bước hiển thị mới làm tròn, và luôn ghi
 * "≈" khi có làm tròn — SGK viết "Me = 26" nhưng "Q₃ ≈ 34,29".
 */

import { decimalTex, Frac } from '../fraction.ts'

export interface GroupRow {
  lo: Frac
  hi: Frac
  freq: number
}

export interface RawRow {
  lo: string
  hi: string
  freq: string
}

export type GroupsResult = { ok: true; rows: GroupRow[] } | { ok: false; error: string; row?: number }

/** Kiểm tra bảng học sinh nhập: số hợp lệ, nhóm tăng dần và LIỀN NHAU, tần số nguyên không âm. */
export function validateGroups(raw: RawRow[]): GroupsResult {
  const rows: GroupRow[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    if (!r.lo.trim() && !r.hi.trim() && !r.freq.trim()) continue
    const lo = Frac.parse(r.lo)
    const hi = Frac.parse(r.hi)
    if (!lo || !hi) return { ok: false, error: `Nhóm ${i + 1}: đầu mút phải là số.`, row: i }
    if (lo.cmp(hi) >= 0) return { ok: false, error: `Nhóm ${i + 1}: đầu mút trái phải nhỏ hơn đầu mút phải.`, row: i }
    const f = Frac.parse(r.freq)
    if (!f || !f.isInteger() || f.sign() < 0) {
      return { ok: false, error: `Nhóm ${i + 1}: tần số phải là số nguyên không âm.`, row: i }
    }
    rows.push({ lo, hi, freq: Number(f.n) })
  }
  if (rows.length === 0) return { ok: false, error: 'Chưa có nhóm nào.' }
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].lo.eq(rows[i - 1].hi)) {
      return {
        ok: false,
        error: `Nhóm ${i} kết thúc ở ${rows[i - 1].hi.toDecimal(4).text} nhưng nhóm ${i + 1} bắt đầu ở ${rows[i].lo.toDecimal(4).text} — các nhóm phải liền nhau.`,
        row: i,
      }
    }
  }
  if (rows.every((r) => r.freq === 0)) return { ok: false, error: 'Tổng tần số bằng 0 — chưa có số liệu.' }
  return { ok: true, rows }
}

/**
 * Đọc bảng dán từ Word/đề: một dòng các nhóm `[15; 20) [20; 25) …` và một dòng
 * tần số `7 12 5 …` (hoặc lẫn cùng một dòng). Trả null nếu không ghép được.
 */
export function parsePastedTable(text: string): RawRow[] | null {
  const intervalRe = /[[(]\s*(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)\s*[)\]]/g
  const intervals: [string, string][] = []
  const rest = text.replace(intervalRe, (_, a: string, b: string) => {
    intervals.push([a, b])
    return ' '
  })
  if (intervals.length === 0) return null
  const freqs = rest.match(/\b\d+\b/g) ?? []
  if (freqs.length !== intervals.length) return null
  return intervals.map(([lo, hi], i) => ({ lo, hi, freq: freqs[i] }))
}

// ─── Tính ───────────────────────────────────────────────────────────────────

export interface Located {
  /** Nhóm thứ p (0-based). */
  index: number
  lo: Frac
  h: Frac
  /** m₁ + … + m_{p−1} */
  before: number
  freq: number
  /** Vị trí cần tìm: n/2, n/4 hoặc 3n/4. */
  target: Frac
  value: Frac
}

export interface ModeInfo {
  index: number
  lo: Frac
  h: Frac
  mPrev: number
  m: number
  mNext: number
  value: Frac
}

export interface GroupedStats {
  rows: GroupRow[]
  n: number
  mids: Frac[]
  cumulative: number[]
  sumMx: Frac
  mean: Frac
  median: Located
  q1: Located
  q3: Located
  /** Mọi nhóm có tần số lớn nhất (SGK thường chỉ có một). */
  modes: ModeInfo[]
  range: { lo: Frac; hi: Frac; value: Frac }
  iqr: Frac
  sumMx2: Frac
  variance: Frac
  /** Căn bậc hai: chính xác nếu phương sai là bình phương của một phân số. */
  sd: { exact: Frac | null; approx: number }
  equalWidth: boolean
}

/** Nhóm p sao cho m₁+…+m_{p−1} < target ≤ m₁+…+m_p, rồi nội suy tuyến tính. */
export function locate(rows: GroupRow[], cumulative: number[], target: Frac): Located {
  let p = 0
  while (p < rows.length - 1 && Frac.of(cumulative[p]).cmp(target) < 0) p++
  const before = p === 0 ? 0 : cumulative[p - 1]
  const { lo, hi, freq } = rows[p]
  const h = hi.sub(lo)
  const value = lo.add(target.sub(Frac.of(before)).div(Frac.of(freq)).mul(h))
  return { index: p, lo, h, before, freq, target, value }
}

function isqrt(v: bigint): bigint | null {
  if (v < BigInt(0)) return null
  if (v < BigInt(2)) return v
  let x = BigInt(Math.floor(Math.sqrt(Number(v))))
  while (x * x > v) x -= BigInt(1)
  while ((x + BigInt(1)) * (x + BigInt(1)) <= v) x += BigInt(1)
  return x * x === v ? x : null
}

export function computeGrouped(rows: GroupRow[]): GroupedStats {
  const n = rows.reduce((s, r) => s + r.freq, 0)
  const N = Frac.of(n)
  const mids = rows.map((r) => r.lo.add(r.hi).div(Frac.of(2)))
  const cumulative: number[] = []
  rows.reduce((s, r) => {
    cumulative.push(s + r.freq)
    return s + r.freq
  }, 0)

  const sumMx = rows.reduce((s, r, i) => s.add(mids[i].mul(Frac.of(r.freq))), Frac.ZERO)
  const mean = sumMx.div(N)

  const median = locate(rows, cumulative, N.div(Frac.of(2)))
  const q1 = locate(rows, cumulative, N.div(Frac.of(4)))
  const q3 = locate(rows, cumulative, N.mul(Frac.of(3)).div(Frac.of(4)))

  const maxFreq = Math.max(...rows.map((r) => r.freq))
  const modes: ModeInfo[] = rows.flatMap((r, j) => {
    if (r.freq !== maxFreq) return []
    const mPrev = j > 0 ? rows[j - 1].freq : 0
    const mNext = j < rows.length - 1 ? rows[j + 1].freq : 0
    const h = r.hi.sub(r.lo)
    const den = 2 * r.freq - mPrev - mNext
    // Mẫu bằng 0 chỉ khi hai nhóm kề cũng có tần số lớn nhất: công thức không
    // xác định, lấy trung điểm nhóm và để lời giải nói rõ.
    const value = den === 0 ? mids[j] : r.lo.add(Frac.of(r.freq - mPrev, den).mul(h))
    return [{ index: j, lo: r.lo, h, mPrev, m: r.freq, mNext, value }]
  })

  // Khoảng biến thiên: từ đầu mút trái của nhóm ĐẦU TIÊN có dữ liệu tới đầu mút
  // phải của nhóm CUỐI CÙNG có dữ liệu — nhóm tần số 0 ở hai đầu không tính.
  const first = rows.findIndex((r) => r.freq > 0)
  let last = rows.length - 1
  while (rows[last].freq === 0) last--
  const range = { lo: rows[first].lo, hi: rows[last].hi, value: rows[last].hi.sub(rows[first].lo) }

  const sumMx2 = rows.reduce((s, r, i) => s.add(mids[i].mul(mids[i]).mul(Frac.of(r.freq))), Frac.ZERO)
  const variance = sumMx2.div(N).sub(mean.mul(mean))

  const rn = isqrt(variance.n)
  const rd = isqrt(variance.d)
  const exact = rn !== null && rd !== null ? Frac.of(rn, rd) : null

  const w0 = rows[0].hi.sub(rows[0].lo)
  return {
    rows,
    n,
    mids,
    cumulative,
    sumMx,
    mean,
    median,
    q1,
    q3,
    modes,
    range,
    iqr: q3.value.sub(q1.value),
    sumMx2,
    variance,
    sd: { exact, approx: Math.sqrt(variance.toNumber()) },
    equalWidth: rows.every((r) => r.hi.sub(r.lo).eq(w0)),
  }
}

// ─── Trình bày ──────────────────────────────────────────────────────────────

/** Số thập phân hữu hạn thì viết kiểu 17{,}{5} (xem `decimalTex`); còn lại viết phân số. */
export function numTex(f: Frac): string {
  const d = f.toDecimal(6)
  if (d.exact) return decimalTex(d.text)
  return f.toTex()
}

export function intervalTex(lo: Frac, hi: Frac): string {
  return `[${numTex(lo)};\\, ${numTex(hi)})`
}

/** Kết quả cuối: `= 26`, hoặc `= 21{,}{25}`, hoặc `= \frac{240}{7} \approx 34{,}{29}`. */
export function resultTex(f: Frac): string {
  if (f.isInteger()) return `= ${f.toTex()}`
  const d = f.toDecimal(2)
  if (d.exact) return `= ${numTex(f)}`
  return `= ${f.toTex()} ${f.approxTex(2)}`
}

export interface StatSection {
  key: 'mean' | 'median' | 'q1' | 'q3' | 'mode' | 'spread' | 'variance'
  title: string
  lines: string[]
  /** Nhóm được tô sáng trên biểu đồ. */
  groups: number[]
  /** Vạch dọc tại giá trị vừa tính. */
  marker: { label: string; value: Frac } | null
}

function locateLines(s: GroupedStats, L: Located, name: string, targetTex: string): string[] {
  const cum = s.cumulative.join(';\\ ')
  const p = L.index + 1
  const cond =
    L.index === 0
      ? `$${numTex(L.target)} \\le ${s.cumulative[0]}$`
      : `$${s.cumulative[L.index - 1]} < ${numTex(L.target)} \\le ${s.cumulative[L.index]}$`
  return [
    `Cỡ mẫu $n = ${s.n}$ nên $${targetTex} = ${numTex(L.target)}$. Tần số tích luỹ: $${cum}$.`,
    `Nhóm chứa $${name}$ là nhóm thứ $${p}$: $${intervalTex(L.lo, L.lo.add(L.h))}$, vì ${cond}.`,
    `$$${name} = a_{${p}} + \\dfrac{${targetTex} - (m_1 + \\dots + m_{${p - 1}})}{m_{${p}}} \\cdot h = ${numTex(L.lo)} + \\dfrac{${numTex(L.target)} - ${L.before}}{${L.freq}} \\cdot ${numTex(L.h)} ${resultTex(L.value)}$$`,
  ]
}

export function groupedSections(s: GroupedStats): StatSection[] {
  const k = s.rows.length
  const meanTerms = s.rows.map((r, i) => `${r.freq} \\cdot ${numTex(s.mids[i])}`).join(' + ')
  const sections: StatSection[] = []

  sections.push({
    key: 'mean',
    title: 'Số trung bình',
    lines: [
      `Giá trị đại diện của mỗi nhóm là trung điểm: $x_i = \\dfrac{a_i + a_{i+1}}{2}$ — lần lượt $${s.mids.map(numTex).join(';\\ ')}$.`,
      `$$\\bar{x} = \\dfrac{m_1 x_1 + \\dots + m_{${k}} x_{${k}}}{n} = \\dfrac{${meanTerms}}{${s.n}} = \\dfrac{${numTex(s.sumMx)}}{${s.n}} ${resultTex(s.mean)}$$`,
    ],
    groups: [],
    marker: { label: 'x̄', value: s.mean },
  })

  sections.push({
    key: 'median',
    title: 'Trung vị',
    lines: locateLines(s, s.median, 'M_e', '\\frac{n}{2}'),
    groups: [s.median.index],
    marker: { label: 'Me', value: s.median.value },
  })
  sections.push({
    key: 'q1',
    title: 'Tứ phân vị thứ nhất',
    lines: [...locateLines(s, s.q1, 'Q_1', '\\frac{n}{4}'), 'Tứ phân vị thứ hai $Q_2$ chính là trung vị $M_e$.'],
    groups: [s.q1.index],
    marker: { label: 'Q₁', value: s.q1.value },
  })
  sections.push({
    key: 'q3',
    title: 'Tứ phân vị thứ ba',
    lines: locateLines(s, s.q3, 'Q_3', '\\frac{3n}{4}'),
    groups: [s.q3.index],
    marker: { label: 'Q₃', value: s.q3.value },
  })

  const modeLines: string[] = []
  if (s.modes.length > 1) {
    modeLines.push(
      `Có ${s.modes.length} nhóm cùng tần số lớn nhất $${s.modes[0].m}$ — tính mốt cho từng nhóm (SGK thường cho mẫu chỉ một nhóm như vậy).`,
    )
  }
  for (const m of s.modes) {
    const j = m.index + 1
    modeLines.push(
      `Nhóm có tần số lớn nhất là nhóm thứ $${j}$: $${intervalTex(m.lo, m.lo.add(m.h))}$ với $m_{${j}} = ${m.m}$, $m_{${j - 1}} = ${m.mPrev}$, $m_{${j + 1}} = ${m.mNext}$${
        m.index === 0 || m.index === k - 1 ? ' (quy ước $m_0 = m_{k+1} = 0$)' : ''
      }.`,
    )
    if (2 * m.m - m.mPrev - m.mNext === 0) {
      modeLines.push('Hai nhóm kề cũng có tần số lớn nhất nên công thức không xác định; lấy trung điểm nhóm làm giá trị tham khảo.')
    } else {
      modeLines.push(
        `$$M_o = a_{${j}} + \\dfrac{m_{${j}} - m_{${j - 1}}}{(m_{${j}} - m_{${j - 1}}) + (m_{${j}} - m_{${j + 1}})} \\cdot h = ${numTex(m.lo)} + \\dfrac{${m.m} - ${m.mPrev}}{(${m.m} - ${m.mPrev}) + (${m.m} - ${m.mNext})} \\cdot ${numTex(m.h)} ${resultTex(m.value)}$$`,
      )
    }
  }
  if (!s.equalWidth) modeLines.push('Lưu ý: các nhóm không cùng độ dài; công thức mốt ở SGK dùng cho các nhóm có cùng độ dài $h$.')
  sections.push({
    key: 'mode',
    title: 'Mốt',
    lines: modeLines,
    groups: s.modes.map((m) => m.index),
    marker: s.modes.length === 1 ? { label: 'Mo', value: s.modes[0].value } : null,
  })

  sections.push({
    key: 'spread',
    title: 'Khoảng biến thiên và khoảng tứ phân vị',
    lines: [
      `Khoảng biến thiên: $R = ${numTex(s.range.hi)} - ${numTex(s.range.lo)} = ${numTex(s.range.value)}$ (đầu mút phải của nhóm cuối có số liệu trừ đầu mút trái của nhóm đầu có số liệu).`,
      `Khoảng tứ phân vị: $\\Delta_Q = Q_3 - Q_1 ${resultTex(s.iqr)}$.`,
      'Khoảng tứ phân vị chỉ phụ thuộc nửa giữa của mẫu nên ít bị ảnh hưởng bởi giá trị bất thường.',
    ],
    groups: [],
    marker: null,
  })

  // 17,5² viết (17{,}{5})^2: không có ngoặc thì số mũ trông như chỉ gắn vào chữ số cuối.
  const sq = (f: Frac) => (f.isInteger() ? `${numTex(f)}^2` : `(${numTex(f)})^2`)
  const sqTerms = s.rows.map((r, i) => `${r.freq} \\cdot ${sq(s.mids[i])}`).join(' + ')
  const sdTex = s.sd.exact
    ? `s = \\sqrt{s^2} = ${numTex(s.sd.exact)}`
    : `s = \\sqrt{${numTex(s.variance)}} \\approx ${decimalTex(s.sd.approx.toFixed(2).replace('.', ','))}`
  sections.push({
    key: 'variance',
    title: 'Phương sai và độ lệch chuẩn',
    lines: [
      `$$s^2 = \\dfrac{1}{n}\\left(m_1 x_1^2 + \\dots + m_{${k}} x_{${k}}^2\\right) - \\bar{x}^2 = \\dfrac{1}{${s.n}}\\left(${sqTerms}\\right) - \\left(${numTex(s.mean)}\\right)^2 ${resultTex(s.variance)}$$`,
      `Độ lệch chuẩn là căn bậc hai số học của phương sai: $${sdTex}$.`,
    ],
    groups: [],
    marker: null,
  })

  return sections
}
