'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  Play, 
  Clock, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Timer
} from 'lucide-react'
import { useLoading } from '@/contexts/LoadingContext'
import ConfirmModal from '@/components/ConfirmModal'

interface ExamInfo {
  id: string
  title: string
  description: string | null
  subject: string
  duration: number
  question_count: number
}

interface ExistingAttempt {
  id: string
  start_time: string
  remaining_seconds: number
}

interface ExamPreparationPayload {
  exam: ExamInfo
  existing_attempt: { id: string; start_time: string } | null
  attempt_count: number
  best_score: number | null
  // Bổ sung bởi migration 20260803; có thể vắng mặt nếu database chưa áp.
  max_attempts?: number | null
  attempts_remaining?: number | null
}

/**
 * `start_exam_attempt` raise exception có tên mã ở đầu message.
 * Ánh xạ sang tiếng Việt để học sinh biết vì sao không vào thi được,
 * thay vì spinner tắt im lặng và chỉ có lỗi 403 trong console.
 */
const START_ERROR_MESSAGES: Record<string, string> = {
  MAX_ATTEMPTS_REACHED:
    'Bạn đã dùng hết số lượt thi cho đề này. Hãy liên hệ giáo viên nếu cần mở thêm lượt.',
  FEATURE_NOT_AVAILABLE:
    'Tài khoản của bạn chưa được mở tính năng này. Hãy liên hệ giáo viên.',
  EXAM_NOT_AVAILABLE: 'Đề thi này hiện không khả dụng.',
  EXAM_NOT_STARTED: 'Đề thi chưa tới giờ mở. Hãy quay lại sau.',
  EXAM_ENDED: 'Đề thi đã đóng, bạn không thể bắt đầu lượt mới.',
  EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS: 'Đề thi này không được giao cho lớp của bạn.',
  STUDENT_ROLE_REQUIRED: 'Chỉ tài khoản học sinh mới có thể làm bài thi.',
  UNSUPPORTED_EXAM_MODE: 'Đề thi này không hỗ trợ chế độ làm bài hiện tại.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
}

function describeStartError(error: { message?: string } | null): string {
  const raw = error?.message ?? ''

  for (const [code, message] of Object.entries(START_ERROR_MESSAGES)) {
    if (raw.includes(code)) return message
  }

  return 'Không thể bắt đầu bài thi. Vui lòng thử lại hoặc liên hệ giáo viên.'
}

function readAttemptId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('attempt_id' in value)) {
    return null
  }

  const attemptId = (value as { attempt_id?: unknown }).attempt_id
  return typeof attemptId === 'string' && attemptId.length > 0 ? attemptId : null
}

