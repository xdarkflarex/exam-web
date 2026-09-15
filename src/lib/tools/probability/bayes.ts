/**
 * Xác suất có điều kiện, công thức xác suất toàn phần và công thức Bayes —
 * logic thuần, có test.
 *
 * Theo SGK Toán 12 Kết nối tri thức (Bài 18–19), dùng sơ đồ hình cây:
 *   tầng 1 tách theo A / Ā, tầng 2 tách theo B / B̄.
 *
 *   P(A ∩ B) = P(A) · P(B | A)                          (công thức nhân)
 *   P(B)     = P(A) · P(B | A) + P(Ā) · P(B | Ā)          (xác suất toàn phần)
 *   P(A | B) = P(A) · P(B | A) / P(B)                    (Bayes)
 *
 * Mọi số là phân số chính xác — đề đúng/sai hay cho số đẹp như 0,02 hay 3/5,
 * và học sinh cần so đúng từng chữ số.
 */

import { decimalTex, Frac } from '../fraction.ts'

export type ProbResult = { ok: true; value: Frac } | { ok: false; error: string }

/** Nhận "0,02", "0.02", "2%", "1/50". */
export function parseProbability(text: string): ProbResult {
  const t = text.trim()
  if (!t) return { ok: false, error: 'Chưa nhập.' }
  const percent = /^(.*?)\s*%$/.exec(t)
  const base = Frac.parse(percent ? percent[1] : t)
  if (!base) return { ok: false, error: 'Nhập số dạng 0,02 hoặc 2% hoặc 1/50.' }
  const value = percent ? base.div(Frac.of(100)) : base
  if (value.sign() < 0 || value.cmp(Frac.ONE) > 0) return { ok: false, error: 'Xác suất phải nằm trong đoạn [0; 1].' }
  return { ok: true, value }
}

export interface BayesInput {
  pA: Frac
  pBgivenA: Frac
  pBgivenNotA: Frac
}

export interface Population {
  size: number
  /** Số người ở bốn lá; không nguyên thì đã làm tròn và `exact = false`. */
  AB: number
  AnotB: number
  notAB: number
  notAnotB: number
  exact: boolean
}

export interface BayesResult {
  pNotA: Frac
  pNotBgivenA: Frac
  pNotBgivenNotA: Frac
  pAB: Frac
  pANotB: Frac
  pNotAB: Frac
  pNotANotB: Frac
  pB: Frac
  pNotB: Frac
  /** null khi mẫu bằng 0 (biến cố điều kiện không thể xảy ra). */
  pAgivenB: Frac | null
  pNotAgivenB: Frac | null
  pAgivenNotB: Frac | null
  population: Population
}

function lcmBig(a: bigint, b: bigint): bigint {
  let x = a
  let y = b
  while (y !== BigInt(0)) {
    const t = x % y
    x = y
    y = t
  }
  return (a / x) * b
}

/** Chọn cỡ "N người" để bốn lá là số nguyên: ưu tiên 100, 1000, 10 000… */
function choosePopulation(leaves: Frac[]): Population {
  let L = BigInt(1)
  for (const f of leaves) L = lcmBig(L, f.d)
  let size: bigint | null = null
  for (let p = BigInt(100); p <= BigInt(1_000_000); p *= BigInt(10)) {
    if (p % L === BigInt(0)) {
      size = p
      break
    }
  }
  if (size === null && L <= BigInt(100_000)) size = L
  const exact = size !== null
  const N = size ?? BigInt(10_000)
  const count = (f: Frac) => (exact ? Number((f.n * N) / f.d) : Math.round(f.toNumber() * Number(N)))
  const [AB, AnotB, notAB, notAnotB] = leaves.map(count)
  return { size: Number(N), AB, AnotB, notAB, notAnotB, exact }
}

