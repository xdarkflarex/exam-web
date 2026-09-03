import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isPracticeExam,
  toLocalDateInput,
  toLocalDateTimeInput,
  fromDateInput,
  fromDateTimeInput,
} from './exam-schedule.ts'

/* Các test dưới đây cố ý KHÔNG so với chuỗi ISO viết cứng: kết quả phụ thuộc múi
   giờ của máy chạy test, nên so cứng sẽ đúng ở đây và sai ở máy khác. Thay vào
   đó kiểm các tính chất phải đúng ở MỌI múi giờ. */

test('mode lạ hoặc thiếu thì coi là đề thi, không phải ôn tập', () => {
  assert.equal(isPracticeExam('practice'), true)
  assert.equal(isPracticeExam('simulation'), false)
  for (const bad of [null, undefined, '', 'Practice', 'homework']) {
    assert.equal(isPracticeExam(bad), false, `giá trị ${JSON.stringify(bad)} không được coi là ôn tập`)
  }
})

test('ngày mở lấy đầu ngày ĐỊA PHƯƠNG, không phải đầu ngày UTC', () => {
  const iso = fromDateInput('2026-09-10', 'start')
  assert.ok(iso)
  const d = new Date(iso!)
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth(), 8)
  assert.equal(d.getDate(), 10, 'ngày bị trôi — dấu hiệu chuỗi được đọc như UTC')
  assert.equal(d.getHours(), 0)
  assert.equal(d.getMinutes(), 0)
})

test('hạn cuối lấy CUỐI ngày, để cả ngày đó vẫn làm được bài', () => {
  const iso = fromDateInput('2026-09-10', 'end')
  const d = new Date(iso!)
  assert.equal(d.getDate(), 10)
  assert.equal(d.getHours(), 23)
  assert.equal(d.getMinutes(), 59)
  // Chốt lại điều thực sự quan trọng: 22:00 ngày 10 vẫn còn trong hạn.
  assert.ok(new Date(2026, 8, 10, 22, 0, 0) < d, 'tối ngày hạn cuối đã bị coi là quá hạn')
})

test('hạn cuối muộn hơn ngày mở của cùng một ngày', () => {
  const start = new Date(fromDateInput('2026-09-10', 'start')!)
  const end = new Date(fromDateInput('2026-09-10', 'end')!)
  assert.ok(end > start, 'mở và đóng cùng ngày mà khung rỗng')
})

test('ngày đi vòng ISO rồi quay lại vẫn là ngày cũ', () => {
  for (const value of ['2026-01-01', '2026-06-15', '2026-12-31', '2026-02-28']) {
    for (const edge of ['start', 'end'] as const) {
      assert.equal(toLocalDateInput(fromDateInput(value, edge)), value, `lệch ở ${value}/${edge}`)
    }
  }
})

test('mốc giờ đi vòng ISO rồi quay lại vẫn là mốc cũ', () => {
  // Đây là ca mà bản cũ (`toISOString().slice(0,16)`) sai: mở rồi lưu là lùi giờ.
  for (const value of ['2026-09-10T07:00', '2026-09-10T00:00', '2026-12-31T23:59']) {
    assert.equal(toLocalDateTimeInput(fromDateTimeInput(value)), value, `lệch ở ${value}`)
  }
})

test('mở rồi lưu nhiều lần không làm mốc trôi đi', () => {
  let iso = fromDateTimeInput('2026-09-10T07:00')
  for (let i = 0; i < 5; i++) {
    iso = fromDateTimeInput(toLocalDateTimeInput(iso))
  }
  assert.equal(toLocalDateTimeInput(iso), '2026-09-10T07:00')
})

test('giá trị trống và rác cho ra rỗng/null chứ không ném lỗi', () => {
  assert.equal(toLocalDateInput(null), '')
  assert.equal(toLocalDateInput(undefined), '')
  assert.equal(toLocalDateInput(''), '')
  assert.equal(toLocalDateInput('không phải ngày'), '')
  assert.equal(toLocalDateTimeInput('không phải ngày'), '')
  assert.equal(fromDateInput('', 'start'), null)
  assert.equal(fromDateInput('2026-09', 'start'), null)
  assert.equal(fromDateInput('rác', 'end'), null)
  assert.equal(fromDateTimeInput(''), null)
  assert.equal(fromDateTimeInput('rác'), null)
})
