/**
 * Test cho chuỗi ngày học và lưới hoạt động.
 *
 * Mọi test cố định `today` để không phụ thuộc ngày chạy test.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  activityLevel,
  buildHeatmap,
  countByDay,
  currentStreak,
  dayKey,
  describeCell,
} from './activity-streak.ts'

/** Tạo Date giờ địa phương, tránh lệch múi giờ khi parse chuỗi ISO. */
function localDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour)
}

// ---------------------------------------------------------------------------
// dayKey
// ---------------------------------------------------------------------------

test('dayKey dùng giờ địa phương, không phải UTC', () => {
  // 23:30 ngày 5 giờ địa phương phải là ngày 5, kể cả khi UTC đã sang ngày 6.
  assert.equal(dayKey(localDate(2026, 7, 5, 23)), '2026-07-05')
  assert.equal(dayKey(localDate(2026, 7, 5, 0)), '2026-07-05')
})

test('dayKey đệm 0 cho tháng và ngày một chữ số', () => {
  assert.equal(dayKey(localDate(2026, 1, 9)), '2026-01-09')
})

test('dayKey trả chuỗi rỗng cho mốc thời gian không hợp lệ', () => {
  assert.equal(dayKey('không phải ngày'), '')
})

// ---------------------------------------------------------------------------
// countByDay
// ---------------------------------------------------------------------------

test('countByDay gộp nhiều hoạt động cùng ngày', () => {
  const counts = countByDay([
    localDate(2026, 7, 5, 8).toISOString(),
    localDate(2026, 7, 5, 20).toISOString(),
    localDate(2026, 7, 6, 9).toISOString(),
  ])
  assert.equal(counts.get('2026-07-05'), 2)
  assert.equal(counts.get('2026-07-06'), 1)
})

test('countByDay bỏ qua null, undefined và chuỗi rác', () => {
  const counts = countByDay([null, undefined, '', 'hôm qua'])
  assert.equal(counts.size, 0)
})

// ---------------------------------------------------------------------------
// currentStreak
// ---------------------------------------------------------------------------

test('không có hoạt động thì chuỗi bằng 0', () => {
  assert.equal(currentStreak(new Map(), localDate(2026, 7, 10)), 0)
})

test('đếm ngày liên tiếp tính ngược từ hôm nay', () => {
  const counts = new Map([
    ['2026-07-10', 3],
    ['2026-07-09', 1],
    ['2026-07-08', 5],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 7, 10)), 3)
})

test('hôm nay chưa học không làm mất chuỗi', () => {
  // Học sinh mở app buổi sáng: chuỗi phải vẫn là 2, không tụt về 0 rồi lại lên.
  const counts = new Map([
    ['2026-07-09', 4],
    ['2026-07-08', 2],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 7, 10)), 2)
})

test('bỏ lỡ hai ngày liên tiếp thì chuỗi đứt', () => {
  const counts = new Map([
    ['2026-07-08', 4],
    ['2026-07-07', 2],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 7, 10)), 0)
})

test('khoảng trống ở giữa cắt chuỗi tại đó', () => {
  const counts = new Map([
    ['2026-07-10', 1],
    ['2026-07-09', 1],
    // thiếu 08
    ['2026-07-07', 1],
    ['2026-07-06', 1],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 7, 10)), 2)
})

test('chỉ học đúng hôm nay thì chuỗi bằng 1', () => {
  assert.equal(currentStreak(new Map([['2026-07-10', 1]]), localDate(2026, 7, 10)), 1)
})

test('chuỗi bắc qua ranh giới tháng', () => {
  const counts = new Map([
    ['2026-08-01', 1],
    ['2026-07-31', 1],
    ['2026-07-30', 1],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 8, 1)), 3)
})

test('chuỗi bắc qua ranh giới năm', () => {
  const counts = new Map([
    ['2026-01-01', 1],
    ['2025-12-31', 1],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 1, 1)), 2)
})

test('ngày trong tương lai không được cộng vào chuỗi', () => {
  const counts = new Map([
    ['2026-07-20', 5],
    ['2026-07-10', 1],
  ])
  assert.equal(currentStreak(counts, localDate(2026, 7, 10)), 1)
})

// ---------------------------------------------------------------------------
// activityLevel
// ---------------------------------------------------------------------------

test('bậc màu theo ngưỡng tuyệt đối', () => {
  assert.equal(activityLevel(0), 0)
  assert.equal(activityLevel(-3), 0)
  assert.equal(activityLevel(1), 1)
  assert.equal(activityLevel(2), 1)
  assert.equal(activityLevel(3), 2)
  assert.equal(activityLevel(5), 2)
  assert.equal(activityLevel(6), 3)
  assert.equal(activityLevel(10), 3)
  assert.equal(activityLevel(11), 4)
  assert.equal(activityLevel(500), 4)
})

// ---------------------------------------------------------------------------
// buildHeatmap
// ---------------------------------------------------------------------------

test('lưới có đúng số ngày yêu cầu và kết thúc ở hôm nay', () => {
  const cells = buildHeatmap(new Map(), 28, localDate(2026, 7, 10))
  assert.equal(cells.length, 28)
  assert.equal(cells[cells.length - 1].key, '2026-07-10')
  assert.equal(cells[0].key, '2026-06-13')
})

test('lưới xếp cũ trước, mới sau', () => {
  const cells = buildHeatmap(new Map(), 5, localDate(2026, 7, 10))
  assert.deepEqual(cells.map((cell) => cell.key), [
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
  ])
})

test('ngày không có hoạt động vẫn xuất hiện với count 0', () => {
  const cells = buildHeatmap(new Map([['2026-07-10', 4]]), 3, localDate(2026, 7, 10))
  assert.deepEqual(cells.map((cell) => cell.count), [0, 0, 4])
  assert.deepEqual(cells.map((cell) => cell.level), [0, 0, 2])
})

test('days = 0 vẫn trả về ít nhất một ngày thay vì lưới rỗng', () => {
  assert.equal(buildHeatmap(new Map(), 0, localDate(2026, 7, 10)).length, 1)
})

test('weekday khớp với ngày thật', () => {
  // 2026-07-10 là thứ Sáu (getDay() === 5).
  const cells = buildHeatmap(new Map(), 1, localDate(2026, 7, 10))
  assert.equal(cells[0].weekday, localDate(2026, 7, 10).getDay())
})

// ---------------------------------------------------------------------------
// describeCell
// ---------------------------------------------------------------------------

test('mô tả ô bằng tiếng Việt, định dạng ngày/tháng/năm', () => {
  assert.equal(
    describeCell({ key: '2026-07-05', count: 3, level: 2, weekday: 0 }),
    '05/07/2026: 3 câu'
  )
  assert.equal(
    describeCell({ key: '2026-07-05', count: 0, level: 0, weekday: 0 }),
    '05/07/2026: không học'
  )
})
