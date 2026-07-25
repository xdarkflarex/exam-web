'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import HomeworkKnowledgeTargets from '@/components/admin/HomeworkKnowledgeTargets'
import { createClient } from '@/lib/supabase/client'

interface HomeworkQuestion {
  id: string
  order_index: number
  questions: { id: string; content: string; question_type: string }
}

export default function EditHomeworkPage() {
  const id = useParams<{ id: string }>().id
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [published, setPublished] = useState(false)
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [homeworkRes, questionsRes] = await Promise.all([
        supabase.from('homeworks').select('title, description, is_published').eq('id', id).single(),
        supabase.from('homework_questions')
          .select('id, order_index, questions!inner(id, content, question_type)')
          .eq('homework_id', id)
          .order('order_index'),
      ])
      if (homeworkRes.data) {
        setTitle(homeworkRes.data.title)
        setDescription(homeworkRes.data.description || '')
        setPublished(homeworkRes.data.is_published)
      }
      setQuestions((questionsRes.data || []) as unknown as HomeworkQuestion[])
      setLoading(false)
    }
    void load()
  }, [id, supabase])

  const save = async () => {
    setSaving(true)
    await supabase.from('homeworks').update({
      title: title.trim(),
      description: description.trim() || null,
      is_published: published,
    }).eq('id', id)
    setSaving(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="min-h-screen">
      <AdminHeader title="Chỉnh sửa bài tập" subtitle="Câu hỏi dùng chung từ ngân hàng; mục tiêu kiến thức chỉ thuộc homework" />
      <main className="space-y-5 p-6">
        <section className="space-y-4 rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-lg font-semibold dark:bg-slate-900" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /> Cho phép giao bài</label>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-white"><Save className="h-4 w-4" />Lưu</button>
        </section>
        <HomeworkKnowledgeTargets homeworkId={id} />
        <section className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 font-semibold">Câu hỏi ({questions.length})</h2>
          <div className="space-y-2">
            {questions.map((row, index) => (
              <div key={row.id} className="flex gap-3 rounded-xl border p-3 text-sm">
                <span className="font-semibold text-teal-600">{index + 1}</span>
                <span className="line-clamp-2 flex-1">{row.questions.content.replace(/<[^>]*>/g, ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
