/**
 * Lời giải từng bước của công cụ tích phân, viết như bài giải tay theo SGK.
 *
 * Mỗi bước mang `stage` — hình đã lộ tới đâu — để đồ thị đi cùng lời giải, và
 * `predicts` — câu hỏi chế độ Tự làm hỏi TRƯỚC khi hiện bước đó (nguyên tắc N1,
 * docs/STUDENT_TOOLS_ROADMAP.md).
 *
 * Chuỗi dùng cú pháp của `RichText`: `$…$`, `$$…$$`, `**…**`.
 */

import { decimalTex, Frac } from '../fraction.ts'
import { Poly, type Root } from '../poly.ts'
import { Surd } from '../surd.ts'
import type { IntegralAnalysis } from './analyze.ts'
import { RIEMANN_LABEL, type Piece } from './integrate.ts'

export interface ChoiceOption {
  id: string
  label: string
}

export interface IntPrediction {
  id: string
  question: string
  options: ChoiceOption[]
  correct: string
  explain: string
  /** Câu hỏi về dấu trên một khúc: chỉ số khúc trong `analysis.pieces`. */
  piece?: number
}

export interface IntStage {
  /** Mốc cận và giao điểm trên trục hoành. */
  marks: boolean
  /** Tô vùng giữa hai đường, xanh khi f ở trên, hồng khi f ở dưới. */
  shade: boolean
  /** Hình chữ nhật của tổng Riemann. */
  rects: boolean
  /** Ghi giá trị từng khúc lên hình. */
  values: boolean
}

export type IntStepKey =
  | 'setup'
  | 'partition'
  | 'sum'
  | 'converge'
  | 'intersect'
  | 'sign'
  | 'absolute'
  | 'antiderivative'
  | 'newton'
  | 'pieces'
  | 'total'
  | 'compare'

export interface IntStep {
  key: IntStepKey
  title: string
  lines: string[]
  predicts: IntPrediction[]
  stage: IntStage
  /** Hình trước khi trả lời câu hỏi của bước (Tự làm). */
  preStage?: IntStage
}

const S = (marks: boolean, shade: boolean, rects = false, values = false): IntStage => ({ marks, shade, rects, values })

// ── Định dạng ───────────────────────────────────────────────────────────────

/** `-9{,}66` — số thực làm tròn 2 chữ số, kiểu Việt Nam. */
export function approxTex(v: number): string {
  return decimalTex(Frac.of(Math.round(v * 100), 100).toDecimal(2).text)
}

/** Giá trị chính xác, kèm số thập phân khi cần: `\frac{4}{3} \approx 1{,}33`. */
export function valueTex(s: Surd): string {
  if (s.isRational()) {
    const f = s.toFrac()!
    const d = f.toDecimal(2)
    return d.exact ? f.toTex() : `${f.toTex()} \\approx ${decimalTex(d.text)}`
  }
  return `${s.toTex()} \\approx ${approxTex(s.toNumber())}`
}

function fracTex(f: Frac): string {
  const d = f.toDecimal(2)
  return d.exact ? f.toTex() : `${f.toTex()} \\approx ${decimalTex(d.text)}`
}

function intervalTex(p: Piece): string {
  return `(${p.from.toTex()}; ${p.to.toTex()})`
}

/** `\int_{a}^{b} (x^2 + 1) \, dx` — bọc ngoặc khi biểu thức có nhiều số hạng. */
function integralTex(body: string, from: Surd, to: Surd, variable: string, wrap = true): string {
  const inner = wrap ? `\\left(${body}\\right)` : body
  return `\\int_{${from.toTex()}}^{${to.toTex()}} ${inner} \\, d${variable}`
}

function rootsTex(roots: Root[], variable: string): string {
  return roots.map((r) => `${variable} = ${r.value.toTex()}`).join('$ hoặc $')
}

function diffTex(a: IntegralAnalysis): string {
  return a.diff.toTex(a.variable)
}

// ── Bước dùng chung ─────────────────────────────────────────────────────────

