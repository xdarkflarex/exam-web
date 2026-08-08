/**
 * Test cho thang đo năng lực. Dùng `node:test` có sẵn trong Node, không cài
 * thêm framework.
 *
 * Chạy: npm run test:unit
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MIN_EVIDENCE,
  aggregateMastery,
  getMasteryStatus,
  masteryKey,
  masteryPriority,
  rollUpByTheory,
  splitEvidence,
  type MasteryAnswer,
} from './knowledge-mastery.ts'

// ---------------------------------------------------------------------------
// Ranh giới sáu mức trạng thái
// ---------------------------------------------------------------------------

test('không có bằng chứng thì là no_data', () => {
  assert.equal(getMasteryStatus(0, 0), 'no_data')
  assert.equal(getMasteryStatus(0, -1), 'no_data')
})

test('1 đúng trên 1 câu ra collecting, KHÔNG ra stable', () => {
  // Đây là lỗi cụ thể của thang cũ: getCapabilityStatus(1, 1) trả 'stable'
  // ("Ổn định") vì score = 1.0 và total < 8. Một câu đúng không đủ kết luận.
  assert.equal(getMasteryStatus(1, 1), 'collecting')
})

test('dưới ngưỡng bằng chứng luôn là collecting, bất kể đúng sai', () => {
  for (let evidence = 1; evidence < MIN_EVIDENCE; evidence += 1) {
    assert.equal(getMasteryStatus(evidence, evidence), 'collecting', `${evidence} đúng hết`)
    assert.equal(getMasteryStatus(0, evidence), 'collecting', `${evidence} sai hết`)
  }
})

test('đủ bằng chứng thì xếp theo độ chính xác', () => {
  // Ngưỡng bằng chứng đứng trước ngưỡng chính xác, nên tại đúng MIN_EVIDENCE
  // mới bắt đầu phân loại.
  assert.equal(getMasteryStatus(0, 4), 'needs_work') // 0%
  assert.equal(getMasteryStatus(1, 4), 'needs_work') // 25%
  assert.equal(getMasteryStatus(2, 4), 'building') // 50% — biên dưới của building
  assert.equal(getMasteryStatus(3, 4), 'building') // 75%
  assert.equal(getMasteryStatus(4, 4), 'stable') // 100% nhưng chỉ 4 bằng chứng
})

test('biên needs_work/building tại đúng 50%', () => {
  assert.equal(getMasteryStatus(4.9, 10), 'needs_work') // 49%
  assert.equal(getMasteryStatus(5, 10), 'building') // 50%
})

test('biên building/mastered tại đúng 80% khi bằng chứng dày', () => {
  assert.equal(getMasteryStatus(7.9, 10), 'building') // 79%
  assert.equal(getMasteryStatus(8, 10), 'mastered') // 80% và >= 8 bằng chứng
})

test('stable cần chính xác cao nhưng bằng chứng chưa dày', () => {
  assert.equal(getMasteryStatus(6, 7), 'stable') // 86%, 7 bằng chứng
  assert.equal(getMasteryStatus(7, 8), 'mastered') // 88%, 8 bằng chứng
})

test('thứ tự ưu tiên đặt needs_work lên trước mastered', () => {
  assert.ok(masteryPriority('needs_work') < masteryPriority('building'))
  assert.ok(masteryPriority('building') < masteryPriority('collecting'))
  assert.ok(masteryPriority('collecting') < masteryPriority('stable'))
  assert.ok(masteryPriority('stable') < masteryPriority('mastered'))
  assert.ok(masteryPriority('mastered') < masteryPriority('no_data'))
})

// ---------------------------------------------------------------------------
// Khóa tổng hợp
// ---------------------------------------------------------------------------

test('block cụ thể hơn nên được ưu tiên làm khóa', () => {
  assert.equal(masteryKey({ theoryId: 't1', blockId: 'b1' }), 'block:b1')
  assert.equal(masteryKey({ theoryId: 't1', blockId: null }), 'theory:t1')
  assert.equal(masteryKey({ theoryId: null, blockId: null }), null)
})

// ---------------------------------------------------------------------------
// Chia bằng chứng theo trọng số
// ---------------------------------------------------------------------------

test('một liên kết nhận toàn bộ một đơn vị bằng chứng', () => {
  const shares = splitEvidence([{ theoryId: 't1', blockId: null, weight: 1 }])
  assert.equal(shares.get('theory:t1'), 1)
})

test('tổng bằng chứng của một câu luôn bằng 1', () => {
  const cases = [
    [{ theoryId: 't1', blockId: null, weight: 1 }, { theoryId: 't2', blockId: null, weight: 1 }],
    [
      { theoryId: 't1', blockId: null, weight: 3 },
      { theoryId: 't2', blockId: null, weight: 1 },
      { theoryId: 't3', blockId: null, weight: 1 },
    ],
    [{ theoryId: 't1', blockId: null, weight: 0.5 }, { theoryId: 't2', blockId: null, weight: 2.25 }],
  ]
  for (const links of cases) {
    const total = [...splitEvidence(links).values()].reduce((sum, value) => sum + value, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `tổng = ${total}`)
  }
})

test('chia theo tỷ lệ trọng số', () => {
  const shares = splitEvidence([
    { theoryId: 't1', blockId: null, weight: 3 },
    { theoryId: 't2', blockId: null, weight: 1 },
  ])
  assert.equal(shares.get('theory:t1'), 0.75)
  assert.equal(shares.get('theory:t2'), 0.25)
})

test('trọng số thiếu, null hoặc không hợp lệ coi như chia đều', () => {
  const shares = splitEvidence([
    { theoryId: 't1', blockId: null },
    { theoryId: 't2', blockId: null, weight: null },
  ])
  assert.equal(shares.get('theory:t1'), 0.5)
  assert.equal(shares.get('theory:t2'), 0.5)
})

test('tất cả trọng số bằng 0 thì chia đều thay vì chia cho 0', () => {
  const shares = splitEvidence([
    { theoryId: 't1', blockId: null, weight: 0 },
    { theoryId: 't2', blockId: null, weight: 0 },
  ])
  assert.equal(shares.get('theory:t1'), 0.5)
  assert.equal(shares.get('theory:t2'), 0.5)
})

test('trọng số 0 cạnh trọng số dương bị loại hẳn, không tạo bucket rỗng', () => {
  const shares = splitEvidence([
    { theoryId: 't1', blockId: null, weight: 2 },
    { theoryId: 't2', blockId: null, weight: 0 },
  ])
  assert.equal(shares.get('theory:t1'), 1)
  assert.equal(shares.has('theory:t2'), false)
})

test('trọng số âm và NaN không làm hỏng phép chia', () => {
  const shares = splitEvidence([
    { theoryId: 't1', blockId: null, weight: -5 },
    { theoryId: 't2', blockId: null, weight: Number.NaN },
    { theoryId: 't3', blockId: null, weight: 4 },
  ])
  assert.equal(shares.get('theory:t3'), 1)
  assert.equal(shares.size, 1)
})

test('liên kết không có theory lẫn block bị bỏ qua', () => {
  assert.equal(splitEvidence([{ theoryId: null, blockId: null, weight: 1 }]).size, 0)
  assert.equal(splitEvidence([]).size, 0)
})

// ---------------------------------------------------------------------------
// Lỗi gán chéo: một bài tập nhắm nhiều chuyên đề
// ---------------------------------------------------------------------------

test('một bài nhắm 3 chuyên đề KHÔNG cộng nguyên tiến độ cho cả 3', () => {
  // Lỗi cũ ở learn/page.tsx:111-113: mỗi theory nhận nguyên answeredCount của
  // homework. Học sinh làm 1 câu đúng của bài nhắm 3 chuyên đề thì cả 3 node
  // sáng như đã học đủ. Giờ mỗi chuyên đề chỉ nhận 1/3 bằng chứng.
  const answers: MasteryAnswer[] = [
    {
      questionId: 'q1',
      isCorrect: true,
      answeredAt: '2026-07-01T00:00:00Z',
      links: [
        { theoryId: 't1', blockId: null, weight: 1 },
        { theoryId: 't2', blockId: null, weight: 1 },
        { theoryId: 't3', blockId: null, weight: 1 },
      ],
    },
  ]

  const stats = aggregateMastery(answers)
  assert.equal(stats.length, 3)

  const totalEvidence = stats.reduce((sum, stat) => sum + stat.evidence, 0)
  assert.ok(Math.abs(totalEvidence - 1) < 0.02, `tổng bằng chứng = ${totalEvidence}`)

  for (const stat of stats) {
    assert.ok(stat.evidence < 0.4, `${stat.id} nhận ${stat.evidence}`)
    // Một câu duy nhất không đủ để kết luận bất cứ điều gì.
    assert.equal(stat.status, 'collecting')
  }
})

test('làm hết bài nhưng sai toàn bộ KHÔNG ra trạng thái đạt', () => {
  // Lỗi cũ: progress = answered/total = 100% và nhãn "Đã đạt 80%" màu emerald.
  const answers: MasteryAnswer[] = Array.from({ length: 10 }, (_, index) => ({
    questionId: `q${index}`,
    isCorrect: false,
    answeredAt: '2026-07-01T00:00:00Z',
    links: [{ theoryId: 't1', blockId: null, weight: 1 }],
  }))

  const [stat] = aggregateMastery(answers)
  assert.equal(stat.evidence, 10)
  assert.equal(stat.accuracy, 0)
  assert.equal(stat.status, 'needs_work')
})

test('đo bằng độ chính xác, không phải số câu đã làm', () => {
  const build = (correctCount: number): MasteryAnswer[] =>
    Array.from({ length: 10 }, (_, index) => ({
      questionId: `q${index}`,
      isCorrect: index < correctCount,
      answeredAt: null,
      links: [{ theoryId: 't1', blockId: null, weight: 1 }],
    }))

  // Cùng số câu đã làm, khác số câu đúng, phải ra trạng thái khác nhau.
  assert.equal(aggregateMastery(build(2))[0].status, 'needs_work')
  assert.equal(aggregateMastery(build(6))[0].status, 'building')
  assert.equal(aggregateMastery(build(9))[0].status, 'mastered')
})

// ---------------------------------------------------------------------------
// Tổng hợp
// ---------------------------------------------------------------------------

test('câu trả lời không có liên kết kiến thức bị bỏ qua', () => {
  const stats = aggregateMastery([
    { questionId: 'q1', isCorrect: true, answeredAt: null, links: [] },
    { questionId: 'q2', isCorrect: true, answeredAt: null, links: [{ theoryId: null, blockId: null }] },
  ])
  assert.equal(stats.length, 0)
})

test('không có câu trả lời nào thì trả về danh sách rỗng', () => {
  assert.deepEqual(aggregateMastery([]), [])
})

test('giữ mốc hoạt động gần nhất', () => {
  const stats = aggregateMastery([
    {
      questionId: 'q1',
      isCorrect: true,
      answeredAt: '2026-07-01T00:00:00Z',
      links: [{ theoryId: 't1', blockId: null, weight: 1 }],
    },
    {
      questionId: 'q2',
      isCorrect: true,
      answeredAt: '2026-07-05T00:00:00Z',
      links: [{ theoryId: 't1', blockId: null, weight: 1 }],
    },
    {
      questionId: 'q3',
      isCorrect: true,
      answeredAt: null,
      links: [{ theoryId: 't1', blockId: null, weight: 1 }],
    },
  ])
  assert.equal(stats[0].lastActivityAt, '2026-07-05T00:00:00Z')
})

test('đếm số câu tách biệt với bằng chứng đã quy đổi', () => {
  // Hai câu, mỗi câu nhắm 2 chuyên đề: mỗi chuyên đề có 2 câu nhưng chỉ 1 đơn
  // vị bằng chứng. Hiển thị dùng answeredCount, xếp mức dùng evidence.
  const answers: MasteryAnswer[] = [1, 2].map((index) => ({
    questionId: `q${index}`,
    isCorrect: true,
    answeredAt: null,
    links: [
      { theoryId: 't1', blockId: null, weight: 1 },
      { theoryId: 't2', blockId: null, weight: 1 },
    ],
  }))

  const stats = aggregateMastery(answers)
  for (const stat of stats) {
    assert.equal(stat.answeredCount, 2)
    assert.equal(stat.correctCount, 2)
    assert.equal(stat.evidence, 1)
  }
})

test('sắp xếp đặt mảng cần củng cố lên đầu', () => {
  const answers: MasteryAnswer[] = [
    ...Array.from({ length: 10 }, (_, index) => ({
      questionId: `good${index}`,
      isCorrect: true,
      answeredAt: null,
      links: [{ theoryId: 'strong', blockId: null, weight: 1 }],
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      questionId: `bad${index}`,
      isCorrect: index < 2,
      answeredAt: null,
      links: [{ theoryId: 'weak', blockId: null, weight: 1 }],
    })),
  ]

  const stats = aggregateMastery(answers)
  assert.equal(stats[0].theoryId, 'weak')
  assert.equal(stats[0].status, 'needs_work')
  assert.equal(stats[1].theoryId, 'strong')
})

test('gộp block về theory cha', () => {
  const answers: MasteryAnswer[] = [
    ...Array.from({ length: 4 }, (_, index) => ({
      questionId: `a${index}`,
      isCorrect: true,
      answeredAt: null,
      links: [{ theoryId: 't1', blockId: 'b1', weight: 1 }],
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      questionId: `b${index}`,
      isCorrect: false,
      answeredAt: null,
      links: [{ theoryId: 't1', blockId: 'b2', weight: 1 }],
    })),
  ]

  const stats = aggregateMastery(answers)
  assert.equal(stats.length, 2)

  const byTheory = rollUpByTheory(stats)
  const rolled = byTheory.get('t1')
  assert.ok(rolled)
  assert.equal(rolled.evidence, 8)
  assert.equal(rolled.correctEvidence, 4)
  assert.equal(rolled.accuracy, 50)
  assert.equal(rolled.status, 'building')
  assert.equal(rolled.answeredCount, 8)
})

test('gộp theory bỏ qua stat không gắn theory', () => {
  const stats = aggregateMastery([
    {
      questionId: 'q1',
      isCorrect: true,
      answeredAt: null,
      links: [{ theoryId: null, blockId: 'orphan', weight: 1 }],
    },
  ])
  assert.equal(stats.length, 1)
  assert.equal(rollUpByTheory(stats).size, 0)
})
