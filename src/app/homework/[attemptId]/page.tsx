'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import HomeworkRunner, {
  HomeworkQuestion, SavedHomeworkAnswer
} from '@/components/HomeworkRunner'
import { fetchAllAnswers, groupAnswersByQuestion } from '@/lib/answers/fetchAnswers'

export default function HomeworkAttemptPage() {
  const params = useParams()
  const attemptId = params.attemptId as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    studentId: string
    examTitle: string
    sessionSize: number
    sessionIndex: number
    questions: HomeworkQuestion[]
    initialAnswers: Record<string, SavedHomeworkAnswer>
  } | null>(null)

  useEffect(() => {
    if (attemptId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  const load = async () => {
    try {
      // 1. Attempt
      const { data: attempt, error: aErr } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, current_session_index')
        .eq('id', attemptId)
        .single()

      if (aErr || !attempt) {
        setError('Không tìm thấy bài làm')
        setLoading(false)
        return
      }

      // 2. Exam info
      const { data: exam } = await supabase
        .from('exams')
        .select('title, session_size')
        .eq('id', attempt.exam_id)
        .single()

      // 3. Exam questions (ordered)
      const { data: examQuestions, error: eqErr } = await supabase
        .from('exam_questions')
        .select(`
          part_number, order_in_part, question_id,
          questions ( id, content, question_type, explanation, solution, tikz_image_url )
        `)
        .eq('exam_id', attempt.exam_id)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqErr || !examQuestions || examQuestions.length === 0) {
        setError('Bài tập chưa có câu hỏi')
        setLoading(false)
        return
      }

      const questionIds = examQuestions.map((eq: any) => eq.question_id).filter(Boolean)

      // 4. Answers (for all question types, includes is_correct)
      const allAnswers = await fetchAllAnswers(supabase, questionIds)
      const answersByQ = groupAnswersByQuestion(allAnswers)

      const questions: HomeworkQuestion[] = []
      for (const eq of examQuestions as any[]) {
        const q = eq.questions
        if (!q) continue
        questions.push({
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          explanation: q.explanation,
          solution: q.solution,
          tikz_image_url: q.tikz_image_url,
          answers: (answersByQ[q.id] || []).map(a => ({
            id: a.id, content: a.content, is_correct: a.is_correct, order_index: a.order_index
          }))
        })
      }

      // 5. Saved student answers (resume)
      const { data: saved } = await supabase
        .from('student_answers')
        .select('question_id, selected_answer, selected_answers, text_answer, is_correct, shown_feedback')
        .eq('attempt_id', attemptId)

      const initialAnswers: Record<string, SavedHomeworkAnswer> = {}
      for (const sa of saved || []) {
        initialAnswers[sa.question_id] = {
          selectedAnswer: sa.selected_answer,
          selectedAnswers: sa.selected_answers as Record<string, boolean> | null,
          textAnswer: sa.text_answer,
          isCorrect: sa.is_correct,
          shownFeedback: !!sa.shown_feedback
        }
      }

      setData({
        studentId: attempt.student_id,
        examTitle: exam?.title || 'Bài tập về nhà',
        sessionSize: exam?.session_size || 10,
        sessionIndex: attempt.current_session_index || 0,
        questions,
        initialAnswers
      })
      setLoading(false)
    } catch (err) {
      console.error('load homework attempt', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-500 dark:text-slate-400">{error || 'Không có dữ liệu'}</p>
        </div>
      </div>
    )
  }

  return (
    <HomeworkRunner
      attemptId={attemptId}
      studentId={data.studentId}
      examTitle={data.examTitle}
      questions={data.questions}
      sessionSize={data.sessionSize}
      initialAnswers={data.initialAnswers}
      initialSessionIndex={data.sessionIndex}
    />
  )
}
