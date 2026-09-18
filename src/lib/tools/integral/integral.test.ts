/**
 * Test công cụ tích phân. Mọi đáp án tính tay trước, ghi lại phép tính ngay cạnh
 * assert để người sửa sau kiểm được mà không cần chạy code.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePolynomial } from '../expression.ts'
import { Frac } from '../fraction.ts'
import { Poly } from '../poly.ts'
import { Surd } from '../surd.ts'
import { analyzeIntegral, type IntegralAnalysis, type IntegralSetup } from './analyze.ts'
import { antiderivative, integrate, riemannSum, splitBySign } from './integrate.ts'
import { buildIntegralSteps } from './steps.ts'

function poly(src: string, variable = 'x'): Poly {
  const r = parsePolynomial(src, variable)
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.poly
}

function analyze(setup: Partial<IntegralSetup> & { f: Poly }): IntegralAnalysis {
  const r = analyzeIntegral({ kind: 'area', g: null, a: null, b: null, n: 4, rkind: 'left', ...setup })
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.analysis
}

const S = (n: number) => Surd.int(n)
const allText = (a: IntegralAnalysis) =>
  buildIntegralSteps(a)
    .flatMap((s) => [s.title, ...s.lines])
    .join('\n')

// ── Nguyên hàm và tích phân xác định ────────────────────────────────────────

test('nguyên hàm và Newton – Leibniz cho kết quả phân số chính xác', () => {
  // ∫x² dx = x³/3.
  assert.equal(antiderivative(poly('x^2')).toTex(), '\\frac{1}{3}x^3')
  // ∫₀¹ x² dx = 1/3 — không phải 0,3333.
  assert.equal(integrate(poly('x^2'), S(0), S(1)).toTex(), '\\frac{1}{3}')
  // ∫₀² (x³ − 3x² + 2) dx: F(2) = 4 − 8 + 4 = 0, F(0) = 0.
  assert.ok(integrate(poly('x^3 - 3x^2 + 2'), S(0), S(2)).isZero(), 'phần trên và phần dưới trục bù trừ hết')
  // Hệ số phân số: ∫₀¹ (x/2) dx = 1/4.
  assert.equal(integrate(poly('0,5x'), S(0), S(1)).toTex(), '\\frac{1}{4}')
})

test('splitBySign tách đúng chỗ đổi dấu và gộp khúc cùng dấu', () => {
  // x³ − 3x² + 2 = (x − 1)(x² − 2x − 2); trong [0; 2] chỉ có nghiệm x = 1.
  const pieces = splitBySign(poly('x^3 - 3x^2 + 2'), S(0), S(2))
  assert.equal(pieces.length, 2)
  assert.deepEqual(pieces.map((p) => p.sign), [1, -1])
  // ∫₀¹ = 1/4 − 1 + 2 = 5/4; ∫₁² = 0 − 5/4 = −5/4.
  assert.equal(pieces[0].signed.toTex(), '\\frac{5}{4}')
  assert.equal(pieces[1].signed.toTex(), '-\\frac{5}{4}')
  assert.equal(pieces[1].area.toTex(), '\\frac{5}{4}')

  // (x − 1)² ≥ 0: chạm trục tại x = 1 nhưng KHÔNG đổi dấu → chỉ một khúc.
  const touch = splitBySign(poly('(x-1)^2'), S(0), S(3))
  assert.equal(touch.length, 1)
  assert.equal(touch[0].sign, 1)
})

// ── Bài diện tích hình phẳng ────────────────────────────────────────────────

test('diện tích giữa parabol và trục hoành: tách khúc, không trừ bớt nhau', () => {
  const a = analyze({ kind: 'area', f: poly('x^3 - 3x^2 + 2'), a: Frac.of(0), b: Frac.of(2) })
  // Tích phân bằng 0 nhưng diện tích bằng 5/4 + 5/4.
  assert.ok(a.signed.isZero())
  assert.equal(a.total.toTex(), '\\frac{5}{2}')
  assert.equal(a.changesSign, true)

  const text = allText(a)
  assert.match(text, /trị tuyệt đối/)
  // Cái bẫy phải được nói thành lời, không chỉ ra số đúng.
  assert.match(text, /\*\*sai\*\*/)
})

test('diện tích giữa hai đồ thị: cận lấy từ hoành độ giao điểm', () => {
  // y = x² và y = 2 − x² cắt nhau tại x = ±1; S = ∫₋₁¹ (2 − 2x²) dx = 8/3.
  const a = analyze({ kind: 'area', f: poly('x^2'), g: poly('2 - x^2') })
  assert.equal(a.autoBounds, true)
  assert.equal(a.from.toTex(), '-1')
  assert.equal(a.to.toTex(), '1')
  assert.equal(a.pieces.length, 1)
  assert.equal(a.pieces[0].sign, -1, 'x² nằm DƯỚI 2 − x² trên khoảng đó')
  assert.equal(a.total.toTex(), '\\frac{8}{3}')

  // y = x³ và y = x cắt nhau tại −1, 0, 1: hai khúc đối xứng, mỗi khúc 1/4.
  const b = analyze({ kind: 'area', f: poly('x^3'), g: poly('x') })
  assert.deepEqual(b.pieces.map((p) => p.area.toTex()), ['\\frac{1}{4}', '\\frac{1}{4}'])
  assert.equal(b.total.toTex(), '\\frac{1}{2}')
  assert.ok(b.signed.isZero(), 'tích phân có dấu bằng 0 vì hai phần đối xứng')
})

