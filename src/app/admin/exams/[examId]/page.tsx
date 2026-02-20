'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  FileText, User, Clock, CheckCircle, XCircle, Eye, Calendar, 
  List, Settings, Trash2, Users, ArrowLeft, Edit3, Save, RotateCcw, Circle,
  ChevronLeft, ChevronRight, Plus
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'

interface ExamAttempt {
  id: string
  student_id: string
  status: 'in_progress' | 'submitted'
  score: number | null
  total_questions: number | null
  correct_answers: number | null
  start_time: string
  submit_time: string | null
  student_name: string
  student_email: string
}

interface ExamInfo {
  id: string
  title: string
  subject: string
  duration: number
  is_published: boolean
  source_exam: string | null
  grade: number | null
  exam_mode: string | null
  question_count: number
}

interface Question {
  id: string
  content: string
  question_type: string
  explanation: string
  answers: Array<{
    id: string
    content: string
    is_correct: boolean
    order_index: number
  }>
  order_index: number
  topic_id?: string
  category_id?: string
}

interface Topic {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
}

export default function AdminExamDetailPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = createClient()
  
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [editedQuestion, setEditedQuestion] = useState<Question | null>(null)
  const [activeTab, setActiveTab] = useState<'questions' | 'attempts'>('questions')
  const [topics, setTopics] = useState<Topic[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  
  // DERIVED STATE: selectedQuestion từ questions array (tránh stale state)
  const selectedQuestion = questions.find(q => q.id === selectedQuestionId) || null
  
  // DEBUG: Log state flow
  console.log('[STATE]', { 
    questionsCount: questions.length, 
    selectedQuestionId, 
    selectedQuestion: selectedQuestion?.id,
    editedQuestion: editedQuestion?.id 
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [canHardDelete, setCanHardDelete] = useState(false)
  const [studentAttemptCount, setStudentAttemptCount] = useState(0)

  useEffect(() => {
    if (examId) {
      Promise.all([fetchExamInfo(), fetchAttempts(), fetchQuestions(), fetchTopicsAndCategories()])
    }
  }, [examId])

  const fetchTopicsAndCategories = async () => {
    try {
      const [topicsRes, categoriesRes] = await Promise.all([
        supabase.from('topics').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name')
      ])

      if (topicsRes.data) setTopics(topicsRes.data)
      if (categoriesRes.data) setCategories(categoriesRes.data)
    } catch (err) {
      console.error('Fetch topics/categories error:', err)
    }
  }

  useEffect(() => {
    if (editedQuestion && selectedQuestion) {
      setHasChanges(JSON.stringify(editedQuestion) !== JSON.stringify(selectedQuestion))
    }
  }, [editedQuestion, selectedQuestion])

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_questions')
        .select(`
          question_id,
          order_in_part,
          questions (
            id,
            content,
            question_type,
            explanation,
            answers (
              id,
              content,
              is_correct,
              order_index
            )
          )
        `)
        .eq('exam_id', examId)
        .order('order_in_part', { ascending: true })

      if (error) {
        console.error('Fetch questions error:', error)
        return
      }

      const formattedQuestions: Question[] = (data || []).map((eq: any) => ({
        id: eq.questions.id,
        content: eq.questions.content,
        question_type: eq.questions.question_type,
        explanation: eq.questions.explanation,
        answers: (eq.questions.answers || []).sort((a: any, b: any) => a.order_index - b.order_index),
        order_index: eq.order_in_part
      }))

      setQuestions(formattedQuestions)
      
      // AUTO-SELECT câu hỏi đầu tiên sau khi fetch
      if (formattedQuestions.length > 0) {
        const firstQuestion = formattedQuestions[0]
        setSelectedQuestionId(firstQuestion.id)
        setEditedQuestion({ ...firstQuestion })
        console.log('[FETCH] Auto-selected first question:', firstQuestion.id)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
    }
  }

  const handleSaveQuestion = async () => {
    if (!editedQuestion) return
    
    setSaving(true)
    try {
      // Update question content and explanation
      const { error: questionError } = await supabase
        .from('questions')
        .update({
          content: editedQuestion.content,
          explanation: editedQuestion.explanation
        })
        .eq('id', editedQuestion.id)

      if (questionError) {
        console.error('Save question error:', questionError)
        return
      }

      // Update answers
      for (const answer of editedQuestion.answers) {
        const { error: answerError } = await supabase
          .from('answers')
          .update({
            content: answer.content,
            is_correct: answer.is_correct
          })
          .eq('id', answer.id)

        if (answerError) {
          console.error('Save answer error:', answerError)
          return
        }
      }

      // Update local state - questions array sẽ tự động update selectedQuestion (derived)
      setQuestions(questions.map(q => 
        q.id === editedQuestion.id ? editedQuestion : q
      ))
      setHasChanges(false)
      console.log('[SAVE] Question saved:', editedQuestion.id)
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleResetQuestion = () => {
    if (selectedQuestion) {
      setEditedQuestion({ ...selectedQuestion })
    }
  }

  const handleSelectQuestion = (questionId: string) => {
    if (hasChanges) {
      if (!confirm('Bạn có thay đổi chưa lưu. Bạn có muốn bỏ thay đổi?')) {
        return
      }
    }
    const question = questions.find(q => q.id === questionId)
    if (question) {
      setSelectedQuestionId(questionId)
      setEditedQuestion({ ...question })
      setHasChanges(false)
      console.log('[SELECT] Question selected:', questionId)
    }
  }

  const fetchExamInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, subject, duration, is_published, source_exam, grade, exam_mode')
        .eq('id', examId)
        .single()

      if (error) {
        console.error('Fetch exam info error:', error)
        setError('Không thể tải thông tin bài thi')
        return
      }

      // Get question count
      const { count } = await supabase
        .from('exam_questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', examId)

      setExamInfo({
        ...data,
        question_count: count || 0
      })
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
    }
  }

  const fetchAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_attempts')
        .select(`
          id,
          student_id,
          status,
          score,
          total_questions,
          correct_answers,
          start_time,
          submit_time,
          profiles!student_id (
            full_name,
            email,
            role
          )
        `)
        .eq('exam_id', examId)
        .order('start_time', { ascending: false })

      if (error) {
        console.error('Fetch attempts error:', error)
        setError('Không thể tải danh sách bài làm')
        setLoading(false)
        return
      }

      const formattedAttempts: ExamAttempt[] = (data || []).map((attempt: any) => ({
        id: attempt.id,
        student_id: attempt.student_id,
        status: attempt.status,
        score: attempt.score,
        total_questions: attempt.total_questions,
        correct_answers: attempt.correct_answers,
        start_time: attempt.start_time,
        submit_time: attempt.submit_time,
        student_name: attempt.profiles?.full_name || 'Không rõ',
        student_email: attempt.profiles?.email || ''
      }))

      // Check for student attempts to determine if hard delete is allowed
      const studentAttempts = (data || []).filter((attempt: any) => 
        attempt.profiles?.role === 'student'
      )
      
      setStudentAttemptCount(studentAttempts.length)
      setCanHardDelete(studentAttempts.length === 0)
      setAttempts(formattedAttempts)
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins} phút`
  }

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-400'
    if (score >= 8) return 'text-green-600'
    if (score >= 6.5) return 'text-blue-600'
    if (score >= 5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusBadge = (status: string) => {
    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Đã nộp
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <Clock className="w-3 h-3" />
        Đang làm
      </span>
    )
  }

  const handleDeleteExam = async () => {
    setDeleting(true)
    setError(null)

    try {
      // 1. Delete exam_questions first
      const { error: questionsError } = await supabase
        .from('exam_questions')
        .delete()
        .eq('exam_id', examId)

      if (questionsError) {
        console.error('Delete exam_questions error:', questionsError)
        setError('Không thể xóa câu hỏi của đề thi')
        setDeleting(false)
        setShowDeleteConfirm(false)
        return
      }

      // 2. Delete exam
      const { error: examError } = await supabase
        .from('exams')
        .delete()
        .eq('id', examId)

      if (examError) {
        console.error('Delete exam error:', examError)
        setError('Không thể xóa đề thi')
        setDeleting(false)
        setShowDeleteConfirm(false)
        return
      }

      // Success - redirect to exams list
      router.push('/admin/exams?deleted=true')
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleDisableExam = async () => {
    setDisabling(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('exams')
        .update({ is_published: false })
        .eq('id', examId)

      if (error) {
        console.error('Disable exam error:', error)
        setError('Không thể ngừng sử dụng đề thi')
        setDisabling(false)
        setShowDisableConfirm(false)
        return
      }

      // Update local state
      if (examInfo) {
        setExamInfo({ ...examInfo, is_published: false })
      }
      
      setShowDisableConfirm(false)
      setDisabling(false)
      setError(null)
      // Show success message or redirect if needed
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setDisabling(false)
      setShowDisableConfirm(false)
    }
  }

  // Helper function to get option label (A, B, C, D)
  const getOptionLabel = (index: number) => String.fromCharCode(65 + index)

  if (loading) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Chi tiết đề thi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">Đang tải chi tiết đề thi...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !examInfo) {
    return (
      <div className="min-h-screen">
        <AdminHeader title="Chi tiết đề thi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white rounded-2xl border border-slate-100 p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Lỗi</h1>
            <p className="text-slate-500">{error || 'Không tìm thấy đề thi'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AdminHeader 
        title={examInfo.title} 
        subtitle={`${examInfo.subject} • ${examInfo.grade ? `Lớp ${examInfo.grade}` : 'Chưa set lớp'} • ${examInfo.exam_mode === 'practice' ? 'Ôn tập' : 'Thi thử'} • ${formatDuration(examInfo.duration)} • ${questions.length} câu hỏi`} 
      />
      
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Top Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <button
            onClick={() => router.push('/admin/exams')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Quay lại danh sách</span>
            <span className="sm:hidden">Quay lại</span>
          </button>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-1.5 ${
              examInfo.is_published 
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                examInfo.is_published ? 'bg-green-500' : 'bg-amber-500'
              }`}></span>
              {examInfo.is_published ? 'Mở' : 'Nháp'}
            </span>
            
            <button
              onClick={() => router.push(`/admin/exams/${examId}/results`)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">Xem kết quả</span>
            </button>
            
            <button
              onClick={() => router.push(`/admin/exams/${examId}/publish`)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-teal-600 text-white rounded-lg sm:rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Cấu hình</span>
            </button>
            
            {canHardDelete ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Xóa</span>
              </button>
            ) : (
              <button
                onClick={() => setShowDisableConfirm(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Ngừng</span>
              </button>
            )}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{questions.length}</p>
                <p className="text-xs text-slate-500">Câu hỏi</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{attempts.length}</p>
                <p className="text-xs text-slate-500">Lượt thi</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {attempts.filter(a => a.status === 'submitted').length}
                </p>
                <p className="text-xs text-slate-500">Hoàn thành</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{examInfo.duration}</p>
                <p className="text-xs text-slate-500">Phút</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('questions')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'questions'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Chỉnh sửa câu hỏi</span>
              <span className="sm:hidden">Câu hỏi</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('attempts')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === 'attempts'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5 sm:gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Kết quả thi</span>
              <span className="sm:hidden">Kết quả</span>
              <span className="text-xs">({attempts.length})</span>
            </span>
          </button>
        </div>

        {/* Questions Tab - Responsive Layout */}
        {activeTab === 'questions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
            {/* Left: Question List */}
            <div className="lg:col-span-4">
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800">Danh sách câu hỏi</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Chọn câu hỏi để chỉnh sửa
                  </p>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {questions.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Chưa có câu hỏi</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {questions.map((question, index) => (
                        <button
                          key={question.id}
                          onClick={() => handleSelectQuestion(question.id)}
                          className={`w-full text-left p-3 rounded-xl transition-all ${
                            selectedQuestionId === question.id
                              ? 'bg-teal-50 border-2 border-teal-200'
                              : 'hover:bg-slate-50 border-2 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                              selectedQuestionId === question.id
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-800 truncate">
                                {question.content.substring(0, 50)}...
                              </p>
                              <p className="text-xs text-slate-500">
                                Đáp án: {question.answers.find(a => a.is_correct)?.content?.substring(0, 20) || 'N/A'}...
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Question Preview */}
            <div className="lg:col-span-8">
              {!selectedQuestion ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 h-full flex items-center justify-center">
                  <div className="text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-lg font-medium">Chọn một câu hỏi để xem chi tiết</p>
                    <p className="text-sm mt-1">Chọn từ danh sách bên trái</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 p-6">
                  {/* Preview Header */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">
                        Câu hỏi {questions.findIndex(q => q.id === selectedQuestion.id) + 1}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Xem chi tiết câu hỏi trong đề thi
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full font-medium">
                        Chỉ xem
                      </span>
                      <a
                        href="/admin/questions"
                        className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-sm rounded-full font-medium transition-colors"
                      >
                        Chỉnh sửa trong Quản lý câu hỏi
                      </a>
                    </div>
                  </div>

                  {/* Question Preview */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nội dung câu hỏi
                      </label>
                      <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800">
                        {selectedQuestion.content}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Các đáp án
                      </label>
                      <div className="space-y-3">
                        {selectedQuestion.answers.map((answer, index) => (
                          <div 
                            key={answer.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${
                              answer.is_correct
                                ? 'border-teal-300 bg-teal-50' 
                                : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {answer.is_correct ? (
                                <CheckCircle className="w-6 h-6 text-teal-600" />
                              ) : (
                                <Circle className="w-6 h-6 text-slate-300" />
                              )}
                            </div>
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                              answer.is_correct
                                ? 'bg-teal-500 text-white' 
                                : 'bg-slate-200 text-slate-600'
                            }`}>
                              {getOptionLabel(index)}
                            </span>
                            <div className="flex-1 text-slate-800">
                              {answer.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedQuestion.explanation && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Giải thích
                        </label>
                        <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800">
                          {selectedQuestion.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attempts Tab */}
        {activeTab === 'attempts' && (
          <div className="bg-white rounded-2xl border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Danh sách bài làm</h3>
            </div>

            {attempts.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Chưa có bài làm nào
                </h3>
                <p className="text-slate-500">
                  Các bài làm của học sinh sẽ hiển thị tại đây
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Học sinh</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Điểm số</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thời gian</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attempts.map((attempt) => (
                      <tr key={attempt.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-teal-50 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-teal-600" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{attempt.student_name}</p>
                              <p className="text-sm text-slate-500">{attempt.student_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(attempt.status)}
                        </td>
                        <td className="px-6 py-4">
                          {attempt.score !== null ? (
                            <span className={`text-lg font-semibold ${getScoreColor(attempt.score)}`}>
                              {attempt.score.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-600">{formatDate(attempt.start_time)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {attempt.status === 'submitted' && (
                            <button
                              onClick={() => router.push(`/admin/attempts/${attempt.id}`)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              Chi tiết
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Xác nhận xóa đề thi</h3>
                  <p className="text-sm text-slate-600">Hành động này không thể hoàn tác</p>
                </div>
              </div>
              
              <p className="text-slate-700 mb-6">
                Xóa đề thi sẽ xóa toàn bộ câu hỏi gắn với đề này. Bạn chắc chắn không?
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleDeleteExam}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Đang xóa...' : 'Xóa đề thi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disable Confirmation Dialog */}
        {showDisableConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Ngừng sử dụng đề thi</h3>
                  <p className="text-sm text-slate-600">Đề thi sẽ không còn hiển thị với học sinh</p>
                </div>
              </div>
              
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Đề đã có {studentAttemptCount} học sinh thi. Không thể xóa hoàn toàn.
                </p>
              </div>
              
              <p className="text-slate-700 mb-6">
                Ngừng sử dụng đề thi sẽ ẩn đề khỏi danh sách của học sinh. Bạn có thể xuất bản lại sau này.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDisableConfirm(false)}
                  disabled={disabling}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleDisableExam}
                  disabled={disabling}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disabling ? 'Đang xử lý...' : 'Ngừng sử dụng'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
