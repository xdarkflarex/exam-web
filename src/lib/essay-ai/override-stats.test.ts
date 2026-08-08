/**
 * Test cho phép tính số liệu chấm đè.
 *
 * Module này quyết định cổng chặn auto-chốt mở hay đóng, nên một lỗi đếm ở đây
 * không hiện ra như một bug — nó hiện ra như "hệ thống cho phép AI tự chốt điểm
 * dựa trên bằng chứng không có thật". Ba quy tắc trong docblock của
 * `override-stats.ts` là ba cách đếm sai đã lường trước; mỗi cái có test riêng
 * bên dưới.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  computeOverrideStats,
  SERIOUS_ERROR_RATIO,
  type ComputeOverrideStatsInput,
  type TeacherReviewRow,
  type UsageScoreRow,
} from './override-stats.ts'

const T0 = '2026-07-01T08:00:00.000Z'
const T1 = '2026-07-01T09:00:00.000Z'
const T2 = '2026-07-01T10:00:00.000Z'

function graded(id: string, aiScore: number, createdAt = T0): UsageScoreRow {
  return { studentAnswerId: id, aiScore, createdAt }
}

function reviewed(id: string, finalScore: number, createdAt = T1): TeacherReviewRow {
  return { studentAnswerId: id, finalScore, createdAt }
}

/** Thang điểm 1,0 cho mọi bài trừ khi test nói khác. */
function maxScores(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries)
}

function compute(input: Partial<ComputeOverrideStatsInput> = {}) {
  return computeOverrideStats({
    usage: [],
    reviews: [],
    maxScores: new Map(),
    ...input,
  })
}

// ---------------------------------------------------------------------------
// Đếm cơ bản
// ---------------------------------------------------------------------------

test('không có dữ liệu: mọi số bằng 0, avgAbsDiff là null chứ không phải 0', () => {
  const stats = compute()
  assert.deepEqual(stats, {
    compared: 0,
    changed: 0,
    serious: 0,
    absDiffSum: 0,
    avgAbsDiff: null,
    partial: false,
  })
})

