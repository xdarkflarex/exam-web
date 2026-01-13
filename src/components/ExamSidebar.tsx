'use client'

import { useState, useEffect } from 'react'
import { Clock, Send, CheckCircle, Circle, AlertCircle } from 'lucide-react'
import { Question } from '@/types'

interface ExamSidebarProps {
  examTitle: string
  duration: number
  questions: Question[]
  answeredQuestions: Set<string>
  currentQuestionId?: string
  onQuestionClick: (questionId: string, partNumber: number) => void
  onSubmit: () => void
  onTimeUp: () => void
  submitting: boolean
  startTime: Date
}

export default function ExamSidebar({
  examTitle,
  duration,
  questions,
  answeredQuestions,
  currentQuestionId,
  onQuestionClick,
  onSubmit,
  onTimeUp,
  submitting,
  startTime
}: ExamSidebarProps) {
  const [timeLeft, setTimeLeft] = useState(duration * 60)
  const [isTimeUp, setIsTimeUp] = useState(false)

  useEffect(() => {
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000)
    
    const updateTimer = () => {
      const now = new Date()
      const diff = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000))
      setTimeLeft(diff)
      
      if (diff <= 0 && !isTimeUp) {
        setIsTimeUp(true)
        onTimeUp()
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [duration, startTime, onTimeUp, isTimeUp])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getTimeColor = () => {
    if (timeLeft <= 60) return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
    if (timeLeft <= 300) return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
    return 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20'
  }

  const part1Questions = questions.filter(q => q.part_number === 1)
  const part2Questions = questions.filter(q => q.part_number === 2)
  const part3Questions = questions.filter(q => q.part_number === 3)

  const renderQuestionGrid = (partQuestions: Question[], partLabel: string, startIndex: number) => {
    if (partQuestions.length === 0) return null

    return (
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
          {partLabel}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {partQuestions.map((q, idx) => {
            const globalIndex = startIndex + idx + 1
            const isAnswered = answeredQuestions.has(q.id)
            const isCurrent = currentQuestionId === q.id

            return (
              <button
                key={q.id}
                onClick={() => onQuestionClick(q.id, q.part_number)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                  isCurrent
                    ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900'
                    : ''
                } ${
                  isAnswered
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {globalIndex}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const answeredCount = answeredQuestions.size
  const totalCount = questions.length

  return (
    <div className="w-72 flex-shrink-0">
      <div className="sticky top-24 space-y-4">
        {/* Timer Card */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
            Thời gian còn lại
          </div>
          <div className={`text-3xl font-bold rounded-lg p-3 text-center ${getTimeColor()}`}>
            <Clock className="w-5 h-5 inline-block mr-2 -mt-1" />
            {formatTime(timeLeft)}
          </div>
          {timeLeft <= 300 && timeLeft > 0 && (
            <div className="mt-2 text-xs text-center text-red-500 dark:text-red-400 animate-pulse">
              Sắp hết giờ!
            </div>
          )}
        </div>

        {/* Progress Card */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Tiến độ
            </span>
            <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
              {answeredCount}/{totalCount}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 dark:bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${(answeredCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Navigation */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Danh sách câu hỏi
          </div>
          
          {renderQuestionGrid(part1Questions, 'Phần 1 - Trắc nghiệm', 0)}
          {renderQuestionGrid(part2Questions, 'Phần 2 - Đúng/Sai', part1Questions.length)}
          {renderQuestionGrid(part3Questions, 'Phần 3 - Trả lời ngắn', part1Questions.length + part2Questions.length)}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-300 dark:border-slate-700">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className="w-3 h-3 rounded bg-green-500" />
              Đã làm
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className="w-3 h-3 rounded bg-slate-400 dark:bg-slate-600" />
              Chưa làm
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-teal-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-500/20"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Đang nộp...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Nộp bài
            </>
          )}
        </button>
      </div>
    </div>
  )
}
