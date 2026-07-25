'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ExamData } from '@/types'
import ExamRunner from '@/components/ExamRunner'
import { getExamQuestionsForStudent } from '@/lib/exam/questions'
import { useLoading } from '@/contexts/LoadingContext'

interface ExamAttempt {
  id: string
  exam_id: string
  student_id: string
  start_time: string
  status: string
}

export default function ExamEntryPage() {
  const params = useParams()
  const attemptId = params.attemptId as string
  const supabase = useMemo(() => createClient(), [])
  const { showLoading, hideLoading } = useLoading()

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [examData, setExamData] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExamData = useCallback(async () => {
    showLoading('Đang tải đề thi...')
    try {
      // Debug: Log attemptId from URL
      console.log('🔍 Student Exam Flow - attemptId from URL:', attemptId)

      // Step 1: Fetch exam attempt - ONLY valid source of examId
      const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, start_time, status')
        .eq('id', attemptId)
        .single()

      if (attemptError) {
        console.error('❌ Attempt fetch error:', attemptError)
        console.error('❌ Failed to get exam_id from exam_attempts for attemptId:', attemptId)
        setError('Không tìm thấy bài thi')
        setLoading(false)
        hideLoading()
        return
      }

      if (!attemptData || !attemptData.exam_id) {
        console.error('❌ No exam_id found in attempt data:', attemptData)
        setError('Dữ liệu bài thi không hợp lệ')
        setLoading(false)
        hideLoading()
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user || attemptData.student_id !== user.id) {
        setError('Bạn không có quyền mở bài thi này')
        setLoading(false)
        hideLoading()
        return
      }

      setAttempt(attemptData)
      
      console.log('✅ examId from exam_attempts:', attemptData.exam_id)

      // Step 2: RPC derives the exam from this owned attempt and filters private data.
      const {
        examData,
        examMode,
        error: questionsError,
      } = await getExamQuestionsForStudent(attemptId)

      if (questionsError || !examData) {
        console.error('❌ Questions fetch error:', questionsError)
        setError(questionsError || 'Không thể tải câu hỏi')
        setLoading(false)
        hideLoading()
        return
      }

      if (examMode !== 'simulation') {
        setError('Bài làm này không thuộc đề thi thử')
        setLoading(false)
        hideLoading()
        return
      }

      // Debug: Log questions count
      const totalQuestions = examData.part1.length + examData.part2.length + examData.part3.length
      console.log('✅ Questions loaded successfully:')
      console.log('   - Part 1:', examData.part1.length)
      console.log('   - Part 2:', examData.part2.length) 
      console.log('   - Part 3:', examData.part3.length)
      console.log('   - Total questions:', totalQuestions)

      if (totalQuestions === 0) {
        console.warn('⚠️ No questions found for attemptId:', attemptId)
        setError('Đề thi chưa có câu hỏi')
        setLoading(false)
        hideLoading()
        return
      }

      setExamData(examData)
      setLoading(false)
      hideLoading()
    } catch (err) {
      console.error('❌ Unexpected error in fetchExamData:', err)
      setError('Lỗi kết nối')
      setLoading(false)
      hideLoading()
    }
  }, [attemptId, hideLoading, showLoading, supabase])

  useEffect(() => {
    if (!attemptId) return

    const timeoutId = window.setTimeout(() => {
      void fetchExamData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [attemptId, fetchExamData])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Lỗi</h1>
          <p className="text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!examData || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="text-slate-500 dark:text-slate-400">Không có dữ liệu</div>
      </div>
    )
  }

  return (
    <ExamRunner
      attemptId={attemptId}
      examData={examData}
      studentId={attempt.student_id}
      startTime={attempt.start_time}
    />
  )
}