export function solveBayes({ pA, pBgivenA, pBgivenNotA }: BayesInput): BayesResult {
  const one = Frac.ONE
  const pNotA = one.sub(pA)
  const pNotBgivenA = one.sub(pBgivenA)
  const pNotBgivenNotA = one.sub(pBgivenNotA)
  const pAB = pA.mul(pBgivenA)
  const pANotB = pA.mul(pNotBgivenA)
  const pNotAB = pNotA.mul(pBgivenNotA)
  const pNotANotB = pNotA.mul(pNotBgivenNotA)
  const pB = pAB.add(pNotAB)
  const pNotB = one.sub(pB)
  return {
    pNotA,
    pNotBgivenA,
    pNotBgivenNotA,
    pAB,
    pANotB,
    pNotAB,
    pNotANotB,
    pB,
    pNotB,
    pAgivenB: pB.isZero() ? null : pAB.div(pB),
    pNotAgivenB: pB.isZero() ? null : pNotAB.div(pB),
    pAgivenNotB: pNotB.isZero() ? null : pANotB.div(pNotB),
    population: choosePopulation([pAB, pANotB, pNotAB, pNotANotB]),
  }
}

// ─── Trình bày ──────────────────────────────────────────────────────────────

/**
 * Xác suất viết như trong đề: thập phân hữu hạn thì 0,0198; không thì phân số
 * (mẫu nhỏ) hoặc ≈ bốn chữ số. Dạng TeX đi qua `decimalTex`.
 */
export function probTex(f: Frac): string {
  const d = f.toDecimal(6)
  if (d.exact) return decimalTex(d.text)
  if (f.d <= BigInt(1000)) return `${f.toTex()} \\approx ${decimalTex(f.toDecimal(4).text)}`
  return `\\approx ${decimalTex(f.toDecimal(4).text)}`
}

/** Chỉ con số, không kèm ≈ — dùng giữa biểu thức. */
export function valTex(f: Frac): string {
  const d = f.toDecimal(6)
  if (d.exact) return decimalTex(d.text)
  return f.d <= BigInt(1000) ? f.toTex() : decimalTex(f.toDecimal(4).text)
}

export function formatPercent(f: Frac, digits = 1): string {
  return `${f.mul(Frac.of(100)).toDecimal(digits).text}%`
}

export interface BayesSection {
  key: 'complement' | 'multiply' | 'total' | 'bayes' | 'derive'
  /** Nhãn trên tab. */
  short: string
  title: string
  lines: string[]
  /** Nhánh cần tô sáng trên cây. */
  focus: 'none' | 'A' | 'B' | 'AB'
}

export function bayesSections(input: BayesInput, r: BayesResult): BayesSection[] {
  const { pA, pBgivenA, pBgivenNotA } = input
  const out: BayesSection[] = [
    {
      key: 'complement',
      short: 'Biến cố đối',
      title: 'Xác suất của biến cố đối',
      lines: [
        `$P(\\overline{A}) = 1 - P(A) = 1 - ${valTex(pA)} = ${probTex(r.pNotA)}$.`,
        `$P(\\overline{B} \\mid A) = 1 - ${valTex(pBgivenA)} = ${probTex(r.pNotBgivenA)}$ và $P(\\overline{B} \\mid \\overline{A}) = 1 - ${valTex(pBgivenNotA)} = ${probTex(r.pNotBgivenNotA)}$.`,
      ],
      focus: 'A',
    },
    {
      key: 'multiply',
      short: 'Công thức nhân',
      title: 'Công thức nhân — đi dọc một nhánh cây',
      lines: [
        `$P(A \\cap B) = P(A) \\cdot P(B \\mid A) = ${valTex(pA)} \\cdot ${valTex(pBgivenA)} = ${probTex(r.pAB)}$.`,
        `$P(\\overline{A} \\cap B) = P(\\overline{A}) \\cdot P(B \\mid \\overline{A}) = ${valTex(r.pNotA)} \\cdot ${valTex(pBgivenNotA)} = ${probTex(r.pNotAB)}$.`,
        'Xác suất của một lá bằng **tích** các xác suất trên đường đi từ gốc tới lá đó.',
      ],
      focus: 'AB',
    },
    {
      key: 'total',
      short: 'Toàn phần',
      title: 'Công thức xác suất toàn phần',
      lines: [
        'Biến cố $B$ xảy ra theo **hai** nhánh: qua $A$ hoặc qua $\\overline{A}$. Cộng hai lá có $B$:',
        `$$P(B) = P(A) \\cdot P(B \\mid A) + P(\\overline{A}) \\cdot P(B \\mid \\overline{A}) = ${valTex(r.pAB)} + ${valTex(r.pNotAB)} = ${probTex(r.pB)}$$`,
      ],
      focus: 'B',
    },
  ]
  if (r.pAgivenB === null) {
    out.push({
      key: 'bayes',
      short: 'Bayes',
      title: 'Công thức Bayes',
      lines: ['$P(B) = 0$ nên không tính được $P(A \\mid B)$ — biến cố $B$ không thể xảy ra.'],
      focus: 'B',
    })
  } else {
    out.push({
      key: 'bayes',
      short: 'Bayes',
      title: 'Công thức Bayes — biết B đã xảy ra, cập nhật khả năng của A',
      lines: [
        `$$P(A \\mid B) = \\dfrac{P(A) \\cdot P(B \\mid A)}{P(B)} = \\dfrac{${valTex(r.pAB)}}{${valTex(r.pB)}} = ${probTex(r.pAgivenB)}$$`,
        `Tức là khoảng **${formatPercent(r.pAgivenB)}** — trước khi biết $B$, khả năng của $A$ chỉ là ${formatPercent(pA)}.`,
        `Tương tự $P(\\overline{A} \\mid B) = 1 - P(A \\mid B) = ${probTex(r.pNotAgivenB!)}$.`,
      ],
      focus: 'AB',
    })
  }
  return out
}

