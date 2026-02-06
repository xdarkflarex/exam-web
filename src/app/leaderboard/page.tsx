'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { StudentHeader } from '@/components/student'
import { 
  Trophy, Medal, Crown, TrendingUp, Calendar, Filter,
  ChevronDown, User, Target, Award, Flame, Star
} from 'lucide-react'

interface LeaderboardEntry {
  rank: number
  id: string
  name: string
  avatarInitial: string
  avgScore: number
  totalAttempts: number
  bestScore: number
  isCurrentUser: boolean
}

type TimeRange = 'week' | 'month' | 'all'
type SortBy = 'avgScore' | 'totalAttempts' | 'bestScore'

export default function LeaderboardPage() {
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardEntry | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  const [sortBy, setSortBy] = useState<SortBy>('avgScore')
  const [selectedExam, setSelectedExam] = useState<string>('all')
  const [exams, setExams] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    getCurrentUser()
    fetchExams()
  }, [])

  useEffect(() => {
    if (currentUserId !== null) {
      fetchLeaderboard()
    }
  }, [timeRange, sortBy, selectedExam, currentUserId])

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)
  }

  const fetchExams = async () => {
    const { data } = await supabase
      .from('exams')
      .select('id, title')
      .eq('is_published', true)
      .order('title')
    
    setExams(data || [])
  }

  const getDateRange = (range: TimeRange): Date | null => {
    const now = new Date()
    switch (range) {
      case 'week': return new Date(now.setDate(now.getDate() - 7))
      case 'month': return new Date(now.setDate(now.getDate() - 30))
      default: return null
    }
  }

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('exam_attempts')
        .select(`
          student_id,
          score,
          exam_id,
          created_at,
          status,
          profiles!student_id(full_name)
        `)
        .in('status', ['submitted', 'graded'])

      // Filter by time range
      const startDate = getDateRange(timeRange)
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString())
      }

      // Filter by exam
      if (selectedExam !== 'all') {
        query = query.eq('exam_id', selectedExam)
      }

      const { data: attempts, error } = await query

      if (error) {
        logger.supabaseError('fetch leaderboard', error)
        return
      }

      // Group by student and calculate stats
      const studentMap = new Map<string, {
        name: string
        scores: number[]
      }>()

      for (const attempt of attempts || []) {
        const profile = attempt.profiles as any
        const studentId = attempt.student_id
        
        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            name: profile?.full_name || 'Học sinh',
            scores: []
          })
        }
        
        if (attempt.score !== null) {
          studentMap.get(studentId)!.scores.push(attempt.score)
        }
      }

      // Build leaderboard entries
      let entries: LeaderboardEntry[] = Array.from(studentMap.entries())
        .filter(([_, data]) => data.scores.length > 0)
        .map(([id, data]) => ({
          rank: 0,
          id,
          name: data.name,
          avatarInitial: data.name.charAt(0).toUpperCase(),
          avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
          totalAttempts: data.scores.length,
          bestScore: Math.max(...data.scores),
          isCurrentUser: id === currentUserId
        }))

      // Sort based on selected criteria
      entries.sort((a, b) => {
        switch (sortBy) {
          case 'avgScore': return b.avgScore - a.avgScore
          case 'totalAttempts': return b.totalAttempts - a.totalAttempts
          case 'bestScore': return b.bestScore - a.bestScore
          default: return 0
        }
      })

      // Assign ranks
      entries.forEach((entry, i) => {
        entry.rank = i + 1
      })

      // Find current user's position
      const userEntry = entries.find(e => e.isCurrentUser)
      setCurrentUserRank(userEntry || null)

      setLeaderboard(entries.slice(0, 50)) // Top 50

    } catch (err) {
      logger.error('Fetch leaderboard error', err)
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-yellow-500" />
      case 2: return <Medal className="w-6 h-6 text-slate-400" />
      case 3: return <Medal className="w-6 h-6 text-amber-600" />
      default: return <span className="text-lg font-bold text-slate-500">{rank}</span>
    }
  }

  const getRankBgColor = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800'
      case 2: return 'bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-600/50 border-slate-300 dark:border-slate-600'
      case 3: return 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800'
      default: return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <StudentHeader title="Bảng xếp hạng" />

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Current User Rank Card */}
        {currentUserRank && (
          <div className="bg-gradient-to-r from-teal-500 to-blue-600 rounded-2xl p-5 mb-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                  {currentUserRank.avatarInitial}
                </div>
                <div>
                  <p className="text-white/80 text-sm">Thứ hạng của bạn</p>
                  <p className="text-3xl font-bold">#{currentUserRank.rank}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-white/80 text-xs">Điểm TB</p>
                    <p className="text-xl font-bold">{currentUserRank.avgScore.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-white/80 text-xs">Lượt thi</p>
                    <p className="text-xl font-bold">{currentUserRank.totalAttempts}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-wrap gap-3">
            {/* Time Range */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              {(['week', 'month', 'all'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {range === 'week' ? '7 ngày' : range === 'month' ? '30 ngày' : 'Tất cả'}
                </button>
              ))}
            </div>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-teal-500"
            >
              <option value="avgScore">Điểm trung bình</option>
              <option value="bestScore">Điểm cao nhất</option>
              <option value="totalAttempts">Số lượt thi</option>
            </select>

            {/* Exam Filter */}
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="flex-1 min-w-[150px] px-3 py-2 bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">Tất cả đề thi</option>
              {exams.map(exam => (
                <option key={exam.id} value={exam.id}>{exam.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có dữ liệu</h3>
            <p className="text-slate-500 dark:text-slate-400">Hãy là người đầu tiên làm bài thi!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
              <div className="flex items-end justify-center gap-4 mb-8 pt-8">
                {/* 2nd Place */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-xl font-bold mb-2">
                    {leaderboard[1].avatarInitial}
                  </div>
                  <Medal className="w-8 h-8 text-slate-400 mb-1" />
                  <p className="font-medium text-slate-800 dark:text-white text-sm text-center truncate max-w-[100px]">
                    {leaderboard[1].name}
                  </p>
                  <p className="text-lg font-bold text-teal-600">{leaderboard[1].avgScore.toFixed(2)}</p>
                  <div className="w-20 h-16 bg-slate-200 dark:bg-slate-700 rounded-t-lg mt-2"></div>
                </div>

                {/* 1st Place */}
                <div className="flex flex-col items-center -mt-4">
                  <Crown className="w-8 h-8 text-yellow-500 mb-1" />
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-white text-2xl font-bold mb-2 ring-4 ring-yellow-300 dark:ring-yellow-600">
                    {leaderboard[0].avatarInitial}
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-white text-center truncate max-w-[120px]">
                    {leaderboard[0].name}
                  </p>
                  <p className="text-xl font-bold text-teal-600">{leaderboard[0].avgScore.toFixed(2)}</p>
                  <div className="w-24 h-24 bg-yellow-100 dark:bg-yellow-900/30 rounded-t-lg mt-2"></div>
                </div>

                {/* 3rd Place */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xl font-bold mb-2">
                    {leaderboard[2].avatarInitial}
                  </div>
                  <Medal className="w-8 h-8 text-amber-600 mb-1" />
                  <p className="font-medium text-slate-800 dark:text-white text-sm text-center truncate max-w-[100px]">
                    {leaderboard[2].name}
                  </p>
                  <p className="text-lg font-bold text-teal-600">{leaderboard[2].avgScore.toFixed(2)}</p>
                  <div className="w-20 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-t-lg mt-2"></div>
                </div>
              </div>
            )}

            {/* Full List */}
            {leaderboard.slice(3).map((entry) => (
              <div 
                key={entry.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  entry.isCurrentUser 
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 ring-2 ring-teal-500/50' 
                    : getRankBgColor(entry.rank)
                }`}
              >
                <div className="w-10 h-10 flex items-center justify-center">
                  {getRankIcon(entry.rank)}
                </div>
                
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold">
                  {entry.avatarInitial}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${
                    entry.isCurrentUser ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-white'
                  }`}>
                    {entry.name} {entry.isCurrentUser && <span className="text-xs">(Bạn)</span>}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {entry.totalAttempts} lượt thi
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
                    {sortBy === 'avgScore' ? entry.avgScore.toFixed(2) : 
                     sortBy === 'bestScore' ? entry.bestScore.toFixed(1) :
                     entry.totalAttempts}
                  </p>
                  <p className="text-xs text-slate-500">
                    {sortBy === 'avgScore' ? 'điểm TB' : 
                     sortBy === 'bestScore' ? 'cao nhất' : 'lượt'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
