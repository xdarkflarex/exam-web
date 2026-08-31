import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CLASSIFY_SCHEMA,
  assertPathInTree,
  parseClassifyResult,
  type ClassifyExpectation,
  type TaxonomyTree,
} from './classify-ai.ts'

/*
  Cây thử dựng theo đúng hình dạng thật: hai chủ đề, mỗi chủ đề có chương riêng,
  và có một cặp cố tình "gần giống" giữa hai nhánh để bắt lỗi gắn nhầm cha.
*/
const TREE: TaxonomyTree = {
  topics: [
    { id: 't-gt', name: 'Giải tích' },
    { id: 't-hh', name: 'Hình học' },
  ],
  categories: [
    { id: 'c-daoham', name: 'Ứng dụng đạo hàm', topic_id: 't-gt' },
    { id: 'c-tichphan', name: 'Nguyên hàm – Tích phân', topic_id: 't-gt' },
    { id: 'c-oxyz', name: 'Toạ độ Oxyz', topic_id: 't-hh' },
  ],
  sections: [
    { id: 's-donbien', name: 'Tính đơn điệu', category_id: 'c-daoham', topic_id: 't-gt' },
    { id: 's-matphang', name: 'Phương trình mặt phẳng', category_id: 'c-oxyz', topic_id: 't-hh' },
  ],
  subsections: [
    { id: 'ss-khoang', name: 'Tìm khoảng đơn điệu', section_id: 's-donbien' },
    { id: 'ss-vtpt', name: 'Vectơ pháp tuyến', section_id: 's-matphang' },
  ],
}

const EXPECTED: ClassifyExpectation = {
  questionIds: ['q1', 'q2'],
  tree: TREE,
}

function payload(items: Array<Record<string, unknown>>): Record<string, unknown> {
  return { schema: CLASSIFY_SCHEMA, ket_qua: items }
}

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question_id: 'q1',
    ly_do: 'Đề hỏi khoảng đồng biến.',
    topic_id: 't-gt',
    category_id: 'c-daoham',
    section_id: 's-donbien',
    subsection_id: 'ss-khoang',
    do_tin_cay: 0.85,
    ...overrides,
  }
}

// --- Kiểm cây --------------------------------------------------------------

test('đường đi đầy đủ và đúng quan hệ cha–con thì hợp lệ', () => {
  assertPathInTree(
    { topic_id: 't-gt', category_id: 'c-daoham', section_id: 's-donbien', subsection_id: 'ss-khoang' },
    TREE
  )
})

test('gợi ý nông là hợp lệ', () => {
  assertPathInTree(
    { topic_id: 't-gt', category_id: null, section_id: null, subsection_id: null },
    TREE
  )
  assertPathInTree(
    { topic_id: 't-gt', category_id: 'c-daoham', section_id: null, subsection_id: null },
    TREE
  )
})

test('không khớp: mọi tầng đều null', () => {
  assertPathInTree({ topic_id: null, category_id: null, section_id: null, subsection_id: null }, TREE)
})

test('id bịa bị từ chối', () => {
  assert.throws(
    () =>
      assertPathInTree(
        { topic_id: 't-khong-co', category_id: null, section_id: null, subsection_id: null },
        TREE
      ),
    /Chủ đề không có trong cây/
  )
})

test('id có thật nhưng SAI CHA bị từ chối — đây là lỗi nguy hiểm nhất', () => {
  // `c-oxyz` có thật, nhưng nó thuộc Hình học chứ không thuộc Giải tích. Ghi ra
  // thì mọi bộ lọc theo cây đọc sai từ đó trở đi.
  assert.throws(
    () =>
      assertPathInTree(
        { topic_id: 't-gt', category_id: 'c-oxyz', section_id: null, subsection_id: null },
        TREE
      ),
    /Chương không thuộc chủ đề đã chọn/
  )

  assert.throws(
    () =>
      assertPathInTree(
        { topic_id: 't-gt', category_id: 'c-daoham', section_id: 's-matphang', subsection_id: null },
        TREE
      ),
    /Bài không thuộc chương đã chọn/
  )

  assert.throws(
    () =>
      assertPathInTree(
        {
          topic_id: 't-gt',
          category_id: 'c-daoham',
          section_id: 's-donbien',
          subsection_id: 'ss-vtpt',
        },
        TREE
      ),
    /Dạng câu không thuộc bài đã chọn/
  )
})

