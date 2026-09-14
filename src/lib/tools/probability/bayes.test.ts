/**
 * Test xác suất có điều kiện / Bayes. Đáp án tính tay.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frac } from '../fraction.ts'
import { bayesSections, parseProbability, solveBayes, trueFalseItems, type BayesInput } from './bayes.ts'

function p(text: string): Frac {
  const r = parseProbability(text)
  assert.ok(r.ok, text)
  return r.value
}

const disease: BayesInput = { pA: p('1%'), pBgivenA: p('99%'), pBgivenNotA: p('1%') }
const factory: BayesInput = { pA: p('0,6'), pBgivenA: p('0,02'), pBgivenNotA: p('0,05') }

test('đọc xác suất: thập phân, phần trăm, phân số; chặn ngoài [0; 1]', () => {
  assert.equal(p('0,02').toPlain(), '1/50')
  assert.equal(p('2%').toPlain(), '1/50')
  assert.equal(p('1/50').toPlain(), '1/50')
  assert.equal(p('99,5 %').toPlain(), '199/200')
  assert.equal(parseProbability('1,2').ok, false)
  assert.equal(parseProbability('abc').ok, false)
})

test('xét nghiệm 99% với bệnh 1%: dương tính chỉ có 50% khả năng mắc bệnh', () => {
  const r = solveBayes(disease)
  assert.equal(r.pB.toPlain(), '99/5000') // 0,0198
  assert.equal(r.pAgivenB!.toPlain(), '1/2')
  assert.deepEqual(r.population, { size: 10000, AB: 99, AnotB: 1, notAB: 99, notAnotB: 9801, exact: true })
})

test('hai dây chuyền: toàn phần 0,032 và Bayes 3/8', () => {
  const r = solveBayes(factory)
  assert.equal(r.pAB.toPlain(), '3/250') // 0,012
  assert.equal(r.pB.toPlain(), '4/125') // 0,032
  assert.equal(r.pAgivenB!.toPlain(), '3/8')
  assert.equal(r.population.size, 1000)
  assert.equal(r.population.AB, 12)
})

test('P(B) = 0 thì không tính Bayes, lời giải nói rõ', () => {
  const r = solveBayes({ pA: p('0,5'), pBgivenA: p('0'), pBgivenNotA: p('0') })
  assert.equal(r.pAgivenB, null)
  const last = bayesSections({ pA: p('0,5'), pBgivenA: p('0'), pBgivenNotA: p('0') }, r).at(-1)!
  assert.match(last.lines[0], /không tính được/)
})

test('lời giải toàn phần và Bayes thay đúng số', () => {
  const r = solveBayes(factory)
  const text = bayesSections(factory, r)
    .map((s) => s.lines.join(' '))
    .join(' ')
  assert.match(text, /= 0\{,\}\{012\} \+ 0\{,\}\{02\} = 0\{,\}\{032\}/)
  assert.match(text, /\\dfrac\{0\{,\}\{012\}\}\{0\{,\}\{032\}\} = 0\{,\}\{375\}/)
  assert.match(text, /37,5%/)
})

test('câu đúng/sai: mệnh đề sai dựng từ lỗi thật, lời giải thích đúng', () => {
  for (const input of [disease, factory]) {
    const r = solveBayes(input)
    const items = trueFalseItems(input, r)
    assert.equal(items.length, 4)
    for (const it of items) {
      if (it.correct) assert.match(it.explain, /^Đúng/)
      else assert.match(it.explain, /^Sai\..*Đúng phải là/)
    }
    // Cùng dữ liệu → cùng bộ câu.
    assert.deepEqual(trueFalseItems(input, r), items)
  }
})

test('không bao giờ dựng mệnh đề "sai" mà số lại trùng số đúng', () => {
  // P(B|A) = P(B) khi P(B|A) = P(B|Ā): mệnh đề B không được đánh dấu sai.
  const same: BayesInput = { pA: p('0,3'), pBgivenA: p('0,4'), pBgivenNotA: p('0,4') }
  const r = solveBayes(same)
  const b = trueFalseItems(same, r).find((x) => x.key === 'B')!
  assert.equal(b.correct, true)
})
