'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Question, ExamData } from '@/types'
import MathContent, { MathProvider } from './MathContent'
import ConfirmModal from './ConfirmModal'
import ExamSidebar from './ExamSidebar'
import QuestionImage from './QuestionImage'
import { useLoading } from '@/contexts/LoadingContext'

interface StudentAnswer {
  questionId: string
  questionType: 'multiple_choice' | 'true_false' | 'short_answer'
  selectedAnswer?: string
  selectedAnswers?: Record<string, boolean>
  textAnswer?: string
}

interface ExamRunnerProps {
  attemptId: string
  examData: ExamData
  studentId: string
  startTime: string
}

export default function ExamRunner({ attemptId, examData, studentId, startTime }: ExamRunnerProps) {
  const router = useRouter()
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()
  
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [currentPart, setCurrentPart] = useState(1)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | undefined>()
  
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showTimeUpModal, setShowTimeUpModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const allQuestions = [...examData.part1, ...examData.part2, ...examData.part3]
  const totalQuestions = allQuestions.length

  const getAnsweredQuestionIds = (): Set<string> => {
    const answered = new Set<string>()
    Object.keys(answers).forEach(qId => {
      const ans = answers[qId]
      if (ans.questionType === 'multiple_choice' && ans.selectedAnswer) {
        answered.add(qId)
      } else if (ans.questionType === 'true_false' && ans.selectedAnswers && Object.keys(ans.selectedAnswers).length > 0) {
        answered.add(qId)
      } else if (ans.questionType === 'short_answer' && ans.textAnswer?.trim()) {
        answered.add(qId)
      }
    })
    return answered
  }

  const handleMultipleChoiceAnswer = (questionId: string, answerId: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        questionType: 'multiple_choice',
        selectedAnswer: answerId
      }
    }))
  }

  const handleTrueFalseAnswer = (questionId: string, statementIndex: number, value: boolean) => {
    setAnswers(prev => {
      const existing = prev[questionId]?.selectedAnswers || {}
      return {
        ...prev,
        [questionId]: {
          questionId,
          questionType: 'true_false',
          selectedAnswers: {
            ...existing,
            [statementIndex]: value
          }
        }
      }
    })
  }

  const handleShortAnswer = (questionId: string, text: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        questionType: 'short_answer',
        textAnswer: text
      }
    }))
  }

  const handleQuestionClick = (questionId: string, partNumber: number) => {
    setCurrentPart(partNumber)
    setCurrentQuestionId(questionId)
    
    setTimeout(() => {
      const element = questionRefs.current[questionId]
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  const handleTimeUp = () => {
    setShowTimeUpModal(true)
  }

  const handleSubmitClick = () => {
    setShowSubmitModal(true)
  }

  const handleSubmit = async () => {
    if (submitting) return
    
    setSubmitting(true)
    setShowSubmitModal(false)
    showLoading('Đang nộp bài thi...')

    try {
      const allQuestions = [...examData.part1, ...examData.part2, ...examData.part3]
      const studentAnswersToInsert = []
      let correctCount = 0
      const totalQuestions = allQuestions.length

      for (const question of allQuestions) {
        const studentAns = answers[question.id]
        let isCorrect = false
        let score = 0

        if (question.question_type === 'multiple_choice') {
          const selectedAnswerId = studentAns?.selectedAnswer
          if (selectedAnswerId && question.answers) {
            const correctAnswer = question.answers.find(a => a.is_correct)
            isCorrect = correctAnswer?.id === selectedAnswerId
            score = isCorrect ? 1 : 0
            if (isCorrect) correctCount++
          }

          studentAnswersToInsert.push({
            attempt_id: attemptId,
            question_id: question.id,
            question_type: question.question_type,
            selected_answer: selectedAnswerId || null,
            is_correct: isCorrect,
            score: score
          })
        } else if (question.question_type === 'true_false') {
          const selectedAnswers = studentAns?.selectedAnswers || {}
          
          studentAnswersToInsert.push({
            attempt_id: attemptId,
            question_id: question.id,
            question_type: question.question_type,
            selected_answers: selectedAnswers,
            is_correct: false,
            score: 0
          })
        } else if (question.question_type === 'short_answer') {
          const textAnswer = studentAns?.textAnswer || ''
          
          studentAnswersToInsert.push({
            attempt_id: attemptId,
            question_id: question.id,
            question_type: question.question_type,
            text_answer: textAnswer || null,
            is_correct: false,
            score: 0
          })
        }
      }

      console.log('Student answers payload:', JSON.stringify(studentAnswersToInsert, null, 2))

      const { error: insertError } = await supabase
        .from('student_answers')
        .insert(studentAnswersToInsert)

      if (insertError) {
        console.error('Insert student answers error:', insertError)
        console.error('Full error object:', JSON.stringify(insertError, null, 2))
        hideLoading()
        setErrorMessage('Lỗi khi lưu bài làm. Vui lòng thử lại.')
        setShowErrorModal(true)
        setSubmitting(false)
        return
      }

      const finalScore = totalQuestions > 0 ? (correctCount / totalQuestions) * 10 : 0

      const { error: updateError } = await supabase
        .from('exam_attempts')
        .update({
          status: 'submitted',
          submit_time: new Date().toISOString(),
          total_questions: totalQuestions,
          correct_answers: correctCount,
          score: Math.round(finalScore * 100) / 100
        })
        .eq('id', attemptId)
        .eq('status', 'in_progress')

      if (updateError) {
        console.error('Update attempt error:', updateError)
        console.error('Full error object:', JSON.stringify(updateError, null, 2))
        hideLoading()
        setErrorMessage('Lỗi khi cập nhật bài thi. Vui lòng thử lại.')
        setShowErrorModal(true)
        setSubmitting(false)
        return
      }

      hideLoading()
      router.push(`/result/${attemptId}`)
    } catch (err) {
      console.error('Submit error:', err)
      hideLoading()
      setErrorMessage('Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.')
      setShowErrorModal(true)
      setSubmitting(false)
    }
  }

  const renderQuestion = (question: Question, globalIndex: number) => {
    return (
      <div 
        key={question.id} 
        id={`question-${question.id}`}
        ref={(el) => { questionRefs.current[question.id] = el }}
        className="bg-white dark:bg-slate-900 rounded-xl p-6 mb-4 border border-slate-100 dark:border-slate-800 scroll-mt-24"
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold">
            {globalIndex}
          </span>
          <div className="flex-1">
            <MathContent 
              content={question.content} 
              className="text-slate-800 dark:text-slate-200"
            />
            {question.tikz_image_url && (
              <QuestionImage 
                src={question.tikz_image_url} 
                alt="Question diagram"
                className="mt-4"
              />
            )}
          </div>
        </div>

        {question.question_type === 'multiple_choice' && question.answers && (
          <div className="space-y-2 ml-11">
            {question.answers.map((answer, idx) => {
              const isSelected = answers[question.id]?.selectedAnswer === answer.id
              const optionLabel = String.fromCharCode(65 + idx)
              
              return (
                <button
                  key={answer.id}
                  onClick={() => handleMultipleChoiceAnswer(question.id, answer.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {optionLabel}
                  </span>
                  <MathContent 
                    content={answer.content} 
                    className="text-slate-700 dark:text-slate-300"
                  />
                </button>
              )
            })}
          </div>
        )}

        {question.question_type === 'true_false' && (
          <div className="space-y-3 ml-11">
            {[0, 1, 2, 3].map((statementIdx) => {
              const currentValue = answers[question.id]?.selectedAnswers?.[statementIdx]
              
              return (
                <div key={statementIdx} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-6">
                    {String.fromCharCode(97 + statementIdx)})
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, true)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                        currentValue === true
                          ? 'bg-green-500 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      Đúng
                    </button>
                    <button
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, false)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                        currentValue === false
                          ? 'bg-red-500 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      Sai
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {question.question_type === 'short_answer' && (
          <div className="ml-11">
            <input
              type="text"
              value={answers[question.id]?.textAnswer || ''}
              onChange={(e) => handleShortAnswer(question.id, e.target.value)}
              placeholder="Nhập đáp án..."
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 outline-none transition-all"
            />
          </div>
        )}
      </div>
    )
  }

  const renderPart = (questions: Question[], partNumber: number, partTitle: string, startIndex: number) => {
    if (questions.length === 0) return null

    return (
      <div className={currentPart === partNumber ? 'block' : 'hidden'}>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{partTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{questions.length} câu hỏi</p>
        </div>
        {questions.map((q, idx) => renderQuestion(q, startIndex + idx + 1))}
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50 dark:bg-slate-950">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="font-bold text-slate-800 dark:text-white text-lg">{examData.examMeta.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{examData.examMeta.subject}</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-6">
            {/* Left: Questions */}
            <div className="flex-1 min-w-0">
              {/* Part Navigation */}
              <div className="flex gap-2 mb-6">
                {examData.part1.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(1)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      currentPart === 1
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Phần 1
                  </button>
                )}
                {examData.part2.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(2)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      currentPart === 2
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Phần 2
                  </button>
                )}
                {examData.part3.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(3)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      currentPart === 3
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Phần 3
                  </button>
                )}
              </div>

              {/* Questions */}
              {renderPart(examData.part1, 1, 'Phần 1: Trắc nghiệm nhiều lựa chọn', 0)}
              {renderPart(examData.part2, 2, 'Phần 2: Đúng / Sai', examData.part1.length)}
              {renderPart(examData.part3, 3, 'Phần 3: Trả lời ngắn', examData.part1.length + examData.part2.length)}
            </div>

            {/* Right: Sidebar */}
            <ExamSidebar
              examTitle={examData.examMeta.title}
              duration={examData.examMeta.duration}
              questions={allQuestions}
              answeredQuestions={getAnsweredQuestionIds()}
              currentQuestionId={currentQuestionId}
              onQuestionClick={handleQuestionClick}
              onSubmit={handleSubmitClick}
              onTimeUp={handleTimeUp}
              submitting={submitting}
              startTime={new Date(startTime)}
            />
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        <ConfirmModal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          onConfirm={handleSubmit}
          title="Xác nhận nộp bài"
          message={`Bạn đã làm ${getAnsweredQuestionIds().size}/${totalQuestions} câu. Bạn có chắc chắn muốn nộp bài?`}
          confirmText="Nộp bài"
          cancelText="Tiếp tục làm"
          type="warning"
        />

        {/* Time Up Modal */}
        <ConfirmModal
          isOpen={showTimeUpModal}
          onClose={() => {}}
          onConfirm={handleSubmit}
          title="Hết giờ làm bài!"
          message="Thời gian làm bài đã kết thúc. Bài làm của bạn sẽ được nộp tự động."
          confirmText="Xem kết quả"
          type="danger"
          showCancel={false}
        />

        {/* Error Modal */}
        <ConfirmModal
          isOpen={showErrorModal}
          onClose={() => setShowErrorModal(false)}
          onConfirm={() => setShowErrorModal(false)}
          title="Có lỗi xảy ra"
          message={errorMessage}
          confirmText="Đóng"
          type="danger"
          showCancel={false}
        />
      </div>
    </MathProvider>
  )
}
