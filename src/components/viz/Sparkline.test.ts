/**
 * Test cho các hàm quy đổi toạ độ của Sparkline.
 *
 * Chỉ test phần tính toán — phần vẽ SVG không cần DOM để kiểm chứng.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toPoints } from './geometry.ts'

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
