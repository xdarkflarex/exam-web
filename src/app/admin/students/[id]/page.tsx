'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import Link from 'next/link'
import { 
  ArrowLeft, User, Mail, School, Calendar, Target, TrendingUp,
  Clock, FileText, Award, BarChart3, ChevronRight, AlertTriangle,
  CheckCircle, XCircle, Download
} from 'lucide-react'

interface StudentProfile {
  id: string
  full_name: string
  email: string
  school: string | null
  class_id: string | null
  created_at: string
}

interface ExamAttempt {
  id: string
  examId: string
  examTitle: string
  score: number
  totalQuestions: number
  correctAnswers: number
  timeSpent: number
  status: string
  createdAt: string
}

interface TopicStats {
  topicId: string
  topicName: string
  totalQuestions: number
  correctCount: number
  accuracy: number
}

interface ProgressPoint {
  date: string
  score: number
  examTitle: string
}

export default function StudentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const studentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState<StudentProfile | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [topicStats, setTopicStats] = useState<TopicStats[]>([])
  const [progressData, setProgressData] = useState<ProgressPoint[]>([])

  useEffect(() => {
    if (studentId) {
      fetchStudentData()
    }
  }, [studentId])

  const fetchStudentData = async () => {
    setLoading(true)
    try {
      // Fetch student profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single()

      if (profileError) {
        logger.supabaseError('fetch student profile', profileError)
        return
      }

      setStudent(profile)

      // Fetch exam attempts
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          exam_id,
          score,
          total_questions,
          correct_answers,
          time_spent,
          status,
          created_at,
          exams!exam_id(title)
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

      if (attemptsError) {
        logger.supabaseError('fetch attempts', attemptsError)
      } else if (attemptsData) {
        const formattedAttempts: ExamAttempt[] = attemptsData.map(a => ({
          id: a.id,
          examId: a.exam_id,
          examTitle: (a.exams as any)?.title || 'Đề thi',
          score: a.score || 0,
          totalQuestions: a.total_questions || 0,
          correctAnswers: a.correct_answers || 0,
          timeSpent: a.time_spent || 0,
          status: a.status,
          createdAt: a.created_at
        }))
        setAttempts(formattedAttempts)

        // Build progress data from attempts
        const completedAttempts = formattedAttempts
          .filter(a => a.status === 'submitted' || a.status === 'graded')
          .reverse()
        
        setProgressData(completedAttempts.map(a => ({
          date: a.createdAt,
          score: a.score,
          examTitle: a.examTitle
        })))
      }

      // Fetch topic statistics from student answers
      const { data: answersData } = await supabase
        .from('student_answers')
        .select(`
          is_correct,
          questions!question_id(
            id,
            question_taxonomy(
              topics!topic_id(id, name)
            )
          )
        `)
        .eq('attempt_id', attemptsData?.map(a => a.id) || [])

      if (answersData) {
        const topicMap = new Map<string, { name: string; total: number; correct: number }>()
        
        for (const answer of answersData) {
          const question = answer.questions as any
          const taxonomy = question?.question_taxonomy
          const topic = taxonomy?.topics
          
          if (topic) {
            if (!topicMap.has(topic.id)) {
              topicMap.set(topic.id, { name: topic.name, total: 0, correct: 0 })
            }
            const stats = topicMap.get(topic.id)!
            stats.total++
            if (answer.is_correct) stats.correct++
          }
        }

        const topicStatsList: TopicStats[] = Array.from(topicMap.entries())
          .map(([id, data]) => ({
            topicId: id,
            topicName: data.name,
            totalQuestions: data.total,
            correctCount: data.correct,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0
          }))
          .sort((a, b) => a.accuracy - b.accuracy)

        setTopicStats(topicStatsList)
      }

    } catch (err) {
      logger.error('Fetch student data error', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate stats
  const completedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'graded')
  const totalAttempts = completedAttempts.length
  const avgScore = totalAttempts > 0 
    ? completedAttempts.reduce((sum, a) => sum + a.score, 0) / totalAttempts 
    : 0
  const bestScore = totalAttempts > 0 
    ? Math.max(...completedAttempts.map(a => a.score)) 
    : 0
  const avgTime = totalAttempts > 0
    ? completedAttempts.reduce((sum, a) => sum + a.timeSpent, 0) / totalAttempts / 60
    : 0

  // Calculate score trend
  const recentScores = completedAttempts.slice(0, 5).map(a => a.score)
  const olderScores = completedAttempts.slice(5, 10).map(a => a.score)
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : recentAvg
  const scoreTrend = recentAvg - olderAvg

  const maxProgressScore = Math.max(...progressData.map(p => p.score), 10)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải thông tin...</p>
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <User className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Không tìm thấy học sinh</h2>
          <Link href="/admin/students" className="text-teal-600 hover:underline">Quay lại danh sách</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader 
        title="Chi tiết học sinh" 
        subtitle={student.full_name}
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Link 
          href="/admin/students"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </Link>

        {/* Student Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold">
              {student.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{student.full_name}</h2>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {student.email}
                </span>
                {student.school && (
                  <span className="flex items-center gap-1">
                    <School className="w-4 h-4" />
                    {student.school}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Tham gia: {formatDate(student.created_at).split(',')[0]}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{totalAttempts}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Lượt làm bài</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{avgScore.toFixed(2)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Điểm trung bình</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{bestScore.toFixed(1)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Điểm cao nhất</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${scoreTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {scoreTrend >= 0 ? '+' : ''}{scoreTrend.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Xu hướng điểm</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Progress Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
              Biểu đồ tiến bộ
            </h3>
            {progressData.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Chưa có dữ liệu</p>
            ) : (
              <div className="h-48 flex items-end justify-between gap-1">
                {progressData.slice(-10).map((point, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500">{point.score.toFixed(1)}</span>
                    <div 
                      className={`w-full rounded-t transition-all ${
                        point.score >= 8 ? 'bg-green-500' :
                        point.score >= 5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ height: `${(point.score / maxProgressScore) * 150}px` }}
                      title={point.examTitle}
                    />
                    <span className="text-xs text-slate-400 truncate w-full text-center">
                      {new Date(point.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weak Topics */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Chuyên đề cần ôn tập
            </h3>
            {topicStats.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Chưa có dữ liệu phân tích</p>
            ) : (
              <div className="space-y-3">
                {topicStats.slice(0, 5).map((topic) => (
                  <div key={topic.topicId} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      topic.accuracy >= 70 ? 'bg-green-100 dark:bg-green-900/30' :
                      topic.accuracy >= 50 ? 'bg-amber-100 dark:bg-amber-900/30' :
                      'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      {topic.accuracy >= 70 ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : topic.accuracy >= 50 ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-white">{topic.topicName}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              topic.accuracy >= 70 ? 'bg-green-500' :
                              topic.accuracy >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${topic.accuracy}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-12 text-right">{topic.accuracy.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Exam History */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Lịch sử làm bài</h3>
            <span className="text-sm text-slate-500">{attempts.length} lượt</span>
          </div>
          {attempts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Học sinh chưa làm bài thi nào</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 dark:text-white">{attempt.examTitle}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(attempt.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(attempt.timeSpent)}
                        </span>
                        <span>{attempt.correctAnswers}/{attempt.totalQuestions} câu đúng</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${
                        attempt.score >= 8 ? 'text-green-600 dark:text-green-400' :
                        attempt.score >= 5 ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {attempt.score.toFixed(1)}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        attempt.status === 'graded' || attempt.status === 'submitted'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      }`}>
                        {attempt.status === 'graded' || attempt.status === 'submitted' ? 'Hoàn thành' : 'Đang làm'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
