'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function HomeworkPreparePage() {
  const params = useParams()
  const router = useRouter()
  const examId = params.examId as string
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (examId) prepare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  const prepare = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Verify exam exists & published
      const { data: exam } = await supabase
        .from('exams')
        .select('id')
        .eq('id', examId)
        .eq('is_published', true)
        .single()

      if (!exam) {
        setError('Không tìm thấy bài tập')
        return
      }

      // Reuse existing attempt (homework dùng 1 attempt duy nhất, làm dần)
      const { data: existing } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        router.replace(`/homework/${existing.id}`)
        return
      }

      // Create new attempt
      const { data: created, error: cErr } = await supabase
        .from('exam_attempts')
        .insert({
          exam_id: examId,
          student_id: user.id,
          attempt_number: 1,
          start_time: new Date().toISOString(),
          status: 'in_progress',
          current_session_index: 0
        })
        .select('id')
        .single()

      if (cErr || !created) {
        console.error('create homework attempt', cErr)
        setError('Không thể bắt đầu bài tập')
        return
      }

      router.replace(`/homework/${created.id}`)
    } catch (err) {
      console.error('prepare homework', err)
      setError('Lỗi kết nối')
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/student/homework')}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        <p className="text-slate-500 dark:text-slate-400">Đang mở bài tập...</p>
      </div>
    </div>
  )
}