function antiderivativeStep(a: IntegralAnalysis, index: number): IntStep {
  const v = a.variable
  const lines = [
    `Dùng công thức nguyên hàm của luỹ thừa: $\\displaystyle\\int ${v}^{n} \\, d${v} = \\frac{${v}^{n+1}}{n+1} + C$ (với $n \\neq -1$).`,
    `$$F(${v}) = \\int \\left(${diffTex(a)}\\right) d${v} = ${a.F.toTex(v)} + C$$`,
    'Tính tích phân xác định thì lấy $C = 0$: hằng số bị triệt tiêu khi trừ hai đầu.',
  ]
  return {
    key: 'antiderivative',
    title: `Bước ${index}. Tìm nguyên hàm`,
    lines,
    predicts: [],
    stage: S(true, true),
  }
}

/** `\left(F\right)\Big|_a^b = F(b) - F(a) = giá trị` cho một khúc. */
function evaluateLines(a: IntegralAnalysis, from: Surd, to: Surd, flip: boolean): string[] {
  const v = a.variable
  const body = flip ? a.F.scale(Frac.of(-1)) : a.F
  const Fb = body.evalSurd(to)
  const Fa = body.evalSurd(from)
  const inner = flip ? new Poly(a.diff.c.map((c) => c.neg())).toTex(v) : diffTex(a)
  return [
    `$$${integralTex(inner, from, to, v)} = \\left(${body.toTex(v)}\\right)\\Big|_{${from.toTex()}}^{${to.toTex()}} = \\left(${Fb.toTex()}\\right) - \\left(${Fa.toTex()}\\right) = ${valueTex(Fb.sub(Fa))}$$`,
  ]
}

// ── Bài 1: tổng Riemann ─────────────────────────────────────────────────────

