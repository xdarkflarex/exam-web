/**
 * Đề cho GÌ cũng được: mọi xác suất của hai biến cố A, B là một ô chờ; học sinh
 * điền những ô đề cho, công cụ suy ra phần còn lại.
 *
 * Yêu cầu của chủ dự án (2026-09-15): đề thật không phải lúc nào cũng cho đúng bộ
 * P(A), P(B | A), P(B | Ā). Có đề cho P(A), P(B), P(A ∩ B); có đề cho P(B) và hai
 * xác suất có điều kiện rồi hỏi ngược P(A); có đề cho P(A ∪ B).
 *
 * HAI LỚP, MỖI LỚP MỘT VIỆC:
 *
 *  1. `analyzeGivens` — đại số tuyến tính CHÍNH XÁC trên bốn lá của cây
 *     x = (P(A∩B), P(A∩B̄), P(Ā∩B), P(Ā∩B̄)), tổng bằng 1. Mọi dữ kiện là một
 *     phương trình bậc nhất theo x (có điều kiện P(B | A) = c ⇔ x₁ − c(x₁ + x₂) = 0).
 *     Hạng 4 ⇔ đủ dữ kiện; phương trình 0 = k ⇔ mâu thuẫn. Đây là nguồn sự thật.
 *
 *  2. `derive` — chuỗi suy luận bằng công thức SGK (biến cố đối, công thức nhân,
 *     toàn phần, Bayes, định nghĩa có điều kiện, hợp), tìm theo từng "vòng" để lấy
 *     đường ngắn nhất. Đây là lời giải để học sinh đọc. Chuỗi không tới đích mà lớp
 *     1 vẫn giải được thì lời giải nói thẳng là giải hệ.
 */

import { Frac } from '../fraction.ts'
import { bayesSections, probTex, solveBayes, valTex, type BayesInput, type BayesSection } from './bayes.ts'

export type Key =
  | 'A'
  | 'nA'
  | 'B'
  | 'nB'
  | 'AB'
  | 'AnB'
  | 'nAB'
  | 'nAnB'
  | 'B|A'
  | 'nB|A'
  | 'B|nA'
  | 'nB|nA'
  | 'A|B'
  | 'nA|B'
  | 'A|nB'
  | 'nA|nB'
  | 'AuB'

export const LABEL_TEX: Record<Key, string> = {
  A: 'P(A)',
  nA: 'P(\\overline{A})',
  B: 'P(B)',
  nB: 'P(\\overline{B})',
  AB: 'P(A \\cap B)',
  AnB: 'P(A \\cap \\overline{B})',
  nAB: 'P(\\overline{A} \\cap B)',
  nAnB: 'P(\\overline{A} \\cap \\overline{B})',
  'B|A': 'P(B \\mid A)',
  'nB|A': 'P(\\overline{B} \\mid A)',
  'B|nA': 'P(B \\mid \\overline{A})',
  'nB|nA': 'P(\\overline{B} \\mid \\overline{A})',
  'A|B': 'P(A \\mid B)',
  'nA|B': 'P(\\overline{A} \\mid B)',
  'A|nB': 'P(A \\mid \\overline{B})',
  'nA|nB': 'P(\\overline{A} \\mid \\overline{B})',
  AuB: 'P(A \\cup B)',
}

/** Nhãn chữ thường cho ô nhập (không qua MathJax). */
export const LABEL_PLAIN: Record<Key, string> = {
  A: 'P(A)',
  nA: 'P(Ā)',
  B: 'P(B)',
  nB: 'P(B̄)',
  AB: 'P(A∩B)',
  AnB: 'P(A∩B̄)',
  nAB: 'P(Ā∩B)',
  nAnB: 'P(Ā∩B̄)',
  'B|A': 'P(B | A)',
  'nB|A': 'P(B̄ | A)',
  'B|nA': 'P(B | Ā)',
  'nB|nA': 'P(B̄ | Ā)',
  'A|B': 'P(A | B)',
  'nA|B': 'P(Ā | B)',
  'A|nB': 'P(A | B̄)',
  'nA|nB': 'P(Ā | B̄)',
  AuB: 'P(A∪B)',
}

