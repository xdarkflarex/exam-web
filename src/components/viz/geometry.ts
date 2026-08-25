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

/* ==========================================================================
   RADAR — lưới đa giác đều

   Dùng cho "Phân tích theo năng lực": mỗi trục là một chuyên đề, bán kính là
   tỉ lệ đúng. Tách hình học ra đây để test được bằng `node --test`.
   ========================================================================== */

/**
 * Toạ độ đỉnh thứ `index` của đa giác đều `count` cạnh.
 *
 * Bắt đầu từ 12 GIỜ và đi thuận chiều kim đồng hồ (trừ 90° khỏi góc), vì trục
 * đầu tiên nằm ngay trên đỉnh là cách người đọc mong đợi — để mặc 0° thì trục
 * đầu nằm ở 3 giờ và cả hình trông như bị xoay lệch.
 *
 * `ratio` là bán kính tương đối 0..1; giá trị ngoài khoảng bị kẹp lại để một
 * con số hỏng không vẽ điểm ra ngoài khung.
 */
export function radarPoint(
  index: number,
  count: number,
  ratio: number,
  radius: number,
  center: Point
): Point {
  if (count <= 0) return center
  const clamped = Math.min(1, Math.max(0, ratio))
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return {
    x: center.x + Math.cos(angle) * radius * clamped,
    y: center.y + Math.sin(angle) * radius * clamped,
  }
}

/** Đa giác nối các giá trị. `ratios[i]` là tỉ lệ 0..1 của trục thứ `i`. */
export function radarPolygon(ratios: number[], radius: number, center: Point): Point[] {
  return ratios.map((ratio, index) => radarPoint(index, ratios.length, ratio, radius, center))
}

/** Chuỗi `points` của thẻ `<polygon>`. */
export function polygonPoints(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

/**
 * Căn lề chữ cho nhãn quanh radar.
 *
 * Nhãn ở nửa phải căn trái, nửa trái căn phải, trên/dưới căn giữa — nếu để
 * `middle` hết thì nhãn hai bên đè lên hình.
 */
export function radarLabelAnchor(index: number, count: number): 'start' | 'middle' | 'end' {
  if (count <= 0) return 'middle'
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  const cos = Math.cos(angle)
  if (Math.abs(cos) < 0.2) return 'middle'
  return cos > 0 ? 'start' : 'end'
}
