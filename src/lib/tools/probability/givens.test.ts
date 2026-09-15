/**
 * Test "đề cho gì cũng được". Mỗi bộ dữ kiện là một kiểu đề thật; đáp án tính tay.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frac } from '../fraction.ts'
import { parseProbability } from './bayes.ts'
import { analyzeGivens, solveFromGivens, type Key } from './givens.ts'

function g(obj: Partial<Record<Key, string>>): Partial<Record<Key, Frac>> {
  const out: Partial<Record<Key, Frac>> = {}
  for (const [k, v] of Object.entries(obj) as [Key, string][]) {
    const r = parseProbability(v)
    assert.ok(r.ok, v)
    out[k] = r.value
  }
  return out
}

function ok(obj: Partial<Record<Key, string>>) {
  const r = solveFromGivens(g(obj))
  assert.equal(r.status, 'ok', r.status === 'contradiction' || r.status === 'degenerate' ? r.reason : r.status)
  return r as Extract<typeof r, { status: 'ok' }>
}

const text = (r: ReturnType<typeof ok>) => r.sections.flatMap((s) => s.lines).join('\n')

test('bộ ba SGK P(A), P(B|A), P(B|Ā): giữ lời giải bốn phần', () => {
  const r = ok({ A: '0,6', 'B|A': '0,02', 'B|nA': '0,05' })
  assert.deepEqual(
    r.sections.map((s) => s.key),
    ['complement', 'multiply', 'total', 'bayes'],
  )
  assert.equal(r.values['A|B']!.toPlain(), '3/8')
})

test('đề cho P(A), P(B), P(A ∩ B): định nghĩa có điều kiện', () => {
  // P(B|A) = 0,15/0,4 = 0,375; P(Ā∩B) = 0,35 − 0,15 = 0,2; P(B|Ā) = 0,2/0,6 = 1/3; P(A|B) = 0,15/0,35 = 3/7.
  const r = ok({ A: '0,4', B: '0,35', AB: '0,15' })
  assert.equal(r.input.pBgivenA.toPlain(), '3/8')
  assert.equal(r.input.pBgivenNotA.toPlain(), '1/3')
  assert.equal(r.values['A|B']!.toPlain(), '3/7')
  const t = text(r)
  assert.match(t, /\*\*Định nghĩa xác suất có điều kiện:\*\* \$P\(B \\mid A\) = \\dfrac\{P\(A \\cap B\)\}\{P\(A\)\}/)
  assert.match(t, /P\(\\overline\{A\} \\cap B\) = P\(B\) - P\(A \\cap B\)/)
  assert.doesNotMatch(t, /hệ/)
})

test('đề cho P(B) và hai nhánh, hỏi ngược P(A)', () => {
  // 0,032 = 0,02·P(A) + 0,05·(1 − P(A)) ⇒ P(A) = (0,032 − 0,05)/(0,02 − 0,05) = 0,6.
  const r = ok({ B: '0,032', 'B|A': '0,02', 'B|nA': '0,05' })
  assert.equal(r.input.pA.toPlain(), '3/5')
  assert.match(text(r), /Giải ngược công thức toàn phần/)
})

test('đề cho P(A ∪ B)', () => {
  // P(A∩B) = 0,4 + 0,5 − 0,7 = 0,2.
  const r = ok({ AuB: '0,7', A: '0,4', B: '0,5' })
  assert.equal(r.values.AB!.toPlain(), '1/5')
  assert.match(text(r), /Công thức cộng/)
})

test('không nối được bằng từng công thức: nói thẳng là giải hệ, nghiệm đúng', () => {
  // x = P(A∩B): P(A) = 4x, P(B) = 2x, P(A∪B) = 4x + 2x − x = 5x = 0,7 ⇒ x = 0,14.
  const r = ok({ 'A|B': '0,5', 'B|A': '0,25', AuB: '0,7' })
  assert.equal(r.input.pA.toPlain(), '14/25') // 0,56
  assert.equal(r.values.B!.toPlain(), '7/25') // 0,28
  assert.match(text(r), /Giải hệ được/)
})

test('chưa đủ dữ kiện: đếm số còn thiếu và cho các ô đã suy ra được', () => {
  const a = analyzeGivens(g({ A: '0,3' }))
  assert.equal(a.status, 'under')
  assert.ok(a.status === 'under')
  assert.equal(a.missing, 2)
  assert.equal(a.known.nA!.toPlain(), '7/10')
  assert.equal(a.known.B, undefined)

  const b = analyzeGivens(g({ A: '0,3', 'B|A': '0,5' }))
  assert.ok(b.status === 'under')
  assert.equal(b.missing, 1)
  assert.equal(b.known.AB!.toPlain(), '3/20')
  assert.equal(analyzeGivens({}).status, 'empty')
})

test('mâu thuẫn: cộng không ra 1, xác suất âm, có điều kiện trên biến cố xác suất 0', () => {
  assert.equal(analyzeGivens(g({ A: '0,3', nA: '0,6' })).status, 'contradiction')
  // P(A∩B̄) = 0,2 − 0,3 < 0 dù hệ còn thiếu dữ kiện.
  assert.equal(analyzeGivens(g({ A: '0,2', AB: '0,3' })).status, 'contradiction')
  const z = analyzeGivens(g({ A: '0', 'B|A': '0,5', B: '0,3', 'B|nA': '0,3' }))
  assert.equal(z.status, 'contradiction')
  assert.ok(z.status === 'contradiction')
  assert.match(z.reason, /không xác định/)
})

test('P(A) = 0 hoặc 1 thì không dựng được cây', () => {
  assert.equal(solveFromGivens(g({ A: '1', B: '0,4', AB: '0,4' })).status, 'degenerate')
})
