'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { getOrCreateHomeworkAttempt } from '@/lib/homework/actions'

export default function HomeworkPreparePage() {
  const params = useParams()
  const router = useRouter()
  const assignmentId = params.examId as string
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (assignmentId) prepare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId])

  const prepare = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('class_id')
        .eq('id', user.id)
        .single()

      const recipientFilter = profile?.class_id
        ? `student_id.eq.${user.id},class_id.eq.${profile.class_id}`
        : `student_id.eq.${user.id}`
      const { data: recipient } = await supabase
        .from('homework_assignment_recipients')
        .select('id')
        .eq('assignment_id', assignmentId)
        .or(recipientFilter)
        .limit(1)
        .maybeSingle()
      const { data: assignment } = await supabase
        .from('homework_assignments')
        .select('id, status, homeworks!inner(is_published)')
        .eq('id', assignmentId)
        .eq('status', 'published')
        .eq('homeworks.is_published', true)
        .maybeSingle()

      if (!recipient || !assignment) {
        setError('Không tìm thấy bài tập')
        return
      }

      const attemptId = await getOrCreateHomeworkAttempt(assignmentId, user.id)
      router.replace(`/homework/${attemptId}`)
    } catch (err) {
      console.error('prepare homework', err)
      setError('Lỗi kết nối')
    }
  }

  /*
    Màn chờ giữa danh sách bài tập và phòng làm bài: trang này chỉ tìm lượt làm
    rồi chuyển đi. Nền KHÔNG đặt bằng utility — `globals.css` đã đặt
    `--background` cho `html, body` (DESIGN_TODO.md mục 0, bất biến 2); bản
    trước phủ `bg-slate-100` lên trên. Thẻ lỗi dùng cùng bề mặt "trang vở" với
    các trang học sinh khác thay cho `bg-white` + bóng đậm.
  */
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bento-tile-lead paper-grid ruler-edge w-full max-w-md px-8 pb-8 pt-10 text-center">
          <h1 className="font-baloo text-2xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-5">{error}</p>
          <button
            onClick={() => router.push('/student/homework')}
            className="btn-action px-5 py-2.5 rounded-xl bg-teal-600 font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
          >
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600 dark:text-teal-400" aria-hidden="true" />
        <p className="text-slate-500 dark:text-slate-400">Đang mở bài tập...</p>
      </div>
    </div>
  )
}
