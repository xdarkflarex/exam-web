/**
 * Test công cụ khảo sát hàm số. Mọi đáp án tính tay trước, ghi lại phép tính
 * ngay cạnh assert để người sửa sau kiểm được mà không cần chạy code.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frac } from '../fraction.ts'
import { analyze, type Column } from './analyze.ts'
import { classify, coefSlots, functionInput, parseFunction, withCoef, type ParsedFunction } from './parse.ts'
import { exactRoots, pickTestPoint, Poly } from '../poly.ts'
import { buildSteps, rootsListTex } from './steps.ts'
import { Surd } from '../surd.ts'

function fn(src: string): ParsedFunction {
  const r = parseFunction(src)
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.fn
}

const crits = (cols: Column[]) => cols.filter((c): c is Extract<Column, { kind: 'crit' }> => c.kind === 'crit')
const allText = (src: string) =>
  buildSteps(analyze(fn(src)))
    .flatMap((s) => [s.title, ...s.lines])
    .join('\n')

// ── Số căn ──────────────────────────────────────────────────────────────────

test('Surd: rút căn, nhân liên hợp, dấu chính xác, cách viết SGK', () => {
  const s12 = Surd.sqrt(Frac.of(12))!
  assert.equal(s12.toTex(), '2\\sqrt{3}')
  assert.equal(Surd.sqrt(Frac.of(9))!.toTex(), '3')
  assert.equal(Surd.sqrt(Frac.of(1, 2))!.toTex(), '\\frac{\\sqrt{2}}{2}')
  assert.equal(Surd.sqrt(Frac.of(-1)), null)

  const r2 = Surd.sqrt(Frac.of(2))!
  const onePlus = Surd.int(1).add(r2)
  const oneMinus = Surd.int(1).sub(r2)
  assert.ok(onePlus.mul(oneMinus).eq(Surd.int(-1)), '(1 + √2)(1 − √2) = −1')
  assert.ok(Surd.int(1).div(onePlus).eq(Surd.int(-1).add(r2)), '1/(1 + √2) = √2 − 1')
  assert.equal(oneMinus.sign(), -1)
  assert.equal(Surd.int(-1).add(Surd.sqrt(Frac.of(3))!).sign(), 1)
  assert.equal(oneMinus.toTex(), '1 - \\sqrt{2}')
  assert.equal(oneMinus.toPlain(), '1 − √2')
  const half = Surd.of(Frac.of(-1, 2), Frac.of(1, 2), BigInt(3))
  assert.equal(half.toTex(), '\\frac{-1 + \\sqrt{3}}{2}')
  assert.equal(half.toPlain(), '(−1 + √3)/2')
  assert.equal(r2.neg().toTex(), '-\\sqrt{2}')
})

test('exactRoots: rút x, nghiệm hữu tỉ, Δ, nghiệm kép; bỏ cuộc thay vì đoán', () => {
  // x³ − 3x² + 2 = (x − 1)(x² − 2x − 2) → 1, 1 ± √3.
  const r = exactRoots(Poly.fromInts(1, -3, 0, 2))!
  assert.deepEqual(r.map((x) => x.value.toTex()), ['1 - \\sqrt{3}', '1', '1 + \\sqrt{3}'])
  // (x² − 1)² → ±1, mỗi nghiệm bội 2.
  const q = exactRoots(Poly.fromInts(1, 0, -2, 0, 1))!
  assert.deepEqual(q.map((x) => [x.value.toTex(), x.multiplicity]), [['-1', 2], ['1', 2]])
  // x³ − 2 không có nghiệm hữu tỉ, không giải được bằng căn bậc hai.
  assert.equal(exactRoots(Poly.fromInts(1, 0, 0, -2)), null)
  assert.deepEqual(exactRoots(Poly.fromInts(1, 0, 1))!, [])
})

// ── Đọc hàm số ──────────────────────────────────────────────────────────────

test('parseFunction: các cách gõ và dán từ đề', () => {
  assert.equal(fn('y = x^3 - 3x^2 + 2').kind, 'cubic')
  assert.equal(fn('f(x) = −x⁴ + 2x²').kind, 'biquadratic')
  assert.equal(fn('x^4 + x^3').kind, 'quartic')
  assert.equal(fn('0,5x^2 + x').num.coef(2).toPlain(), '1/2')
  // 2(x − 1)²(x + 1) = 2x³ − 2x² − 2x + 2.
  assert.equal(fn('2(x-1)^2(x+1)').num.toTex(), '2x^3 - 2x^2 - 2x + 2')

  const h = fn('y=\\dfrac{2x+1}{x-1}')
  assert.equal(h.kind, 'homographic')
  assert.equal(h.num.toTex(), '2x + 1')
  assert.equal(h.den.toTex(), 'x - 1')
  // x + 1 + 1/(x − 1) = x²/(x − 1).
  const r = fn('x + 1 + 1/(x-1)')
  assert.equal(r.kind, 'rational21')
  assert.equal(r.num.toTex(), 'x^2')
  // Hệ số phân số quy về nguyên, mẫu có hệ số cao nhất dương.
  const t = fn('(x/2 + 1)/(1 - x)')
  assert.equal(`${t.num.toTex()} | ${t.den.toTex()}`, '-x - 2 | 2x - 2')
  assert.equal(fn('0{,}5x^2').num.coef(2).toPlain(), '1/2')
})

test('parseFunction: từ chối có lý do', () => {
  const err = (src: string) => {
    const r = parseFunction(src)
    assert.ok(!r.ok, `phải từ chối: ${src}`)
    return r.error
  }
  assert.match(err('(x^2 - 1)/(x - 1)'), /rút gọn được/)
  assert.match(err('x^5 + 1'), /bậc 2, 3, 4/)
  assert.match(err('1/(x^2 + 1)'), /Phân thức chỉ nhận/)
  assert.match(err('2x + 1'), /bậc nhất/)
  assert.match(err('x^3 + $'), /Không hiểu ký tự/)
  assert.match(err('(x + 1'), /ngoặc đóng/)
})

test('functionInput + withCoef: gõ lại được đúng hàm, đổi hệ số theo dạng', () => {
  const f = fn('(1/3)x^3 - x')
  assert.equal(functionInput(f), '(1/3)x^3 - x')
  assert.ok(fn(functionInput(f)).num.eq(f.num))
  const h = fn('(x + 1)/(x - 1)')
  const slotC = coefSlots('homographic')[2]
  const moved = classify(withCoef(h, slotC, Frac.of(2)))
  assert.ok(moved.ok)
  assert.equal(functionInput(moved.fn), '(x + 1)/(2x - 1)')
  // c = 0 thì hết là phân thức: báo lỗi, không vỡ.
  assert.ok(!classify(withCoef(h, slotC, Frac.ZERO)).ok)
})

// ── Khảo sát ────────────────────────────────────────────────────────────────

test('bậc ba có hai cực trị: y = x³ − 3x² + 2', () => {
  const a = analyze(fn('x^3 - 3x^2 + 2'))
  assert.equal(a.derivNum.toTex(), '3x^2 - 6x')
  // y′(−1) = 9, y′(1) = −3, y′(3) = 9.
  assert.deepEqual(a.intervals.map((iv) => [iv.test.toPlain(), iv.testValue.toPlain(), iv.sign]), [
    ['-1', '9', 1],
    ['1', '-3', -1],
    ['3', '9', 1],
  ])
  assert.deepEqual(crits(a.columns).map((c) => [c.x.toTex(), c.y.toTex(), c.extremum, c.level]), [
    ['0', '2', 'max', 'top'],
    ['2', '-2', 'min', 'bottom'],
  ])
  assert.deepEqual([a.columns[0].kind === 'minusInf' && a.columns[0].level, a.columns[3].kind === 'plusInf' && a.columns[3].level], ['bottom', 'top'])
  assert.equal(`${a.center!.x.toPlain()};${a.center!.y.toPlain()}`, '1;0')
  assert.equal(a.yIntercept!.toPlain(), '2')

  const text = allText('x^3 - 3x^2 + 2')
  assert.match(text, /\*\*đồng biến\*\* trên các khoảng \$\(-\\infty; 0\)\$ và \$\(2; \+\\infty\)\$/)
  assert.match(text, /\*\*nghịch biến\*\* trên khoảng \$\(0; 2\)\$/)
  assert.match(text, /y_\{\\text\{CĐ\}\} = y\(0\) = 2/)
  assert.match(text, /\$I\(1; 0\)\$ làm \*\*tâm đối xứng\*\*/)
  assert.match(text, /x = 1 - \\sqrt\{3\}\$ hoặc \$x = 1\$ hoặc \$x = 1 \+ \\sqrt\{3\}/)
})

