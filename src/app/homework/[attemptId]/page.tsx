'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import HomeworkRunner, {
  HomeworkQuestion, SavedHomeworkAnswer
} from '@/components/HomeworkRunner'
import { arrangeHomeworkSessions } from '@/lib/homework/session-order'
import { resolveCognitiveLevel } from '@/lib/theories/cognitive'

interface HomeworkQuestionRpcRow {
  id: string
  content: string
  question_type: HomeworkQuestion['question_type']
  order_index: number
  /** 'practice' | 'test'. Thiếu ở bài tạo trước `20260827`; đọc thiếu = 'practice'. */
  phase?: string | null
  /** 'NB' | 'TH' | 'VD' | 'VDC'. Thiếu ở payload trước `20260904`. */
  cognitive_level?: string | null
  /** 1..4, đường lui khi `cognitive_level` trống. Thiếu ở payload trước `20260904`. */
  difficulty?: number | null
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

      const sessionSize = payload.homework.session_size || 10

      /* Xếp lại thứ tự để MỖI ĐOẠN đi từ dễ tới khó (`arrangeHomeworkSessions`).
         Hàm đó cũng đẩy đoạn kiểm tra xuống cuối, nên nó thay luôn phép sort
         trước đây ở chỗ này — đừng thêm lại một phép sort thứ hai sau nó, vì
         sort theo `order_index` sẽ xoá sạch đường dốc vừa dựng.

         RPC đã trả về đúng thứ tự practice-trước/test-sau; xếp lại ở client để
         thứ tự không phụ thuộc vào việc JSON có giữ nguyên thứ tự phần tử hay
         không. */
      const questions: HomeworkQuestion[] = arrangeHomeworkSessions(
        payload.questions.map((question) => ({
          id: question.id,
          content: question.content,
          question_type: question.question_type,
          order_index: question.order_index,
          phase: (question.phase === 'test' ? 'test' : 'practice') as 'practice' | 'test',
          /* Payload trước `20260904` không có hai trường này. `resolveCognitiveLevel`
             trả 'NB' khi thiếu cả hai, nên bài cũ vẫn mở được — chỉ là cả bài
             cùng một mức và thứ tự rơi về đúng `order_index` giáo viên đặt. */
          level: resolveCognitiveLevel(question.cognitive_level, question.difficulty),
          explanation: question.explanation,
          solution: question.solution,
          tikz_image_url: question.tikz_image_url,
          answers: Array.isArray(question.answers) ? question.answers : []
        })),
        { sessionSize }
      )

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
        sessionSize,
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
