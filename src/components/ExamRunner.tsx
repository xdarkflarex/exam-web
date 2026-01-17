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
import { useExamAntiCheat } from '@/hooks/useExamAntiCheat'

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
  
  // ============================================
  // ANTI-CHEAT TRACKING
  // Monitors suspicious activity during exam (observational only, no logout)
  // ============================================
  useExamAntiCheat({ attemptId, enabled: true })
  
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
        className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 sm:p-6 mb-3 sm:mb-4 border border-slate-300 dark:border-slate-700 scroll-mt-20 sm:scroll-mt-24 shadow-sm"
      >
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          <span className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xs sm:text-sm font-bold">
            {globalIndex}
          </span>
          <div className="flex-1 min-w-0">
            <MathContent 
              content={question.content} 
              className="text-slate-800 dark:text-slate-200 text-sm sm:text-base"
            />
            {question.tikz_image_url && (
              <QuestionImage 
                src={question.tikz_image_url} 
                alt="Question diagram"
                className="mt-3 sm:mt-4 max-w-full"
              />
            )}
          </div>
        </div>

        {question.question_type === 'multiple_choice' && question.answers && (
          <div className="space-y-2 ml-0 sm:ml-10">
            {question.answers.map((answer, idx) => {
              const isSelected = answers[question.id]?.selectedAnswer === answer.id
              const optionLabel = String.fromCharCode(65 + idx)
              
              return (
                <button
                  key={answer.id}
                  onClick={() => handleMultipleChoiceAnswer(question.id, answer.id)}
                  className={`w-full text-left p-2.5 sm:p-3 rounded-lg border transition-all flex items-center gap-2 sm:gap-3 ${
                    isSelected
                      ? 'border-teal-500 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isSelected
                      ? 'bg-teal-600 dark:bg-teal-500 text-white'
                      : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                  }`}>
                    {optionLabel}
                  </span>
                  <MathContent 
                    content={answer.content} 
                    className="text-slate-700 dark:text-slate-300 text-sm sm:text-base"
                  />
                </button>
              )
            })}
          </div>
        )}

        {question.question_type === 'true_false' && (
          <div className="space-y-2 sm:space-y-3 ml-0 sm:ml-10">
            {[0, 1, 2, 3].map((statementIdx) => {
              const currentValue = answers[question.id]?.selectedAnswers?.[statementIdx]
              
              return (
                <div key={statementIdx} className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-lg bg-slate-100 dark:bg-slate-700">
                  <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 w-5 sm:w-6">
                    {String.fromCharCode(97 + statementIdx)})
                  </span>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, true)}
                      className={`px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-all ${
                        currentValue === true
                          ? 'bg-green-500 text-white'
                          : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
                      }`}
                    >
                      Đúng
                    </button>
                    <button
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, false)}
                      className={`px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-all ${
                        currentValue === false
                          ? 'bg-red-500 text-white'
                          : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
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
          <div className="ml-0 sm:ml-10">
            <input
              type="text"
              value={answers[question.id]?.textAnswer || ''}
              onChange={(e) => handleShortAnswer(question.id, e.target.value)}
              placeholder="Nhập đáp án..."
              className="w-full p-2.5 sm:p-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900 outline-none transition-all text-sm sm:text-base"
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
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-20 lg:pb-0">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-300 dark:border-slate-700 px-4 sm:px-6 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="font-bold text-slate-800 dark:text-white text-base sm:text-lg line-clamp-1">{examData.examMeta.title}</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{examData.examMeta.subject}</p>
          </div>
        </div>

        {/* Responsive Layout */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Left: Questions */}
            <div className="flex-1 min-w-0">
              {/* Part Navigation - Scrollable on mobile */}
              <div className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                {examData.part1.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(1)}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                      currentPart === 1
                        ? 'bg-teal-600 dark:bg-teal-600 text-white'
                        : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    Phần 1
                  </button>
                )}
                {examData.part2.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(2)}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                      currentPart === 2
                        ? 'bg-teal-600 dark:bg-teal-600 text-white'
                        : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    Phần 2
                  </button>
                )}
                {examData.part3.length > 0 && (
                  <button
                    onClick={() => setCurrentPart(3)}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                      currentPart === 3
                        ? 'bg-teal-600 dark:bg-teal-600 text-white'
                        : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
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
