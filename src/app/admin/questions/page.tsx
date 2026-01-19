'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  HelpCircle, Search, FileText, CheckCircle, XCircle, Eye, X, 
  Filter, ChevronDown, Tag, BookOpen, Layers, MessageSquare,
  BarChart3, Clock, Brain, Hash, AlertCircle, ChevronRight
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import MathContent from '@/components/MathContent'

// ==================== INTERFACES ====================
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

interface Category {
  id: string
  name: string
  topic_id: string
}

interface Section {
  id: string
  name: string
  category_id: string
  topic_id: string
}

interface Subsection {
  id: string
  name: string
  section_id: string
}

interface TagItem {
  id: string
  name: string
}

interface Feedback {
  id: string
  message: string
  status: 'pending' | 'reviewed' | 'fixed' | 'rejected'
  created_at: string
  student_name?: string
}

interface QuestionTaxonomy {
  topic?: Topic
  category?: Category
  section?: Section
  subsection?: Subsection
}

interface QuestionFull {
  id: string
  content: string
  question_type: string
  difficulty: number
  cognitive_level: string | null
  source_exam: string | null
  explanation: string | null
  solution: string | null
  tikz_image_url: string | null
  solution_tikz_image_url: string | null
  solution_tikz_image_url_2: string | null
  created_at: string
  updated_at: string
  // Related data
  answers: Answer[]
  taxonomy: QuestionTaxonomy | null
  tags: TagItem[]
  feedbacks: Feedback[]
  exam_count: number
}

