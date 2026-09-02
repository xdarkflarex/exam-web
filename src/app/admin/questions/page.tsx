'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  HelpCircle, Search, FileText, CheckCircle, Eye, X,
  Filter, Tag, BookOpen, Layers, MessageSquare,
  BarChart3, Brain, AlertCircle, ChevronRight,
  Download, CheckSquare, Square, PenLine, FolderTree, Loader2
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import BulkTaxonomyDialog from '@/components/admin/BulkTaxonomyDialog'
import MathContent from '@/components/MathContent'
import { buildExBlocks, ExportQuestion } from '@/lib/export/questionToLatex'
import { downloadTextFile } from '@/lib/export/download'
import { fetchAllAnswers } from '@/lib/answers/fetchAnswers'

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

/**
 * Số câu mỗi lượt tải.
 *
 * 50 chứ không phải 500: mỗi câu kéo theo đáp án, taxonomy, tag, phản hồi và
 * số lần được dùng trong đề, nên 500 câu là vài nghìn dòng dựng DOM một lượt —
 * đủ để đơ máy cấu hình vừa.
 */
const PAGE_SIZE = 50

/**
 * Đang lọc mà tổng kết quả không quá ngưỡng này thì TẢI HẾT luôn, không bắt bấm
 * "Tải thêm".
 *
 * Vì sao cần: luồng dùng thật là lọc cho còn ít câu -> "Chọn tất cả" -> xuất
 * .tex. Nếu chỉ tải 50 thì "Chọn tất cả" chọn đúng 50 và FILE XUẤT RA THIẾU mà
 * không có gì báo. Phân trang chỉ để chống đơ lúc mở trang chưa lọc; khi đã lọc
 * xuống vài chục/vài trăm câu thì tải hết mới là hành vi đúng.
 *
 * Trên ngưỡng này vẫn có nút "Tải hết" bấm tay, kèm cảnh báo.
 */
const AUTO_LOAD_MAX = 500

/** Hàng thô từ bảng `questions`, trước khi ghép đáp án/taxonomy/tag. */
interface QuestionRow {
  id: string
  content: string
  question_type: string
  difficulty: number
  cognitive_level: string | null
  source_exam: string | null
  explanation: string | null
  solution: string | null
  tikz_code: string | null
  tikz_image_url: string | null
  solution_tikz_image_url: string | null
  solution_tikz_image_url_2: string | null
  created_at: string
  updated_at: string
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
  tikz_code: string | null
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
  const supabase = useMemo(() => createClient(), [])
  
