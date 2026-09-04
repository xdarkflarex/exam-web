import { test } from 'node:test'
import assert from 'node:assert/strict'

import { describeAttemptError, readAttemptErrorCode } from './attempt-errors.ts'

/** Tám cổng chặn trong `start_exam_attempt` (20260722). */
const CODES = [
  'UNAUTHENTICATED',
  'EXAM_NOT_AVAILABLE',
  'STUDENT_ROLE_REQUIRED',
  'FEATURE_NOT_AVAILABLE',
  'EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS',
  'EXAM_NOT_STARTED',
  'EXAM_ENDED',
  'MAX_ATTEMPTS_REACHED',
  'UNSUPPORTED_EXAM_MODE',
]

test('mọi mã lỗi của start_exam_attempt đều có câu riêng', () => {
  const seen = new Set<string>()
  for (const code of CODES) {
    const text = describeAttemptError({ message: code, code: '42501' })
    assert.notEqual(text, '', `thiếu câu cho ${code}`)
    assert.ok(!text.includes(code), `câu cho ${code} còn lộ mã kỹ thuật: "${text}"`)
    seen.add(text)
  }
  assert.equal(seen.size, CODES.length, 'có hai mã dùng chung một câu — mất phân biệt')
})

test('đọc được mã từ đúng hình dạng lỗi PostgREST trả về', () => {
  assert.equal(
    readAttemptErrorCode({ code: '42501', message: 'EXAM_ENDED', details: null, hint: null }),
    'EXAM_ENDED'
  )
})

test('đọc được mã kể cả khi nằm lẫn trong câu dài', () => {
  // PostgREST đôi khi bọc thêm chữ quanh câu RAISE.
  assert.equal(
    readAttemptErrorCode({ message: 'server error: FEATURE_NOT_AVAILABLE (42501)' }),
    'FEATURE_NOT_AVAILABLE'
  )
})

test('lỗi lạ và lỗi mạng vẫn nói được việc tiếp theo', () => {
  for (const bad of [null, undefined, {}, { message: '' }, new Error('fetch failed'), 'boom']) {
    const text = describeAttemptError(bad)
    assert.ok(text.length > 0)
    assert.ok(/thử lại|báo thầy/.test(text), `câu mặc định không chỉ được việc gì: "${text}"`)
  }
})

test('hết hạn và chưa tới hạn KHÔNG được nói giống nhau', () => {
  // Hai tình huống này ngược hẳn nhau về việc học sinh phải làm.
  assert.notEqual(
    describeAttemptError({ message: 'EXAM_NOT_STARTED' }),
    describeAttemptError({ message: 'EXAM_ENDED' })
  )
})

test('lỗi sai lớp nói rõ đường xử, vì đó thường là dữ liệu sai chứ không phải em sai', () => {
  const text = describeAttemptError({ message: 'EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS' })
  assert.ok(text.includes('lớp'))
  assert.ok(/thầy|cô/.test(text))
})