function riemannSteps(a: IntegralAnalysis): IntStep[] {
  const r = a.riemann!
  const v = a.variable
  const fTex = a.f.toTex(v)
  const below = a.pieces.some((p) => p.sign < 0)
  const starName = r.kind === 'left' ? 'mút trái' : r.kind === 'right' ? 'mút phải' : 'trung điểm'

  const setup: IntStep = {
    key: 'setup',
    title: 'Bước 1. Bài toán',
    lines: [
      below
        ? `Trên đoạn $[${a.from.toTex()}; ${a.to.toTex()}]$ đồ thị có phần nằm **dưới** trục hoành, nên tổng Riemann xấp xỉ **tích phân** $${integralTex(fTex, a.from, a.to, v)}$ — phần dưới trục mang dấu âm. Muốn DIỆN TÍCH thì chuyển sang bài “Diện tích hình phẳng”.`
        : `Tính diện tích hình thang cong giới hạn bởi đồ thị $y = ${fTex}$, trục hoành và hai đường thẳng $${v} = ${a.from.toTex()}$, $${v} = ${a.to.toTex()}$.`,
      'Ý tưởng của SGK: chia đoạn thành $n$ phần bằng nhau, thay mỗi phần bằng một hình chữ nhật dễ tính diện tích, rồi cho $n$ lớn dần.',
    ],
    predicts: [],
    stage: S(true, true),
  }

  const dx = r.dx
  const partition: IntStep = {
    key: 'partition',
    title: 'Bước 2. Chia đoạn thành n phần bằng nhau',
    lines: [
      `$$\\Delta ${v} = \\frac{b - a}{n} = \\frac{${a.to.toTex()} - \\left(${a.from.toTex()}\\right)}{${r.n}} = ${fracTex(dx)}$$`,
      `Các mốc chia: $${v}_i = ${a.from.toTex()} + i \\cdot \\Delta ${v}$ với $i = 0, 1, \\dots, ${r.n}$.`,
      `Mỗi hình chữ nhật lấy chiều cao tại **${starName}** của khoảng con: $${v}_i^{*}$.`,
    ],
    predicts: [],
    stage: S(true, true, true),
  }

  // Liệt kê đủ khi ít hình chữ nhật; nhiều thì chỉ nêu hai đầu — bảng dài không ai đọc.
  const heights = r.rects.map((rect) => `f\\left(${rect.star.toTex()}\\right)`)
  const heightList =
    r.rects.length <= 5
      ? heights.join(' + ')
      : `${heights.slice(0, 2).join(' + ')} + \\dots + ${heights[heights.length - 1]}`
  const heightValues =
    r.rects.length <= 5
      ? [`Chiều cao từng hình: ${r.rects.map((rect) => `$f\\left(${rect.star.toTex()}\\right) = ${fracTex(rect.height)}$`).join('; ')}.`]
      : []
  const cmp = a.exact !== null ? r.sum.cmp(a.exact) : 0
  const sumStep: IntStep = {
    key: 'sum',
    title: `Bước 3. Tổng Riemann với n = ${r.n}`,
    lines: [
      ...heightValues,
      `$$S_n = \\Delta ${v} \\left[ ${heightList} \\right] = ${fracTex(r.sum)}$$`,
      `Đó là tổng diện tích ${r.n} hình chữ nhật trên hình — phần thừa ra hoặc thiếu đi so với đường cong chính là sai số.`,
    ],
    predicts: [
      {
        id: 'compare',
        question: `Tổng $S_n$ này lớn hơn hay nhỏ hơn giá trị đúng của tích phân?`,
        options: [
          { id: 'more', label: 'Lớn hơn' },
          { id: 'less', label: 'Nhỏ hơn' },
          { id: 'equal', label: 'Bằng đúng' },
        ],
        correct: cmp > 0 ? 'more' : cmp < 0 ? 'less' : 'equal',
        explain:
          a.monotone !== null && r.kind !== 'mid'
            ? `Hàm ${a.monotone > 0 ? '**đồng biến**' : '**nghịch biến**'} trên đoạn này, nên chiều cao lấy ở ${starName} luôn ${(a.monotone > 0) === (r.kind === 'left') ? 'THẤP' : 'CAO'} hơn đường cong ở phần còn lại của mỗi khoảng con.`
            : `So sánh trực tiếp: $S_n = ${fracTex(r.sum)}$ còn tích phân bằng $${fracTex(a.exact ?? Frac.ZERO)}$.`,
      },
    ],
    stage: S(true, true, true),
  }

  const converge: IntStep = {
    key: 'converge',
    title: 'Bước 4. Cho n lớn dần',
    lines: [
      `Giữ nguyên hàm số và hai cận, chỉ tăng số hình chữ nhật (${RIEMANN_LABEL[r.kind].toLowerCase()}):`,
      ...(a.convergence ?? []).map((row) => `$n = ${row.n}$: $S_n = ${fracTex(row.sum)}$`),
      'Các giá trị xích lại gần một số xác định. **Số đó được định nghĩa là tích phân** của hàm số trên đoạn đã cho.',
      `$$\\lim_{n \\to +\\infty} S_n = ${integralTex(fTex, a.from, a.to, v)}$$`,
    ],
    predicts: [
      {
        id: 'limit',
        question: `Khi $n \\to +\\infty$ thì $S_n$ tiến tới đâu?`,
        options: [
          { id: 'I', label: 'Giá trị tích phân' },
          { id: 'zero', label: '$0$' },
          { id: 'inf', label: '$+\\infty$' },
          { id: 'none', label: 'Không tiến tới đâu cả' },
        ],
        correct: 'I',
        explain:
          'Mỗi hình chữ nhật hẹp lại nhưng SỐ hình tăng lên; tổng diện tích của chúng tiến tới diện tích thật dưới đường cong.',
      },
    ],
    stage: S(true, true, true),
    preStage: S(true, true, true),
  }

  const newton: IntStep = {
    key: 'newton',
    title: 'Bước 6. Công thức Newton – Leibniz',
    lines: [
      `Không cần lấy giới hạn của tổng: nếu $F$ là một nguyên hàm của $f$ thì $\\displaystyle\\int_a^b f(${v}) \\, d${v} = F(b) - F(a)$.`,
      ...evaluateLines(a, a.from, a.to, false),
    ],
    predicts: [],
    stage: S(true, true, true),
  }

  const err = a.exact !== null ? a.exact.sub(r.sum).abs() : Frac.ZERO
  const compare: IntStep = {
    key: 'compare',
    title: 'Bước 7. So lại với tổng Riemann',
    lines: [
      `Sai số của tổng ${r.n} hình chữ nhật: $\\left|S_n - I\\right| = ${fracTex(err)}$.`,
      'Tổng Riemann là **xấp xỉ**, tích phân là **giá trị đúng**. Kéo thanh số hình chữ nhật để thấy sai số co lại.',
      ...(below
        ? [
            `Nhắc lại: vì đồ thị có phần dưới trục hoành nên số vừa tính là tích phân, **không** phải diện tích. Diện tích hình phẳng là $${valueTex(a.total)}$ — xem bài “Diện tích hình phẳng”.`,
          ]
        : []),
    ],
    predicts: [],
    stage: S(true, true, true, true),
  }

  return [setup, partition, sumStep, converge, antiderivativeStep(a, 5), newton, compare]
}