test('giao điểm là số vô tỉ vẫn tính chính xác trong tập a + b√r', () => {
  // y = x² và y = x + 1 cắt nhau tại (1 ± √5)/2; S = (√5)³/6 = 5√5/6.
  const a = analyze({ kind: 'area', f: poly('x^2'), g: poly('x + 1') })
  assert.equal(a.from.toTex(), '\\frac{1 - \\sqrt{5}}{2}')
  assert.equal(a.total.toTex(), '\\frac{5\\sqrt{5}}{6}')
})

test('bỏ cuộc thay vì đoán khi phương trình giao điểm không giải được bằng căn', () => {
  // x³ = 2 không có nghiệm hữu tỉ, cũng không phải bậc hai.
  const r = analyzeIntegral({ kind: 'area', f: poly('x^3'), g: poly('2'), a: null, b: null, n: 4, rkind: 'left' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /Không giải chính xác được/)

  // Hai đường chỉ cắt nhau tại một điểm: chưa đủ để có hình phẳng.
  const one = analyzeIntegral({ kind: 'area', f: poly('x^2'), g: poly('0'), a: null, b: null, n: 4, rkind: 'left' })
  assert.equal(one.ok, false)
  assert.match(one.ok ? '' : one.error, /ít hơn hai điểm/)
})

// ── Bài quãng đường ─────────────────────────────────────────────────────────

test('quãng đường khác độ dịch chuyển khi vật đổi chiều', () => {
  // v(t) = t² − 4t + 3 = (t − 1)(t − 3) trên [0; 4]: đổi chiều tại t = 1 và t = 3.
  const a = analyze({ kind: 'motion', f: poly('t^2 - 4t + 3', 't'), a: Frac.of(0), b: Frac.of(4) })
  assert.equal(a.variable, 't')
  assert.deepEqual(a.inside.map((r) => r.value.toTex()), ['1', '3'])
  assert.deepEqual(a.pieces.map((p) => p.sign), [1, -1, 1])
  // Từng khúc 4/3; quãng đường 3 × 4/3 = 4, độ dịch chuyển 4/3 − 4/3 + 4/3 = 4/3.
  assert.deepEqual(a.pieces.map((p) => p.area.toTex()), ['\\frac{4}{3}', '\\frac{4}{3}', '\\frac{4}{3}'])
  assert.equal(a.total.toTex(), '4')
  assert.equal(a.signed.toTex(), '\\frac{4}{3}')

  const text = allText(a)
  assert.match(text, /đổi chiều/)
  assert.match(text, /Độ dịch chuyển/)
})

test('vật đi một chiều thì quãng đường bằng độ dịch chuyển', () => {
  // v(t) = 2t + 1 > 0 trên [0; 3]: s = d = 9 + 3 = 12.
  const a = analyze({ kind: 'motion', f: poly('2t + 1', 't'), a: Frac.of(0), b: Frac.of(3) })
  assert.equal(a.changesSign, false)
  assert.equal(a.total.toTex(), '12')
  assert.equal(a.signed.toTex(), '12')
  const setup = buildIntegralSteps(a)[0]
  assert.equal(setup.predicts[0].correct, 'yes')
})

// ── Bài tổng Riemann ────────────────────────────────────────────────────────

test('tổng Riemann tính bằng phân số, và so đúng chiều với tích phân', () => {
  const f = poly('x^2')
  const a = Frac.of(0)
  const b = Frac.of(1)
  // Mút trái, n = 4: (1/4)(0 + 1/16 + 4/16 + 9/16) = 14/64 = 7/32 < 1/3.
  assert.equal(riemannSum(f, a, b, 4, 'left').sum.toTex(), '\\frac{7}{32}')
  // Mút phải: (1/4)(1/16 + 4/16 + 9/16 + 1) = 30/64 = 15/32 > 1/3.
  assert.equal(riemannSum(f, a, b, 4, 'right').sum.toTex(), '\\frac{15}{32}')
  // Trung điểm: (1/4)(1 + 9 + 25 + 49)/64 = 84/256 = 21/64.
  assert.equal(riemannSum(f, a, b, 4, 'mid').sum.toTex(), '\\frac{21}{64}')

  const left = analyze({ kind: 'riemann', f, a, b, n: 4, rkind: 'left' })
  assert.equal(left.exact!.toTex(), '\\frac{1}{3}')
  assert.equal(left.monotone, 1, 'x² đồng biến trên [0; 1]')
  const sumStep = buildIntegralSteps(left).find((s) => s.key === 'sum')!
  assert.equal(sumStep.predicts[0].correct, 'less', 'mút trái của hàm đồng biến cho tổng thiếu')
  assert.match(sumStep.predicts[0].explain, /THẤP/)

  const right = analyze({ kind: 'riemann', f, a, b, n: 4, rkind: 'right' })
  assert.equal(buildIntegralSteps(right).find((s) => s.key === 'sum')!.predicts[0].correct, 'more')
})

test('bảng hội tụ: n tăng thì tổng Riemann tiến về tích phân', () => {
  const a = analyze({ kind: 'riemann', f: poly('x^2'), a: Frac.of(0), b: Frac.of(1), n: 4, rkind: 'left' })
  const rows = a.convergence!
  assert.deepEqual(rows.map((r) => r.n), [4, 8, 16, 32, 64])
  const gaps = rows.map((r) => Math.abs(r.sum.toNumber() - 1 / 3))
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] < gaps[i - 1], `sai số phải giảm ở n = ${rows[i].n}`)
  // Sai số của tổng mút trái với hàm này đúng bằng 1/(2n) − 1/(6n²); ở n = 64 là ~0,0078.
  assert.ok(gaps[gaps.length - 1] < 0.01)
})

