'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ExamData } from '@/types'
import PracticeRunner from '@/components/PracticeRunner'
import { getExamQuestionsForStudent } from '@/lib/exam/questions'
import { useLoading } from '@/contexts/LoadingContext'

interface StudentAnswer {
  questionId: string
  questionType: 'multiple_choice' | 'true_false' | 'short_answer'
  selectedAnswer?: string
  selectedAnswers?: Record<string, boolean>
  textAnswer?: string
}

interface ExamAttempt {
  id: string
  exam_id: string
  student_id: string
  start_time: string
  status: string
}

export default function PracticeAttemptPage() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.attemptId as string
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [examData, setExamData] = useState<ExamData | null>(null)
  const [initialAnswers, setInitialAnswers] = useState<Record<string, StudentAnswer>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (attemptId) {
      fetchExamData()
    }
  }, [attemptId])

  const fetchExamData = async () => {
    showLoading('Đang tải đề ôn tập...')
    try {
      // Step 1: Fetch exam attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, start_time, status')
        .eq('id', attemptId)
        .single()

      if (attemptError || !attemptData) {
        setError('Không tìm thấy bài làm')
        setLoading(false)
        hideLoading()
        return
      }

      // If already submitted, redirect to result
      if (attemptData.status === 'submitted') {
        hideLoading()
        router.push(`/result/${attemptId}`)
        return
      }

      setAttempt(attemptData)

      const examId = attemptData.exam_id

      // Step 2: Fetch exam questions
      const { examData, error: questionsError } = await getExamQuestionsForStudent(examId)

      if (questionsError || !examData) {
        setError(questionsError || 'Không thể tải câu hỏi')
        setLoading(false)
        hideLoading()
        return
      }

      const totalQuestions = examData.part1.length + examData.part2.length + examData.part3.length
      if (totalQuestions === 0) {
        setError('Đề thi chưa có câu hỏi')
        setLoading(false)
        hideLoading()
        return
      }

      // Step 3: Load saved answers (for resume functionality)
      const { data: savedAnswers } = await supabase
        .from('student_answers')
        .select('question_id, question_type, selected_answer, selected_answers, text_answer')
        .eq('attempt_id', attemptId)

      const answersMap: Record<string, StudentAnswer> = {}
      if (savedAnswers) {
        for (const sa of savedAnswers) {
          const answer: StudentAnswer = {
            questionId: sa.question_id,
            questionType: sa.question_type as any
          }
          if (sa.question_type === 'multiple_choice' && sa.selected_answer) {
            answer.selectedAnswer = sa.selected_answer
          } else if (sa.question_type === 'true_false' && sa.selected_answers) {
            answer.selectedAnswers = sa.selected_answers as Record<string, boolean>
          } else if (sa.question_type === 'short_answer' && sa.text_answer) {
            answer.textAnswer = sa.text_answer
          }
          answersMap[sa.question_id] = answer
        }
      }

      setInitialAnswers(answersMap)
      setExamData(examData)
      setLoading(false)
      hideLoading()
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
      hideLoading()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
          <button
            onClick={() => router.push('/student/practice')}
            className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  if (!examData || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="text-slate-500 dark:text-slate-400">Không có dữ liệu</div>
      </div>
    )
  }

  return (
    <PracticeRunner
      attemptId={attemptId}
      examData={examData}
      studentId={attempt.student_id}
      initialAnswers={initialAnswers}
    />
  )
}
