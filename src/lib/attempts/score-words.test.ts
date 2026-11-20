import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreInWords } from './score-words.ts'

test('điểm tròn đọc không kèm "phẩy không"', () => {
  assert.equal(scoreInWords(8), 'Tám')
  assert.equal(scoreInWords(0), 'Không')
  assert.equal(scoreInWords(10), 'Mười')
})

test('điểm lẻ đọc "phẩy", sau "phẩy" là "năm" chứ không phải "lăm"', () => {
  assert.equal(scoreInWords(7.5), 'Bảy phẩy năm')
  assert.equal(scoreInWords(4.1), 'Bốn phẩy một')
  assert.equal(scoreInWords(0.4), 'Không phẩy bốn')
})

test('đọc đúng chuỗi mà toFixed(1) hiện ra, không làm tròn theo cách riêng', () => {
  // 6,25 hiện "6.3" thì chữ phải là sáu phẩy ba.
  assert.equal((6.25).toFixed(1), '6.3')
  assert.equal(scoreInWords(6.25), 'Sáu phẩy ba')
  // 9,96 hiện "10.0".
  assert.equal(scoreInWords(9.96), 'Mười')
  // 9,95 lưu nhị phân hơi dưới 9,95 nên hiện "9.9".
  assert.equal(scoreInWords(9.95), `${scoreInWords(Number((9.95).toFixed(1)))}`)
})

test('ngoài thang 0–10 hoặc không phải số thì không đọc', () => {
  assert.equal(scoreInWords(null), null)
  assert.equal(scoreInWords(undefined), null)
  assert.equal(scoreInWords(Number.NaN), null)
  assert.equal(scoreInWords(Number.POSITIVE_INFINITY), null)
  assert.equal(scoreInWords(-0.5), null)
  assert.equal(scoreInWords(10.5), null)
  assert.equal(scoreInWords(11), null)
})
