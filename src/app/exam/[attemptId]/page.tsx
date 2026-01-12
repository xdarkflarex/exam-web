'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { Question, ExamData, ExamMeta } from '@/types'
import ExamRunner from '@/components/ExamRunner'

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
  const supabase = createClient()

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [examData, setExamData] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (attemptId) {
      fetchExamData()
    }
  }, [attemptId])

  const fetchExamData = async () => {
    try {
      // Step 1: Fetch exam attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, start_time, status')
        .eq('id', attemptId)
        .single()

      if (attemptError) {
        console.error('Attempt fetch error:', attemptError)
        setError('Không tìm thấy bài thi')
        setLoading(false)
        return
      }

      setAttempt(attemptData)
      const examId = attemptData.exam_id

      // Step 2: Fetch exam info
      const { data: examInfo, error: examError } = await supabase
        .from('exams')
        .select('id, title, duration, subject')
        .eq('id', examId)
        .single()

      if (examError) {
        console.error('Exam fetch error:', examError)
        setError('Không tìm thấy thông tin đề thi')
        setLoading(false)
        return
      }

      const examMeta: ExamMeta = {
        title: examInfo.title,
        duration: examInfo.duration,
        subject: examInfo.subject
      }

      // Step 3: Fetch exam_questions with questions joined
      const { data: examQuestions, error: eqError } = await supabase
        .from('exam_questions')
        .select(`
          part_number,
          order_in_part,
          questions (
            id,
            content,
            question_type,
            explanation,
            tikz_image_url
          )
        `)
        .eq('exam_id', examId)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqError) {
        console.error('Exam questions fetch error:', eqError)
        setError('Không thể tải câu hỏi')
        setLoading(false)
        return
      }

      // Step 4: Get all question IDs for fetching answers
      const questionIds = examQuestions
        .map((eq: any) => eq.questions?.id)
        .filter(Boolean)

      // Step 5: Fetch answers for all questions
      const { data: allAnswers, error: answersError } = await supabase
        .from('answers')
        .select('id, question_id, content, is_correct, order_index')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true })

      if (answersError) {
        console.error('Answers fetch error:', answersError)
      }

      // Step 6: Group answers by question_id
      const answersByQuestion: Record<string, any[]> = {}
      if (allAnswers) {
        for (const answer of allAnswers) {
          if (!answersByQuestion[answer.question_id]) {
            answersByQuestion[answer.question_id] = []
          }
          answersByQuestion[answer.question_id].push(answer)
        }
      }

      // Step 7: Build questions with answers and group by part
      const part1: Question[] = []
      const part2: Question[] = []
      const part3: Question[] = []

      for (const eq of examQuestions) {
        const q = eq.questions as any
        if (!q) continue

        const question: Question = {
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          explanation: q.explanation,
          part_number: eq.part_number,
          order_in_part: eq.order_in_part,
          tikz_image_url: q.tikz_image_url,
          answers: q.question_type === 'multiple_choice' 
            ? answersByQuestion[q.id] || []
            : undefined
        }

        if (eq.part_number === 1) {
          part1.push(question)
        } else if (eq.part_number === 2) {
          part2.push(question)
        } else if (eq.part_number === 3) {
          part3.push(question)
        }
      }

      setExamData({ part1, part2, part3, examMeta })
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

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