  // State
  const [questions, setQuestions] = useState<QuestionFull[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionFull | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [taxonomyDialogOpen, setTaxonomyDialogOpen] = useState(false)

  /**
   * `?question=<id>` — mở thẳng một câu, dùng bởi trang rà soát AI.
   *
   * Đọc từ `window.location` trong effect chứ không dùng `useSearchParams`:
   * hook đó buộc trang phải nằm trong một Suspense boundary khi build tĩnh, và
   * trang này thì không cần cái ràng buộc đó chỉ để đọc một tham số.
   */
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  /** Đã tự mở modal cho `focusQuestionId` chưa — chỉ mở MỘT lần. */
  const focusOpenedRef = useRef(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('question')
    if (value) setFocusQuestionId(value)
  }, [])
  
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
  const [selectedQuestionType, setSelectedQuestionType] = useState<string>('')
  /** Tổng số câu KHỚP BỘ LỌC trên server, không phải số câu đã tải về. */
  const [totalCount, setTotalCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  /*
    Ô tìm kiếm giờ bắn truy vấn xuống server, nên phải hoãn: gõ "nguyên hàm" mà
    không hoãn là 10 truy vấn liên tiếp, và câu trả lời về không đúng thứ tự thì
    kết quả nhấp nháy.
  */
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string>('')

  // ==================== FETCH DATA ====================
  /*
    TẢI THEO TRANG, LỌC Ở SERVER.

    Bản trước tải 500 câu mới nhất rồi lọc trong trình duyệt. Hai hậu quả, và
    cả hai đều đã gặp thật:

      1. Đơ máy. 500 câu kéo theo đáp án, taxonomy, tag, phản hồi, số lần dùng
         — vài nghìn dòng dựng thành DOM một lượt.
      2. Bộ lọc NÓI SAI. Lọc trên 500 câu mới nhất nên một nguồn có 81 câu cũ
         chỉ hiện ra vài câu, mà giao diện không hề nói là đang thiếu.

    Giờ mỗi lượt lấy PAGE_SIZE câu, mọi điều kiện lọc đẩy xuống PostgREST, và
    `count: 'exact'` cho biết TỔNG số câu khớp — nên "hiện 50 / 1.234" là con số
    thật chứ không phải phần đã kịp tải.

    Lọc theo taxonomy/tag dùng embed `!inner`: nó biến quan hệ thành phép nối
    trong ngay trên server. Cách khác là truy vấn lấy danh sách question_id rồi
    `.in(...)`, nhưng vài nghìn id nhét vào URL sẽ vượt giới hạn độ dài và trả 414.
  */
  const fetchQuestions = useCallback(async (offset: number, append: boolean, forceAll = false) => {
    // Trang đầu dùng chung cờ `loading` với phần taxonomy: nếu không, danh sách
    // rỗng lọt ra giữa hai lượt tải và giao diện nháy "Không có câu hỏi nào".
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const taxonomyFilterActive = Boolean(
        selectedTopicId || selectedCategoryId || selectedSectionId || selectedSubsectionId
      )

      const embeds: string[] = []
      if (taxonomyFilterActive) embeds.push('question_taxonomy!inner(question_id)')
      if (selectedTagId) embeds.push('question_tags!inner(question_id)')

      const columns = [
        'id', 'content', 'question_type', 'difficulty', 'cognitive_level',
        'source_exam', 'explanation', 'solution', 'tikz_code', 'tikz_image_url',
        'solution_tikz_image_url', 'solution_tikz_image_url_2',
        'created_at', 'updated_at',
        ...embeds,
      ].join(', ')

      const runPage = (from: number, to: number) => {
        let query = supabase
          .from('questions')
          .select(columns, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to)

        // Lọc theo đúng một câu. Đứng trước mọi bộ lọc khác vì nó là bộ lọc
        // hẹp nhất — và vì người tới từ trang rà soát muốn thấy đúng câu đó,
        // không phải "câu đó nếu nó lọt qua các bộ lọc đang bật".
        if (focusQuestionId) query = query.eq('id', focusQuestionId)

        if (debouncedSearch) {
          // `%` và `_` là ký tự đại diện của LIKE. Người dùng gõ chúng để tìm
          // đúng ký tự đó, không phải để làm mẫu khớp — nên phải thoát.
          const safe = debouncedSearch.replace(/[%_]/g, (c) => '\\' + c)
          query = query.ilike('content', '%' + safe + '%')
        }
        if (selectedDifficulty) query = query.eq('difficulty', parseInt(selectedDifficulty))
        if (selectedQuestionType) query = query.eq('question_type', selectedQuestionType)
        if (selectedTopicId) query = query.eq('question_taxonomy.topic_id', selectedTopicId)
        if (selectedCategoryId) query = query.eq('question_taxonomy.category_id', selectedCategoryId)
        if (selectedSectionId) query = query.eq('question_taxonomy.section_id', selectedSectionId)
        if (selectedSubsectionId) query = query.eq('question_taxonomy.subsection_id', selectedSubsectionId)
        if (selectedTagId) query = query.eq('question_tags.tag_id', selectedTagId)

        return query
      }

      const { data: rawRows, error: qError, count } = await runPage(offset, offset + PAGE_SIZE - 1)

      if (qError) {
        console.error('Fetch questions error:', qError)
        return
      }

      const total = count ?? 0
      setTotalCount(total)

      let questionsData = (rawRows ?? []) as unknown as QuestionRow[]

      /*
        TỰ TẢI HẾT KHI ĐANG LỌC VÀ TẬP KẾT QUẢ NHỎ.

        Luồng dùng thật: lọc cho còn ít câu -> Chọn tất cả -> xuất .tex. Dừng ở
        50 câu thì "Chọn tất cả" chọn đúng 50 và file xuất ra thiếu, im lặng.
        Gom hết TRƯỚC khi setState một lần: tải từng trang rồi setState nhiều
        lần sẽ khiến danh sách nhảy và mỗi lượt lại dựng lại DOM.
      */
      const filterActive = Boolean(
        debouncedSearch ||
          selectedDifficulty ||
          selectedQuestionType ||
          selectedTopicId ||
          selectedCategoryId ||
          selectedSectionId ||
          selectedSubsectionId ||
          selectedTagId
      )
      const shouldLoadAll = !append && (forceAll || (filterActive && total <= AUTO_LOAD_MAX))

      if (shouldLoadAll) {
        for (let from = offset + questionsData.length; from < total; from += PAGE_SIZE) {
          const more = await runPage(from, from + PAGE_SIZE - 1)
          if (more.error) {
            console.error('Fetch questions (load all) error:', more.error)
            break
          }
          const batch = (more.data ?? []) as unknown as QuestionRow[]
          if (batch.length === 0) break
          questionsData = questionsData.concat(batch)
        }
      }

      if (questionsData.length === 0) {
        if (!append) setQuestions([])
        return
      }

      const questionIds = questionsData.map((q) => q.id)

      const [allAnswers, taxonomyRes, questionTagsRes, feedbacksRes, examCountRes] =
        await Promise.all([
          fetchAllAnswers(supabase, questionIds),

          supabase
            .from('question_taxonomy')
            .select(
              'question_id, topic_id, category_id, section_id, subsection_id, topics:topic_id(id, name), categories:category_id(id, name), sections:section_id(id, name), subsections:subsection_id(id, name)'
            )
            .in('question_id', questionIds),

          supabase
            .from('question_tags')
            .select('question_id, tags:tag_id(id, name)')
            .in('question_id', questionIds),

          supabase
            .from('question_feedbacks')
            .select('id, question_id, message, status, created_at, profiles:student_id(full_name)')
            .in('question_id', questionIds)
            .order('created_at', { ascending: false }),

          supabase.from('exam_questions').select('question_id').in('question_id', questionIds),
        ])

      const answersMap: Record<string, Answer[]> = {}
      for (const a of allAnswers) {
        if (!answersMap[a.question_id]) answersMap[a.question_id] = []
        answersMap[a.question_id].push({
          id: a.id,
          content: a.content,
          is_correct: a.is_correct,
          order_index: a.order_index,
        })
      }
      for (const id of Object.keys(answersMap)) {
        answersMap[id].sort((x, y) => x.order_index - y.order_index)
      }

      const taxonomyMap: Record<string, QuestionTaxonomy> = {}
      for (const t of taxonomyRes.data || []) {
        taxonomyMap[t.question_id] = {
          topic: t.topics as unknown as Topic,
          category: t.categories as unknown as Category,
          section: t.sections as unknown as Section,
          subsection: t.subsections as unknown as Subsection,
        }
      }

      const tagsMap: Record<string, TagItem[]> = {}
      for (const qt of questionTagsRes.data || []) {
        if (!tagsMap[qt.question_id]) tagsMap[qt.question_id] = []
        if (qt.tags) tagsMap[qt.question_id].push(qt.tags as unknown as TagItem)
      }

      const feedbacksMap: Record<string, Feedback[]> = {}
      for (const f of feedbacksRes.data || []) {
        if (!feedbacksMap[f.question_id]) feedbacksMap[f.question_id] = []
        feedbacksMap[f.question_id].push({
          id: f.id,
          message: f.message,
          status: f.status,
          created_at: f.created_at,
          student_name: Array.isArray(f.profiles)
            ? f.profiles[0]?.full_name
            : (f.profiles as { full_name?: string } | null)?.full_name,
        })
      }

      const examCountMap: Record<string, number> = {}
      for (const eq of examCountRes.data || []) {
        examCountMap[eq.question_id] = (examCountMap[eq.question_id] || 0) + 1
      }

      /*
        Lấy CỘT TƯỜNG MINH thay vì trải `...q`. Khi có embed `!inner`, hàng trả
        về mang thêm khoá của phép nối; trải nguyên hàng vào `QuestionFull` là
        nhét dữ liệu lạ vào kiểu.
      */
      const page: QuestionFull[] = questionsData.map((q) => ({
        id: q.id,
        content: q.content,
        question_type: q.question_type,
        difficulty: q.difficulty,
        cognitive_level: q.cognitive_level,
        source_exam: q.source_exam,
        explanation: q.explanation,
        solution: q.solution,
        tikz_code: q.tikz_code,
        tikz_image_url: q.tikz_image_url,
        solution_tikz_image_url: q.solution_tikz_image_url,
        solution_tikz_image_url_2: q.solution_tikz_image_url_2,
        created_at: q.created_at,
        updated_at: q.updated_at,
        answers: answersMap[q.id] || [],
        taxonomy: taxonomyMap[q.id] || null,
        tags: tagsMap[q.id] || [],
        feedbacks: feedbacksMap[q.id] || [],
        exam_count: examCountMap[q.id] || 0,
      }))

      setQuestions((prev) => (append ? [...prev, ...page] : page))
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [
    supabase,
    focusQuestionId,
    debouncedSearch,
    selectedDifficulty,
    selectedQuestionType,
    selectedTopicId,
    selectedCategoryId,
    selectedSectionId,
    selectedSubsectionId,
    selectedTagId,
  ])

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
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
    } catch (err) {
      console.error('Error fetching data:', err)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchAllData()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchAllData])

