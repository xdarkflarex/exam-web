/**
 * Test đếm ngược kỳ thi.
 *
 * Ca đáng giá nhất là MÚI GIỜ: mốc phải đếm tới đúng 7 giờ 30 sáng giờ Việt
 * Nam, kể cả khi máy chạy test (hay máy của admin) để múi giờ khác. Một mốc
 * lệch 7 tiếng không ai thấy cho tới đúng buổi sáng thi.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_EXAM_COUNTDOWN,
  STALE_AFTER_DAYS,
  countdownParts,
  fromVietnamInputValue,
  pad2,
  readCountdownConfig,
  shouldShowCountdown,
  toVietnamInputValue,
} from './exam-countdown.ts'

const CONFIG = DEFAULT_EXAM_COUNTDOWN
const at = (iso: string) => Date.parse(iso)

test('mốc mặc định là 7 giờ 30 sáng 11/6/2027 giờ Việt Nam, tức 0 giờ 30 UTC', () => {
  assert.equal(new Date(Date.parse(CONFIG.start)).toISOString(), '2027-06-11T00:30:00.000Z')
})

test('tách đúng ngày/giờ/phút/giây', () => {
  // 1 ngày 2 giờ 3 phút 4 giây trước giờ phát đề.
  const now = at('2027-06-10T05:26:56+07:00')
  assert.deepEqual(countdownParts(now, CONFIG), {
    phase: 'before', days: 1, hours: 2, minutes: 3, seconds: 4,
  })
})

test('làm tròn xuống: còn 0,9 giây thì hiện 0, không đứng ở 1', () => {
  const now = at(CONFIG.start) - 900
  const parts = countdownParts(now, CONFIG)
  assert.equal(parts.phase, 'before')
  assert.equal(parts.seconds, 0)
})

test('ba pha: trước giờ thi, trong hai ngày thi, sau kỳ thi', () => {
  assert.equal(countdownParts(at('2026-11-09T12:00:00+07:00'), CONFIG).phase, 'before')
  assert.equal(countdownParts(at(CONFIG.start), CONFIG).phase, 'during')
  assert.equal(countdownParts(at('2027-06-12T15:00:00+07:00'), CONFIG).phase, 'during')
  assert.equal(countdownParts(at('2027-06-13T08:00:00+07:00'), CONFIG).phase, 'after')
})

test('số ngày còn lại tính từ hôm viết tính năng', () => {
  // 2026-11-09 07:30 giờ VN → 2027-06-11 07:30 giờ VN: đúng 214 ngày.
  const parts = countdownParts(at('2026-11-09T07:30:00+07:00'), CONFIG)
  assert.equal(parts.days, 214)
  assert.equal(parts.hours, 0)
})

test('tự ẩn sau kỳ thi một tuần, không treo đồng hồ đếm tới quá khứ', () => {
  const endMs = at(CONFIG.end)
  const dayMs = 86_400_000
  assert.equal(shouldShowCountdown(CONFIG, endMs + dayMs), true, 'ngay sau kỳ thi vẫn hiện "đã kết thúc"')
  assert.equal(shouldShowCountdown(CONFIG, endMs + (STALE_AFTER_DAYS + 1) * dayMs), false)
  assert.equal(shouldShowCountdown({ ...CONFIG, enabled: false }, at('2026-12-01T00:00:00Z')), false)
})

test('cấu hình hỏng không làm vỡ trang chủ', () => {
  assert.deepEqual(readCountdownConfig(null), CONFIG)
  assert.deepEqual(readCountdownConfig('chuỗi lạ'), CONFIG)
  assert.deepEqual(readCountdownConfig([1, 2]), CONFIG)

  const partly = readCountdownConfig({ title: '   ', enabled: 'có', start: 'thứ hai tuần sau' })
  assert.equal(partly.title, CONFIG.title, 'tiêu đề rỗng lấy mặc định')
  assert.equal(partly.enabled, true, 'enabled không phải boolean lấy mặc định')
  assert.equal(partly.start, CONFIG.start, 'mốc không đọc được lấy mặc định')
})

test('mốc thiếu múi giờ bị từ chối — để trình duyệt tự đoán là lệch 7 tiếng', () => {
  const config = readCountdownConfig({ start: '2027-06-11T07:30:00' })
  assert.equal(config.start, CONFIG.start)
})

test('mốc kết thúc thiếu hoặc sớm hơn mốc bắt đầu thì tự lấy hai ngày sau', () => {
  const start = '2028-06-11T07:30:00+07:00'
  const missing = readCountdownConfig({ start })
  assert.equal(missing.start, start)
  assert.equal(Date.parse(missing.end) - Date.parse(start), 2 * 86_400_000)

  const backwards = readCountdownConfig({ start, end: '2028-06-01T00:00:00+07:00' })
  assert.equal(Date.parse(backwards.end) - Date.parse(start), 2 * 86_400_000)
})

test('ô datetime-local của admin luôn hiểu theo giờ Việt Nam', () => {
  assert.equal(toVietnamInputValue('2027-06-11T07:30:00+07:00'), '2027-06-11T07:30')
  // Cùng khoảnh khắc viết theo UTC vẫn ra đúng giờ Việt Nam.
  assert.equal(toVietnamInputValue('2027-06-11T00:30:00Z'), '2027-06-11T07:30')
  assert.equal(fromVietnamInputValue('2027-06-11T07:30'), '2027-06-11T07:30:00+07:00')
  assert.equal(fromVietnamInputValue('11/06/2027 7:30'), null)
  assert.equal(toVietnamInputValue('rác'), '')
})

test('đệm hai chữ số cho giờ/phút/giây', () => {
  assert.equal(pad2(7), '07')
  assert.equal(pad2(45), '45')
  assert.equal(pad2(-3), '00')
})
