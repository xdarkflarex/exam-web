/**
 * Unified Attempt View Model
 * 
 * This module provides a single source of truth for how attempt data
 * is presented across all pages (student result, admin review, exam result).
 * 
 * Role-based visibility (e.g., hiding correct answers) is handled in UI components,
 * NOT in this module.
 */

// ============================================================================
// Types
// ============================================================================

import type { EssayRubricCriterion } from '@/lib/essay-grading/prompt'

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'

export interface AttemptQuestionView {
  studentAnswerId?: string
  questionId: string
  questionIndex: number
  content: string
  questionType: QuestionType
  studentAnswerText: string | null
  correctAnswerText: string | null
  isCorrect: boolean | null
  explanation: string | null
  solution: string | null
  tikzImageUrl?: string | null
  score?: number | null
  maxScore?: number | null
  gradingStatus?: string | null
  gradingFeedback?: string | null
  gradingConfidence?: number | null
  answerHash?: string | null
  rubricVersion?: number | null
  referenceAnswer?: string | null
  rubric?: EssayRubricCriterion[] | null
  // For true_false questions, we need the individual statement results
  trueFalseDetails?: TrueFalseDetail[] | null
}

export interface TrueFalseDetail {
  statementIndex: number
  studentAnswer: boolean | null
  correctAnswer: boolean
  statementContent: string
}

export interface AttemptSummary {
  attemptId: string
  examId: string
  examTitle: string
  examSubject?: string
  studentId: string
  studentName?: string
  studentEmail?: string
  status: 'in_progress' | 'submitted'
  score: number | null
  totalQuestions: number
  correctAnswers: number
  startTime: string
  submitTime: string | null
}

// ============================================================================
// Raw Data Types (from Supabase queries)
// ============================================================================

export interface RawAnswer {
  id: string
  question_id: string
  content: string
  is_correct: boolean
  order_index: number
}

export interface RawQuestion {
  id: string
  content: string
  question_type: QuestionType
  explanation: string | null
  solution: string | null
  tikz_image_url?: string | null
  answers?: RawAnswer[]
  question_grading_configs?: QuestionGradingConfig | QuestionGradingConfig[] | null
}

export interface QuestionGradingConfig {
  reference_answer: string
  rubric: EssayRubricCriterion[]
  rubric_version: number
  minimum_confidence?: number
}

export interface RawStudentAnswer {
  id?: string
  question_id: string
  selected_answer: string | null
  selected_answers: Record<string, boolean> | null
  text_answer: string | null
  is_correct: boolean | null
  score?: number | null
  max_score?: number | null
  grading_status?: string | null
  grading_feedback?: string | null
  grading_confidence?: number | null
  grading_rubric_version?: number | null
  answer_hash?: string | null
}

export interface RawAttemptData {
  questions: RawQuestion[]
  studentAnswers: RawStudentAnswer[]
  answersByQuestionId: Record<string, RawAnswer[]>
}

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Resolves an answer ID to its content text.
 * Returns null if the answer is not found.
 */
function resolveAnswerContent(
  answerId: string | null,
  answers: RawAnswer[]
): string | null {
  if (!answerId) return null
  const answer = answers.find(a => a.id === answerId)
  return answer?.content ?? null
}

/**
 * Gets the correct answer content for a question.
 * For multiple_choice/true_false: finds the answer with is_correct = true
 * For short_answer: finds the answer with is_correct = true (final answer)
 */
function getCorrectAnswerContent(
  questionType: QuestionType,
  answers: RawAnswer[]
): string | null {
  if (questionType === 'essay') return null
  // All question types get correct answer from answers table
  const correctAnswer = answers.find(a => a.is_correct)
  return correctAnswer?.content ?? null
}

/**
 * Builds the student answer text based on question type.
 */
