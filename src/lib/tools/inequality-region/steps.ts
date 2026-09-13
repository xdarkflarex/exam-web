/**
 * Sinh lời giải từng bước cho công cụ miền nghiệm — logic thuần, có test.
 *
 * Mỗi bước là (a) vài dòng chữ để học sinh ĐỌC, viết đúng lời văn một bài giải
 * tay, và (b) một `PlotStage` nói hình vẽ đang tới đâu. Tách khỏi component để
 * câu chữ kiểm được bằng test: lời giải sai toán còn tệ hơn không có lời giải.
 *
 * Chuỗi dùng hai ký hiệu nhẹ, do `RichText` hiển thị: `$…$` là công thức
 * (MathJax), `**…**` là chữ đậm. Không dùng Markdown thật vì `d_1` trong công
 * thức sẽ bị Markdown hiểu thành chữ nghiêng.
 */

import { Frac } from './fraction.ts'
import {
  boundaryTex,
  inequalityTex,
  linearTex,
  opTex,
  type Inequality,
  type Linear,
  type ParsedInequality,
} from './parse.ts'
import { analyzeLine, holds, type NamedPt, type Optimization, type Pt, type Region } from './solve.ts'

export interface PlotStage {
  drawn: number
  hatched: number
  focus: number | null
  showPoints: number | null
  showTest: number | null
  final: boolean
}

export interface Step {
  key: string
  /** Bất phương trình thứ mấy (0-based), `null` cho bước kết luận. */
  group: number | null
  title: string
  lines: string[]
  stage: PlotStage
}

export interface SystemItem {
  /** Dòng học sinh gõ. */
  source: string
  parsed: ParsedInequality
  /** Dòng này có hai dấu so sánh và đã được tách. */
  fromChain: boolean
}

export function ptTex(p: Pt): string {
  return `(${p.x.toTex()};\\, ${p.y.toTex()})`
}

export function lineName(i: number): string {
  return `d_{${i + 1}}`
}

function coefValTex(coef: Frac, val: Frac, first: boolean): string {
  const v = val.sign() < 0 ? `(${val.toTex()})` : val.toTex()
  const body = coef.abs().eq(Frac.ONE) ? v : `${coef.abs().toTex()} \\cdot ${v}`
  if (first) return coef.sign() < 0 ? `-${body}` : body
  return coef.sign() < 0 ? ` - ${body}` : ` + ${body}`
}

/** `3 \cdot 0 + 0 = 0` — thay toạ độ vào vế trái. */
export function substituteTex(a: Frac, b: Frac, p: Pt, extra?: Frac): string {
  let s = ''
  if (!a.isZero()) s += coefValTex(a, p.x, s === '')
  if (!b.isZero()) s += coefValTex(b, p.y, s === '')
  if (extra && !extra.isZero()) s += extra.sign() < 0 ? ` - ${extra.abs().toTex()}` : ` + ${extra.toTex()}`
  const value = a.mul(p.x).add(b.mul(p.y)).add(extra ?? Frac.ZERO)
  // `x ≥ 0` tại x = 2 thì vế trái chính là 2 — viết "2 = 2" chỉ gây rối.
  if (s === value.toTex()) return s
  return `${s} = ${value.toTex()}`
}

function compact(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/<=|\\leq?|⩽/g, '≤')
    .replace(/>=|\\geq?|⩾/g, '≥')
    .replace(/[−–]/g, '-')
    .replace(/\$/g, '')
}

function plainIneq(q: Inequality): string {
  const sign = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }[q.op]
  const term = (c: Frac, name: string, first: boolean) => {
    if (c.isZero()) return ''
    const body = c.abs().eq(Frac.ONE) ? name : `${c.abs().toPlain()}${name}`
    return first ? (c.sign() < 0 ? `-${body}` : body) : c.sign() < 0 ? `-${body}` : `+${body}`
  }
  const x = term(q.a, 'x', true)
  const y = term(q.b, 'y', x === '')
  return `${x}${y}${sign}${q.c.toPlain()}`
}

// ─── Các bước ───────────────────────────────────────────────────────────────