export const KEY_GROUPS: { title: string; keys: Key[] }[] = [
  { title: 'Xác suất của từng biến cố', keys: ['A', 'nA', 'B', 'nB'] },
  { title: 'Có điều kiện theo A (nhánh cây)', keys: ['B|A', 'nB|A', 'B|nA', 'nB|nA'] },
  { title: 'Giao (lá cây)', keys: ['AB', 'AnB', 'nAB', 'nAnB'] },
  { title: 'Có điều kiện theo B (chiều ngược)', keys: ['A|B', 'nA|B', 'A|nB', 'nA|nB'] },
  { title: 'Hợp', keys: ['AuB'] },
]

export const ALL_KEYS: Key[] = KEY_GROUPS.flatMap((g) => g.keys)

type Vec = [number, number, number, number]

/** Trọng số trên bốn lá (A∩B, A∩B̄, Ā∩B, Ā∩B̄) của các đại lượng bậc nhất. */
const LINEAR: Partial<Record<Key, Vec>> = {
  A: [1, 1, 0, 0],
  nA: [0, 0, 1, 1],
  B: [1, 0, 1, 0],
  nB: [0, 1, 0, 1],
  AB: [1, 0, 0, 0],
  AnB: [0, 1, 0, 0],
  nAB: [0, 0, 1, 0],
  nAnB: [0, 0, 0, 1],
  AuB: [1, 1, 1, 0],
}

/** Có điều kiện X | Y = P(X ∩ Y) / P(Y). */
const CONDITIONAL: Partial<Record<Key, { num: Key; den: Key }>> = {
  'B|A': { num: 'AB', den: 'A' },
  'nB|A': { num: 'AnB', den: 'A' },
  'B|nA': { num: 'nAB', den: 'nA' },
  'nB|nA': { num: 'nAnB', den: 'nA' },
  'A|B': { num: 'AB', den: 'B' },
  'nA|B': { num: 'nAB', den: 'B' },
  'A|nB': { num: 'AnB', den: 'nB' },
  'nA|nB': { num: 'nAnB', den: 'nB' },
}

export type Leaves = [Frac, Frac, Frac, Frac]

export type GivenAnalysis =
  | { status: 'empty' }
  | { status: 'contradiction'; reason: string }
  | { status: 'under'; missing: number; known: Partial<Record<Key, Frac>> }
  | { status: 'ok'; leaves: Leaves; values: Record<Key, Frac | null> }

function dot(w: Vec, x: readonly Frac[]): Frac {
  return w.reduce((acc, c, i) => (c === 0 ? acc : acc.add(x[i].mul(Frac.of(c)))), Frac.ZERO)
}

/** Giá trị mọi đại lượng từ bốn lá; có điều kiện với mẫu bằng 0 thì `null`. */
export function valuesFromLeaves(x: Leaves): Record<Key, Frac | null> {
  const out = {} as Record<Key, Frac | null>
  for (const k of ALL_KEYS) {
    const w = LINEAR[k]
    if (w) {
      out[k] = dot(w, x)
      continue
    }
    const { num, den } = CONDITIONAL[k]!
    const d = dot(LINEAR[den]!, x)
    out[k] = d.isZero() ? null : dot(LINEAR[num]!, x).div(d)
  }
  return out
}