function buildStudentAnswerText(
  questionType: QuestionType,
  studentAnswer: RawStudentAnswer | undefined,
  answers: RawAnswer[]
): string | null {
  if (!studentAnswer) return null

  switch (questionType) {
    case 'multiple_choice':
      return resolveAnswerContent(studentAnswer.selected_answer, answers)

    case 'true_false':
      // For true_false, we build a summary of selections
      if (!studentAnswer.selected_answers) return null
      const entries = Object.entries(studentAnswer.selected_answers)
      if (entries.length === 0) return null
      return entries
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([idx, val]) => `${String.fromCharCode(97 + parseInt(idx))}) ${val ? 'Đúng' : 'Sai'}`)
        .join(', ')

    case 'short_answer':
    case 'essay':
      return studentAnswer.text_answer ?? null

    default:
      return null
  }
}

/**
 * Builds true/false details for rendering individual statement results.
 */
function buildTrueFalseDetails(
  studentAnswer: RawStudentAnswer | undefined,
  answers: RawAnswer[]
): TrueFalseDetail[] | null {
  if (!studentAnswer?.selected_answers) return null

  const sortedAnswers = [...answers].sort((a, b) => a.order_index - b.order_index)
  
  return sortedAnswers.map((answer, index) => ({
    statementIndex: index,
    studentAnswer: studentAnswer.selected_answers?.[String(index)] ?? null,
    correctAnswer: answer.is_correct,
    statementContent: answer.content
  }))
}

/**
 * Main mapping function: transforms raw attempt data into unified view model.
 * 
 * This function is pure and stateless - it only transforms data.
 * Role-based filtering should be done in the UI layer.
 */
export function buildAttemptView(rawData: RawAttemptData): AttemptQuestionView[] {
  const { questions, studentAnswers, answersByQuestionId } = rawData

  // Build a map for quick student answer lookup
  const studentAnswerMap: Record<string, RawStudentAnswer> = {}
  for (const sa of studentAnswers) {
    studentAnswerMap[sa.question_id] = sa
  }

  return questions.map((question, index) => {
    const answers = answersByQuestionId[question.id] || question.answers || []
    const studentAnswer = studentAnswerMap[question.id]

    const questionType = question.question_type as QuestionType
    const gradingConfig = Array.isArray(question.question_grading_configs)
      ? question.question_grading_configs[0]
      : question.question_grading_configs

    return {
      studentAnswerId: studentAnswer?.id,
      questionId: question.id,
      questionIndex: index,
      content: question.content,
      questionType,
      studentAnswerText: buildStudentAnswerText(questionType, studentAnswer, answers),
      correctAnswerText: getCorrectAnswerContent(questionType, answers),
      isCorrect: studentAnswer?.is_correct ?? null,
      explanation: question.explanation,
      solution: question.solution,
      tikzImageUrl: question.tikz_image_url,
      score: studentAnswer?.score ?? null,
      maxScore: studentAnswer?.max_score ?? null,
      gradingStatus: studentAnswer?.grading_status ?? null,
      gradingFeedback: studentAnswer?.grading_feedback ?? null,
      gradingConfidence: studentAnswer?.grading_confidence ?? null,
      answerHash: studentAnswer?.answer_hash ?? null,
      rubricVersion: studentAnswer?.grading_rubric_version ?? gradingConfig?.rubric_version ?? null,
      referenceAnswer: gradingConfig?.reference_answer ?? null,
      rubric: gradingConfig?.rubric ?? null,
      trueFalseDetails: questionType === 'true_false' 
        ? buildTrueFalseDetails(studentAnswer, answers) 
        : null
    }
  })
}

// ============================================================================
// Helper to build raw data from Supabase response
// ============================================================================

export interface SupabaseAttemptQueryResult {
  examQuestions: Array<{
    part_number?: number
    order_in_part?: number
    questions: RawQuestion
  }>
  studentAnswers: RawStudentAnswer[]
  allAnswers: RawAnswer[]
}

/**
 * Transforms Supabase query results into the format expected by buildAttemptView.
 */
