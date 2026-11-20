'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  Play,
  Clock,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Timer,
  ClipboardList,
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

  /*
    Nền trang KHÔNG đặt bằng utility: `globals.css` đã có
    `html, body { background-color: var(--background) }` (DESIGN_TODO.md mục 0,
    bất biến 2). Bản trước phủ `bg-slate-50` rồi `bg-gradient-to-br` lên trên —
    một dải màu cho cả trang, tức tiêu luôn suất gradient duy nhất của trang vào
    chỗ không phải hành động.
  */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center" role="status" aria-live="polite">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải thông tin đề thi...</p>
        </div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bento-tile-lead paper-grid ruler-edge w-full max-w-md px-6 pb-8 pt-10 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" aria-hidden="true" />
          <p className="font-baloo text-xl font-bold text-slate-800 dark:text-white">Không tìm thấy đề thi</p>
          <button
            onClick={() => router.push('/student/exams')}
            className="btn-action mt-5 rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  /*
    Nút "Bắt đầu thi" có HAI hình, chọn bằng điều kiện chứ không bằng biến thể
    `disabled:`. Trong dark mode, khối sửa tương phản của `globals.css` ép chữ
    của cặp `dark:bg-teal-500` + `text-white` sang teal-950 bằng một quy tắc
    ngoài `@layer` — nó thắng cả `dark:disabled:text-*`, nên nút "Hết lượt thi"
    xám sẽ mang chữ teal-950 gần như vô hình. Hết lượt thì dùng hẳn bộ màu xám.
  */
  const startButtonClass = outOfAttempts
    ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
    : 'btn-action bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:cursor-wait disabled:opacity-80'

  /* Ô lượt thi: chỉ vẽ khi đề có giới hạn lượt và số đó đủ nhỏ để đếm bằng mắt.
     Đề không giới hạn (`max_attempts <= 0`) thì không có gì để đếm. */
  const attemptSlots =
    maxAttempts !== null && maxAttempts > 0 && maxAttempts <= 10 ? maxAttempts : 0

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        {/* Back Button */}
        <button
          onClick={() => router.push('/student/exams')}
          className="mb-5 inline-flex items-center gap-2 rounded-lg text-slate-600 transition-colors hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:text-teal-300"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span>Quay lại danh sách đề</span>
        </button>

        {/*
          BẢNG PHÒNG THI. Trước giờ thi, giám thị ghi lên bảng môn thi, thời
          gian làm bài và số câu — ba thứ học sinh cần biết trước khi bấm bắt
          đầu. Trang này dựng đúng tấm bảng đó bằng `.board` (cùng lớp với hero
          trang chủ), thay cho dải gradient teal → emerald có chữ trắng chỉ đạt
          ~2,4:1 ở đầu sáng.

          Chỉ hiện dữ liệu `get_exam_preparation` trả về; không bịa cấu trúc ba
          phần hay số trang vì payload không có những thứ đó.
        */}
        <section
          aria-labelledby="exam-title"
          className="board board-ledge ruler-edge animate-dash-in overflow-hidden rounded-[1.75rem] px-5 pb-11 pt-9 sm:rounded-[2rem] sm:px-9 sm:pb-12 sm:pt-11"
        >
          <span aria-hidden="true" className="glyph-mark -bottom-2 right-3 text-[7.5rem] sm:right-8 sm:text-[10rem]">
            ∫
          </span>
          <div className="relative">
            <p className="kicker">Phòng chờ thi</p>
            <h1 id="exam-title" className="mt-2 font-baloo text-3xl font-bold leading-tight sm:text-4xl">
              {exam.title}
            </h1>
            <svg
              aria-hidden="true"
              viewBox="0 0 300 12"
              preserveAspectRatio="none"
              className="mt-2 h-3 w-40 sm:w-60"
            >
              <path
                className="chalk-stroke"
                pathLength={100}
                vectorEffect="non-scaling-stroke"
                d="M4 8C52 2 104 11 152 6s96-3 144 1"
              />
            </svg>
            {exam.description && (
              <p className="chalk-dim mt-3 max-w-prose">{exam.description}</p>
            )}

            <dl className="mt-7 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-dashed border-white/25 pt-5 sm:grid-cols-3">
              <div>
                <dt className="chalk-dim flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Môn thi
                </dt>
                <dd className="mt-1 font-baloo text-2xl font-bold">{exam.subject}</dd>
              </div>
              <div>
                <dt className="chalk-dim flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Thời gian
                </dt>
                <dd className="chalk-yellow mt-1 font-baloo text-2xl font-bold">
                  {exam.duration > 0 ? `${exam.duration} phút` : 'Không giới hạn'}
                </dd>
              </div>
              <div>
                <dt className="chalk-dim flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                  Số câu hỏi
                </dt>
                <dd className="mt-1 font-baloo text-2xl font-bold">{exam.question_count} câu</dd>
              </div>
            </dl>
          </div>
          {/* Hai viên phấn trên khay — thuần trang trí. */}
          <span aria-hidden="true" className="absolute bottom-[9px] left-[12%] z-10 h-[5px] w-9 rounded-full bg-slate-100 shadow-sm shadow-black/40" />
          <span aria-hidden="true" className="absolute bottom-[9px] left-[calc(12%+2.75rem)] z-10 h-[5px] w-6 rounded-full bg-amber-200 shadow-sm shadow-black/40" />
        </section>

        {/* Phiếu chuẩn bị: lượt đã làm, cảnh báo, lưu ý và nút bắt đầu. */}
        <div className="bento-tile-lead animate-dash-in-1 mt-5 space-y-5 p-5 sm:p-7">
            {/* Attempt History */}
            {attemptCount > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      <span className="font-medium text-emerald-900 dark:text-emerald-200">
                        Đã hoàn thành {attemptCount} lần
                        {maxAttempts !== null && maxAttempts > 0 ? ` / ${maxAttempts} lượt` : ''}
                      </span>
                    </div>
                    {/* Mỗi lượt một ô: ô đặc là lượt đã dùng, ô viền đứt là lượt
                        còn lại. Có chữ "Đã hoàn thành…" ngay trên nên ô chỉ là
                        hình minh hoạ — `aria-hidden`. */}
                    {attemptSlots > 0 && (
                      <div aria-hidden="true" className="mt-2 flex flex-wrap gap-1.5 pl-7">
                        {Array.from({ length: attemptSlots }, (_, index) => (
                          <span
                            key={index}
                            className={`h-3 w-6 rounded-full ${
                              index < attemptCount
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'border border-dashed border-emerald-500/70 dark:border-emerald-400/60'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {bestScore !== null && (
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      Điểm cao nhất:{' '}
                      <span className="font-baloo text-2xl font-bold tabular-nums">{bestScore.toFixed(1)}</span>/10
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Hết lượt thi */}
            {outOfAttempts && !existingAttempt && (
              <div className="rounded-2xl border border-slate-300 bg-slate-100/80 p-4 dark:border-slate-600 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
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
                className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-red-700 dark:text-red-300">{startError}</p>
                </div>
              </div>
            )}

            {/* Existing Attempt Warning */}
            {existingAttempt && (
              <div
                className="bento-rail rounded-2xl border border-amber-200 bg-amber-50/80 py-4 pl-6 pr-4 dark:border-amber-800 dark:bg-amber-950/30"
                style={{ '--rail': '#f59e0b' } as React.CSSProperties}
              >
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    <span className="font-medium text-amber-900 dark:text-amber-200">
                      Bạn đang có bài thi dở dang
                    </span>
                  </div>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {existingAttempt.remaining_seconds < 0
                      ? 'Bạn có thể tiếp tục làm bất cứ lúc nào.'
                      : <>Thời gian còn lại: <span className="font-baloo text-2xl font-bold tabular-nums">{formatTime(existingAttempt.remaining_seconds)}</span></>}
                  </p>
                </div>
                {/* "Tiếp tục" là việc nên làm nên là nút đặc; "Nộp bài dở dang"
                    không hoàn tác được nên là nút viền — vẫn đỏ, vẫn hỏi lại
                    bằng hộp xác nhận, chỉ không còn to ngang nút chính. Chữ
                    trắng trên red-500 cũ chỉ đạt 3,9:1. */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleContinueExam}
                    className="btn-action flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-400"
                  >
                    <Play className="w-4 h-4" aria-hidden="true" />
                    Tiếp tục thi
                  </button>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 bg-[var(--background-raised)] px-4 py-3 font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-slate-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Nộp bài dở dang
                  </button>
                </div>
              </div>
            )}

            {/*
              Lưu ý trước khi thi — đánh số như quy chế phòng thi, thay cho emoji
              📋 và dấu chấm teal. Nội dung từng dòng giữ nguyên, kể cả nhánh
              theo `duration` (đề không giới hạn thời gian có lưu ý khác).
            */}
            <section aria-labelledby="exam-rules">
              <h2 id="exam-rules" className="kicker mb-3">
                Lưu ý trước khi thi
              </h2>
              <ol className="animate-list-stagger space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {[
                  'Đảm bảo kết nối internet ổn định trong suốt bài thi',
                  ...(exam.duration > 0
                    ? [
                        'Thời gian sẽ bắt đầu tính ngay khi bạn bấm “Bắt đầu thi”',
                        'Bài thi sẽ tự động nộp khi hết thời gian',
                      ]
                    : ['Không giới hạn thời gian — bạn làm thoải mái và nộp khi hoàn thành']),
                  'Bạn có thể quay lại tiếp tục nếu thoát giữa chừng (thời gian vẫn tiếp tục chạy)',
                ].map((rule, index) => (
                  <li key={rule} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal-600/60 font-baloo text-xs font-bold text-teal-700 dark:border-teal-400/60 dark:text-teal-300"
                    >
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{rule}</span>
                  </li>
                ))}
              </ol>
            </section>

            {/* Action Buttons */}
            {!existingAttempt && (
              <div className="flex flex-col-reverse gap-3 border-t border-dashed border-slate-300 pt-5 dark:border-slate-600 sm:flex-row sm:gap-4">
                <button
                  onClick={() => router.push('/student/exams')}
                  className="flex-1 rounded-xl border border-slate-300 bg-[var(--background-raised)] px-6 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleStartExam}
                  disabled={starting || outOfAttempts}
                  className={`flex flex-[1.4] items-center justify-center gap-2 rounded-xl px-6 py-3 font-baloo text-lg font-semibold ${startButtonClass}`}
                >
                  {starting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      Đang chuẩn bị...
                    </>
                  ) : outOfAttempts ? (
                    <>
                      <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                      Hết lượt thi
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" aria-hidden="true" />
                      Bắt đầu thi
                    </>
                  )}
                </button>
              </div>
            )}
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
