'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { StudentHeader } from '@/components/student'
import { 
  BookOpen, ChevronRight, Play, CheckCircle, XCircle, 
  RotateCcw, ArrowRight, Lightbulb, Target, Clock,
  ChevronDown, Filter, TrendingUp
} from 'lucide-react'
import MathContent from '@/components/MathContent'

interface Topic {
  id: string
  name: string
  questionCount: number
  categories: Category[]
}

interface Category {
  id: string
  name: string
  questionCount: number
}

interface Question {
  id: string
  content: string
  answers: Answer[]
  explanation: string | null
  solution: string | null
  difficulty: number
}

interface Answer {
  id: string
  content: string
  is_correct: boolean
}

interface PracticeStats {
  totalAnswered: number
  correctCount: number
  currentStreak: number
}

type PracticeMode = 'select' | 'practice' | 'result'

export default function PracticePage() {
  const supabase = createClient()
  
  const [mode, setMode] = useState<PracticeMode>('select')
  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
  
  // Practice state
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [stats, setStats] = useState<PracticeStats>({
    totalAnswered: 0,
    correctCount: 0,
    currentStreak: 0
  })

  useEffect(() => {
    fetchTopics()
  }, [])

  const fetchTopics = async () => {
    setLoading(true)
    try {
      // Fetch topics
      const { data: topicsData, error: topicsError } = await supabase
        .from('topics')
        .select('id, name')
        .order('order_index')

      if (topicsError) {
        logger.supabaseError('fetch topics', topicsError)
        return
      }

      // Fetch categories for each topic
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name, topic_id')
        .order('order_index')

      // Fetch question counts via taxonomy
      const { data: taxonomyData } = await supabase
        .from('question_taxonomy')
        .select('topic_id, category_id')

      // Count questions per topic and category
      const topicCounts = new Map<string, number>()
      const categoryCounts = new Map<string, number>()

      for (const tax of taxonomyData || []) {
        if (tax.topic_id) {
          topicCounts.set(tax.topic_id, (topicCounts.get(tax.topic_id) || 0) + 1)
        }
        if (tax.category_id) {
          categoryCounts.set(tax.category_id, (categoryCounts.get(tax.category_id) || 0) + 1)
        }
      }

      // Build topics with categories
      const formattedTopics: Topic[] = (topicsData || []).map(topic => ({
        id: topic.id,
        name: topic.name,
        questionCount: topicCounts.get(topic.id) || 0,
        categories: (categoriesData || [])
          .filter(c => c.topic_id === topic.id)
          .map(c => ({
            id: c.id,
            name: c.name,
            questionCount: categoryCounts.get(c.id) || 0
          }))
      }))

      setTopics(formattedTopics.filter(t => t.questionCount > 0))

    } catch (err) {
      logger.error('Fetch topics error', err)
    } finally {
      setLoading(false)
    }
  }

  const startPractice = async () => {
    if (!selectedTopic && !selectedCategory) return

    setLoading(true)
    try {
      // Build query for questions based on selection
      let questionIds: string[] = []

      if (selectedCategory) {
        const { data: taxonomy } = await supabase
          .from('question_taxonomy')
          .select('question_id')
          .eq('category_id', selectedCategory)
        
        questionIds = taxonomy?.map(t => t.question_id) || []
      } else if (selectedTopic) {
        const { data: taxonomy } = await supabase
          .from('question_taxonomy')
          .select('question_id')
          .eq('topic_id', selectedTopic)
        
        questionIds = taxonomy?.map(t => t.question_id) || []
      }

      if (questionIds.length === 0) {
        setLoading(false)
        return
      }

      // Shuffle and take up to 20 questions
      const shuffled = questionIds.sort(() => Math.random() - 0.5).slice(0, 20)

      // Fetch questions with answers
      const { data: questionsData, error } = await supabase
        .from('questions')
        .select(`
          id,
          content,
          explanation,
          solution,
          difficulty,
          answers(id, content, is_correct, order_index)
        `)
        .in('id', shuffled)

      if (error) {
        logger.supabaseError('fetch practice questions', error)
        return
      }

      const formattedQuestions: Question[] = (questionsData || []).map(q => ({
        id: q.id,
        content: q.content,
        answers: ((q.answers as any[]) || [])
          .sort((a, b) => a.order_index - b.order_index)
          .map(a => ({
            id: a.id,
            content: a.content,
            is_correct: a.is_correct
          })),
        explanation: q.explanation,
        solution: q.solution,
        difficulty: q.difficulty || 1
      }))

      // Shuffle questions
      setQuestions(formattedQuestions.sort(() => Math.random() - 0.5))
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setShowExplanation(false)
      setIsCorrect(null)
      setStats({ totalAnswered: 0, correctCount: 0, currentStreak: 0 })
      setMode('practice')

    } catch (err) {
      logger.error('Start practice error', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerSelect = (answerId: string) => {
    if (showExplanation) return // Already answered

    setSelectedAnswer(answerId)
    
    const currentQuestion = questions[currentIndex]
    const selectedAnswerObj = currentQuestion.answers.find(a => a.id === answerId)
    const correct = selectedAnswerObj?.is_correct || false
    
    setIsCorrect(correct)
    setShowExplanation(true)
    
    setStats(prev => ({
      totalAnswered: prev.totalAnswered + 1,
      correctCount: prev.correctCount + (correct ? 1 : 0),
      currentStreak: correct ? prev.currentStreak + 1 : 0
    }))
  }

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedAnswer(null)
      setShowExplanation(false)
      setIsCorrect(null)
    } else {
      setMode('result')
    }
  }

  const resetPractice = () => {
    setMode('select')
    setSelectedTopic(null)
    setSelectedCategory(null)
    setQuestions([])
    setCurrentIndex(0)
    setStats({ totalAnswered: 0, correctCount: 0, currentStreak: 0 })
  }

  const currentQuestion = questions[currentIndex]
  const accuracy = stats.totalAnswered > 0 
    ? (stats.correctCount / stats.totalAnswered * 100).toFixed(0)
    : 0

  // Render topic selection
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <StudentHeader title="Luyện tập" />

        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Chọn chủ đề luyện tập
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Làm bài không giới hạn thời gian, xem đáp án ngay sau mỗi câu
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : topics.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có câu hỏi</h3>
              <p className="text-slate-500 dark:text-slate-400">Ngân hàng câu hỏi đang được cập nhật</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topics.map((topic) => (
                <div key={topic.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    onClick={() => {
                      setExpandedTopic(expandedTopic === topic.id ? null : topic.id)
                      if (topic.categories.length === 0) {
                        setSelectedTopic(topic.id)
                        setSelectedCategory(null)
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                      selectedTopic === topic.id && !selectedCategory
                        ? 'bg-teal-50 dark:bg-teal-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedTopic === topic.id 
                          ? 'bg-teal-100 dark:bg-teal-900/50' 
                          : 'bg-slate-100 dark:bg-slate-700'
                      }`}>
                        <BookOpen className={`w-5 h-5 ${
                          selectedTopic === topic.id 
                            ? 'text-teal-600 dark:text-teal-400' 
                            : 'text-slate-500 dark:text-slate-400'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white">{topic.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{topic.questionCount} câu hỏi</p>
                      </div>
                    </div>
                    {topic.categories.length > 0 && (
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedTopic === topic.id ? 'rotate-180' : ''
                      }`} />
                    )}
                  </button>

                  {/* Categories */}
                  {expandedTopic === topic.id && topic.categories.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                      {topic.categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setSelectedTopic(topic.id)
                            setSelectedCategory(cat.id)
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 pl-14 text-left transition-colors ${
                            selectedCategory === cat.id
                              ? 'bg-teal-50 dark:bg-teal-900/20'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-600/30'
                          }`}
                        >
                          <span className="text-sm text-slate-700 dark:text-slate-300">{cat.name}</span>
                          <span className="text-xs text-slate-500">{cat.questionCount} câu</span>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setSelectedTopic(topic.id)
                          setSelectedCategory(null)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 pl-14 text-left transition-colors ${
                          selectedTopic === topic.id && !selectedCategory
                            ? 'bg-teal-50 dark:bg-teal-900/20'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-600/30'
                        }`}
                      >
                        <span className="text-sm font-medium text-teal-600 dark:text-teal-400">Tất cả chủ đề này</span>
                        <span className="text-xs text-slate-500">{topic.questionCount} câu</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Start Button */}
          {selectedTopic && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
              <div className="max-w-2xl mx-auto">
                <button
                  onClick={startPractice}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-xl font-semibold transition-colors"
                >
                  <Play className="w-5 h-5" />
                  Bắt đầu luyện tập
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  // Render practice mode
  if (mode === 'practice' && currentQuestion) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <StudentHeader title="Luyện tập" />

        <main className="max-w-2xl mx-auto px-4 py-6">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
              <span>Câu {currentIndex + 1}/{questions.length}</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  {accuracy}%
                </span>
                {stats.currentStreak > 2 && (
                  <span className="flex items-center gap-1 text-amber-500">
                    🔥 {stats.currentStreak}
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-teal-500 transition-all"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-4">
            <div className="prose dark:prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: currentQuestion.content }} />
            </div>
          </div>

          {/* Answers */}
          <div className="space-y-3 mb-6">
            {currentQuestion.answers.map((answer, idx) => {
              const isSelected = selectedAnswer === answer.id
              const isCorrectAnswer = answer.is_correct
              
              let bgColor = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400'
              
              if (showExplanation) {
                if (isCorrectAnswer) {
                  bgColor = 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                } else if (isSelected && !isCorrectAnswer) {
                  bgColor = 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                } else {
                  bgColor = 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60'
                }
              } else if (isSelected) {
                bgColor = 'bg-teal-50 dark:bg-teal-900/20 border-teal-400 dark:border-teal-600'
              }

              return (
                <button
                  key={answer.id}
                  onClick={() => handleAnswerSelect(answer.id)}
                  disabled={showExplanation}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${bgColor}`}
                >
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
                    showExplanation && isCorrectAnswer
                      ? 'bg-green-500 text-white'
                      : showExplanation && isSelected && !isCorrectAnswer
                        ? 'bg-red-500 text-white'
                        : isSelected
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <div className="flex-1">
                    <div dangerouslySetInnerHTML={{ __html: answer.content }} />
                  </div>
                  {showExplanation && isCorrectAnswer && (
                    <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                  )}
                  {showExplanation && isSelected && !isCorrectAnswer && (
                    <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Explanation */}
          {showExplanation && (currentQuestion.explanation || currentQuestion.solution) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5 mb-6">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium mb-3">
                <Lightbulb className="w-5 h-5" />
                Giải thích
              </div>
              <div className="text-slate-700 dark:text-slate-300">
                {currentQuestion.explanation && (
                  <MathContent content={currentQuestion.explanation} className="text-sm" />
                )}
                {currentQuestion.solution && (
                  <MathContent content={currentQuestion.solution} className="text-sm" />
                )}
              </div>
            </div>
          )}

          {/* Next Button */}
          {showExplanation && (
            <button
              onClick={nextQuestion}
              className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold transition-colors"
            >
              {currentIndex < questions.length - 1 ? (
                <>
                  Câu tiếp theo
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  Xem kết quả
                  <CheckCircle className="w-5 h-5" />
                </>
              )}
            </button>
          )}
        </main>
      </div>
    )
  }

  // Render result
  if (mode === 'result') {
    const percentage = (stats.correctCount / stats.totalAnswered * 100)
    
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <StudentHeader title="Luyện tập" />

        <main className="max-w-md mx-auto px-4 py-12">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
              percentage >= 80 ? 'bg-green-100 dark:bg-green-900/30' :
              percentage >= 60 ? 'bg-amber-100 dark:bg-amber-900/30' :
              'bg-red-100 dark:bg-red-900/30'
            }`}>
              {percentage >= 80 ? (
                <CheckCircle className="w-12 h-12 text-green-500" />
              ) : percentage >= 60 ? (
                <TrendingUp className="w-12 h-12 text-amber-500" />
              ) : (
                <Target className="w-12 h-12 text-red-500" />
              )}
            </div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              {percentage >= 80 ? 'Xuất sắc!' : percentage >= 60 ? 'Tốt lắm!' : 'Cố gắng hơn nhé!'}
            </h2>
            
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              Bạn đã hoàn thành bài luyện tập
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">
                  {stats.correctCount}/{stats.totalAnswered}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Câu đúng</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                <p className="text-3xl font-bold text-slate-800 dark:text-white">
                  {percentage.toFixed(0)}%
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Độ chính xác</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setMode('practice')
                  setCurrentIndex(0)
                  setSelectedAnswer(null)
                  setShowExplanation(false)
                  setIsCorrect(null)
                  setStats({ totalAnswered: 0, correctCount: 0, currentStreak: 0 })
                  setQuestions(questions.sort(() => Math.random() - 0.5))
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                Làm lại
              </button>
              <button
                onClick={resetPractice}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Chọn chủ đề khác
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return null
}