export function analyzeGivens(given: Partial<Record<Key, Frac>>): GivenAnalysis {
  const entries = Object.entries(given) as [Key, Frac][]
  if (entries.length === 0) return { status: 'empty' }

  // Mỗi hàng: 4 hệ số | vế phải.
  const rows: Frac[][] = [[Frac.ONE, Frac.ONE, Frac.ONE, Frac.ONE, Frac.ONE]]
  for (const [k, v] of entries) {
    const w = LINEAR[k]
    if (w) {
      rows.push([...w.map((c) => Frac.of(c)), v])
    } else {
      const { num, den } = CONDITIONAL[k]!
      const n = LINEAR[num]!
      const d = LINEAR[den]!
      rows.push([...n.map((c, i) => Frac.of(c).sub(v.mul(Frac.of(d[i])))), Frac.ZERO])
    }
  }

  // Khử Gauss – Jordan chính xác.
  const pivots: number[] = []
  let r = 0
  for (let col = 0; col < 4 && r < rows.length; col++) {
    const p = rows.findIndex((row, i) => i >= r && !row[col].isZero())
    if (p < 0) continue
    ;[rows[r], rows[p]] = [rows[p], rows[r]]
    const inv = Frac.ONE.div(rows[r][col])
    rows[r] = rows[r].map((v) => v.mul(inv))
    for (let i = 0; i < rows.length; i++) {
      if (i === r || rows[i][col].isZero()) continue
      const f = rows[i][col]
      rows[i] = rows[i].map((v, j) => v.sub(f.mul(rows[r][j])))
    }
    pivots.push(col)
    r++
  }
  if (rows.some((row) => row.slice(0, 4).every((v) => v.isZero()) && !row[4].isZero())) {
    return { status: 'contradiction', reason: 'Các dữ kiện mâu thuẫn nhau — không có phân bố xác suất nào thoả cùng lúc. Kiểm tra lại các số đã nhập.' }
  }

  if (pivots.length < 4) {
    // Đại lượng bậc nhất xác định được ⇔ vectơ trọng số nằm trong không gian hàng.
    const known: Partial<Record<Key, Frac>> = {}
    const linearValue = (w: Vec): Frac | null => {
      const rest = w.map((c) => Frac.of(c))
      let value = Frac.ZERO
      pivots.forEach((col, i) => {
        const f = rest[col]
        if (f.isZero()) return
        for (let j = 0; j < 4; j++) rest[j] = rest[j].sub(f.mul(rows[i][j]))
        value = value.add(f.mul(rows[i][4]))
      })
      return rest.every((v) => v.isZero()) ? value : null
    }
    for (const k of ALL_KEYS) {
      if (given[k]) {
        known[k] = given[k]
        continue
      }
      const w = LINEAR[k]
      if (w) {
        const v = linearValue(w)
        if (v) known[k] = v
      } else {
        const { num, den } = CONDITIONAL[k]!
        const n = linearValue(LINEAR[num]!)
        const d = linearValue(LINEAR[den]!)
        if (n && d && !d.isZero()) known[k] = n.div(d)
      }
    }
    const bad = (Object.entries(known) as [Key, Frac][]).find(([, v]) => v.sign() < 0 || v.cmp(Frac.ONE) > 0)
    if (bad) {
      return {
        status: 'contradiction',
        reason: `Từ các dữ kiện suy ra $${LABEL_TEX[bad[0]]} = ${bad[1].toTex()}$, nằm ngoài đoạn $[0; 1]$ — kiểm tra lại các số đã nhập.`,
      }
    }
    return { status: 'under', missing: 4 - pivots.length, known }
  }

  const leaves = pivots.map((_, i) => rows[i][4]) as Leaves
  if (leaves.some((v) => v.sign() < 0)) {
    return {
      status: 'contradiction',
      reason: 'Các dữ kiện dẫn tới một xác suất âm — số đã nhập không thể cùng xảy ra. Kiểm tra lại đề.',
    }
  }
  const values = valuesFromLeaves(leaves)
  for (const [k, v] of entries) {
    if (CONDITIONAL[k] && values[k] === null) {
      const den = CONDITIONAL[k]!.den
      return {
        status: 'contradiction',
        reason: `Theo các dữ kiện còn lại thì $${LABEL_TEX[den]} = 0$, nên $${LABEL_TEX[k]}$ không xác định — không thể bằng $${probTex(v)}$.`,
      }
    }
  }
  return { status: 'ok', leaves, values }
}

