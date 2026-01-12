'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Users, FileText, BarChart3 } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500">Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      <GlobalHeader title="Bảng điều khiển Admin" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Chào mừng đến với bảng điều khiển Admin
          </h1>
          <p className="text-slate-600">
            Quản lý bài thi và theo dõi kết quả học sinh
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            onClick={() => router.push('/admin/exams')}
            className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800">Quản lý bài thi</h3>
                <p className="text-sm text-slate-500">Xem danh sách bài thi và kết quả</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/admin/feedback')}
            className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800">Góp ý học sinh</h3>
                <p className="text-sm text-slate-500">Xem và xử lý góp ý từ học sinh</p>
              </div>
            </div>
          </button>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 opacity-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-400">Thống kê</h3>
                <p className="text-sm text-slate-400">Sắp ra mắt</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Placeholder */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Hoạt động gần đây</h2>
          <div className="bg-white rounded-xl p-8 shadow-lg border border-slate-100 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Chưa có hoạt động nào
            </h3>
            <p className="text-slate-500">
              Các hoạt động gần đây sẽ hiển thị tại đây
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
