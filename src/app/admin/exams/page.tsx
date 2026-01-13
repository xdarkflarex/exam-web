'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, Clock, Users, CheckCircle, Plus, Search, Filter, ChevronRight } from 'lucide-react'
import { AdminHeader } from '@/components/admin'

interface Exam {
  id: string
  title: string
  subject: string
  duration: number
  is_published: boolean
  created_at: string
  attempt_count?: number
  question_count?: number
}

export default function AdminExamsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all')

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
        setLoading(false)
        return
      }

      const examsWithCounts = await Promise.all(
        (examsData || []).map(async (exam) => {
          const [attemptResult, questionResult] = await Promise.all([
            supabase
              .from('exam_attempts')
              .select('*', { count: 'exact', head: true })
              .eq('exam_id', exam.id),
            supabase
              .from('exam_questions')
              .select('*', { count: 'exact', head: true })
              .eq('exam_id', exam.id)
          ])

          return {
            ...exam,
            attempt_count: attemptResult.count || 0,
            question_count: questionResult.count || 0
          }
        })
      )

      setExams(examsWithCounts)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
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

  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exam.subject.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'published' && exam.is_published) ||
                         (filterStatus === 'draft' && !exam.is_published)
    return matchesSearch && matchesFilter
  })

  const stats = {
    total: exams.length,
    published: exams.filter(e => e.is_published).length,
    draft: exams.filter(e => !e.is_published).length
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminHeader title="Quản lý đề thi" subtitle={`${exams.length} đề thi trong hệ thống`} />
      
      <div className="p-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <button 
            onClick={() => setFilterStatus('all')}
            className={`p-4 rounded-xl border transition-all ${
              filterStatus === 'all' 
                ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-700' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
            }`}
          >
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tổng số đề</p>
          </button>
          <button 
            onClick={() => setFilterStatus('published')}
            className={`p-4 rounded-xl border transition-all ${
              filterStatus === 'published' 
                ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
            }`}
          >
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.published}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Đang mở</p>
          </button>
          <button 
            onClick={() => setFilterStatus('draft')}
            className={`p-4 rounded-xl border transition-all ${
              filterStatus === 'draft' 
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700' 
                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
            }`}
          >
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.draft}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Bản nháp</p>
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm đề thi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-80 pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <button
            onClick={() => router.push('/admin/exams/create')}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 dark:bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-700 dark:hover:bg-teal-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Tạo đề mới
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 dark:text-slate-400">Đang tải danh sách...</p>
            </div>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              {searchTerm ? 'Không tìm thấy đề thi' : 'Chưa có đề thi nào'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              {searchTerm ? 'Thử tìm kiếm với từ khóa khác' : 'Bắt đầu tạo đề thi đầu tiên của bạn'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => router.push('/admin/exams/create')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 dark:bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-700 dark:hover:bg-teal-600 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Tạo đề mới
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExams.map((exam) => (
              <div
                key={exam.id}
                onClick={() => router.push(`/admin/exams/${exam.id}`)}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 hover:shadow-md hover:border-teal-200 dark:hover:border-teal-600 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                        {exam.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <span>{exam.subject}</span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {exam.question_count} câu
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {exam.duration} phút
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {exam.attempt_count} lượt
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                      exam.is_published 
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        exam.is_published ? 'bg-green-500' : 'bg-amber-500'
                      }`}></span>
                      {exam.is_published ? 'Đang mở' : 'Bản nháp'}
                    </span>
                    <span className="text-sm text-slate-400 dark:text-slate-500">{formatDate(exam.created_at)}</span>
                    <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
