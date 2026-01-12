import { createClient } from '@/lib/supabase/client'
import { Question, Answer, ExamData, ExamMeta } from '@/types'

/**
 * Canonical function to fetch exam questions for students
 * Source of truth: exam_questions table
 * 
 * IMPORTANT: Uses LEFT JOIN (not INNER JOIN) to prevent dropping valid exam_questions
 * when question relation has issues
 */
export async function getExamQuestionsForStudent(examId: string): Promise<{
  examData: ExamData | null
  error: string | null
}> {
  const supabase = createClient()

  try {
    // Step 1: Fetch exam info
    const { data: examInfo, error: examError } = await supabase
      .from('exams')
      .select('id, title, duration, subject')
      .eq('id', examId)
      .single()

    if (examError) {
      return { examData: null, error: 'Không tìm thấy thông tin đề thi' }
    }

    const examMeta: ExamMeta = {
      title: examInfo.title,
      duration: examInfo.duration,
      subject: examInfo.subject
    }

    // Step 2: Fetch exam_questions with LEFT JOIN to questions
    // Using LEFT JOIN (no !inner) to ensure exam_questions rows are not dropped
    const { data: examQuestions, error: eqError } = await supabase
      .from('exam_questions')
      .select(`
        part_number,
        order_in_part,
        question_id,
        questions (
          id,
          content,
          question_type,
          solution,
          tikz_image_url
        )
      `)
      .eq('exam_id', examId)
      .order('part_number', { ascending: true })
      .order('order_in_part', { ascending: true })

    if (eqError) {
      return { examData: null, error: 'Không thể tải câu hỏi' }
    }

    if (!examQuestions || examQuestions.length === 0) {
      return { examData: null, error: 'Đề thi chưa có câu hỏi' }
    }

    // Step 3: Get all question IDs for fetching answers
    const questionIds = examQuestions
      .map((eq: any) => eq.question_id)
      .filter(Boolean)

    if (questionIds.length === 0) {
      return { examData: null, error: 'Dữ liệu câu hỏi không hợp lệ' }
    }

    // Step 4: Fetch answers for all questions
    const { data: allAnswers } = await supabase
      .from('answers')
      .select('id, question_id, content, is_correct, order_index')
      .in('question_id', questionIds)
      .order('question_id')
      .order('order_index', { ascending: true })

    // Step 5: Group answers by question_id
    const answersByQuestion: Record<string, Answer[]> = {}
    if (allAnswers) {
      for (const answer of allAnswers) {
        if (!answersByQuestion[answer.question_id]) {
          answersByQuestion[answer.question_id] = []
        }
        answersByQuestion[answer.question_id].push(answer)
      }
    }

    // Step 6: Build questions with answers and group by part
    const part1: Question[] = []
    const part2: Question[] = []
    const part3: Question[] = []

    for (const eq of examQuestions) {
      const q = eq.questions as any
      if (!q) continue

      const question: Question = {
        id: q.id,
        content: q.content,
        question_type: q.question_type,
        explanation: q.solution,
        part_number: eq.part_number,
        order_in_part: eq.order_in_part,
        tikz_image_url: q.tikz_image_url,
        answers: q.question_type === 'multiple_choice' 
          ? answersByQuestion[q.id] || []
          : undefined
      }

      if (eq.part_number === 1) {
        part1.push(question)
      } else if (eq.part_number === 2) {
        part2.push(question)
      } else if (eq.part_number === 3) {
        part3.push(question)
      }
    }

    return { 
      examData: { part1, part2, part3, examMeta }, 
      error: null 
    }

  } catch (err) {
    return { examData: null, error: 'Lỗi kết nối' }
  }
}
