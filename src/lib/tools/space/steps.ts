/**
 * Lời giải từng bước của công cụ Oxyz, viết như bài giải tay theo SGK.
 *
 * Mỗi bước mang `reveal` — hình đã dựng tới đâu — để hình lớn dần theo lời giải,
 * và `predicts` — câu hỏi chế độ Tự làm hỏi TRƯỚC khi hiện bước đó (nguyên tắc
 * N1, docs/STUDENT_TOOLS_ROADMAP.md).
 *
 * Chuỗi dùng cú pháp của `RichText`: `$…$`, `$$…$$`, `**…**`.
 */

import { fracTex, valueTex } from '../format.ts'
import { Frac } from '../fraction.ts'
import type { SpaceAnalysis } from './analyze.ts'
import { degreesText, planeValue, ratioOverSqrt, type AngleValue, type Plane, type Vec3 } from './geometry.ts'

export interface ChoiceOption {
  id: string
  label: string
}

export interface SpacePrediction {
  id: string
  question: string
  options: ChoiceOption[]
  correct: string
  explain: string
}

export interface SpaceStep {
  key: string
  title: string
  lines: string[]
  predicts: SpacePrediction[]
  /** Hình hiện mọi phần tử có `reveal` ≤ số này. */
  reveal: number
  /** Hình trước khi trả lời câu hỏi của bước (Tự làm). */
  preReveal?: number
}

// ── Định dạng ───────────────────────────────────────────────────────────────

/** `M\left(1; 2; 3\right)` — điểm có tên. */
function pt(label: string, v: Vec3): string {
  return `${label}${v.toTex()}`
}

/** Bọc ngoặc số âm khi nó đứng sau dấu nhân hoặc trong một tổng đang thế số. */
function m(f: Frac): string {
  return f.sign() < 0 ? `\\left(${f.toTex()}\\right)` : f.toTex()
}

/** `x + 2y - 2z + 1 = 0`. */
export function planeTex(p: Plane): string {
  const terms: string[] = []
  const vars = ['x', 'y', 'z'] as const
  p.n.parts.forEach((c, i) => {
    if (c.isZero()) return
    const mag = c.abs()
    const body = `${mag.eq(Frac.ONE) ? '' : mag.toTex()}${vars[i]}`
    terms.push(terms.length === 0 ? `${c.sign() < 0 ? '-' : ''}${body}` : ` ${c.sign() < 0 ? '-' : '+'} ${body}`)
  })
  if (!p.d.isZero()) {
    terms.push(`${p.d.sign() < 0 ? ' - ' : ' + '}${p.d.abs().toTex()}`)
  }
  return `${terms.join('')} = 0`
}

/** Một dòng phương trình tham số: `x = t`, `y = 2t`, `z = 2 - t`, `x = 1`. */
function paramTex(name: string, a: Frac, u: Frac): string {
  if (u.isZero()) return `${name} = ${a.toTex()}`
  const mag = u.abs()
  const body = `${mag.eq(Frac.ONE) ? '' : mag.toTex()}t`
  if (a.isZero()) return `${name} = ${u.sign() < 0 ? '-' : ''}${body}`
  return `${name} = ${a.toTex()} ${u.sign() < 0 ? '-' : '+'} ${body}`
}

/**
 * Dạng "qua một điểm, có vectơ pháp tuyến": `6\left(x - 1\right) + 3y + 2z`.
 * Bỏ hẳn số hạng có hệ số 0, và không viết `y - 0` cho toạ độ bằng 0.
 */
function pointNormalTex(n: Vec3, A: Vec3): string {
  const vars = ['x', 'y', 'z'] as const
  const terms: string[] = []
  n.parts.forEach((c, i) => {
    if (c.isZero()) return
    const a = A.parts[i]
    const inner = a.isZero() ? vars[i] : `\\left(${vars[i]} ${a.sign() < 0 ? '+' : '-'} ${a.abs().toTex()}\\right)`
    const mag = c.abs()
    const body = `${mag.eq(Frac.ONE) ? '' : mag.toTex()}${inner}`
    terms.push(terms.length === 0 ? `${c.sign() < 0 ? '-' : ''}${body}` : ` ${c.sign() < 0 ? '-' : '+'} ${body}`)
  })
  return terms.join('')
}

