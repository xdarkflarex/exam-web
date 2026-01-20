'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  FileText, 
  Clock, 
  Play, 
  Search,
  Filter,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

interface Exam {
  id: string
  title: string
  description: string | null
  subject: string
  duration: number
  is_published: boolean
  created_at: string
  question_count?: number
  attempt_count?: number
  best_score?: number | null
}

export default function ExamsPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'attempted' | 'not_attempted'>('all')
  const [startingExam, setStartingExam] = useState<string | null>(null)

  useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch published exams
      const { data: examsData, error } = await supabase
        .from('exams')
        .select('id, title, description, subject, duration, is_published, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Fetch exams error:', error)
        return
      }

      // Fetch attempt info for each exam
      const examIds = examsData?.map(e => e.id) || []
      
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('exam_id, score, status')
        .eq('student_id', user.id)
        .in('exam_id', examIds)

      // Process exams with attempt data
      const processedExams: Exam[] = (examsData || []).map(exam => {
        const examAttempts = attempts?.filter(a => a.exam_id === exam.id) || []
        const completedAttempts = examAttempts.filter(a => a.status === 'submitted')
        const bestScore = completedAttempts.length > 0 
          ? Math.max(...completedAttempts.map(a => a.score || 0))
          : null

        return {
          ...exam,
          attempt_count: completedAttempts.length,
          best_score: bestScore
        }
      })

      setExams(processedExams)
    } catch (error) {
      console.error('Error fetching exams:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartExam = async (examId: string) => {
    setStartingExam(examId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Check for existing in-progress attempt
      const { data: existingAttempt } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle()

      if (existingAttempt) {
        router.push(`/exam/${existingAttempt.id}`)
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

      router.push(`/exam/${newAttempt.id}`)
    } catch (error) {
      console.error('Error starting exam:', error)
    } finally {
      setStartingExam(null)
    }
  }

  // Filter exams
  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          exam.subject.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesFilter = filterStatus === 'all' ||
                          (filterStatus === 'attempted' && (exam.attempt_count || 0) > 0) ||
                          (filterStatus === 'not_attempted' && (exam.attempt_count || 0) === 0)

    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải đề thi...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Đề thi
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Chọn đề thi và bắt đầu luyện tập
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm đề thi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'not_attempted', label: 'Chưa thi' },
              { key: 'attempted', label: 'Đã thi' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setFilterStatus(filter.key as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
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
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                {searchQuery || filterStatus !== 'all' 
                  ? 'Không tìm thấy đề thi phù hợp'
                  : 'Chưa có đề thi nào'
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
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                        {exam.title}
                      </h3>
                      {(exam.attempt_count || 0) > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Đã thi
                        </span>
                      )}
                    </div>
                    
                    {exam.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">
                        {exam.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {exam.duration} phút
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                        {exam.subject}
                      </span>
                      {(exam.attempt_count || 0) > 0 && (
                        <span>
                          Đã thi {exam.attempt_count} lần
                        </span>
                      )}
                      {exam.best_score != null && (
                        <span className="text-teal-600 dark:text-teal-400 font-medium">
                          Điểm cao nhất: {exam.best_score.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartExam(exam.id)}
                    disabled={startingExam === exam.id}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:bg-teal-400 text-white rounded-xl font-medium transition-colors"
                  >
                    {startingExam === exam.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="hidden sm:inline">Đang mở...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span className="hidden sm:inline">
                          {(exam.attempt_count || 0) > 0 ? 'Thi lại' : 'Bắt đầu'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
