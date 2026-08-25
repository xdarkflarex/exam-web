'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2, XCircle, ArrowLeft, BookOpen, Clock, MessageSquare, Sparkles, ListFilter } from 'lucide-react'
import MathContent, { MathProvider } from '@/components/MathContent'
import QuestionImage from '@/components/QuestionImage'
import FeedbackModal from '@/components/FeedbackModal'
import EssayAnswerImages from '@/components/EssayAnswerImages'
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
import ProgressRing from '@/components/viz/ProgressRing'
import ResultQuestionMap from '@/components/result/ResultQuestionMap'

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
  const [onlyWrong, setOnlyWrong] = useState(false)
  /*
    Muc tieu nhay mang kem `seq` chu khong phai so cau tran.

    Hai ly do. Mot: bam lai DUNG cau vua bam phai cuon lai lan nua, ma neu state
    chi la so thi gia tri khong doi nen effect khong chay. Hai: sau khi cuon
    xong KHONG duoc `setState(null)` de don dep — do la setState trong than
    effect, dung cai bay ma `react-hooks/set-state-in-effect` da chan o
    ScrollRevealClient.
  */
  const [jumpTarget, setJumpTarget] = useState<{ n: number; seq: number } | null>(null)
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

  /*
    Nhay toi mot cau tu ban do.

    Phai TAT bo loc truoc: neu dang o che do "chi xem cau sai" ma bam vao mot
    cau dung thi phan tu do khong ton tai trong DOM, `scrollIntoView` se im
    lang khong lam gi va nguoi dung tuong nut hong.
  */
  const jumpToQuestion = useCallback((questionNumber: number) => {
    setOnlyWrong(false)
    setJumpTarget((prev) => ({ n: questionNumber, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!jumpTarget) return
    document
      .getElementById(`cau-${jumpTarget.n}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [jumpTarget])

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
      const revealed = attempt?.answer_key_revealed === true
      const approved = revealed && question.gradingStatus === 'approved'
      // AI đã chấm nhưng CHƯA ai kiểm tra lại. Điểm này có thể thay đổi, nên
      // không bao giờ hiển thị nó như một điểm đã chốt: luôn kèm nhãn nói rõ
      // nguồn gốc. Với môn Toán, OCR đọc nhầm một dấu âm là đủ đảo ngược kết
      // luận — học sinh phải biết mà đối chiếu lại.
      const aiGraded = question.gradingStatus === 'ai_graded'

      const iconTone = approved
        ? 'bg-indigo-100 text-indigo-600'
        : aiGraded
          ? 'bg-violet-100 text-violet-600'
          : 'bg-amber-100 text-amber-600'
      const noteTone = approved
        ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200'
        : aiGraded
          ? 'bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-200'
          : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'

      return (
        <div key={question.questionId} id={`cau-${index + 1}`} className="bento-tile mb-4 scroll-mt-24 p-6">
          <div className="flex items-start gap-3">
            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${iconTone}`}>
              {approved ? <CheckCircle2 className="h-5 w-5" /> : aiGraded ? <Sparkles className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-2 text-sm font-medium text-slate-500">Câu {index + 1} • {questionTypeLabel}</div>
              <MathContent content={question.content} className="mb-3 text-slate-800 dark:text-slate-200" />
              <div className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/60">
                <div className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Bài làm của bạn:</div>
                {renderStudentAnswer(question)}
                {/* Ảnh đã nộp, chỉ để xem lại — bài đã nộp thì ảnh là bằng chứng
                    của một bài đã chấm, không sửa được nữa. */}
                <div className="mt-3">
                  <EssayAnswerImages
                    attemptId={attemptId}
                    questionId={question.questionId}
                    label="Ảnh bài làm bạn đã nộp"
                  />
                </div>
              </div>
              <div className={`mt-3 rounded-lg p-3 text-sm ${noteTone}`}>
                {approved ? (
                  <>
                    Giáo viên đã duyệt: <strong>{question.score ?? 0}/{question.maxScore ?? 0} điểm</strong>
                    {question.gradingFeedback && <p className="mt-2">Nhận xét: {question.gradingFeedback}</p>}
                  </>
                ) : aiGraded ? (
                  <>
                    <strong>Điểm do AI chấm — giáo viên sẽ xem lại</strong>
                    {revealed ? (
                      <p className="mt-1">
                        Tạm tính: <strong>{question.score ?? 0}/{question.maxScore ?? 0} điểm</strong>. Điểm này có thể thay đổi sau khi giáo viên kiểm tra.
                      </p>
                    ) : (
                      <p className="mt-1">Điểm chi tiết chưa được công bố.</p>
                    )}
                    {revealed && question.gradingFeedback && (
                      <p className="mt-2">Nhận xét của AI: {question.gradingFeedback}</p>
                    )}
                    <p className="mt-2 text-xs opacity-80">
                      Nếu bạn thấy phần chấm chưa đúng, hãy báo lại với giáo viên.
                    </p>
                  </>
                ) : question.gradingStatus === 'pending_review' ? (
                  'Đã ghi nhận bài tự luận. Giáo viên đang duyệt gợi ý chấm của AI.'
                ) : (
                  'Bài tự luận đã được ghi nhận; chi tiết chấm chưa được công bố.'
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (!attempt?.answer_key_revealed) {
      return (
        <div key={question.questionId} id={`cau-${index + 1}`} className="bento-tile mb-4 scroll-mt-24 p-6">
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
      <div
        key={question.questionId}
        id={`cau-${index + 1}`}
        /* Dai mau trai thay cho viec ca hai loai the deu giong nhau: cuon
           doc danh sach la thay ngay cho nao sai, khong phai doc tung icon. */
        className="bento-tile bento-rail mb-4 scroll-mt-24 py-6 pl-7 pr-6"
        style={{ '--rail': question.isCorrect ? '#10b981' : '#f43f5e' } as React.CSSProperties}
      >
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải kết quả...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
  // Điểm tổng đã cộng cả phần AI chấm mà chưa ai kiểm tra. `grading_status` của
  // attempt không nói được điều này: RPC đặt attempt về `completed` khi không
  // còn câu `pending_review`, kể cả khi các câu đó là `ai_graded`. Phải soi
  // từng câu.
  const hasAiGradedEssay = questions.some((question) => question.gradingStatus === 'ai_graded')

  const wrongCount = objectiveQuestions.filter((question) => question.isCorrect === false).length
  /*
    Giu INDEX GOC khi loc. Nhan "Cau 13" la vi tri trong ca de; danh so lai theo
    danh sach da loc se bien cau 13 thanh cau 2, va ban do o tren tro sai cho.
  */
  const visibleQuestions = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) =>
      !onlyWrong || (question.questionType !== 'essay' && question.isCorrect === false)
    )

  return (
    <MathProvider>
      <div className="min-h-screen">
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
          {/*
            HERO: hai vùng, không phải một khối căn giữa.

            Bản cũ là Trophy + điểm to + bốn ô số ngang nhau. Ba vấn đề: cúp
            vàng cho một bài 3,0 điểm là sai giọng; "đúng" và "sai" là CÙNG một
            thông tin viết hai lần (đúng + sai = tổng); và không có gì nói cho
            học sinh biết nên làm gì tiếp.

            Giờ trái là điểm + nhận định, phải là vòng tỉ lệ đúng — hai con số
            khác nhau về bản chất nên được tách hẳn: điểm đã tính theo trọng số
            của Bộ, còn tỉ lệ đúng là đếm câu. Gộp chung một chỗ là mời người
            đọc nhầm cái này ra cái kia.
          */}
          <div className="bento-tile-lead mb-6 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              Kết quả bài làm
            </p>
            <h1 className="mt-1 font-baloo text-xl font-bold leading-snug text-slate-800 dark:text-white sm:text-2xl">
              {examTitle}
            </h1>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {attempt?.grading_status === 'pending_review' ? (
                  <>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 sm:text-3xl">
                      Đang chờ chấm tự luận
                    </div>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">
                      Còn {attempt.pending_grading_count} câu cần giáo viên duyệt; chưa công bố điểm tổng.
                    </p>
                  </>
                ) : !attempt?.result_released ? (
                  <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                    Giáo viên chưa công bố kết quả
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      {/* `score` có thể null dù đã công bố (dữ liệu cũ, chốt lỗi giữa
                          đường). Trước đây `?.toFixed(1)` render ra ô trống không giải
                          thích gì — nói thẳng là chưa có điểm thay vì để khoảng trắng. */}
                      <span
                        className={`font-baloo text-5xl font-bold tabular-nums sm:text-6xl ${getScoreColor(attempt?.score ?? null)}`}
                      >
                        {typeof attempt?.score === 'number' ? attempt.score.toFixed(1) : '—'}
                      </span>
                      {typeof attempt?.score === 'number' && (
                        <span className="text-lg text-slate-500 dark:text-slate-400">/ 10</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {typeof attempt?.score === 'number'
                        ? 'Điểm tính theo trọng số của đề'
                        : 'Chưa có điểm tổng cho lượt thi này. Hãy liên hệ giáo viên.'}
                    </p>
                  </>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {getTimeSpent()}
                  </span>
                  {essayQuestionCount > 0 && (
                    <span className="tabular-nums">{essayQuestionCount} câu tự luận</span>
                  )}
                </div>
              </div>

              {/* Vòng chỉ vẽ khi đáp án đã công bố. Chưa công bố mà vẫn vẽ tỉ lệ
                  đúng là để lộ kết quả đi vòng qua chính sách của đề. */}
              {attempt?.answer_key_revealed && objectiveQuestions.length > 0 && (
                <div className="shrink-0 text-center">
                  <ProgressRing
                    value={Math.round((objectiveCorrect / objectiveQuestions.length) * 100)}
                    size={104}
                    tone={
                      objectiveCorrect / objectiveQuestions.length >= 0.8
                        ? 'emerald'
                        : objectiveCorrect / objectiveQuestions.length >= 0.5
                          ? 'teal'
                          : 'amber'
                    }
                    caption="đúng"
                    animate
                    ariaLabel={`Làm đúng ${objectiveCorrect} trên ${objectiveQuestions.length} câu khách quan`}
                  />
                  <p className="mt-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {objectiveCorrect}/{objectiveQuestions.length} câu khách quan
                  </p>
                </div>
              )}
            </div>

            {hasAiGradedEssay && attempt?.result_released && (
              <div className="mt-6 flex items-start gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-900/20 dark:text-violet-200">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>Điểm này có phần do AI chấm và có thể thay đổi sau khi giáo viên xem lại.</span>
              </div>
            )}
          </div>

          {/* Bản đồ câu: trả lời "mình sai câu nào" trong một lần nhìn, thay vì
              bắt cuộn hết 22 câu rồi tự nhớ. */}
          <div className="bento-tile mb-8 p-5 sm:p-6">
            <ResultQuestionMap
              questions={questions}
              revealed={attempt?.answer_key_revealed === true}
              onJump={jumpToQuestion}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-baloo text-lg font-bold text-slate-800 dark:text-white sm:text-xl">
              <BookOpen className="h-5 w-5" />
              Chi tiết bài làm
            </h2>
            {/* Lọc chỉ hiện khi có câu sai VÀ đáp án đã công bố — nút lọc "câu
                sai" lúc chưa công bố sẽ tự nó tiết lộ có bao nhiêu câu sai. */}
            {attempt?.answer_key_revealed && wrongCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyWrong((value) => !value)}
                aria-pressed={onlyWrong}
                className={`btn-action inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  onlyWrong
                    ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'border-slate-300 text-slate-600 hover:border-teal-400 dark:border-slate-600 dark:text-slate-300'
                }`}
              >
                <ListFilter className="h-4 w-4" aria-hidden="true" />
                {onlyWrong ? `Đang xem ${wrongCount} câu sai` : `Chỉ xem ${wrongCount} câu sai`}
              </button>
            )}
          </div>

          {visibleQuestions.map(({ question, index }) => renderQuestionResult(question, index))}
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