/** Thế toạ độ vào vế trái: `1 + 2\cdot(-1) - 2\cdot 3 + 1`. */
function substituteTex(p: Plane, P: Vec3): string {
  const vars = P.parts
  const parts: string[] = []
  p.n.parts.forEach((c, i) => {
    if (c.isZero()) return
    parts.push(`${parts.length === 0 ? '' : ' + '}${m(c)} \\cdot ${m(vars[i])}`)
  })
  if (!p.d.isZero()) parts.push(` + ${m(p.d)}`)
  return parts.join('') || '0'
}

function angleTex(a: AngleValue, symbol: string): string[] {
  const name = a.ratio === 'sin' ? '\\sin' : '\\cos'
  const lines = [
    `$$${name} ${symbol} = \\frac{${a.numerator.toTex()}}{\\sqrt{${a.norm2A.toTex()}} \\cdot \\sqrt{${a.norm2B.toTex()}}} = ${valueTex(a.value)}$$`,
  ]
  lines.push(
    a.exactDegrees !== null
      ? `Vậy $${symbol} = ${a.exactDegrees}^\\circ$.`
      : `Vậy $${symbol} \\approx ${degreesText(a.approxDegrees)}$.`,
  )
  return lines
}

// ── Bài 1: mặt phẳng qua ba điểm ────────────────────────────────────────────

