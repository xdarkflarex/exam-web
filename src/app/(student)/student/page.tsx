'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import StudentDashboard from '@/components/StudentDashboard'
import { Exam, HistoryEntry } from '@/types'
import { isAdmin, isStudent } from '@/lib/auth/roles'

export default function StudentPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [exams, setExams] = useState<Exam[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loadingError, setLoadingError] = useState<string | null>(null)

  useEffect(() => {
    fetchExams()
    fetchHistory()
  }, [])

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, description, subject, duration, is_published, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      if (error) {
        setLoadingError('Không thể tải danh sách đề thi')
        return
      }

      setExams(data || [])
    } catch (error) {
      setLoadingError('Lỗi kết nối')
    }
  }

  const fetchHistory = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error('Auth error in fetchHistory:', authError)
        return
      }

      const { data, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          score,
          submit_time,
          exams!exam_id (
            subject
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'submitted')
        .not('submit_time', 'is', null)
        .order('submit_time', { ascending: false })

      if (error) {
        console.error('Fetch history error:', error)
        return
      }

      const historyEntries: HistoryEntry[] = (data || []).map(attempt => ({
        id: attempt.id,
        subject: (attempt.exams as any)?.subject || 'Không rõ',
        date: attempt.submit_time!,
        score: attempt.score || 0
      }))

      setHistory(historyEntries)
    } catch (error) {
      console.error('Unexpected error in fetchHistory:', error)
    }
  }

  const handleStartExam = async (examId: string, examTitle: string) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('Auth error:', authError)
        setLoadingError('Vui lòng đăng nhập lại')
        return
      }
      if (!user) {
        console.error('User is null')
        setLoadingError('Vui lòng đăng nhập lại')
        return
      }

      const { data: existingAttempt, error: queryError } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle()

      if (queryError) {
        console.error('Query existing attempt error:', queryError)
        setLoadingError('Không thể bắt đầu bài thi')
        return
      }

      if (existingAttempt) {
        router.push(`/exam/${existingAttempt.id}`)
        return
      }

      const { data: maxAttemptData, error: maxAttemptError } = await supabase
        .from('exam_attempts')
        .select('attempt_number')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (maxAttemptError) {
        console.error('Query max attempt error:', maxAttemptError)
        setLoadingError('Không thể bắt đầu bài thi')
        return
      }

      const nextAttemptNumber = maxAttemptData ? maxAttemptData.attempt_number + 1 : 1

      const { data: newAttempt, error: insertError } = await supabase
        .from('exam_attempts')
        .insert({
          exam_id: examId,
          student_id: user.id,
          attempt_number: nextAttemptNumber,
          start_time: new Date().toISOString(),
          status: 'in_progress'
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Insert attempt error:', insertError)
        setLoadingError('Không thể bắt đầu bài thi')
        return
      }

      router.push(`/exam/${newAttempt.id}`)
    } catch (error) {
      console.error('Unexpected error:', error)
      setLoadingError('Lỗi kết nối')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleViewResult = (attemptId: string) => {
    router.push(`/exam/${attemptId}/result`)
  }

  const handleClearHistory = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error('Auth error in handleClearHistory:', authError)
        return
      }

      // Delete all submitted exam attempts for this user
      const { error } = await supabase
        .from('exam_attempts')
        .delete()
        .eq('student_id', user.id)
        .eq('status', 'submitted')

      if (error) {
        console.error('Clear history error:', error)
        setLoadingError('Không thể xóa lịch sử')
        return
      }

      // Clear local state after successful deletion
      setHistory([])
    } catch (error) {
      console.error('Unexpected error in handleClearHistory:', error)
      setLoadingError('Lỗi kết nối')
    }
  }

  return (
    <StudentDashboard
      onStartExam={handleStartExam}
      onLogout={handleLogout}
      history={history}
      onClearHistory={handleClearHistory}
      onViewResult={handleViewResult}
      loadingError={loadingError}
      exams={exams}
    />
  )
}
