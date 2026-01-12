'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Trophy, CheckCircle2, XCircle, ArrowLeft, BookOpen } from 'lucide-react'
import { Question, Answer } from '@/types'
import MathContent, { MathProvider } from '@/components/MathContent'

interface ExamAttempt {
  id: string
  exam_id: string
  student_id: string
  status: string
  total_questions: number
  correct_answers: number
  score: number
  submit_time: string
}

interface StudentAnswerData {
  id: string
  question_id: string
  selected_answer: string | null
  selected_answers: Record<string, boolean> | null
  text_answer: string | null
  is_correct: boolean
  score: number
}

interface QuestionWithAnswer extends Question {
  studentAnswer?: StudentAnswerData
  correctAnswer?: Answer
}

export default function ExamResultPage() {
  const params = useParams()
  const router = useRouter()
  const attemptId = params.attemptId as string
  const supabase = createClient()

  const [attempt, setAttempt] = useState<ExamAttempt | null>(null)
  const [questions, setQuestions] = useState<QuestionWithAnswer[]>([])
  const [examTitle, setExamTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (attemptId) {
      fetchResults()
    }
  }, [attemptId])

  const fetchResults = async () => {
    try {
      // Fetch attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, student_id, status, total_questions, correct_answers, score, submit_time')
        .eq('id', attemptId)
        .single()

      if (attemptError) {
        console.error('Attempt fetch error:', attemptError)
        setError('Không tìm thấy kết quả')
        setLoading(false)
        return
      }

      if (attemptData.status !== 'submitted') {
        setError('Bài thi chưa được nộp')
        setLoading(false)
        return
      }

      setAttempt(attemptData)

      // Fetch exam info
      const { data: examInfo, error: examError } = await supabase
        .from('exams')
        .select('title')
        .eq('id', attemptData.exam_id)
        .single()

      if (!examError && examInfo) {
        setExamTitle(examInfo.title)
      }

      // Fetch student answers
      const { data: studentAnswers, error: saError } = await supabase
        .from('student_answers')
        .select('id, question_id, selected_answer, selected_answers, text_answer, is_correct, score')
        .eq('attempt_id', attemptId)

      if (saError) {
        console.error('Student answers fetch error:', saError)
      }

      // Fetch exam questions
      const { data: examQuestions, error: eqError } = await supabase
        .from('exam_questions')
        .select(`
          part_number,
          order_in_part,
          questions (
            id,
            content,
            question_type,
            explanation
          )
        `)
        .eq('exam_id', attemptData.exam_id)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqError) {
        console.error('Exam questions fetch error:', eqError)
        setError('Không thể tải câu hỏi')
        setLoading(false)
        return
      }

      // Fetch all answers for correct answer lookup
      const questionIds = examQuestions.map((eq: any) => eq.questions?.id).filter(Boolean)
      
      const { data: allAnswers, error: answersError } = await supabase
        .from('answers')
        .select('id, question_id, content, is_correct, order_index')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true })

      if (answersError) {
        console.error('Answers fetch error:', answersError)
      }

      // Build answers map
      const answersByQuestion: Record<string, Answer[]> = {}
      if (allAnswers) {
        for (const answer of allAnswers) {
          if (!answersByQuestion[answer.question_id]) {
            answersByQuestion[answer.question_id] = []
          }
          answersByQuestion[answer.question_id].push(answer)
        }
      }

      // Build student answers map
      const studentAnswerMap: Record<string, StudentAnswerData> = {}
      if (studentAnswers) {
        for (const sa of studentAnswers) {
          studentAnswerMap[sa.question_id] = sa
        }
      }

      // Build questions with answers
      const questionsWithAnswers: QuestionWithAnswer[] = []

      for (const eq of examQuestions) {
        const q = eq.questions as any
        if (!q) continue

        const answers = answersByQuestion[q.id] || []
        const correctAnswer = answers.find(a => a.is_correct)
        const studentAnswer = studentAnswerMap[q.id]

        questionsWithAnswers.push({
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          explanation: q.explanation,
          part_number: eq.part_number,
          order_in_part: eq.order_in_part,
          answers: answers,
          studentAnswer: studentAnswer,
          correctAnswer: correctAnswer
        })
      }

      setQuestions(questionsWithAnswers)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 dark:text-green-400'
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const renderQuestionResult = (question: QuestionWithAnswer, index: number) => {
    const isCorrect = question.studentAnswer?.is_correct

    return (
      <div key={question.id} className="bg-white dark:bg-slate-900 rounded-xl p-6 mb-4 border border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3 mb-4">
          <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isCorrect
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          }`}>
            {isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
              Câu {index + 1}
            </div>
            <MathContent content={question.content} className="text-slate-800 dark:text-slate-200" />
          </div>
        </div>

        {isCorrect ? (
          <div className="ml-11 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
            Bạn làm đúng!
          </div>
        ) : (
          <div className="ml-11 space-y-3">
            {question.question_type === 'multiple_choice' && question.correctAnswer && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Đáp án đúng:</div>
                <MathContent content={question.correctAnswer.content} className="text-slate-800 dark:text-slate-200" />
              </div>
            )}

            {question.explanation && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Giải thích:</div>
                <MathContent content={question.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 dark:text-slate-400">Đang tải kết quả...</p>
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

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50 dark:bg-slate-950">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={() => router.push('/student')}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Về trang chủ
            </button>
          </div>
        </div>

        {/* Score Card */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 mb-8 text-center">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Kết quả bài thi
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{examTitle}</p>

            <div className={`text-6xl font-bold mb-4 ${getScoreColor(attempt?.score || 0)}`}>
              {attempt?.score?.toFixed(1)}
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-6">trên thang điểm 10</p>

            <div className="flex justify-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {attempt?.correct_answers}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Câu đúng</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                  {attempt?.total_questions}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Tổng số câu</div>
              </div>
            </div>
          </div>

          {/* Question Results */}
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Chi tiết bài làm
          </h2>

          {questions.map((q, idx) => renderQuestionResult(q, idx))}
        </div>
      </div>
    </MathProvider>
  )
}
