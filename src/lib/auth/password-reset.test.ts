/**
 * Test luật đặt lại mật khẩu: mọi nhánh TỪ CHỐI trước, nhánh cho qua sau.
 *
 * 401 (chưa đăng nhập) và 403 (không phải admin) nằm ở `requireAdmin()` và
 * được kiểm bằng HTTP thật ở `scripts/reset-password-permission-check.mjs`.
 * Ở đây là phần còn lại của bức tường: đầu vào, và ai được phép bị đặt lại.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkResetTarget, describeAuthPasswordError, parseResetRequest } from './password-reset.ts'
import { generateTempPassword } from './temp-password.ts'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const STUDENT = '22222222-2222-4222-8222-222222222222'

test('đầu vào hỏng bị từ chối 400, không đoán', () => {
  for (const body of [null, 'chuỗi', [], {}, { userId: 'abc', mode: 'random' }, { userId: STUDENT }, { userId: STUDENT, mode: 'admin' }]) {
    const result = parseResetRequest(body)
    assert.equal(result.ok, false, JSON.stringify(body))
    if (!result.ok) assert.equal(result.rejection.status, 400)
  }
})

test('thiếu kiểu mật khẩu KHÔNG rơi về mật khẩu mặc định', () => {
  // Rơi về cái dễ đoán nhất khi đầu vào lạ là hướng sai để fail.
  const result = parseResetRequest({ userId: STUDENT, mode: undefined })
  assert.equal(result.ok, false)
})

test('đầu vào hợp lệ', () => {
  assert.deepEqual(parseResetRequest({ userId: STUDENT, mode: 'default' }), {
    ok: true, value: { userId: STUDENT, mode: 'default' },
  })
  assert.equal(parseResetRequest({ userId: STUDENT, mode: 'random' }).ok, true)
})

test('không tìm thấy tài khoản → 404', () => {
  assert.equal(checkResetTarget(ADMIN, null)?.status, 404)
})

test('admin KHÔNG đặt lại được mật khẩu của admin khác — đường chiếm tài khoản', () => {
  const rejection = checkResetTarget(ADMIN, { id: '33333333-3333-4333-8333-333333333333', role: 'admin' })
  assert.equal(rejection?.status, 403)
  assert.equal(rejection?.code, 'NOT_A_STUDENT')
})

test('không đặt lại được giáo viên, hay hồ sơ thiếu vai trò', () => {
  assert.equal(checkResetTarget(ADMIN, { id: STUDENT, role: 'teacher' })?.code, 'NOT_A_STUDENT')
  assert.equal(checkResetTarget(ADMIN, { id: STUDENT, role: null })?.code, 'NOT_A_STUDENT')
})

test('không tự đặt lại mật khẩu của chính mình qua nút này', () => {
  assert.equal(checkResetTarget(ADMIN, { id: ADMIN, role: 'student' })?.code, 'CANNOT_RESET_SELF')
})

test('học sinh thì cho qua', () => {
  assert.equal(checkResetTarget(ADMIN, { id: STUDENT, role: 'student' }), null)
})

test('Supabase chê mật khẩu yếu → 422 kèm cách xử lý, không phải "lỗi máy chủ"', () => {
  const weak = describeAuthPasswordError({ code: 'weak_password', message: 'Password should be at least 8 characters.' })
  assert.equal(weak.status, 422)
  assert.match(weak.error, /Mật khẩu ngẫu nhiên/)
  assert.equal(describeAuthPasswordError({ message: 'Password should contain at least one character of each' }).status, 422)
  assert.equal(describeAuthPasswordError({ message: 'network down' }).status, 500)
  assert.equal(describeAuthPasswordError(null).status, 500)
})

// ── Mật khẩu tạm ───────────────────────────────────────────────────────────

test('mật khẩu tạm đúng định dạng cũ: 9 ký tự, đủ hoa/thường/số/@', () => {
  for (let i = 0; i < 200; i++) {
    const password = generateTempPassword()
    assert.equal(password.length, 9)
    assert.match(password, /^[A-HJ-NP-Za-km-z2-9@]{9}$/)
    assert.equal((password.match(/[A-Z]/g) || []).length, 2)
    assert.equal((password.match(/[a-z]/g) || []).length, 3)
    assert.equal((password.match(/[0-9]/g) || []).length, 3)
    assert.equal((password.match(/@/g) || []).length, 1)
  }
})

test('không có ký tự dễ đọc nhầm khi đọc mật khẩu qua điện thoại', () => {
  for (let i = 0; i < 300; i++) assert.doesNotMatch(generateTempPassword(), /[0O1lI]/)
})

test('đủ ngẫu nhiên: 2000 lần sinh không trùng lần nào', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 2000; i++) seen.add(generateTempPassword())
  assert.equal(seen.size, 2000)
})

test('nguồn ngẫu nhiên truyền vào được — để test, code thật luôn dùng crypto', () => {
  const always0 = generateTempPassword(() => 0)
  assert.equal(always0.length, 9)
})