// ─── Chuỗi suy luận bằng công thức SGK ──────────────────────────────────────

interface Rule {
  target: Key
  needs: Key[]
  name: string
  /** Công thức chữ, vd `P(\overline{A}) = 1 - P(A)`. */
  formula: string
  compute: (v: (k: Key) => Frac) => Frac | null
  /** Vế thay số. */
  subst: (s: (k: Key) => string) => string
}

const T = LABEL_TEX
const div = (a: Frac, b: Frac) => (b.isZero() ? null : a.div(b))

function buildRules(): Rule[] {
  const rules: Rule[] = []
  const complement: [Key, Key][] = [
    ['A', 'nA'],
    ['B', 'nB'],
    ['B|A', 'nB|A'],
    ['B|nA', 'nB|nA'],
    ['A|B', 'nA|B'],
    ['A|nB', 'nA|nB'],
  ]
  for (const [x, y] of complement) {
    for (const [t, f] of [
      [y, x],
      [x, y],
    ] as [Key, Key][]) {
      rules.push({
        target: t,
        needs: [f],
        name: 'Biến cố đối',
        formula: `${T[t]} = 1 - ${T[f]}`,
        compute: (v) => Frac.ONE.sub(v(f)),
        subst: (s) => `1 - ${s(f)}`,
      })
    }
  }

  // Toàn phần dạng SGK trước, rồi Bayes — để đề chuẩn ra đúng lời giải trong sách.
  rules.push({
    target: 'B',
    needs: ['A', 'B|A', 'nA', 'B|nA'],
    name: 'Công thức xác suất toàn phần',
    formula: `${T.B} = ${T.A} \\cdot ${T['B|A']} + ${T.nA} \\cdot ${T['B|nA']}`,
    compute: (v) => v('A').mul(v('B|A')).add(v('nA').mul(v('B|nA'))),
    subst: (s) => `${s('A')} \\cdot ${s('B|A')} + ${s('nA')} \\cdot ${s('B|nA')}`,
  })
  rules.push({
    target: 'A',
    needs: ['B', 'A|B', 'nB', 'A|nB'],
    name: 'Công thức xác suất toàn phần',
    formula: `${T.A} = ${T.B} \\cdot ${T['A|B']} + ${T.nB} \\cdot ${T['A|nB']}`,
    compute: (v) => v('B').mul(v('A|B')).add(v('nB').mul(v('A|nB'))),
    subst: (s) => `${s('B')} \\cdot ${s('A|B')} + ${s('nB')} \\cdot ${s('A|nB')}`,
  })
  const bayes: [Key, Key, Key, Key][] = [
    // [đích, P(điều kiện ban đầu), P(chiều xuôi), P(biến cố đã biết)]
    ['A|B', 'A', 'B|A', 'B'],
    ['nA|B', 'nA', 'B|nA', 'B'],
    ['A|nB', 'A', 'nB|A', 'nB'],
    ['nA|nB', 'nA', 'nB|nA', 'nB'],
    ['B|A', 'B', 'A|B', 'A'],
    ['B|nA', 'B', 'nA|B', 'nA'],
    ['nB|A', 'nB', 'A|nB', 'A'],
    ['nB|nA', 'nB', 'nA|nB', 'nA'],
  ]
  for (const [t, p, fwd, cond] of bayes) {
    rules.push({
      target: t,
      needs: [p, fwd, cond],
      name: 'Công thức Bayes',
      formula: `${T[t]} = \\dfrac{${T[p]} \\cdot ${T[fwd]}}{${T[cond]}}`,
      compute: (v) => div(v(p).mul(v(fwd)), v(cond)),
      subst: (s) => `\\dfrac{${s(p)} \\cdot ${s(fwd)}}{${s(cond)}}`,
    })
  }

  // Công thức nhân: lá = xác suất ở gốc nhánh × xác suất trên nhánh.
  const product: [Key, Key, Key][] = [
    ['AB', 'A', 'B|A'],
    ['AnB', 'A', 'nB|A'],
    ['nAB', 'nA', 'B|nA'],
    ['nAnB', 'nA', 'nB|nA'],
    ['AB', 'B', 'A|B'],
    ['nAB', 'B', 'nA|B'],
    ['AnB', 'nB', 'A|nB'],
    ['nAnB', 'nB', 'nA|nB'],
  ]
  for (const [leaf, m, c] of product) {
    rules.push({
      target: leaf,
      needs: [m, c],
      name: 'Công thức nhân',
      formula: `${T[leaf]} = ${T[m]} \\cdot ${T[c]}`,
      compute: (v) => v(m).mul(v(c)),
      subst: (s) => `${s(m)} \\cdot ${s(c)}`,
    })
  }
  for (const [leaf, m, c] of product) {
    rules.push({
      target: c,
      needs: [leaf, m],
      name: 'Định nghĩa xác suất có điều kiện',
      formula: `${T[c]} = \\dfrac{${T[leaf]}}{${T[m]}}`,
      compute: (v) => div(v(leaf), v(m)),
      subst: (s) => `\\dfrac{${s(leaf)}}{${s(m)}}`,
    })
  }

  // Tổng hai lá.
  const sums: [Key, Key, Key][] = [
    ['A', 'AB', 'AnB'],
    ['nA', 'nAB', 'nAnB'],
    ['B', 'AB', 'nAB'],
    ['nB', 'AnB', 'nAnB'],
  ]
  for (const [m, l1, l2] of sums) {
    rules.push({
      target: m,
      needs: [l1, l2],
      name: 'Cộng hai trường hợp rời nhau',
      formula: `${T[m]} = ${T[l1]} + ${T[l2]}`,
      compute: (v) => v(l1).add(v(l2)),
      subst: (s) => `${s(l1)} + ${s(l2)}`,
    })
  }
  for (const [m, l1, l2] of sums) {
    for (const [t, other] of [
      [l1, l2],
      [l2, l1],
    ] as [Key, Key][]) {
      rules.push({
        target: t,
        needs: [m, other],
        name: 'Cộng hai trường hợp rời nhau',
        formula: `${T[t]} = ${T[m]} - ${T[other]}`,
        compute: (v) => v(m).sub(v(other)),
        subst: (s) => `${s(m)} - ${s(other)}`,
      })
    }
  }

  // Hợp.
  rules.push(
    {
      target: 'AuB',
      needs: ['A', 'B', 'AB'],
      name: 'Công thức cộng',
      formula: `${T.AuB} = ${T.A} + ${T.B} - ${T.AB}`,
      compute: (v) => v('A').add(v('B')).sub(v('AB')),
      subst: (s) => `${s('A')} + ${s('B')} - ${s('AB')}`,
    },
    {
      target: 'AB',
      needs: ['A', 'B', 'AuB'],
      name: 'Công thức cộng',
      formula: `${T.AB} = ${T.A} + ${T.B} - ${T.AuB}`,
      compute: (v) => v('A').add(v('B')).sub(v('AuB')),
      subst: (s) => `${s('A')} + ${s('B')} - ${s('AuB')}`,
    },
    {
      target: 'A',
      needs: ['AuB', 'B', 'AB'],
      name: 'Công thức cộng',
      formula: `${T.A} = ${T.AuB} - ${T.B} + ${T.AB}`,
      compute: (v) => v('AuB').sub(v('B')).add(v('AB')),
      subst: (s) => `${s('AuB')} - ${s('B')} + ${s('AB')}`,
    },
    {
      target: 'B',
      needs: ['AuB', 'A', 'AB'],
      name: 'Công thức cộng',
      formula: `${T.B} = ${T.AuB} - ${T.A} + ${T.AB}`,
      compute: (v) => v('AuB').sub(v('A')).add(v('AB')),
      subst: (s) => `${s('AuB')} - ${s('A')} + ${s('AB')}`,
    },
    {
      target: 'nAnB',
      needs: ['AuB'],
      name: 'Biến cố đối của hợp',
      formula: `${T.nAnB} = 1 - ${T.AuB}`,
      compute: (v) => Frac.ONE.sub(v('AuB')),
      subst: (s) => `1 - ${s('AuB')}`,
    },
    {
      target: 'AuB',
      needs: ['nAnB'],
      name: 'Biến cố đối của hợp',
      formula: `${T.AuB} = 1 - ${T.nAnB}`,
      compute: (v) => Frac.ONE.sub(v('nAnB')),
      subst: (s) => `1 - ${s('nAnB')}`,
    },
  )

  // Giải ngược công thức toàn phần: biết P(B) và hai nhánh, tìm P(A).
  rules.push(
    {
      target: 'A',
      needs: ['B', 'B|A', 'B|nA'],
      name: 'Giải ngược công thức toàn phần',
      formula: `${T.B} = ${T.A} \\cdot ${T['B|A']} + (1 - ${T.A}) \\cdot ${T['B|nA']} \\;\\Rightarrow\\; ${T.A} = \\dfrac{${T.B} - ${T['B|nA']}}{${T['B|A']} - ${T['B|nA']}}`,
      compute: (v) => div(v('B').sub(v('B|nA')), v('B|A').sub(v('B|nA'))),
      subst: (s) => `\\dfrac{${s('B')} - ${s('B|nA')}}{${s('B|A')} - ${s('B|nA')}}`,
    },
    {
      target: 'B',
      needs: ['A', 'A|B', 'A|nB'],
      name: 'Giải ngược công thức toàn phần',
      formula: `${T.A} = ${T.B} \\cdot ${T['A|B']} + (1 - ${T.B}) \\cdot ${T['A|nB']} \\;\\Rightarrow\\; ${T.B} = \\dfrac{${T.A} - ${T['A|nB']}}{${T['A|B']} - ${T['A|nB']}}`,
      compute: (v) => div(v('A').sub(v('A|nB')), v('A|B').sub(v('A|nB'))),
      subst: (s) => `\\dfrac{${s('A')} - ${s('A|nB')}}{${s('A|B')} - ${s('A|nB')}}`,
    },
  )
  return rules
}

