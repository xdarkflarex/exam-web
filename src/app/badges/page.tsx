'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { StudentHeader } from '@/components/student'
import { 
  Award, Trophy, Target, Flame, Star, Lock,
  CheckCircle, TrendingUp, Zap
} from 'lucide-react'

interface Badge {
  id: string
  code: string
  name: string
  description: string | null
  icon: string
  category: 'achievement' | 'streak' | 'score' | 'milestone'
  requirement_type: string
  requirement_value: number
  points: number
}

interface UserBadge {
  badge_id: string
  earned_at: string
}

interface UserStats {
  totalExams: number
  avgScore: number
  highestScore: number
  currentStreak: number
}

const categoryConfig = {
  milestone: { label: 'Cột mốc', color: 'from-blue-500 to-cyan-500' },
  score: { label: 'Điểm cao', color: 'from-amber-500 to-orange-500' },
  streak: { label: 'Streak', color: 'from-red-500 to-pink-500' },
  achievement: { label: 'Thành tích', color: 'from-purple-500 to-indigo-500' }
}

export default function BadgesPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState<Badge[]>([])
  const [earnedBadges, setEarnedBadges] = useState<Map<string, string>>(new Map())
  const [stats, setStats] = useState<UserStats>({
    totalExams: 0,
    avgScore: 0,
    highestScore: 0,
    currentStreak: 0
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch all badges
      const { data: badgesData } = await supabase
        .from('badges')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('requirement_value')

      setBadges(badgesData || [])

      // Fetch user's earned badges
      const { data: userBadgesData } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', user.id)

      const earned = new Map<string, string>()
      for (const ub of userBadgesData || []) {
        earned.set(ub.badge_id, ub.earned_at)
      }
      setEarnedBadges(earned)

      // Fetch user stats for progress calculation
      const { data: attemptsData } = await supabase
        .from('exam_attempts')
        .select('score, created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      if (attemptsData && attemptsData.length > 0) {
        const scores = attemptsData.map(a => a.score || 0)
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
        const highestScore = Math.max(...scores)

        // Calculate streak
        let streak = 0
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const attemptDates = new Set(
          attemptsData.map(a => {
            const d = new Date(a.created_at)
            d.setHours(0, 0, 0, 0)
            return d.getTime()
          })
        )

        for (let i = 0; i < 365; i++) {
          const checkDate = new Date(today)
          checkDate.setDate(checkDate.getDate() - i)
          if (attemptDates.has(checkDate.getTime())) {
            streak++
          } else if (i > 0) {
            break
          }
        }

        setStats({
          totalExams: attemptsData.length,
          avgScore: Math.round(avgScore * 10) / 10,
          highestScore,
          currentStreak: streak
        })
      }

    } catch (err) {
      logger.error('Fetch badges error', err)
    } finally {
      setLoading(false)
    }
  }

  const getProgress = (badge: Badge): number => {
    switch (badge.requirement_type) {
      case 'total_exams':
        return Math.min(100, (stats.totalExams / badge.requirement_value) * 100)
      case 'high_score':
        return Math.min(100, (stats.highestScore / badge.requirement_value) * 100)
      case 'streak_days':
        return Math.min(100, (stats.currentStreak / badge.requirement_value) * 100)
      case 'avg_score':
        return Math.min(100, (stats.avgScore / badge.requirement_value) * 100)
      default:
        return 0
    }
  }

  const getProgressText = (badge: Badge): string => {
    switch (badge.requirement_type) {
      case 'total_exams':
        return `${stats.totalExams}/${badge.requirement_value} bài`
      case 'high_score':
        return `${stats.highestScore}/${badge.requirement_value} điểm`
      case 'streak_days':
        return `${stats.currentStreak}/${badge.requirement_value} ngày`
      case 'avg_score':
        return `${stats.avgScore}/${badge.requirement_value} điểm TB`
      default:
        return ''
    }
  }

  const earnedCount = earnedBadges.size
  const totalPoints = badges
    .filter(b => earnedBadges.has(b.id))
    .reduce((sum, b) => sum + b.points, 0)

  // Group badges by category
  const groupedBadges = badges.reduce((acc, badge) => {
    if (!acc[badge.category]) {
      acc[badge.category] = []
    }
    acc[badge.category].push(badge)
    return acc
  }, {} as Record<string, Badge[]>)

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <StudentHeader title="Thành tích" />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Header Stats */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Bộ sưu tập huy hiệu</h1>
              <p className="text-white/80">Hoàn thành thử thách để mở khóa huy hiệu</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{earnedCount}</p>
              <p className="text-sm text-white/70">Huy hiệu</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{totalPoints}</p>
              <p className="text-sm text-white/70">Điểm thưởng</p>
            </div>
            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{badges.length - earnedCount}</p>
              <p className="text-sm text-white/70">Còn lại</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : badges.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Award className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có huy hiệu</h3>
            <p className="text-slate-500 dark:text-slate-400">Hệ thống huy hiệu đang được cập nhật</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedBadges).map(([category, categoryBadges]) => {
              const config = categoryConfig[category as keyof typeof categoryConfig]
              
              return (
                <div key={category}>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${config.color}`} />
                    {config.label}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {categoryBadges.map((badge) => {
                      const isEarned = earnedBadges.has(badge.id)
                      const earnedAt = earnedBadges.get(badge.id)
                      const progress = getProgress(badge)

                      return (
                        <div
                          key={badge.id}
                          className={`relative bg-white dark:bg-slate-800 rounded-xl border ${
                            isEarned 
                              ? 'border-amber-300 dark:border-amber-600' 
                              : 'border-slate-200 dark:border-slate-700'
                          } p-5 transition-all ${!isEarned && 'opacity-70'}`}
                        >
                          {isEarned && (
                            <div className="absolute -top-2 -right-2">
                              <CheckCircle className="w-6 h-6 text-green-500 bg-white dark:bg-slate-800 rounded-full" />
                            </div>
                          )}

                          <div className="flex items-start gap-4">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl ${
                              isEarned 
                                ? `bg-gradient-to-br ${config.color}` 
                                : 'bg-slate-100 dark:bg-slate-700'
                            }`}>
                              {isEarned ? badge.icon : <Lock className="w-6 h-6 text-slate-400" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-slate-800 dark:text-white">
                                  {badge.name}
                                </h3>
                                <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                                  +{badge.points}
                                </span>
                              </div>

                              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                                {badge.description}
                              </p>

                              {isEarned ? (
                                <p className="text-xs text-green-600 dark:text-green-400">
                                  Đạt được {earnedAt && new Date(earnedAt).toLocaleDateString('vi-VN')}
                                </p>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                    <span>{getProgressText(badge)}</span>
                                    <span>{Math.round(progress)}%</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full bg-gradient-to-r ${config.color} transition-all`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
