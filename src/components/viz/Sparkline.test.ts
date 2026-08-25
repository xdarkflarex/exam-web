/**
 * Test cho các hàm quy đổi toạ độ của Sparkline.
 *
 * Chỉ test phần tính toán — phần vẽ SVG không cần DOM để kiểm chứng.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toPoints, radarPoint, radarPolygon, polygonPoints, radarLabelAnchor } from './geometry.ts'

test('dưới hai điểm thì không có toạ độ nào', () => {
  assert.deepEqual(toPoints([], 100, 40, 4), [])
  assert.deepEqual(toPoints([5], 100, 40, 4), [])
})

test('điểm đầu và cuối chạm hai mép trong của khung', () => {
  const points = toPoints([0, 50, 100], 100, 40, 4)
  assert.equal(points[0].x, 4)
  assert.equal(points[points.length - 1].x, 96)
})

test('giá trị lớn nhất nằm trên, nhỏ nhất nằm dưới', () => {
  // Trục y của SVG hướng xuống, nên giá trị lớn phải có y NHỎ.
  const points = toPoints([10, 90], 100, 40, 4)
  assert.ok(points[1].y < points[0].y, 'giá trị 90 phải cao hơn giá trị 10')
})

test('mọi giá trị bằng nhau thì đường nằm giữa, không chia cho 0', () => {
  const points = toPoints([7, 7, 7], 100, 40, 4)
  for (const point of points) {
    assert.equal(point.y, 20)
    assert.ok(Number.isFinite(point.y))
  }
})

test('toàn số 0 vẫn ra toạ độ hợp lệ', () => {
  const points = toPoints([0, 0, 0, 0], 120, 36, 4)
  assert.equal(points.length, 4)
  for (const point of points) assert.ok(Number.isFinite(point.y))
})

test('giá trị âm được xử lý như mọi giá trị khác', () => {
  const points = toPoints([-10, 0, 10], 100, 40, 4)
  assert.ok(points[0].y > points[2].y)
})

test('toạ độ luôn nằm trong khung sau khi trừ padding', () => {
  const width = 120
  const height = 36
  const padding = 4
  const points = toPoints([3, 99, 1, 47, 62], width, height, padding)
  for (const point of points) {
    assert.ok(point.x >= padding && point.x <= width - padding)
    assert.ok(point.y >= padding && point.y <= height - padding)
  }
})

test('khoảng cách ngang giữa các điểm là đều nhau', () => {
  const points = toPoints([1, 2, 3, 4, 5], 100, 40, 0)
  const gaps = points.slice(1).map((point, index) => point.x - points[index].x)
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 1e-9)
})

/* ==========================================================================
   RADAR
   ========================================================================== */

test('radar: trục đầu tiên nằm ở 12 giờ', () => {
  const center = { x: 100, y: 100 }
  const p = radarPoint(0, 4, 1, 50, center)
  assert.ok(Math.abs(p.x - 100) < 1e-9, 'phải thẳng trục dọc')
  assert.equal(Number(p.y.toFixed(6)), 50, 'phải ở PHÍA TRÊN tâm')
})

test('radar: đi thuận chiều kim đồng hồ', () => {
  const center = { x: 0, y: 0 }
  // Trục thứ hai của hình 4 cạnh phải ở 3 giờ (x dương, y = 0).
  const p = radarPoint(1, 4, 1, 10, center)
  assert.equal(Number(p.x.toFixed(6)), 10)
  assert.ok(Math.abs(p.y) < 1e-9)
})

test('radar: ratio kẹp về 0..1 để số hỏng không vẽ ra ngoài khung', () => {
  const center = { x: 0, y: 0 }
  assert.equal(radarPoint(0, 3, 5, 10, center).y, -10, 'trên 1 bị kẹp về 1')
  assert.equal(radarPoint(0, 3, -2, 10, center).y, 0, 'dưới 0 bị kẹp về 0 (về tâm)')
})

test('radar: ratio 0 nằm đúng tâm', () => {
  const center = { x: 7, y: 9 }
  const p = radarPoint(2, 5, 0, 40, center)
  assert.equal(Number(p.x.toFixed(6)), 7)
  assert.equal(Number(p.y.toFixed(6)), 9)
})

test('radar: polygon trả đúng số đỉnh', () => {
  const pts = radarPolygon([0.2, 0.5, 1, 0.8, 0.1], 50, { x: 0, y: 0 })
  assert.equal(pts.length, 5)
})

test('radar: count = 0 không chia cho 0', () => {
  const center = { x: 3, y: 4 }
  assert.deepEqual(radarPoint(0, 0, 1, 10, center), center)
  assert.deepEqual(radarPolygon([], 10, center), [])
})

test('radar: nhãn nửa phải căn trái, nửa trái căn phải, trên/dưới căn giữa', () => {
  assert.equal(radarLabelAnchor(0, 4), 'middle', '12 giờ')
  assert.equal(radarLabelAnchor(1, 4), 'start', '3 giờ')
  assert.equal(radarLabelAnchor(2, 4), 'middle', '6 giờ')
  assert.equal(radarLabelAnchor(3, 4), 'end', '9 giờ')
})

test('polygonPoints: định dạng được cho thẻ SVG', () => {
  const s = polygonPoints([
    { x: 1.234, y: 5.678 },
    { x: 0, y: 10 },
  ])
  assert.equal(s, '1.23,5.68 0.00,10.00')
})
