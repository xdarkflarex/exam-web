/**
 * Lời giải từng bước của công cụ khảo sát hàm số, viết như bài giải tay theo SGK.
 *
 * Mỗi bước mang `stage` — bảng biến thiên và đồ thị đã lộ tới đâu — để hình đi
 * cùng lời giải, và `predicts` — các câu hỏi chế độ Tự làm hỏi TRƯỚC khi hiện
 * bước đó (nguyên tắc N1, docs/STUDENT_TOOLS_ROADMAP.md).
 *
 * Chuỗi dùng cú pháp của `RichText`: `$…$`, `$$…$$`, `**…**`.
 */

import { decimalTex, Frac } from '../fraction.ts'
import type { Analysis, Bound, Column, Limit, Sign } from './analyze.ts'
import { evaluateFrac } from './analyze.ts'
import { Poly, type Root } from './poly.ts'
import { Surd } from './surd.ts'

export interface ChoiceOption {
  id: string
  label: string
}

export interface FnPrediction {
  id: string
  question: string
  options: ChoiceOption[]
  correct: string
  explain: string
  /** Câu dấu y′: chỉ số khoảng trong `analysis.intervals`. */
  interval?: number
}

/** Bảng biến thiên lộ tới đâu: 0 chưa có · 1 dòng x · 2 dấu y′ · 3 giá trị cực trị · 4 giới hạn · 5 mũi tên. */
export type TableLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface FnStage {
  table: TableLevel
  extrema: boolean
  asymptotes: boolean
  special: boolean
  /** Chế độ Tự làm chỉ vẽ đường cong ở bước cuối, kẻo đồ thị lộ dấu y′. */
  curve: boolean
}

export type StepKey = 'domain' | 'derivative' | 'roots' | 'sign' | 'extrema' | 'limits' | 'table' | 'graph'

export interface FnStep {
  key: StepKey
  title: string
  lines: string[]
  predicts: FnPrediction[]
  stage: FnStage
  /** Hình trước khi trả lời câu hỏi của bước (Tự làm). */
  preStage?: FnStage
}

const S = (table: TableLevel, extrema = false, asymptotes = false, special = false, curve = false): FnStage => ({
  table,
  extrema,
  asymptotes,
  special,
  curve,
})

// ── Định dạng ───────────────────────────────────────────────────────────────

export const infTex = (s: Sign) => (s > 0 ? '+\\infty' : '-\\infty')

export function limitTex(l: Limit): string {
  return l.kind === 'inf' ? infTex(l.sign) : l.value.toTex()
}

export function boundTex(b: Bound): string {
  return b.kind === 'inf' ? infTex(b.sign) : b.value.toTex()
}

export function intervalTex(a: Bound, b: Bound): string {
  return `(${boundTex(a)}; ${boundTex(b)})`
}

/** Bọc ngoặc số âm khi đứng sau phép nhân hoặc làm cơ số: `(-2)`. */
function m(f: Frac): string {
  return f.sign() < 0 ? `(${f.toTex()})` : f.toTex()
}

/** `-9{,}66` — số thực làm tròn 2 chữ số, kiểu Việt Nam. */
export function approxTex(v: number): string {
  return decimalTex(Frac.of(Math.round(v * 100), 100).toDecimal(2).text)
}

function surdWithApprox(s: Surd): string {
  return s.isRational() ? s.toTex() : `${s.toTex()} \\approx ${approxTex(s.toNumber())}`
}

export function pointTex(x: Surd | Frac, y: Surd | Frac): string {
  return `(${x.toTex()}; ${y.toTex()})`
}

/** `x = 0$ hoặc $x = \pm 1` — phần giữa của một chuỗi `$…$`. Gộp cặp nghiệm đối nhau. */
export function rootsListTex(roots: Root[]): string {
  const used = new Set<number>()
  const parts: string[] = []
  const pairs: string[] = []
  roots.forEach((r, i) => {
    if (used.has(i)) return
    if (r.value.sign() > 0) {
      const j = roots.findIndex((o, k) => !used.has(k) && o.value.eq(r.value.neg()))
      if (j >= 0) {
        used.add(i).add(j)
        pairs.push(`x = \\pm ${r.value.toTex()}`)
        return
      }
    }
    if (r.value.sign() < 0 && roots.some((o, k) => k !== i && o.value.eq(r.value.neg()))) return
    used.add(i)
    parts.push(`x = ${r.value.toTex()}${r.multiplicity >= 2 ? ' \\text{ (nghiệm kép)}' : ''}`)
  })
  return [...parts, ...pairs].join('$ hoặc $')
}

