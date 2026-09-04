import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  describeClassId,
  isBrokenClassId,
  classOptionLabel,
  type ClassOption,
} from './class-options.ts'

const CLASSES: ClassOption[] = [
  { id: 'class_1781517811246', name: 'LOP10', grade: 10 },
  { id: 'class_1781517817899', name: 'LOP11', grade: 11 },
  { id: 'class_1781517825029', name: 'LOP12', grade: 12 },
]

test('class_id khớp thì hiện tên lớp', () => {
  assert.equal(describeClassId('class_1781517811246', CLASSES), 'LOP10')
})

test('chưa xếp lớp nói rõ là chưa xếp, không phải "lớp khác"', () => {
  assert.equal(describeClassId(null, CLASSES), 'Chưa xếp lớp')
  assert.equal(describeClassId(undefined, CLASSES), 'Chưa xếp lớp')
  assert.equal(describeClassId('', CLASSES), 'Chưa xếp lớp')
})

test('class_id rác hiện NGUYÊN giá trị, không giấu đi', () => {
  // Đúng năm giá trị đo được trên Primary ngày 2026-09-04.
  for (const rac of ['10a1', '12', '9/1', '10', '10A5']) {
    const text = describeClassId(rac, CLASSES)
    assert.ok(text.includes(rac), `mất giá trị rác "${rac}" trong "${text}"`)
    assert.ok(text.includes('không khớp'), `không nói ra là hỏng: "${text}"`)
  }
})

test('hồ sơ hỏng KHÔNG được trông giống hồ sơ ở lớp thật', () => {
  // Đây là chỗ lỗi cũ sống sót: cả hai đều hiện "Lớp khác".
  assert.notEqual(
    describeClassId('10a1', CLASSES),
    describeClassId('class_1781517825029', CLASSES)
  )
})

test('isBrokenClassId phân biệt đúng ba trạng thái', () => {
  assert.equal(isBrokenClassId(null, CLASSES), false, 'chưa xếp lớp không phải là hỏng')
  assert.equal(isBrokenClassId('class_1781517811246', CLASSES), false)
  assert.equal(isBrokenClassId('10a1', CLASSES), true)
})

test('bảng lớp rỗng thì mọi class_id có giá trị đều là hỏng', () => {
  assert.equal(isBrokenClassId('class_1781517811246', []), true)
  assert.equal(isBrokenClassId(null, []), false)
})

test('nhãn ô chọn kèm khối để phân biệt lớp trùng tên', () => {
  assert.equal(classOptionLabel(CLASSES[0]), 'LOP10 (lớp 10)')
  assert.equal(classOptionLabel({ id: 'x', name: 'Lớp ôn', grade: null }), 'Lớp ôn')
})