function planeSteps(a: Extract<SpaceAnalysis, { kind: 'plane' }>): SpaceStep[] {
  const { A, B, C, AB, AC, cross, n, P } = a
  const [x1, y1, z1] = AB.parts
  const [x2, y2, z2] = AC.parts

  const steps: SpaceStep[] = [
    {
      key: 'setup',
      title: 'Bước 1. Bài toán',
      lines: [
        `Viết phương trình mặt phẳng $(ABC)$ với $${pt('A', A)}$, $${pt('B', B)}$, $${pt('C', C)}$.`,
        'Muốn viết được phương trình mặt phẳng, cần **một điểm thuộc nó** và **một vectơ pháp tuyến**. Điểm thì đã có sẵn ba cái; việc chính là tìm vectơ pháp tuyến.',
      ],
      predicts: [],
      reveal: 0,
    },
    {
      key: 'vectors',
      title: 'Bước 2. Hai vectơ nằm trong mặt phẳng',
      lines: [
        `$$\\overrightarrow{AB} = ${AB.toTex()}, \\qquad \\overrightarrow{AC} = ${AC.toTex()}$$`,
        'Hai vectơ này **không cùng phương** (nếu cùng phương thì ba điểm thẳng hàng) và đều nằm trong $(ABC)$.',
      ],
      predicts: [
        {
          id: 'method',
          question: 'Từ hai vectơ đó, tìm vectơ pháp tuyến của $(ABC)$ bằng phép nào?',
          options: [
            { id: 'cross', label: 'Tích có hướng $\\left[\\overrightarrow{AB}, \\overrightarrow{AC}\\right]$' },
            { id: 'sum', label: 'Tổng $\\overrightarrow{AB} + \\overrightarrow{AC}$' },
            { id: 'dot', label: 'Tích vô hướng $\\overrightarrow{AB} \\cdot \\overrightarrow{AC}$' },
          ],
          correct: 'cross',
          explain:
            'Tích có hướng của hai vectơ **vuông góc với cả hai**, mà cả hai lại nằm trong mặt phẳng — nên nó là vectơ pháp tuyến. Tổng hai vectơ vẫn nằm trong mặt phẳng, còn tích vô hướng chỉ là một số.',
        },
      ],
      reveal: 1,
      preReveal: 0,
    },
    {
      key: 'cross',
      title: 'Bước 3. Tích có hướng',
      lines: [
        `$$\\left[\\overrightarrow{AB}, \\overrightarrow{AC}\\right] = \\left(y_1 z_2 - z_1 y_2;\\; z_1 x_2 - x_1 z_2;\\; x_1 y_2 - y_1 x_2\\right)$$`,
        `Thế số: $\\left(${m(y1)} \\cdot ${m(z2)} - ${m(z1)} \\cdot ${m(y2)};\\; ${m(z1)} \\cdot ${m(x2)} - ${m(x1)} \\cdot ${m(z2)};\\; ${m(x1)} \\cdot ${m(y2)} - ${m(y1)} \\cdot ${m(x2)}\\right) = ${cross.toTex()}$`,
        ...(a.reduced
          ? [`Vectơ pháp tuyến chỉ cần **cùng phương**, nên rút gọn: chọn $\\vec{n} = ${n.toTex()}$.`]
          : [`Chọn $\\vec{n} = ${n.toTex()}$.`]),
      ],
      predicts: [],
      reveal: 2,
    },
    {
      key: 'equation',
      title: 'Bước 4. Phương trình mặt phẳng',
      lines: [
        `$(ABC)$ đi qua $${pt('A', A)}$ và nhận $\\vec{n} = ${n.toTex()}$ làm vectơ pháp tuyến:`,
        `$$${pointNormalTex(n, A)} = 0$$`,
        `$$(ABC):\\; ${planeTex(P)}$$`,
      ],
      predicts: [],
      reveal: 3,
    },
  ]

  const checkLines = [
    `Thế $B$: $${substituteTex(P, B)} = ${planeValue(P, B).toTex()}$ ✓`,
    `Thế $C$: $${substituteTex(P, C)} = ${planeValue(P, C).toTex()}$ ✓`,
  ]
  if (a.D && a.valueD) {
    const inside = a.valueD.isZero()
    steps.push({
      key: 'check',
      title: 'Bước 5. Thử lại, và xét điểm D',
      lines: [
        ...checkLines,
        `Thế $${pt('D', a.D)}$: $${substituteTex(P, a.D)} = ${a.valueD.toTex()}$.`,
        inside
          ? '$D$ thuộc mặt phẳng $(ABC)$, tức **bốn điểm đồng phẳng**.'
          : `$D$ **không** thuộc $(ABC)$, nên bốn điểm $A$, $B$, $C$, $D$ **không đồng phẳng** — chúng là bốn đỉnh của một tứ diện.`,
      ],
      predicts: [
        {
          id: 'dOnPlane',
          question: `Điểm $${pt('D', a.D)}$ có thuộc mặt phẳng $(ABC)$ không?`,
          options: [
            { id: 'yes', label: 'Có' },
            { id: 'no', label: 'Không' },
          ],
          correct: inside ? 'yes' : 'no',
          explain: `Thế toạ độ $D$ vào vế trái: $${substituteTex(P, a.D)} = ${a.valueD.toTex()}$${inside ? ', bằng 0 nên $D$ thuộc mặt phẳng.' : ', khác 0 nên $D$ không thuộc mặt phẳng.'}`,
        },
      ],
      reveal: 4,
      preReveal: 3,
    })
  } else {
    steps.push({
      key: 'check',
      title: 'Bước 5. Thử lại',
      lines: [...checkLines, 'Cả $B$ và $C$ đều thoả mãn, nên phương trình viết đúng.'],
      predicts: [],
      reveal: 4,
    })
  }
  return steps
}

// ── Bài 2: khoảng cách, hình chiếu, điểm đối xứng ────────────────────────────

