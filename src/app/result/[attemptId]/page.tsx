'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Trophy, CheckCircle2, XCircle, ArrowLeft, BookOpen, Clock, MessageSquare } from 'lucide-react'
import { Question, Answer } from '@/types'
import MathContent, { MathProvider } from '@/components/MathContent'
import QuestionImage from '@/components/QuestionImage'
import FeedbackModal from '@/components/FeedbackModal'
import Toast from '@/components/Toast'
import { isAdmin, isStudent } from '@/lib/auth/roles'

interface ExamAttempt {
  id: string
  exam_id: string
  student_id: string
  status: string
  total_questions: number
  correct_answers: number
  score: number
  submit_time: string
  start_time: string
}

interface StudentAnswerData {
  id: string
  question_id: string
  selected_answer: string | null
  selected_answers: Record<string, boolean> | null
  text_answer: string | null
  is_correct: boolean
  score: number
}

interface QuestionWithAnswer extends Question {
  studentAnswer?: StudentAnswerData
  correctAnswer?: Answer
}

export default function ResultPage() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.attemptId as string
  const supabase = createClient()

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [questions, setQuestions] = useState<QuestionWithAnswer[]>([])
  const [examTitle, setExamTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean
    questionId: string
    questionNumber: number
  }>({ isOpen: false, questionId: '', questionNumber: 0 })
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
    isVisible: boolean
  }>({ message: '', type: 'success', isVisible: false })

  useEffect(() => {
    if (attemptId) {
      fetchAttemptData()
    }
  }, [attemptId])

  const fetchAttemptData = async () => {
    try {
      const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, status, total_questions, correct_answers, score, submit_time, start_time')
        .eq('id', attemptId)
        .single()

      if (attemptError) {
        console.error('Attempt fetch error:', attemptError)
        setError('Không tìm thấy kết quả')
        setLoading(false)
        return
      }

      if (attemptData.status !== 'submitted') {
        setError('Bài thi chưa được nộp')
        setLoading(false)
        return
      }

      setAttempt(attemptData)

      const { data: examInfo, error: examError } = await supabase
        .from('exams')
        .select('title')
        .eq('id', attemptData.exam_id)
        .single()

      if (!examError && examInfo) {
        setExamTitle(examInfo.title)
      }

      const { data: studentAnswers, error: saError } = await supabase
        .from('student_answers')
        .select('id, question_id, selected_answer, selected_answers, text_answer, is_correct, score')
        .eq('attempt_id', attemptId)

      if (saError) {
        console.error('Student answers fetch error:', saError)
      }

      const { data: examQuestions, error: eqError } = await supabase
        .from('exam_questions')
        .select(`
          part_number,
          order_in_part,
          questions (
            id,
            content,
            question_type,
            explanation,
            tikz_image_url
          )
        `)
        .eq('exam_id', attemptData.exam_id)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqError) {
        console.error('Exam questions fetch error:', eqError)
        setError('Không thể tải câu hỏi')
        setLoading(false)
        return
      }

      const questionIds = examQuestions.map((eq: any) => eq.questions?.id).filter(Boolean)
      
      const { data: allAnswers, error: answersError } = await supabase
        .from('answers')
        .select('id, question_id, content, is_correct, order_index')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true })

      if (answersError) {
        console.error('Answers fetch error:', answersError)
      }

      const answersByQuestion: Record<string, Answer[]> = {}
      if (allAnswers) {
        for (const answer of allAnswers) {
          if (!answersByQuestion[answer.question_id]) {
            answersByQuestion[answer.question_id] = []
          }
          answersByQuestion[answer.question_id].push(answer)
        }
      }

      const studentAnswerMap: Record<string, StudentAnswerData> = {}
      if (studentAnswers) {
        for (const sa of studentAnswers) {
          studentAnswerMap[sa.question_id] = sa
        }
      }

      const questionsWithAnswers: QuestionWithAnswer[] = []

      for (const eq of examQuestions) {
        const q = eq.questions as any
        if (!q) continue

        const answers = answersByQuestion[q.id] || []
        const correctAnswer = answers.find(a => a.is_correct)
        const studentAnswer = studentAnswerMap[q.id]

        questionsWithAnswers.push({
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          explanation: q.explanation,
          tikz_image_url: q.tikz_image_url,
          part_number: eq.part_number,
          order_in_part: eq.order_in_part,
          answers: answers,
          studentAnswer: studentAnswer,
          correctAnswer: correctAnswer
        })
      }

      setQuestions(questionsWithAnswers)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 dark:text-green-400'
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getTimeSpent = () => {
    if (!attempt?.start_time || !attempt?.submit_time) return 'N/A'
    const start = new Date(attempt.start_time)
    const end = new Date(attempt.submit_time)
    const diffMs = end.getTime() - start.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins} phút`
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, isVisible: true })
  }

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }))
  }

  const openFeedbackModal = (questionId: string, questionNumber: number) => {
    setFeedbackModal({ isOpen: true, questionId, questionNumber })
  }

  const closeFeedbackModal = () => {
    setFeedbackModal({ isOpen: false, questionId: '', questionNumber: 0 })
  }

  const submitFeedback = async (message: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        showToast('Bạn cần đăng nhập để gửi góp ý', 'error')
        return
      }

      const { error } = await supabase
        .from('question_feedbacks')
        .insert({
          question_id: feedbackModal.questionId,
          attempt_id: attemptId,
          student_id: user.id,
          message: message,
          status: 'pending'
        })

      if (error) {
        console.error('Feedback submission error:', error)
        showToast('Không thể gửi góp ý. Vui lòng thử lại.', 'error')
        throw error
      }

      setSubmittedFeedbacks(prev => new Set([...prev, feedbackModal.questionId]))
      showToast('Đã gửi góp ý thành công!', 'success')
    } catch (error) {
      throw error
    }
  }

  const renderStudentAnswer = (question: QuestionWithAnswer) => {
    const studentAns = question.studentAnswer
    if (!studentAns) return <span className="text-slate-400 italic">Không trả lời</span>

    if (question.question_type === 'multiple_choice' && studentAns.selected_answer) {
      const selectedAnswer = question.answers?.find(a => a.id === studentAns.selected_answer)
      return selectedAnswer ? (
        <MathContent content={selectedAnswer.content} className="text-slate-700 dark:text-slate-300" />
      ) : <span className="text-slate-400 italic">Không trả lời</span>
    }

    if (question.question_type === 'true_false' && studentAns.selected_answers) {
      const answers = Object.entries(studentAns.selected_answers)
      if (answers.length === 0) return <span className="text-slate-400 italic">Không trả lời</span>
      
      return (
        <div className="space-y-1">
          {answers.map(([index, value], idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium">{String.fromCharCode(97 + parseInt(index))}) </span>
              <span className={value ? 'text-green-600' : 'text-red-600'}>
                {value ? 'Đúng' : 'Sai'}
              </span>
            </div>
          ))}
        </div>
      )
    }

    if (question.question_type === 'short_answer' && studentAns.text_answer) {
      return <span className="text-slate-700 dark:text-slate-300">{studentAns.text_answer}</span>
    }

    return <span className="text-slate-400 italic">Không trả lời</span>
  }

  const renderQuestionResult = (question: QuestionWithAnswer, index: number) => {
    const isCorrect = question.studentAnswer?.is_correct

    return (
      <div key={question.id} className="bg-white dark:bg-slate-900 rounded-xl p-6 mb-4 border border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3 mb-4">
          <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isCorrect
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          }`}>
            {isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Câu {index + 1}
            </div>
            <MathContent content={question.content} className="text-slate-800 dark:text-slate-200 mb-3" />
            {question.tikz_image_url && (
              <QuestionImage 
                src={question.tikz_image_url} 
                alt="Question diagram"
                className="mb-3"
              />
            )}
          </div>
        </div>

        <div className="ml-11">
          {isCorrect ? (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-medium">
              ✓ Bạn làm đúng
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Câu trả lời của bạn:</div>
                {renderStudentAnswer(question)}
              </div>

              {question.question_type === 'multiple_choice' && question.correctAnswer && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Đáp án đúng:</div>
                  <MathContent content={question.correctAnswer.content} className="text-slate-800 dark:text-slate-200" />
                </div>
              )}

              {question.explanation && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Giải thích:</div>
                  <MathContent content={question.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
                </div>
              )}
            </div>
          )}

          {/* Feedback Button */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            {submittedFeedbacks.has(question.id) ? (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Đã gửi góp ý
              </div>
            ) : (
              <button
                onClick={() => openFeedbackModal(question.id, index + 1)}
                className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Báo lỗi / Góp ý
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải kết quả...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50 dark:bg-slate-950">
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={() => router.push('/student')}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Về trang chủ</span>
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 sm:p-8 mb-8 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Kết quả bài thi
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{examTitle}</p>

            <div className={`text-4xl sm:text-6xl font-bold mb-4 ${getScoreColor(attempt?.score || 0)}`}>
              {attempt?.score?.toFixed(1)}
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-6">trên thang điểm 10</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                  {attempt?.correct_answers}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Câu đúng</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {(attempt?.total_questions || 0) - (attempt?.correct_answers || 0)}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Câu sai</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-400">
                  {attempt?.total_questions}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Tổng câu</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  {getTimeSpent()}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Thời gian</div>
              </div>
            </div>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Chi tiết bài làm
          </h2>

          {questions.map((q, idx) => renderQuestionResult(q, idx))}
        </div>

        {/* Feedback Modal */}
        <FeedbackModal
          isOpen={feedbackModal.isOpen}
          onClose={closeFeedbackModal}
          onSubmit={submitFeedback}
          questionNumber={feedbackModal.questionNumber}
        />

        {/* Toast Notification */}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    </MathProvider>
  )
}