// ==================== COMPONENT ====================
export default function AdminQuestionsPage() {
  const supabase = createClient()
  
  // State
  const [questions, setQuestions] = useState<QuestionFull[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionFull | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  
  // Filter states
  const [topics, setTopics] = useState<Topic[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [subsections, setSubsections] = useState<Subsection[]>([])
  const [allTags, setAllTags] = useState<TagItem[]>([])
  
  const [selectedTopicId, setSelectedTopicId] = useState<string>('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [selectedSubsectionId, setSelectedSubsectionId] = useState<string>('')
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('')
  const [selectedTagId, setSelectedTagId] = useState<string>('')

  // ==================== FETCH DATA ====================
  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // Fetch taxonomy data in parallel
      const [topicsRes, categoriesRes, sectionsRes, subsectionsRes, tagsRes] = await Promise.all([
        supabase.from('topics').select('id, name').order('order_index'),
        supabase.from('categories').select('id, name, topic_id').order('order_index'),
        supabase.from('sections').select('id, name, category_id, topic_id').order('order_index'),
        supabase.from('subsections').select('id, name, section_id').order('order_index'),
        supabase.from('tags').select('id, name').order('name')
      ])

      setTopics(topicsRes.data || [])
      setCategories(categoriesRes.data || [])
      setSections(sectionsRes.data || [])
      setSubsections(subsectionsRes.data || [])
      setAllTags(tagsRes.data || [])

      // Fetch questions with all related data
      await fetchQuestions()
    } catch (err) {
      console.error('Error fetching data:', err)
    }
    setLoading(false)
  }

  const fetchQuestions = async () => {
    try {
      // Step 1: Fetch questions
      const { data: questionsData, error: qError } = await supabase
        .from('questions')
        .select(`
          id, content, question_type, difficulty, cognitive_level, 
          source_exam, explanation, solution, tikz_image_url,
          solution_tikz_image_url, solution_tikz_image_url_2,
          created_at, updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(500)

      if (qError) {
        console.error('Fetch questions error:', qError)
        return
      }

      if (!questionsData || questionsData.length === 0) {
        setQuestions([])
        return
      }

      const questionIds = questionsData.map(q => q.id)

      // Step 2: Fetch all related data in parallel
      const [answersRes, taxonomyRes, questionTagsRes, feedbacksRes, examCountRes] = await Promise.all([
        // Answers
        supabase
          .from('answers')
          .select('id, question_id, content, is_correct, order_index')
          .in('question_id', questionIds)
          .order('order_index'),
        
        // Taxonomy with joins
        supabase
          .from('question_taxonomy')
          .select(`
            question_id,
            topic_id, category_id, section_id, subsection_id,
            topics:topic_id(id, name),
            categories:category_id(id, name),
            sections:section_id(id, name),
            subsections:subsection_id(id, name)
          `)
          .in('question_id', questionIds),
        
        // Question tags
        supabase
          .from('question_tags')
          .select(`
            question_id,
            tags:tag_id(id, name)
          `)
          .in('question_id', questionIds),
        
        // Feedbacks
        supabase
          .from('question_feedbacks')
          .select(`
            id, question_id, message, status, created_at,
            profiles:student_id(full_name)
          `)
          .in('question_id', questionIds)
          .order('created_at', { ascending: false }),
        
        // Exam count - count per question
        supabase
          .from('exam_questions')
          .select('question_id')
          .in('question_id', questionIds)
      ])

      // Build lookup maps
      const answersMap: Record<string, Answer[]> = {}
      for (const a of answersRes.data || []) {
        if (!answersMap[a.question_id]) answersMap[a.question_id] = []
        answersMap[a.question_id].push({
          id: a.id,
          content: a.content,
          is_correct: a.is_correct,
          order_index: a.order_index
        })
      }

      const taxonomyMap: Record<string, QuestionTaxonomy> = {}
      for (const t of taxonomyRes.data || []) {
        taxonomyMap[t.question_id] = {
          topic: t.topics as unknown as Topic,
          category: t.categories as unknown as Category,
          section: t.sections as unknown as Section,
          subsection: t.subsections as unknown as Subsection
        }
      }

      const tagsMap: Record<string, TagItem[]> = {}
      for (const qt of questionTagsRes.data || []) {
        if (!tagsMap[qt.question_id]) tagsMap[qt.question_id] = []
        if (qt.tags) {
          tagsMap[qt.question_id].push(qt.tags as unknown as TagItem)
        }
      }

      const feedbacksMap: Record<string, Feedback[]> = {}
      for (const f of feedbacksRes.data || []) {
        if (!feedbacksMap[f.question_id]) feedbacksMap[f.question_id] = []
        feedbacksMap[f.question_id].push({
          id: f.id,
          message: f.message,
          status: f.status,
          created_at: f.created_at,
          student_name: (f.profiles as any)?.full_name
        })
      }

      // Count exams per question
      const examCountMap: Record<string, number> = {}
      for (const eq of examCountRes.data || []) {
        examCountMap[eq.question_id] = (examCountMap[eq.question_id] || 0) + 1
      }

      // Build full questions
      const fullQuestions: QuestionFull[] = questionsData.map(q => ({
        ...q,
        answers: answersMap[q.id] || [],
        taxonomy: taxonomyMap[q.id] || null,
        tags: tagsMap[q.id] || [],
        feedbacks: feedbacksMap[q.id] || [],
        exam_count: examCountMap[q.id] || 0
      }))

      setQuestions(fullQuestions)
    } catch (err) {
      console.error('Unexpected error:', err)
    }
  }

  // ==================== FILTERED DATA ====================
  const filteredCategories = useMemo(() => {
    if (!selectedTopicId) return categories
    return categories.filter(c => c.topic_id === selectedTopicId)
  }, [categories, selectedTopicId])

  const filteredSections = useMemo(() => {
    if (!selectedCategoryId) return sections.filter(s => !selectedTopicId || s.topic_id === selectedTopicId)
    return sections.filter(s => s.category_id === selectedCategoryId)
  }, [sections, selectedTopicId, selectedCategoryId])

  const filteredSubsections = useMemo(() => {
    if (!selectedSectionId) return []
    return subsections.filter(s => s.section_id === selectedSectionId)
  }, [subsections, selectedSectionId])

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      // Search filter
      if (searchTerm && !q.content.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      
      // Topic filter
      if (selectedTopicId && q.taxonomy?.topic?.id !== selectedTopicId) {
        return false
      }
      
      // Category filter
      if (selectedCategoryId && q.taxonomy?.category?.id !== selectedCategoryId) {
        return false
      }
      
      // Section filter
      if (selectedSectionId && q.taxonomy?.section?.id !== selectedSectionId) {
        return false
      }
      
      // Subsection filter
      if (selectedSubsectionId && q.taxonomy?.subsection?.id !== selectedSubsectionId) {
        return false
      }
      
      // Difficulty filter
      if (selectedDifficulty && q.difficulty !== parseInt(selectedDifficulty)) {
        return false
      }
      
      // Tag filter
      if (selectedTagId && !q.tags.some(t => t.id === selectedTagId)) {
        return false
      }
      
      return true
    })
  }, [questions, searchTerm, selectedTopicId, selectedCategoryId, selectedSectionId, selectedSubsectionId, selectedDifficulty, selectedTagId])

  // ==================== HANDLERS ====================
  const handleViewDetail = (question: QuestionFull) => {
    setSelectedQuestion(question)
    setShowDetailModal(true)
  }

  const clearFilters = () => {
    setSelectedTopicId('')
    setSelectedCategoryId('')
    setSelectedSectionId('')
    setSelectedSubsectionId('')
    setSelectedDifficulty('')
    setSelectedTagId('')
    setSearchTerm('')
  }

  const hasActiveFilters = selectedTopicId || selectedCategoryId || selectedSectionId || selectedSubsectionId || selectedDifficulty || selectedTagId || searchTerm

  // ==================== HELPERS ====================
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const getDifficultyLabel = (level: number) => {
    const labels: Record<number, { text: string; color: string }> = {
      1: { text: 'Nhận biết', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      2: { text: 'Thông hiểu', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      3: { text: 'Vận dụng', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
      4: { text: 'Vận dụng cao', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    }
    return labels[level] || { text: `Mức ${level}`, color: 'bg-slate-100 text-slate-700' }
  }

  const getFeedbackStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      pending: { text: 'Chờ xử lý', color: 'bg-amber-100 text-amber-700' },
      reviewed: { text: 'Đã xem', color: 'bg-blue-100 text-blue-700' },
      fixed: { text: 'Đã sửa', color: 'bg-green-100 text-green-700' },
      rejected: { text: 'Từ chối', color: 'bg-red-100 text-red-700' }
    }
    return labels[status] || { text: status, color: 'bg-slate-100 text-slate-700' }
  }

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen">
      <AdminHeader 
        title="Quản lý câu hỏi" 
        subtitle={`${questions.length} câu hỏi trong hệ thống`} 
      />
      
      <div className="p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{questions.length}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tổng câu hỏi</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{topics.length}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Chủ đề</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{allTags.length}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tags</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {questions.reduce((sum, q) => sum + q.feedbacks.filter(f => f.status === 'pending').length, 0)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Phản hồi chờ</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Bộ lọc</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm nội dung..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Topic = Chủ đề */}
            <select
              value={selectedTopicId}
              onChange={(e) => {
                setSelectedTopicId(e.target.value)
                setSelectedCategoryId('')
                setSelectedSectionId('')
                setSelectedSubsectionId('')
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
            >
              <option value="">Tất cả chủ đề</option>
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Category = Chương */}
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value)
                setSelectedSectionId('')
                setSelectedSubsectionId('')
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              disabled={!selectedTopicId}
            >
              <option value="">Tất cả chương</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Section = Bài học */}
            <select
              value={selectedSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.target.value)
                setSelectedSubsectionId('')
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              disabled={!selectedCategoryId}
            >
              <option value="">Tất cả bài học</option>
              {filteredSections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Difficulty */}
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
            >
              <option value="">Tất cả độ khó</option>
              <option value="1">Nhận biết</option>
              <option value="2">Thông hiểu</option>
              <option value="3">Vận dụng</option>
              <option value="4">Vận dụng cao</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hiển thị <span className="font-medium text-slate-700 dark:text-slate-300">{filteredQuestions.length}</span> câu hỏi
            {hasActiveFilters && <span> (đã lọc)</span>}
          </p>
        </div>

        {/* Questions List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 dark:text-slate-400">Đang tải danh sách câu hỏi...</p>
            </div>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <HelpCircle className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              {hasActiveFilters ? 'Không tìm thấy câu hỏi' : 'Chưa có câu hỏi nào'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {hasActiveFilters ? 'Thử thay đổi bộ lọc' : 'Câu hỏi sẽ được tạo khi bạn tạo đề thi mới'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                onViewDetail={() => handleViewDetail(question)}
                getDifficultyLabel={getDifficultyLabel}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedQuestion && (
        <QuestionDetailModal
          question={selectedQuestion}
          onClose={() => setShowDetailModal(false)}
          getDifficultyLabel={getDifficultyLabel}
          getFeedbackStatusLabel={getFeedbackStatusLabel}
          formatDate={formatDate}
        />
      )}
    </div>
  )
}

// ==================== QUESTION CARD COMPONENT ====================
function QuestionCard({
  question,
  onViewDetail,
  getDifficultyLabel,
  formatDate
}: {
  question: QuestionFull
  onViewDetail: () => void
  getDifficultyLabel: (level: number) => { text: string; color: string }
  formatDate: (date: string) => string
}) {
  const difficulty = getDifficultyLabel(question.difficulty)
  const pendingFeedbacks = question.feedbacks.filter(f => f.status === 'pending').length

  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 hover:shadow-md hover:border-teal-200 dark:hover:border-teal-600 transition-all">
      <div className="flex items-start gap-4">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Question Content with MathJax */}
          <div className="text-sm text-slate-800 dark:text-slate-100 line-clamp-2 mb-3">
            <MathContent content={question.content} />  
          </div>

          {/* Meta Row 1: Taxonomy */}
          {question.taxonomy && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <BookOpen className="w-3 h-3" />
              {question.taxonomy.topic && (
                <span className="text-teal-600 dark:text-teal-400">{question.taxonomy.topic.name}</span>
              )}
              {question.taxonomy.category && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span>{question.taxonomy.category.name}</span>
                </>
              )}
              {question.taxonomy.section && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span>{question.taxonomy.section.name}</span>
                </>
              )}
              {question.taxonomy.subsection && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-slate-600 dark:text-slate-300">{question.taxonomy.subsection.name}</span>
                </>
              )}
            </div>
          )}

          {/* Meta Row 2: Tags, Difficulty, Stats */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Difficulty */}
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${difficulty.color}`}>
              {difficulty.text}
            </span>

            {/* Tags */}
            {question.tags.slice(0, 3).map(tag => (
              <span key={tag.id} className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs">
                #{tag.name}
              </span>
            ))}
            {question.tags.length > 3 && (
              <span className="text-xs text-slate-400">+{question.tags.length - 3}</span>
            )}

            {/* Answers count */}
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle className="w-3 h-3" />
              {question.answers.length} đáp án
            </span>

            {/* Exam count */}
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <FileText className="w-3 h-3" />
              {question.exam_count} đề
            </span>

            {/* Pending feedbacks */}
            {pendingFeedbacks > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded text-xs">
                <AlertCircle className="w-3 h-3" />
                {pendingFeedbacks} phản hồi
              </span>
            )}

            {/* Source */}
            {question.source_exam && (
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                Nguồn: {question.source_exam}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={onViewDetail}
          className="flex-shrink-0 p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Xem chi tiết"
        >
          <Eye className="w-5 h-5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400" />
        </button>
      </div>
    </div>
  )
}

// ==================== QUESTION DETAIL MODAL ====================
function QuestionDetailModal({
  question,
  onClose,
  getDifficultyLabel,
  getFeedbackStatusLabel,
  formatDate
}: {
  question: QuestionFull
  onClose: () => void
  getDifficultyLabel: (level: number) => { text: string; color: string }
  getFeedbackStatusLabel: (status: string) => { text: string; color: string }
  formatDate: (date: string) => string
}) {
  const difficulty = getDifficultyLabel(question.difficulty)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Chi tiết câu hỏi</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ID: {question.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Question Content */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Nội dung câu hỏi</h3>
            <MathContent content={question.content} className="text-slate-800 dark:text-slate-100" />
            {question.tikz_image_url && (
              <img 
                src={question.tikz_image_url} 
                alt="Question image" 
                className="mt-4 max-w-full rounded-lg border border-slate-200 dark:border-slate-600"
              />
            )}
          </div>

          {/* Answers */}
          <div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Đáp án ({question.answers.length})
            </h3>
            <div className="space-y-2">
              {question.answers.map((answer, idx) => (
                <div 
                  key={answer.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    answer.is_correct 
                      ? 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900/20' 
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    answer.is_correct 
                      ? 'bg-green-500 text-white' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <div className={`text-sm flex-1 ${
                    answer.is_correct 
                      ? 'text-green-700 dark:text-green-400 font-medium' 
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    <MathContent content={answer.content} />
                  </div>
                  {answer.is_correct && (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Taxonomy & Meta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Taxonomy */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Phân loại
              </h3>
              {question.taxonomy ? (
                <div className="space-y-2 text-sm">
                  {question.taxonomy.topic && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400 w-24">Chủ đề:</span>
                      <span className="text-teal-600 dark:text-teal-400 font-medium">{question.taxonomy.topic.name}</span>
                    </div>
                  )}
                  {question.taxonomy.category && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400 w-24">Chương:</span>
                      <span className="text-slate-700 dark:text-slate-300">{question.taxonomy.category.name}</span>
                    </div>
                  )}
                  {question.taxonomy.section && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400 w-24">Bài học:</span>
                      <span className="text-slate-700 dark:text-slate-300">{question.taxonomy.section.name}</span>
                    </div>
                  )}
                  {question.taxonomy.subsection && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400 w-24">Dạng bài:</span>
                      <span className="text-slate-700 dark:text-slate-300">{question.taxonomy.subsection.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Chưa phân loại</p>
              )}
            </div>

            {/* Meta Info */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Thông tin
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 w-20">Độ khó:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${difficulty.color}`}>
                    {difficulty.text}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 w-20">Loại:</span>
                  <span className="text-slate-700 dark:text-slate-300">{question.question_type}</span>
                </div>
                {question.cognitive_level && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400 w-20">Bloom:</span>
                    <span className="text-slate-700 dark:text-slate-300">{question.cognitive_level}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 w-20">Số đề:</span>
                  <span className="text-slate-700 dark:text-slate-300">{question.exam_count} đề thi</span>
                </div>
                {question.source_exam && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400 w-20">Nguồn:</span>
                    <span className="text-slate-700 dark:text-slate-300">{question.source_exam}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400 w-20">Tạo:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDate(question.created_at)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          {question.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Tags ({question.tags.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {question.tags.map(tag => (
                  <span 
                    key={tag.id} 
                    className="px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Solution */}
          {(question.explanation || question.solution) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Lời giải
              </h3>
              <MathContent 
                content={question.solution || question.explanation || ''} 
                className="text-sm text-blue-800 dark:text-blue-300" 
              />
              {question.solution_tikz_image_url && (
                <img 
                  src={question.solution_tikz_image_url} 
                  alt="Solution image" 
                  className="mt-4 max-w-full rounded-lg border border-blue-200 dark:border-blue-700"
                />
              )}
              {question.solution_tikz_image_url_2 && (
                <img 
                  src={question.solution_tikz_image_url_2} 
                  alt="Solution image 2" 
                  className="mt-4 max-w-full rounded-lg border border-blue-200 dark:border-blue-700"
                />
              )}
            </div>
          )}

          {/* Feedbacks */}
          {question.feedbacks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Phản hồi ({question.feedbacks.length})
              </h3>
              <div className="space-y-2">
                {question.feedbacks.map(feedback => {
                  const status = getFeedbackStatusLabel(feedback.status)
                  return (
                    <div 
                      key={feedback.id}
                      className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                          {status.text}
                        </span>
                        {feedback.student_name && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            bởi {feedback.student_name}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                          {formatDate(feedback.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{feedback.message}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