// ─── Luyện câu đúng/sai (Phần II của đề) ────────────────────────────────────

export interface TrueFalseItem {
  key: string
  statement: string
  correct: boolean
  explain: string
}

/**
 * Bốn mệnh đề kiểu đề thi. Mệnh đề SAI không bịa số ngẫu nhiên mà dựng từ các
 * lỗi học sinh hay mắc thật: lấy P(B | A) làm P(B), nhân như hai biến cố độc lập,
 * và nhầm P(A | B) với P(B | A). Chọn mệnh đề nào sai theo dữ liệu, cố định —
 * cùng một đề thì cùng một bộ câu.
 */
export function trueFalseItems(input: BayesInput, r: BayesResult): TrueFalseItem[] {
  const { pA, pBgivenA } = input
  const seed = Number((pA.n * BigInt(7) + pBgivenA.n * BigInt(3) + r.pB.d) % BigInt(16))
  const wantFalse = (i: number) => ((seed >> i) & 1) === 1

  const make = (key: string, i: number, lhs: string, truth: Frac, wrong: Frac, why: string, trap: string): TrueFalseItem => {
    const useFalse = wantFalse(i) && !wrong.eq(truth)
    const shown = useFalse ? wrong : truth
    return {
      key,
      statement: `$${lhs} = ${valTex(shown)}$`,
      correct: !useFalse,
      explain: useFalse ? `Sai. ${trap} Đúng phải là $${lhs} = ${probTex(truth)}$.` : `Đúng. ${why}`,
    }
  }

  const items = [
    make('notA', 0, 'P(\\overline{A})', r.pNotA, pA, `$P(\\overline{A}) = 1 - P(A)$.`, 'Đây là $P(A)$, chưa lấy phần bù.'),
    make(
      'AB',
      1,
      'P(A \\cap B)',
      r.pAB,
      pA.mul(r.pB),
      '$P(A \\cap B) = P(A) \\cdot P(B \\mid A)$.',
      'Đã nhân $P(A) \\cdot P(B)$ như thể $A$, $B$ độc lập — chúng không độc lập.',
    ),
    make(
      'B',
      2,
      'P(B)',
      r.pB,
      pBgivenA,
      'Theo công thức xác suất toàn phần, cộng cả hai nhánh.',
      'Đây mới là $P(B \\mid A)$ — quên nhánh đi qua $\\overline{A}$.',
    ),
  ]
  if (r.pAgivenB) {
    items.push(
      make(
        'AgivenB',
        3,
        'P(A \\mid B)',
        r.pAgivenB,
        pBgivenA,
        'Theo công thức Bayes.',
        'Đây là $P(B \\mid A)$ — nhầm chiều của xác suất có điều kiện, lỗi phổ biến nhất.',
      ),
    )
  }
  return items
}
