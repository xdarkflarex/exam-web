'use client'

import { Loader2 } from 'lucide-react'
import { useLoading } from '@/contexts/LoadingContext'

export default function LoadingPopup() {
  const { isLoading, loadingMessage } = useLoading()

  if (!isLoading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
              Vui lòng chờ
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loadingMessage}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
