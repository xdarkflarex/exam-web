import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildAttemptView,
  buildAttemptViewFromNestedQuery,
  prepareRawAttemptData,
  type NestedStudentAnswerRow,
  type QuestionType,
  type RawAnswer,
  type RawQuestion,
  type RawStudentAnswer,
} from './attemptView.ts'

/** Câu Đúng/Sai như dữ liệu thật: bốn mệnh đề nằm ở `answers`, `order_index` đếm từ 0. */
const TF_ANSWERS: RawAnswer[] = [
  { id: 's0', question_id: 'q-tf', content: 'Mệnh đề a', is_correct: true, order_index: 0 },
  { id: 's1', question_id: 'q-tf', content: 'Mệnh đề b', is_correct: true, order_index: 1 },
  { id: 's2', question_id: 'q-tf', content: 'Mệnh đề c', is_correct: false, order_index: 2 },
  { id: 's3', question_id: 'q-tf', content: 'Mệnh đề d', is_correct: true, order_index: 3 },
]
const MC_ANSWERS: RawAnswer[] = [
  { id: 'm0', question_id: 'q-mc', content: 'Phương án A', is_correct: false, order_index: 0 },
  { id: 'm1', question_id: 'q-mc', content: 'Phương án B', is_correct: true, order_index: 1 },
]
const SA_ANSWERS: RawAnswer[] = [
  { id: 'k0', question_id: 'q-sa', content: '4', is_correct: true, order_index: 0 },
]

function question(id: string, type: QuestionType, answers: RawAnswer[]): RawQuestion {
  return { id, content: `Đề ${id}`, question_type: type, explanation: null, solution: null, answers }
}

function answer(questionId: string, fields: Partial<RawStudentAnswer>): RawStudentAnswer {
  return {
    id: `sa-${questionId}`, question_id: questionId,
    selected_answer: null, selected_answers: null, text_answer: null,
    is_correct: null, score: null, max_score: null,
    ...fields,
  } as RawStudentAnswer
}

function view(studentAnswers: RawStudentAnswer[]) {
  return buildAttemptView(prepareRawAttemptData({
    examQuestions: [
      { part_number: 1, order_in_part: 1, questions: question('q-mc', 'multiple_choice', MC_ANSWERS) },
      { part_number: 2, order_in_part: 1, questions: question('q-tf', 'true_false', TF_ANSWERS) },
      { part_number: 3, order_in_part: 1, questions: question('q-sa', 'short_answer', SA_ANSWERS) },
    ],
    studentAnswers,
    allAnswers: [...MC_ANSWERS, ...TF_ANSWERS, ...SA_ANSWERS],
  }))
}

test('Đúng/Sai không có "đáp án đúng" một dòng — không in nội dung mệnh đề a', () => {
  const tf = view([])[1]
  assert.equal(tf.questionType, 'true_false')
  assert.equal(tf.correctAnswerText, null)
})

test('Đúng/Sai đã làm: từng ý có mệnh đề, lựa chọn của em và khoá', () => {
  const tf = view([answer('q-tf', { selected_answers: { 0: true, 1: false, 2: false, 3: true } })])[1]
  assert.deepEqual(tf.trueFalseDetails, [
    { statementIndex: 0, studentAnswer: true, correctAnswer: true, statementContent: 'Mệnh đề a' },
    { statementIndex: 1, studentAnswer: false, correctAnswer: true, statementContent: 'Mệnh đề b' },
    { statementIndex: 2, studentAnswer: false, correctAnswer: false, statementContent: 'Mệnh đề c' },
    { statementIndex: 3, studentAnswer: true, correctAnswer: true, statementContent: 'Mệnh đề d' },
  ])
})

test('Đúng/Sai BỎ TRỐNG: vẫn đủ bốn mệnh đề và khoá, mỗi ý chưa trả lời', () => {
  const tf = view([])[1]
  assert.equal(tf.studentAnswerText, null)
  assert.deepEqual(tf.trueFalseDetails?.map((d) => [d.studentAnswer, d.correctAnswer, d.statementContent]), [
    [null, true, 'Mệnh đề a'], [null, true, 'Mệnh đề b'], [null, false, 'Mệnh đề c'], [null, true, 'Mệnh đề d'],
  ])
})

test('Đúng/Sai làm dở vài ý: ý chưa chọn là null, không bị coi là "Sai"', () => {
  const tf = view([answer('q-tf', { selected_answers: { 0: true } })])[1]
  assert.deepEqual(tf.trueFalseDetails?.map((d) => d.studentAnswer), [true, null, null, null])
})

test('Đúng/Sai không có mệnh đề nào: không dựng chi tiết', () => {
  const rows = buildAttemptView(prepareRawAttemptData({
    examQuestions: [{ part_number: 2, order_in_part: 1, questions: question('q-tf', 'true_false', []) }],
    studentAnswers: [],
    allAnswers: [],
  }))
  assert.equal(rows[0].trueFalseDetails, null)
})

test('trắc nghiệm và trả lời ngắn giữ nguyên "đáp án đúng"', () => {
  const [mc, , sa] = view([])
  assert.equal(mc.correctAnswerText, 'Phương án B')
  assert.equal(sa.correctAnswerText, '4')
  assert.equal(mc.trueFalseDetails, null)
  assert.equal(sa.trueFalseDetails, null)
})

test('đường admin (student_answers nối questions): Đúng/Sai lưu rỗng vẫn có chi tiết', () => {
  const row = {
    id: 'sa-1', question_id: 'q-tf',
    selected_answer: null, selected_answers: null, text_answer: null,
    is_correct: false, score: 0, max_score: 1,
    grading_status: null, grading_feedback: null, grading_confidence: null,
    grading_rubric_version: null, answer_hash: null,
    questions: { id: 'q-tf', content: 'Đề', question_type: 'true_false', explanation: null, solution: null, answers: [...TF_ANSWERS] },
  } satisfies NestedStudentAnswerRow
  const [tf] = buildAttemptViewFromNestedQuery([row])
  assert.equal(tf.correctAnswerText, null)
  assert.equal(tf.trueFalseDetails?.length, 4)
  assert.ok(tf.trueFalseDetails?.every((d) => d.studentAnswer === null))
})