function leadTermTex(p: Poly): string {
  const c = Array.from({ length: p.degree + 1 }, (_, i) => (i === p.degree ? p.lead() : Frac.ZERO))
  return new Poly(c).toTex()
}

function monotoneText(a: Analysis, sign: Sign): string | null {
  const runs = a.monotone.filter((r) => r.sign === sign)
  if (runs.length === 0) return null
  const verb = sign > 0 ? '**đồng biến**' : '**nghịch biến**'
  if (runs.length === 1 && runs[0].from.kind === 'inf' && runs[0].to.kind === 'inf') return `${verb} trên $\\mathbb{R}$`
  const list = runs.map((r) => `$${intervalTex(r.from, r.to)}$`).join(' và ')
  return `${verb} trên ${runs.length > 1 ? 'các khoảng' : 'khoảng'} ${list}`
}

function poleTex(x0: Frac, side: '-' | '+'): string {
  return `x \\to ${m(x0)}^{${side}}`
}

// ── Các bước ────────────────────────────────────────────────────────────────

function domainStep(a: Analysis): FnStep {
  const lines =
    a.pole === null
      ? ['Hàm số là đa thức nên xác định với mọi số thực $x$.', '$D = \\mathbb{R}$.']
      : [
          `Hàm số xác định khi mẫu khác 0: $${a.fn.den.toTex()} \\neq 0 \\iff x \\neq ${a.pole.toTex()}$.`,
          `$D = \\mathbb{R} \\setminus \\{${a.pole.toTex()}\\}$.`,
        ]
  return { key: 'domain', title: 'Bước 1. Tập xác định', lines, predicts: [], stage: S(0) }
}

function derivativeStep(a: Analysis): FnStep {
  const { num, den } = a.fn
  const lines: string[] = []
  if (a.pole === null) {
    lines.push(`$$y' = ${a.derivNum.toTex()}$$`)
  } else if (a.fn.kind === 'homographic') {
    const [aa, b, c, d] = [num.coef(1), num.coef(0), den.coef(1), den.coef(0)]
    lines.push("Áp dụng công thức $\\left(\\dfrac{ax + b}{cx + d}\\right)' = \\dfrac{ad - bc}{(cx + d)^2}$:")
    lines.push(
      `$$y' = \\frac{${m(aa)} \\cdot ${m(d)} - ${m(b)} \\cdot ${m(c)}}{(${den.toTex()})^2} = \\frac{${a.derivNum.toTex()}}{(${den.toTex()})^2}$$`,
    )
  } else {
    const dPrime = den.derivative().coef(0)
    const times = dPrime.eq(Frac.ONE) ? '' : ` \\cdot ${m(dPrime)}`
    lines.push("Áp dụng công thức $\\left(\\dfrac{u}{v}\\right)' = \\dfrac{u'v - uv'}{v^2}$:")
    lines.push(
      `$$y' = \\frac{(${num.derivative().toTex()})(${den.toTex()}) - (${num.toTex()})${times}}{(${den.toTex()})^2} = \\frac{${a.derivNum.toTex()}}{(${den.toTex()})^2}$$`,
    )
  }
  return { key: 'derivative', title: 'Bước 2. Tính đạo hàm', lines, predicts: [], stage: S(0) }
}

