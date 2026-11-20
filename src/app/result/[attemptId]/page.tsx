'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  BookOpen,
  Clock,
  MessageSquare,
  Sparkles,
  ListFilter,
  Bookmark,
  BookmarkCheck,
  BadgeCheck,
  CircleDashed,
  CircleDot,
  EyeOff,
  FileCheck2,
  Lightbulb,
  PenLine,
  type LucideIcon,
} from 'lucide-react'
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
import { addBookmark, getBookmarkIdsByQuestion, removeBookmark } from '@/lib/bookmarks/actions'
import ProgressRing from '@/components/viz/ProgressRing'
import ResultQuestionMap from '@/components/result/ResultQuestionMap'
import ScoreBox from '@/components/result/ScoreBox'
import { cellState } from '@/lib/attempts/resultCellState'

/*
  Trạng thái trên đầu thẻ từng câu: chip có icon + chữ, không chỉ màu
  (`DESIGN_SYSTEM.md`).

  Câu khách quan lấy trạng thái từ CHÍNH `cellState` mà bản đồ câu dùng, nên
  thẻ và ô trên bản đồ không bao giờ nói hai chuyện khác nhau, và bất biến
  "chưa công bố đáp án thì không có đúng/sai" chỉ phải giữ ở một chỗ. Câu tự
  luận đi theo `gradingStatus` của từng câu, cùng các nhánh với ghi chú chấm
  bên dưới thẻ.

  `rail` là màu dải bên trái (`.bento-rail`) — cuộn dọc danh sách là thấy ngay
  chỗ nào sai. Thẻ chưa công bố đáp án không có dải: dải màu ở đó là gợi ý
  đúng/sai đi vòng qua chính sách.
*/
type CardStatus =
  | 'correct'
  | 'wrong'
  | 'unanswered'
  | 'hidden'
  | 'essay-approved'
  | 'essay-ai'
  | 'essay-pending'
  | 'essay-recorded'

const CARD_STATUS: Record<CardStatus, { label: string; Icon: LucideIcon; chip: string; rail?: string }> = {
  correct: {
    label: 'Đúng',
    Icon: CheckCircle2,
    chip: 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    rail: '#10b981',
  },
  wrong: {
    label: 'Sai',
    Icon: XCircle,
    chip: 'border-rose-600/30 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300',
    rail: '#f43f5e',
  },
  unanswered: {
    label: 'Chưa làm',
    Icon: CircleDashed,
    chip: 'border-dashed border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-300',
    rail: '#94a3b8',
  },
  hidden: {
    label: 'Đã trả lời',
    Icon: CircleDot,
    chip: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200',
  },
  'essay-approved': {
    label: 'Giáo viên đã duyệt',
    Icon: BadgeCheck,
    chip: 'border-indigo-600/30 bg-indigo-50 text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-300',
    rail: '#6366f1',
  },
  'essay-ai': {
    label: 'AI chấm',
    Icon: Sparkles,
    chip: 'border-violet-600/30 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300',
    rail: '#8b5cf6',
  },
  'essay-pending': {
    label: 'Chờ giáo viên duyệt',
    Icon: Clock,
    chip: 'border-amber-600/30 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300',
    rail: '#f59e0b',
  },
  'essay-recorded': {
    label: 'Đã ghi nhận',
    Icon: FileCheck2,
    chip: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200',
  },
}

