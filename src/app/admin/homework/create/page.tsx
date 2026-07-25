'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { nanoid } from 'nanoid'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface QuestionRow { id: string; content: string; question_type: string }

export default function CreateHomeworkPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [grade, setGrade] = useState(12)
  const [sessionSize, setSessionSize] = useState(10)
  const [query, setQuery] = useState('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('questions')
        .select('id, content, question_type')
        .in('question_type', ['multiple_choice', 'true_false', 'short_answer'])
        .order('created_at', { ascending: false })
        .limit(200)
      setQuestions((data || []) as QuestionRow[])
      setLoading(false)
    }
    void load()
  }, [supabase])

  const filtered = questions.filter(question =>
    !query.trim() || question.content.toLowerCase().includes(query.trim().toLowerCase())
  )

  const toggle = (id: string) => {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const save = async () => {
    if (!title.trim() || selected.length === 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const homeworkId = nanoid()
    const { error } = await supabase.from('homeworks').insert({
      id: homeworkId,
      title: title.trim(),
      description: description.trim() || null,
      grade,
      session_size: sessionSize,
      created_by: user?.id || null,
      is_published: false,
    })
    if (!error) {
      const { error: questionError } = await supabase.from('homework_questions').insert(
        selected.map((questionId, index) => ({
          homework_id: homeworkId,
          question_id: questionId,
          order_index: index,
        }))
      )
      if (!questionError) {
        const { error: publishError } = await supabase
          .from('homeworks')
          .update({ is_published: true })
          .eq('id', homeworkId)
        if (!publishError) {
          router.push(`/admin/homework/${homeworkId}`)
          return
        }
        console.error('Publish homework:', publishError)
      } else {
        console.error('Link homework questions:', questionError)
      }
      await supabase.from('homeworks').delete().eq('id', homeworkId)
    }
    console.error('Create homework:', error)
    setSaving(false)
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Tạo bài tập về nhà" subtitle="Tạo template độc lập, không tạo đề thi hoặc exam attempt" />
      <main className="space-y-5 p-6">
        <section className="grid gap-4 rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Tên bài tập</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Mô tả</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Lớp</span>
            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900">
              <option value={10}>10</option><option value={11}>11</option><option value={12}>12</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Số câu mỗi phiên</span>
            <input type="number" min={1} value={sessionSize} onChange={e => setSessionSize(Number(e.target.value))} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Chọn câu hỏi ({selected.length})</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nội dung..." className="rounded-xl border py-2 pl-9 pr-3 text-sm dark:bg-slate-900" />
            </div>
          </div>
          {loading ? <Loader2 className="mx-auto my-12 h-7 w-7 animate-spin" /> : (
            <div className="max-h-[45vh] space-y-2 overflow-y-auto">
              {filtered.map(question => (
                <label key={question.id} className="flex cursor-pointer gap-3 rounded-xl border p-3 hover:border-teal-400">
                  <input type="checkbox" checked={selected.includes(question.id)} onChange={() => toggle(question.id)} />
                  <span className="line-clamp-2 flex-1 text-sm">{question.content.replace(/<[^>]*>/g, ' ')}</span>
                  <span className="text-xs text-slate-400">{question.question_type}</span>
                </label>
              ))}
            </div>
          )}
        </section>
        <div className="flex justify-end">
          <button onClick={save} disabled={saving || !title.trim() || !selected.length} className="rounded-xl bg-teal-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {saving ? 'Đang tạo...' : 'Tạo bài tập'}
          </button>
        </div>
      </main>
    </div>
  )
}