function rootsStep(a: Analysis): FnStep {
  const P = a.derivNum
  const lines: string[] = []
  const denTex = a.fn.den.toTex()
  if (P.degree === 0) {
    const k = P.c[0]
    const rel = k.sign() < 0 ? '<' : '>'
    lines.push(
      `Tử số $${k.toTex()} ${rel} 0$ và $(${denTex})^2 > 0$ với mọi $x \\neq ${a.pole!.toTex()}$, nên $y' ${rel} 0$ với mọi $x \\in D$.`,
    )
    lines.push("Phương trình $y' = 0$ **vô nghiệm**.")
  } else {
    lines.push(
      a.pole === null
        ? `$y' = 0 \\iff ${P.toTex()} = 0$`
        : `$y' = 0 \\iff ${P.toTex()} = 0$ (với $x \\neq ${a.pole.toTex()}$)`,
    )
    let k = 0
    while (P.coef(k).isZero()) k++
    const rest = new Poly(P.c.slice(k))
    if (k > 0 && rest.degree >= 1) lines.push(`$\\iff x${k > 1 ? `^${k}` : ''}(${rest.toTex()}) = 0$`)
    if (rest.degree === 2) {
      const [C, B, A] = rest.c
      if (B.isZero()) {
        const q = C.neg().div(A)
        const tail = k > 0 ? `$x = 0$ hoặc ` : ''
        lines.push(`$\\iff$ ${tail}$x^2 = ${q.toTex()}$${q.sign() < 0 ? ' (vô nghiệm vì $x^2 \\geq 0$)' : ''}`)
      } else {
        const delta = B.mul(B).sub(Frac.of(4).mul(A).mul(C))
        const verdict = delta.sign() < 0 ? ' < 0$ nên vô nghiệm' : delta.isZero() ? '$ nên có nghiệm kép' : ' > 0$'
        lines.push(
          `Xét $${rest.toTex()} = 0$: $\\Delta = ${m(B)}^2 - 4 \\cdot ${m(A)} \\cdot ${m(C)} = ${delta.toTex()}${verdict}.`,
        )
      }
    }
    lines.push(a.roots.length === 0 ? "Vậy phương trình $y' = 0$ **vô nghiệm**." : `$\\iff ${rootsListTex(a.roots)}$.`)
  }

  const max = Math.max(2, P.degree)
  const options = Array.from({ length: max + 1 }, (_, i) => ({ id: String(i), label: i === 0 ? 'Vô nghiệm' : `${i} nghiệm` }))
  const predicts: FnPrediction[] = [
    {
      id: 'count',
      question: "Phương trình $y' = 0$ có bao nhiêu nghiệm phân biệt?",
      options,
      correct: String(a.roots.length),
      explain: a.roots.length === 0 ? "$y' = 0$ vô nghiệm." : `Các nghiệm: $${rootsListTex(a.roots)}$.`,
    },
  ]
  return { key: 'roots', title: "Bước 3. Giải phương trình $y' = 0$", lines, predicts, stage: S(1), preStage: S(0) }
}

function signStep(a: Analysis): FnStep {
  const lines: string[] = []
  const predicts: FnPrediction[] = []
  const bounds = a.columns.map(boundOf)
  a.intervals.forEach((iv, i) => {
    const iTex = intervalTex(bounds[iv.from], bounds[iv.to])
    const rel = iv.sign > 0 ? '> 0' : '< 0'
    const probe = `$y'(${iv.test.toTex()}) = ${iv.testValue.toTex()} ${rel}$`
    lines.push(`Trên $${iTex}$: thử $x = ${iv.test.toTex()}$, ${probe}.`)
    predicts.push({
      id: `iv${i}`,
      interval: i,
      question: `Trên khoảng $${iTex}$, $y'$ mang dấu gì?`,
      options: [
        { id: '+', label: "$y' > 0$" },
        { id: '-', label: "$y' < 0$" },
      ],
      correct: iv.sign > 0 ? '+' : '-',
      explain: `Thử $x = ${iv.test.toTex()}$: ${probe}.`,
    })
  })
  a.columns.forEach((col) => {
    if (col.kind === 'crit' && col.extremum === null) {
      lines.push(`Tại $x = ${col.x.toTex()}$ (nghiệm bội chẵn), $y'$ không đổi dấu.`)
    }
  })
  const parts = [monotoneText(a, 1), monotoneText(a, -1)].filter(Boolean)
  lines.push(`Vậy hàm số ${parts.join('; ')}.`)
  return { key: 'sign', title: "Bước 4. Xét dấu $y'$ — chiều biến thiên", lines, predicts, stage: S(2), preStage: S(1) }
}

