'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  User, Clock, CheckCircle, XCircle, Eye,
  ArrowLeft, Users, Award, Search, RefreshCw, FileText, Sparkles, AlertTriangle
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'

type AttemptFilter = 'all' | 'pending' | 'ai_graded' | 'completed'
type AttemptStatus = 'in_progress' | 'submitted' | 'graded' | 'abandoned'

interface ExamAttempt {
  id: string
  student_id: string
  status: AttemptStatus
  score: number | null
  grading_status: string
  pending_grading_count: number
  /** Số câu tự luận AI đã chấm mà chưa ai kiểm tra lại. */
  ai_graded_count: number
  start_time: string
  submit_time: string | null
  student_name: string
}

interface ExamInfo {
  id: string
  title: string
  subject: string
}

interface ExamScope extends ExamInfo {
  created_by: string | null
  class_id: string | null
}

interface ProfileRelation {
  full_name: string | null
}

export default function ExamResultsPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = useMemo(() => createClient(), [])

  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<AttemptFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [counterWarning, setCounterWarning] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCounterWarning(null)

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Phiên đăng nhập không hợp lệ')
        return
      }

      const { data: actor, error: actorError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (actorError || (actor?.role !== 'teacher' && actor?.role !== 'admin')) {
        setError('Bạn không có quyền xem kết quả đề này')
        return
      }

      // Fetch exam info
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('id, title, subject, created_by, class_id')
        .eq('id', examId)
        .single()

      if (examError) {
        setError('Không tìm thấy đề thi')
        return
      }

      const scopedExam = examData as ExamScope
      let canViewExam = actor.role === 'admin'
      let scopedStudentIds: string[] | null = null

      if (actor.role === 'teacher') {
        const { data: classRows, error: classError } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', user.id)
        if (classError) throw classError

        const teacherClassIds = new Set((classRows || []).map((row) => row.id))
        if (teacherClassIds.size > 0) {
          const { data: studentRows, error: studentError } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'student')
            .in('class_id', Array.from(teacherClassIds))
          if (studentError) throw studentError
          scopedStudentIds = (studentRows || []).map((student) => student.id)
        } else {
          scopedStudentIds = []
        }

        canViewExam = scopedExam.created_by === user.id || Boolean(
          scopedExam.class_id && teacherClassIds.has(scopedExam.class_id)
        )

        if (!canViewExam && teacherClassIds.size > 0) {
          const { data: assignmentRows, error: assignmentError } = await supabase
            .from('exam_assignments')
            .select('class_id, student_id')
            .eq('exam_id', examId)
          if (assignmentError) throw assignmentError

          canViewExam = (assignmentRows || []).some(
            (assignment) =>
              Boolean(assignment.class_id)
              && teacherClassIds.has(assignment.class_id as string)
          )

          const allowedStudentIdSet = new Set(scopedStudentIds)
          canViewExam = canViewExam || (assignmentRows || []).some(
            (assignment) =>
              Boolean(assignment.student_id)
              && allowedStudentIdSet.has(assignment.student_id as string)
          )
        }
      }

      if (!canViewExam) {
        setError('Bạn không có quyền xem kết quả đề này')
        return
      }

      setExamInfo({
        id: scopedExam.id,
        title: scopedExam.title,
        subject: scopedExam.subject,
      })

      if (scopedStudentIds && scopedStudentIds.length === 0) {
        setAttempts([])
        return
      }

      // Fetch attempts for this specific exam
      let attemptsQuery = supabase
        .from('exam_attempts')
        .select(`
          id,
          student_id,
          status,
          score,
          grading_status,
          pending_grading_count,
          start_time,
          submit_time,
          profiles!student_id (
            full_name
          )
        `)
        .eq('exam_id', examId)
        .order('submit_time', { ascending: false, nullsFirst: false })
      if (scopedStudentIds) {
        attemptsQuery = attemptsQuery.in('student_id', scopedStudentIds)
      }
      const { data: attemptsData, error: attemptsError } = await attemptsQuery

      if (attemptsError) {
        console.error('Fetch attempts error:', attemptsError)
        setError('Không thể tải danh sách bài làm')
        return
      }

      const formattedAttempts: ExamAttempt[] = (attemptsData || []).map((attempt) => {
        const profile = attempt.profiles as unknown as ProfileRelation | null
        return {
          id: attempt.id,
          student_id: attempt.student_id,
          status: attempt.status,
          score: attempt.score,
          grading_status: attempt.grading_status || 'not_required',
          pending_grading_count: attempt.pending_grading_count || 0,
          ai_graded_count: 0,
          start_time: attempt.start_time,
          submit_time: attempt.submit_time,
          student_name: profile?.full_name || 'Không rõ',
        }
      })

      // Bài AI đã chấm KHÔNG hiện ra ở `exam_attempts.grading_status`: RPC đặt
      // attempt về `completed` ngay khi không còn câu `pending_review`, kể cả
      // khi các câu đó đang là `ai_graded`. Nếu chỉ đọc cột đó, bài máy chấm
      // rơi vào "Đã hoàn tất" và biến mất khỏi tầm mắt giáo viên — đúng loại
      // bài cần người xem nhất. Phải đếm từ `student_answers`.
      const attemptIds = formattedAttempts.map((attempt) => attempt.id)
      if (attemptIds.length > 0) {
        const { data: aiRows, error: aiError } = await supabase
          .from('student_answers')
          .select('attempt_id')
          .in('attempt_id', attemptIds)
          .eq('grading_status', 'ai_graded')

        if (aiError) {
          // Không chặn cả trang vì một bộ đếm: danh sách bài vẫn dùng được.
          // Nhưng phải nói rõ là bộ đếm đang thiếu, đừng hiện 0 như thật.
          console.error('Fetch ai_graded counts error:', aiError.message)
          setCounterWarning(
            'Không đọc được số câu AI đã chấm. Bộ lọc "AI đã chấm" có thể đang thiếu bài.'
          )
        } else {
          const counts = new Map<string, number>()
          for (const row of aiRows || []) {
            const key = row.attempt_id as string
            counts.set(key, (counts.get(key) ?? 0) + 1)
          }
          for (const attempt of formattedAttempts) {
            attempt.ai_graded_count = counts.get(attempt.id) ?? 0
          }
        }
      }

      setAttempts(formattedAttempts)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }, [examId, supabase])

  useEffect(() => {
    if (!examId) return

    const timeoutId = window.setTimeout(() => {
      void fetchData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [examId, fetchData])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400 dark:text-slate-500'
    if (score >= 8) return 'text-emerald-700 dark:text-emerald-400'
    if (score >= 6.5) return 'text-blue-700 dark:text-blue-400'
    if (score >= 5) return 'text-amber-700 dark:text-amber-400'
    return 'text-red-700 dark:text-red-400'
  }

  const getStatusBadge = (attempt: ExamAttempt) => {
    const { status, grading_status: gradingStatus } = attempt
    const submitted = status === 'submitted' || status === 'graded'
    if (submitted && gradingStatus === 'pending_review') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <Clock className="h-3 w-3" /> Chờ duyệt tự luận
        </span>
      )
    }
    if (submitted && gradingStatus === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <XCircle className="h-3 w-3" /> Cần kiểm tra
        </span>
      )
    }
    // Phải đứng TRƯỚC nhánh 'graded': attempt có câu AI chấm vẫn mang status
    // 'graded', và hiện "Đã chấm" ở đây là nói sai — chưa ai chấm cả.
    if (submitted && attempt.ai_graded_count > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
          <Sparkles className="h-3 w-3" /> AI chấm {attempt.ai_graded_count} câu — chưa ai xem
        </span>
      )
    }
    if (status === 'graded') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <CheckCircle className="w-3 h-3" />
          Đã chấm
        </span>
      )
    }
    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <CheckCircle className="w-3 h-3" />
          Đã nộp
        </span>
      )
    }
    if (status === 'abandoned') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          <XCircle className="w-3 h-3" />
          Đã bỏ
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
        <Clock className="w-3 h-3" />
        Đang làm
      </span>
    )
  }

  // Calculate stats
  const submittedAttempts = attempts.filter(
    a => a.status === 'submitted' || a.status === 'graded'
  )
  // Hai hàng chờ khác nhau, đừng gộp:
  //   pending  — chưa có điểm nào, chờ người chấm.
  //   aiGraded — đã có điểm và học sinh ĐANG THẤY, nhưng chưa ai kiểm tra.
  // Cái thứ hai gấp hơn: một điểm sai ở đó đã ra tới học sinh rồi.
  const pendingReviewCount = submittedAttempts.filter(a => a.grading_status === 'pending_review').length
  const aiGradedAttempts = submittedAttempts.filter(
    a => a.grading_status !== 'pending_review' && a.ai_graded_count > 0
  )
  const completedAttempts = submittedAttempts.filter(
    a => a.grading_status !== 'pending_review'
      && a.grading_status !== 'failed'
      && a.ai_graded_count === 0
  )
  const gradedAttempts = completedAttempts.filter(a => a.score !== null)
  const avgScore = gradedAttempts.length > 0
    ? gradedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / gradedAttempts.length
    : 0
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi-VN')
  const filteredAttempts = attempts.filter((attempt) => {
    const matchesSearch = !normalizedSearch
      || attempt.student_name.toLocaleLowerCase('vi-VN').includes(normalizedSearch)
    const submitted = attempt.status === 'submitted' || attempt.status === 'graded'
    const matchesFilter =
      activeFilter === 'all'
        ? true
        : activeFilter === 'pending'
          ? submitted && attempt.grading_status === 'pending_review'
          : activeFilter === 'ai_graded'
            ? submitted && attempt.grading_status !== 'pending_review' && attempt.ai_graded_count > 0
            : submitted
              && attempt.grading_status !== 'pending_review'
              && attempt.grading_status !== 'failed'
              && attempt.ai_graded_count === 0

    return matchesSearch && matchesFilter
  })

  const filterOptions: Array<{ key: AttemptFilter; label: string; count: number }> = [
    { key: 'all', label: 'Tất cả', count: attempts.length },
    { key: 'pending', label: 'Chờ duyệt', count: pendingReviewCount },
    { key: 'ai_graded', label: 'AI đã chấm, chưa ai xem', count: aiGradedAttempts.length },
    { key: 'completed', label: 'Đã hoàn tất', count: completedAttempts.length },
  ]

  const openAttempt = (attempt: ExamAttempt) => {
    router.push(`/admin/attempts/${attempt.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <AdminHeader title="Kết quả thi" />
        <div className="flex items-center justify-center px-4 py-24">
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-8 py-10 dark:border-slate-700 dark:bg-slate-800"
            role="status"
            aria-live="polite"
          >
            <RefreshCw className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
            <div className="text-center">
              <p className="font-medium text-slate-800 dark:text-slate-100">Đang tải hàng chờ chấm</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Đang lấy kết quả và trạng thái tự luận của đề này.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !examInfo) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <AdminHeader title="Kết quả thi" />
        <div className="flex items-center justify-center px-4 py-24">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-slate-50 p-8 text-center dark:border-red-900/60 dark:bg-slate-800">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              Không thể tải kết quả
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {error || 'Không tìm thấy đề thi'}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void fetchData()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                Thử lại
              </button>
              <button
                type="button"
                onClick={() => router.push(`/admin/exams/${examId}`)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại đề thi
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <AdminHeader 
        title={`Kết quả: ${examInfo.title}`}
        subtitle={examInfo.subject}
      />

      <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push(`/admin/exams/${examId}`)}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại chi tiết đề thi
        </button>

        <section
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5"
          aria-label="Phạm vi dữ liệu"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                Phạm vi đang xem
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{examInfo.title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{examInfo.subject}</p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Ưu tiên các bài có trạng thái <strong>Chờ duyệt tự luận</strong>.
            </p>
          </div>
        </section>

        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
          aria-label="Tổng quan kết quả"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{attempts.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tổng lượt làm bài</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Clock className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{pendingReviewCount}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Chờ duyệt tự luận</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/60 dark:bg-violet-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                <Sparkles className="h-5 w-5 text-violet-700 dark:text-violet-300" />
              </div>
              <div>
                <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">
                  {aiGradedAttempts.length}
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-300">AI đã chấm, chưa ai xem</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <CheckCircle className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                  {completedAttempts.length}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Đã hoàn tất</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                <Award className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {gradedAttempts.length > 0 ? avgScore.toFixed(1) : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Điểm trung bình đã chấm</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          <div className="space-y-4 border-b border-slate-200 p-4 dark:border-slate-700 sm:p-5">
            {counterWarning && (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200"
                role="status"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{counterWarning}</span>
              </div>
            )}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Hàng chờ chấm tự luận</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Hiển thị {filteredAttempts.length}/{attempts.length} lượt làm bài trong đề này.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 sm:self-auto"
                aria-label="Tải lại danh sách bài làm"
              >
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </button>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div
                className="flex max-w-full gap-2 overflow-x-auto pb-1"
                role="group"
                aria-label="Lọc trạng thái bài làm"
              >
                {filterOptions.map((option) => {
                  const active = activeFilter === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setActiveFilter(option.key)}
                      aria-pressed={active}
                      className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                        active
                          ? 'bg-teal-600 text-white'
                          : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {option.label}
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {option.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              <label className="relative block w-full xl:max-w-sm">
                <span className="sr-only">Tìm theo tên học sinh</span>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm theo tên học sinh..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-100 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          {filteredAttempts.length === 0 ? (
            <div className="px-4 py-14 text-center sm:px-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                {attempts.length === 0
                  ? <Users className="h-8 w-8 text-slate-400" />
                  : <FileText className="h-8 w-8 text-slate-400" />}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
                {attempts.length === 0
                  ? 'Chưa có bài làm nào'
                  : activeFilter === 'pending' && !normalizedSearch
                    ? 'Không còn bài chờ duyệt'
                    : 'Không tìm thấy bài làm phù hợp'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {attempts.length === 0
                  ? 'Các lượt làm bài của học sinh sẽ hiển thị tại đây.'
                  : activeFilter === 'pending' && !normalizedSearch
                    ? 'Tất cả bài tự luận đã được xử lý hoặc học sinh chưa nộp bài.'
                    : 'Hãy thử đổi trạng thái hoặc từ khóa tìm kiếm.'}
              </p>
              {attempts.length > 0 && (activeFilter !== 'all' || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('all')
                    setSearchTerm('')
                  }}
                  className="mt-5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-4 lg:hidden">
                {filteredAttempts.map((attempt) => (
                  <article
                    key={attempt.id}
                    className="rounded-xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                          <User className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate font-semibold text-slate-900 dark:text-white">
                            {attempt.student_name}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {attempt.submit_time ? `Nộp ${formatDate(attempt.submit_time)}` : 'Chưa nộp bài'}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(attempt)}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-200/70 p-3 dark:bg-slate-800">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">Câu chờ duyệt</dt>
                        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                          {attempt.pending_grading_count}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-200/70 p-3 dark:bg-slate-800">
                        <dt className="text-xs text-slate-500 dark:text-slate-400">Điểm</dt>
                        <dd className={`mt-1 font-semibold ${getScoreColor(attempt.score)}`}>
                          {attempt.grading_status === 'pending_review'
                            ? 'Chờ chấm'
                            : attempt.score !== null
                              ? attempt.score.toFixed(1)
                              : '—'}
                        </dd>
                      </div>
                    </dl>

                    {attempt.status !== 'in_progress' ? (
                      <button
                        type="button"
                        onClick={() => openAttempt(attempt)}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                      >
                        <Eye className="h-4 w-4" />
                        {attempt.grading_status === 'pending_review' ? 'Mở chấm' : 'Xem chi tiết'}
                      </button>
                    ) : (
                      <p className="mt-4 rounded-lg bg-slate-200 px-3 py-2 text-center text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Học sinh chưa nộp bài.
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-100 dark:bg-slate-900">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Học sinh</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trạng thái</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Câu chờ</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Điểm</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Thời gian nộp</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Thao tác</th>
                  </tr>
                </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredAttempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-100/80 dark:hover:bg-slate-700/40">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
                            <User className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                          </div>
                          <p className="font-medium text-slate-900 dark:text-white">{attempt.student_name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {getStatusBadge(attempt)}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {attempt.pending_grading_count}
                      </td>
                      <td className="px-5 py-4">
                        {attempt.grading_status === 'pending_review' ? (
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Chờ chấm</span>
                        ) : attempt.score !== null ? (
                          <span className={`text-lg font-semibold ${getScoreColor(attempt.score)}`}>
                            {attempt.score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {attempt.submit_time ? (
                          <p className="text-sm text-slate-600 dark:text-slate-300">{formatDate(attempt.submit_time)}</p>
                        ) : (
                          <span className="text-sm text-slate-400">Chưa nộp</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {attempt.status !== 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => openAttempt(attempt)}
                            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                          >
                            <Eye className="h-4 w-4" />
                            {attempt.grading_status === 'pending_review' ? 'Mở chấm' : 'Chi tiết'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
