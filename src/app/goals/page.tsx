'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { StudentHeader } from '@/components/student'
import { 
  Target, Plus, Trash2, CheckCircle, Clock,
  TrendingUp, Award, Flame, BarChart3, X, Save
} from 'lucide-react'

interface Goal {
  id: string
  goal_type: 'avg_score' | 'exams_per_week' | 'streak_days' | 'total_exams'
  target_value: number
  current_value: number
  start_date: string
  end_date: string | null
  is_completed: boolean
  completed_at: string | null
  created_at: string
}

const goalTypeConfig = {
  avg_score: { 
    label: 'Điểm trung bình', 
    icon: BarChart3, 
    unit: 'điểm',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-600 dark:text-blue-400'
  },
  exams_per_week: { 
    label: 'Bài thi/tuần', 
    icon: Target, 
    unit: 'bài',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-600 dark:text-green-400'
  },
  streak_days: { 
    label: 'Streak liên tiếp', 
    icon: Flame, 
    unit: 'ngày',
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-600 dark:text-orange-400'
  },
  total_exams: { 
    label: 'Tổng số bài', 
    icon: Award, 
    unit: 'bài',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-600 dark:text-purple-400'
  }
}

export default function GoalsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<Goal[]>([])
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentStats, setCurrentStats] = useState({
    avgScore: 0,
    examsThisWeek: 0,
    streak: 0,
    totalExams: 0
  })

  const [form, setForm] = useState({
    goal_type: 'avg_score' as Goal['goal_type'],
    target_value: 8,
    end_date: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch goals
      const { data: goalsData, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('is_completed')
        .order('created_at', { ascending: false })

      if (error) {
        logger.supabaseError('fetch goals', error)
      } else {
        setGoals(goalsData || [])
      }

      // Fetch current stats
      const { data: attemptsData } = await supabase
        .from('exam_attempts')
        .select('score, created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')

      if (attemptsData && attemptsData.length > 0) {
        const scores = attemptsData.map(a => a.score || 0)
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

        // Exams this week
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const examsThisWeek = attemptsData.filter(a => 
          new Date(a.created_at) >= weekAgo
        ).length

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

        setCurrentStats({
          avgScore: Math.round(avgScore * 10) / 10,
          examsThisWeek,
          streak,
          totalExams: attemptsData.length
        })

        // Update goal progress
        updateGoalProgress(goalsData || [], {
          avgScore: Math.round(avgScore * 10) / 10,
          examsThisWeek,
          streak,
          totalExams: attemptsData.length
        })
      }

    } catch (err) {
      logger.error('Fetch goals error', err)
    } finally {
      setLoading(false)
    }
  }

  const updateGoalProgress = async (
    goals: Goal[], 
    stats: typeof currentStats
  ) => {
    for (const goal of goals) {
      if (goal.is_completed) continue

      let currentValue = 0
      switch (goal.goal_type) {
        case 'avg_score':
          currentValue = stats.avgScore
          break
        case 'exams_per_week':
          currentValue = stats.examsThisWeek
          break
        case 'streak_days':
          currentValue = stats.streak
          break
        case 'total_exams':
          currentValue = stats.totalExams
          break
      }

      const isCompleted = currentValue >= goal.target_value

      if (currentValue !== goal.current_value || isCompleted !== goal.is_completed) {
        await supabase
          .from('user_goals')
          .update({ 
            current_value: currentValue,
            is_completed: isCompleted,
            completed_at: isCompleted ? new Date().toISOString() : null
          })
          .eq('id', goal.id)
      }
    }
  }

  const handleCreateGoal = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let currentValue = 0
      switch (form.goal_type) {
        case 'avg_score':
          currentValue = currentStats.avgScore
          break
        case 'exams_per_week':
          currentValue = currentStats.examsThisWeek
          break
        case 'streak_days':
          currentValue = currentStats.streak
          break
        case 'total_exams':
          currentValue = currentStats.totalExams
          break
      }

      const { error } = await supabase
        .from('user_goals')
        .insert({
          user_id: user.id,
          goal_type: form.goal_type,
          target_value: form.target_value,
          current_value: currentValue,
          end_date: form.end_date || null
        })

      if (error) {
        logger.supabaseError('create goal', error)
        return
      }

      setShowModal(false)
      fetchData()
    } catch (err) {
      logger.error('Create goal error', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa mục tiêu này?')) return

    try {
      const { error } = await supabase
        .from('user_goals')
        .delete()
        .eq('id', id)

      if (error) {
        logger.supabaseError('delete goal', error)
        return
      }

      setGoals(goals.filter(g => g.id !== id))
    } catch (err) {
      logger.error('Delete goal error', err)
    }
  }

  const activeGoals = goals.filter(g => !g.is_completed)
  const completedGoals = goals.filter(g => g.is_completed)

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <StudentHeader title="Mục tiêu" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <Target className="w-7 h-7 text-teal-600" />
              Mục tiêu cá nhân
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Đặt mục tiêu và theo dõi tiến độ học tập
            </p>
          </div>
          <button
            onClick={() => {
              setForm({ goal_type: 'avg_score', target_value: 8, end_date: '' })
              setShowModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Thêm mục tiêu
          </button>
        </div>

        {/* Current Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{currentStats.avgScore}</p>
            <p className="text-xs text-slate-500">Điểm TB</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{currentStats.examsThisWeek}</p>
            <p className="text-xs text-slate-500">Bài/tuần</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{currentStats.streak}</p>
            <p className="text-xs text-slate-500">Ngày streak</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{currentStats.totalExams}</p>
            <p className="text-xs text-slate-500">Tổng bài</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : goals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Target className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có mục tiêu</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              Đặt mục tiêu để theo dõi tiến độ học tập
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm mục tiêu đầu tiên
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Goals */}
            {activeGoals.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Đang thực hiện ({activeGoals.length})
                </h2>
                <div className="space-y-3">
                  {activeGoals.map((goal) => {
                    const config = goalTypeConfig[goal.goal_type]
                    const Icon = config.icon
                    const progress = Math.min(100, (goal.current_value / goal.target_value) * 100)

                    return (
                      <div
                        key={goal.id}
                        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                              <Icon className={`w-6 h-6 ${config.textColor}`} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-800 dark:text-white">
                                {config.label}: {goal.target_value} {config.unit}
                              </h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                Hiện tại: {goal.current_value} {config.unit}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mb-2">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-500">{Math.round(progress)}% hoàn thành</span>
                            {goal.end_date && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(goal.end_date).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full bg-gradient-to-r ${config.color} transition-all`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Completed Goals */}
            {completedGoals.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  Đã hoàn thành ({completedGoals.length})
                </h2>
                <div className="space-y-3">
                  {completedGoals.map((goal) => {
                    const config = goalTypeConfig[goal.goal_type]
                    const Icon = config.icon

                    return (
                      <div
                        key={goal.id}
                        className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                                {config.label}: {goal.target_value} {config.unit}
                                <span className="text-xs px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-full">
                                  Hoàn thành!
                                </span>
                              </h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {goal.completed_at && `Đạt được ${new Date(goal.completed_at).toLocaleDateString('vi-VN')}`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Goal Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                Thêm mục tiêu mới
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Goal Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Loại mục tiêu
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(goalTypeConfig).map(([key, config]) => {
                    const Icon = config.icon
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm({ ...form, goal_type: key as Goal['goal_type'] })}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors ${
                          form.goal_type === key
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${config.textColor}`} />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{config.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Target Value */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mục tiêu ({goalTypeConfig[form.goal_type].unit})
                </label>
                <input
                  type="number"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: parseFloat(e.target.value) || 0 })}
                  min={1}
                  step={form.goal_type === 'avg_score' ? 0.1 : 1}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hạn hoàn thành (tùy chọn)
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateGoal}
                disabled={saving || form.target_value <= 0}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu...' : 'Tạo mục tiêu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