function distanceSteps(a: Extract<SpaceAnalysis, { kind: 'distance' }>): SpaceStep[] {
  const { M, P, value, d, t, H, Msym } = a
  const norm2 = P.n.norm2()
  const MH = H.sub(M)

  return [
    {
      key: 'setup',
      title: 'Bước 1. Bài toán',
      lines: [
        `Cho điểm $${pt('M', M)}$ và mặt phẳng $(P):\\; ${planeTex(P)}$.`,
        `Thế toạ độ $M$ vào vế trái: $${substituteTex(P, M)} = ${value.toTex()}$.`,
        a.onPlane
          ? 'Giá trị bằng 0 nên $M$ **nằm trên** $(P)$: khoảng cách bằng 0, hình chiếu của $M$ chính là $M$.'
          : 'Giá trị khác 0 nên $M$ **không nằm trên** $(P)$. Dấu của nó cho biết $M$ ở phía nào của mặt phẳng.',
      ],
      predicts: [
        {
          id: 'onPlane',
          question: 'Điểm $M$ có nằm trên mặt phẳng $(P)$ không?',
          options: [
            { id: 'yes', label: 'Có' },
            { id: 'no', label: 'Không' },
          ],
          correct: a.onPlane ? 'yes' : 'no',
          explain: `Thế toạ độ $M$ vào vế trái được $${value.toTex()}$${a.onPlane ? ' — bằng 0 nên $M$ nằm trên $(P)$.' : ' — khác 0 nên $M$ không nằm trên $(P)$.'}`,
        },
      ],
      reveal: 0,
      preReveal: 0,
    },
    {
      key: 'distance',
      title: 'Bước 2. Khoảng cách từ M đến (P)',
      lines: [
        `$$d\\left(M, (P)\\right) = \\frac{\\left|ax_0 + by_0 + cz_0 + d\\right|}{\\sqrt{a^2 + b^2 + c^2}}$$`,
        `$$= \\frac{\\left|${substituteTex(P, M)}\\right|}{\\sqrt{${norm2.toTex()}}} = \\frac{${value.abs().toTex()}}{\\sqrt{${norm2.toTex()}}} = ${valueTex(d)}$$`,
      ],
      predicts: [],
      reveal: 1,
    },
    {
      key: 'projection',
      title: 'Bước 3. Hình chiếu vuông góc H',
      lines: [
        `Đường thẳng $MH$ vuông góc với $(P)$ nên nhận $\\vec{n} = ${P.n.toTex()}$ làm vectơ chỉ phương:`,
        `$$H = M + t\\vec{n} \\quad \\text{với } t = -\\frac{ax_0 + by_0 + cz_0 + d}{a^2 + b^2 + c^2} = -\\frac{${value.toTex()}}{${norm2.toTex()}} = ${fracTex(t)}$$`,
        `$$H = ${M.toTex()} + ${m(t)} \\cdot ${P.n.toTex()} = ${H.toTex()}$$`,
      ],
      predicts: [
        {
          id: 'direction',
          question: 'Đường thẳng $MH$ nhận vectơ nào làm vectơ chỉ phương?',
          options: [
            { id: 'n', label: 'Vectơ pháp tuyến $\\vec{n}$ của $(P)$' },
            { id: 'in', label: 'Một vectơ nằm trong $(P)$' },
            { id: 'om', label: 'Vectơ $\\overrightarrow{OM}$' },
          ],
          correct: 'n',
          explain: '$MH \\perp (P)$, mà vectơ pháp tuyến cũng vuông góc với $(P)$, nên hai vectơ ấy cùng phương.',
        },
      ],
      reveal: 2,
      preReveal: 1,
    },
    {
      key: 'reflect',
      title: 'Bước 4. Điểm đối xứng của M qua (P)',
      lines: [
        `$H$ là **trung điểm** của $MM'$, nên $M' = 2H - M$:`,
        `$$M' = 2 \\cdot ${H.toTex()} - ${M.toTex()} = ${Msym.toTex()}$$`,
      ],
      predicts: [],
      reveal: 3,
    },
    {
      key: 'check',
      title: 'Bước 5. Thử lại',
      lines: [
        `$\\overrightarrow{MH} = ${MH.toTex()}$ nên $MH = ${valueTex(MH.norm())}$ — đúng bằng khoảng cách tính ở bước 2.`,
        `Thế $H$ vào $(P)$: $${substituteTex(P, H)} = ${planeValue(P, H).toTex()}$, tức $H$ nằm trên $(P)$ ✓`,
      ],
      predicts: [],
      reveal: 4,
    },
  ]
}