export default function ExamPreparePage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = useMemo(() => createClient(), [])
  const { showLoading, hideLoading } = useLoading()

  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [existingAttempt, setExistingAttempt] = useState<ExistingAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  // Hủy bài dở là hành động KHÔNG hoàn tác được: nó nộp bài với 0 đáp án và
  // chốt điểm. Phải hỏi lại trước khi gọi RPC (DESIGN_SYSTEM: "destructive
  // action cần confirm").
  const [showCancelModal, setShowCancelModal] = useState(false)

  const fetchExamInfo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: preparationData, error: preparationError } = await supabase
        .rpc('get_exam_preparation', { p_exam_id: examId })
      const preparation = preparationData as unknown as ExamPreparationPayload | null

      if (preparationError || !preparation?.exam) {
        router.push('/student/exams')
        return
      }

      setExam(preparation.exam)
      setAttemptCount(preparation.attempt_count || 0)
      setBestScore(typeof preparation.best_score === 'number' ? preparation.best_score : null)
      setMaxAttempts(
        typeof preparation.max_attempts === 'number' ? preparation.max_attempts : null
      )
      setAttemptsRemaining(
        typeof preparation.attempts_remaining === 'number'
          ? preparation.attempts_remaining
          : null
      )

      if (preparation.existing_attempt) {
        const startTime = new Date(preparation.existing_attempt.start_time)
        const now = new Date()
        const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000)
        // duration = 0 → không giới hạn thời gian
        const totalSeconds = preparation.exam.duration * 60
        const remainingSeconds = preparation.exam.duration > 0
          ? Math.max(0, totalSeconds - elapsedSeconds)
          : -1

        setExistingAttempt({
          id: preparation.existing_attempt.id,
          start_time: preparation.existing_attempt.start_time,
          remaining_seconds: remainingSeconds
        })
      }

    } catch (error) {
      console.error('Error fetching exam info:', error)
    } finally {
      setLoading(false)
    }
  }, [examId, router, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchExamInfo()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchExamInfo])

  const handleStartExam = async () => {
    if (!exam) return
    setStarting(true)
    setStartError(null)
    showLoading('Đang chuẩn bị bài thi...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: attemptResult, error } = await supabase.rpc('start_exam_attempt', {
        p_exam_id: examId,
      })
      const startedAttemptId = readAttemptId(attemptResult)

      if (error || !startedAttemptId) {
        console.error('Create attempt error:', error)
        setStartError(describeStartError(error))
        hideLoading()
        setStarting(false)
        // Đồng bộ lại số lượt để UI phản ánh đúng trạng thái server.
        void fetchExamInfo()
        return
      }

      router.push(`/exam/${startedAttemptId}`)
    } catch (error) {
      console.error('Error starting exam:', error)
      setStartError('Không thể bắt đầu bài thi. Vui lòng kiểm tra kết nối và thử lại.')
      hideLoading()
      setStarting(false)
    }
  }

  const handleContinueExam = () => {
    if (existingAttempt) {
      router.push(`/exam/${existingAttempt.id}`)
    }
  }

  const handleCancelExam = async () => {
    if (!existingAttempt) return

    setShowCancelModal(false)
    setStartError(null)
    showLoading('Đang nộp bài thi...')

    try {
      // Empty submission is still finalized by the trusted database RPC.
      const { error } = await supabase.rpc('submit_exam_attempt', {
        p_attempt_id: existingAttempt.id,
        p_answers: [],
      })

      if (error) {
        console.error('Cancel exam error:', error)
        hideLoading()
        // Trước đây chỉ log ra console: spinner tắt và trang không đổi gì, nên
        // học sinh tưởng đã nộp xong trong khi bài vẫn đang dở. Phải nói ra.
        setStartError('Không nộp được bài. Bài thi của bạn vẫn đang dở dang — kiểm tra kết nối rồi thử lại.')
        return
      }

      hideLoading()
      router.push(`/result/${existingAttempt.id}`)
    } catch (error) {
      console.error('Error canceling exam:', error)
      hideLoading()
      setStartError('Lỗi kết nối. Bài thi của bạn vẫn đang dở dang — thử lại sau.')
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // `attempts_remaining` chỉ có khi database đã áp migration 20260803.
  // Nếu vắng mặt, giữ nguyên hành vi cũ: cho bấm và để server quyết định.
  // max_attempts <= 0 nghĩa là không giới hạn.
  const outOfAttempts =
    attemptsRemaining !== null &&
    attemptsRemaining <= 0 &&
    maxAttempts !== null &&
    maxAttempts > 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải thông tin đề thi...</p>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Không tìm thấy đề thi</p>
          <button
            onClick={() => router.push('/student/exams')}
            className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push('/student/exams')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Quay lại danh sách đề</span>
        </button>

        {/* Main Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <span className="text-sm opacity-80">{exam.subject}</span>
                <h1 className="text-xl font-bold">{exam.title}</h1>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Description */}
            {exam.description && (
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {exam.description}
              </p>
            )}

            {/* Exam Info Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6 animate-list-stagger">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Thời gian</span>
                </div>
                <p className="text-xl font-bold text-slate-800 dark:text-white">
                  {exam.duration > 0 ? `${exam.duration} phút` : 'Không giới hạn'}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                  <BookOpen className="w-4 h-4" />
                  <span className="text-sm">Số câu hỏi</span>
                </div>
                <p className="text-xl font-bold text-slate-800 dark:text-white">
                  {exam.question_count} câu
                </p>
              </div>
            </div>

            {/* Attempt History */}
            {attemptCount > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-800 dark:text-green-300">
                    Đã hoàn thành {attemptCount} lần
                    {maxAttempts !== null && maxAttempts > 0 ? ` / ${maxAttempts} lượt` : ''}
                  </span>
                </div>
                {bestScore !== null && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Điểm cao nhất: <span className="font-bold">{bestScore.toFixed(1)}</span>/10
                  </p>
                )}
              </div>
            )}

            {/* Hết lượt thi */}
            {outOfAttempts && !existingAttempt && (
              <div className="bg-slate-100 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Bạn không còn lượt thi
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Đề này giới hạn {maxAttempts} lượt và bạn đã dùng hết. Hãy liên hệ giáo
                  viên nếu cần mở thêm lượt.
                </p>
              </div>
            )}

            {/* Lỗi khi bắt đầu thi */}
            {startError && (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{startError}</p>
                </div>
              </div>
            )}

            {/* Existing Attempt Warning */}
            {existingAttempt && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium text-amber-800 dark:text-amber-300">
                    Bạn đang có bài thi dở dang
                  </span>
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
                  {existingAttempt.remaining_seconds < 0
                    ? 'Bạn có thể tiếp tục làm bất cứ lúc nào.'
                    : <>Thời gian còn lại: <span className="font-bold">{formatTime(existingAttempt.remaining_seconds)}</span></>}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleContinueExam}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium btn-action"
                  >
                    <Play className="w-4 h-4" />
                    Tiếp tục thi
                  </button>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium btn-action"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Nộp bài dở dang
                  </button>
                </div>
              </div>
            )}

            {/* Rules */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-slate-800 dark:text-white mb-3">
                📋 Lưu ý trước khi thi
              </h3>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400 animate-list-stagger">
                <li className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5">•</span>
                  Đảm bảo kết nối internet ổn định trong suốt bài thi
                </li>
                {exam.duration > 0 ? (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="text-teal-500 mt-0.5">•</span>
                      Thời gian sẽ bắt đầu tính ngay khi bạn bấm “Bắt đầu thi”
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-teal-500 mt-0.5">•</span>
                      Bài thi sẽ tự động nộp khi hết thời gian
                    </li>
                  </>
                ) : (
                  <li className="flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5">•</span>
                    Không giới hạn thời gian — bạn làm thoải mái và nộp khi hoàn thành
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5">•</span>
                  Bạn có thể quay lại tiếp tục nếu thoát giữa chừng (thời gian vẫn tiếp tục chạy)
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            {!existingAttempt && (
              <div className="flex gap-4">
                <button
                  onClick={() => router.push('/student/exams')}
                  className="flex-1 px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleStartExam}
                  disabled={starting || outOfAttempts}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-500 dark:disabled:text-slate-400 text-white rounded-xl font-semibold btn-action"
                >
                  {starting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang chuẩn bị...
                    </>
                  ) : outOfAttempts ? (
                    <>
                      <AlertTriangle className="w-5 h-5" />
                      Hết lượt thi
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Bắt đầu thi
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Xác nhận nộp bài dở dang. Nói rõ hậu quả: bài được chốt điểm ngay với
          những gì đã làm, và không mở lại được. */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelExam}
        title="Nộp bài dở dang?"
        message="Bài thi sẽ được nộp và chấm ngay với phần bạn đã làm. Các câu chưa trả lời tính 0 điểm và bạn không mở lại được lượt thi này."
        confirmText="Nộp và xem kết quả"
        cancelText="Quay lại"
        type="danger"
      />
    </div>
  )
}
