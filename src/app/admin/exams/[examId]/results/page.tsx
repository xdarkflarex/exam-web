'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  User, Clock, CheckCircle, XCircle, Eye,
  ArrowLeft, Users, FileText, Award
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'

interface ExamAttempt {
  id: string
  student_id: string
  status: 'in_progress' | 'submitted'
  score: number | null
  total_questions: number | null
  correct_answers: number | null
  grading_status: string
  pending_grading_count: number
  start_time: string
  submit_time: string | null
  student_name: string
  student_email: string
}

interface ExamInfo {
  id: string
  title: string
  subject: string
}

interface ProfileRelation {
  full_name: string | null
  email: string | null
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

  const fetchData = useCallback(async () => {
    try {
      // Fetch exam info
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('id, title, subject')
        .eq('id', examId)
        .single()

      if (examError) {
        setError('Không tìm thấy đề thi')
        setLoading(false)
        return
      }

      setExamInfo(examData)

      // Fetch attempts for this specific exam
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          student_id,
          status,
          score,
          total_questions,
          correct_answers,
          grading_status,
          pending_grading_count,
          start_time,
          submit_time,
          profiles!student_id (
            full_name,
            email
          )
        `)
        .eq('exam_id', examId)
        .order('submit_time', { ascending: false, nullsFirst: false })

      if (attemptsError) {
        console.error('Fetch attempts error:', attemptsError)
      }

      const formattedAttempts: ExamAttempt[] = (attemptsData || []).map((attempt) => {
        const profile = attempt.profiles as unknown as ProfileRelation | null
        return {
          id: attempt.id,
          student_id: attempt.student_id,
          status: attempt.status,
          score: attempt.score,
          total_questions: attempt.total_questions,
          correct_answers: attempt.correct_answers,
          grading_status: attempt.grading_status || 'not_required',
          pending_grading_count: attempt.pending_grading_count || 0,
          start_time: attempt.start_time,
          submit_time: attempt.submit_time,
          student_name: profile?.full_name || 'Không rõ',
          student_email: profile?.email || ''
        }
      })

      setAttempts(formattedAttempts)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
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
    if (score === null) return 'text-slate-400'
    if (score >= 8) return 'text-green-600'
    if (score >= 6.5) return 'text-blue-600'
    if (score >= 5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusBadge = (status: string, gradingStatus: string) => {
    if (status === 'submitted' && gradingStatus === 'pending_review') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          <Clock className="h-3 w-3" /> Chờ duyệt tự luận
        </span>
      )
    }
    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Đã chấm
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <Clock className="w-3 h-3" />
        Đang làm
      </span>
    )
  }

  // Calculate stats
  const submittedAttempts = attempts.filter(a => a.status === 'submitted')
  const gradedAttempts = submittedAttempts.filter(a => a.grading_status === 'completed' && a.score !== null)
  const pendingReviewCount = submittedAttempts.filter(a => a.grading_status === 'pending_review').length
  const avgScore = gradedAttempts.length > 0
    ? gradedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / gradedAttempts.length
    : 0
  const passCount = gradedAttempts.filter(a => (a.score || 0) >= 5).length

  if (loading) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Kết quả thi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải kết quả...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !examInfo) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Kết quả thi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl border border-slate-100 p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error || 'Không tìm thấy đề thi'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AdminHeader 
        title={`Kết quả: ${examInfo.title}`}
        subtitle={examInfo.subject}
      />

      <div className="p-8">
        {/* Back button */}
        <button
          onClick={() => router.push(`/admin/exams/${examId}`)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại chi tiết đề thi
        </button>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{attempts.length}</p>
                <p className="text-xs text-slate-500">Lượt thi</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{pendingReviewCount}</p>
                <p className="text-xs text-slate-500">Chờ duyệt tự luận</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{avgScore.toFixed(1)}</p>
                <p className="text-xs text-slate-500">Điểm TB</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {gradedAttempts.length > 0 ? Math.round(passCount / gradedAttempts.length * 100) : 0}%
                </p>
                <p className="text-xs text-slate-500">Tỷ lệ đạt</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-2xl border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Danh sách bài làm</h3>
          </div>

          {attempts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Chưa có bài làm nào
              </h3>
              <p className="text-slate-500">
                Các bài làm của học sinh sẽ hiển thị tại đây
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Học sinh</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Điểm số</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Đúng/Tổng</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thời gian nộp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-teal-50 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-teal-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{attempt.student_name}</p>
                            <p className="text-sm text-slate-500">{attempt.student_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(attempt.status, attempt.grading_status)}
                      </td>
                      <td className="px-6 py-4">
                        {attempt.grading_status === 'pending_review' ? (
                          <span className="text-sm font-medium text-amber-600">Chờ chấm</span>
                        ) : attempt.score !== null ? (
                          <span className={`text-lg font-semibold ${getScoreColor(attempt.score)}`}>
                            {attempt.score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {attempt.correct_answers !== null && attempt.total_questions !== null ? (
                          <span className="text-sm text-slate-600">
                            {attempt.correct_answers}/{attempt.total_questions}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {attempt.submit_time ? (
                          <p className="text-sm text-slate-600">{formatDate(attempt.submit_time)}</p>
                        ) : (
                          <span className="text-slate-400">Chưa nộp</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {attempt.status === 'submitted' && (
                          <button
                            onClick={() => router.push(`/admin/attempts/${attempt.id}`)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            {attempt.grading_status === 'pending_review' ? 'Duyệt chấm' : 'Chi tiết'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