function extremaStep(a: Analysis): FnStep {
  const lines: string[] = []
  const crits = a.columns.filter((c): c is Extract<Column, { kind: 'crit' }> => c.kind === 'crit')
  for (const c of crits) {
    if (c.extremum) {
      const name = c.extremum === 'max' ? 'cực đại' : 'cực tiểu'
      const sub = c.extremum === 'max' ? 'CĐ' : 'CT'
      lines.push(
        `Hàm số đạt **${name}** tại $x = ${c.x.toTex()}$, $y_{\\text{${sub}}} = y(${c.x.toTex()}) = ${surdWithApprox(c.y)}$.`,
      )
    } else {
      lines.push(`Tại $x = ${c.x.toTex()}$ tuy $y' = 0$ nhưng $y'$ không đổi dấu, nên đó **không phải** điểm cực trị.`)
    }
  }
  if (!crits.some((c) => c.extremum)) {
    lines.push(
      a.pole === null
        ? "$y'$ không đổi dấu nên hàm số **không có cực trị**."
        : "$y'$ không đổi dấu trên từng khoảng xác định nên hàm số **không có cực trị**.",
    )
  }

  const maxima = crits.filter((c) => c.extremum === 'max')
  const minima = crits.filter((c) => c.extremum === 'min')
  let predict: FnPrediction
  const choices = crits.map((c) => ({ id: c.x.toTex(), label: `$x = ${c.x.toTex()}$` }))
  if (crits.length > 0 && maxima.length <= 1 && !(maxima.length === 0 && minima.length === 1)) {
    predict = {
      id: 'max',
      question: 'Hàm số đạt **cực đại** tại điểm nào?',
      options: [...choices, { id: 'none', label: 'Không có cực đại' }],
      correct: maxima[0]?.x.toTex() ?? 'none',
      explain: "Cực đại là điểm mà $y'$ đổi dấu từ $+$ sang $-$ khi $x$ đi qua.",
    }
  } else if (crits.length > 0 && minima.length === 1) {
    predict = {
      id: 'min',
      question: 'Hàm số đạt **cực tiểu** tại điểm nào?',
      options: [...choices, { id: 'none', label: 'Không có cực tiểu' }],
      correct: minima[0].x.toTex(),
      explain: "Cực tiểu là điểm mà $y'$ đổi dấu từ $-$ sang $+$ khi $x$ đi qua.",
    }
  } else {
    predict = {
      id: 'any',
      question: 'Hàm số có điểm cực trị không?',
      options: [
        { id: 'yes', label: 'Có' },
        { id: 'no', label: 'Không' },
      ],
      correct: crits.some((c) => c.extremum) ? 'yes' : 'no',
      explain: "Hàm số chỉ có cực trị tại điểm mà $y'$ đổi dấu.",
    }
  }
  return { key: 'extrema', title: 'Bước 5. Cực trị', lines, predicts: [predict], stage: S(3, true), preStage: S(2) }
}

function limitsStep(a: Analysis): FnStep {
  const lines: string[] = []
  const first = a.columns[0] as Extract<Column, { kind: 'minusInf' }>
  const last = a.columns[a.columns.length - 1] as Extract<Column, { kind: 'plusInf' }>
  const { num, den } = a.fn
  const atInf = `$\\lim\\limits_{x \\to -\\infty} y = ${limitTex(first.limit)}$; $\\lim\\limits_{x \\to +\\infty} y = ${limitTex(last.limit)}$`

  if (a.pole === null) {
    lines.push(`Khi $x \\to \\pm\\infty$, số hạng bậc cao nhất $${leadTermTex(num)}$ quyết định dấu và độ lớn của $y$:`)
    lines.push(`${atInf}.`)
    lines.push('Đồ thị hàm đa thức **không có tiệm cận**.')
  } else {
    const poleCol = a.columns.find((c): c is Extract<Column, { kind: 'pole' }> => c.kind === 'pole')!
    if (a.horizontal) {
      lines.push(
        `$\\lim\\limits_{x \\to \\pm\\infty} y = ${a.horizontal.toTex()}$ nên đường thẳng $y = ${a.horizontal.toTex()}$ là **tiệm cận ngang**.`,
      )
    } else if (a.oblique) {
      const { r } = num.divmod(den)
      lines.push(`Chia tử cho mẫu: $y = ${a.oblique.toTex()} + \\dfrac{${r.toTex()}}{${den.toTex()}}$.`)
      lines.push(
        `$\\lim\\limits_{x \\to \\pm\\infty} \\left[y - (${a.oblique.toTex()})\\right] = \\lim\\limits_{x \\to \\pm\\infty} \\dfrac{${r.toTex()}}{${den.toTex()}} = 0$ nên đường thẳng $y = ${a.oblique.toTex()}$ là **tiệm cận xiên**.`,
      )
      lines.push(`${atInf}.`)
    }
    lines.push(
      `$\\lim\\limits_{${poleTex(a.pole, '-')}} y = ${limitTex(poleCol.left)}$; $\\lim\\limits_{${poleTex(a.pole, '+')}} y = ${limitTex(poleCol.right)}$ nên đường thẳng $x = ${a.pole.toTex()}$ là **tiệm cận đứng**.`,
    )
  }

  const options: ChoiceOption[] = [
    { id: '+inf', label: '$+\\infty$' },
    { id: '-inf', label: '$-\\infty$' },
  ]
  let correct = last.limit.kind === 'inf' ? (last.limit.sign > 0 ? '+inf' : '-inf') : 'finite'
  if (last.limit.kind === 'finite') {
    const L = last.limit.value
    const decoy = L.isZero() ? Frac.ONE : Frac.ZERO
    options.push({ id: 'L', label: `$${L.toTex()}$` }, { id: 'decoy', label: `$${decoy.toTex()}$` })
    correct = 'L'
  } else {
    options.push({ id: 'finite', label: 'Một số hữu hạn' })
  }
  const explain =
    a.pole === null
      ? `Số hạng bậc cao nhất $${leadTermTex(num)}$ quyết định: $y \\to ${limitTex(last.limit)}$.`
      : a.horizontal
        ? `Chia cả tử và mẫu cho $x$: $y \\to \\dfrac{${num.coef(1).toTex()}}{${den.coef(1).toTex()}} = ${a.horizontal.toTex()}$.`
        : `Tử bậc cao hơn mẫu nên $|y|$ lớn vô hạn; dấu theo $\\dfrac{${leadTermTex(num)}}{${leadTermTex(den)}}$.`
  const predicts: FnPrediction[] = [
    { id: 'plusInf', question: 'Khi $x \\to +\\infty$ thì $y$ dần tới đâu?', options, correct, explain },
  ]
  return {
    key: 'limits',
    title: a.pole === null ? 'Bước 6. Giới hạn tại vô cực' : 'Bước 6. Giới hạn và tiệm cận',
    lines,
    predicts,
    stage: S(4, true, true),
    preStage: S(3, true),
  }
}