// ── Bài 2 và 3: diện tích hình phẳng · quãng đường ───────────────────────────

function areaSetupStep(a: IntegralAnalysis): IntStep {
  const v = a.variable
  const gTex = a.g ? a.g.toTex(v) : null
  const lines = gTex
    ? [
        `Diện tích hình phẳng giới hạn bởi hai đồ thị $y = ${a.f.toTex(v)}$ và $y = ${gTex}$${a.autoBounds ? '' : ` cùng hai đường thẳng $x = ${a.from.toTex()}$, $x = ${a.to.toTex()}$`}:`,
        `$$S = \\int_{a}^{b} \\left| f(x) - g(x) \\right| \\, dx$$`,
        'Dấu trị tuyệt đối là **bắt buộc**: diện tích không âm, trong khi hiệu $f - g$ đổi dấu mỗi lần hai đồ thị cắt nhau.',
      ]
    : [
        `Diện tích hình phẳng giới hạn bởi đồ thị $y = ${a.f.toTex(v)}$, trục hoành và hai đường thẳng $x = ${a.from.toTex()}$, $x = ${a.to.toTex()}$:`,
        `$$S = \\int_{a}^{b} \\left| f(x) \\right| \\, dx$$`,
        'Dấu trị tuyệt đối là **bắt buộc**: phần đồ thị nằm dưới trục hoành cho tích phân âm, nhưng diện tích của nó vẫn dương.',
      ]
  return { key: 'setup', title: 'Bước 1. Công thức', lines, predicts: [], stage: S(false, false) }
}

function motionSetupStep(a: IntegralAnalysis): IntStep {
  return {
    key: 'setup',
    title: 'Bước 1. Quãng đường và độ dịch chuyển',
    lines: [
      `Vật chuyển động với vận tốc $v(t) = ${a.f.toTex('t')}$ trong khoảng thời gian từ $t = ${a.from.toTex()}$ đến $t = ${a.to.toTex()}$.`,
      `$$\\text{Quãng đường } s = \\int_{a}^{b} \\left| v(t) \\right| dt \\qquad \\text{Độ dịch chuyển } d = \\int_{a}^{b} v(t) \\, dt$$`,
      'Hai đại lượng này **khác nhau** khi vật đổi chiều: quãng đường cộng dồn mọi đoạn đường đã đi, còn độ dịch chuyển chỉ đo khoảng cách từ chỗ xuất phát tới chỗ dừng.',
    ],
    predicts: [
      {
        id: 'same',
        question: 'Quãng đường và độ dịch chuyển của vật có bằng nhau không?',
        options: [
          { id: 'yes', label: 'Bằng nhau' },
          { id: 'no', label: 'Khác nhau' },
        ],
        correct: a.changesSign ? 'no' : 'yes',
        explain: a.changesSign
          ? 'Trong khoảng thời gian này $v(t)$ **đổi dấu** — vật đổi chiều, nên hai số khác nhau.'
          : 'Trong khoảng thời gian này $v(t)$ **không đổi dấu** — vật đi một chiều, nên hai số bằng nhau.',
      },
    ],
    stage: S(false, false),
    preStage: S(false, false),
  }
}

