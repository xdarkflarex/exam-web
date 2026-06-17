'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Clock, FileText, CheckCircle, Loader2, ArrowLeft, Plus, Filter } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'
import { nanoid } from 'nanoid'

interface SourceExamOption {
  source_exam: string
}

interface QuestionTypeCount {
  question_type: string
  count: number
}

interface PreviewData {
  totalQuestions: number
  breakdown: QuestionTypeCount[]
}

interface TaxonomyItem {
  id: string
  name: string
  topic_id?: string
  category_id?: string
  section_id?: string
}

export default function CreateExamPage() {
  const router = useRouter()
  const supabase = createClient()

  const [sourceExams, setSourceExams] = useState<string[]>([])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(90)
  const [grade, setGrade] = useState<number>(12)
  const [examMode, setExamMode] = useState<'practice' | 'simulation' | 'homework'>('simulation')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  // Taxonomy (dùng cho chế độ Bài tập về nhà: tạo bài theo bài học/dạng bài)
  const [topics, setTopics] = useState<TaxonomyItem[]>([])
  const [categories, setCategories] = useState<TaxonomyItem[]>([])
  const [sections, setSections] = useState<TaxonomyItem[]>([])
  const [subsections, setSubsections] = useState<TaxonomyItem[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [selectedSubsectionId, setSelectedSubsectionId] = useState('')
  const [selectedCognitive, setSelectedCognitive] = useState('')
  // Loại câu hỏi muốn bao gồm trong bài tập về nhà (bật/tắt từng loại)
  const [includedTypes, setIncludedTypes] = useState<Set<string>>(
    new Set(['multiple_choice', 'true_false', 'short_answer'])
  )
  // Số câu mỗi session khi làm bài tập về nhà
  const [sessionSize, setSessionSize] = useState(10)
  // ids câu hỏi khớp bộ lọc taxonomy (cache cho preview + tạo bài)
  const [taxonomyQuestionIds, setTaxonomyQuestionIds] = useState<string[]>([])

  useEffect(() => {
    fetchSourceExams()
    fetchTaxonomy()
  }, [])

  useEffect(() => {
    if (examMode === 'homework') {
      setPreview(null)
      return
    }
    if (selectedSource) {
      fetchPreview(selectedSource)
    } else {
      setPreview(null)
    }
  }, [selectedSource, examMode])

  const fetchSourceExams = async () => {
    try {
      // Query DISTINCT source_exam from questions where source_exam is not null
      const { data, error } = await supabase
        .from('questions')
        .select('source_exam')
        .not('source_exam', 'is', null)
        .order('source_exam')

      if (error) {
        console.error('Fetch source_exam error:', error)
        setError('Không thể tải danh sách đề gốc')
        setLoading(false)
        return
      }

      // Get unique values
      const uniqueSources = [...new Set(data?.map(d => d.source_exam).filter(Boolean))] as string[]
      setSourceExams(uniqueSources)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const fetchPreview = async (sourceExam: string) => {
    setLoadingPreview(true)
    try {
      // Fetch questions for this source_exam
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_type')
        .eq('source_exam', sourceExam)

      if (error) {
        console.error('Fetch preview error:', error)
        setLoadingPreview(false)
        return
      }

      // Calculate breakdown by question_type
      const breakdown: Record<string, number> = {}
      for (const q of data || []) {
        const type = q.question_type || 'unknown'
        breakdown[type] = (breakdown[type] || 0) + 1
      }

      setPreview({
        totalQuestions: data?.length || 0,
        breakdown: Object.entries(breakdown).map(([question_type, count]) => ({
          question_type,
          count
        }))
      })
      setLoadingPreview(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setLoadingPreview(false)
    }
  }

  const fetchTaxonomy = async () => {
    try {
      const [topicsRes, categoriesRes, sectionsRes, subsectionsRes] = await Promise.all([
        supabase.from('topics').select('id, name').order('order_index'),
        supabase.from('categories').select('id, name, topic_id').order('order_index'),
        supabase.from('sections').select('id, name, category_id, topic_id').order('order_index'),
        supabase.from('subsections').select('id, name, section_id').order('order_index'),
      ])
      setTopics((topicsRes.data || []) as TaxonomyItem[])
      setCategories((categoriesRes.data || []) as TaxonomyItem[])
      setSections((sectionsRes.data || []) as TaxonomyItem[])
      setSubsections((subsectionsRes.data || []) as TaxonomyItem[])
    } catch (err) {
      console.error('Fetch taxonomy error:', err)
    }
  }

  const filteredCategories = useMemo(
    () => selectedTopicId ? categories.filter(c => c.topic_id === selectedTopicId) : categories,
    [categories, selectedTopicId]
  )
  const filteredSections = useMemo(() => {
    if (selectedCategoryId) return sections.filter(s => s.category_id === selectedCategoryId)
    if (selectedTopicId) return sections.filter(s => s.topic_id === selectedTopicId)
    return sections
  }, [sections, selectedTopicId, selectedCategoryId])
  const filteredSubsections = useMemo(
    () => selectedSectionId ? subsections.filter(s => s.section_id === selectedSectionId) : [],
    [subsections, selectedSectionId]
  )

  const hasTaxonomyFilter = !!(selectedTopicId || selectedCategoryId || selectedSectionId || selectedSubsectionId || selectedCognitive)

  // Tải preview cho chế độ Bài tập về nhà dựa trên bộ lọc taxonomy + mức độ
  const fetchHomeworkPreview = useCallback(async () => {
    if (!hasTaxonomyFilter) {
      setPreview(null)
      setTaxonomyQuestionIds([])
      return
    }
    setLoadingPreview(true)
    try {
      // 1. Lọc question_id theo taxonomy (chọn cấp sâu nhất đã chọn)
      let taxQuery = supabase.from('question_taxonomy').select('question_id')
      if (selectedSubsectionId) taxQuery = taxQuery.eq('subsection_id', selectedSubsectionId)
      else if (selectedSectionId) taxQuery = taxQuery.eq('section_id', selectedSectionId)
      else if (selectedCategoryId) taxQuery = taxQuery.eq('category_id', selectedCategoryId)
      else if (selectedTopicId) taxQuery = taxQuery.eq('topic_id', selectedTopicId)

      let questionIds: string[] | null = null
      if (selectedTopicId || selectedCategoryId || selectedSectionId || selectedSubsectionId) {
        const { data: taxRows, error: taxErr } = await taxQuery
        if (taxErr) { console.error('taxonomy filter error:', taxErr); setLoadingPreview(false); return }
        questionIds = [...new Set((taxRows || []).map(r => r.question_id as string))]
        if (questionIds.length === 0) {
          setPreview({ totalQuestions: 0, breakdown: [] })
          setTaxonomyQuestionIds([])
          setLoadingPreview(false)
          return
        }
      }

      // 2. Lấy câu hỏi (áp dụng filter mức độ nhận thức nếu có)
      let qQuery = supabase.from('questions').select('id, question_type')
      if (questionIds) qQuery = qQuery.in('id', questionIds)
      if (selectedCognitive) qQuery = qQuery.eq('cognitive_level', selectedCognitive)
      const { data: qData, error: qErr } = await qQuery
      if (qErr) { console.error('questions filter error:', qErr); setLoadingPreview(false); return }

      // 3. Lọc theo loại câu hỏi đã bật
      const filtered = (qData || []).filter(q => includedTypes.has(q.question_type))

      const breakdown: Record<string, number> = {}
      for (const q of filtered) {
        const type = q.question_type || 'unknown'
        breakdown[type] = (breakdown[type] || 0) + 1
      }
      setTaxonomyQuestionIds(filtered.map(q => q.id as string))
      setPreview({
        totalQuestions: filtered.length,
        breakdown: Object.entries(breakdown).map(([question_type, count]) => ({ question_type, count }))
      })
    } finally {
      setLoadingPreview(false)
    }
  }, [hasTaxonomyFilter, selectedTopicId, selectedCategoryId, selectedSectionId, selectedSubsectionId, selectedCognitive, includedTypes, supabase])

  useEffect(() => {
    if (examMode === 'homework') fetchHomeworkPreview()
  }, [examMode, fetchHomeworkPreview])

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'Trắc nghiệm'
      case 'true_false': return 'Đúng / Sai'
      case 'short_answer': return 'Trả lời ngắn'
      default: return type
    }
  }

  const handleCreateExam = async () => {
    const isHomework = examMode === 'homework'

    if (!title.trim()) {
      setError('Vui lòng nhập tên bài')
      return
    }
    if (isHomework) {
      if (!hasTaxonomyFilter || taxonomyQuestionIds.length === 0) {
        setError('Vui lòng chọn bộ lọc (chủ đề/bài/dạng) có câu hỏi để tạo bài tập')
        return
      }
    } else if (!selectedSource) {
      setError('Vui lòng chọn đề gốc')
      return
    }

    setCreating(true)
    setError(null)

    try {
      // 1. Generate exam ID and create exam record
      const examId = nanoid()
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .insert({
          id: examId,
          title: title.trim(),
          subject: 'Toán', // Default subject
          duration: isHomework ? 0 : duration,
          total_score: preview?.totalQuestions || 0,
          passing_score: Math.ceil((preview?.totalQuestions || 0) * 0.5),
          is_published: false,
          source_exam: isHomework ? null : selectedSource,
          grade: grade,
          exam_mode: examMode,
          session_size: isHomework ? sessionSize : 10
        })
        .select('id')
        .single()

      if (examError) {
        console.error('Create exam error:', examError)
        setError('Không thể tạo bài thi: ' + examError.message)
        setCreating(false)
        return
      }

      // 2. Fetch question IDs
      let questions: { id: string; question_type: string }[] | null = null
      if (isHomework) {
        // Bài tập về nhà: dùng câu hỏi đã lọc theo taxonomy
        const { data, error: qErr } = await supabase
          .from('questions')
          .select('id, question_type')
          .in('id', taxonomyQuestionIds)
          .order('created_at', { ascending: true })
        if (qErr) {
          console.error('Fetch questions error:', qErr)
          setError('Không thể tải câu hỏi')
          setCreating(false)
          return
        }
        questions = data
      } else {
        const { data, error: questionsError } = await supabase
          .from('questions')
          .select('id, question_type')
          .eq('source_exam', selectedSource)
          .order('created_at', { ascending: true })
        if (questionsError) {
          console.error('Fetch questions error:', questionsError)
          setError('Không thể tải câu hỏi')
          setCreating(false)
          return
        }
        questions = data
      }

      // 3. Insert exam_questions for each question
      const examQuestions = (questions || []).map((q, index) => ({
        exam_id: examId,
        question_id: q.id,
        question_type: q.question_type,
        part_number: 1,
        order_in_part: index + 1,
        score: 1
      }))

      const { error: insertError } = await supabase
        .from('exam_questions')
        .insert(examQuestions)

      if (insertError) {
        console.error('Insert exam_questions error:', insertError)
        setError('Không thể thêm câu hỏi vào bài thi')
        setCreating(false)
        return
      }

      // Success - redirect to exam detail
      router.push(`/admin/exams/${examId}`)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <GlobalHeader title="Tạo bài thi mới" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
            <p className="text-slate-500 dark:text-slate-400">Đang tải...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <GlobalHeader title={examMode === 'homework' ? 'Tạo bài tập về nhà' : 'Tạo bài thi mới'} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {examMode === 'homework' ? 'Tạo bài tập về nhà' : 'Tạo bài thi từ đề gốc'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {examMode === 'homework' ? 'Gom câu hỏi theo bài học để giao cho học sinh' : 'Chọn đề gốc và tạo bài thi mới'}
            </p>
          </div>
          <button
            onClick={() => router.push('/admin/exams')}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-100 dark:border-slate-700 space-y-6">
          {examMode === 'homework' ? (
            /* Taxonomy filter cho Bài tập về nhà - tạo bài theo bài học/dạng bài */
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                <Filter className="w-4 h-4 text-indigo-500" />
                Lọc câu hỏi theo bài học <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Chủ đề */}
                <select
                  value={selectedTopicId}
                  onChange={(e) => { setSelectedTopicId(e.target.value); setSelectedCategoryId(''); setSelectedSectionId(''); setSelectedSubsectionId('') }}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Tất cả chủ đề</option>
                  {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {/* Chương */}
                <select
                  value={selectedCategoryId}
                  onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedSectionId(''); setSelectedSubsectionId('') }}
                  disabled={!selectedTopicId}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">Tất cả chương</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {/* Bài học */}
                <select
                  value={selectedSectionId}
                  onChange={(e) => { setSelectedSectionId(e.target.value); setSelectedSubsectionId('') }}
                  disabled={!selectedCategoryId}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">Tất cả bài học</option>
                  {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {/* Dạng bài */}
                <select
                  value={selectedSubsectionId}
                  onChange={(e) => setSelectedSubsectionId(e.target.value)}
                  disabled={!selectedSectionId}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">Tất cả dạng bài</option>
                  {filteredSubsections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {/* Mức độ nhận thức */}
                <select
                  value={selectedCognitive}
                  onChange={(e) => setSelectedCognitive(e.target.value)}
                  className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 sm:col-span-2"
                >
                  <option value="">Tất cả mức độ</option>
                  <option value="NB">Nhận biết</option>
                  <option value="TH">Thông hiểu</option>
                  <option value="VD">Vận dụng</option>
                  <option value="VDC">Vận dụng cao</option>
                </select>
              </div>

              {/* Chọn/bỏ loại câu hỏi */}
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Loại câu hỏi đưa vào bài</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'multiple_choice', label: 'Trắc nghiệm' },
                    { key: 'true_false', label: 'Đúng / Sai' },
                    { key: 'short_answer', label: 'Trả lời ngắn' },
                  ] as const).map(t => {
                    const on = includedTypes.has(t.key)
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setIncludedTypes(prev => {
                          const next = new Set(prev)
                          if (next.has(t.key)) next.delete(t.key); else next.add(t.key)
                          return next
                        })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                          on
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 line-through'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Số câu mỗi session */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Số câu mỗi lần làm (session)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={sessionSize}
                    onChange={(e) => setSessionSize(Math.min(50, Math.max(5, parseInt(e.target.value) || 10)))}
                    min={5}
                    max={50}
                    className="w-28 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">câu / phần</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Học sinh làm theo từng phần nhỏ, biết đáp án ngay sau mỗi câu, có thể làm nhiều ngày.
                </p>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Chọn ít nhất một mục để gom câu hỏi theo bài. Chọn càng sâu (chủ đề → chương → bài → dạng), bài tập càng tập trung. Bấm loại câu hỏi để bật/tắt.
              </p>
            </div>
          ) : (
            /* Source Exam Selector */
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Chọn đề gốc <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">-- Chọn đề gốc --</option>
                {sourceExams.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Preview */}
          {loadingPreview && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
          )}

          {preview && !loadingPreview && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {examMode === 'homework' ? 'Câu hỏi khớp bộ lọc' : 'Thông tin đề gốc'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{preview.totalQuestions}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Tổng câu hỏi</div>
                </div>
                {preview.breakdown.map((item) => (
                  <div key={item.question_type} className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-200">{item.count}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{getQuestionTypeLabel(item.question_type)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grade Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Khối lớp <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {[10, 11, 12].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all border ${
                    grade === g
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-teal-400'
                  }`}
                >
                  Lớp {g}
                </button>
              ))}
            </div>
          </div>

          {/* Exam Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Loại đề <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setExamMode('simulation')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all border ${
                  examMode === 'simulation'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-teal-400'
                }`}
              >
                Thi thử (có timer)
              </button>
              <button
                type="button"
                onClick={() => setExamMode('practice')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all border ${
                  examMode === 'practice'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-amber-400'
                }`}
              >
                Ôn tập (không timer)
              </button>
              <button
                type="button"
                onClick={() => setExamMode('homework')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all border ${
                  examMode === 'homework'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-400'
                }`}
              >
                Bài tập về nhà
              </button>
            </div>
            {examMode === 'homework' && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sau khi tạo, vào trang <span className="font-medium">Bài tập về nhà</span> để giao cho lớp/học sinh và đặt hạn nộp.
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {examMode === 'homework' ? 'Tên bài tập' : 'Tên bài thi'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={examMode === 'homework' ? 'VD: BTVN - Tính đơn điệu của hàm số' : 'VD: Đề thi thử THPT 2024 - Lần 1'}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Duration - chỉ cho đề thi/ôn tập, bài tập về nhà không giới hạn nên ẩn */}
          {examMode !== 'homework' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Thời gian làm bài (phút)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                  min={10}
                  max={300}
                  className="w-32 px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span>{Math.floor(duration / 60)}h {duration % 60}m</span>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleCreateExam}
              disabled={creating || !title.trim() || (examMode === 'homework' ? (!hasTaxonomyFilter || (preview?.totalQuestions ?? 0) === 0) : !selectedSource)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  {examMode === 'homework' ? 'Tạo bài tập' : 'Tạo bài thi'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
