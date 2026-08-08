/**
 * Hình học cho các primitive vẽ dữ liệu.
 *
 * File `.ts` thuần (không JSX) để chạy được bằng `node --test` mà không cần
 * bước biên dịch — `--experimental-strip-types` chỉ gỡ được kiểu, không gỡ JSX.
 */

export interface Point {
  x: number
  y: number
}

/**
 * Quy đổi chuỗi giá trị sang toạ độ SVG.
 *
 * Trục y của SVG hướng xuống, nên giá trị lớn nhất nhận `y` nhỏ nhất.
 * Khi mọi giá trị bằng nhau, đường được đặt giữa khung thay vì chia cho 0.
 */
export function toPoints(values: number[], width: number, height: number, padding: number): Point[] {
  if (values.length < 2) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  return values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * innerWidth
    const ratio = span === 0 ? 0.5 : (value - min) / span
    const y = padding + (1 - ratio) * innerHeight
    return { x, y }
  })
}