function intersectStep(a: IntegralAnalysis): IntStep {
  const v = a.variable
  const lines: string[] = []
  if (a.kind === 'motion') {
    lines.push(
      a.diff.isZero()
        ? 'Vận tốc bằng 0 trong suốt khoảng thời gian: vật đứng yên.'
        : `Giải $v(t) = 0$: $${a.diff.toTex(v)} = 0 \\iff ${a.roots.length === 0 ? '\\text{vô nghiệm}' : rootsTex(a.roots, v)}$.`,
    )
    lines.push(
      a.inside.length === 0
        ? `Không có nghiệm nào nằm trong khoảng $(${a.from.toTex()}; ${a.to.toTex()})$ nên vật **không đổi chiều**.`
        : `Nghiệm nằm trong khoảng thời gian đang xét: $${rootsTex(a.inside, v)}$ — đó là thời điểm vật **đổi chiều**.`,
    )
  } else {
    const gTex = a.g ? a.g.toTex(v) : '0'
    lines.push(`Phương trình hoành độ giao điểm: $${a.f.toTex(v)} = ${gTex}$`)
    lines.push(
      a.roots.length === 0
        ? `$\\iff ${a.diff.toTex(v)} = 0$: **vô nghiệm**, hai đường không cắt nhau.`
        : `$${a.diff.toTex(v)} = 0 \\iff ${rootsTex(a.roots, v)}$`,
    )
    if (a.autoBounds) {
      lines.push(
        `Hình phẳng nằm giữa hai giao điểm ngoài cùng nên lấy cận $x = ${a.from.toTex()}$ và $x = ${a.to.toTex()}$.`,
      )
    } else if (a.inside.length > 0) {
      lines.push(`Trong đoạn $[${a.from.toTex()}; ${a.to.toTex()}]$ có giao điểm $${rootsTex(a.inside, v)}$ — chỗ phải tách khúc.`)
    } else {
      lines.push(`Trong đoạn $[${a.from.toTex()}; ${a.to.toTex()}]$ không có giao điểm nào nằm bên trong.`)
    }
  }
  return {
    key: 'intersect',
    title: a.kind === 'motion' ? 'Bước 2. Tìm thời điểm đổi chiều' : 'Bước 2. Hoành độ giao điểm',
    lines,
    predicts: [],
    stage: S(true, false),
  }
}

function signStep(a: IntegralAnalysis): IntStep {
  const v = a.variable
  const lines: string[] = []
  const predicts: IntPrediction[] = []
  const gTex = a.g ? a.g.toTex(v) : null

  a.pieces.forEach((p, i) => {
    const rel = p.sign > 0 ? '>' : '<'
    const lhs = a.kind === 'motion' ? `v(${p.test.toTex()})` : a.g ? `f(${p.test.toTex()}) - g(${p.test.toTex()})` : `f(${p.test.toTex()})`
    const probe = `${lhs} = ${p.testValue.toTex()} ${rel} 0`
    const verdict =
      a.kind === 'motion'
        ? p.sign > 0
          ? 'vật đi theo **chiều dương**'
          : 'vật đi **ngược chiều dương**'
        : gTex
          ? p.sign > 0
            ? `đồ thị $y = ${a.f.toTex(v)}$ nằm **trên**`
            : `đồ thị $y = ${gTex}$ nằm **trên**`
          : p.sign > 0
            ? 'đồ thị nằm **trên** trục hoành'
            : 'đồ thị nằm **dưới** trục hoành'
    lines.push(`Trên $${intervalTex(p)}$: thử $${v} = ${p.test.toTex()}$, được $${probe}$ nên ${verdict}.`)

    predicts.push({
      id: `p${i}`,
      piece: i,
      question:
        a.kind === 'motion'
          ? `Trong khoảng thời gian $${intervalTex(p)}$, vật đi theo chiều nào?`
          : gTex
            ? `Trên khoảng $${intervalTex(p)}$, đồ thị nào nằm trên?`
            : `Trên khoảng $${intervalTex(p)}$, đồ thị nằm trên hay dưới trục hoành?`,
      options:
        a.kind === 'motion'
          ? [
              { id: '+', label: 'Chiều dương' },
              { id: '-', label: 'Ngược chiều dương' },
            ]
          : gTex
            ? [
                { id: '+', label: `$y = ${a.f.toTex(v)}$` },
                { id: '-', label: `$y = ${gTex}$` },
              ]
            : [
                { id: '+', label: 'Ở trên trục hoành' },
                { id: '-', label: 'Ở dưới trục hoành' },
              ],
      correct: p.sign > 0 ? '+' : '-',
      explain: `Thử $${v} = ${p.test.toTex()}$: $${probe}$.`,
    })
  })

  if (a.pieces.length === 0) lines.push('Biểu thức dưới dấu tích phân bằng 0 trên cả đoạn.')

  return {
    key: 'sign',
    title: a.kind === 'motion' ? 'Bước 3. Xét dấu $v(t)$' : 'Bước 3. Xét dấu hiệu hai hàm',
    lines,
    predicts,
    stage: S(true, true),
    preStage: S(true, false),
  }
}

