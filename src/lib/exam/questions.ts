import { createClient } from '@/lib/supabase/client'
import type { Answer, ExamData, ExamMeta, Question } from '@/types'

interface ExamAttemptQuestionBundleExam {
  id: string
  title: string
  duration: number
  subject: string
  exam_mode: string
}

interface ExamAttemptQuestionBundleAttempt {
  id: string
  status: string
  grading_status: string
  total_questions: number | null
  correct_answers: number | null
  score: number | null
  pending_grading_count: number
  objective_points: number | null
  essay_points: number | null
  earned_points: number | null
  max_points: number | null
  start_time: string
  submit_time: string | null
  result_released: boolean
  answer_key_revealed: boolean
}

export interface ExamAttemptStudentAnswerRow {
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
}

export interface ExamAttemptQuestionRow {
  id: string
  content: string
  question_type: Question['question_type']
  part_number: number
  order_in_part: number
  tikz_image_url: string | null
  explanation: string | null
  solution: string | null
  answers: Answer[]
}

export interface ExamAttemptQuestionBundle {
  exam: ExamAttemptQuestionBundleExam
  attempt: ExamAttemptQuestionBundleAttempt
  questions: ExamAttemptQuestionRow[]
  student_answers: ExamAttemptStudentAnswerRow[]
}

export async function getExamAttemptQuestionBundle(attemptId: string): Promise<{
  bundle: ExamAttemptQuestionBundle | null
  error: string | null
}> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.rpc('get_exam_attempt_questions', {
      p_attempt_id: attemptId,
    })

    if (error) {
      return { bundle: null, error: error.message }
    }

    const bundle = data as unknown as ExamAttemptQuestionBundle | null
    if (
      !bundle?.exam ||
      !bundle.attempt ||
      bundle.attempt.id !== attemptId ||
      !Array.isArray(bundle.questions) ||
      !Array.isArray(bundle.student_answers)
    ) {
      return { bundle: null, error: 'Dữ liệu đề thi không hợp lệ' }
    }

    return { bundle, error: null }
  } catch {
    return { bundle: null, error: 'Lỗi kết nối' }
  }
}

/**
 * Tải đề theo attempt đã được RPC xác thực.
 * RPC là nơi quyết định có trả đáp án/lời giải hay không theo mode và trạng thái.
 */
export async function getExamQuestionsForStudent(attemptId: string): Promise<{
  examData: ExamData | null
  examMode: string | null
  error: string | null
}> {
  const { bundle, error } = await getExamAttemptQuestionBundle(attemptId)
  if (error || !bundle) {
    return { examData: null, examMode: null, error: error || 'Không thể tải câu hỏi' }
  }

  if (bundle.questions.length === 0) {
    return { examData: null, examMode: bundle.exam.exam_mode, error: 'Đề thi chưa có câu hỏi' }
  }

  const examMeta: ExamMeta = {
    title: bundle.exam.title,
    duration: bundle.exam.duration,
    subject: bundle.exam.subject,
  }
  const part1: Question[] = []
  const part2: Question[] = []
  const part3: Question[] = []

  const sortedQuestions = [...bundle.questions].sort((left, right) => {
    const partDifference = left.part_number - right.part_number
    return partDifference !== 0
      ? partDifference
      : left.order_in_part - right.order_in_part
  })

  for (const row of sortedQuestions) {
    const answers = [...(row.answers || [])].sort(
      (left, right) => left.order_index - right.order_index
    )
    const question: Question = {
      id: row.id,
      content: row.content,
      question_type: row.question_type,
      explanation: row.explanation ?? row.solution ?? undefined,
      part_number: row.part_number,
      order_in_part: row.order_in_part,
      tikz_image_url: row.tikz_image_url ?? undefined,
      answers: row.question_type === 'essay' ? undefined : answers,
    }

    if (row.part_number === 1) {
      part1.push(question)
    } else if (row.part_number === 2) {
      part2.push(question)
    } else if (row.part_number === 3) {
      part3.push(question)
    }
  }

  return {
    examData: { part1, part2, part3, examMeta },
    examMode: bundle.exam.exam_mode,
    error: null,
  }
}
