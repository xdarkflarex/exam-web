'use client'

import { useLoading } from '@/contexts/LoadingContext'

export default function LoadingOverlay() {
  const { isLoading, loadingMessage } = useLoading()

  if (!isLoading) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" />
      
      {/* Loading Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-8 max-w-sm mx-4">
        <div className="flex flex-col items-center text-center">
          {/* Spinner */}
          <div className="relative mb-6">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-teal-300 rounded-full animate-spin animation-delay-150"></div>
          </div>
          
          {/* Text */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-800">
              {loadingMessage || 'Đang tải dữ liệu...'}
            </h3>
            <p className="text-sm text-slate-500">
              Vui lòng chờ trong giây lát
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