test('nghiệm y′ là căn: y = x³ − 3x² − 3x + 1', () => {
  const a = analyze(fn('x^3 - 3x^2 - 3x + 1'))
  // y′ = 3x² − 6x − 3 = 0 ⇔ x = 1 ± √2.
  // y(1 + √2): x² = 3 + 2√2, x³ = 7 + 5√2 ⇒ y = 7 + 5√2 − 9 − 6√2 − 3 − 3√2 + 1 = −4 − 4√2.
  assert.deepEqual(crits(a.columns).map((c) => [c.x.toTex(), c.y.toTex(), c.extremum]), [
    ['1 - \\sqrt{2}', '-4 + 4\\sqrt{2}', 'max'],
    ['1 + \\sqrt{2}', '-4 - 4\\sqrt{2}', 'min'],
  ])
  // Điểm thử đẹp: −1 < 1 − √2 ≈ −0,41 < 0 < 1 + √2 ≈ 2,41 < 3.
  assert.deepEqual(a.intervals.map((iv) => iv.test.toPlain()), ['-1', '0', '3'])
  assert.match(allText('x^3 - 3x^2 - 3x + 1'), /y\(1 - \\sqrt\{2\}\) = -4 \+ 4\\sqrt\{2\} \\approx 1\{,\}\{66\}/)
})

