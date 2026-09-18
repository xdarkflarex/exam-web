/**
 * Dựng bài toán tích phân từ những gì học sinh nhập, theo ba kiểu bài của SGK
 * Toán 12 (Kết nối tri thức, Bài 12 · Bài 13):
 *
 *   `riemann` — tổng Riemann tiến tới tích phân: định nghĩa tích phân bắt đầu từ
 *               diện tích hình thang cong, chia nhỏ rồi cho n → +∞.
 *   `area`    — diện tích hình phẳng giới hạn bởi một hoặc hai đồ thị: tìm hoành
 *               độ giao điểm, tách khúc theo dấu, bỏ dấu trị tuyệt đối từng khúc.
 *   `motion`  — quãng đường đi được từ vận tốc v(t), và chỗ học sinh hay lẫn:
 *               quãng đường (∫|v|) khác độ dịch chuyển (∫v) khi vật đổi chiều.
 *
 * Chỉ nhận ĐA THỨC. Nguyên hàm của hàm bất kỳ cần hệ đại số máy tính và sẽ sai
 * ở đâu đó mà học sinh không biết — xem mục 5 của docs/STUDENT_TOOLS_ROADMAP.md.
 */

import { Frac } from '../fraction.ts'
import { exactRoots, Poly, type Root } from '../poly.ts'
import { Surd } from '../surd.ts'
import {
  antiderivative,
  integrateFrac,
  monotoneOn,
  riemannSum,
  rootsInside,
  splitBySign,
  UnsupportedError,
  type Piece,
  type RiemannKind,
  type RiemannResult,
  type Sign,
} from './integrate.ts'

export type ProblemKind = 'riemann' | 'area' | 'motion'

export interface IntegralSetup {
  kind: ProblemKind
  f: Poly
  /** Đường thứ hai của bài diện tích; `null` là trục hoành. */
  g: Poly | null
  /** Cận. Bài diện tích cho phép bỏ trống để lấy hoành độ giao điểm. */
  a: Frac | null
  b: Frac | null
  n: number
  rkind: RiemannKind
}

export interface IntegralAnalysis {
  kind: ProblemKind
  /** Chữ dùng cho biến: `x` với bài diện tích, `t` với bài chuyển động. */
  variable: 'x' | 't'
  f: Poly
  g: Poly | null
  /** Biểu thức dưới dấu tích phân trước khi bỏ trị tuyệt đối: f − g, hoặc chính f. */
  diff: Poly
  /** Nguyên hàm của `diff`. */
  F: Poly
  from: Surd
  to: Surd
  /** Cận lấy từ hoành độ giao điểm chứ không do học sinh nhập. */
  autoBounds: boolean
  /** Mọi nghiệm thực của `diff`, và các nghiệm nằm hẳn trong khoảng. */
  roots: Root[]
  inside: Root[]
  pieces: Piece[]
  /** $\int |diff|$ — diện tích hoặc quãng đường. */
  total: Surd
  /** $\int diff$ — tích phân có dấu; bằng `total` khi dấu không đổi. */
  signed: Surd
  changesSign: boolean
  /** Giá trị tích phân dạng phân số khi hai cận đều hữu tỉ. */
  exact: Frac | null
  riemann: RiemannResult | null
  /** Bảng $S_n$ theo n tăng dần — chỗ học sinh thấy tổng hội tụ. */
  convergence: { n: number; sum: Frac }[] | null
  /** Chiều biến thiên của f trên đoạn lấy tích phân; `null` nếu đổi chiều. */
  monotone: Sign | null
}

export type AnalyzeResult = { ok: true; analysis: IntegralAnalysis } | { ok: false; error: string }

/** Số hình chữ nhật cho bảng hội tụ — đủ để thấy sai số co lại còn ~1/n. */
const CONVERGENCE_STEPS = [4, 8, 16, 32, 64]

export const MAX_RECTANGLES = 40

function sumSurds(values: Surd[]): Surd {
  try {
    return values.reduce((acc, v) => acc.add(v), Surd.int(0))
  } catch {
    throw new UnsupportedError('Các khúc chứa căn khác nhau nên không cộng chính xác được.')
  }
}

export function analyzeIntegral(setup: IntegralSetup): AnalyzeResult {
  const { kind, f, g, a, b } = setup
  const variable: 'x' | 't' = kind === 'motion' ? 't' : 'x'
  const diff = kind === 'area' && g ? f.sub(g) : f

  let roots: Root[] = []
  if (!diff.isZero()) {
    const found = exactRoots(diff)
    if (!found) {
      return {
        ok: false,
        error:
          kind === 'area'
            ? 'Không giải chính xác được phương trình hoành độ giao điểm (cần nghiệm dạng căn bậc hai). Thử hàm bậc thấp hơn.'
            : 'Không giải chính xác được phương trình v(t) = 0 (cần nghiệm dạng căn bậc hai).',
      }
    }
    roots = found
  }

  // Cận: học sinh nhập, hoặc — chỉ ở bài diện tích — lấy hai giao điểm ngoài cùng.
  let from: Surd
  let to: Surd
  let autoBounds = false
  if (a !== null && b !== null) {
    if (a.cmp(b) >= 0) return { ok: false, error: 'Cận dưới phải nhỏ hơn cận trên.' }
    from = Surd.frac(a)
    to = Surd.frac(b)
  } else if (kind === 'area') {
    if (roots.length < 2) {
      return {
        ok: false,
        error:
          roots.length === 0 && diff.isZero()
            ? 'Hai đường trùng nhau nên không có hình phẳng nào. Nhập hai hàm khác nhau.'
            : 'Hai đường cắt nhau ở ít hơn hai điểm nên hình phẳng chưa xác định — nhập thêm cận a và b.',
      }
    }
    autoBounds = true
    from = roots[0].value
    to = roots[roots.length - 1].value
  } else {
    return { ok: false, error: 'Nhập đủ hai cận.' }
  }

  try {
    const pieces = splitBySign(diff, from, to)
    const total = sumSurds(pieces.map((p) => p.area))
    const signed = sumSurds(pieces.map((p) => p.signed))
    const exact = from.isRational() && to.isRational() ? integrateFrac(diff, from.toFrac()!, to.toFrac()!) : null

    const riemann =
      kind === 'riemann' && exact !== null
        ? riemannSum(f, from.toFrac()!, to.toFrac()!, Math.max(1, Math.min(MAX_RECTANGLES, Math.round(setup.n))), setup.rkind)
        : null
    const convergence =
      kind === 'riemann' && exact !== null
        ? CONVERGENCE_STEPS.map((n) => ({ n, sum: riemannSum(f, from.toFrac()!, to.toFrac()!, n, setup.rkind).sum }))
        : null

    return {
      ok: true,
      analysis: {
        kind,
        variable,
        f,
        g: kind === 'area' ? g : null,
        diff,
        F: antiderivative(diff),
        from,
        to,
        autoBounds,
        roots,
        inside: rootsInside(roots, from, to),
        pieces,
        total,
        signed,
        changesSign: pieces.length > 1,
        exact,
        riemann,
        convergence,
        monotone: monotoneOn(f, from, to),
      },
    }
  } catch (e) {
    if (e instanceof UnsupportedError) return { ok: false, error: e.message }
    throw e
  }
}
