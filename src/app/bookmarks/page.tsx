'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { StudentHeader } from '@/components/student'
import { 
  Bookmark, Trash2, Filter, Search, BookOpen,
  ChevronDown, CheckCircle, XCircle, Lightbulb
} from 'lucide-react'

interface BookmarkedQuestion {
  id: string
  question_id: string
  note: string | null
  created_at: string
  question: {
    id: string
    content: string
    explanation: string | null
    answers: Answer[]
    taxonomy: {
      topic: { name: string } | null
      category: { name: string } | null
    }[]
  }
}

interface Answer {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

interface Topic {
  id: string
  name: string
}

export default function BookmarksPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchBookmarks()
    fetchTopics()
  }, [])

  const fetchTopics = async () => {
    const { data } = await supabase
      .from('topics')
      .select('id, name')
      .order('order_index')
    
    setTopics(data || [])
  }

  const fetchBookmarks = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('question_bookmarks')
        .select(`
          id,
          question_id,
          note,
          created_at,
          question:questions(
            id,
            content,
            explanation,
            answers(id, content, is_correct, order_index),
            taxonomy:question_taxonomy(
              topic:topics(name),
              category:categories(name)
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        logger.supabaseError('fetch bookmarks', error)
        return
      }

      // Transform data
      const transformed: BookmarkedQuestion[] = (data || []).map((b: any) => ({
        id: b.id,
        question_id: b.question_id,
        note: b.note,
        created_at: b.created_at,
        question: {
          id: b.question?.id || '',
          content: b.question?.content || '',
          explanation: b.question?.explanation || null,
          answers: (b.question?.answers || []).sort((a: Answer, b: Answer) => a.order_index - b.order_index),
          taxonomy: b.question?.taxonomy || []
        }
      }))

      setBookmarks(transformed)
    } catch (err) {
      logger.error('Fetch bookmarks error', err)
    } finally {
      setLoading(false)
    }
  }

  const removeBookmark = async (id: string) => {
    try {
      const { error } = await supabase
        .from('question_bookmarks')
        .delete()
        .eq('id', id)

      if (error) {
        logger.supabaseError('remove bookmark', error)
        return
      }

      setBookmarks(bookmarks.filter(b => b.id !== id))
    } catch (err) {
      logger.error('Remove bookmark error', err)
    }
  }

  const toggleShowAnswer = (id: string) => {
    const newSet = new Set(showAnswer)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setShowAnswer(newSet)
  }

  // Filter bookmarks
  const filteredBookmarks = bookmarks.filter(b => {
    // Topic filter
    if (selectedTopic !== 'all') {
      const topicMatch = b.question.taxonomy?.some(t => t.topic?.name === selectedTopic)
      if (!topicMatch) return false
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const contentMatch = b.question.content.toLowerCase().includes(query)
      const noteMatch = b.note?.toLowerCase().includes(query)
      if (!contentMatch && !noteMatch) return false
    }

    return true
  })

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <StudentHeader title="Câu hỏi đã lưu" />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <Bookmark className="w-7 h-7 text-teal-600" />
              Câu hỏi đã lưu
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {bookmarks.length} câu hỏi đã bookmark
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm câu hỏi..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Tất cả chủ đề</option>
              {topics.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Bookmarks List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Bookmark className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
              {bookmarks.length === 0 ? 'Chưa có câu hỏi đã lưu' : 'Không tìm thấy kết quả'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {bookmarks.length === 0 
                ? 'Bookmark câu hỏi trong khi làm bài để ôn tập sau'
                : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookmarks.map((bookmark, index) => {
              const question = bookmark.question
              const isExpanded = expandedId === bookmark.id
              const isShowingAnswer = showAnswer.has(bookmark.id)
              const topicName = question.taxonomy?.[0]?.topic?.name
              const categoryName = question.taxonomy?.[0]?.category?.name

              return (
                <div
                  key={bookmark.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  {/* Question Header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                          #{index + 1}
                        </span>
                        {topicName && (
                          <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs rounded-full">
                            {topicName}
                          </span>
                        )}
                        {categoryName && (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                            {categoryName}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeBookmark(bookmark.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                        title="Xóa bookmark"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Question Content */}
                    <div 
                      className="prose dark:prose-invert max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: question.content }}
                    />

                    {/* Note */}
                    {bookmark.note && (
                      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          📝 {bookmark.note}
                        </p>
                      </div>
                    )}

                    {/* Toggle Answer Button */}
                    <button
                      onClick={() => toggleShowAnswer(bookmark.id)}
                      className="mt-4 flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      {isShowingAnswer ? 'Ẩn đáp án' : 'Xem đáp án'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${isShowingAnswer ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Answers */}
                  {isShowingAnswer && (
                    <div className="border-t border-slate-200 dark:border-slate-700 p-5 bg-slate-50 dark:bg-slate-800/50">
                      <div className="space-y-2 mb-4">
                        {question.answers.map((answer, idx) => (
                          <div
                            key={answer.id}
                            className={`flex items-start gap-3 p-3 rounded-lg ${
                              answer.is_correct 
                                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                                : 'bg-white dark:bg-slate-700/50'
                            }`}
                          >
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                              answer.is_correct
                                ? 'bg-green-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-400'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <div className="flex-1" dangerouslySetInnerHTML={{ __html: answer.content }} />
                            {answer.is_correct && (
                              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Explanation */}
                      {question.explanation && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium mb-2">
                            <Lightbulb className="w-4 h-4" />
                            Giải thích
                          </div>
                          <div 
                            className="prose dark:prose-invert max-w-none text-sm"
                            dangerouslySetInnerHTML={{ __html: question.explanation }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
