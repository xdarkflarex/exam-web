'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, XCircle, ArrowRight, ArrowLeft, BookOpen, Loader2,
  ClipboardList, Lightbulb, Trophy, LogOut
} from 'lucide-react'
import MathContent, { MathProvider } from './MathContent'
import QuestionImage from './QuestionImage'

// ============================================================
// Types
// ============================================================
export interface HomeworkAnswerOption {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

export interface HomeworkQuestion {
  id: string
  content: string
  question_type: 'multiple_choice' | 'true_false' | 'short_answer'
  explanation?: string | null
  solution?: string | null
  tikz_image_url?: string | null
  answers: HomeworkAnswerOption[]
}

export interface SavedHomeworkAnswer {
  selectedAnswer?: string | null
  selectedAnswers?: Record<string, boolean> | null
  textAnswer?: string | null
  isCorrect?: boolean | null
  shownFeedback?: boolean
}

interface HomeworkRunnerProps {
  attemptId: string
  studentId: string
  examTitle: string
  questions: HomeworkQuestion[]
  sessionSize: number
  initialAnswers: Record<string, SavedHomeworkAnswer>
  initialSessionIndex: number
}

// ============================================================
// Helpers
// ============================================================
function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(',', '.')
}

function computeCorrect(q: HomeworkQuestion, ans: SavedHomeworkAnswer): boolean {
  if (q.question_type === 'multiple_choice') {
    const correct = q.answers.find(a => a.is_correct)
    return !!ans.selectedAnswer && correct?.id === ans.selectedAnswer
  }
  if (q.question_type === 'true_false') {
    const sorted = [...q.answers].sort((a, b) => a.order_index - b.order_index)
    if (sorted.length === 0) return false
    return sorted.every((a, idx) => ans.selectedAnswers?.[String(idx)] === a.is_correct)
  }
  if (q.question_type === 'short_answer') {
    const text = ans.textAnswer || ''
    if (!text.trim()) return false
    return q.answers.some(a => a.is_correct && normalizeText(a.content) === normalizeText(text))
  }
  return false
}

function isAnswered(q: HomeworkQuestion, ans?: SavedHomeworkAnswer): boolean {
  if (!ans) return false
  if (q.question_type === 'multiple_choice') return !!ans.selectedAnswer
  if (q.question_type === 'true_false') {
    const sorted = [...q.answers].sort((a, b) => a.order_index - b.order_index)
    return sorted.length > 0 && sorted.every((_, idx) => typeof ans.selectedAnswers?.[String(idx)] === 'boolean')
  }
  if (q.question_type === 'short_answer') return !!ans.textAnswer?.trim()
  return false
}

