'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import HomeworkRunner, {
  HomeworkQuestion, SavedHomeworkAnswer
} from '@/components/HomeworkRunner'

interface HomeworkQuestionRpcRow {
  id: string
  content: string
  question_type: HomeworkQuestion['question_type']
  order_index: number
  /** 'practice' | 'test'. Thiếu ở bài tạo trước `20260827`; đọc thiếu = 'practice'. */
  phase?: string | null
  tikz_image_url: string | null
  explanation: string | null
  solution: string | null
  answers: Array<{
    id: string
    content: string
    is_correct: boolean
    order_index: number
  }>
  saved_answer: {
    selected_answer: string | null
    selected_answers: Record<string, boolean> | null
    text_answer: string | null
    is_correct: boolean | null
    shown_feedback: boolean
  } | null
}

interface HomeworkAttemptRpcPayload {
  attempt: {
    id: string
    status: string
    current_session_index: number | null
  }
  homework: {
    title: string | null
    session_size: number | null
  }
  questions: HomeworkQuestionRpcRow[]
}

export default function HomeworkAttemptPage() {
  const params = useParams()
  const attemptId = params.attemptId as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    examTitle: string
    sessionSize: number
    sessionIndex: number
    questions: HomeworkQuestion[]
    initialAnswers: Record<string, SavedHomeworkAnswer>
  } | null>(null)

  async function load() {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_homework_attempt_questions',
        { p_attempt_id: attemptId }
      )

      if (rpcError || !rpcData) {
        setError(rpcError?.code === '42501'
          ? 'Bạn không có quyền mở bài làm này'
          : 'Không tìm thấy bài làm')
        setLoading(false)
        return
      }

      const payload = rpcData as unknown as HomeworkAttemptRpcPayload
      if (!payload.attempt || payload.attempt.id !== attemptId || !payload.homework || !Array.isArray(payload.questions)) {
        setError('Dữ liệu bài tập không hợp lệ')
        setLoading(false)
        return
      }
      if (payload.questions.length === 0) {
        setError('Bài tập chưa có câu hỏi')
        setLoading(false)
        return
      }

      const questions: HomeworkQuestion[] = payload.questions
        .map((question) => ({
          id: question.id,
          content: question.content,
          question_type: question.question_type,
          order_index: question.order_index,
          phase: (question.phase === 'test' ? 'test' : 'practice') as HomeworkQuestion['phase'],
          explanation: question.explanation,
          solution: question.solution,
          tikz_image_url: question.tikz_image_url,
          answers: Array.isArray(question.answers) ? question.answers : []
        }))
        /* Đoạn kiểm tra luôn xuống cuối, bất kể `order_index` giáo viên đặt.
           RPC đã sắp đúng thứ tự này; sắp lại ở đây để việc đó không phụ thuộc
           vào thứ tự phần tử trong JSON có được giữ nguyên hay không. */
        .sort((left, right) => {
          const leftIsTest = left.phase === 'test' ? 1 : 0
          const rightIsTest = right.phase === 'test' ? 1 : 0
          if (leftIsTest !== rightIsTest) return leftIsTest - rightIsTest
          return left.order_index - right.order_index
        })

      const initialAnswers: Record<string, SavedHomeworkAnswer> = {}
      for (const question of payload.questions) {
        const savedAnswer = question.saved_answer
        if (!savedAnswer) continue
        initialAnswers[question.id] = {
          selectedAnswer: savedAnswer.selected_answer,
          selectedAnswers: savedAnswer.selected_answers,
          textAnswer: savedAnswer.text_answer,
          isCorrect: savedAnswer.is_correct,
          shownFeedback: savedAnswer.shown_feedback
        }
      }

      setData({
        examTitle: payload.homework.title || 'Bài tập về nhà',
        sessionSize: payload.homework.session_size || 10,
        sessionIndex: payload.attempt.current_session_index || 0,
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (attemptId) void load()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

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
      examTitle={data.examTitle}
      questions={data.questions}
      sessionSize={data.sessionSize}
      initialAnswers={data.initialAnswers}
      initialSessionIndex={data.sessionIndex}
    />
  )
}
