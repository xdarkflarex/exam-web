'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HelpCircle, Search, FileText, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { useRouter } from 'next/navigation'

interface Question {
  id: string
  content: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  created_at: string
  exam_count: number
}

export default function AdminQuestionsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchQuestions()
  }, [])

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('questions')
        .select(`
          id,
          content,
          option_a,
          option_b,
          option_c,
          option_d,
          correct_answer,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Fetch questions error:', error)
        setLoading(false)
        return
      }

      // Get exam count for each question
      const questionsWithCount = await Promise.all(
        (data || []).map(async (q) => {
          const { count } = await supabase
            .from('exam_questions')
            .select('*', { count: 'exact', head: true })
            .eq('question_id', q.id)

          return {
            ...q,
            exam_count: count || 0
          }
        })
      )

      setQuestions(questionsWithCount)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setLoading(false)
    }
  }

  const filteredQuestions = questions.filter(q =>
    q.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen">
      <AdminHeader 
        title="Quản lý câu hỏi" 
        subtitle={`${questions.length} câu hỏi trong hệ thống`} 
      />
      
      <div className="p-8">
        {/* Info Banner */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-800 font-medium">Về quản lý câu hỏi</p>
              <p className="text-sm text-teal-700 mt-1">
                Câu hỏi được lưu trong bảng <code className="bg-teal-100 px-1 rounded">questions</code>. 
                Mỗi câu hỏi có thể được sử dụng trong nhiều đề thi thông qua bảng <code className="bg-teal-100 px-1 rounded">exam_questions</code>.
                Để chỉnh sửa câu hỏi, vui lòng vào chi tiết đề thi tương ứng.
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm câu hỏi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500">Đang tải danh sách câu hỏi...</p>
            </div>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HelpCircle className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {searchTerm ? 'Không tìm thấy câu hỏi' : 'Chưa có câu hỏi nào'}
            </h3>
            <p className="text-slate-500">
              {searchTerm ? 'Thử tìm kiếm với từ khóa khác' : 'Câu hỏi sẽ được tạo khi bạn tạo đề thi mới'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nội dung câu hỏi</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase w-24">Đáp án</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase w-32">Số đề sử dụng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase w-32">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuestions.map((question) => (
                  <tr key={question.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-800 line-clamp-2">
                        {question.content}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-50 text-teal-700 rounded-lg font-bold text-sm">
                        {question.correct_answer}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                        <FileText className="w-4 h-4" />
                        {question.exam_count} đề
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500">
                        {formatDate(question.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