function absoluteStep(a: IntegralAnalysis): IntStep {
  const v = a.variable
  const inner = a.kind === 'motion' ? 'v(t)' : a.g ? 'f(x) - g(x)' : 'f(x)'
  const terms = a.pieces.map((p) => {
    const body = p.sign > 0 ? diffTex(a) : new Poly(a.diff.c.map((c) => c.neg())).toTex(v)
    return integralTex(body, p.from, p.to, v)
  })
  const lines = [
    `Trên mỗi khúc dấu của $${inner}$ không đổi, nên bỏ được dấu trị tuyệt đối — khúc nào âm thì đổi dấu biểu thức:`,
    `$$${a.kind === 'motion' ? 's' : 'S'} = ${terms.join(' + ') || '0'}$$`,
  ]
  const predicts: IntPrediction[] = []
  if (a.changesSign) {
    lines.push(
      `Nếu tính một lần $${integralTex(diffTex(a), a.from, a.to, v)} = ${valueTex(a.signed)}$ thì **sai**: phần mang dấu âm trừ bớt vào phần dương.`,
    )
    predicts.push({
      id: 'onego',
      question: `Có thể tính bằng một tích phân duy nhất $${integralTex(diffTex(a), a.from, a.to, v)}$ không?`,
      options: [
        { id: 'no', label: 'Không — phải tách khúc' },
        { id: 'yes', label: 'Được' },
      ],
      correct: 'no',
      explain: `Tích phân đó bằng $${valueTex(a.signed)}$, còn ${a.kind === 'motion' ? 'quãng đường' : 'diện tích'} bằng $${valueTex(a.total)}$: phần âm đã trừ bớt phần dương.`,
    })
  }
  return {
    key: 'absolute',
    title: 'Bước 4. Bỏ dấu trị tuyệt đối',
    lines,
    predicts,
    stage: S(true, true),
    preStage: S(true, true),
  }
}

function piecesStep(a: IntegralAnalysis): IntStep {
  const lines: string[] = []
  a.pieces.forEach((p) => {
    lines.push(...evaluateLines(a, p.from, p.to, p.sign < 0))
  })
  if (a.pieces.length === 0) lines.push('Không có khúc nào để tính.')
  return {
    key: 'pieces',
    title: 'Bước 6. Tính từng khúc',
    lines,
    predicts: [],
    stage: S(true, true, false, true),
  }
}

function totalStep(a: IntegralAnalysis): IntStep {
  const parts = a.pieces.map((p) => p.area.toTex())
  const lines: string[] = []
  if (a.kind === 'motion') {
    lines.push(
      parts.length > 1
        ? `$$s = ${parts.join(' + ')} = ${valueTex(a.total)}$$`
        : `$$s = ${valueTex(a.total)}$$`,
    )
    lines.push(`Quãng đường vật đi được: $${valueTex(a.total)}$ (đơn vị độ dài, ví dụ mét khi $v$ tính bằng m/s và $t$ tính bằng giây).`)
    lines.push(`Độ dịch chuyển: $${integralTex(diffTex(a), a.from, a.to, 't')} = ${valueTex(a.signed)}$.`)
    lines.push(
      a.changesSign
        ? '**Hai số khác nhau** vì vật đã đổi chiều: phần đường đi ngược lại bị trừ đi trong độ dịch chuyển.'
        : 'Hai số bằng nhau vì vật đi một chiều trong suốt khoảng thời gian này.',
    )
  } else {
    lines.push(parts.length > 1 ? `$$S = ${parts.join(' + ')} = ${valueTex(a.total)}$$` : `$$S = ${valueTex(a.total)}$$`)
    lines.push(`Diện tích hình phẳng cần tìm: $${valueTex(a.total)}$ (đơn vị diện tích).`)
  }
  return {
    key: 'total',
    title: 'Bước 7. Kết luận',
    lines,
    predicts: [],
    stage: S(true, true, false, true),
  }
}

export function buildIntegralSteps(a: IntegralAnalysis): IntStep[] {
  if (a.kind === 'riemann' && a.riemann) return riemannSteps(a)
  return [
    a.kind === 'motion' ? motionSetupStep(a) : areaSetupStep(a),
    intersectStep(a),
    signStep(a),
    absoluteStep(a),
    antiderivativeStep(a, 5),
    piecesStep(a),
    totalStep(a),
  ]
}