  // Hoãn ô tìm kiếm: mỗi lần gõ giờ là một truy vấn xuống server.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchTerm])

  /*
    Đổi bộ lọc là tải lại TỪ TRANG ĐẦU. `fetchQuestions` được memo theo đúng tập
    biến lọc, nên chỉ cần phụ thuộc vào chính nó — đổi bất kỳ bộ lọc nào thì
    tham chiếu đổi và effect chạy lại.
  */
  useEffect(() => {
    void fetchQuestions(0, false)
  }, [fetchQuestions])

  /*
    Tới từ trang rà soát bằng `?question=<id>`: mở luôn màn chi tiết.

    Chỉ mở MỘT lần. Không có `focusOpenedRef` thì đóng modal xong nó lại bật lên
    ngay ở lần render kế tiếp, và không có cách nào đóng được.
  */
  useEffect(() => {
    if (!focusQuestionId || focusOpenedRef.current) return
    const match = questions.find((question) => question.id === focusQuestionId)
    if (!match) return
    focusOpenedRef.current = true
    setSelectedQuestion(match)
    setShowDetailModal(true)
  }, [focusQuestionId, questions])

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

  /*
    Lọc đã chuyển hết xuống server (xem `fetchQuestions`), nên `questions` CHÍNH
    LÀ danh sách đã lọc. Giữ tên cũ để các chỗ dùng bên dưới không phải đổi, và
    để không ai vô tình thêm lại một tầng lọc thứ hai ở client — hai tầng lọc là
    hai nguồn sự thật, đúng thứ vừa gây ra chuyện "nguồn 81 câu chỉ hiện 6".
  */
  const filteredQuestions = questions