test('giáo viên giữ nguyên điểm: so được nhưng không tính là sửa', () => {
  const stats = compute({
    usage: [graded('a', 0.75)],
    reviews: [reviewed('a', 0.75)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 1)
  assert.equal(stats.changed, 0)
  assert.equal(stats.serious, 0)
  assert.equal(stats.avgAbsDiff, 0)
})

test('giáo viên sửa điểm nhẹ: tính là sửa, không tính nghiêm trọng', () => {
  // Lệch 0,1 trên thang 1,0 = 10%, dưới ngưỡng 20%.
  const stats = compute({
    usage: [graded('a', 0.8)],
    reviews: [reviewed('a', 0.7)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.changed, 1)
  assert.equal(stats.serious, 0)
  assert.ok(Math.abs(stats.absDiffSum - 0.1) < 1e-9)
})

test('bài AI chấm mà chưa ai duyệt lại thì không vào mẫu so sánh', () => {
  const stats = compute({
    usage: [graded('a', 1), graded('b', 1)],
    reviews: [reviewed('a', 1)],
    maxScores: maxScores([
      ['a', 1],
      ['b', 1],
    ]),
  })
  assert.equal(stats.compared, 1)
})

test('bản duyệt của bài AI chưa chấm thì bị bỏ qua, không gây lỗi', () => {
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 1), reviewed('khong-lien-quan', 5)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 1)
})

test('lệch theo cả hai chiều đều tính: AI chấm cao hay thấp hơn đều là sai', () => {
  const stats = compute({
    usage: [graded('a', 0.2), graded('b', 0.9)],
    reviews: [reviewed('a', 1), reviewed('b', 0.1)],
    maxScores: maxScores([
      ['a', 1],
      ['b', 1],
    ]),
  })
  assert.equal(stats.compared, 2)
  assert.equal(stats.changed, 2)
  assert.equal(stats.serious, 2)
})

// ---------------------------------------------------------------------------
// Quy tắc 1: chỉ tính bản duyệt xảy ra SAU lần AI chấm
// ---------------------------------------------------------------------------

test('giáo viên chấm TRƯỚC khi AI chấm thì không phải chấm đè', () => {
  // Nếu tính, ta bịa ra một sai số mà AI không gây ra: giáo viên chấm trước,
  // AI chấm sau, hai điểm khác nhau là chuyện đương nhiên.
  const stats = compute({
    usage: [graded('a', 0.2, T2)],
    reviews: [reviewed('a', 1, T0)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 0)
  assert.equal(stats.serious, 0)
})

test('duyệt đúng cùng thời điểm với lần chấm vẫn được tính', () => {
  // Điều kiện loại là `reviewAt < gradedAt`; bằng nhau không loại.
  const stats = compute({
    usage: [graded('a', 0.2, T1)],
    reviews: [reviewed('a', 1, T1)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 1)
})

test('mốc thời gian không đọc được thì đánh dấu partial, không đoán thứ tự', () => {
  const stats = compute({
    usage: [graded('a', 0.2, 'khong-phai-thoi-gian')],
    reviews: [reviewed('a', 1)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 0)
  assert.equal(stats.partial, true)
})

test('mốc thời gian bản duyệt không đọc được cũng là partial', () => {
  const stats = compute({
    usage: [graded('a', 0.2)],
    reviews: [reviewed('a', 1, 'rac')],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.partial, true)
})

// ---------------------------------------------------------------------------
// Quy tắc 2: mỗi bài là một điểm dữ liệu
// ---------------------------------------------------------------------------

test('sửa điểm ba lần vẫn là một điểm dữ liệu, và lấy bản mới nhất', () => {
  const stats = compute({
    usage: [graded('a', 1, T0)],
    reviews: [
      reviewed('a', 0.9, T1),
      reviewed('a', 0.5, T2), // mới nhất
      reviewed('a', 1, T1),
    ],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 1)
  assert.equal(stats.changed, 1)
  assert.ok(Math.abs(stats.absDiffSum - 0.5) < 1e-9, 'phải so với bản duyệt mới nhất (0,5)')
})

test('bản duyệt mới nhất được chọn theo thời gian, không theo thứ tự truyền vào', () => {
  // Caller quên ORDER BY không được làm lệch kết quả.
  const ascending = compute({
    usage: [graded('a', 1, T0)],
    reviews: [reviewed('a', 0.9, T1), reviewed('a', 0.4, T2)],
    maxScores: maxScores([['a', 1]]),
  })
  const descending = compute({
    usage: [graded('a', 1, T0)],
    reviews: [reviewed('a', 0.4, T2), reviewed('a', 0.9, T1)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.deepEqual(ascending, descending)
})

test('AI chấm lại nhiều lượt vẫn là một điểm dữ liệu, lấy lượt mới nhất', () => {
  // Không gộp phía AI thì cỡ mẫu phồng lên bằng dòng trùng, và `compared` có
  // thể qua ngưỡng minCompared mà thực chất chỉ có vài bài.
  const stats = compute({
    usage: [graded('a', 0.1, T0), graded('a', 1, T1)],
    reviews: [reviewed('a', 1, T2)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 1)
  assert.equal(stats.changed, 0, 'lượt chấm mới nhất (1) trùng điểm giáo viên chốt')
  assert.equal(stats.serious, 0)
})

test('nhiều bài khác nhau thì đếm đủ từng bài', () => {
  const stats = compute({
    usage: [graded('a', 1), graded('b', 1), graded('c', 1)],
    reviews: [reviewed('a', 1), reviewed('b', 0.9), reviewed('c', 0.2)],
    maxScores: maxScores([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]),
  })
  assert.equal(stats.compared, 3)
  assert.equal(stats.changed, 2)
  assert.equal(stats.serious, 1)
})

// ---------------------------------------------------------------------------
// Quy tắc 3: sai nghiêm trọng đo theo thang điểm của chính câu đó
// ---------------------------------------------------------------------------

test('cùng độ lệch 0,5: nghiêm trọng ở câu 1 điểm, không ở câu 5 điểm', () => {
  const stats = compute({
    usage: [graded('nho', 1), graded('lon', 5)],
    reviews: [reviewed('nho', 0.5), reviewed('lon', 4.5)],
    maxScores: maxScores([
      ['nho', 1],
      ['lon', 5],
    ]),
  })
  assert.equal(stats.compared, 2)
  assert.equal(stats.changed, 2)
  // 0,5/1 = 50% > 20% -> nghiêm trọng. 0,5/5 = 10% -> không.
  assert.equal(stats.serious, 1)
})

test('đúng bằng 20% thang điểm chưa phải nghiêm trọng', () => {
  // So sánh là `>`: đúng mốc không tính.
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 1 - SERIOUS_ERROR_RATIO)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.changed, 1)
  assert.equal(stats.serious, 0)
})

test('vượt 20% một chút là nghiêm trọng', () => {
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 0.75)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.serious, 1)
})

test('thiếu thang điểm: vẫn tính vào compared nhưng đánh dấu partial', () => {
  // Bỏ qua âm thầm sẽ làm tỷ lệ sai nghiêm trọng nhỏ đi — đúng chiều nguy hiểm,
  // vì cổng chặn sẽ mở ra dựa trên một con số đã bị làm đẹp.
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 0)],
    maxScores: new Map(),
  })
  assert.equal(stats.compared, 1)
  assert.equal(stats.changed, 1)
  assert.equal(stats.serious, 0)
  assert.equal(stats.partial, true, 'thiếu thang điểm phải nhìn thấy được ở đầu ra')
})

test('thang điểm 0 hoặc âm được coi là không dùng được', () => {
  for (const bad of [0, -1]) {
    const stats = compute({
      usage: [graded('a', 1)],
      reviews: [reviewed('a', 0)],
      maxScores: maxScores([['a', bad]]),
    })
    assert.equal(stats.partial, true, `max_score = ${bad} phải là partial`)
    assert.equal(stats.serious, 0)
  }
})

test('một bài thiếu thang điểm không xoá kết luận của các bài khác', () => {
  const stats = compute({
    usage: [graded('a', 1), graded('b', 1)],
    reviews: [reviewed('a', 0), reviewed('b', 0)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.equal(stats.compared, 2)
  assert.equal(stats.serious, 1, 'bài a vẫn phải được kết luận nghiêm trọng')
  assert.equal(stats.partial, true)
})

// ---------------------------------------------------------------------------
// partial từ nguồn dữ liệu
// ---------------------------------------------------------------------------

test('sourceIncomplete từ người gọi luôn tạo partial', () => {
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 1)],
    maxScores: maxScores([['a', 1]]),
    sourceIncomplete: true,
  })
  assert.equal(stats.partial, true)
})

test('sourceIncomplete false không xoá partial do thiếu thang điểm', () => {
  // Hai nguồn của `partial` phải hợp OR, không phải cái sau ghi đè cái trước.
  const stats = compute({
    usage: [graded('a', 1)],
    reviews: [reviewed('a', 0)],
    maxScores: new Map(),
    sourceIncomplete: false,
  })
  assert.equal(stats.partial, true)
})

// ---------------------------------------------------------------------------
// avgAbsDiff
// ---------------------------------------------------------------------------

test('avgAbsDiff là trung bình trên các bài so được', () => {
  const stats = compute({
    usage: [graded('a', 1), graded('b', 1), graded('c', 1)],
    reviews: [reviewed('a', 1), reviewed('b', 0.5), reviewed('c', 0)],
    maxScores: maxScores([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]),
  })
  // Lệch: 0 + 0,5 + 1 = 1,5 trên 3 bài.
  assert.ok(Math.abs(stats.absDiffSum - 1.5) < 1e-9)
  assert.ok(Math.abs((stats.avgAbsDiff ?? -1) - 0.5) < 1e-9)
})

test('avgAbsDiff không chia cho 0 khi không so được bài nào', () => {
  const stats = compute({ usage: [graded('a', 1)], reviews: [] })
  assert.equal(stats.avgAbsDiff, null)
})

// ---------------------------------------------------------------------------
// Bất biến
// ---------------------------------------------------------------------------

test('changed và serious không bao giờ vượt compared', () => {
  const inputs: Array<Partial<ComputeOverrideStatsInput>> = [
    {
      usage: [graded('a', 1), graded('a', 0, T1)],
      reviews: [reviewed('a', 0, T2), reviewed('a', 1, T1)],
      maxScores: maxScores([['a', 1]]),
    },
    {
      usage: [graded('a', 5), graded('b', 0)],
      reviews: [reviewed('a', 0), reviewed('b', 5)],
      maxScores: maxScores([
        ['a', 5],
        ['b', 5],
      ]),
    },
    { usage: [graded('a', 1)], reviews: [reviewed('a', 1, T0)] },
  ]
  for (const input of inputs) {
    const stats = compute(input)
    assert.ok(stats.changed <= stats.compared, 'changed vượt compared')
    assert.ok(stats.serious <= stats.compared, 'serious vượt compared')
    assert.ok(stats.serious <= stats.changed, 'sai nghiêm trọng phải là một loại của sửa điểm')
  }
})

test('không bao giờ trả số âm', () => {
  const stats = compute({
    usage: [graded('a', -1)], // dữ liệu bẩn: điểm âm trong nhật ký
    reviews: [reviewed('a', 1)],
    maxScores: maxScores([['a', 1]]),
  })
  assert.ok(stats.absDiffSum >= 0)
  assert.ok(stats.compared >= 0 && stats.changed >= 0 && stats.serious >= 0)
})