export function buildSteps(items: SystemItem[], region: Region): Step[] {
  const n = items.length
  const steps: Step[] = []

  items.forEach((item, i) => {
    const q = item.parsed.inequality
    const s = analyzeLine(q)
    const d = lineName(i)
    const tag = `(${i + 1})`

    // 1. Vẽ bờ
    const drawLines: string[] = []
    if (item.fromChain) {
      drawLines.push(`Dòng “${item.source.trim()}” có hai dấu so sánh, tách ra được $${inequalityTex(q)}$ ${tag}.`)
    } else if (compact(item.source) !== plainIneq(q)) {
      const m = item.parsed.multiplier
      const chain = [inequalityTex(item.parsed.moved)]
      if (!m.eq(Frac.ONE)) chain.push(inequalityTex(q))
      const why =
        m.sign() < 0
          ? ` — nhân hai vế với $${m.toTex()}$ là số âm nên **đổi chiều**`
          : m.eq(Frac.ONE)
            ? ''
            : ` — nhân hai vế với $${m.toTex()}$ để khử mẫu`
      drawLines.push(`Đưa ${tag} về dạng $ax + by$ so với $c$: $${chain.join(' \\iff ')}$${why}.`)
    }
    const [p1, p2] = s.points
    drawLines.push(`Vẽ đường thẳng $${d}: ${boundaryTex(q)}$ đi qua hai điểm $${ptTex(p1)}$ và $${ptTex(p2)}$.`)
    drawLines.push(
      s.strict
        ? `Dấu $${opTex(q.op)}$ là dấu **chặt**: các điểm trên $${d}$ **không** thuộc miền nghiệm, nên vẽ $${d}$ bằng **nét đứt**.`
        : `Dấu $${opTex(q.op)}$ **không chặt**: các điểm trên $${d}$ thuộc miền nghiệm, nên vẽ $${d}$ bằng **nét liền**.`,
    )
    steps.push({
      key: `line-${i}`,
      group: i,
      title: `Bất phương trình ${tag} · Vẽ bờ $${d}$`,
      lines: drawLines,
      stage: { drawn: i + 1, hatched: i, focus: i, showPoints: i, showTest: null, final: false },
    })

    // 2. Điểm thử
    const name = s.testIsOrigin ? 'O' : 'M'
    const testLines: string[] = [
      s.testIsOrigin
        ? `$${d}$ không đi qua gốc toạ độ, chọn điểm thử $O${ptTex(s.testPoint)}$.`
        : `$${d}$ đi qua gốc toạ độ nên **không** thử bằng $O$ được; chọn điểm thử $M${ptTex(s.testPoint)}$.`,
      `Thay vào vế trái: $${substituteTex(q.a, q.b, s.testPoint)}$.`,
      `So sánh: $${s.testValue.toTex()} ${opTex(q.op)} ${q.c.toTex()}$ là **${s.testHolds ? 'đúng' : 'sai'}**.`,
      s.testHolds
        ? `Vậy nửa mặt phẳng bờ $${d}$ **chứa** điểm $${name}$ là miền nghiệm của ${tag}.`
        : `Vậy nửa mặt phẳng bờ $${d}$ **không chứa** điểm $${name}$ là miền nghiệm của ${tag}.`,
    ]
    steps.push({
      key: `test-${i}`,
      group: i,
      title: `Bất phương trình ${tag} · Chọn điểm thử`,
      lines: testLines,
      stage: { drawn: i + 1, hatched: i, focus: i, showPoints: null, showTest: i, final: false },
    })

    // 3. Gạch bỏ
    const hatchLines = [
      s.testHolds
        ? `**Gạch bỏ** nửa mặt phẳng bờ $${d}$ **không chứa** $${name}$.`
        : `**Gạch bỏ** nửa mặt phẳng bờ $${d}$ **chứa** $${name}$.`,
    ]
    if (i === 0) hatchLines.push('Phần bị gạch là phần **không** phải nghiệm. Miền nghiệm là phần để trắng, không tô màu.')
    if (i < n - 1) hatchLines.push(`Tiếp tục với bất phương trình $(${i + 2})$ trên cùng hệ trục.`)
    steps.push({
      key: `hatch-${i}`,
      group: i,
      title: `Bất phương trình ${tag} · Gạch bỏ phần không là nghiệm`,
      lines: hatchLines,
      stage: { drawn: i + 1, hatched: i + 1, focus: i, showPoints: null, showTest: null, final: false },
    })
  })

  steps.push({
    key: 'final',
    group: null,
    title: 'Kết luận',
    lines: conclusionLines(
      items.map((it) => it.parsed.inequality),
      region,
    ),
    stage: { drawn: n, hatched: n, focus: null, showPoints: null, showTest: null, final: true },
  })
  return steps
}

