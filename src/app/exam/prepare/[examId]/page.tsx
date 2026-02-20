'use client'

import { useState, useEffect } from 'react'
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
  Timer,
  RotateCcw
} from 'lucide-react'
import { useLoading } from '@/contexts/LoadingContext'

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

export default function ExamPreparePage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()

  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [existingAttempt, setExistingAttempt] = useState<ExistingAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [bestScore, setBestScore] = useState<number | null>(null)

  useEffect(() => {
    fetchExamInfo()
  }, [examId])

  const fetchExamInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch exam info
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('id, title, description, subject, duration')
        .eq('id', examId)
        .eq('is_published', true)
        .single()

      if (examError || !examData) {
        router.push('/student/exams')
        return
      }

      // Count questions
      const { count: questionCount } = await supabase
        .from('exam_questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', examId)

      setExam({
        ...examData,
        question_count: questionCount || 0
      })

      // Check for existing in-progress attempt
      const { data: inProgressAttempt } = await supabase
        .from('exam_attempts')
        .select('id, start_time')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle()

      if (inProgressAttempt) {
        const startTime = new Date(inProgressAttempt.start_time)
        const now = new Date()
        const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000)
        const totalSeconds = examData.duration * 60
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds)

        setExistingAttempt({
          id: inProgressAttempt.id,
          start_time: inProgressAttempt.start_time,
          remaining_seconds: remainingSeconds
        })
      }

      // Fetch attempt history
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('score, status')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .eq('status', 'submitted')

      if (attempts && attempts.length > 0) {
        setAttemptCount(attempts.length)
        const scores = attempts.map(a => a.score || 0)
        setBestScore(Math.max(...scores))
      }

    } catch (error) {
      console.error('Error fetching exam info:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartExam = async () => {
    if (!exam) return
    setStarting(true)
    showLoading('Đang chuẩn bị bài thi...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get next attempt number
      const { data: maxAttempt } = await supabase
        .from('exam_attempts')
        .select('attempt_number')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextAttemptNumber = maxAttempt ? maxAttempt.attempt_number + 1 : 1

      // Create new attempt
      const { data: newAttempt, error } = await supabase
        .from('exam_attempts')
        .insert({
          exam_id: examId,
          student_id: user.id,
          attempt_number: nextAttemptNumber,
          start_time: new Date().toISOString(),
          status: 'in_progress'
        })
        .select('id')
        .single()

      if (error) {
        console.error('Create attempt error:', error)
        hideLoading()
        setStarting(false)
        return
      }

      router.push(`/exam/${newAttempt.id}`)
    } catch (error) {
      console.error('Error starting exam:', error)
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
    
    showLoading('Đang hủy bài thi...')
    
    try {
      // Submit with current answers (score 0 if no answers)
      const { error } = await supabase
        .from('exam_attempts')
        .update({
          status: 'submitted',
          submit_time: new Date().toISOString(),
          total_questions: exam?.question_count || 0,
          correct_answers: 0,
          score: 0
        })
        .eq('id', existingAttempt.id)

      if (error) {
        console.error('Cancel exam error:', error)
        hideLoading()
        return
      }

      hideLoading()
      router.push(`/result/${existingAttempt.id}`)
    } catch (error) {
      console.error('Error canceling exam:', error)
      hideLoading()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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
                  {exam.duration} phút
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
                  </span>
                </div>
                {bestScore !== null && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Điểm cao nhất: <span className="font-bold">{bestScore.toFixed(1)}</span>/10
                  </p>
                )}
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
                  Thời gian còn lại: <span className="font-bold">{formatTime(existingAttempt.remaining_seconds)}</span>
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
                    onClick={handleCancelExam}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium btn-action"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Hủy và xem kết quả
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
                <li className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5">•</span>
                  Thời gian sẽ bắt đầu tính ngay khi bạn bấm "Bắt đầu thi"
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-500 mt-0.5">•</span>
                  Bài thi sẽ tự động nộp khi hết thời gian
                </li>
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
                  disabled={starting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-teal-400 text-white rounded-xl font-semibold btn-action"
                >
                  {starting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang chuẩn bị...
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
    </div>
  )
}