/** Khung "bài làm của bạn" — trung tính; trạng thái đã nằm ở chip và dải màu. */
const ANSWER_BOX = 'rounded-xl border border-slate-200 bg-[var(--background-raised)] p-3 dark:border-slate-700 dark:bg-slate-900/50'
const ANSWER_LABEL = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300'

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
  /** Để nút quay lại đưa về đúng nơi học sinh vừa bấm "Xem lại". */
  const [examMode, setExamMode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean
    questionId: string
    questionNumber: number
  }>({ isOpen: false, questionId: '', questionNumber: 0 })
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<string>>(new Set())
  /** `question_id` → `bookmark_id` cho những câu đã lưu. Không có khoá = chưa lưu. */
  const [bookmarks, setBookmarks] = useState<Map<string, string>>(new Map())
  /** Câu đang chờ server trả lời, để khoá nút và không bấm hai lần. */
  const [bookmarkBusy, setBookmarkBusy] = useState<string | null>(null)
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
      setExamMode(bundle.exam.exam_mode)
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

      // Trạng thái đã lưu. Hỏng ở đây KHÔNG được làm hỏng cả trang kết quả:
      // không biết câu nào đã lưu thì nút hiện "Lưu để ôn lại", bấm vào vẫn
      // đúng vì trùng khoá được coi là đã lưu.
      setBookmarks(await getBookmarkIdsByQuestion(viewQuestions.map((q) => q.questionId)))
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

  const toggleBookmark = async (questionId: string) => {
    const existing = bookmarks.get(questionId)
    setBookmarkBusy(questionId)

    const result = existing ? await removeBookmark(existing) : await addBookmark(questionId)
    setBookmarkBusy(null)

    if (!result.ok) {
      showToast(result.message, 'error')
      return
    }

    setBookmarks((current) => {
      const next = new Map(current)
      if (existing) next.delete(questionId)
      else if (result.bookmarkId) next.set(questionId, result.bookmarkId)
      return next
    })

    // Lưu được nhưng không đọc lại được id thì nút vẫn hiện "Lưu để ôn lại".
    // Bấm lần nữa không hỏng — trùng khoá trả về id của dòng sẵn có.
    showToast(
      !existing && !result.bookmarkId
        ? 'Đã lưu, nhưng chưa cập nhật được nút. Mở trang "Câu đã lưu" để kiểm tra.'
        : result.message,
      'success'
    )
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
    /*
      Đúng/Sai khi đáp án đã mở: từng ý một — nội dung mệnh đề, em chọn gì, và
      khoá đúng của ý em chọn sai. Bản cũ chỉ in "a) Đúng" không kèm mệnh đề,
      còn khung "Đáp án đúng" in nội dung mệnh đề a — học sinh bấm "Xem lại"
      xong vẫn không biết ý nào sai và sai ra sao. Đứng TRƯỚC nhánh "Không trả
      lời": câu bỏ trống vẫn phải hiện đủ bốn mệnh đề và khoá.
    */
    if (question.questionType === 'true_false' && question.trueFalseDetails && attempt?.answer_key_revealed) {
      return (
        <ol className="divide-y divide-dashed divide-slate-200 dark:divide-slate-700">
          {question.trueFalseDetails.map((detail) => {
            const right = detail.studentAnswer === detail.correctAnswer
            const picked = detail.studentAnswer === null ? 'Chưa trả lời' : detail.studentAnswer ? 'Đúng' : 'Sai'
            return (
              <li key={detail.statementIndex} className="flex items-start gap-2.5 py-2 text-sm first:pt-0 last:pb-0">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {String.fromCharCode(97 + detail.statementIndex)})
                </span>
                <div className="min-w-0 flex-1">
                  {detail.statementContent && (
                    <MathContent content={detail.statementContent} className="text-slate-700 dark:text-slate-200" />
                  )}
                  {/* Trạng thái = màu + icon + chữ, không chỉ màu (DESIGN_SYSTEM.md). */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className={`inline-flex items-center gap-1 font-medium ${right ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                      {right
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      Bạn chọn: {picked}
                    </span>
                    {!right && (
                      <span className="font-medium text-indigo-700 dark:text-indigo-300">
                        Đáp án: {detail.correctAnswer ? 'Đúng' : 'Sai'}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )
    }

    if (!question.studentAnswerText) {
      return <span className="text-slate-500 italic dark:text-slate-400">Không trả lời</span>
    }

    return <MathContent content={question.studentAnswerText} className="text-slate-700 dark:text-slate-300" />
  }

  /** Đầu thẻ: số câu + dạng câu bên trái, chip trạng thái bên phải. */
  const renderCardHeader = (number: number, typeLabel: string, status: CardStatus) => {
    const { label, Icon, chip } = CARD_STATUS[status]
    return (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-dashed border-[var(--border)] px-5 py-3 sm:px-6">
        <h3 className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-baloo text-lg font-bold text-slate-800 dark:text-white">Câu {number}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400"> · {typeLabel}</span>
        </h3>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${chip}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </span>
      </header>
    )
  }

  /** Vỏ thẻ: giữ `id="cau-N"` và `scroll-mt-24` — bản đồ câu nhảy tới đây. */
  const renderCard = (
    question: AttemptQuestionView,
    index: number,
    status: CardStatus,
    withRail: boolean,
    children: ReactNode
  ) => {
    const rail = withRail ? CARD_STATUS[status].rail : undefined
    return (
      <article
        key={question.questionId}
        id={`cau-${index + 1}`}
        className={`bento-tile mb-4 scroll-mt-24 overflow-hidden ${rail ? 'bento-rail' : ''}`}
        style={rail ? ({ '--rail': rail } as CSSProperties) : undefined}
      >
        {children}
      </article>
    )
  }

  /** Đề bài + hình (nếu có). Hình hiện ở mọi nhánh — hình là một phần của đề, không phải đáp án. */
  const renderQuestionBody = (question: AttemptQuestionView) => (
    <>
      <MathContent content={question.content} className="text-slate-800 dark:text-slate-200" />
      {question.tikzImageUrl && (
        <QuestionImage
          src={question.tikzImageUrl}
          alt="Hình vẽ của câu hỏi"
        />
      )}
    </>
  )

  /*
    Giải thích + lời giải trên một mảnh "vở ô li": giấy kẻ ô và đường lề đỏ
    (`.notebook-margin`). Chỉ gọi ở nhánh đáp án đã công bố — lời giải là đáp án.
  */
  const renderWorkedSolution = (question: AttemptQuestionView) => {
    if (!question.explanation && !question.solution) return null
    return (
      <div className="notebook-margin paper-grid space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background-raised)] py-3 pr-4 dark:bg-slate-900/50">
        {question.explanation && (
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              Giải thích
            </p>
            <MathContent content={question.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
          </div>
        )}
        {question.solution && (
          <div className={question.explanation ? 'border-t border-dashed border-slate-300 pt-3 dark:border-slate-600' : undefined}>
            <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
              <PenLine className="h-4 w-4" aria-hidden="true" />
              Lời giải
            </p>
            <MathContent content={question.solution} className="text-slate-700 dark:text-slate-300 text-sm" />
          </div>
        )}
      </div>
    )
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
      const pendingReview = question.gradingStatus === 'pending_review'

      const status: CardStatus = approved
        ? 'essay-approved'
        : aiGraded
          ? 'essay-ai'
          : pendingReview
            ? 'essay-pending'
            : 'essay-recorded'
      const noteTone = approved
        ? 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-900/20 dark:text-indigo-200'
        : aiGraded
          ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-200'
          : pendingReview
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200'
            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'

      return renderCard(question, index, status, true, (
        <>
          {renderCardHeader(index + 1, questionTypeLabel, status)}
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {renderQuestionBody(question)}
            <div className={ANSWER_BOX}>
              <p className={ANSWER_LABEL}>Bài làm của bạn</p>
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
            <div className={`rounded-xl border p-3 text-sm ${noteTone}`}>
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
              ) : pendingReview ? (
                'Đã ghi nhận bài tự luận. Giáo viên đang duyệt gợi ý chấm của AI.'
              ) : (
                'Bài tự luận đã được ghi nhận; chi tiết chấm chưa được công bố.'
              )}
            </div>
          </div>
        </>
      ))
    }

    if (!attempt?.answer_key_revealed) {
      // `cellState(..., false)` chỉ trả `hidden` hoặc `unanswered` — không bao giờ đúng/sai.
      const status: CardStatus = cellState(question, false) === 'unanswered' ? 'unanswered' : 'hidden'
      return renderCard(question, index, status, false, (
        <>
          {renderCardHeader(index + 1, questionTypeLabel, status)}
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {renderQuestionBody(question)}
            <div className={ANSWER_BOX}>
              <p className={ANSWER_LABEL}>Bài làm của bạn</p>
              {renderStudentAnswer(question)}
            </div>
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
              <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Đáp án và kết quả từng câu chưa được công bố.
            </p>
          </div>
        </>
      ))
    }

    const revealedState = cellState(question, true)
    const status: CardStatus = revealedState === 'correct' || revealedState === 'wrong' ? revealedState : 'unanswered'
    // Khung "Đáp án đúng" chỉ khi làm sai/bỏ trống — đúng như bản cũ. Câu
    // Đúng/Sai không có khung này: khoá từng ý đã nằm trong danh sách mệnh đề.
    const showKey = !question.isCorrect && Boolean(question.correctAnswerText)
    const saved = bookmarks.has(question.questionId)

    return renderCard(question, index, status, true, (
      <>
        {renderCardHeader(index + 1, questionTypeLabel, status)}
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {renderQuestionBody(question)}

          <div className={`grid gap-3 ${showKey ? 'sm:grid-cols-2' : ''}`}>
            <div className={ANSWER_BOX}>
              <p className={ANSWER_LABEL}>Câu trả lời của bạn</p>
              {renderStudentAnswer(question)}
            </div>
            {showKey && question.correctAnswerText && (
              <div className="rounded-xl border border-emerald-600/25 bg-emerald-50/70 p-3 dark:border-emerald-400/25 dark:bg-emerald-500/10">
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Đáp án đúng
                </p>
                <MathContent content={question.correctAnswerText} className="text-slate-800 dark:text-slate-200" />
              </div>
            )}
          </div>

          {renderWorkedSolution(question)}
        </div>

        {/* Lưu để ôn lại + Góp ý */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => void toggleBookmark(question.questionId)}
            disabled={bookmarkBusy === question.questionId}
            aria-pressed={saved}
            className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              saved
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-teal-300'
            }`}
          >
            {saved ? <BookmarkCheck className="w-4 h-4" aria-hidden="true" /> : <Bookmark className="w-4 h-4" aria-hidden="true" />}
            {saved ? 'Đã lưu' : 'Lưu để ôn lại'}
          </button>

          {submittedFeedbacks.has(question.questionId) ? (
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Đã gửi góp ý
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openFeedbackModal(question.questionId, index + 1)}
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-indigo-300"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              Báo lỗi / Góp ý
            </button>
          )}
        </div>
      </>
    ))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 dark:text-teal-400" aria-hidden="true" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải kết quả...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bento-tile-lead paper-grid ruler-edge w-full max-w-md overflow-hidden px-8 pb-8 pt-10 text-center">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          </div>
          <h1 className="font-baloo text-2xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-600 dark:text-slate-300">{error}</p>
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
        <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background-overlay)] px-4 py-2.5 backdrop-blur-md sm:px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            {/* Đề ôn tập: về danh sách ôn tập — học sinh tới đây từ nút "Xem lại"
                ở đó, và bước tiếp theo của vòng ôn tập là "Làm lại" cũng ở đó.
                Trên điện thoại chữ ẩn đi nhưng vẫn là tên của nút (`sr-only`) —
                bản cũ dùng `hidden`, để lại một nút mũi tên không có tên. */}
            <button
              type="button"
              onClick={() => router.push(examMode === 'practice' ? '/student/practice' : '/student')}
              className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{examMode === 'practice' ? 'Về ôn tập' : 'Về trang chủ'}</span>
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/*
            PHIẾU KẾT QUẢ: tờ giấy kẻ ô có mép thước, ô "Điểm" như trên bài
            kiểm tra giấy (bằng số + bằng chữ), bên phải là vòng tỉ lệ đúng.

            Hai con số khác nhau về bản chất nên được tách hẳn: điểm đã tính
            theo trọng số của Bộ, còn tỉ lệ đúng là đếm câu. Gộp chung một chỗ
            là mời người đọc nhầm cái này ra cái kia. Không có cúp, không có
            pháo hoa: cúp vàng cho một bài 3,0 điểm là sai giọng.

            Ba nhánh của ô điểm (chờ chấm → chưa công bố → đã công bố) nằm
            trong `ScoreBox`, đúng thứ tự cũ.
          */}
          <section
            aria-labelledby="result-exam-title"
            className="bento-tile-lead paper-grid ruler-edge animate-dash-in mb-6 overflow-hidden px-5 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10"
          >
            <p className="kicker">Kết quả bài làm</p>
            <h1
              id="result-exam-title"
              className="mt-2 font-baloo text-2xl font-bold leading-snug text-slate-800 dark:text-white sm:text-3xl"
            >
              {examTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="sr-only">Thời gian làm bài: </span>
                {getTimeSpent()}
              </span>
              {essayQuestionCount > 0 && (
                <span className="tabular-nums">{essayQuestionCount} câu tự luận</span>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full min-w-0 sm:max-w-md">
                <ScoreBox
                  gradingStatus={attempt?.grading_status}
                  pendingGradingCount={attempt?.pending_grading_count ?? 0}
                  resultReleased={attempt?.result_released === true}
                  score={attempt?.score}
                />
              </div>

              {/* Vòng chỉ vẽ khi đáp án đã công bố. Chưa công bố mà vẫn vẽ tỉ lệ
                  đúng là để lộ kết quả đi vòng qua chính sách của đề. */}
              {attempt?.answer_key_revealed && objectiveQuestions.length > 0 && (
                <div className="shrink-0 self-center text-center">
                  <ProgressRing
                    value={Math.round((objectiveCorrect / objectiveQuestions.length) * 100)}
                    size={112}
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
                  <p className="mt-2 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {objectiveCorrect}/{objectiveQuestions.length} câu khách quan
                  </p>
                </div>
              )}
            </div>

            {hasAiGradedEssay && attempt?.result_released && (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-200">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Điểm này có phần do AI chấm và có thể thay đổi sau khi giáo viên xem lại.</span>
              </div>
            )}
          </section>

          {/* Bản đồ câu: trả lời "mình sai câu nào" trong một lần nhìn, thay vì
              bắt cuộn hết 22 câu rồi tự nhớ. */}
          <div className="bento-tile animate-dash-in-1 mb-8 p-5 sm:p-6">
            <ResultQuestionMap
              questions={questions}
              revealed={attempt?.answer_key_revealed === true}
              onJump={jumpToQuestion}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-baloo text-xl font-bold text-slate-800 dark:text-white sm:text-2xl">
              <BookOpen className="h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
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
                    : 'border-slate-300 bg-[var(--background-card)] text-slate-700 hover:border-teal-500 hover:text-teal-800 dark:border-slate-600 dark:text-slate-300 dark:hover:border-teal-400 dark:hover:text-teal-300'
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
