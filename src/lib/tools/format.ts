/**
 * Cách viết số trong lời giải của các công cụ: **giá trị chính xác trước, số
 * thập phân chỉ đi kèm khi cần**.
 *
 * SGK viết "d = 2√3/3 ≈ 1,15" chứ không viết "d = 1,15". Học sinh đối chiếu bài
 * giải tay với công cụ theo giá trị chính xác; số thập phân chỉ để hình dung độ
 * lớn, nên luôn đứng sau dấu ≈ và không bao giờ đứng một mình.
 *
 * Tách ra `lib/tools/` ngày 2026-09-19 vì ba công cụ đã chép lại cùng một đoạn.
 */

import { decimalTex, Frac } from './fraction.ts'
import { Surd } from './surd.ts'

/** `-9{,}66` — số thực làm tròn 2 chữ số, dấu phẩy kiểu Việt Nam. */
export function approxTex(v: number, digits = 2): string {
  const scale = 10 ** digits
  return decimalTex(Frac.of(Math.round(v * scale), scale).toDecimal(digits).text)
}

/** Phân số chính xác, kèm số thập phân khi nó không viết hết được: `\frac{1}{3} \approx 0{,}33`. */
export function fracTex(f: Frac, digits = 2): string {
  const d = f.toDecimal(digits)
  return d.exact ? f.toTex() : `${f.toTex()} \\approx ${decimalTex(d.text)}`
}

/** Như `fracTex` nhưng cho số dạng a + b√r: số vô tỉ luôn kèm xấp xỉ. */
export function valueTex(s: Surd, digits = 2): string {
  if (s.isRational()) return fracTex(s.toFrac()!, digits)
  return `${s.toTex()} \\approx ${approxTex(s.toNumber(), digits)}`
}