test('tổng Riemann trên hàm đổi dấu được nói rõ là tích phân, không phải diện tích', () => {
  // x³ đổi dấu tại 0 trên [−1; 1]: ∫ = 0 nhưng diện tích = 1/2.
  const a = analyze({ kind: 'riemann', f: poly('x^3'), a: Frac.of(-1), b: Frac.of(1), n: 4, rkind: 'mid' })
  assert.ok(a.signed.isZero())
  assert.equal(a.total.toTex(), '\\frac{1}{2}')
  assert.match(allText(a), /không\*\* phải diện tích|không.{0,20}phải diện tích/)
})

// ── Đọc đề ──────────────────────────────────────────────────────────────────

test('parsePolynomial: biến t, LaTeX dán từ đề, và từ chối phân thức', () => {
  assert.equal(poly('v(t) = t^2 - 4t + 3', 't').toTex('t'), 't^2 - 4t + 3')
  assert.equal(poly('y = x^{2} + 2x').toTex(), 'x^2 + 2x')
  assert.equal(poly('2(x-1)(x+1)').toTex(), '2x^2 - 2')
  const bad = parsePolynomial('(x+1)/(x-1)')
  assert.equal(bad.ok, false)
  assert.match(bad.ok ? '' : bad.error, /chỉ nhận đa thức/)
  const deg = parsePolynomial('x^8')
  assert.equal(deg.ok, false)
})

// ── Lời giải ────────────────────────────────────────────────────────────────

test('lời giải viết đủ phép thế hai cận, và hỏi trước ở mỗi khúc', () => {
  const a = analyze({ kind: 'area', f: poly('x^2'), g: poly('2 - x^2') })
  const steps = buildIntegralSteps(a)
  assert.deepEqual(steps.map((s) => s.key), ['setup', 'intersect', 'sign', 'absolute', 'antiderivative', 'pieces', 'total'])
  const pieces = steps.find((s) => s.key === 'pieces')!
  // Dòng tính phải có cả nguyên hàm, hai cận và kết quả.
  assert.match(pieces.lines[0], /\\Big\|/)
  assert.match(pieces.lines[0], /\\frac\{8\}\{3\}/)
  // Mỗi khúc một câu hỏi "đồ thị nào nằm trên".
  const sign = steps.find((s) => s.key === 'sign')!
  assert.equal(sign.predicts.length, a.pieces.length)
  assert.equal(sign.predicts[0].piece, 0)
  // Chế độ Tự làm: chưa trả lời thì hình chưa tô vùng.
  assert.equal(sign.preStage!.shade, false)
  assert.equal(sign.stage.shade, true)
})

test('không có công thức nào lọt dấu $ lẻ ra ngoài khối $$', () => {
  const cases = [
    analyze({ kind: 'area', f: poly('x^3 - 3x^2 + 2'), a: Frac.of(0), b: Frac.of(2) }),
    analyze({ kind: 'area', f: poly('x^3'), g: poly('x') }),
    analyze({ kind: 'motion', f: poly('t^2 - 4t + 3', 't'), a: Frac.of(0), b: Frac.of(4) }),
    analyze({ kind: 'riemann', f: poly('x^2'), a: Frac.of(0), b: Frac.of(1), n: 4, rkind: 'left' }),
  ]
  for (const a of cases) {
    for (const step of buildIntegralSteps(a)) {
      for (const line of [step.title, ...step.lines, ...step.predicts.flatMap((p) => [p.question, p.explain])]) {
        // RichText tách theo $$…$$ rồi $…$; số dấu $ phải chẵn thì mới đóng hết.
        assert.equal((line.match(/\$/g) ?? []).length % 2, 0, `dấu $ lẻ trong: ${line}`)
        assert.ok(!/\$\$[^$]*\$[^$]/.test(line), `khối $$…$$ có dấu $ lẫn bên trong: ${line}`)
      }
    }
  }
})
