import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isAdminSessionTimeoutEnabled } from './utils.ts'

/*
  Công tắc "tự động đăng xuất admin" (/admin/settings).

  Đây là một cổng BẢO MẬT, nên mọi ca ở đây đều hỏi cùng một câu: giá trị lạ thì
  hệ thống ngả về chặt hay ngả về lỏng? Câu trả lời phải luôn là chặt.

  Bản trong `src/middleware.ts` là bản sao có chủ đích (middleware trong repo này
  không import từ `lib`). Sửa một bên thì phải sửa bên kia; file test này là chỗ
  ghim hành vi đúng cho cả hai.
*/

test('chỉ false tường minh mới tắt', () => {
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: false }), false)
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: true }), true)
})

test('cấu hình cũ chưa có trường này thì vẫn BẬT', () => {
  // Đây là trạng thái thật của mọi cài đặt đã lưu trước khi có công tắc.
  assert.equal(isAdminSessionTimeoutEnabled({ requireAdminOTP: true }), true)
  assert.equal(isAdminSessionTimeoutEnabled({}), true)
})

test('không đọc được cấu hình thì vẫn BẬT', () => {
  assert.equal(isAdminSessionTimeoutEnabled(null), true)
  assert.equal(isAdminSessionTimeoutEnabled(undefined), true)
})

test('giá trị sai kiểu KHÔNG được tắt cổng', () => {
  // Chuỗi "false" là ca nguy hiểm nhất: nó trông như tắt, và một phép kiểm
  // lỏng (`!value`) sẽ tắt thật. JSON từ database hoàn toàn có thể mang chuỗi
  // nếu ai đó sửa tay dòng site_settings.
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: 'false' }), true)
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: 0 }), true)
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: null }), true)
  assert.equal(isAdminSessionTimeoutEnabled({ adminSessionTimeout: '' }), true)
})

test('value không phải object thì vẫn BẬT', () => {
  assert.equal(isAdminSessionTimeoutEnabled('adminSessionTimeout=false'), true)
  assert.equal(isAdminSessionTimeoutEnabled(42), true)
  // Mảng cũng là object trong JS — chặn riêng để không đọc trượt sang index.
  assert.equal(isAdminSessionTimeoutEnabled([{ adminSessionTimeout: false }]), true)
})