test('nhảy cóc tầng bị từ chối', () => {
  assert.throws(
    () =>
      assertPathInTree(
        { topic_id: 't-gt', category_id: null, section_id: 's-donbien', subsection_id: null },
        TREE
      ),
    /Thiếu chương/
  )
  assert.throws(
    () =>
      assertPathInTree(
        { topic_id: null, category_id: 'c-daoham', section_id: null, subsection_id: null },
        TREE
      ),
    /Không có chủ đề thì không được gán tầng con/
  )
})

// --- Parse -----------------------------------------------------------------

test('kết quả hợp lệ đi qua', () => {
  const result = parseClassifyResult(payload([item()]), EXPECTED)
  assert.equal(result.length, 1)
  assert.equal(result[0].question_id, 'q1')
  assert.equal(result[0].subsection_id, 'ss-khoang')
})

test('đọc được JSON bọc trong hàng rào markdown', () => {
  const raw = '```json\n' + JSON.stringify(payload([item()])) + '\n```'
  assert.equal(parseClassifyResult(raw, EXPECTED).length, 1)
})

test('sai schema thì từ chối', () => {
  assert.throws(
    () => parseClassifyResult({ schema: 'khac.v9', ket_qua: [] }, EXPECTED),
    /Sai schema/
  )
})

test('trả về câu không thuộc lô đã gửi thì từ chối', () => {
  assert.throws(
    () => parseClassifyResult(payload([item({ question_id: 'q-la' })]), EXPECTED),
    /không thuộc lô đã gửi/
  )
})

test('câu lặp lại thì từ chối', () => {
  assert.throws(
    () => parseClassifyResult(payload([item(), item()]), EXPECTED),
    /câu lặp lại/
  )
})

test('model bỏ sót câu KHÔNG làm hỏng cả lô', () => {
  // q2 không có mặt. Người gọi coi nó là "không xếp được", còn q1 vẫn dùng được.
  const result = parseClassifyResult(payload([item()]), EXPECTED)
  assert.deepEqual(
    result.map((row) => row.question_id),
    ['q1']
  )
})

test('một mục bịa nhánh thì HỎNG CẢ LÔ', () => {
  // Chủ ý: model đang bịa thì những mục còn lại của cùng lượt đó không đáng tin
  // hơn, nên không nhặt phần "trông có vẻ ổn" ra dùng.
  assert.throws(
    () =>
      parseClassifyResult(
        payload([item(), item({ question_id: 'q2', topic_id: 't-bia', category_id: null, section_id: null, subsection_id: null })]),
        EXPECTED
      ),
    /Chủ đề không có trong cây/
  )
})

test('gợi ý có nhánh mà thiếu lý do thì từ chối', () => {
  assert.throws(() => parseClassifyResult(payload([item({ ly_do: '  ' })]), EXPECTED), /phải kèm lý do/)
})

test('không khớp thì không cần lý do', () => {
  const result = parseClassifyResult(
    payload([
      item({
        ly_do: '',
        topic_id: null,
        category_id: null,
        section_id: null,
        subsection_id: null,
      }),
    ]),
    EXPECTED
  )
  assert.equal(result[0].topic_id, null)
})

test('do_tin_cay ngoài 0..1 thì từ chối', () => {
  assert.throws(() => parseClassifyResult(payload([item({ do_tin_cay: 1.4 })]), EXPECTED), /0\.\.1/)
  assert.throws(() => parseClassifyResult(payload([item({ do_tin_cay: '0.9' })]), EXPECTED), /0\.\.1/)
})

test('chuỗi rỗng được coi như null, không phải id rỗng', () => {
  const result = parseClassifyResult(
    payload([item({ section_id: '', subsection_id: '' })]),
    EXPECTED
  )
  assert.equal(result[0].section_id, null)
  assert.equal(result[0].subsection_id, null)
})