export function prepareRawAttemptData(queryResult: SupabaseAttemptQueryResult): RawAttemptData {
  const { examQuestions, studentAnswers, allAnswers } = queryResult

  // Sort exam questions by part_number and order_in_part
  const sortedExamQuestions = [...examQuestions].sort((a, b) => {
    const partDiff = (a.part_number || 0) - (b.part_number || 0)
    if (partDiff !== 0) return partDiff
    return (a.order_in_part || 0) - (b.order_in_part || 0)
  })

  // Extract questions in order
  const questions: RawQuestion[] = sortedExamQuestions
    .map(eq => eq.questions)
    .filter(Boolean)

  // Build answers map
  const answersByQuestionId: Record<string, RawAnswer[]> = {}
  for (const answer of allAnswers) {
    if (!answersByQuestionId[answer.question_id]) {
      answersByQuestionId[answer.question_id] = []
    }
    answersByQuestionId[answer.question_id].push(answer)
  }

  // Sort answers by order_index within each question
  for (const questionId of Object.keys(answersByQuestionId)) {
    answersByQuestionId[questionId].sort((a, b) => a.order_index - b.order_index)
  }

  return {
    questions,
    studentAnswers,
    answersByQuestionId
  }
}

// ============================================================================
// Alternative: Build from nested query (used in admin page)
// ============================================================================

export interface NestedStudentAnswerRow {
  id: string
  question_id: string
  selected_answer: string | null
  selected_answers: Record<string, boolean> | null
  text_answer: string | null
  is_correct: boolean | null
  score: number | null
  max_score: number | null
  grading_status: string | null
  grading_feedback: string | null
  grading_confidence: number | null
  grading_rubric_version: number | null
  answer_hash: string | null
  questions: {
    id: string
    content: string
    question_type: string
    explanation: string | null
    solution: string | null
    tikz_image_url?: string | null
    answers: RawAnswer[]
    question_grading_configs?: QuestionGradingConfig | QuestionGradingConfig[] | null
  }
}

/**
 * Transforms nested Supabase query (student_answers with joined questions and answers)
 * into the unified view model.
 */
export function buildAttemptViewFromNestedQuery(
  rows: NestedStudentAnswerRow[]
): AttemptQuestionView[] {
  return rows.map((row, index) => {
    const question = row.questions
    const answers = (question.answers || []).sort((a, b) => a.order_index - b.order_index)
    const questionType = question.question_type as QuestionType
    const gradingConfig = Array.isArray(question.question_grading_configs)
      ? question.question_grading_configs[0]
      : question.question_grading_configs

    const studentAnswer: RawStudentAnswer = {
      id: row.id,
      question_id: row.question_id,
      selected_answer: row.selected_answer,
      selected_answers: row.selected_answers,
      text_answer: row.text_answer,
      is_correct: row.is_correct,
      score: row.score,
      max_score: row.max_score,
      grading_status: row.grading_status,
      grading_feedback: row.grading_feedback,
      grading_confidence: row.grading_confidence,
      grading_rubric_version: row.grading_rubric_version,
      answer_hash: row.answer_hash,
    }

    return {
      studentAnswerId: row.id,
      questionId: question.id,
      questionIndex: index,
      content: question.content,
      questionType,
      studentAnswerText: buildStudentAnswerText(questionType, studentAnswer, answers),
      correctAnswerText: getCorrectAnswerContent(questionType, answers),
      isCorrect: row.is_correct ?? null,
      explanation: question.explanation,
      solution: question.solution,
      tikzImageUrl: question.tikz_image_url,
      score: row.score,
      maxScore: row.max_score,
      gradingStatus: row.grading_status,
      gradingFeedback: row.grading_feedback,
      gradingConfidence: row.grading_confidence,
      answerHash: row.answer_hash,
      rubricVersion: row.grading_rubric_version ?? gradingConfig?.rubric_version ?? null,
      referenceAnswer: gradingConfig?.reference_answer ?? null,
      rubric: gradingConfig?.rubric ?? null,
      trueFalseDetails: questionType === 'true_false'
        ? buildTrueFalseDetails(studentAnswer, answers)
        : null
    }
  })
}
