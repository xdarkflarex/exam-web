/**
 * Test công cụ Oxyz. Mọi đáp án tính tay trước, ghi lại phép tính ngay cạnh
 * assert để người sửa sau kiểm được mà không cần chạy code.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Frac } from '../fraction.ts'
import { analyzeDistance, analyzeLine, analyzePlane, analyzeSphere, type SpaceAnalysis } from './analyze.ts'
import {
  angleLinePlane,
  anglePlanes,
  distancePointPlane,
  lineThrough,
  planeThrough3,
  projectOntoPlane,
  spherePlanePosition,
  Vec3,
  type Line,
  type Plane,
} from './geometry.ts'
import { parsePlane, parsePoint, parseSphereEquation, sphereFromCenterRadius } from './parse.ts'
import { buildSpaceSteps, planeTex } from './steps.ts'

const V = (x: number, y: number, z: number) => Vec3.of(x, y, z)
const F = (n: number, d = 1) => Frac.of(n, d)

function ok<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.value
}

function analysis(r: ReturnType<typeof analyzePlane>): SpaceAnalysis {
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.analysis
}

const allText = (a: SpaceAnalysis) =>
  buildSpaceSteps(a)
    .flatMap((s) => [s.title, ...s.lines, ...s.predicts.flatMap((p) => [p.question, p.explain, ...p.options.map((o) => o.label)])])
    .join('\n')

// ── Vectơ ───────────────────────────────────────────────────────────────────

test('tích có hướng, độ dài chính xác, và rút gọn vectơ pháp tuyến', () => {
  // [(1;0;0), (0;1;0)] = (0;0;1).
  assert.ok(V(1, 0, 0).cross(V(0, 1, 0)).eq(V(0, 0, 1)))
  // Tích có hướng vuông góc với cả hai vectơ sinh ra nó.
  const u = V(1, -2, 3)
  const v = V(4, 0, -1)
  const n = u.cross(v)
  assert.ok(n.dot(u).isZero() && n.dot(v).isZero())
  // |(1;2;2)| = 3 đúng, không phải 3,0000001.
  assert.equal(V(1, 2, 2).norm().toTex(), '3')
  // |(1;1;1)| = √3.
  assert.equal(V(1, 1, 1).norm().toTex(), '\\sqrt{3}')
  // (3; -6; 6) rút về (1; -2; 2); (-2; 4; 0) đổi dấu để thành phần đầu dương.
  assert.equal(V(3, -6, 6).primitive().toPlain(), '(1; −2; 2)')
  assert.equal(V(-2, 4, 0).primitive().toPlain(), '(1; −2; 0)')
  // Vectơ toạ độ phân số cũng quy về số nguyên: (1/2; 1/3; 0) → (3; 2; 0).
  assert.equal(new Vec3(F(1, 2), F(1, 3), F(0)).primitive().toPlain(), '(3; 2; 0)')
})

// ── Bài 1: mặt phẳng qua ba điểm ────────────────────────────────────────────

test('mặt phẳng qua ba điểm: dạng đoạn chắn quen thuộc', () => {
  // A(1;0;0), B(0;2;0), C(0;0;3) → x/1 + y/2 + z/3 = 1 → 6x + 3y + 2z − 6 = 0.
  const a = analysis(analyzePlane(V(1, 0, 0), V(0, 2, 0), V(0, 0, 3), null))
  assert.equal(a.kind, 'plane')
  if (a.kind !== 'plane') return
  assert.ok(a.cross.eq(V(6, 3, 2)), 'tích có hướng [AB, AC] = (6; 3; 2)')
  assert.equal(planeTex(a.P), '6x + 3y + 2z - 6 = 0')
  // Cả ba điểm phải thoả mãn phương trình vừa viết.
  for (const p of [a.A, a.B, a.C]) assert.ok(a.P.n.dot(p).add(a.P.d).isZero())
})

test('ba điểm thẳng hàng thì báo rõ, không viết bừa một mặt phẳng', () => {
  const r = analyzePlane(V(0, 0, 0), V(1, 1, 1), V(2, 2, 2), null)
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /thẳng hàng/)
  assert.equal(planeThrough3(V(0, 0, 0), V(1, 1, 1), V(2, 2, 2)), null)
})

test('điểm thứ tư: đồng phẳng hay là đỉnh tứ diện', () => {
  const A = V(1, 0, 0)
  const B = V(0, 2, 0)
  const C = V(0, 0, 3)
  // D(1; 2; 3): 6 + 6 + 6 − 6 = 12 ≠ 0 → không đồng phẳng.
  const tetra = analysis(analyzePlane(A, B, C, V(1, 2, 3)))
  if (tetra.kind !== 'plane') return
  assert.equal(tetra.valueD!.toTex(), '12')
  assert.match(allText(tetra), /không đồng phẳng/)
  // D(1/2; 1; 0) nằm trên: 3 + 3 + 0 − 6 = 0.
  const flat = analysis(analyzePlane(A, B, C, new Vec3(F(1, 2), F(1), F(0))))
  if (flat.kind !== 'plane') return
  assert.ok(flat.valueD!.isZero())
  assert.match(allText(flat), /đồng phẳng/)
})

// ── Bài 2: khoảng cách, hình chiếu, điểm đối xứng ────────────────────────────

test('khoảng cách, hình chiếu và điểm đối xứng đều là số hữu tỉ khi chia hết', () => {
  // M(1; −2; 3), (P): 2x − 2y + z + 3 = 0. Vế trái = 2 + 4 + 3 + 3 = 12, |n| = 3.
  const P: Plane = { n: V(2, -2, 1), d: F(3) }
  const r = analyzeDistance(V(1, -2, 3), P)
  const a = analysis(r)
  if (a.kind !== 'distance') return
  assert.equal(a.value.toTex(), '12')
  assert.equal(a.d.toTex(), '4', 'd = 12/3 = 4')
  assert.equal(a.t.toPlain(), '-4/3')
  // H = M + t·n = (1 − 8/3; −2 + 8/3; 3 − 4/3).
  assert.equal(a.H.toPlain(), '(−5/3; 2/3; 5/3)')
  assert.ok(P.n.dot(a.H).add(P.d).isZero(), 'H phải nằm trên (P)')
  // M′ = 2H − M.
  assert.equal(a.Msym.toPlain(), '(−13/3; 10/3; 1/3)')
  // |MH| = 4 = d.
  assert.equal(a.H.sub(a.M).norm().toTex(), '4')
})

test('khoảng cách có căn được trục căn thức ở mẫu như SGK', () => {
  // M(1;1;1), (P): x + y + z = 0 → d = 3/√3 = √3.
  assert.equal(distancePointPlane({ n: V(1, 1, 1), d: F(0) }, V(1, 1, 1)).toTex(), '\\sqrt{3}')
  // M(1;0;0), (P): x + y = 0 → d = 1/√2 = √2/2.
  assert.equal(distancePointPlane({ n: V(1, 1, 0), d: F(0) }, V(1, 0, 0)).toTex(), '\\frac{\\sqrt{2}}{2}')
})

test('điểm nằm trên mặt phẳng: khoảng cách 0, hình chiếu là chính nó', () => {
  const P: Plane = { n: V(1, 1, 1), d: F(-3) }
  const a = analysis(analyzeDistance(V(1, 1, 1), P))
  if (a.kind !== 'distance') return
  assert.equal(a.onPlane, true)
  assert.ok(a.d.isZero())
  assert.ok(a.H.eq(V(1, 1, 1)) && a.Msym.eq(V(1, 1, 1)))
  assert.equal(buildSpaceSteps(a)[0].predicts[0].correct, 'yes')
})

// ── Bài 3: đường thẳng và mặt phẳng ─────────────────────────────────────────

test('đường thẳng cắt mặt phẳng: giao điểm và góc vuông', () => {
  // d qua A(1;0;0), u = (1;1;1); (P): x + y + z − 3 = 0. u cùng phương n nên d ⊥ (P).
  const line: Line = { A: V(1, 0, 0), u: V(1, 1, 1) }
  const P: Plane = { n: V(1, 1, 1), d: F(-3) }
  const a = analysis(analyzeLine(line, P, null))
  if (a.kind !== 'line') return
  assert.equal(a.pos.kind, 'cat')
  assert.equal(a.pos.t!.toPlain(), '2/3')
  assert.equal(a.pos.point!.toPlain(), '(5/3; 2/3; 2/3)')
  assert.equal(a.pos.perpendicular, true)
  assert.equal(a.angle.exactDegrees, 90)
})

test('đường thẳng song song và đường thẳng nằm trong mặt phẳng', () => {
  const P: Plane = { n: V(1, 1, 0), d: F(-1) }
  // A(0;0;1) không thuộc (P) → song song.
  const par = analysis(analyzeLine({ A: V(0, 0, 1), u: V(1, -1, 0) }, P, null))
  if (par.kind !== 'line') return
  assert.equal(par.pos.kind, 'songSong')
  // Khoảng cách từ d tới (P) bằng |−1|/√2 = √2/2.
  assert.match(allText(par), /\\frac\{\\sqrt\{2\}\}\{2\}/)

  // A(1;0;0) thuộc (P) → nằm trong.
  const inside = analysis(analyzeLine({ A: V(1, 0, 0), u: V(1, -1, 0) }, P, null))
  if (inside.kind !== 'line') return
  assert.equal(inside.pos.kind, 'nam')
  assert.match(allText(inside), /nằm trong/)
  assert.equal(inside.angle.value.isZero(), true)
})

test('góc giữa đường thẳng và mặt phẳng: 45° đúng, góc lẻ thì ghi xấp xỉ', () => {
  // u = (1;0;0), n = (1;1;0): sin α = 1/√2 = √2/2 → 45°.
  const nice = angleLinePlane({ A: V(0, 0, 0), u: V(1, 0, 0) }, { n: V(1, 1, 0), d: F(0) })
  assert.equal(nice.value.toTex(), '\\frac{\\sqrt{2}}{2}')
  assert.equal(nice.exactDegrees, 45)
  // u = (1;1;1), n = (1;0;0): sin α = 1/√3 = √3/3 ≈ 33°33′ — không phải góc đẹp.
  const odd = angleLinePlane({ A: V(0, 0, 0), u: V(1, 1, 1) }, { n: V(1, 0, 0), d: F(0) })
  assert.equal(odd.exactDegrees, null)
  assert.ok(Math.abs(odd.approxDegrees - 35.264) < 0.01)
  // Hai mặt phẳng vuông góc: cos = 0 → 90°.
  assert.equal(anglePlanes({ n: V(1, 0, 0), d: F(0) }, { n: V(0, 1, 0), d: F(0) }).exactDegrees, 90)
  // Hai mặt phẳng song song: cos = 1 → góc 0°.
  assert.equal(anglePlanes({ n: V(1, 0, 0), d: F(0) }, { n: V(1, 0, 0), d: F(1) }).exactDegrees, 0)
  // (1;1;0) và (1;0;1): cos = 1/(√2·√2) = 1/2 → 60°.
  assert.equal(anglePlanes({ n: V(1, 1, 0), d: F(0) }, { n: V(1, 0, 1), d: F(0) }).exactDegrees, 60)
})

// ── Bài 4: mặt cầu và mặt phẳng ─────────────────────────────────────────────

test('mặt cầu cắt mặt phẳng: tâm và bán kính đường tròn giao tuyến', () => {
  // I(1;2;3), R = 3; (P): 2x − 2y + z + 3 = 0 → vế trái = 2 − 4 + 3 + 3 = 4, d = 4/3.
  const S = ok(sphereFromCenterRadius(V(1, 2, 3), F(3)))
  const P: Plane = { n: V(2, -2, 1), d: F(3) }
  const a = analysis(analyzeSphere(S, P))
  if (a.kind !== 'sphere') return
  assert.equal(a.pos.kind, 'cat')
  assert.equal(a.pos.d.toPlain(), '4/3')
  // r = √(9 − 16/9) = √(65/9) = √65/3.
  assert.equal(a.pos.r!.toTex(), '\\frac{\\sqrt{65}}{3}')
  // Tâm đường tròn là hình chiếu của I.
  assert.ok(a.pos.H.eq(projectOntoPlane(P, S.I)))
  assert.ok(P.n.dot(a.pos.H).add(P.d).isZero())
})

test('tiếp xúc và không cắt: so bình phương nên ca tiếp xúc không trượt', () => {
  // I(0;0;0), R = 1, (P): x − 1 = 0 → d = 1 = R.
  const tangent = spherePlanePosition(ok(sphereFromCenterRadius(V(0, 0, 0), F(1))), { n: V(1, 0, 0), d: F(-1) })
  assert.equal(tangent.kind, 'tiepXuc')
  assert.ok(tangent.H.eq(V(1, 0, 0)), 'tiếp điểm là hình chiếu của tâm')
  // Bán kính 1/2 thì không cắt nữa.
  const away = spherePlanePosition(ok(sphereFromCenterRadius(V(0, 0, 0), F(1, 2))), { n: V(1, 0, 0), d: F(-1) })
  assert.equal(away.kind, 'khongCat')
  // R = √2 thì cắt, r = √(2 − 1) = 1.
  const cut = spherePlanePosition({ I: V(0, 0, 0), r2: F(2) }, { n: V(1, 0, 0), d: F(-1) })
  assert.equal(cut.kind, 'cat')
  assert.equal(cut.r!.toTex(), '1')
})

// ── Đọc đề ──────────────────────────────────────────────────────────────────

test('đọc điểm, mặt phẳng và mặt cầu từ cách viết của đề', () => {
  assert.ok(ok(parsePoint('(1; -2; 0,5)')).eq(new Vec3(F(1), F(-2), F(1, 2))))
  assert.ok(ok(parsePoint('M = 1; 2; 3')).eq(V(1, 2, 3)))
  assert.ok(ok(parsePoint('1 2 3')).eq(V(1, 2, 3)))
  assert.equal(parsePoint('1; 2').ok, false)

  const p = ok(parsePlane('x + 2y - 2z + 1 = 0'))
  assert.ok(p.n.eq(V(1, 2, -2)) && p.d.eq(F(1)))
  // Vế phải được chuyển sang trái.
  const q = ok(parsePlane('2x = y'))
  assert.ok(q.n.eq(V(2, -1, 0)) && q.d.isZero())
  // Bốn hệ số cũng được.
  assert.ok(ok(parsePlane('1; 2; -2; 1')).n.eq(V(1, 2, -2)))
  assert.equal(parsePlane('x^2 + y = 0').ok, false)
  assert.match(parsePlane('2(x - 1) = 0').ok ? '' : (parsePlane('2(x - 1) = 0') as { error: string }).error, /Khai triển/)

  // x² + y² + z² − 2x + 4y − 6z + 5 = 0 → I(1; −2; 3), R² = 1 + 4 + 9 − 5 = 9.
  const s = ok(parseSphereEquation('x^2 + y^2 + z^2 - 2x + 4y - 6z + 5 = 0'))
  assert.ok(s.I.eq(V(1, -2, 3)))
  assert.equal(s.r2.toTex(), '9')
  assert.equal(parseSphereEquation('x^2 + y^2 + z^2 + 100 = 0').ok, false)
})

// ── Lời giải ────────────────────────────────────────────────────────────────

test('lời giải đi đủ các bước và hình lớn dần theo lời giải', () => {
  const a = analysis(analyzePlane(V(1, 0, 0), V(0, 2, 0), V(0, 0, 3), null))
  const steps = buildSpaceSteps(a)
  assert.deepEqual(steps.map((s) => s.key), ['setup', 'vectors', 'cross', 'equation', 'check'])
  // Mỗi bước lộ thêm, không bước nào lộ ngược.
  steps.forEach((s, i) => i > 0 && assert.ok(s.reveal >= steps[i - 1].reveal))
  // Bước có câu hỏi phải giữ hình lại cho tới khi trả lời.
  const withPredict = steps.find((s) => s.predicts.length > 0)!
  assert.ok(withPredict.preReveal! < withPredict.reveal)
  // Mặt phẳng chỉ hiện sau khi đã tìm ra vectơ pháp tuyến.
  assert.equal(a.scene.planes[0].reveal, 3)
})

test('không có công thức nào lọt dấu $ lẻ ra ngoài khối $$', () => {
  const P: Plane = { n: V(2, -2, 1), d: F(3) }
  const cases: SpaceAnalysis[] = [
    analysis(analyzePlane(V(1, 0, 0), V(0, 2, 0), V(0, 0, 3), V(1, 2, 3))),
    analysis(analyzeDistance(V(1, -2, 3), P)),
    analysis(analyzeLine(lineThrough(V(1, 0, 0), V(2, 1, 1))!, P, [V(1, 0, 0), V(2, 1, 1)])),
    analysis(analyzeLine({ A: V(0, 0, 1), u: V(1, -1, 0) }, { n: V(1, 1, 0), d: F(-1) }, null)),
    analysis(analyzeSphere(ok(sphereFromCenterRadius(V(1, 2, 3), F(3))), P)),
    analysis(analyzeSphere(ok(sphereFromCenterRadius(V(0, 0, 0), F(1, 2))), { n: V(1, 0, 0), d: F(-1) })),
  ]
  for (const a of cases) {
    for (const step of buildSpaceSteps(a)) {
      const lines = [step.title, ...step.lines, ...step.predicts.flatMap((p) => [p.question, p.explain, ...p.options.map((o) => o.label)])]
      for (const line of lines) {
        assert.equal((line.match(/\$/g) ?? []).length % 2, 0, `dấu $ lẻ trong: ${line}`)
        assert.ok(!/\$\$[^$]*\$[^$]/.test(line), `khối $$…$$ có dấu $ lẫn bên trong: ${line}`)
      }
    }
  }
})
