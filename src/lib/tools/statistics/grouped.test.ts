/**
 * Test mẫu số liệu ghép nhóm. Hai bảng đầu là ví dụ trong SGK Toán 11 Kết nối
 * tri thức (Bài 9) — kết quả SGK công bố được dùng làm đáp án. Các đại lượng SGK
 * không công bố (số trung bình, phương sai) đã tính tay lại.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decimalTex, Frac } from '../fraction.ts'
import { computeGrouped, groupedSections, parsePastedTable, validateGroups, type RawRow } from './grouped.ts'

function table(start: number, width: number, freqs: number[]): RawRow[] {
  return freqs.map((f, i) => ({ lo: String(start + i * width), hi: String(start + (i + 1) * width), freq: String(f) }))
}

function stats(rows: RawRow[]) {
  const v = validateGroups(rows)
  assert.ok(v.ok, v.ok ? '' : v.error)
  return computeGrouped(v.rows)
}

const dec = (f: Frac, d = 2) => f.toDecimal(d).text

test('số thập phân kiểu Việt Nam và cờ làm tròn', () => {
  assert.deepEqual(Frac.of(85, 4).toDecimal(2), { text: '21,25', exact: true })
  assert.deepEqual(Frac.of(240, 7).toDecimal(2), { text: '34,29', exact: false })
  assert.deepEqual(Frac.of(26).toDecimal(2), { text: '26', exact: true })
  assert.equal(Frac.of(-1, 3).toDecimal(2).text, '−0,33')
  assert.equal(Frac.of(265, 12).approxTex(2), '\\approx 22{,}{08}')
})

test('số thập phân vào TeX phải bọc phần sau dấu phẩy — MathJax coi {,} + ba chữ số là phân cách hàng nghìn', () => {
  assert.equal(decimalTex('0,0099'), '0{,}{0099}')
  assert.equal(decimalTex('−1,5'), '-1{,}{5}')
  assert.equal(decimalTex('26'), '26')
})

test('SGK Toán 11 KNTT — thời gian đến trường của 40 học sinh', () => {
  const s = stats(table(15, 5, [7, 12, 5, 7, 3, 5, 1]))
  assert.equal(s.n, 40)
  assert.equal(dec(s.median.value), '26')
  assert.equal(s.median.index, 2)
  assert.equal(dec(s.q1.value), '21,25')
  assert.equal(dec(s.q3.value), '34,29')
  assert.equal(s.modes.length, 1)
  assert.equal(dec(s.modes[0].value), '22,08')
  // Tính tay: Σ m·x = 1130; Σ m·x² = 34900.
  assert.equal(s.mean.toPlain(), '113/4')
  assert.equal(s.variance.toPlain(), '1191/16')
  assert.equal(s.sd.exact, null)
  assert.equal(s.sd.approx.toFixed(2), '8.63')
  assert.equal(s.range.value.toPlain(), '35')
})

test('SGK Toán 11 KNTT — cân nặng của 45 học sinh (SGK làm tròn một chữ số)', () => {
  const s = stats(table(40, 5, [7, 10, 20, 6, 2]))
  assert.equal(dec(s.median.value, 1), '51,4')
  assert.equal(dec(s.q1.value, 1), '47,1')
  assert.equal(dec(s.q3.value, 1), '54,2')
  assert.equal(dec(s.modes[0].value, 1), '52,1')
})

test('SGK Toán 12 KNTT — chiều cao 40 cây: phương sai chia cho n', () => {
  const s = stats(table(30, 10, [4, 10, 14, 6, 4, 2]))
  assert.equal(s.mean.toPlain(), '111/2')
  // Σ m·x² = 129800 → 129800/40 − 55,5² = 164,75
  assert.equal(dec(s.variance), '164,75')
})

test('độ lệch chuẩn viết chính xác khi phương sai là bình phương', () => {
  const s = stats(table(0, 2, [1, 1]))
  assert.equal(s.variance.toPlain(), '1')
  assert.equal(s.sd.exact!.toPlain(), '1')
})

test('khoảng biến thiên bỏ nhóm tần số 0 ở hai đầu', () => {
  const s = stats(table(0, 10, [0, 3, 5, 0, 2, 0]))
  assert.equal(s.range.lo.toPlain(), '10')
  assert.equal(s.range.hi.toPlain(), '50')
})

test('nhóm chứa trung vị: tích luỹ trước < n/2 ≤ tích luỹ tới nhóm đó', () => {
  // n = 20, n/2 = 10 đúng bằng tích luỹ của nhóm 2 → nhóm 2, KHÔNG phải nhóm 3.
  const s = stats(table(0, 10, [4, 6, 6, 4]))
  assert.equal(s.median.index, 1)
  assert.equal(s.median.value.toPlain(), '20')
})

test('từ chối bảng sai, nói rõ nhóm nào', () => {
  const gap = validateGroups([
    { lo: '0', hi: '5', freq: '3' },
    { lo: '6', hi: '10', freq: '2' },
  ])
  assert.equal(gap.ok, false)
  if (!gap.ok) assert.match(gap.error, /liền nhau/)
  const neg = validateGroups([{ lo: '0', hi: '5', freq: '-1' }])
  assert.equal(neg.ok, false)
  const flipped = validateGroups([{ lo: '5', hi: '0', freq: '1' }])
  assert.equal(flipped.ok, false)
  if (!flipped.ok) assert.match(flipped.error, /nhỏ hơn/)
})

test('dán bảng từ đề: dòng nhóm và dòng tần số', () => {
  const rows = parsePastedTable('Thời gian [15; 20) [20; 25) [25;30)\nSố học sinh 7 12 5')
  assert.deepEqual(rows, [
    { lo: '15', hi: '20', freq: '7' },
    { lo: '20', hi: '25', freq: '12' },
    { lo: '25', hi: '30', freq: '5' },
  ])
  assert.equal(parsePastedTable('[0;1) [1;2) 5'), null)
})

test('lời giải trung vị nêu nhóm, điều kiện tích luỹ và công thức thay số', () => {
  const s = stats(table(15, 5, [7, 12, 5, 7, 3, 5, 1]))
  const median = groupedSections(s).find((x) => x.key === 'median')!
  const text = median.lines.join(' ')
  assert.match(text, /19 < 20 \\le 24/)
  assert.match(text, /\[25;\\, 30\)/)
  assert.match(text, /25 \+ \\dfrac\{20 - 19\}\{5\} \\cdot 5 = 26/)
  const q3 = groupedSections(s).find((x) => x.key === 'q3')!
  assert.match(q3.lines.join(' '), /\\frac\{240\}\{7\} \\approx 34\{,\}\{29\}/)
})
