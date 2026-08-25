import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cellState } from './resultCellState.ts'

type Input = Parameters<typeof cellState>[0]

function q(overrides: Partial<Input> = {}): Input {
  return {
    questionType: 'multiple_choice',
    studentAnswerText: 'A',
    isCorrect: true,
    gradingStatus: null,
    ...overrides,
  }
}

test('đã công bố: đúng/sai theo isCorrect', () => {
  assert.equal(cellState(q({ isCorrect: true }), true), 'correct')
  assert.equal(cellState(q({ isCorrect: false }), true), 'wrong')
})

test('không trả lời thì luôn là "chưa làm", kể cả khi isCorrect còn sót giá trị', () => {
  assert.equal(cellState(q({ studentAnswerText: null, isCorrect: true }), true), 'unanswered')
  assert.equal(cellState(q({ studentAnswerText: '', isCorrect: false }), true), 'unanswered')
})

/*
  Đây là phép thử quan trọng nhất của file. Bản đồ câu tô màu theo giá trị trả
  về, nên `correct`/`wrong` lọt ra lúc chưa công bố là lộ đáp án qua màu ô —
  học sinh chỉ cần nhìn bản đồ là biết mình sai câu nào dù giáo viên chưa mở.
*/
test('CHƯA công bố: không bao giờ lộ đúng/sai', () => {
  for (const isCorrect of [true, false, null]) {
    for (const type of ['multiple_choice', 'true_false', 'short_answer'] as const) {
      const state = cellState(q({ questionType: type, isCorrect }), false)
      assert.ok(
        state !== 'correct' && state !== 'wrong',
        `${type} với isCorrect=${isCorrect} bị lộ thành "${state}"`
      )
    }
  }
})

test('chưa công bố: đã trả lời -> hidden, chưa trả lời -> unanswered', () => {
  assert.equal(cellState(q(), false), 'hidden')
  assert.equal(cellState(q({ studentAnswerText: null }), false), 'unanswered')
})

test('tự luận: chỉ kết luận đúng/sai sau khi giáo viên duyệt', () => {
  const essay = { questionType: 'essay' as const, studentAnswerText: 'bài làm' }

  // AI đã chấm nhưng chưa ai kiểm tra lại -> điểm còn đổi được.
  assert.equal(cellState(q({ ...essay, gradingStatus: 'ai_graded' }), true), 'pending')
  assert.equal(cellState(q({ ...essay, gradingStatus: 'pending_review' }), true), 'pending')

  // Đã duyệt VÀ đã công bố.
  assert.equal(
    cellState(q({ ...essay, gradingStatus: 'approved', isCorrect: true }), true),
    'correct'
  )
  assert.equal(
    cellState(q({ ...essay, gradingStatus: 'approved', isCorrect: false }), true),
    'wrong'
  )

  // Đã duyệt nhưng CHƯA công bố -> vẫn không được lộ.
  assert.equal(
    cellState(q({ ...essay, gradingStatus: 'approved', isCorrect: false }), false),
    'pending'
  )
})

test('tự luận bỏ trống -> chưa làm, không phải chờ chấm', () => {
  assert.equal(
    cellState(q({ questionType: 'essay', studentAnswerText: null, gradingStatus: 'pending_review' }), true),
    'unanswered'
  )
})
