/**
 * Test phép khớp "bài lý thuyết nào thì mở được công cụ nào".
 *
 * Tên chương trong các assert dưới đây lấy theo cách đặt tên thật của cây tri
 * thức (`topics` lớp → `categories` chương → `sections` bài); đổi tên chương thì
 * chạy lại test này trước.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findTool, findToolsForLesson, STUDENT_TOOLS } from './registry.ts'

const slugs = (lesson: Parameters<typeof findToolsForLesson>[0]) => findToolsForLesson(lesson).map((t) => t.slug)

test('mỗi công cụ có đủ khối và từ khoá, không trùng slug', () => {
  const seen = new Set<string>()
  for (const tool of STUDENT_TOOLS) {
    assert.ok(!seen.has(tool.slug), `slug trùng: ${tool.slug}`)
    seen.add(tool.slug)
    assert.ok(tool.grades.length > 0, `${tool.slug} chưa khai báo khối`)
    assert.ok(tool.lessonKeywords.length > 0, `${tool.slug} chưa có từ khoá`)
    // Từ khoá phải đã bỏ dấu, nếu không sẽ không bao giờ khớp.
    for (const k of tool.lessonKeywords) {
      assert.equal(k, k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), `từ khoá còn dấu: ${k}`)
    }
  }
})

test('khớp bài lý thuyết với công cụ, không phụ thuộc dấu tiếng Việt', () => {
  assert.deepEqual(
    slugs({ grade: 'Toán 12', chapter: 'Chương 4: Nguyên hàm và tích phân', title: 'Tích phân' }),
    ['integral'],
  )
  assert.deepEqual(
    slugs({ grade: 'Toán 12', chapter: 'Chương 1: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', title: 'Tính đơn điệu' }),
    ['function-analysis'],
  )
  assert.deepEqual(
    slugs({ grade: 'Toán 12', chapter: 'Chương 5: Phương pháp toạ độ trong không gian', title: 'Phương trình mặt phẳng' }),
    ['space'],
  )
  assert.deepEqual(
    slugs({ grade: 'Toán 10', chapter: 'Chương 2: Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', title: 'Miền nghiệm' }),
    ['inequality-region'],
  )
  assert.deepEqual(
    slugs({ grade: 'Toán 11', chapter: 'Các số đặc trưng của mẫu số liệu ghép nhóm', title: 'Tứ phân vị' }),
    ['grouped-data'],
  )
  assert.deepEqual(slugs({ grade: 'Toán 12', chapter: 'Chương 6: Xác suất có điều kiện', title: 'Công thức Bayes' }), [
    'conditional-probability',
  ])
})

test('lớp khớp chặt: "mặt phẳng" của lớp 11 không phải Oxyz', () => {
  // Hình học không gian tổng hợp lớp 11 cũng đầy chữ "mặt phẳng".
  assert.deepEqual(slugs({ grade: 'Toán 11', chapter: 'Quan hệ vuông góc trong không gian', title: 'Hai mặt phẳng vuông góc' }), [])
  // Cùng từ khoá ấy ở lớp 12 thì đúng là công cụ Oxyz.
  assert.deepEqual(slugs({ grade: 'Toán 12', chapter: 'Phương trình mặt phẳng', title: '' }), ['space'])
  // Xác suất lớp 11 (cổ điển) chưa có công cụ; lớp 12 (có điều kiện) thì có.
  assert.deepEqual(slugs({ grade: 'Toán 11', chapter: 'Xác suất', title: 'Biến cố hợp' }), [])
})

test('thiếu thông tin thì im lặng, không đoán bừa', () => {
  assert.deepEqual(slugs({ grade: 'Toán 12', chapter: '', title: '' }), [])
  assert.deepEqual(slugs({ grade: null, chapter: null, title: null }), [])
  // Chương không liên quan thì không gợi ý gì.
  assert.deepEqual(slugs({ grade: 'Toán 11', chapter: 'Dãy số. Cấp số cộng và cấp số nhân', title: 'Cấp số nhân' }), [])
  // Không biết lớp thì vẫn gợi ý theo từ khoá, chứ không bỏ trống.
  assert.deepEqual(slugs({ grade: null, chapter: 'Nguyên hàm', title: '' }), ['integral'])
})

test('findTool nhận đúng đường dẫn của từng công cụ', () => {
  for (const tool of STUDENT_TOOLS) {
    assert.equal(findTool(`/student/tools/${tool.slug}`)?.slug, tool.slug)
  }
  assert.equal(findTool('/student/tools'), undefined)
  assert.equal(findTool('/student/history'), undefined)
})