// ── Bài 3: đường thẳng và mặt phẳng ─────────────────────────────────────────

function lineSteps(a: Extract<SpaceAnalysis, { kind: 'line' }>): SpaceStep[] {
  const { line, P, pos, angle } = a
  const un = line.u.dot(P.n)
  const [ux, uy, uz] = line.u.parts
  const param = ['x', 'y', 'z'].map((name, i) => paramTex(name, line.A.parts[i], line.u.parts[i])).join(', \\quad ')

  const steps: SpaceStep[] = [
    {
      key: 'setup',
      title: 'Bước 1. Bài toán',
      lines: [
        a.through
          ? `Đường thẳng $d$ đi qua $${pt('A', a.through[0])}$ và $${pt('B', a.through[1])}$, nên nhận $\\overrightarrow{AB}$ — rút gọn thành $\\vec{u} = ${line.u.toTex()}$ — làm vectơ chỉ phương.`
          : `Đường thẳng $d$ đi qua $${pt('A', line.A)}$ và có vectơ chỉ phương $\\vec{u} = ${line.u.toTex()}$.`,
        `Mặt phẳng $(P):\\; ${planeTex(P)}$ có vectơ pháp tuyến $\\vec{n} = ${P.n.toTex()}$.`,
        `Phương trình tham số của $d$: $$${param}$$`,
      ],
      predicts: [],
      reveal: 0,
    },
    {
      key: 'dot',
      title: 'Bước 2. Xét tích vô hướng $\\vec{u} \\cdot \\vec{n}$',
      lines: [
        `$$\\vec{u} \\cdot \\vec{n} = ${ux.toTex()} \\cdot ${m(P.n.x)} + ${m(uy)} \\cdot ${m(P.n.y)} + ${m(uz)} \\cdot ${m(P.n.z)} = ${un.toTex()}$$`,
        un.isZero()
          ? '$\\vec{u} \\perp \\vec{n}$ nên $d$ **song song với $(P)$ hoặc nằm trong $(P)$** — phải xét thêm một điểm của $d$ mới phân biệt được.'
          : '$\\vec{u} \\cdot \\vec{n} \\neq 0$ nên $d$ **cắt** $(P)$ tại đúng một điểm.',
      ],
      predicts: [
        {
          id: 'meaning',
          question: 'Nếu $\\vec{u} \\cdot \\vec{n} = 0$ thì $d$ và $(P)$ ở vị trí nào với nhau?',
          options: [
            { id: 'par', label: '$d$ song song với $(P)$, hoặc $d$ nằm trong $(P)$' },
            { id: 'cut', label: '$d$ cắt $(P)$' },
            { id: 'perp', label: '$d$ vuông góc với $(P)$' },
          ],
          correct: 'par',
          explain:
            '$\\vec{u} \\cdot \\vec{n} = 0$ nghĩa là $\\vec{u} \\perp \\vec{n}$, tức $d$ **song song với mặt phẳng theo phương**. Còn $d$ nằm trong $(P)$ hay không thì phải thế một điểm của $d$ vào phương trình mới biết.',
        },
      ],
      reveal: 1,
      preReveal: 0,
    },
  ]

  if (pos.kind === 'cat') {
    steps.push({
      key: 'intersect',
      title: 'Bước 3. Giao điểm',
      lines: [
        'Thế phương trình tham số của $d$ vào phương trình $(P)$ rồi giải theo $t$:',
        `$$${planeValue(P, line.A).toTex()} ${un.sign() < 0 ? '-' : '+'} ${un.abs().eq(Frac.ONE) ? '' : un.abs().toTex()}t = 0 \\iff t = ${fracTex(pos.t!)}$$`,
        `Thay $t$ vào phương trình tham số: $$${pt('I', pos.point!)}$$`,
        ...(pos.perpendicular
          ? [`Ngoài ra $\\vec{u}$ **cùng phương** $\\vec{n}$ nên $d \\perp (P)$ — góc giữa chúng bằng $90^\\circ$.`]
          : []),
      ],
      predicts: [],
      reveal: 2,
    })
  } else {
    const vA = planeValue(P, line.A)
    steps.push({
      key: 'intersect',
      title: 'Bước 3. Vị trí tương đối',
      lines: [
        `Thế điểm $${pt('A', line.A)}$ của $d$ vào $(P)$: $${substituteTex(P, line.A)} = ${vA.toTex()}$.`,
        pos.kind === 'nam'
          ? 'Bằng 0 nên $A \\in (P)$. Cùng với $\\vec{u} \\cdot \\vec{n} = 0$, ta có $d$ **nằm trong** $(P)$.'
          : 'Khác 0 nên $A \\notin (P)$. Cùng với $\\vec{u} \\cdot \\vec{n} = 0$, ta có $d$ **song song** với $(P)$.',
        ...(pos.kind === 'songSong'
          ? [
              `Khoảng cách từ $d$ đến $(P)$ bằng khoảng cách từ $A$ tới $(P)$: $d\\left(A, (P)\\right) = ${valueTex(
                ratioOverSqrt(vA.abs(), P.n.norm2()),
              )}$.`,
            ]
          : []),
      ],
      predicts: [],
      reveal: 2,
    })
  }

  steps.push({
    key: 'angle',
    title: 'Bước 4. Góc giữa d và (P)',
    lines:
      pos.kind === 'cat'
        ? [
            'Góc giữa đường thẳng và mặt phẳng tính bằng **sin**, vì góc giữa $\\vec{u}$ và $\\vec{n}$ phụ với góc cần tìm:',
            `$$\\sin \\alpha = \\frac{\\left|\\vec{u} \\cdot \\vec{n}\\right|}{\\left|\\vec{u}\\right| \\cdot \\left|\\vec{n}\\right|}$$`,
            ...angleTex(angle, '\\alpha'),
          ]
        : [
            pos.kind === 'nam'
              ? 'Đường thẳng nằm trong mặt phẳng nên góc giữa chúng bằng $0^\\circ$.'
              : 'Đường thẳng song song với mặt phẳng nên góc giữa chúng bằng $0^\\circ$.',
          ],
    predicts: [
      {
        id: 'ratio',
        question: 'Góc giữa đường thẳng và mặt phẳng tính qua $\\sin$ hay $\\cos$ của $\\vec{u}$ và $\\vec{n}$?',
        options: [
          { id: 'sin', label: '$\\sin$' },
          { id: 'cos', label: '$\\cos$' },
        ],
        correct: 'sin',
        explain:
          'Công thức cho $\\cos$ của góc giữa $\\vec{u}$ và $\\vec{n}$, mà góc ấy **phụ** với góc giữa $d$ và $(P)$ — nên tỉ số đó chính là $\\sin$ của góc cần tìm.',
      },
    ],
    reveal: 3,
    preReveal: 2,
  })

  return steps
}

