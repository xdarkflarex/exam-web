'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Clock, FileText, CheckCircle, Loader2, ArrowLeft, Plus } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSourceExams()
  }, [])

  useEffect(() => {
    if (selectedSource) {
      fetchPreview(selectedSource)
    } else {
      setPreview(null)
    }
  }, [selectedSource])

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

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'Trắc nghiệm'
      case 'true_false': return 'Đúng / Sai'
      case 'short_answer': return 'Trả lời ngắn'
      default: return type
    }
  }

  const handleCreateExam = async () => {
    if (!selectedSource || !title.trim()) {
      setError('Vui lòng điền đầy đủ thông tin')
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
          duration: duration,
          total_score: preview?.totalQuestions || 0,
          passing_score: Math.ceil((preview?.totalQuestions || 0) * 0.5),
          is_published: false,
          source_exam: selectedSource
        })
        .select('id')
        .single()

      if (examError) {
        console.error('Create exam error:', examError)
        setError('Không thể tạo bài thi: ' + examError.message)
        setCreating(false)
        return
      }

      // 2. Fetch ALL question IDs for selected source_exam (ordered by created_at)
      const { data: questions, error: questionsError } = await supabase
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
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Tạo bài thi mới" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-slate-500">Đang tải...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      <GlobalHeader title="Tạo bài thi mới" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tạo bài thi từ đề gốc</h1>
            <p className="text-slate-600">Chọn đề gốc và tạo bài thi mới</p>
          </div>
          <button
            onClick={() => router.push('/admin/exams')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100 space-y-6">
          {/* Source Exam Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Chọn đề gốc <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">-- Chọn đề gốc --</option>
              {sourceExams.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {loadingPreview && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          )}

          {preview && !loadingPreview && (
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Thông tin đề gốc
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{preview.totalQuestions}</div>
                  <div className="text-xs text-slate-500">Tổng câu hỏi</div>
                </div>
                {preview.breakdown.map((item) => (
                  <div key={item.question_type} className="bg-white rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-700">{item.count}</div>
                    <div className="text-xs text-slate-500">{getQuestionTypeLabel(item.question_type)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exam Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tên bài thi <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đề thi thử THPT 2024 - Lần 1"
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Thời gian làm bài (phút)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                min={10}
                max={300}
                className="w-32 px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <div className="flex items-center gap-1 text-slate-500">
                <Clock className="w-4 h-4" />
                <span>{Math.floor(duration / 60)}h {duration % 60}m</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-4 border-t border-slate-200">
            <button
              onClick={handleCreateExam}
              disabled={creating || !selectedSource || !title.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Tạo bài thi
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