const RULES = buildRules()

export interface DerivationStep {
  target: Key
  name: string
  /** Một dòng kiểu `RichText`. */
  line: string
  value: Frac
}

export type GivenOutcome =
  | Exclude<GivenAnalysis, { status: 'ok' }>
  | { status: 'degenerate'; reason: string }
  | { status: 'ok'; input: BayesInput; values: Record<Key, Frac | null>; sections: BayesSection[]; given: Key[] }

const CANONICAL: Key[] = ['A', 'B|A', 'B|nA']
/** Khung cây + đáp án thường hỏi: lời giải phải nối được tới các đại lượng này. */
const TREE_TARGETS: Key[] = ['A', 'B|A', 'B|nA', 'B', 'A|B']

/**
 * Từ các ô học sinh đã điền tới mọi thứ công cụ cần: bộ ba dựng cây, giá trị mọi
 * ô trống, và lời giải. Đề cho đúng bộ ba SGK thì dùng lời giải bốn phần có sẵn
 * (`bayesSections`); đề cho kiểu khác thì lời giải là chuỗi suy luận.
 */
export function solveFromGivens(given: Partial<Record<Key, Frac>>): GivenOutcome {
  const a = analyzeGivens(given)
  if (a.status !== 'ok') return a
  const { values } = a
  const pA = values.A!
  if (pA.isZero() || pA.eq(Frac.ONE)) {
    return {
      status: 'degenerate',
      reason: `Theo dữ kiện thì $P(A) = ${pA.toTex()}$: một nhánh của cây có xác suất 0 nên không dựng được cây hai tầng. Đề có thể đã đổi vai A và B.`,
    }
  }
  const input: BayesInput = { pA, pBgivenA: values['B|A']!, pBgivenNotA: values['B|nA']! }
  const keys = (Object.keys(given) as Key[]).filter((k) => given[k])
  const result = solveBayes(input)
  const canonical = keys.length === CANONICAL.length && CANONICAL.every((k) => keys.includes(k))
  if (canonical) return { status: 'ok', input, values, sections: bayesSections(input, result), given: keys }

  const steps = derive(given, TREE_TARGETS)
  const reached = new Set<Key>([...keys, ...steps.map((s) => s.target)])
  const lines = steps.map((s) => s.line)
  if (TREE_TARGETS.some((k) => !reached.has(k))) {
    // Không có công thức đơn lẻ nào nối được: nói thẳng là giải hệ, và cho nghiệm.
    const names = ['AB', 'AnB', 'nAB', 'nAnB'] as const
    lines.push(
      'Các dữ kiện này không nối được bằng từng công thức riêng lẻ. Gọi bốn xác suất ở lá cây là ẩn, mỗi dữ kiện cho một phương trình bậc nhất, cùng với tổng bốn lá bằng 1. Giải hệ được:',
      `$$${names.map((k, i) => `${LABEL_TEX[k]} = ${probTex(a.leaves[i])}`).join(',\\quad ')}$$`,
      `Từ đó $${LABEL_TEX.A} = ${probTex(pA)}$, $${LABEL_TEX['B|A']} = ${probTex(input.pBgivenA)}$, $${LABEL_TEX['B|nA']} = ${probTex(input.pBgivenNotA)}$, $${LABEL_TEX.B} = ${probTex(result.pB)}$.`,
    )
  }
  if (lines.length === 0) lines.push('Đề đã cho sẵn các nhánh của cây — xem phần Bayes.')
  const bayesPart = bayesSections(input, result).find((s) => s.key === 'bayes')!
  return {
    status: 'ok',
    input,
    values,
    given: keys,
    sections: [{ key: 'derive', short: 'Suy ra từ đề', title: 'Suy ra từ dữ kiện đề cho', lines, focus: 'none' }, bayesPart],
  }
}

