'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Trophy, CheckCircle2, XCircle, ArrowLeft, BookOpen, Clock, MessageSquare } from 'lucide-react'
import MathContent, { MathProvider } from '@/components/MathContent'
import QuestionImage from '@/components/QuestionImage'
import FeedbackModal from '@/components/FeedbackModal'
import Toast from '@/components/Toast'
import {
  AttemptQuestionView,
  buildAttemptView,
  prepareRawAttemptData,
  RawAnswer,
  RawQuestion,
  RawStudentAnswer
} from '@/lib/attempts/attemptView'
import { getExamAttemptQuestionBundle } from '@/lib/exam/questions'

interface ExamAttempt {
  id: string
  status: string
  total_questions: number | null
  correct_answers: number | null
  score: number | null
  grading_status: string
  pending_grading_count: number
  objective_points: number | null
  essay_points: number | null
  earned_points: number | null
  max_points: number | null
  submit_time: string | null
  start_time: string
  result_released: boolean
  answer_key_revealed: boolean
}

export default function ResultPage() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.attemptId as string
  const supabase = useMemo(() => createClient(), [])

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [questions, setQuestions] = useState<AttemptQuestionView[]>([])
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

  const fetchAttemptData = useCallback(async () => {
    try {
      const { bundle, error: bundleError } = await getExamAttemptQuestionBundle(attemptId)
      if (bundleError || !bundle) {
        console.error('Exam question bundle error:', bundleError)
        setError('Không thể tải kết quả')
        setLoading(false)
        return
      }

      if (!['submitted', 'graded'].includes(bundle.attempt.status)) {
        setError('Bài thi chưa được nộp')
        setLoading(false)
        return
      }

      setAttempt(bundle.attempt)
      setExamTitle(bundle.exam.title)
      const examQuestions = bundle.questions.map((question) => ({
        part_number: question.part_number,
        order_in_part: question.order_in_part,
        questions: {
          id: question.id,
          content: question.content,
          question_type: question.question_type,
          explanation: question.explanation,
          solution: question.solution,
          tikz_image_url: question.tikz_image_url,
          answers: question.answers,
        } satisfies RawQuestion,
      }))
      const allAnswers = bundle.questions.flatMap((question) => question.answers || [])

      // Use unified view model
      const rawData = prepareRawAttemptData({
        examQuestions,
        studentAnswers: bundle.student_answers as unknown as RawStudentAnswer[],
        allAnswers: allAnswers as RawAnswer[]
      })
      
      const viewQuestions = buildAttemptView(rawData)
      setQuestions(viewQuestions)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }, [attemptId, supabase])

  useEffect(() => {
    if (!attemptId) return

    const timeoutId = window.setTimeout(() => {
      void fetchAttemptData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [attemptId, fetchAttemptData])

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-amber-600 dark:text-amber-400'
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

  const renderStudentAnswer = (question: AttemptQuestionView) => {
    if (!question.studentAnswerText) {
      return <span className="text-slate-400 italic">Không trả lời</span>
    }

    if (question.questionType === 'true_false' && question.trueFalseDetails && attempt?.answer_key_revealed) {
      return (
        <div className="space-y-1">
          {question.trueFalseDetails.map((detail, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium">{String.fromCharCode(97 + detail.statementIndex)}) </span>
              <span className={detail.studentAnswer === detail.correctAnswer ? 'text-green-600' : 'text-red-600'}>
                {detail.studentAnswer === null ? 'Chưa trả lời' : detail.studentAnswer ? 'Đúng' : 'Sai'}
              </span>
            </div>
          ))}
        </div>
      )
    }

    return <MathContent content={question.studentAnswerText} className="text-slate-700 dark:text-slate-300" />
  }

  const renderQuestionResult = (question: AttemptQuestionView, index: number) => {
    const isEssay = question.questionType === 'essay'
    const questionTypeLabel = question.questionType === 'multiple_choice' 
      ? 'Trắc nghiệm' 
      : question.questionType === 'true_false' 
        ? 'Đúng / Sai' 
        : question.questionType === 'essay' ? 'Tự luận' : 'Trả lời ngắn'

    if (isEssay) {
      const approved = attempt?.answer_key_revealed && question.gradingStatus === 'approved'
      return (
        <div key={question.questionId} className="mb-4 rounded-xl border border-slate-300 bg-slate-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start gap-3">
            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${approved ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
              {approved ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-2 text-sm font-medium text-slate-500">Câu {index + 1} • {questionTypeLabel}</div>
              <MathContent content={question.content} className="mb-3 text-slate-800 dark:text-slate-200" />
              <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/60">
                <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Bài làm của bạn:</div>
                {renderStudentAnswer(question)}
              </div>
              <div className={`mt-3 rounded-lg p-3 text-sm ${approved ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}>
                {approved
                  ? <>Giáo viên đã duyệt: <strong>{question.score ?? 0}/{question.maxScore ?? 0} điểm</strong></>
                  : question.gradingStatus === 'pending_review'
                    ? 'Đã ghi nhận bài tự luận. Giáo viên đang duyệt gợi ý chấm của AI.'
                    : 'Bài tự luận đã được ghi nhận; chi tiết chấm chưa được công bố.'}
                {approved && question.gradingFeedback && <p className="mt-2">Nhận xét: {question.gradingFeedback}</p>}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (!attempt?.answer_key_revealed) {
      return (
        <div key={question.questionId} className="mb-4 rounded-xl border border-slate-300 bg-slate-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 text-sm font-medium text-slate-500">Câu {index + 1} • {questionTypeLabel}</div>
          <MathContent content={question.content} className="mb-3 text-slate-800 dark:text-slate-200" />
          <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/60">
            <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Bài làm của bạn:</div>
            {renderStudentAnswer(question)}
          </div>
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Đáp án và kết quả từng câu chưa được công bố.</p>
        </div>
      )
    }

    return (
      <div key={question.questionId} className="bg-slate-200 dark:bg-slate-800 rounded-xl p-6 mb-4 border border-slate-300 dark:border-slate-700">
        <div className="flex items-start gap-3 mb-4">
          <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            question.isCorrect
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          }`}>
            {question.isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Câu {index + 1} • {questionTypeLabel}
            </div>
            <MathContent content={question.content} className="text-slate-800 dark:text-slate-200 mb-3" />
            {question.tikzImageUrl && (
              <QuestionImage 
                src={question.tikzImageUrl} 
                alt="Question diagram"
                className="mb-3"
              />
            )}
          </div>
        </div>

        <div className="ml-11">
          {question.isCorrect ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-medium">
                ✓ Bạn làm đúng
              </div>

              {question.explanation && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Giải thích:</div>
                  <MathContent content={question.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
                </div>
              )}

              {question.solution && (
                <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                  <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1">Lời giải:</div>
                  <MathContent content={question.solution} className="text-slate-700 dark:text-slate-300 text-sm" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Câu trả lời của bạn:</div>
                {renderStudentAnswer(question)}
              </div>

              {question.correctAnswerText && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Đáp án đúng:</div>
                  <MathContent content={question.correctAnswerText} className="text-slate-800 dark:text-slate-200" />
                </div>
              )}

              {question.explanation && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Giải thích:</div>
                  <MathContent content={question.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
                </div>
              )}

              {question.solution && (
                <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                  <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1">Lời giải:</div>
                  <MathContent content={question.solution} className="text-slate-700 dark:text-slate-300 text-sm" />
                </div>
              )}
            </div>
          )}

          {/* Feedback Button */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            {submittedFeedbacks.has(question.questionId) ? (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Đã gửi góp ý
              </div>
            ) : (
              <button
                onClick={() => openFeedbackModal(question.questionId, index + 1)}
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
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải kết quả...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
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

  const objectiveQuestions = questions.filter((question) => question.questionType !== 'essay')
  const objectiveCorrect = objectiveQuestions.filter((question) => question.isCorrect).length
  const essayQuestionCount = questions.length - objectiveQuestions.length

  return (
    <MathProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <div className="sticky top-0 z-30 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-300 dark:border-slate-700 px-4 sm:px-6 py-4">
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
          <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-lg p-6 sm:p-8 mb-8 text-center border border-slate-300 dark:border-slate-700">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-teal-600 dark:text-teal-400" />
            </div>
            
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Kết quả bài thi
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{examTitle}</p>

            {attempt?.grading_status === 'pending_review' ? (
              <>
                <div className="mb-3 text-3xl font-bold text-amber-600 dark:text-amber-400">Đang chờ chấm tự luận</div>
                <p className="mb-6 text-slate-500 dark:text-slate-400">
                  Còn {attempt.pending_grading_count} câu cần giáo viên duyệt; chưa công bố điểm tổng.
                </p>
              </>
            ) : !attempt?.result_released ? (
              <div className="mb-6 text-lg font-semibold text-amber-600 dark:text-amber-400">
                Giáo viên chưa công bố kết quả
              </div>
            ) : (
              <>
                <div className={`text-4xl sm:text-6xl font-bold mb-4 ${getScoreColor(attempt?.score ?? null)}`}>
                  {attempt?.score?.toFixed(1)}
                </div>
                <p className="text-slate-500 dark:text-slate-400 mb-6">trên thang điểm 10</p>
              </>
            )}

            {attempt?.answer_key_revealed ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                  {objectiveCorrect}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Câu khách quan đúng</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {objectiveQuestions.length - objectiveCorrect}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Câu khách quan sai</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-slate-600 dark:text-slate-400">
                  {essayQuestionCount}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Câu tự luận</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  {getTimeSpent()}
                </div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Thời gian</div>
              </div>
            </div>
            ) : (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Chi tiết đúng/sai và lời giải chỉ hiện khi chính sách của đề cho phép.
              </div>
            )}
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
