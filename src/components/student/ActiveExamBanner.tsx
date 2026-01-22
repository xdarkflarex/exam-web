'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Timer, Play, X } from 'lucide-react'

interface ActiveExam {
  attemptId: string
  examId: string
  examTitle: string
  startTime: string
  duration: number
  remainingSeconds: number
}

export default function ActiveExamBanner() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null)
  const [remainingTime, setRemainingTime] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  // Don't show on exam pages or prepare pages
  const isExamPage = pathname.startsWith('/exam/')
  
  useEffect(() => {
    if (isExamPage) return
    checkActiveExam()
    
    // Check every 30 seconds for new active exams
    const interval = setInterval(checkActiveExam, 30000)
    return () => clearInterval(interval)
  }, [pathname])

  // Countdown timer
  useEffect(() => {
    if (!activeExam || remainingTime <= 0) return
    
    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          setActiveExam(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [activeExam])

  const checkActiveExam = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Find in-progress exam attempt
      const { data: attempt } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          exam_id,
          start_time,
          exams!inner (
            title,
            duration
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!attempt) {
        setActiveExam(null)
        return
      }

      const exam = attempt.exams as any
      const startTime = new Date(attempt.start_time)
      const now = new Date()
      const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000)
      const totalSeconds = exam.duration * 60
      const remaining = Math.max(0, totalSeconds - elapsedSeconds)

      if (remaining <= 0) {
        setActiveExam(null)
        return
      }

      setActiveExam({
        attemptId: attempt.id,
        examId: attempt.exam_id,
        examTitle: exam.title,
        startTime: attempt.start_time,
        duration: exam.duration,
        remainingSeconds: remaining
      })
      setRemainingTime(remaining)
      setDismissed(false)
    } catch (error) {
      console.error('Error checking active exam:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleContinue = () => {
    if (activeExam) {
      router.push(`/exam/prepare/${activeExam.examId}`)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Don't render if on exam page, no active exam, or dismissed
  if (isExamPage || !activeExam || dismissed) {
    return null
  }

  const isUrgent = remainingTime < 300 // Less than 5 minutes

  return (
    <div className={`fixed bottom-20 lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-80 z-50 animate-slide-up`}>
      <div className={`rounded-xl shadow-lg border p-4 ${
        isUrgent 
          ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' 
          : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            isUrgent 
              ? 'bg-red-100 dark:bg-red-900/50' 
              : 'bg-amber-100 dark:bg-amber-900/50'
          }`}>
            <Timer className={`w-5 h-5 ${
              isUrgent 
                ? 'text-red-600 dark:text-red-400 animate-pulse' 
                : 'text-amber-600 dark:text-amber-400'
            }`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`font-medium text-sm ${
                  isUrgent 
                    ? 'text-red-800 dark:text-red-300' 
                    : 'text-amber-800 dark:text-amber-300'
                }`}>
                  Đang trong phiên thi
                </p>
                <p className={`text-xs truncate ${
                  isUrgent 
                    ? 'text-red-600 dark:text-red-400' 
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {activeExam.examTitle}
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className={`p-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors ${
                  isUrgent 
                    ? 'text-red-500' 
                    : 'text-amber-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className={`text-lg font-bold mt-1 ${
              isUrgent 
                ? 'text-red-700 dark:text-red-300' 
                : 'text-amber-700 dark:text-amber-300'
            }`}>
              ⏱️ {formatTime(remainingTime)}
            </div>
            
            <button
              onClick={handleContinue}
              className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isUrgent
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              <Play className="w-4 h-4" />
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
