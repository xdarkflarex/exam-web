'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  FileText, 
  Clock, 
  Play, 
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  ChevronRight,
  Flame,
  BookOpen,
  PenTool,
  ClipboardList,
  BarChart3,
  Sparkles
} from 'lucide-react'
import { getStudentCapabilitySummary, type StudentCapabilitySummary } from '@/lib/analytics/student-capability'

interface Exam {
  id: string
  title: string
  subject: string
  duration: number
}

interface RecentAttempt {
  id: string
  exam_title: string
  score: number
  submit_time: string
}

interface WeakArea {
  section_name: string
  topic_name: string
  percentage: number
  total: number
}

interface InProgressAttempt {
  id: string
  exam_id: string
  exam_title: string
  start_time: string
  exam_mode?: string
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'object' && value[0] !== null
      ? value[0] as Record<string, unknown>
      : null
  }
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
}

function relationString(value: unknown, key: string, fallback = ''): string {
  const record = relationRecord(value)
  return typeof record?.[key] === 'string' ? record[key] : fallback
}

export default function StudentPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalAttempts: 0,
    bestScore: 0,
    avgScore: 0,
    passRate: 0,
    streak: 0
  })
  const [recentExams, setRecentExams] = useState<Exam[]>([])
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([])
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([])
  const [inProgressAttempt, setInProgressAttempt] = useState<InProgressAttempt | null>(null)
  const [practiceInProgress, setPracticeInProgress] = useState<InProgressAttempt | null>(null)
  const [capabilitySummary, setCapabilitySummary] = useState<StudentCapabilitySummary | null>(null)
  const [studentGrade, setStudentGrade] = useState<number | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, grade')
        .eq('id', user.id)
        .single()
      
      setUserName(profile?.full_name || 'Học sinh')
      setStudentGrade(profile?.grade || null)

      // Fetch all data in parallel
      await Promise.all([
        getStudentCapabilitySummary(user.id).then(setCapabilitySummary).catch(() => setCapabilitySummary(null)),
        fetchStats(user.id),
        fetchRecentExams(profile?.grade),
        fetchRecentAttempts(user.id),
        fetchWeakAreas(),
        fetchInProgressAttempt(user.id)
      ])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async (userId: string) => {
    const { data: attempts } = await supabase
      .from('exam_attempts')
      .select('score, submit_time')
      .eq('student_id', userId)
      .eq('status', 'submitted')

    if (attempts && attempts.length > 0) {
      const scores = attempts.map(a => a.score || 0)
      const passedCount = scores.filter(s => s >= 5).length
      
      // Calculate streak (consecutive days with attempts)
      const dates = attempts
        .map(a => a.submit_time ? new Date(a.submit_time).toDateString() : null)
        .filter(Boolean)
      const uniqueDates = [...new Set(dates)].sort().reverse()
      let streak = 0
      const today = new Date().toDateString()
      const yesterday = new Date(Date.now() - 86400000).toDateString()
      
      if (uniqueDates[0] === today || uniqueDates[0] === yesterday) {
        streak = 1
        for (let i = 1; i < uniqueDates.length; i++) {
          const currentDate = new Date(uniqueDates[i - 1]!)
          const prevDate = new Date(uniqueDates[i]!)
          const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / 86400000)
          if (diffDays === 1) {
            streak++
          } else {
            break
          }
        }
      }

      setStats({
        totalAttempts: attempts.length,
        bestScore: Math.max(...scores),
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        passRate: Math.round((passedCount / attempts.length) * 100),
        streak
      })
    }
  }

  const fetchRecentExams = async (grade?: number | null) => {
    let query = supabase
      .from('exams')
      .select('id, title, subject, duration')
      .eq('is_published', true)
      .eq('exam_mode', 'simulation')
      .order('created_at', { ascending: false })
      .limit(3)

    if (grade) {
      query = query.eq('grade', grade)
    }

    const { data } = await query
    setRecentExams(data || [])
  }

  const fetchRecentAttempts = async (userId: string) => {
    const { data } = await supabase
      .from('exam_attempts')
      .select(`
        id,
        score,
        submit_time,
        exams!exam_id (title)
      `)
      .eq('student_id', userId)
      .eq('status', 'submitted')
      .order('submit_time', { ascending: false })
      .limit(3)

    const attempts: RecentAttempt[] = (data || []).map(a => ({
      id: a.id,
      exam_title: relationString(a.exams, 'title', 'Không rõ'),
      score: a.score || 0,
      submit_time: a.submit_time!
    }))

    setRecentAttempts(attempts)
  }

  const fetchWeakAreas = async () => {
    const { data } = await supabase.rpc('get_my_exam_answer_metadata', {
      p_attempt_id: null,
    })

    // Aggregate by section
    const sectionStats = new Map<string, { correct: number; total: number; topic: string }>()

    ;((data || []) as Array<{
      is_correct: boolean | null
      section_name: string | null
      topic_name: string | null
    }>).forEach((answer) => {
      if (!answer.section_name) return

      const sectionName = answer.section_name
      const topicName = answer.topic_name || ''

      if (!sectionStats.has(sectionName)) {
        sectionStats.set(sectionName, { correct: 0, total: 0, topic: topicName })
      }

      const stats = sectionStats.get(sectionName)!
      stats.total++
      if (answer.is_correct) stats.correct++
    })

    // Find weak areas (below 60% accuracy, min 3 questions)
    const weak: WeakArea[] = Array.from(sectionStats.entries())
      .filter(([, stats]) => stats.total >= 3 && (stats.correct / stats.total) < 0.6)
      .map(([name, stats]) => ({
        section_name: name,
        topic_name: stats.topic,
        percentage: Math.round((stats.correct / stats.total) * 100),
        total: stats.total
      }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 3)

    setWeakAreas(weak)
  }

  const fetchInProgressAttempt = async (userId: string) => {
    const { data: attempts } = await supabase
      .from('exam_attempts')
      .select(`
        id,
        exam_id,
        start_time,
        exams!exam_id (title, exam_mode)
      `)
      .eq('student_id', userId)
      .eq('status', 'in_progress')
      .order('start_time', { ascending: false })
      .limit(2)

    if (attempts) {
      for (const data of attempts) {
        const examMode = relationString(data.exams, 'exam_mode')
        const item: InProgressAttempt = {
          id: data.id,
          exam_id: data.exam_id,
          exam_title: relationString(data.exams, 'title', 'Không rõ'),
          start_time: data.start_time,
          exam_mode: examMode
        }
        if (examMode === 'practice' && !practiceInProgress) {
          setPracticeInProgress(item)
        } else if (examMode === 'simulation' && !inProgressAttempt) {
          setInProgressAttempt(item)
        }
      }
    }
  }

  const handleStartExam = (examId: string) => {
    // Redirect to preparation page instead of directly starting exam
    router.push(`/exam/prepare/${examId}`)
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 dark:text-green-400'
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/30'
    if (score >= 5) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-6 animate-fade-in-up">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white mb-2">
            Xin chào, {userName}! 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Hôm nay bạn muốn luyện tập gì?
          </p>
        </div>

        {/* Quick Stats */}
        {stats.totalAttempts > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6 animate-list-stagger">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <FileText className="w-4 h-4" />
                Đã làm
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {stats.totalAttempts}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Target className="w-4 h-4" />
                Cao nhất
              </div>
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {stats.bestScore.toFixed(1)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <TrendingUp className="w-4 h-4" />
                Trung bình
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {stats.avgScore.toFixed(1)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Award className="w-4 h-4" />
                Tỷ lệ đạt
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-white">
                {stats.passRate}%
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Flame className="w-4 h-4 text-orange-500" />
                Streak
              </div>
              <div className="text-2xl font-bold text-orange-500">
                {stats.streak} ngày
              </div>
            </div>
          </div>
        )}

        {/* Continue Practice */}
        {practiceInProgress && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-5 mb-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm mb-1">📝 Tiếp tục ôn tập</p>
                <h3 className="font-semibold text-lg">{practiceInProgress.exam_title}</h3>
                <p className="text-amber-100 text-sm mt-1">Không giới hạn thời gian</p>
              </div>
              <button
                onClick={() => router.push(`/practice/${practiceInProgress.id}`)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-amber-600 rounded-xl font-medium hover:bg-amber-50 transition-colors"
              >
                <Play className="w-4 h-4" />
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {/* Continue Exam */}
        {inProgressAttempt && (
          <div className="bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl p-5 mb-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-teal-100 text-sm mb-1">📌 Tiếp tục thi thử</p>
                <h3 className="font-semibold text-lg">{inProgressAttempt.exam_title}</h3>
                <p className="text-teal-100 text-sm mt-1">
                  Bắt đầu lúc {new Date(inProgressAttempt.start_time).toLocaleTimeString('vi-VN')}
                </p>
              </div>
              <button
                onClick={() => router.push(`/exam/prepare/${inProgressAttempt.exam_id}`)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-teal-600 rounded-xl font-medium hover:bg-teal-50 transition-colors"
              >
                <Play className="w-4 h-4" />
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {capabilitySummary && <CapabilityPrompt summary={capabilitySummary} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Exams */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-teal-600" />
                  Đề thi thử mới
                </h2>
                <Link 
                  href="/student/exams"
                  className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Xem tất cả
                </Link>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700 animate-list-stagger">
                {recentExams.map(exam => (
                  <div 
                    key={exam.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div>
                      <h3 className="font-medium text-slate-800 dark:text-white">
                        {exam.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {exam.duration} phút
                        </span>
                        <span>{exam.subject}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartExam(exam.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-medium btn-action-sm"
                    >
                      <Play className="w-4 h-4" />
                      Làm bài
                    </button>
                  </div>
                ))}
                {recentExams.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    Chưa có đề thi nào
                  </div>
                )}
              </div>
            </div>

            {/* Weak Areas */}
            {weakAreas.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Phần cần cải thiện
                  </h2>
                </div>
                <div className="space-y-3">
                  {weakAreas.map((area, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl"
                    >
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white">
                          {area.section_name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {area.topic_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${
                          area.percentage < 50 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {area.percentage}%
                        </p>
                        <p className="text-xs text-slate-500">{area.total} câu</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  href="/student/history"
                  className="flex items-center justify-center gap-1 mt-4 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Xem chi tiết thống kê
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Right Column - Recent Results */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h2 className="font-semibold text-slate-800 dark:text-white">
                  Kết quả gần đây
                </h2>
                <Link 
                  href="/student/history"
                  className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Xem tất cả
                </Link>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700 animate-list-stagger">
                {recentAttempts.map(attempt => (
                  <button
                    key={attempt.id}
                    onClick={() => router.push(`/result/${attempt.id}`)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${getScoreBgColor(attempt.score)} ${getScoreColor(attempt.score)}`}>
                      {attempt.score.toFixed(1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate">
                        {attempt.exam_title}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {new Date(attempt.submit_time).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </button>
                ))}
                {recentAttempts.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    Chưa có kết quả nào
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800 rounded-xl p-5 text-white">
              <h3 className="font-semibold mb-3">🎯 Mục tiêu hôm nay</h3>
              <p className="text-slate-300 text-sm mb-4">
                Hoàn thành ít nhất 1 đề thi để duy trì streak!
              </p>
              <div className="space-y-2">
                <Link
                  href="/student/practice"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-white text-slate-800 rounded-lg font-medium hover:bg-slate-100 btn-action-sm"
                >
                  <PenTool className="w-4 h-4" />
                  Ôn tập
                </Link>
                <Link
                  href="/student/exams"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 btn-action-sm"
                >
                  <Play className="w-4 h-4" />
                  Thi thử
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CapabilityPrompt({ summary }: { summary: StudentCapabilitySummary }) {
  const actionTone = {
    teal: 'from-teal-600 to-cyan-600',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-red-500',
    slate: 'from-slate-700 to-slate-900',
  }[summary.recommendedAction.tone]

  return (
    <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className={`animate-fade-in-up-delay-2 rounded-xl bg-gradient-to-r ${actionTone} p-5 text-white shadow-sm`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/75">
              <Sparkles className="h-4 w-4" />
              Việc nên làm tiếp theo
            </p>
            <h2 className="mt-1 text-xl font-semibold">{summary.recommendedAction.label}</h2>
            <p className="mt-1 text-sm text-white/80">{summary.recommendedAction.detail}</p>
          </div>
          <Link
            href={summary.recommendedAction.href}
            className="btn-action-sm inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
          >
            Mở ngay
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="animate-fade-in-up-delay-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <ClipboardList className="h-4 w-4 text-teal-600" />
            Bài được giao
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{summary.totals.submitted}/{summary.totals.assigned}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.totals.pending} bài đang chờ</p>
        </div>
        <Link
          href="/student/analytics"
          className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <BarChart3 className="h-4 w-4 text-teal-600" />
            Độ chính xác
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{summary.totals.accuracy}%</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.student.canViewAdvancedAnalytics ? 'Xem hồ sơ năng lực' : 'Tổng quan học tập'}
          </p>
        </Link>
      </div>
    </section>
  )
}
