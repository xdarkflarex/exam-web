'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  FileText, 
  Clock, 
  Play, 
  Search,
  CheckCircle,
  BookOpen,
  RotateCcw
} from 'lucide-react'

interface PracticeExam {
  id: string
  title: string
  description: string | null
  subject: string
  duration: number
  is_published: boolean
  created_at: string
  grade: number | null
  question_count?: number
  attempt_count?: number
  best_score?: number | null
  in_progress_attempt_id?: string | null
  in_progress_answered?: number
}

export default function PracticeExamsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [exams, setExams] = useState<PracticeExam[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all')
  const [studentGrade, setStudentGrade] = useState<number | null>(null)

  useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch student grade
      const { data: profile } = await supabase
        .from('profiles')
        .select('grade')
        .eq('id', user.id)
        .single()

      const grade = profile?.grade || null
      setStudentGrade(grade)

      // Fetch practice exams filtered by grade
      let query = supabase
        .from('exams')
        .select('id, title, description, subject, duration, is_published, created_at, grade')
        .eq('is_published', true)
        .eq('exam_mode', 'practice')
        .order('created_at', { ascending: false })

      if (grade) {
        query = query.eq('grade', grade)
      }

      const { data: examsData, error } = await query

      if (error) {
        console.error('Fetch exams error:', error)
        return
      }

      // Fetch attempt info for each exam
      const examIds = examsData?.map(e => e.id) || []
      
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('id, exam_id, score, status')
        .eq('student_id', user.id)
        .in('exam_id', examIds)

      // Fetch answered count for in-progress attempts
      const inProgressAttemptIds = (attempts || [])
        .filter(a => a.status === 'in_progress')
        .map(a => a.id)

      let answeredCounts: Record<string, number> = {}
      if (inProgressAttemptIds.length > 0) {
        const { data: answerCounts } = await supabase
          .from('student_answers')
          .select('attempt_id')
          .in('attempt_id', inProgressAttemptIds)

        if (answerCounts) {
          for (const ac of answerCounts) {
            answeredCounts[ac.attempt_id] = (answeredCounts[ac.attempt_id] || 0) + 1
          }
        }
      }

      // Process exams with attempt data
      const processedExams: PracticeExam[] = (examsData || []).map(exam => {
        const examAttempts = attempts?.filter(a => a.exam_id === exam.id) || []
        const completedAttempts = examAttempts.filter(a => a.status === 'submitted')
        const inProgressAttempt = examAttempts.find(a => a.status === 'in_progress')
        const bestScore = completedAttempts.length > 0 
          ? Math.max(...completedAttempts.map(a => a.score || 0))
          : null

        return {
          ...exam,
          attempt_count: completedAttempts.length,
          best_score: bestScore,
          in_progress_attempt_id: inProgressAttempt?.id || null,
          in_progress_answered: inProgressAttempt ? (answeredCounts[inProgressAttempt.id] || 0) : 0
        }
      })

      setExams(processedExams)
    } catch (error) {
      console.error('Error fetching exams:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartPractice = async (examId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check for existing in-progress attempt
      const { data: existing } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle()

      if (existing) {
        // Resume existing attempt
        router.push(`/practice/${existing.id}`)
        return
      }

      // Get next attempt number
      const { data: maxAttempt } = await supabase
        .from('exam_attempts')
        .select('attempt_number')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextAttemptNumber = maxAttempt ? maxAttempt.attempt_number + 1 : 1

      // Create new attempt
      const { data: newAttempt, error } = await supabase
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

      if (error) {
        console.error('Create attempt error:', error)
        return
      }

      router.push(`/practice/${newAttempt.id}`)
    } catch (error) {
      console.error('Error starting practice:', error)
    }
  }

  const handleContinuePractice = (attemptId: string) => {
    router.push(`/practice/${attemptId}`)
  }

  // Filter exams
  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          exam.subject.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesFilter = filterStatus === 'all' ||
                          (filterStatus === 'in_progress' && exam.in_progress_attempt_id) ||
                          (filterStatus === 'completed' && (exam.attempt_count || 0) > 0 && !exam.in_progress_attempt_id) ||
                          (filterStatus === 'not_started' && (exam.attempt_count || 0) === 0 && !exam.in_progress_attempt_id)

    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải đề ôn tập...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-teal-600" />
            Ôn tập
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Làm bài không giới hạn thời gian • Tự động lưu tiến độ
            {studentGrade && (
              <span className="ml-2 px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs rounded-full font-medium">
                Lớp {studentGrade}
              </span>
            )}
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm đề ôn tập..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'in_progress', label: 'Đang làm' },
              { key: 'not_started', label: 'Chưa làm' },
              { key: 'completed', label: 'Đã xong' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setFilterStatus(filter.key as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  filterStatus === filter.key
                    ? 'bg-teal-500 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-teal-400'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exam List */}
        <div className="space-y-3">
          {filteredExams.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {searchQuery || filterStatus !== 'all' 
                  ? 'Không tìm thấy đề ôn tập phù hợp'
                  : 'Chưa có đề ôn tập nào'
                }
              </p>
            </div>
          ) : (
            filteredExams.map(exam => (
              <div
                key={exam.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-teal-400 dark:hover:border-teal-600 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {exam.title}
                      </h3>
                      {exam.in_progress_attempt_id && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded-full">
                          <Clock className="w-3 h-3" />
                          Đang làm
                        </span>
                      )}
                      {(exam.attempt_count || 0) > 0 && !exam.in_progress_attempt_id && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Đã hoàn thành
                        </span>
                      )}
                    </div>
                    
                    {exam.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">
                        {exam.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded text-xs font-medium">
                        Không giới hạn thời gian
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                        {exam.subject}
                      </span>
                      {exam.in_progress_attempt_id && exam.in_progress_answered !== undefined && (
                        <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                          Đã làm {exam.in_progress_answered} câu
                        </span>
                      )}
                      {(exam.attempt_count || 0) > 0 && (
                        <span>
                          Đã hoàn thành {exam.attempt_count} lần
                        </span>
                      )}
                      {exam.best_score != null && (
                        <span className="text-teal-600 dark:text-teal-400 font-medium">
                          Điểm cao nhất: {exam.best_score.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {exam.in_progress_attempt_id ? (
                      <button
                        onClick={() => handleContinuePractice(exam.in_progress_attempt_id!)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        <span className="hidden sm:inline">Tiếp tục</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartPractice(exam.id)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-medium transition-colors"
                      >
                        {(exam.attempt_count || 0) > 0 ? (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">Làm lại</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span className="hidden sm:inline">Bắt đầu</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
