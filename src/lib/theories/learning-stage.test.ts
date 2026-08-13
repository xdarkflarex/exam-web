/**
 * Test cho khâu học trong một bài.
 *
 * Hai bất biến đáng test ở đây đều là quyết định thiết kế, không phải chi tiết
 * cài đặt: THỨ TỰ KHỐI KHÔNG ĐỔI (đoạn chỉ được đánh dấu, không được sắp lại),
 * và CHÚ Ý KHÔNG MỞ KHÂU MỚI. Cả hai đều dễ bị "sửa cho gọn" bởi một lượt
 * refactor sau này.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BlockType } from '../../types/theories.ts'
import {
  LEARNING_STAGES,
  splitIntoStageRuns,
  stageOfBlock,
  summarizeStages,
} from './learning-stage.ts'

const block = (id: string, type: BlockType) => ({ id, block_type: type })

test('chín loại khối được phủ hết: tám loại có khâu, chú ý thì không', () => {
  const all: BlockType[] = [
    'dinh_nghia', 'dinh_ly', 'tinh_chat', 'he_qua',
    'cong_thuc', 'phuong_phap', 'chu_y', 'vi_du', 'bai_tap',
  ]
  const staged = all.filter(type => stageOfBlock(type) !== null)

  assert.equal(staged.length, 8)
  assert.equal(stageOfBlock('chu_y'), null)
})

test('số thứ tự khâu liên tục 1..6 theo đúng thứ tự mảng', () => {
  assert.deepEqual(
    LEARNING_STAGES.map(stage => stage.step),
    [1, 2, 3, 4, 5, 6]
  )
})

test('định lý, tính chất, hệ quả cùng một khâu', () => {
  const keys = ['dinh_ly', 'tinh_chat', 'he_qua'].map(
    type => stageOfBlock(type as BlockType)?.key
  )
  assert.deepEqual(keys, ['ket_qua', 'ket_qua', 'ket_qua'])
})

test('đoạn giữ nguyên thứ tự khối, không gom theo khâu', () => {
  // Bài quay lại khâu Ví dụ sau khi bổ sung phương pháp — hợp lệ và hay gặp.
  const blocks = [
    block('a', 'dinh_nghia'),
    block('b', 'vi_du'),
    block('c', 'phuong_phap'),
    block('d', 'vi_du'),
  ]
  const runs = splitIntoStageRuns(blocks)

  assert.deepEqual(
    runs.map(run => run.stage?.key),
    ['khai_niem', 'vi_du', 'phuong_phap', 'vi_du']
  )
  // Thứ tự đọc phải khớp từng khối một với đầu vào.
  assert.deepEqual(
    runs.flatMap(run => run.blocks.map(item => item.id)),
    ['a', 'b', 'c', 'd']
  )
})

test('khối liền nhau cùng khâu gộp thành một đoạn', () => {
  const runs = splitIntoStageRuns([
    block('a', 'dinh_ly'),
    block('b', 'tinh_chat'),
    block('c', 'he_qua'),
  ])

  assert.equal(runs.length, 1)
  assert.equal(runs[0].stage?.key, 'ket_qua')
  assert.equal(runs[0].blocks.length, 3)
})

test('chú ý nhập vào đoạn đang mở, không cắt đoạn', () => {
  const runs = splitIntoStageRuns([
    block('a', 'vi_du'),
    block('b', 'chu_y'),
    block('c', 'vi_du'),
  ])

  assert.equal(runs.length, 1)
  assert.equal(runs[0].stage?.key, 'vi_du')
  assert.deepEqual(runs[0].blocks.map(item => item.id), ['a', 'b', 'c'])
})

test('chú ý đứng đầu bài mở một đoạn không khâu', () => {
  const runs = splitIntoStageRuns([block('a', 'chu_y'), block('b', 'dinh_nghia')])

  assert.equal(runs.length, 2)
  assert.equal(runs[0].stage, null)
  assert.equal(runs[1].stage?.key, 'khai_niem')
})

test('bài rỗng cho danh sách rỗng, không cho một đoạn rỗng', () => {
  assert.deepEqual(splitIntoStageRuns([]), [])
  assert.deepEqual(summarizeStages([]), [])
})

test('tóm tắt chỉ liệt kê khâu CÓ, theo thứ tự chuẩn dù bài viết lộn xộn', () => {
  const summary = summarizeStages([
    block('a', 'bai_tap'),
    block('b', 'dinh_nghia'),
    block('c', 'vi_du'),
    block('d', 'vi_du'),
  ])

  assert.deepEqual(
    summary.map(entry => [entry.stage.key, entry.count]),
    [['khai_niem', 1], ['vi_du', 2], ['bai_tap', 1]]
  )
})

test('chú ý không được đếm vào khâu nào', () => {
  const summary = summarizeStages([block('a', 'chu_y'), block('b', 'chu_y')])
  assert.deepEqual(summary, [])
})
