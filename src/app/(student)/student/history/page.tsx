'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  Calendar,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  FileText,
  Clock,
  Award,
  Filter
} from 'lucide-react'

interface HistoryEntry {
  id: string
  exam_id: string
  exam_title: string
  score: number
  submit_time: string
  total_questions: number
  correct_answers: number
}

interface TaxonomyStats {
  topic_id: string
  topic_name: string
  categories: {
    category_id: string
    category_name: string
    sections: {
      section_id: string
      section_name: string
      total: number
      correct: number
      percentage: number
    }[]
    total: number
    correct: number
    percentage: number
  }[]
  total: number
  correct: number
  percentage: number
}

interface DifficultyStats {
  level: number
  name: string
  total: number
  correct: number
  percentage: number
}

export default function HistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [taxonomyStats, setTaxonomyStats] = useState<TaxonomyStats[]>([])
  const [difficultyStats, setDifficultyStats] = useState<DifficultyStats[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'taxonomy' | 'history'>('overview')
  const [expandedTopics, setExpandedTopics] = useState<string[]>([])
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await Promise.all([
        fetchHistory(user.id),
        fetchTaxonomyStats(user.id),
        fetchDifficultyStats(user.id)
      ])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (userId: string) => {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(`
        id,
        exam_id,
        score,
        submit_time,
        exams!exam_id (
          title
        )
      `)
      .eq('student_id', userId)
      .eq('status', 'submitted')
      .not('submit_time', 'is', null)
      .order('submit_time', { ascending: false })

    if (error) {
      console.error('Fetch history error:', error)
      return
    }

    const entries: HistoryEntry[] = (data || []).map(item => ({
      id: item.id,
      exam_id: item.exam_id,
      exam_title: (item.exams as any)?.title || 'Không rõ',
      score: item.score || 0,
      submit_time: item.submit_time!,
      total_questions: 0,
      correct_answers: 0
    }))

    setHistory(entries)
  }

  const fetchTaxonomyStats = async (userId: string) => {
    // Fetch all student answers with taxonomy info
    const { data: answers, error } = await supabase
      .from('student_answers')
      .select(`
        is_correct,
        questions!question_id (
          id,
          question_taxonomy (
            topics (id, name),
            categories (id, name),
            sections (id, name)
          )
        ),
        exam_attempts!attempt_id (
          student_id,
          status
        )
      `)
      .eq('exam_attempts.student_id', userId)
      .eq('exam_attempts.status', 'submitted')

    if (error) {
      console.error('Fetch taxonomy stats error:', error)
      return
    }

    // Process and aggregate by taxonomy
    const statsMap = new Map<string, any>()

    ;(answers || []).forEach((answer: any) => {
      const taxonomy = answer.questions?.question_taxonomy?.[0]
      if (!taxonomy) return

      const topic = taxonomy.topics
      const category = taxonomy.categories
      const section = taxonomy.sections

      if (!topic) return

      // Initialize topic
      if (!statsMap.has(topic.id)) {
        statsMap.set(topic.id, {
          topic_id: topic.id,
          topic_name: topic.name,
          categories: new Map(),
          total: 0,
          correct: 0
        })
      }

      const topicStats = statsMap.get(topic.id)
      topicStats.total++
      if (answer.is_correct) topicStats.correct++

      // Initialize category
      if (category) {
        if (!topicStats.categories.has(category.id)) {
          topicStats.categories.set(category.id, {
            category_id: category.id,
            category_name: category.name,
            sections: new Map(),
            total: 0,
            correct: 0
          })
        }

        const categoryStats = topicStats.categories.get(category.id)
        categoryStats.total++
        if (answer.is_correct) categoryStats.correct++

        // Initialize section
        if (section) {
          if (!categoryStats.sections.has(section.id)) {
            categoryStats.sections.set(section.id, {
              section_id: section.id,
              section_name: section.name,
              total: 0,
              correct: 0
            })
          }

          const sectionStats = categoryStats.sections.get(section.id)
          sectionStats.total++
          if (answer.is_correct) sectionStats.correct++
        }
      }
    })

    // Convert to array format
    const result: TaxonomyStats[] = Array.from(statsMap.values()).map(topic => ({
      ...topic,
      percentage: topic.total > 0 ? Math.round((topic.correct / topic.total) * 100) : 0,
      categories: Array.from(topic.categories.values()).map((cat: any) => ({
        ...cat,
        percentage: cat.total > 0 ? Math.round((cat.correct / cat.total) * 100) : 0,
        sections: Array.from(cat.sections.values()).map((sec: any) => ({
          ...sec,
          percentage: sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0
        }))
      }))
    }))

    setTaxonomyStats(result)
  }

  const fetchDifficultyStats = async (userId: string) => {
    const { data, error } = await supabase
      .from('student_answers')
      .select(`
        is_correct,
        questions!question_id (
          difficulty
        ),
        exam_attempts!attempt_id (
          student_id,
          status
        )
      `)
      .eq('exam_attempts.student_id', userId)
      .eq('exam_attempts.status', 'submitted')

    if (error) {
      console.error('Fetch difficulty stats error:', error)
      return
    }

    const difficultyMap = new Map<number, { total: number; correct: number }>()
    const difficultyNames = ['', 'Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']

    ;(data || []).forEach((answer: any) => {
      const level = answer.questions?.difficulty || 1
      if (!difficultyMap.has(level)) {
        difficultyMap.set(level, { total: 0, correct: 0 })
      }
      const stats = difficultyMap.get(level)!
      stats.total++
      if (answer.is_correct) stats.correct++
    })

    const result: DifficultyStats[] = [1, 2, 3, 4].map(level => {
      const stats = difficultyMap.get(level) || { total: 0, correct: 0 }
      return {
        level,
        name: difficultyNames[level],
        total: stats.total,
        correct: stats.correct,
        percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
      }
    })

    setDifficultyStats(result)
  }

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => 
      prev.includes(topicId) 
        ? prev.filter(id => id !== topicId)
        : [...prev, topicId]
    )
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 dark:text-green-400'
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-500'
    if (percentage >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getPercentageBgColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-100 dark:bg-green-900/30'
    if (percentage >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  // Calculate overview stats
  const totalAttempts = history.length
  const avgScore = history.length > 0 
    ? history.reduce((sum, h) => sum + h.score, 0) / history.length 
    : 0
  const bestScore = history.length > 0 ? Math.max(...history.map(h => h.score)) : 0
  
  // Find weak areas (below 60%)
  const weakAreas = taxonomyStats
    .flatMap(t => t.categories.flatMap(c => 
      c.sections.filter(s => s.percentage < 60 && s.total >= 3)
        .map(s => ({ ...s, topic: t.topic_name, category: c.category_name }))
    ))
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 5)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">Đang tải dữ liệu...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Lịch sử & Thống kê
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Theo dõi tiến trình và phân tích điểm mạnh, điểm yếu của bạn.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {[
            { key: 'overview', label: 'Tổng quan', icon: TrendingUp },
            { key: 'taxonomy', label: 'Theo chủ đề', icon: BarChart3 },
            { key: 'history', label: 'Lịch sử', icon: Calendar }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <FileText className="w-4 h-4" />
                  Số lần thi
                </div>
                <div className="text-2xl font-bold text-slate-800 dark:text-white">
                  {totalAttempts}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Target className="w-4 h-4" />
                  Điểm cao nhất
                </div>
                <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {bestScore.toFixed(1)}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <TrendingUp className="w-4 h-4" />
                  Điểm trung bình
                </div>
                <div className="text-2xl font-bold text-slate-800 dark:text-white">
                  {avgScore.toFixed(1)}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Award className="w-4 h-4" />
                  Tỷ lệ đạt
                </div>
                <div className="text-2xl font-bold text-slate-800 dark:text-white">
                  {totalAttempts > 0 
                    ? Math.round((history.filter(h => h.score >= 5).length / totalAttempts) * 100)
                    : 0}%
                </div>
              </div>
            </div>

            {/* Difficulty Breakdown */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
                Thống kê theo mức độ
              </h3>
              <div className="space-y-4">
                {difficultyStats.map(stat => (
                  <div key={stat.level}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {stat.name}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {stat.correct}/{stat.total} ({stat.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getPercentageColor(stat.percentage)} transition-all`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weak Areas */}
            {weakAreas.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                    Phần cần cải thiện
                  </h3>
                </div>
                <div className="space-y-3">
                  {weakAreas.map((area, index) => (
                    <div 
                      key={index}
                      className={`p-4 rounded-xl ${getPercentageBgColor(area.percentage)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">
                            {area.section_name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {area.topic} → {area.category}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${
                            area.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {area.percentage}%
                          </p>
                          <p className="text-xs text-slate-500">
                            {area.correct}/{area.total} câu
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Taxonomy Tab */}
        {activeTab === 'taxonomy' && (
          <div className="space-y-4">
            {taxonomyStats.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
                <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">
                  Chưa có dữ liệu thống kê. Hãy làm thêm đề thi!
                </p>
              </div>
            ) : (
              taxonomyStats.map(topic => (
                <div 
                  key={topic.topic_id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  {/* Topic Header */}
                  <button
                    onClick={() => toggleTopic(topic.topic_id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedTopics.includes(topic.topic_id) ? 'rotate-180' : ''
                      }`} />
                      <div className="text-left">
                        <p className="font-semibold text-slate-800 dark:text-white">
                          {topic.topic_name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {topic.correct}/{topic.total} câu đúng
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${getPercentageColor(topic.percentage)}`}
                          style={{ width: `${topic.percentage}%` }}
                        />
                      </div>
                      <span className={`text-lg font-bold ${
                        topic.percentage >= 70 ? 'text-green-600' : 
                        topic.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {topic.percentage}%
                      </span>
                    </div>
                  </button>

                  {/* Categories */}
                  {expandedTopics.includes(topic.topic_id) && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      {topic.categories.map(category => (
                        <div key={category.category_id}>
                          <button
                            onClick={() => toggleCategory(category.category_id)}
                            className="w-full px-4 py-3 pl-12 flex items-center justify-between bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${
                                expandedCategories.includes(category.category_id) ? 'rotate-90' : ''
                              }`} />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {category.category_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-500">
                                {category.correct}/{category.total}
                              </span>
                              <span className={`text-sm font-semibold ${
                                category.percentage >= 70 ? 'text-green-600' : 
                                category.percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {category.percentage}%
                              </span>
                            </div>
                          </button>

                          {/* Sections */}
                          {expandedCategories.includes(category.category_id) && (
                            <div className="bg-slate-100 dark:bg-slate-800">
                              {category.sections.map(section => (
                                <div 
                                  key={section.section_id}
                                  className="px-4 py-2 pl-20 flex items-center justify-between border-t border-slate-200 dark:border-slate-700"
                                >
                                  <span className="text-sm text-slate-600 dark:text-slate-400">
                                    {section.section_name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                      {section.correct}/{section.total}
                                    </span>
                                    <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                                      section.percentage >= 70 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                        : section.percentage >= 50 
                                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    }`}>
                                      {section.percentage}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
                <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">
                  Chưa có lịch sử làm bài
                </p>
              </div>
            ) : (
              history.map(item => (
                <button
                  key={item.id}
                  onClick={() => router.push(`/result/${item.id}`)}
                  className="w-full bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between hover:border-teal-400 dark:hover:border-teal-600 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                      item.score >= 8 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : item.score >= 5
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}>
                      {item.score.toFixed(1)}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {item.exam_title}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.submit_time).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
