'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, FileText, Loader2, Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import GlobalHeader from '@/components/GlobalHeader'
import { createClient } from '@/lib/supabase/client'
import type { ExamMode } from '@/types'

interface Preview { total: number; byType: Record<string, number> }

const questionTypeLabel: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

export default function CreateExamPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [sources, setSources] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(90)
  const [grade, setGrade] = useState(12)
  const [mode, setMode] = useState<ExamMode>('simulation')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unsupportedEssayPractice = mode === 'practice' && (preview?.byType.essay || 0) > 0

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('questions').select('source_exam').not('source_exam', 'is', null).order('source_exam')
      setSources([...new Set((data || []).map(row => row.source_exam).filter(Boolean))] as string[])
      setLoading(false)
    }
    void load()
  }, [supabase])

  useEffect(() => {
    if (!source) return
    const load = async () => {
      const { data } = await supabase.from('questions').select('question_type').eq('source_exam', source)
      const byType: Record<string, number> = {}
      for (const row of data || []) byType[row.question_type] = (byType[row.question_type] || 0) + 1
      setPreview({ total: data?.length || 0, byType })
    }
    void load()
  }, [source, supabase])

  const create = async () => {
    if (!title.trim() || !source) return
    if (unsupportedEssayPractice) {
      setError('Bản thử tự luận mới hỗ trợ đề thi thử/kiểm tra, chưa áp dụng cho chế độ ôn tập.')
      return
    }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: questions, error: questionError } = await supabase.from('questions')
      .select('id, question_type, essay_max_score').eq('source_exam', source).order('created_at')
    if (questionError || !questions?.length) {
      setError(questionError?.message || 'Đề gốc không có câu hỏi.')
      setSaving(false)
      return
    }
    const totalScore = questions.reduce((sum, question) => (
      sum + (question.question_type === 'essay' ? Number(question.essay_max_score) || 1 : 1)
    ), 0)
    const examId = nanoid()
    const { error: examError } = await supabase.from('exams').insert({
      id: examId,
      title: title.trim(),
      subject: 'Toán',
      duration: mode === 'practice' ? 0 : duration,
      total_score: totalScore,
      passing_score: 5,
      is_published: false,
      source_exam: source,
      grade,
      exam_mode: mode,
      session_size: 10,
      created_by: user?.id || null,
    })
    if (examError) {
      setError(examError.message)
      setSaving(false)
      return
    }
    const orderByPart: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    const examQuestions = questions.map((question) => {
      const partNumber = question.question_type === 'multiple_choice'
        ? 1
        : question.question_type === 'true_false' ? 2 : 3
      orderByPart[partNumber] += 1
      return {
        exam_id: examId,
        question_id: question.id,
        question_type: question.question_type,
        part_number: partNumber,
        order_in_part: orderByPart[partNumber],
        score: question.question_type === 'essay' ? Number(question.essay_max_score) || 1 : 1,
      }
    })
    const { error: linkError } = await supabase.from('exam_questions').insert(examQuestions)
    if (linkError) {
      await supabase.from('exams').delete().eq('id', examId)
      setError(linkError.message)
      setSaving(false)
      return
    }
    router.push(`/admin/exams/${examId}`)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <GlobalHeader title="Tạo đề thi hoặc bài ôn tập" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section className="space-y-5 rounded-2xl border bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <label className="mb-2 block text-sm font-medium">Đề gốc</label>
            <select value={source} onChange={e => { setSource(e.target.value); setPreview(null) }} className="w-full rounded-xl border px-4 py-3 dark:bg-slate-900">
              <option value="">-- Chọn đề gốc --</option>
              {sources.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          {preview && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />{preview.total} câu hỏi</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                {Object.entries(preview.byType).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-800">
                    {questionTypeLabel[type] || type}: {count}
                  </span>
                ))}
              </div>
              {preview.byType.essay > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Có {preview.byType.essay} câu tự luận: AI đề xuất, giáo viên bắt buộc duyệt trước khi có điểm cuối.
                </p>
              )}
              {unsupportedEssayPractice && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  Hãy chọn “Thi thử” để dùng câu tự luận trong bản pilot này.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMode('simulation')} className={`rounded-xl border p-3 font-medium ${mode === 'simulation' ? 'border-teal-600 bg-teal-600 text-white' : ''}`}>Thi thử</button>
            <button onClick={() => setMode('practice')} className={`rounded-xl border p-3 font-medium ${mode === 'practice' ? 'border-amber-500 bg-amber-500 text-white' : ''}`}>Ôn tập</button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên đề" className="w-full rounded-xl border px-4 py-3 dark:bg-slate-900" />
          <div className="grid grid-cols-2 gap-3">
            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="rounded-xl border px-4 py-3 dark:bg-slate-900">
              <option value={10}>Lớp 10</option><option value={11}>Lớp 11</option><option value={12}>Lớp 12</option>
            </select>
            {mode === 'simulation' && (
              <label className="flex items-center gap-2 rounded-xl border px-4">
                <Clock className="h-4 w-4" />
                <input type="number" min={10} max={300} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-transparent py-3 outline-none" />
                <span className="text-sm text-slate-500">phút</span>
              </label>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button onClick={create} disabled={saving || !title.trim() || !source || unsupportedEssayPractice} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Tạo đề
          </button>
        </section>
      </main>
    </div>
  )
}