test('nghiệm kép không phải cực trị: y = −x³ + 3x² − 3x + 2 nghịch biến trên ℝ', () => {
  const a = analyze(fn('-x^3 + 3x^2 - 3x + 2'))
  // y′ = −3(x − 1)² ≤ 0.
  const [c] = crits(a.columns)
  assert.deepEqual([c.x.toTex(), c.multiplicity, c.extremum, c.level], ['1', 2, null, 'mid'])
  assert.equal(a.monotone.length, 1)
  const text = allText('-x^3 + 3x^2 - 3x + 2')
  assert.match(text, /\*\*nghịch biến\*\* trên \$\\mathbb\{R\}\$/)
  assert.match(text, /không phải\*\* điểm cực trị/)
})

test('trùng phương: y = x⁴ − 2x² + 1', () => {
  const a = analyze(fn('x^4 - 2x^2 + 1'))
  assert.deepEqual(crits(a.columns).map((c) => [c.x.toTex(), c.y.toTex(), c.extremum]), [
    ['-1', '0', 'min'],
    ['0', '1', 'max'],
    ['1', '0', 'min'],
  ])
  assert.deepEqual(a.axis, { x: Frac.ZERO, even: true })
  const steps = buildSteps(a)
  const roots = steps.find((s) => s.key === 'roots')!
  assert.match(roots.lines.join('\n'), /\\iff x\(4x\^2 - 4\) = 0/)
  assert.match(roots.lines.join('\n'), /x = 0\$ hoặc \$x = \\pm 1/)
  // Một cực đại duy nhất nên hỏi "cực đại tại đâu", đáp án x = 0.
  const ex = steps.find((s) => s.key === 'extrema')!.predicts[0]
  assert.deepEqual([ex.id, ex.correct], ['max', '0'])

  // −x⁴ + 2x² + 3 = −(x² − 3)(x² + 1): đặt t = x² ⇒ t = 3 (nhận), t = −1 (loại) ⇒ x = ±√3.
  const b = analyze(fn('-x^4 + 2x^2 + 3'))
  assert.deepEqual(b.xIntercepts!.map((r) => r.value.toTex()), ['-\\sqrt{3}', '\\sqrt{3}'])
  // Hai cực đại (x = ±1, y = 4), một cực tiểu (x = 0, y = 3) nên hỏi "cực tiểu tại đâu".
  const ex2 = buildSteps(b).find((s) => s.key === 'extrema')!.predicts[0]
  assert.deepEqual([ex2.id, ex2.correct], ['min', '0'])
  assert.match(allText('-x^4 + 2x^2 + 3'), /hoành độ \$x = \\pm \\sqrt\{3\}\$ \(\$-1\{,\}\{73\}\$; \$1\{,\}\{73\}\$\)/)
})

