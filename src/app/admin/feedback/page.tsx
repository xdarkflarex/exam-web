'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, MessageSquare, User, Clock, ChevronDown, CheckCircle2, XCircle, Eye, AlertTriangle } from 'lucide-react'
import { AdminHeader } from '@/components/admin'

interface FeedbackItem {
  id: string
  question_id: string
  student_id: string
  message: string
  status: 'pending' | 'reviewed' | 'fixed' | 'rejected'
  created_at: string
  student_name: string
  student_email: string
  question_content: string
}

const statusConfig = {
  pending: { label: 'Chờ xử lý', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  reviewed: { label: 'Đã xem', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Eye },
  fixed: { label: 'Đã sửa', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle }
}

export default function AdminFeedbackPage() {
  const router = useRouter()
  const supabase = createClient()

  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    fetchFeedbacks()
  }, [])

  const fetchFeedbacks = async () => {
    try {
      const { data, error } = await supabase
        .from('question_feedbacks')
        .select(`
          id,
          question_id,
          student_id,
          message,
          status,
          created_at,
          profiles!student_id (
            full_name,
            email
          ),
          questions (
            content
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Fetch feedbacks error:', error)
        setError('Không thể tải danh sách góp ý')
        setLoading(false)
        return
      }

      const formattedFeedbacks: FeedbackItem[] = (data || []).map((item: any) => ({
        id: item.id,
        question_id: item.question_id,
        student_id: item.student_id,
        message: item.message,
        status: item.status,
        created_at: item.created_at,
        student_name: item.profiles?.full_name || 'Không rõ',
        student_email: item.profiles?.email || '',
        question_content: item.questions?.content || 'Câu hỏi không tồn tại'
      }))

      setFeedbacks(formattedFeedbacks)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const updateStatus = async (feedbackId: string, newStatus: 'pending' | 'reviewed' | 'fixed' | 'rejected') => {
    setUpdatingStatus(feedbackId)
    setOpenDropdown(null)

    // Optimistic update
    setFeedbacks(prev => prev.map(feedback => 
      feedback.id === feedbackId 
        ? { ...feedback, status: newStatus }
        : feedback
    ))

    try {
      const { error } = await supabase
        .from('question_feedbacks')
        .update({ status: newStatus })
        .eq('id', feedbackId)

      if (error) {
        console.error('Update status error:', error)
        // Revert optimistic update
        setFeedbacks(prev => prev.map(feedback => 
          feedback.id === feedbackId 
            ? { ...feedback, status: feedback.status } // This won't work, we need to store original
            : feedback
        ))
        // Better to refetch on error
        fetchFeedbacks()
      }
    } catch (err) {
      console.error('Unexpected update error:', err)
      fetchFeedbacks()
    } finally {
      setUpdatingStatus(null)
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

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const StatusDropdown = ({ feedback }: { feedback: FeedbackItem }) => {
    const currentStatus = statusConfig[feedback.status]
    const CurrentIcon = currentStatus.icon

    return (
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === feedback.id ? null : feedback.id)}
          disabled={updatingStatus === feedback.id}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${currentStatus.color} hover:opacity-80 disabled:opacity-50`}
        >
          {updatingStatus === feedback.id ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CurrentIcon className="w-3 h-3" />
          )}
          {currentStatus.label}
          <ChevronDown className="w-3 h-3" />
        </button>

        {openDropdown === feedback.id && (
          <div className="absolute right-0 mt-1 w-40 bg-slate-50 dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
            {Object.entries(statusConfig).map(([status, config]) => {
              const Icon = config.icon
              return (
                <button
                  key={status}
                  onClick={() => updateStatus(feedback.id, status as any)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  {config.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Góp ý từ học sinh" subtitle="Quản lý và xử lý góp ý" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải góp ý...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Góp ý từ học sinh" subtitle="Quản lý và xử lý góp ý" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl border border-slate-100 p-8 max-w-md text-center">
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
    <div className="min-h-screen">
      <AdminHeader title="Góp ý từ học sinh" subtitle={`${feedbacks.length} góp ý`} />
      
      {/* Content */}
      <div className="p-8">
        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Chưa có góp ý nào
            </h3>
            <p className="text-slate-500">
              Các góp ý từ học sinh sẽ hiển thị tại đây
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Học sinh
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Câu hỏi
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Góp ý
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Thời gian
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {feedbacks.map((feedback) => (
                    <tr key={feedback.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800 dark:text-white">
                              {feedback.student_name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {feedback.student_email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 dark:text-slate-300 max-w-xs">
                          {truncateText(feedback.question_content.replace(/<[^>]*>/g, ''), 80)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600 dark:text-slate-300 max-w-sm">
                          {truncateText(feedback.message, 100)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {formatDate(feedback.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusDropdown feedback={feedback} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {feedbacks.map((feedback) => (
                <div key={feedback.id} className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-lg border border-slate-100 dark:border-slate-800">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-white">
                          {feedback.student_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(feedback.created_at)}
                        </div>
                      </div>
                    </div>
                    <StatusDropdown feedback={feedback} />
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Câu hỏi:</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        {truncateText(feedback.question_content.replace(/<[^>]*>/g, ''), 120)}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Góp ý:</div>
                      <div className="text-sm text-slate-800 dark:text-white">
                        {feedback.message}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {openDropdown && (
        <div 
          className="fixed inset-0 z-5"
          onClick={() => setOpenDropdown(null)}
        />
      )}
    </div>
  )
}
