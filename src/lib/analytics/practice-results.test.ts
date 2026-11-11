/**
 * Test gom kết quả ôn tập theo đề × học sinh.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  examOverview,
  formatRate,
  sortStudentRows,
  summarizeExamAttempts,
  type PracticeAttemptRow,
} from './practice-results.ts'

const EXAM = 'exam-on-tap'
let seq = 0
function attempt(partial: Partial<PracticeAttemptRow>): PracticeAttemptRow {
  seq += 1
  return {
    id: `a${seq}`,
    exam_id: EXAM,
    student_id: 'an',
    status: 'submitted',
    score: null,
    total_questions: 10,
    correct_answers: 0,
    start_time: `2026-11-0${Math.min(9, seq)}T08:00:00+07:00`,
    submit_time: `2026-11-0${Math.min(9, seq)}T08:30:00+07:00`,
    ...partial,
  }
}

test('nhiều lượt: lần gần nhất, lần tốt nhất, và chuỗi các lần theo thứ tự thời gian', () => {
  const rows = [
    attempt({ correct_answers: 5, score: 5, submit_time: '2026-11-01T08:00:00Z' }),
    attempt({ correct_answers: 9, score: 9, submit_time: '2026-11-02T08:00:00Z' }),
    attempt({ correct_answers: 7, score: 7, submit_time: '2026-11-03T08:00:00Z' }),
  ]
  const [an] = summarizeExamAttempts(EXAM, rows)
  assert.deepEqual(an.history.map((item) => item.correct), [5, 9, 7])
  assert.equal(an.latest?.correct, 7, 'gần nhất là lần nộp sau cùng, không phải lần tốt nhất')
  assert.equal(an.best?.correct, 9)
})

test('lần tốt nhất so theo TỈ LỆ, không theo số câu tuyệt đối — đề bị sửa giữa chừng', () => {
  const rows = [
    attempt({ correct_answers: 8, total_questions: 12, submit_time: '2026-11-01T08:00:00Z' }),
    attempt({ correct_answers: 7, total_questions: 8, submit_time: '2026-11-02T08:00:00Z' }),
  ]
  const [an] = summarizeExamAttempts(EXAM, rows)
  assert.equal(an.best?.correct, 7, '7/8 tốt hơn 8/12')
})

test('lượt đang làm dở hiện số câu đã trả lời, và không bị tính vào lượt đã nộp', () => {
  const open = attempt({ status: 'in_progress', submit_time: null, correct_answers: null })
  const done = attempt({ correct_answers: 6 })
  const [an] = summarizeExamAttempts(EXAM, [open, done], new Map([[open.id, 4]]))
  assert.equal(an.history.length, 1)
  assert.deepEqual(an.inProgress, { attemptId: open.id, answered: 4, total: 10, startedAt: open.start_time })
})

test('em chỉ mới làm dở: chưa có lần gần nhất, chưa có lần tốt nhất', () => {
  const open = attempt({ student_id: 'binh', status: 'in_progress', submit_time: null })
  const [binh] = summarizeExamAttempts(EXAM, [open])
  assert.equal(binh.latest, null)
  assert.equal(binh.best, null)
  assert.equal(binh.inProgress?.answered, 0, 'thiếu số đếm thì là 0, không phải undefined')
})

test('lượt của đề khác không lẫn vào', () => {
  const rows = [attempt({ exam_id: 'de-khac', correct_answers: 10 }), attempt({ correct_answers: 3 })]
  const [an] = summarizeExamAttempts(EXAM, rows)
  assert.deepEqual(an.history.map((item) => item.correct), [3])
})

test('tổng quan một đề: số em, số lượt, tỉ lệ đúng trung bình của lần gần nhất', () => {
  const rows = [
    attempt({ student_id: 'an', correct_answers: 4, submit_time: '2026-11-01T08:00:00Z' }),
    attempt({ student_id: 'an', correct_answers: 8, submit_time: '2026-11-02T08:00:00Z' }),
    attempt({ student_id: 'binh', correct_answers: 6, submit_time: '2026-11-03T08:00:00Z' }),
    attempt({ student_id: 'chi', status: 'in_progress', submit_time: null }),
  ]
  const overview = examOverview(EXAM, rows)
  assert.equal(overview.studentsSubmitted, 2)
  assert.equal(overview.submissions, 3)
  assert.equal(overview.inProgress, 1)
  // Lần gần nhất: An 8/10, Bình 6/10 → 70%.
  assert.equal(overview.averageLatestRate, 0.7)
  assert.equal(overview.lastSubmittedAt, '2026-11-03T08:00:00Z')
})

test('đề chưa ai làm: không chia cho 0', () => {
  const overview = examOverview(EXAM, [])
  assert.equal(overview.averageLatestRate, null)
  assert.equal(overview.submissions, 0)
  assert.equal(formatRate(0, 0), '–')
})

test('thứ tự dòng: đã nộp → đang làm dở → chưa làm, bất kể kiểu sắp xếp', () => {
  const [an] = summarizeExamAttempts(EXAM, [attempt({ student_id: 'an', correct_answers: 2 })])
  const [binh] = summarizeExamAttempts(EXAM, [attempt({ student_id: 'binh', status: 'in_progress', submit_time: null })])
  const rows = [
    { id: 'chi', name: 'Chi', summary: null },
    { id: 'binh', name: 'Bình', summary: binh },
    { id: 'an', name: 'An', summary: an },
  ]
  for (const sort of ['recent', 'name', 'best'] as const) {
    assert.deepEqual(sortStudentRows(rows, sort).map((row) => row.id), ['an', 'binh', 'chi'], sort)
  }
})

test('sắp theo kết quả tốt nhất, hoà thì theo tên tiếng Việt', () => {
  const make = (student: string, correct: number) =>
    summarizeExamAttempts(EXAM, [attempt({ student_id: student, correct_answers: correct })])[0]
  const rows = [
    { id: 'c', name: 'Đức', summary: make('c', 6) },
    { id: 'a', name: 'An', summary: make('a', 9) },
    { id: 'b', name: 'Bảo', summary: make('b', 6) },
  ]
  assert.deepEqual(sortStudentRows(rows, 'best').map((row) => row.name), ['An', 'Bảo', 'Đức'])
  assert.deepEqual(sortStudentRows(rows, 'name').map((row) => row.name), ['An', 'Bảo', 'Đức'])
})

test('tỉ lệ làm tròn', () => {
  assert.equal(formatRate(7, 10), '70%')
  assert.equal(formatRate(2, 3), '67%')
})