test('phân thức bậc nhất: y = (x + 1)/(x − 1)', () => {
  const a = analyze(fn('(x+1)/(x-1)'))
  assert.equal(a.derivNum.toTex(), '-2')
  assert.equal(a.pole!.toPlain(), '1')
  const pole = a.columns.find((c) => c.kind === 'pole')!
  assert.ok(pole.kind === 'pole')
  // Bên phải 1: tử 2 > 0, mẫu > 0 ⇒ +∞; bên trái −∞. y′ < 0 hai bên.
  assert.deepEqual([pole.left, pole.right, pole.leftLevel, pole.rightLevel], [
    { kind: 'inf', sign: -1 },
    { kind: 'inf', sign: 1 },
    'bottom',
    'top',
  ])
  assert.equal(a.horizontal!.toPlain(), '1')
  assert.equal(a.monotone.length, 2, 'không gộp hai khoảng qua điểm không xác định')
  const text = allText('(x+1)/(x-1)')
  assert.match(text, /1 \\cdot \(-1\) - 1 \\cdot 1\}\{\(x - 1\)\^2\} = \\frac\{-2\}\{\(x - 1\)\^2\}/)
  assert.match(text, /\*\*nghịch biến\*\* trên các khoảng \$\(-\\infty; 1\)\$ và \$\(1; \+\\infty\)\$/)
  assert.match(text, /\$y = 1\$ là \*\*tiệm cận ngang\*\*/)
  assert.match(text, /x \\to 1\^\{-\}\} y = -\\infty/)
  assert.match(text, /\*\*không có cực trị\*\*/)
  assert.match(text, /\$I\(1; 1\)\$/)
})

test('phân thức bậc hai trên bậc nhất: y = (x² − x + 1)/(x − 1)', () => {
  const a = analyze(fn('(x^2 - x + 1)/(x - 1)'))
  // y′ = [(2x − 1)(x − 1) − (x² − x + 1)]/(x − 1)² = (x² − 2x)/(x − 1)².
  assert.equal(a.derivNum.toTex(), 'x^2 - 2x')
  // Điểm thử trong (0; 1) và (1; 2) là 1/2 và 3/2: y′ = (−3/4)/(1/4) = −3.
  assert.deepEqual(a.intervals.map((iv) => [iv.test.toPlain(), iv.testValue.toPlain()]), [
    ['-1', '3/4'],
    ['1/2', '-3'],
    ['3/2', '-3'],
    ['3', '3/4'],
  ])
  assert.deepEqual(crits(a.columns).map((c) => [c.x.toTex(), c.y.toTex(), c.extremum]), [
    ['0', '-1', 'max'],
    ['2', '3', 'min'],
  ])
  assert.equal(a.oblique!.toTex(), 'x')
  const ends = [a.columns[0], a.columns[a.columns.length - 1]].map((c) => (c.kind === 'minusInf' || c.kind === 'plusInf' ? c.limit : null))
  assert.deepEqual(ends, [
    { kind: 'inf', sign: -1 },
    { kind: 'inf', sign: 1 },
  ])
  const text = allText('(x^2 - x + 1)/(x - 1)')
  assert.match(text, /y = x \+ \\dfrac\{1\}\{x - 1\}/)
  assert.match(text, /\$y = x\$ là \*\*tiệm cận xiên\*\*/)
})

test('bậc hai: đỉnh và trục đối xứng', () => {
  const text = allText('x^2 - 4x + 3')
  assert.match(text, /đỉnh \$I\(2; -1\)\$ và \*\*trục đối xứng\*\* \$x = 2\$/)
})

test('pickTestPoint: ưu tiên 0, rồi số nguyên nhỏ, luôn nằm TRONG khoảng', () => {
  const r2 = Surd.sqrt(Frac.of(2))!
  assert.equal(pickTestPoint(null, null).toPlain(), '0')
  assert.equal(pickTestPoint(Surd.int(2), null).toPlain(), '3')
  assert.equal(pickTestPoint(null, Surd.int(1).sub(r2)).toPlain(), '-1')
  assert.equal(pickTestPoint(Surd.int(0), Surd.int(1)).toPlain(), '1/2')
  // (√2; 3/2) ≈ (1,414; 1,5).
  const t = pickTestPoint(r2, Surd.frac(Frac.of(3, 2)))
  assert.ok(Surd.frac(t).cmp(r2) > 0 && t.cmp(Frac.of(3, 2)) < 0, t.toPlain())
})

test('rootsListTex gộp nghiệm đối nhau và ghi nghiệm kép', () => {
  const roots = exactRoots(Poly.fromInts(1, 0, -3, 0))!
  assert.equal(rootsListTex(roots), 'x = 0$ hoặc $x = \\pm \\sqrt{3}')
  assert.equal(rootsListTex(exactRoots(Poly.fromInts(1, -2, 1))!), 'x = 1 \\text{ (nghiệm kép)}')
})