// ── Bài 4: mặt cầu và mặt phẳng ─────────────────────────────────────────────

function sphereSteps(a: Extract<SpaceAnalysis, { kind: 'sphere' }>): SpaceStep[] {
  const { S, R, P, pos } = a
  const [xi, yi, zi] = S.I.parts
  const norm2 = P.n.norm2()
  const kindText =
    pos.kind === 'cat' ? '**cắt** mặt cầu theo một đường tròn' : pos.kind === 'tiepXuc' ? '**tiếp xúc** với mặt cầu' : '**không cắt** mặt cầu'

  const steps: SpaceStep[] = [
    {
      key: 'setup',
      title: 'Bước 1. Bài toán',
      lines: [
        `Mặt cầu $(S)$ tâm $${pt('I', S.I)}$, bán kính $R = ${valueTex(R)}$:`,
        `$$(S):\\; \\left(x - ${m(xi)}\\right)^2 + \\left(y - ${m(yi)}\\right)^2 + \\left(z - ${m(zi)}\\right)^2 = ${S.r2.toTex()}$$`,
        `Mặt phẳng $(P):\\; ${planeTex(P)}$.`,
        'Vị trí tương đối được quyết định bởi **khoảng cách từ tâm tới mặt phẳng** so với bán kính.',
      ],
      predicts: [
        {
          id: 'guess',
          question: 'Đoán trước: $(P)$ cắt, tiếp xúc hay không cắt mặt cầu $(S)$?',
          options: [
            { id: 'cat', label: 'Cắt theo một đường tròn' },
            { id: 'tiepXuc', label: 'Tiếp xúc tại một điểm' },
            { id: 'khongCat', label: 'Không có điểm chung' },
          ],
          correct: pos.kind,
          explain: `Khoảng cách từ tâm tới $(P)$ bằng $${valueTex(pos.d)}$, còn bán kính bằng $${valueTex(R)}$ — so hai số này là ra.`,
        },
      ],
      reveal: 0,
      preReveal: 0,
    },
    {
      key: 'distance',
      title: 'Bước 2. Khoảng cách từ tâm tới mặt phẳng',
      lines: [
        `$$d\\left(I, (P)\\right) = \\frac{\\left|${substituteTex(P, S.I)}\\right|}{\\sqrt{${norm2.toTex()}}} = ${valueTex(pos.d)}$$`,
      ],
      predicts: [],
      reveal: 1,
    },
    {
      key: 'compare',
      title: 'Bước 3. So sánh d với R',
      lines: [
        'So **bình phương** cho gọn — cả hai đều là số hữu tỉ nên không phải đụng tới căn:',
        `$$d^2 = ${pos.d2.toTex()}, \\qquad R^2 = ${S.r2.toTex()}$$`,
        `Vậy $d ${pos.kind === 'cat' ? '<' : pos.kind === 'tiepXuc' ? '=' : '>'} R$, tức $(P)$ ${kindText}.`,
      ],
      predicts: [],
      reveal: 2,
    },
  ]

  if (pos.kind === 'cat') {
    steps.push({
      key: 'circle',
      title: 'Bước 4. Đường tròn giao tuyến',
      lines: [
        `Tâm đường tròn là **hình chiếu của $I$** lên $(P)$: $${pt('H', pos.H)}$.`,
        `Bán kính: $$r = \\sqrt{R^2 - d^2} = \\sqrt{${S.r2.toTex()} - ${pos.d2.toTex()}} = ${valueTex(pos.r!)}$$`,
      ],
      predicts: [],
      reveal: 3,
    })
  } else if (pos.kind === 'tiepXuc') {
    steps.push({
      key: 'circle',
      title: 'Bước 4. Tiếp điểm',
      lines: [
        `$(P)$ tiếp xúc $(S)$ tại hình chiếu của tâm: $${pt('H', pos.H)}$.`,
        'Đây cũng là điểm duy nhất chung của mặt phẳng và mặt cầu.',
      ],
      predicts: [],
      reveal: 3,
    })
  } else {
    steps.push({
      key: 'circle',
      title: 'Bước 4. Kết luận',
      lines: [
        `$d > R$ nên mặt phẳng và mặt cầu **không có điểm chung**.`,
        `Điểm của $(S)$ gần $(P)$ nhất nằm trên đoạn nối $I$ với hình chiếu $${pt('H', pos.H)}$, cách $(P)$ một khoảng $${valueTex(pos.d)} - ${valueTex(R)}$.`,
      ],
      predicts: [],
      reveal: 3,
    })
  }

  return steps
}

export function buildSpaceSteps(a: SpaceAnalysis): SpaceStep[] {
  switch (a.kind) {
    case 'plane':
      return planeSteps(a)
    case 'distance':
      return distanceSteps(a)
    case 'line':
      return lineSteps(a)
    case 'sphere':
      return sphereSteps(a)
  }
}
