'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'
import MathContent, { MathProvider } from '@/components/MathContent'

interface Answer {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

interface Question {
  id: string
  content: string
  question_type: string
  solution: string | null
  order_in_part: number
  answers: Answer[]
}

interface ExamInfo {
  title: string
  subject: string
}

export default function ExamQuestionsPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = createClient()

  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (examId) {
      fetchData()
    }
  }, [examId])

  const fetchData = async () => {
    try {
      // Fetch exam info
      const { data: exam, error: examError } = await supabase
        .from('exams')
        .select('title, subject')
        .eq('id', examId)
        .single()

      if (examError) {
        setError('Không tìm thấy bài thi')
        setLoading(false)
        return
      }

      setExamInfo(exam)

      // Fetch exam questions with question details and answers
      const { data: examQuestions, error: eqError } = await supabase
        .from('exam_questions')
        .select(`
          order_in_part,
          questions (
            id,
            content,
            question_type,
            solution
          )
        `)
        .eq('exam_id', examId)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqError) {
        setError('Không thể tải câu hỏi')
        setLoading(false)
        return
      }

      // Get question IDs for fetching answers
      const questionIds = examQuestions
        .map((eq: any) => eq.questions?.id)
        .filter(Boolean)

      // Fetch all answers
      const { data: allAnswers, error: answersError } = await supabase
        .from('answers')
        .select('id, question_id, content, is_correct, order_index')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true })

      if (answersError) {
        console.error('Answers fetch error:', answersError)
      }

      // Build answers map
      const answersByQuestion: Record<string, Answer[]> = {}
      for (const answer of allAnswers || []) {
        if (!answersByQuestion[answer.question_id]) {
          answersByQuestion[answer.question_id] = []
        }
        answersByQuestion[answer.question_id].push(answer)
      }

      // Build questions array
      const formattedQuestions: Question[] = examQuestions.map((eq: any) => {
        const q = eq.questions
        return {
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          solution: q.solution,
          order_in_part: eq.order_in_part,
          answers: answersByQuestion[q.id] || []
        }
      })

      setQuestions(formattedQuestions)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'Trắc nghiệm'
      case 'true_false': return 'Đúng / Sai'
      case 'short_answer': return 'Trả lời ngắn'
      default: return type
    }
  }

  const getQuestionTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'bg-blue-100 text-blue-800'
      case 'true_false': return 'bg-purple-100 text-purple-800'
      case 'short_answer': return 'bg-green-100 text-green-800'
      default: return 'bg-slate-100 text-slate-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-slate-500">Đang tải câu hỏi...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Danh sách câu hỏi</h1>
              <p className="text-slate-600">{examInfo?.title} • {questions.length} câu hỏi</p>
            </div>
            <button
              onClick={() => router.push(`/admin/exams/${examId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          </div>

          {/* Questions List */}
          <div className="space-y-6">
            {questions.map((question, index) => (
              <div key={question.id} className="bg-white rounded-xl p-6 shadow-lg border border-slate-100">
                {/* Question Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-bold text-indigo-600">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQuestionTypeBadgeColor(question.question_type)}`}>
                        {getQuestionTypeLabel(question.question_type)}
                      </span>
                    </div>
                    <div className="prose max-w-none">
                      <MathContent content={question.content} />
                    </div>
                  </div>
                </div>

                {/* Answers */}
                {question.answers.length > 0 && (
                  <div className="ml-12 space-y-2">
                    <div className="text-sm font-medium text-slate-600 mb-2">Các đáp án:</div>
                    {question.answers.map((answer, ansIndex) => (
                      <div
                        key={answer.id}
                        className={`p-3 rounded-lg border ${
                          answer.is_correct
                            ? 'bg-green-50 border-green-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-slate-700">
                            {String.fromCharCode(65 + ansIndex)}.
                          </span>
                          <div className="flex-1">
                            <MathContent content={answer.content} />
                          </div>
                          {answer.is_correct && (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Solution */}
                {question.solution && (
                  <div className="ml-12 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm font-medium text-blue-800 mb-2">Lời giải:</div>
                    <div className="text-blue-700">
                      <MathContent content={question.solution} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MathProvider>
  )
}
