/**
 * Test cho công cụ miền nghiệm. Các hệ lấy từ ví dụ SGK Toán 10 (Kết nối tri
 * thức) và bài tập quen thuộc, đáp án đối chiếu bằng tay.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frac } from './fraction.ts'
import {
  inequalityText,
  parseInequalityLine,
  parseLinearExpression,
  type Inequality,
} from './parse.ts'
import { analyzeLine, analyzeRegion, checkPoint, optimize, type Pt } from './solve.ts'
import { buildSteps, optimizationLines, substituteTex, type SystemItem } from './steps.ts'

function one(line: string): Inequality {
  const r = parseInequalityLine(line)
  assert.ok(r.ok, r.ok ? '' : r.error)
  assert.equal(r.items.length, 1)
  return r.items[0].inequality
}

function sys(...lines: string[]): Inequality[] {
  return lines.flatMap((l) => {
    const r = parseInequalityLine(l)
    assert.ok(r.ok, r.ok ? '' : `${l}: ${r.error}`)
    return r.items.map((i) => i.inequality)
  })
}

const P = (x: number | string, y: number | string): Pt => ({
  x: typeof x === 'number' ? Frac.of(x) : Frac.parse(x)!,
  y: typeof y === 'number' ? Frac.of(y) : Frac.parse(y)!,
})

function coords(vs: { name: string; x: Frac; y: Frac }[]): string[] {
  return vs.map((v) => `${v.name}(${v.x.toPlain()};${v.y.toPlain()})`)
}

// ─── Phân số ────────────────────────────────────────────────────────────────

test('phân số tự rút gọn và giữ dấu ở tử', () => {
  assert.equal(Frac.of(6, -4).toPlain(), '-3/2')
  assert.equal(Frac.parse('0,5')!.toPlain(), '1/2')
  assert.equal(Frac.parse('2.25')!.toPlain(), '9/4')
  assert.equal(Frac.parse('1/0'), null)
  assert.equal(Frac.of(1, 3).add(Frac.of(1, 6)).toPlain(), '1/2')
})

// ─── Đọc bất phương trình ───────────────────────────────────────────────────

test('đọc các cách viết thông dụng về cùng một dạng', () => {
  assert.equal(inequalityText(one('2x + y <= 4')), '2x + y ≤ 4')
  assert.equal(inequalityText(one('2x+y≤4')), '2x + y ≤ 4')
  assert.equal(inequalityText(one('$2x + y \\leq 4$')), '2x + y ≤ 4')
  assert.equal(inequalityText(one('x >= 0')), 'x ≥ 0')
  assert.equal(inequalityText(one('3(x - y) > 1')), '3x − 3y > 1')
})

test('chuyển vế rồi đổi dấu khi hệ số đầu âm — và ĐỔI CHIỀU', () => {
  const r = parseInequalityLine('y >= 2x - 1')
  assert.ok(r.ok)
  assert.equal(inequalityText(r.items[0].inequality), '2x − y ≤ 1')
  assert.equal(r.items[0].multiplier.toPlain(), '-1')
})

test('khử mẫu bằng số dương, giữ chiều', () => {
  const r = parseInequalityLine('x/2 + y/3 < 1')
  assert.ok(r.ok)
  assert.equal(inequalityText(r.items[0].inequality), '3x + 2y < 6')
  assert.equal(r.items[0].multiplier.toPlain(), '6')
  assert.equal(inequalityText(one('0,5x + y > 2')), 'x + 2y > 4')
})

test('chuỗi hai dấu tách thành hai bất phương trình', () => {
  const r = parseInequalityLine('0 ≤ x ≤ 5')
  assert.ok(r.ok)
  assert.deepEqual(
    r.items.map((i) => inequalityText(i.inequality)),
    ['x ≥ 0', 'x ≤ 5'],
  )
})

test('từ chối phương trình, bậc hai, tích hai ẩn và ẩn lạ — kèm lời giải thích', () => {
  const bad: [string, RegExp][] = [
    ['x + y = 3', /phương trình/],
    ['x^2 + y < 1', /BẬC NHẤT/],
    ['xy > 2', /BẬC NHẤT/],
    ['x + z < 1', /x và y/],
    ['x + 1 < x + 2', /không còn ẩn/],
    ['2x + y', /Thiếu dấu so sánh/],
    ['1/x < 2', /chia/],
    ['x >= 0, y >= 0', /dòng mới/],
  ]
  for (const [line, re] of bad) {
    const r = parseInequalityLine(line)
    assert.equal(r.ok, false, line)
    if (!r.ok) assert.match(r.error, re, line)
  }
})

test('đọc hàm mục tiêu có hoặc không có tên', () => {
  const a = parseLinearExpression('F = 3x + 2y')
  const b = parseLinearExpression('F(x;y) = 3x + 2y + 1')
  assert.ok(a.ok && b.ok)
  assert.equal(a.value.a.toPlain(), '3')
  assert.equal(b.value.k.toPlain(), '1')
})

// ─── Từng bất phương trình ──────────────────────────────────────────────────

test('bờ không qua gốc: thử bằng O(0; 0), vẽ qua hai giao điểm với trục', () => {
  const s = analyzeLine(one('3x + y <= 6'))
  assert.equal(s.testIsOrigin, true)
  assert.equal(s.testValue.toPlain(), '0')
  assert.equal(s.testHolds, true)
  assert.equal(s.strict, false)
  assert.deepEqual(
    s.points.map((p) => `${p.x.toPlain()};${p.y.toPlain()}`),
    ['0;6', '2;0'],
  )
})

test('bờ qua gốc (c = 0): điểm thử là (1; 0), hoặc (0; 1) khi a = 0', () => {
  const s = analyzeLine(one('x - 2y > 0'))
  assert.equal(s.testIsOrigin, false)
  assert.equal(`${s.testPoint.x.toPlain()};${s.testPoint.y.toPlain()}`, '1;0')
  assert.equal(s.testHolds, true)
  assert.equal(s.strict, true)

  const t = analyzeLine(one('y < 0'))
  assert.equal(`${t.testPoint.x.toPlain()};${t.testPoint.y.toPlain()}`, '0;1')
  assert.equal(t.testHolds, false)
})

// ─── Miền nghiệm của hệ ─────────────────────────────────────────────────────

test('ví dụ SGK: tứ giác OABC', () => {
  const qs = sys('3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0')
  const r = analyzeRegion(qs)
  assert.equal(r.status, 'bounded')
  assert.deepEqual(coords(r.vertices), ['O(0;0)', 'A(2;0)', 'B(1;3)', 'C(0;4)'])
})

test('toạ độ đỉnh là phân số chính xác, không làm tròn', () => {
  const qs = sys('2x + y <= 5', 'x - 3y <= 1', 'x >= 0', 'y >= 0')
  const r = analyzeRegion(qs)
  assert.equal(r.status, 'bounded')
  assert.ok(coords(r.vertices).includes('B(16/7;3/7)'), coords(r.vertices).join(' '))
})

test('miền không bị chặn', () => {
  const r = analyzeRegion(sys('x + y >= 2', 'x >= 0', 'y >= 0'))
  assert.equal(r.status, 'unbounded')
  assert.deepEqual(coords(r.vertices), ['A(2;0)', 'B(0;2)'])
})

test('hệ vô nghiệm', () => {
  assert.equal(analyzeRegion(sys('x + y <= 1', 'x + y >= 3')).status, 'empty')
})

test('bao đóng suy biến: ≤ và ≥ cùng bờ là cả đường thẳng; có dấu chặt thì rỗng', () => {
  assert.equal(analyzeRegion(sys('x + y <= 2', 'x + y >= 2', 'x >= 0', 'y >= 0')).status, 'degenerate')
  assert.equal(analyzeRegion(sys('x + y < 2', 'x + y >= 2')).status, 'empty')
})

test('kiểm tra một điểm: thay vào từng bất phương trình', () => {
  const qs = sys('3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0')
  assert.equal(checkPoint(qs, P(1, 1)).inside, true)
  const out = checkPoint(qs, P(2, 2))
  assert.equal(out.inside, false)
  assert.deepEqual(
    out.rows.map((r) => r.holds),
    [false, true, true, true],
  )
})

// ─── GTLN – GTNN ────────────────────────────────────────────────────────────

function F(expr: string) {
  const r = parseLinearExpression(expr)
  assert.ok(r.ok)
  return r.value
}

test('GTLN, GTNN trên miền đa giác đạt tại đỉnh', () => {
  const qs = sys('3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0')
  const o = optimize(qs, analyzeRegion(qs), F('F = 2x + 3y'))!
  assert.equal(o.max.value!.toPlain(), '12')
  assert.deepEqual(o.max.at, ['C'])
  assert.equal(o.min.value!.toPlain(), '0')
  assert.deepEqual(o.min.at, ['O'])
  assert.equal(o.max.attained, true)
})

test('miền không bị chặn: có GTNN nhưng không có GTLN', () => {
  const qs = sys('x + y >= 2', 'x >= 0', 'y >= 0')
  const o = optimize(qs, analyzeRegion(qs), F('x + y'))!
  assert.equal(o.max.value, null)
  assert.equal(o.min.value!.toPlain(), '2')
  assert.equal(o.min.attained, true)
})

test('cực trị nằm trên bờ nét đứt thì KHÔNG đạt', () => {
  const qs = sys('x + y < 4', 'x >= 0', 'y >= 0')
  const o = optimize(qs, analyzeRegion(qs), F('x + y'))!
  assert.equal(o.max.value!.toPlain(), '4')
  assert.equal(o.max.attained, false)
  assert.equal(o.min.attained, true)
})

// ─── Lời giải từng bước ─────────────────────────────────────────────────────

function items(...lines: string[]): SystemItem[] {
  return lines.flatMap((source) => {
    const r = parseInequalityLine(source)
    assert.ok(r.ok, source)
    return r.items.map((parsed) => ({ source, parsed, fromChain: r.items.length > 1 }))
  })
}

test('mỗi bất phương trình ba bước (vẽ bờ, thử điểm, gạch bỏ) rồi một bước kết luận', () => {
  const its = items('3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0')
  const steps = buildSteps(its, analyzeRegion(its.map((i) => i.parsed.inequality)))
  assert.equal(steps.length, 13)
  assert.deepEqual(steps[2].stage, { drawn: 1, hatched: 1, focus: 0, showPoints: null, showTest: null, final: false })
  assert.equal(steps[12].stage.final, true)
})

test('bước vẽ bờ nói đúng nét liền / nét đứt', () => {
  const [a] = buildSteps(items('x + y <= 4'), analyzeRegion([one('x + y <= 4')]))
  assert.match(a.lines.join(' '), /nét liền/)
  const [b] = buildSteps(items('x + y < 4'), analyzeRegion([one('x + y < 4')]))
  assert.match(b.lines.join(' '), /nét đứt/)
})

test('bước điểm thử: thay số, so sánh, kết luận chứa / không chứa', () => {
  const its = items('2x - y > 3')
  const steps = buildSteps(its, analyzeRegion([its[0].parsed.inequality]))
  const text = steps[1].lines.join(' ')
  assert.match(text, /O\(0;\\, 0\)/)
  assert.match(text, /là \*\*sai\*\*/)
  assert.match(text, /\*\*không chứa\*\* điểm \$O\$/)
  assert.match(steps[2].lines[0], /Gạch bỏ\*\* nửa mặt phẳng bờ \$d_\{1\}\$ \*\*chứa\*\* \$O\$/)
})