function tableStep(a: Analysis): FnStep {
  const lines = [
    'Tổng hợp các bước trên vào bảng biến thiên.',
    'Mũi tên **đi lên** ứng với khoảng đồng biến ($y\' > 0$), **đi xuống** ứng với khoảng nghịch biến ($y\' < 0$).',
  ]
  if (a.pole !== null) {
    lines.push(`Hai vạch song song tại $x = ${a.pole.toTex()}$: hàm số không xác định tại đó, hai bên $y$ ra vô cực.`)
  }
  return { key: 'table', title: 'Bước 7. Bảng biến thiên', lines, predicts: [], stage: S(5, true, true) }
}

function graphStep(a: Analysis): FnStep {
  const lines: string[] = []
  if (a.yIntercept) lines.push(`Đồ thị cắt trục $Oy$ tại điểm $(0; ${a.yIntercept.toTex()})$.`)
  if (a.xIntercepts) {
    const xs = a.xIntercepts
    if (xs.length === 0) lines.push('Đồ thị **không cắt** trục $Ox$.')
    else {
      const approx = xs.some((r) => !r.value.isRational())
        ? ` (${xs.map((r) => `$${approxTex(r.value.toNumber())}$`).join('; ')})`
        : ''
      lines.push(`Đồ thị cắt trục $Ox$ tại các điểm có hoành độ $${rootsListTex(xs)}$${approx}.`)
    }
  }
  if (a.center && a.fn.kind === 'cubic') {
    lines.push(`Đồ thị hàm số bậc ba nhận điểm $I${pointTex(a.center.x, a.center.y)}$ làm **tâm đối xứng** (hoành độ $x_I = -\\dfrac{b}{3a}$).`)
  } else if (a.center) {
    lines.push(`Đồ thị nhận giao điểm hai tiệm cận $I${pointTex(a.center.x, a.center.y)}$ làm **tâm đối xứng**.`)
  }
  if (a.axis?.even) {
    lines.push('Hàm số chẵn ($y(-x) = y(x)$) nên đồ thị nhận trục $Oy$ làm **trục đối xứng**.')
  } else if (a.axis) {
    const vy = evaluateFrac(a.fn, a.axis.x)
    lines.push(`Đồ thị là parabol có đỉnh $I${pointTex(a.axis.x, vy)}$ và **trục đối xứng** $x = ${a.axis.x.toTex()}$.`)
  }
  return { key: 'graph', title: 'Bước 8. Vẽ đồ thị', lines, predicts: [], stage: S(5, true, true, true, true) }
}

function boundOf(col: Column): Bound {
  if (col.kind === 'minusInf') return { kind: 'inf', sign: -1 }
  if (col.kind === 'plusInf') return { kind: 'inf', sign: 1 }
  return { kind: 'x', value: col.kind === 'crit' ? col.x : Surd.frac(col.x) }
}

export function buildSteps(a: Analysis): FnStep[] {
  return [domainStep(a), derivativeStep(a), rootsStep(a), signStep(a), extremaStep(a), limitsStep(a), tableStep(a), graphStep(a)]
}
