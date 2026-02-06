'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import { 
  BarChart3, TrendingUp, Users, Clock, Target, Award,
  Calendar, Filter, RefreshCw, ChevronDown, Trophy,
  ArrowUp, ArrowDown, Minus
} from 'lucide-react'

interface AnalyticsData {
  totalAttempts: number
  averageScore: number
  completionRate: number
  averageTime: number
  attemptsChange: number
  scoreChange: number
}

interface TopStudent {
  id: string
  name: string
  email: string
  avgScore: number
  totalAttempts: number
  trend: 'up' | 'down' | 'stable'
}

interface DailyAttempt {
  date: string
  count: number
}

interface ScoreDistribution {
  range: string
  count: number
  percentage: number
}

interface ExamStats {
  id: string
  title: string
  attempts: number
  avgScore: number
  completionRate: number
}

type TimeRange = '7d' | '30d' | '90d' | 'all'

export default function AnalyticsDashboard() {
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalAttempts: 0,
    averageScore: 0,
    completionRate: 0,
    averageTime: 0,
    attemptsChange: 0,
    scoreChange: 0
  })
  const [topStudents, setTopStudents] = useState<TopStudent[]>([])
  const [dailyAttempts, setDailyAttempts] = useState<DailyAttempt[]>([])
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution[]>([])
  const [examStats, setExamStats] = useState<ExamStats[]>([])

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const getDateRange = (range: TimeRange): Date => {
    const now = new Date()
    switch (range) {
      case '7d': return new Date(now.setDate(now.getDate() - 7))
      case '30d': return new Date(now.setDate(now.getDate() - 30))
      case '90d': return new Date(now.setDate(now.getDate() - 90))
      default: return new Date('2020-01-01')
    }
  }

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const startDate = getDateRange(timeRange).toISOString()
      
      // Fetch all attempts in date range
      const { data: attempts, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          student_id,
          exam_id,
          score,
          time_spent,
          status,
          created_at,
          profiles!student_id(full_name, email),
          exams!exam_id(title)
        `)
        .gte('created_at', startDate)
        .order('created_at', { ascending: false })

      if (error) {
        logger.supabaseError('fetch analytics', error)
        return
      }

      if (!attempts || attempts.length === 0) {
        setLoading(false)
        return
      }

      // Calculate main analytics
      const completedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'graded')
      const totalAttempts = attempts.length
      const avgScore = completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedAttempts.length
        : 0
      const completionRate = totalAttempts > 0 
        ? (completedAttempts.length / totalAttempts) * 100 
        : 0
      const avgTime = completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.time_spent || 0), 0) / completedAttempts.length / 60
        : 0

      setAnalytics({
        totalAttempts,
        averageScore: avgScore,
        completionRate,
        averageTime: avgTime,
        attemptsChange: 12.5, // Would calculate from previous period
        scoreChange: 0.3
      })

      // Calculate top students
      const studentMap = new Map<string, { name: string; email: string; scores: number[]; attempts: number }>()
      for (const attempt of completedAttempts) {
        const profile = attempt.profiles as any
        const studentId = attempt.student_id
        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            name: profile?.full_name || 'Học sinh',
            email: profile?.email || '',
            scores: [],
            attempts: 0
          })
        }
        const student = studentMap.get(studentId)!
        student.scores.push(attempt.score || 0)
        student.attempts++
      }

      const topStudentsList: TopStudent[] = Array.from(studentMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          email: data.email,
          avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
          totalAttempts: data.attempts,
          trend: data.scores.length > 1 
            ? (data.scores[0] > data.scores[data.scores.length - 1] ? 'up' : 'down')
            : 'stable' as const
        }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 10)

      setTopStudents(topStudentsList)

      // Calculate daily attempts (last 7 days for chart)
      const dailyMap = new Map<string, number>()
      const last7Days = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        dailyMap.set(dateStr, 0)
        last7Days.push(dateStr)
      }
      
      for (const attempt of attempts) {
        const dateStr = attempt.created_at.split('T')[0]
        if (dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + 1)
        }
      }

      setDailyAttempts(last7Days.map(date => ({
        date,
        count: dailyMap.get(date) || 0
      })))

      // Calculate score distribution
      const ranges = [
        { range: '0-2', min: 0, max: 2 },
        { range: '2-4', min: 2, max: 4 },
        { range: '4-5', min: 4, max: 5 },
        { range: '5-6', min: 5, max: 6 },
        { range: '6-7', min: 6, max: 7 },
        { range: '7-8', min: 7, max: 8 },
        { range: '8-9', min: 8, max: 9 },
        { range: '9-10', min: 9, max: 10.1 }
      ]

      const distribution = ranges.map(r => {
        const count = completedAttempts.filter(a => 
          (a.score || 0) >= r.min && (a.score || 0) < r.max
        ).length
        return {
          range: r.range,
          count,
          percentage: completedAttempts.length > 0 ? (count / completedAttempts.length) * 100 : 0
        }
      })

      setScoreDistribution(distribution)

      // Calculate exam stats
      const examMap = new Map<string, { title: string; attempts: number; scores: number[]; completed: number }>()
      for (const attempt of attempts) {
        const exam = attempt.exams as any
        const examId = attempt.exam_id
        if (!examMap.has(examId)) {
          examMap.set(examId, {
            title: exam?.title || 'Đề thi',
            attempts: 0,
            scores: [],
            completed: 0
          })
        }
        const examData = examMap.get(examId)!
        examData.attempts++
        if (attempt.status === 'submitted' || attempt.status === 'graded') {
          examData.scores.push(attempt.score || 0)
          examData.completed++
        }
      }

      const examStatsList: ExamStats[] = Array.from(examMap.entries())
        .map(([id, data]) => ({
          id,
          title: data.title,
          attempts: data.attempts,
          avgScore: data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
          completionRate: data.attempts > 0 ? (data.completed / data.attempts) * 100 : 0
        }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 5)

      setExamStats(examStatsList)

    } catch (err) {
      logger.error('Analytics fetch error', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  }

  const maxDailyCount = Math.max(...dailyAttempts.map(d => d.count), 1)

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader 
        title="Thống kê & Phân tích" 
        subtitle="Tổng quan hiệu suất học tập của học sinh"
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {range === '7d' ? '7 ngày' : range === '30d' ? '30 ngày' : range === '90d' ? '90 ngày' : 'Tất cả'}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${
                analytics.attemptsChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {analytics.attemptsChange >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(analytics.attemptsChange).toFixed(1)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{analytics.totalAttempts.toLocaleString()}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Lượt làm bài</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${
                analytics.scoreChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {analytics.scoreChange >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(analytics.scoreChange).toFixed(1)}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{analytics.averageScore.toFixed(2)}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Điểm trung bình</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{analytics.completionRate.toFixed(1)}%</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tỷ lệ hoàn thành</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{analytics.averageTime.toFixed(0)} phút</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Thời gian TB</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Daily Attempts Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Lượt làm bài theo ngày</h3>
            <div className="flex items-end justify-between gap-2 h-40">
              {dailyAttempts.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">{day.count}</span>
                    <div 
                      className="w-full bg-teal-500 dark:bg-teal-600 rounded-t-sm transition-all"
                      style={{ height: `${(day.count / maxDailyCount) * 100}px`, minHeight: day.count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(day.date)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Score Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Phân bố điểm số</h3>
            <div className="space-y-3">
              {scoreDistribution.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400 w-12">{item.range}</span>
                  <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        parseFloat(item.range.split('-')[0]) >= 8 ? 'bg-green-500' :
                        parseFloat(item.range.split('-')[0]) >= 5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400 w-16 text-right">
                    {item.count} ({item.percentage.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Students */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top 10 Học Sinh
              </h3>
            </div>
            <div className="space-y-3">
              {topStudents.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Chưa có dữ liệu</p>
              ) : (
                topStudents.map((student, i) => (
                  <div key={student.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                      i === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300' :
                      i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 dark:text-white truncate">{student.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{student.totalAttempts} lượt làm bài</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-teal-600 dark:text-teal-400">{student.avgScore.toFixed(2)}</p>
                      <div className="flex items-center justify-end gap-1 text-xs">
                        {student.trend === 'up' && <ArrowUp className="w-3 h-3 text-green-500" />}
                        {student.trend === 'down' && <ArrowDown className="w-3 h-3 text-red-500" />}
                        {student.trend === 'stable' && <Minus className="w-3 h-3 text-slate-400" />}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Exam Stats */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Thống kê theo đề thi</h3>
            <div className="space-y-3">
              {examStats.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Chưa có dữ liệu</p>
              ) : (
                examStats.map((exam) => (
                  <div key={exam.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-slate-800 dark:text-white truncate flex-1">{exam.title}</p>
                      <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">{exam.attempts} lượt</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-600 dark:text-slate-400">
                        Điểm TB: <span className="font-medium text-teal-600 dark:text-teal-400">{exam.avgScore.toFixed(2)}</span>
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        Hoàn thành: <span className="font-medium">{exam.completionRate.toFixed(0)}%</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