test('bờ qua gốc thì nói rõ vì sao không thử bằng O', () => {
  const its = items('x - 2y >= 0')
  const text = buildSteps(its, analyzeRegion([its[0].parsed.inequality]))[1].lines.join(' ')
  assert.match(text, /đi qua gốc toạ độ/)
  assert.match(text, /M\(1;\\, 0\)/)
})

test('viết lại có đổi chiều thì lời giải nói ra, kèm dấu tương đương', () => {
  const its = items('y >= 2x - 1')
  const text = buildSteps(its, analyzeRegion([its[0].parsed.inequality]))[0].lines[0]
  assert.match(text, /\\iff/)
  assert.match(text, /đổi chiều/)
  assert.match(text, /2x - y \\le 1/)
})

test('thay số giữ ngoặc cho số âm và bỏ hệ số 1', () => {
  assert.equal(substituteTex(Frac.of(3), Frac.of(-1), P(-2, 1)), '3 \\cdot (-2) - 1 = -7')
})

test('kết luận miền đa giác liệt kê đỉnh và giao điểm', () => {
  const its = items('3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0')
  const qs = its.map((i) => i.parsed.inequality)
  const final = buildSteps(its, analyzeRegion(qs)).at(-1)!
  const text = final.lines.join(' ')
  assert.match(text, /đa giác \$OABC\$/)
  assert.match(text, /\$B\(1;\\, 3\)\$ là giao điểm của \$d_\{1\}\$ và \$d_\{2\}\$/)
})

test('lời GTLN – GTNN nêu giá trị và nơi đạt', () => {
  const qs = sys('x + y <= 6', '2x + y <= 8', 'x >= 0', 'y >= 0')
  const region = analyzeRegion(qs)
  const f = F('F = 3x + 2y')
  const text = optimizationLines(f, region, optimize(qs, region, f)!).join(' ')
  assert.match(text, /\*\*GTLN\*\* của \$F\$ là \$14\$, đạt tại \$B\$/)
  assert.match(text, /\*\*GTNN\*\* của \$F\$ là \$0\$, đạt tại \$O\$/)
})
