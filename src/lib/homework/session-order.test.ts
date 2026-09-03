import { test } from 'node:test'
import assert from 'node:assert/strict'

import { arrangeHomeworkSessions, type OrderableQuestion } from './session-order.ts'
import { COGNITIVE_LEVELS, type CognitiveLevel } from '../theories/cognitive.ts'

function q(id: string, level: CognitiveLevel, orderIndex: number, phase?: 'practice' | 'test'): OrderableQuestion {
  return { id, level, order_index: orderIndex, phase }
}

/** Cắt kết quả phẳng thành các đoạn đúng như `HomeworkRunner` sẽ cắt. */
function toSessions(arranged: OrderableQuestion[], sessionSize: number): OrderableQuestion[][] {
  const practice = arranged.filter(item => item.phase !== 'test')
  const test = arranged.filter(item => item.phase === 'test')
  const out: OrderableQuestion[][] = []
  for (let i = 0; i < practice.length; i += sessionSize) out.push(practice.slice(i, i + sessionSize))
  if (test.length > 0) out.push(test)
  return out
}

function rank(level: CognitiveLevel): number {
  return COGNITIVE_LEVELS.indexOf(level)
}

function isAscending(session: OrderableQuestion[]): boolean {
  for (let i = 1; i < session.length; i++) {
    if (rank(session[i].level) < rank(session[i - 1].level)) return false
  }
  return true
}

/** Bài 20 câu, mỗi mức 5 câu — trường hợp chia hết, dễ kiểm bằng mắt. */
function evenBank(): OrderableQuestion[] {
  const out: OrderableQuestion[] = []
  let n = 0
  for (const level of COGNITIVE_LEVELS) {
    for (let i = 0; i < 5; i++) out.push(q(`${level}-${i}`, level, n++))
  }
  return out
}

test('mỗi đoạn đi từ dễ tới khó', () => {
  const arranged = arrangeHomeworkSessions(evenBank(), { sessionSize: 10 })
  for (const session of toSessions(arranged, 10)) {
    assert.ok(isAscending(session), `đoạn không tăng dần: ${session.map(s => s.level).join(',')}`)
  }
})

test('mỗi đoạn có đủ bốn tầng, không dồn VDC vào một đoạn', () => {
  const sessions = toSessions(arrangeHomeworkSessions(evenBank(), { sessionSize: 10 }), 10)
  assert.equal(sessions.length, 2)
  for (const session of sessions) {
    const levels = new Set(session.map(item => item.level))
    assert.deepEqual([...levels].sort(), [...COGNITIVE_LEVELS].sort())
  }
})

test('sắp cả bài rồi cắt là cách SAI — test này khoá lại hành vi đúng', () => {
  // Nếu ai đó thay bằng `sort(theo level)` rồi cắt, đoạn đầu sẽ toàn NB.
  const sessions = toSessions(arrangeHomeworkSessions(evenBank(), { sessionSize: 10 }), 10)
  const firstSessionLevels = new Set(sessions[0].map(item => item.level))
  assert.ok(firstSessionLevels.size > 1, 'đoạn đầu chỉ có một mức — đã quay lại cách sắp-rồi-cắt')
})

test('giữ đúng sức chứa đoạn khi số câu không chia hết', () => {
  const bank: OrderableQuestion[] = []
  for (let i = 0; i < 25; i++) {
    bank.push(q(`c${i}`, COGNITIVE_LEVELS[i % 4], i))
  }
  const sessions = toSessions(arrangeHomeworkSessions(bank, { sessionSize: 10 }), 10)
  assert.deepEqual(sessions.map(s => s.length), [10, 10, 5])
})

test('không mất và không nhân bản câu nào', () => {
  const bank = evenBank()
  const arranged = arrangeHomeworkSessions(bank, { sessionSize: 7 })
  assert.equal(arranged.length, bank.length)
  assert.deepEqual(
    arranged.map(item => item.id).sort(),
    bank.map(item => item.id).sort()
  )
})

test('đoạn kiểm tra vẫn nằm cuối và không bị chia lẫn vào đoạn luyện', () => {
  const bank = [
    ...evenBank(),
    q('t-vd', 'VD', 0, 'test'),
    q('t-nb', 'NB', 1, 'test'),
    q('t-th', 'TH', 2, 'test'),
  ]
  const arranged = arrangeHomeworkSessions(bank, { sessionSize: 10 })
  const tail = arranged.slice(-3)
  assert.deepEqual(tail.map(item => item.id), ['t-nb', 't-th', 't-vd'], 'đoạn kiểm tra phải ở cuối và tăng dần')
  assert.ok(
    arranged.slice(0, -3).every(item => item.phase !== 'test'),
    'câu kiểm tra lọt vào phần luyện'
  )
})

test('tất định: gọi hai lần cho cùng một thứ tự', () => {
  const bank = evenBank()
  const a = arrangeHomeworkSessions(bank, { sessionSize: 6 }).map(item => item.id)
  const b = arrangeHomeworkSessions([...bank].reverse(), { sessionSize: 6 }).map(item => item.id)
  assert.deepEqual(a, b, 'thứ tự đầu vào không được ảnh hưởng kết quả')
})

test('bài toàn một mức vẫn chạy, chỉ là không có dốc để leo', () => {
  const bank = Array.from({ length: 12 }, (_, i) => q(`c${i}`, 'TH', i))
  const sessions = toSessions(arrangeHomeworkSessions(bank, { sessionSize: 5 }), 5)
  assert.deepEqual(sessions.map(s => s.length), [5, 5, 2])
  for (const session of sessions) {
    const orders = session.map(item => item.order_index)
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b),
      'trong cùng một mức phải giữ đúng thứ tự giáo viên đã đặt')
  }
})

test('cỡ đoạn không hợp lệ không làm mất câu', () => {
  const bank = evenBank()
  for (const size of [0, -3, Number.NaN]) {
    const arranged = arrangeHomeworkSessions(bank, { sessionSize: size })
    assert.equal(arranged.length, bank.length, `sessionSize=${size} làm mất câu`)
  }
})

test('bài rỗng trả về mảng rỗng', () => {
  assert.deepEqual(arrangeHomeworkSessions([], { sessionSize: 10 }), [])
})
