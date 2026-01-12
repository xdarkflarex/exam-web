'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, User, Clock, CheckCircle, XCircle, Eye, Calendar } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'

interface ExamAttempt {
  id: string
  student_id: string
  status: 'in_progress' | 'submitted'
  score: number | null
  total_questions: number | null
  correct_answers: number | null
  start_time: string
  submit_time: string | null
  student_name: string
  student_email: string
}

interface ExamInfo {
  id: string
  title: string
  subject: string
  duration: number
  is_published: boolean
}

export default function AdminExamDetailPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = createClient()
  
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (examId) {
      Promise.all([fetchExamInfo(), fetchAttempts()])
    }
  }, [examId])

  const fetchExamInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, subject, duration, is_published')
        .eq('id', examId)
        .single()

      if (error) {
        console.error('Fetch exam info error:', error)
        setError('Không thể tải thông tin bài thi')
        return
      }

      setExamInfo(data)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
    }
  }

  const fetchAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
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
          )
        `)
        .eq('exam_id', examId)
        .order('start_time', { ascending: false })

      if (error) {
        console.error('Fetch attempts error:', error)
        setError('Không thể tải danh sách bài làm')
        setLoading(false)
        return
      }

      const formattedAttempts: ExamAttempt[] = (data || []).map((attempt: any) => ({
        id: attempt.id,
        student_id: attempt.student_id,
        status: attempt.status,
        score: attempt.score,
        total_questions: attempt.total_questions,
        correct_answers: attempt.correct_answers,
        start_time: attempt.start_time,
        submit_time: attempt.submit_time,
        student_name: attempt.profiles?.full_name || 'Không rõ',
        student_email: attempt.profiles?.email || ''
      }))

      setAttempts(formattedAttempts)
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

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins} phút`
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400'
    if (score >= 8) return 'text-green-600'
    if (score >= 6.5) return 'text-blue-600'
    if (score >= 5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusBadge = (status: string) => {
    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Đã nộp
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

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Chi tiết bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải chi tiết bài thi...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !examInfo) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Chi tiết bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error || 'Không tìm thấy bài thi'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      <GlobalHeader title="Chi tiết bài thi" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{examInfo.title}</h1>
            <p className="text-slate-600">{examInfo.subject} • {formatDuration(examInfo.duration)}</p>
          </div>
          <button
            onClick={() => router.push('/admin/exams')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ← Quay lại
          </button>
        </div>

        {/* Exam Info Card */}
        <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800">{attempts.length}</div>
              <div className="text-sm text-slate-500">Tổng lượt thi</div>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {attempts.filter(a => a.status === 'submitted').length}
              </div>
              <div className="text-sm text-slate-500">Đã hoàn thành</div>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {attempts.filter(a => a.status === 'in_progress').length}
              </div>
              <div className="text-sm text-slate-500">Đang làm</div>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {new Set(attempts.map(a => a.student_id)).size}
              </div>
              <div className="text-sm text-slate-500">Học sinh</div>
            </div>
          </div>
        </div>

        {/* Attempts List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Danh sách bài làm</h2>
          </div>

          {attempts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Chưa có bài làm nào
              </h3>
              <p className="text-slate-500">
                Các bài làm của học sinh sẽ hiển thị tại đây
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Học sinh
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Trạng thái
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Điểm số
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Thời gian bắt đầu
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Thời gian nộp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {attempts.map((attempt) => (
                      <tr key={attempt.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium text-slate-800">{attempt.student_name}</div>
                              <div className="text-sm text-slate-500">{attempt.student_email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(attempt.status)}
                        </td>
                        <td className="px-6 py-4">
                          {attempt.score !== null ? (
                            <div>
                              <span className={`text-lg font-semibold ${getScoreColor(attempt.score)}`}>
                                {attempt.score.toFixed(1)}
                              </span>
                              <span className="text-sm text-slate-500 ml-1">
                                ({attempt.correct_answers}/{attempt.total_questions})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Chưa có điểm</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Calendar className="w-4 h-4" />
                            {formatDate(attempt.start_time)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {attempt.submit_time ? (
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <Calendar className="w-4 h-4" />
                              {formatDate(attempt.submit_time)}
                            </div>
                          ) : (
                            <span className="text-slate-400">Chưa nộp</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {attempt.status === 'submitted' && (
                            <button
                              onClick={() => router.push(`/admin/attempts/${attempt.id}`)}
                              className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              Xem chi tiết
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4 p-4">
                {attempts.map((attempt) => (
                  <div key={attempt.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{attempt.student_name}</div>
                          <div className="text-sm text-slate-500">{attempt.student_email}</div>
                        </div>
                      </div>
                      {getStatusBadge(attempt.status)}
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Điểm số:</span>
                        {attempt.score !== null ? (
                          <span className={`font-semibold ${getScoreColor(attempt.score)}`}>
                            {attempt.score.toFixed(1)} ({attempt.correct_answers}/{attempt.total_questions})
                          </span>
                        ) : (
                          <span className="text-slate-400">Chưa có điểm</span>
                        )}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Bắt đầu:</span>
                        <span className="text-sm text-slate-600">{formatDate(attempt.start_time)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Nộp bài:</span>
                        <span className="text-sm text-slate-600">
                          {attempt.submit_time ? formatDate(attempt.submit_time) : 'Chưa nộp'}
                        </span>
                      </div>
                    </div>
                    
                    {attempt.status === 'submitted' && (
                      <button
                        onClick={() => router.push(`/admin/attempts/${attempt.id}`)}
                        className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Xem chi tiết
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
