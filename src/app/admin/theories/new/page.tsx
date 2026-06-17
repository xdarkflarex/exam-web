'use client'

// Trang tạo bài lý thuyết đã được gộp vào trang Import/Export thống nhất.
// Giữ route này để không vỡ link cũ — tự chuyển hướng sang /admin/theories/import.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTheoryRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/theories/import')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
        <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        Đang chuyển tới trang tạo bài lý thuyết...
      </div>
    </div>
  )
}