// ============================================================
// Component
// ============================================================
export default function HomeworkRunner({
  attemptId, studentId, examTitle, questions, sessionSize, initialAnswers, initialSessionIndex
}: HomeworkRunnerProps) {
  const router = useRouter()
  const supabase = createClient()

  // Chia câu hỏi thành các session
  const sessions = useMemo(() => {
    const out: HomeworkQuestion[][] = []
    const size = Math.max(1, sessionSize)
    for (let i = 0; i < questions.length; i += size) {
      out.push(questions.slice(i, i + size))
    }
    return out
  }, [questions, sessionSize])

  const totalSessions = sessions.length
  const [sessionIndex, setSessionIndex] = useState(
    Math.min(initialSessionIndex, Math.max(0, totalSessions - 1))
  )
  const currentSession = sessions[sessionIndex] || []

  const [answers, setAnswers] = useState<Record<string, SavedHomeworkAnswer>>(initialAnswers)
  const [questionPtr, setQuestionPtr] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showSessionDone, setShowSessionDone] = useState(false)
  const [exiting, setExiting] = useState(false)

  const currentQuestion = currentSession[questionPtr]
  const currentAns = currentQuestion ? answers[currentQuestion.id] : undefined
  const revealed = !!currentAns?.shownFeedback

  // Số câu đã trả lời toàn bài
  const answeredCount = useMemo(
    () => questions.filter(q => answers[q.id]?.shownFeedback).length,
    [questions, answers]
  )

  // -------- Local answer updates --------
  const setMC = (qId: string, answerId: string) => {
    if (answers[qId]?.shownFeedback) return
    setAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], selectedAnswer: answerId } }))
  }
  const setTF = (qId: string, idx: number, value: boolean) => {
    if (answers[qId]?.shownFeedback) return
    setAnswers(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        selectedAnswers: { ...(prev[qId]?.selectedAnswers || {}), [idx]: value }
      }
    }))
  }
  const setSA = (qId: string, text: string) => {
    if (answers[qId]?.shownFeedback) return
    setAnswers(prev => ({ ...prev, [qId]: { ...prev[qId], textAnswer: text } }))
  }

  // -------- Kiểm tra (lưu + hiện đáp án) --------
  const handleCheck = useCallback(async () => {
    if (!currentQuestion || saving) return
    const ans = answers[currentQuestion.id]
    if (!isAnswered(currentQuestion, ans)) return

    setSaving(true)
    const correct = computeCorrect(currentQuestion, ans)

    const payload: any = {
      attempt_id: attemptId,
      question_id: currentQuestion.id,
      question_type: currentQuestion.question_type,
      is_correct: correct,
      score: correct ? 1 : 0,
      shown_feedback: true,
      answered_at: new Date().toISOString()
    }
    if (currentQuestion.question_type === 'multiple_choice') {
      payload.selected_answer = ans.selectedAnswer || null
    } else if (currentQuestion.question_type === 'true_false') {
      payload.selected_answers = ans.selectedAnswers || {}
    } else if (currentQuestion.question_type === 'short_answer') {
      payload.text_answer = ans.textAnswer || null
    }

    const { error } = await supabase
      .from('student_answers')
      .upsert(payload, { onConflict: 'attempt_id,question_id' })

    if (error) {
      console.error('Lưu đáp án lỗi:', error)
      setSaving(false)
      return
    }

    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], isCorrect: correct, shownFeedback: true }
    }))
    setSaving(false)
  }, [currentQuestion, answers, saving, attemptId, supabase])

  // -------- Điều hướng --------
  const handleNext = () => {
    if (questionPtr < currentSession.length - 1) {
      setQuestionPtr(p => p + 1)
    } else {
      setShowSessionDone(true)
    }
  }

  const handleNextSession = async () => {
    const nextIdx = sessionIndex + 1
    await supabase
      .from('exam_attempts')
      .update({ current_session_index: nextIdx })
      .eq('id', attemptId)
    setSessionIndex(nextIdx)
    setQuestionPtr(0)
    setShowSessionDone(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleExit = async () => {
    setExiting(true)
    // Lưu session hiện tại để lần sau quay lại đúng chỗ
    await supabase
      .from('exam_attempts')
      .update({ current_session_index: sessionIndex })
      .eq('id', attemptId)
    router.push('/student/homework')
  }

  // -------- Hết bài --------
  const isLastSession = sessionIndex >= totalSessions - 1

  // Session summary: đúng/sai trong session
  const sessionStats = useMemo(() => {
    let correct = 0
    for (const q of currentSession) {
      if (answers[q.id]?.isCorrect) correct++
    }
    return { correct, total: currentSession.length }
  }, [currentSession, answers])

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400">Bài tập chưa có câu hỏi.</p>
      </div>
    )
  }

  const globalQuestionNumber = sessionIndex * Math.max(1, sessionSize) + questionPtr + 1

  return (
    <MathProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-10">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base line-clamp-1 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                {examTitle}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phần {sessionIndex + 1}/{totalSessions} · Đã làm {answeredCount}/{questions.length} câu
              </p>
            </div>
            <button
              onClick={handleExit}
              disabled={exiting}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {exiting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline">Lưu & thoát</span>
            </button>
          </div>
          {/* Progress bar trong session */}
          <div className="max-w-3xl mx-auto mt-2">
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 transition-all"
                style={{ width: `${((questionPtr + (revealed ? 1 : 0)) / currentSession.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {showSessionDone ? (
            // ----- Session hoàn thành -----
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-teal-600 dark:text-teal-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                Hoàn thành phần {sessionIndex + 1}/{totalSessions}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                Đúng {sessionStats.correct}/{sessionStats.total} câu trong phần này.
              </p>
              {isLastSession ? (
                <div className="space-y-3">
                  <p className="text-teal-600 dark:text-teal-400 font-medium">
                    Bạn đã hoàn thành toàn bộ bài tập!
                  </p>
                  <button
                    onClick={handleExit}
                    disabled={exiting}
                    className="w-full sm:w-auto px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {exiting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Về danh sách bài tập
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={handleExit}
                    disabled={exiting}
                    className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    Để dành mai làm tiếp
                  </button>
                  <button
                    onClick={handleNextSession}
                    className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Làm phần tiếp theo
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          ) : currentQuestion ? (
            // ----- Câu hỏi -----
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2.5 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-bold">
                  Câu {globalQuestionNumber}
                </span>
                <span className="text-xs text-slate-400">
                  {questionPtr + 1}/{currentSession.length} trong phần này
                </span>
              </div>

              <MathContent content={currentQuestion.content} className="text-slate-800 dark:text-slate-200 text-base mb-4" />
              {currentQuestion.tikz_image_url && (
                <QuestionImage src={currentQuestion.tikz_image_url} alt="Hình minh hoạ" className="mb-4 max-w-full" />
              )}

              {/* Multiple choice */}
              {currentQuestion.question_type === 'multiple_choice' && (
                <div className="space-y-2">
                  {currentQuestion.answers.sort((a, b) => a.order_index - b.order_index).map((opt, idx) => {
                    const selected = currentAns?.selectedAnswer === opt.id
                    let cls = 'border-slate-300 dark:border-slate-600 hover:border-teal-400'
                    if (revealed) {
                      if (opt.is_correct) cls = 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      else if (selected) cls = 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      else cls = 'border-slate-200 dark:border-slate-700 opacity-70'
                    } else if (selected) {
                      cls = 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                    }
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setMC(currentQuestion.id, opt.id)}
                        disabled={revealed}
                        className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${cls}`}
                      >
                        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <MathContent content={opt.content} className="text-slate-700 dark:text-slate-300 text-sm" />
                      </button>
                    )
                  })}
                </div>
              )}

              {/* True / False */}
              {currentQuestion.question_type === 'true_false' && (
                <div className="space-y-2">
                  {[...currentQuestion.answers].sort((a, b) => a.order_index - b.order_index).map((opt, idx) => {
                    const val = currentAns?.selectedAnswers?.[String(idx)]
                    const correctVal = opt.is_correct
                    return (
                      <div key={opt.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{String.fromCharCode(97 + idx)})</span>
                          <MathContent content={opt.content} className="text-slate-700 dark:text-slate-300 text-sm flex-1" />
                        </div>
                        <div className="flex gap-2 ml-6">
                          <button
                            onClick={() => setTF(currentQuestion.id, idx, true)}
                            disabled={revealed}
                            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                              val === true
                                ? 'bg-green-500 text-white'
                                : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
                            } ${revealed && correctVal === true ? 'ring-2 ring-green-500' : ''}`}
                          >
                            Đúng
                          </button>
                          <button
                            onClick={() => setTF(currentQuestion.id, idx, false)}
                            disabled={revealed}
                            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                              val === false
                                ? 'bg-red-500 text-white'
                                : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
                            } ${revealed && correctVal === false ? 'ring-2 ring-green-500' : ''}`}
                          >
                            Sai
                          </button>
                          {revealed && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 self-center ml-1">
                              Đáp án: {correctVal ? 'Đúng' : 'Sai'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Short answer */}
              {currentQuestion.question_type === 'short_answer' && (
                <div>
                  <input
                    type="text"
                    value={currentAns?.textAnswer || ''}
                    onChange={(e) => setSA(currentQuestion.id, e.target.value)}
                    disabled={revealed}
                    placeholder="Nhập đáp án..."
                    className={`w-full p-3 rounded-lg border outline-none transition-all text-sm dark:bg-slate-700 dark:text-white ${
                      revealed
                        ? currentAns?.isCorrect
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-slate-200 dark:border-slate-600 focus:border-teal-500'
                    }`}
                  />
                  {revealed && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Đáp án đúng: <span className="font-semibold text-green-600 dark:text-green-400">
                        {currentQuestion.answers.find(a => a.is_correct)?.content || '—'}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {/* Feedback box */}
              {revealed && (
                <div className="mt-5 space-y-3">
                  <div className={`flex items-center gap-2 p-3 rounded-lg font-medium ${
                    currentAns?.isCorrect
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {currentAns?.isCorrect ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    {currentAns?.isCorrect ? 'Chính xác!' : 'Chưa đúng'}
                  </div>

                  {currentQuestion.explanation && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-sm font-semibold mb-1">
                        <Lightbulb className="w-4 h-4" /> Giải thích
                      </div>
                      <MathContent content={currentQuestion.explanation} className="text-slate-700 dark:text-slate-300 text-sm" />
                    </div>
                  )}
                  {currentQuestion.solution && (
                    <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                      <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 text-sm font-semibold mb-1">
                        <BookOpen className="w-4 h-4" /> Lời giải
                      </div>
                      <MathContent content={currentQuestion.solution} className="text-slate-700 dark:text-slate-300 text-sm" />
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  onClick={() => setQuestionPtr(p => Math.max(0, p - 1))}
                  disabled={questionPtr === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Câu trước
                </button>

                {!revealed ? (
                  <button
                    onClick={handleCheck}
                    disabled={saving || !isAnswered(currentQuestion, currentAns)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium disabled:bg-slate-300 dark:disabled:bg-slate-600 transition-colors"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Kiểm tra
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors"
                  >
                    {questionPtr < currentSession.length - 1 ? 'Câu tiếp theo' : 'Kết thúc phần'}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </MathProvider>
  )
}