/**
 * Chuỗi suy luận ngắn nhất tới `targets` từ `given`. Không tới được đích nào thì
 * đích đó vắng mặt trong kết quả — người gọi tự quyết định có cần giải hệ không.
 */
export function derive(given: Partial<Record<Key, Frac>>, targets: Key[]): DerivationStep[] {
  const value = new Map<Key, Frac>(Object.entries(given) as [Key, Frac][])
  const how = new Map<Key, { rule: Rule; round: number; order: number }>()
  let order = 0
  for (let round = 0; round < 12; round++) {
    const start = new Set(value.keys())
    let changed = false
    for (const rule of RULES) {
      if (value.has(rule.target) || !rule.needs.every((k) => start.has(k))) continue
      const v = rule.compute((k) => value.get(k)!)
      if (!v || v.sign() < 0 || v.cmp(Frac.ONE) > 0) continue
      value.set(rule.target, v)
      how.set(rule.target, { rule, round, order: order++ })
      changed = true
    }
    if (!changed) break
  }

  const needed = new Set<Key>()
  const visit = (k: Key) => {
    const h = how.get(k)
    if (!h || needed.has(k)) return
    needed.add(k)
    h.rule.needs.forEach(visit)
  }
  targets.forEach(visit)

  return [...needed]
    .sort((a, b) => how.get(a)!.order - how.get(b)!.order)
    .map((k) => {
      const { rule } = how.get(k)!
      const v = value.get(k)!
      const s = (key: Key) => valTex(value.get(key)!)
      return {
        target: k,
        name: rule.name,
        value: v,
        line: `**${rule.name}:** $${rule.formula} = ${rule.subst(s)} = ${probTex(v)}$.`,
      }
    })
}