  // ==================== HANDLERS ====================
  const handleViewDetail = (question: QuestionFull) => {
    setSelectedQuestion(question)
    setShowDetailModal(true)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected = filteredQuestions.length > 0 &&
    filteredQuestions.every(q => selectedIds.has(q.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredQuestions.map(q => q.id)))
    }
  }

  const handleExportTex = () => {
    // Export selected questions; if none selected, export all filtered.
    // The list is sorted newest-first (created_at desc), so reverse to keep
    // the exported order chronological (oldest first), matching expectations.
    const source = [...(selectedIds.size > 0
      ? filteredQuestions.filter(q => selectedIds.has(q.id))
      : filteredQuestions)].reverse()

    if (source.length === 0) return

    const exportQuestions: ExportQuestion[] = source.map(q => ({
      content: q.content,
      question_type: q.question_type,
      tikz_code: q.tikz_code,
      answers: q.answers.map(a => ({
        content: a.content,
        is_correct: a.is_correct,
        order_index: a.order_index
      }))
    }))

    const tex = buildExBlocks(exportQuestions)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`cau-hoi-${stamp}.tex`, tex)
  }

  const clearFilters = () => {
    setSelectedTopicId('')
    setSelectedCategoryId('')
    setSelectedSectionId('')
    setSelectedSubsectionId('')
    setSelectedDifficulty('')
    setSelectedTagId('')
    setSelectedQuestionType('')
    setSearchTerm('')
  }

  const hasActiveFilters = selectedTopicId || selectedCategoryId || selectedSectionId || selectedSubsectionId || selectedDifficulty || selectedTagId || selectedQuestionType || searchTerm

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

      {/* Đang xem đúng một câu vì tới từ trang rà soát. Nói rõ ra, nếu không
          danh sách một dòng trông như dữ liệu bị mất. */}
      {focusQuestionId && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-teal-300 bg-teal-50 p-3 text-sm dark:border-teal-700 dark:bg-teal-900/20 sm:mx-6 lg:mx-8">
          <span className="text-slate-700 dark:text-slate-200">
            Đang lọc đúng một câu:{' '}
            <span className="font-mono text-xs">{focusQuestionId}</span>
          </span>
          <a
            href="/admin/questions"
            className="font-medium text-teal-700 hover:underline dark:text-teal-300"
          >
            Xem tất cả câu hỏi
          </a>
        </div>
      )}
      
      <div className="p-6">
        <div className="mb-5 flex justify-end">
          <Link
            href="/admin/questions/essay/new"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <PenLine className="h-4 w-4" />
            Tạo câu tự luận thử
          </Link>
        </div>
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

            {/* Subsection = Dạng bài */}
            <select
              value={selectedSubsectionId}
              onChange={(e) => setSelectedSubsectionId(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              disabled={!selectedSectionId}
            >
              <option value="">Tất cả dạng bài</option>
              {filteredSubsections.map(s => (
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

            {/*
              Lọc theo DẠNG CÂU. Giá trị phải trùng đúng bốn giá trị trong
              source (`AGENTS.md` mục 4): multiple_choice, true_false,
              short_answer, essay. Nhãn hiển thị kèm số phần của đề Bộ GD&ĐT
              để khớp với thứ giáo viên thấy khi ráp đề.
            */}
            <select
              value={selectedQuestionType}
              onChange={(e) => setSelectedQuestionType(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
            >
              <option value="">Tất cả dạng câu</option>
              <option value="multiple_choice">Trắc nghiệm (Phần 1)</option>
              <option value="true_false">Đúng / Sai (Phần 2)</option>
              <option value="short_answer">Trả lời ngắn (Phần 3)</option>
              <option value="essay">Tự luận</option>
            </select>
          </div>
        </div>

        {/* Results count + Export toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {/*
            Nói rõ ĐÃ TẢI bao nhiêu trên TỔNG bao nhiêu. Bản trước chỉ in số câu
            đang có trong bộ nhớ, nên khi nó bị cắt ở 500 thì giao diện im lặng
            và người dùng tưởng ngân hàng chỉ có bấy nhiêu.
          */}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Đã tải{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
              {questions.length.toLocaleString('vi-VN')}
            </span>
            {' / '}
            <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
              {totalCount.toLocaleString('vi-VN')}
            </span>{' '}
            câu
            {hasActiveFilters && <span> khớp bộ lọc</span>}
            {totalCount > 0 && questions.length >= totalCount && (
              <span className="ml-2 text-emerald-700 dark:text-emerald-400">• đã tải đủ</span>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-teal-600 dark:text-teal-400">• Đã chọn {selectedIds.size}</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {/* Phân loại lại: chỉ bật khi đã chọn câu — hành động ghi đè hàng
                loạt không nên bấm được lúc chưa rõ nó tác động lên cái gì. */}
            <button
              onClick={() => setTaxonomyDialogOpen(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedIds.size === 0 ? 'Chọn câu hỏi trước' : `Phân loại lại ${selectedIds.size} câu`}
            >
              <FolderTree className="w-4 h-4" />
              Phân loại lại{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
            <button
              onClick={toggleSelectAll}
              disabled={filteredQuestions.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
            <button
              onClick={handleExportTex}
              disabled={filteredQuestions.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
              title="Xuất các câu đã chọn (hoặc toàn bộ kết quả lọc) ra file .tex"
            >
              <Download className="w-4 h-4" />
              Xuất .tex {selectedIds.size > 0 ? `(${selectedIds.size})` : `(${filteredQuestions.length})`}
            </button>
          </div>
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
                selected={selectedIds.has(question.id)}
                onToggleSelect={() => toggleSelect(question.id)}
              />
            ))}
          </div>
        )}

        {/*
          Tải thêm theo yêu cầu, không cuộn-vô-tận. Người soạn cần biết mình
          đang xem bao nhiêu và chủ động quyết định tải thêm; cuộn vô tận sẽ
          lặng lẽ kéo cả nghìn câu về đúng như bản cũ.
        */}
        {questions.length > 0 && questions.length < totalCount && (
          <div className="mt-5 flex flex-col items-center gap-3">
            {/*
              CẢNH BÁO PHẢI CÓ. "Chọn tất cả" và "Xuất .tex" chỉ làm việc trên
              phần ĐÃ TẢI. Không nói ra thì người dùng lọc xong, chọn hết, xuất
              file và nhận một file thiếu câu mà không biết.
            */}
            <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Còn {(totalCount - questions.length).toLocaleString('vi-VN')} câu chưa tải.
              <br />
              &quot;Chọn tất cả&quot; và &quot;Xuất .tex&quot; chỉ áp dụng cho{' '}
              {questions.length.toLocaleString('vi-VN')} câu đang hiển thị.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => void fetchQuestions(questions.length, true)}
                disabled={loadingMore || loading}
                className="btn-action inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-400 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                Tải thêm {Math.min(PAGE_SIZE, totalCount - questions.length)} câu
              </button>
              <button
                onClick={() => void fetchQuestions(0, false, true)}
                disabled={loadingMore || loading}
                className="btn-action inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                title="Tải toàn bộ kết quả khớp bộ lọc để chọn hết và xuất .tex"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Tải hết {totalCount.toLocaleString('vi-VN')} câu
              </button>
            </div>
            {totalCount > AUTO_LOAD_MAX && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trên {AUTO_LOAD_MAX} câu thì tải hết sẽ chậm — nên lọc hẹp lại trước.
              </p>
            )}
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

      {/* Phân loại lại hàng loạt cho các câu đang chọn. Chỉ truyền id + nội
          dung: hộp thoại cần nội dung để chạy bảng luật gợi ý, không cần gì
          thêm của câu hỏi. */}
      <BulkTaxonomyDialog
        open={taxonomyDialogOpen}
        onClose={() => setTaxonomyDialogOpen(false)}
        questions={questions
          .filter((question) => selectedIds.has(question.id))
          .map((question) => ({ id: question.id, content: question.content }))}
        topics={topics}
        categories={categories}
        sections={sections}
        subsections={subsections}
        onApplied={() => {
          setSelectedIds(new Set())
          void fetchQuestions(0, false)
        }}
      />
    </div>
  )
}

// ==================== QUESTION CARD COMPONENT ====================
function QuestionCard({
  question,
  onViewDetail,
  getDifficultyLabel,
  selected,
  onToggleSelect
}: {
  question: QuestionFull
  onViewDetail: () => void
  getDifficultyLabel: (level: number) => { text: string; color: string }
  selected: boolean
  onToggleSelect: () => void
}) {
  const difficulty = getDifficultyLabel(question.difficulty)
  const pendingFeedbacks = question.feedbacks.filter(f => f.status === 'pending').length

  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 hover:shadow-md hover:border-teal-200 dark:hover:border-teal-600 transition-all">
      <div className="flex items-start gap-4">
        {/* Selection checkbox */}
        <button
          onClick={onToggleSelect}
          className="flex-shrink-0 mt-0.5 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Chọn câu hỏi để xuất"
        >
          {selected
            ? <CheckSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            : <Square className="w-5 h-5 text-slate-300 dark:text-slate-500" />}
        </button>
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