/** `d_1` và `d_2` đi qua đỉnh nào. */
function linesThrough(qs: Inequality[], v: Pt): string[] {
  return qs.flatMap((q, i) => (q.a.mul(v.x).add(q.b.mul(v.y)).eq(q.c) ? [`$${lineName(i)}$`] : []))
}

function vertexLine(qs: Inequality[], v: NamedPt): string {
  const through = linesThrough(qs, v)
  const where = through.length >= 2 ? ` là giao điểm của ${joinVi(through)}` : ''
  const excluded = qs.every((q) => holds(q, v)) ? '' : ' — nằm trên bờ nét đứt nên **không** thuộc miền nghiệm'
  return `$${v.name}${ptTex(v)}$${where}${excluded}.`
}

function joinVi(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}`
}

export function conclusionLines(qs: Inequality[], region: Region): string[] {
  const strictAny = qs.some((q) => q.op === '<' || q.op === '>')
  const names = region.vertices.map((v) => v.name).join('')
  switch (region.status) {
    case 'empty':
      return ['Mọi điểm của mặt phẳng đều đã bị gạch bỏ: **hệ vô nghiệm** (miền nghiệm là tập rỗng).']
    case 'degenerate':
      return [
        'Phần không bị gạch chỉ còn là các điểm **nằm trên bờ** (một đoạn, tia hoặc điểm) — miền nghiệm không có phần trong.',
        ...region.vertices.map((v) => vertexLine(qs, v)),
      ]
    case 'bounded':
      return [
        `Phần **không bị gạch** là miền nghiệm của hệ: miền đa giác $${names}$${strictAny ? ', kể cả các cạnh nét liền, không kể các cạnh nét đứt' : ', kể cả các cạnh'}.`,
        'Toạ độ các đỉnh:',
        ...region.vertices.map((v) => vertexLine(qs, v)),
      ]
    case 'unbounded':
      return [
        'Phần **không bị gạch** là miền nghiệm của hệ. Miền này **không bị chặn** — kéo dài vô hạn ra ngoài khung hình.',
        ...(region.vertices.length > 0 ? ['Các đỉnh:', ...region.vertices.map((v) => vertexLine(qs, v))] : []),
      ]
  }
}

// ─── GTLN – GTNN ────────────────────────────────────────────────────────────

export function optimizationLines(f: Linear, region: Region, opt: Optimization): string[] {
  const F = `F = ${linearTex(f)}`
  const out: string[] = []
  if (region.status === 'bounded') {
    out.push(`Miền nghiệm là đa giác nên $${F}$ đạt giá trị lớn nhất, nhỏ nhất tại các đỉnh.`)
  } else if (region.status === 'unbounded') {
    out.push(`Miền nghiệm không bị chặn: $F$ có thể tăng (hoặc giảm) mãi, cần xét cả hướng kéo dài của miền, không chỉ các đỉnh.`)
  }

  const describe = (label: 'lớn nhất' | 'nhỏ nhất', e: Optimization['max']) => {
    const short = label === 'lớn nhất' ? 'GTLN' : 'GTNN'
    if (e.value === null) {
      return `$F$ **không có giá trị ${label}** trên miền nghiệm (không bị chặn ${label === 'lớn nhất' ? 'trên' : 'dưới'}).`
    }
    const at = e.at.length === 1 ? ` tại $${e.at[0]}$` : e.at.length === 2 ? ` trên cả cạnh $${e.at.join('')}$` : ''
    if (!e.attained) {
      return `$F$ tiến tới $${e.value.toTex()}$${at} nhưng **không đạt được** vì chỗ đó nằm trên bờ nét đứt — $F$ không có ${short}.`
    }
    return `**${short}** của $F$ là $${e.value.toTex()}$, đạt${at || ' trên một phần bờ của miền'}.`
  }
  out.push(describe('lớn nhất', opt.max))
  out.push(describe('nhỏ nhất', opt.min))
  return out
}
