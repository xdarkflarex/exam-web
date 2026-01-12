'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, User, Clock, CheckCircle, XCircle, BookOpen } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'
import MathContent, { MathProvider } from '@/components/MathContent'

interface AttemptDetail {
  id: string
  exam_id: string
  student_id: string
  status: 'in_progress' | 'submitted'
  score: number | null
  total_questions: number | null
  correct_answers: number | null
  start_time: string
  submit_time: string | null
  student_name: string
  student_email: string
  exam_title: string
  exam_subject: string
}

interface Answer {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

interface QuestionResult {
  id: string
  content: string
  question_type: 'multiple_choice' | 'short_answer'
  answers: Answer[]
  correct_answer: string
  explanation: string | null
  selected_answer: string | null
  selected_answers: string[] | null
  text_answer: string | null
  is_correct: boolean
}

export default function AdminAttemptDetailPage() {
  const router = useRouter()
  const params = useParams()
  const attemptId = params.attemptId as string
  const supabase = createClient()
  
  const [attemptDetail, setAttemptDetail] = useState<AttemptDetail | null>(null)
  const [questions, setQuestions] = useState<QuestionResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (attemptId) {
      Promise.all([fetchAttemptDetail(), fetchQuestions()])
    }
  }, [attemptId])

  const fetchAttemptDetail = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          exam_id,
          student_id,
          status,
          score,
          total_questions,
          correct_answers,
          start_time,
          submit_time,
          profiles!student_id (
            full_name,
            email
          ),
          exams!exam_id (
            title,
            subject
          )
        `)
        .eq('id', attemptId)
        .single()

      if (error) {
        console.error('Fetch attempt detail error:', error)
        setError('Không thể tải chi tiết bài làm')
        return
      }

      const formattedDetail: AttemptDetail = {
        id: data.id,
        exam_id: data.exam_id,
        student_id: data.student_id,
        status: data.status,
        score: data.score,
        total_questions: data.total_questions,
        correct_answers: data.correct_answers,
        start_time: data.start_time,
        submit_time: data.submit_time,
        student_name: (data.profiles as any)?.full_name || 'Không rõ',
        student_email: (data.profiles as any)?.email || '',
        exam_title: (data.exams as any)?.title || 'Không rõ',
        exam_subject: (data.exams as any)?.subject || ''
      }

      setAttemptDetail(formattedDetail)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
    }
  }

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('student_answers')
        .select(`
          question_id,
          selected_answer,
          selected_answers,
          text_answer,
          is_correct,
          questions!question_id (
            id,
            content,
            question_type,
            explanation,
            solution,
            answers (
              id,
              content,
              is_correct,
              order_index
            )
          )
        `)
        .eq('attempt_id', attemptId)
        .order('question_id')

      if (error) {
        console.error('Fetch questions error:', error)
        setError('Không thể tải danh sách câu hỏi')
        setLoading(false)
        return
      }

      const formattedQuestions: QuestionResult[] = (data || []).map((item: any) => {
        const answers = (item.questions.answers || []).sort((a: Answer, b: Answer) => a.order_index - b.order_index)
        const correctAnswer = answers.find((a: Answer) => a.is_correct)?.id || ''
        return {
          id: item.questions.id,
          content: item.questions.content,
          question_type: item.questions.question_type,
          answers: answers,
          correct_answer: correctAnswer,
          explanation: item.questions.explanation,
          selected_answer: item.selected_answer,
          selected_answers: item.selected_answers,
          text_answer: item.text_answer,
          is_correct: item.is_correct
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400'
    if (score >= 8) return 'text-green-600'
    if (score >= 6.5) return 'text-blue-600'
    if (score >= 5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const renderStudentAnswer = (question: QuestionResult) => {
    if (question.question_type === 'multiple_choice') {
      const answers = question.answers || []
      const studentAnswerId = question.selected_answer
      const correctAnswerId = question.correct_answer

      return (
        <div className="space-y-2">
          {answers.map((answer, index) => {
            const isStudentChoice = answer.id === studentAnswerId
            const isCorrectChoice = answer.id === correctAnswerId
            
            let bgColor = 'bg-slate-50'
            let textColor = 'text-slate-700'
            let borderColor = 'border-slate-200'
            
            if (isCorrectChoice) {
              bgColor = 'bg-green-50'
              textColor = 'text-green-800'
              borderColor = 'border-green-200'
            } else if (isStudentChoice && !isCorrectChoice) {
              bgColor = 'bg-red-50'
              textColor = 'text-red-800'
              borderColor = 'border-red-200'
            }

            return (
              <div
                key={answer.id}
                className={`p-3 rounded-lg border ${bgColor} ${borderColor} ${textColor}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String.fromCharCode(65 + index)}.</span>
                  <MathContent content={answer.content} />
                  {isStudentChoice && (
                    <span className="ml-auto text-xs font-medium">
                      {isCorrectChoice ? '✓ Đáp án của học sinh' : '✗ Đáp án của học sinh'}
                    </span>
                  )}
                  {isCorrectChoice && !isStudentChoice && (
                    <span className="ml-auto text-xs font-medium text-green-600">
                      ✓ Đáp án đúng
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium text-slate-600">Câu trả lời của học sinh:</span>
          <div className={`mt-1 p-3 rounded-lg border ${
            question.is_correct 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <MathContent content={question.text_answer || 'Không có câu trả lời'} />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-600">Đáp án đúng:</span>
          <div className="mt-1 p-3 rounded-lg border bg-green-50 border-green-200 text-green-800">
            <MathContent content={question.correct_answer} />
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Chi tiết bài làm" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải chi tiết bài làm...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !attemptDetail) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Chi tiết bài làm" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error || 'Không tìm thấy bài làm'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Chi tiết bài làm" />
        
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Chi tiết bài làm</h1>
              <p className="text-slate-600">{attemptDetail.exam_title} • {attemptDetail.exam_subject}</p>
            </div>
            <button
              onClick={() => router.push(`/admin/exams/${attemptDetail.exam_id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          </div>

          {/* Student Info & Score Summary */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Thông tin học sinh</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{attemptDetail.student_name}</div>
                      <div className="text-sm text-slate-500">{attemptDetail.student_email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Clock className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">Thời gian bắt đầu</div>
                      <div className="font-medium text-slate-800">{formatDate(attemptDetail.start_time)}</div>
                    </div>
                  </div>
                  {attemptDetail.submit_time && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">Thời gian nộp</div>
                        <div className="font-medium text-slate-800">{formatDate(attemptDetail.submit_time)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Kết quả</h3>
                <div className="space-y-4">
                  {attemptDetail.score !== null ? (
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <div className={`text-3xl font-bold ${getScoreColor(attemptDetail.score)}`}>
                        {attemptDetail.score.toFixed(1)}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">Điểm số</div>
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <div className="text-2xl font-bold text-slate-400">--</div>
                      <div className="text-sm text-slate-500 mt-1">Chưa có điểm</div>
                    </div>
                  )}
                  
                  {attemptDetail.total_questions && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-xl font-bold text-green-600">
                          {attemptDetail.correct_answers || 0}
                        </div>
                        <div className="text-xs text-green-600">Đúng</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-xl font-bold text-red-600">
                          {attemptDetail.total_questions - (attemptDetail.correct_answers || 0)}
                        </div>
                        <div className="text-xs text-red-600">Sai</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Questions Review */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800">Chi tiết từng câu hỏi</h2>
            
            {questions.map((question, index) => (
              <div key={question.id} className="bg-white rounded-xl p-6 shadow-lg border border-slate-100">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    question.is_correct 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-red-100 text-red-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-500">
                        Câu {index + 1} • {question.question_type === 'multiple_choice' ? 'Trắc nghiệm' : 'Tự luận'}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        question.is_correct 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {question.is_correct ? 'Đúng' : 'Sai'}
                      </span>
                    </div>
                    <div className="prose max-w-none mb-4">
                      <MathContent content={question.content} />
                    </div>
                  </div>
                </div>

                <div className="ml-12">
                  {renderStudentAnswer(question)}
                  
                  {question.explanation && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Giải thích</span>
                      </div>
                      <div className="text-blue-700">
                        <MathContent content={question.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MathProvider>
  )
}
