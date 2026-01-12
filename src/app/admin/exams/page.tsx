'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Clock, Eye, Users, CheckCircle, XCircle } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'

interface Exam {
  id: string
  title: string
  subject: string
  duration: number
  is_published: boolean
  created_at: string
  attempt_count?: number
}

export default function AdminExamsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    try {
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          subject,
          duration,
          is_published,
          created_at
        `)
        .order('created_at', { ascending: false })

      if (examsError) {
        console.error('Fetch exams error:', examsError)
        setError('Không thể tải danh sách bài thi')
        setLoading(false)
        return
      }

      // Fetch attempt counts for each exam
      const examsWithCounts = await Promise.all(
        (examsData || []).map(async (exam) => {
          const { count } = await supabase
            .from('exam_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id)

          return {
            ...exam,
            attempt_count: count || 0
          }
        })
      )

      setExams(examsWithCounts)
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
      year: 'numeric'
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

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Quản lý bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải danh sách bài thi...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Quản lý bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      <GlobalHeader title="Quản lý bài thi" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Danh sách bài thi</h1>
            <p className="text-slate-600">{exams.length} bài thi</p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ← Quay lại
          </button>
        </div>

        {exams.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Chưa có bài thi nào
            </h3>
            <p className="text-slate-500">
              Các bài thi sẽ hiển thị tại đây khi có dữ liệu
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table */}
            <div className="hidden lg:block bg-white rounded-2xl shadow-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Bài thi
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Môn học
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Thời gian
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Trạng thái
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Lượt thi
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Ngày tạo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {exams.map((exam) => (
                    <tr key={exam.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{exam.title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">{exam.subject}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          {formatDuration(exam.duration)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          exam.is_published 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {exam.is_published ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              Đã xuất bản
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              Nháp
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          {exam.attempt_count}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-500">
                          {formatDate(exam.created_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/admin/exams/${exam.id}`)}
                          className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {exams.map((exam) => (
                <div key={exam.id} className="bg-white rounded-xl p-4 shadow-lg border border-slate-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{exam.title}</div>
                        <div className="text-sm text-slate-500">{exam.subject}</div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      exam.is_published 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {exam.is_published ? (
                        <>
                          <CheckCircle className="w-3 h-3" />
                          Đã xuất bản
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" />
                          Nháp
                        </>
                      )}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Clock className="w-4 h-4" />
                      {formatDuration(exam.duration)}
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Users className="w-4 h-4" />
                      {exam.attempt_count} lượt thi
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      {formatDate(exam.created_at)}
                    </span>
                    <button
                      onClick={() => router.push(`/admin/exams/${exam.id}`)}
                      className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Xem chi tiết
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
