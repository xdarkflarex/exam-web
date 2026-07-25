'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface ClassRow { id: string; name: string }
interface StudentRow { id: string; full_name: string | null; email: string | null; class_id: string | null }

export default function AssignHomeworkPage() {
  const homeworkId = useParams<{ id: string }>().id
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [homeworkTitle, setHomeworkTitle] = useState('')
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [showFeedbackImmediately, setShowFeedbackImmediately] = useState(false)
  const [allowReview, setAllowReview] = useState(false)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classIds, setClassIds] = useState<string[]>([])
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [homeworkRes, classesRes, studentsRes] = await Promise.all([
        supabase.from('homeworks').select('title').eq('id', homeworkId).single(),
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name, email, class_id').eq('role', 'student').order('full_name'),
      ])
      const name = homeworkRes.data?.title || ''
      setHomeworkTitle(name)
      setTitle(name)
      setClasses(classesRes.data || [])
      setStudents(studentsRes.data || [])
    }
    void load()
  }, [homeworkId, supabase])

  const toggle = (items: string[], id: string, setter: (value: string[]) => void) =>
    setter(items.includes(id) ? items.filter(item => item !== id) : [...items, id])

  const assign = async () => {
    if (!classIds.length && !studentIds.length) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: assignment, error } = await supabase.from('homework_assignments').insert({
      homework_id: homeworkId,
      assigned_by: user?.id || null,
      title: title.trim() || homeworkTitle,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: 'published',
      show_feedback_immediately: showFeedbackImmediately,
      allow_review: allowReview,
    }).select('id').single()
    if (!error && assignment) {
      const recipients = [
        ...classIds.map(classId => ({ assignment_id: assignment.id, class_id: classId, student_id: null })),
        ...studentIds.map(studentId => ({ assignment_id: assignment.id, class_id: null, student_id: studentId })),
      ]
      const { error: recipientError } = await supabase.from('homework_assignment_recipients').insert(recipients)
      if (!recipientError) {
        router.push(`/admin/homework/${homeworkId}/results`)
        return
      }
      await supabase.from('homework_assignments').delete().eq('id', assignment.id)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Giao bài tập" subtitle={homeworkTitle} />
      <main className="space-y-5 p-6">
        <section className="grid gap-4 rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <label><span className="mb-1 block text-sm">Tên lần giao</span><input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" /></label>
          <label><span className="mb-1 block text-sm">Hạn nộp</span><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 dark:bg-slate-900" /></label>
          <label className="flex items-start gap-3 rounded-xl border p-3 text-sm dark:border-slate-700">
            <input type="checkbox" checked={showFeedbackImmediately} onChange={event => setShowFeedbackImmediately(event.target.checked)} className="mt-1" />
            <span><strong>Báo đúng/sai ngay</strong><span className="mt-1 block text-slate-500">Không hiện đáp án chuẩn hoặc lời giải khi học sinh đang làm.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border p-3 text-sm dark:border-slate-700">
            <input type="checkbox" checked={allowReview} onChange={event => setAllowReview(event.target.checked)} className="mt-1" />
            <span><strong>Cho xem đáp án sau khi nộp</strong><span className="mt-1 block text-slate-500">Mặc định tắt để bảo vệ ngân hàng câu hỏi.</span></span>
          </label>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-3 font-semibold">Giao theo lớp</h2>
            {classes.map(row => <label key={row.id} className="flex gap-2 py-2"><input type="checkbox" checked={classIds.includes(row.id)} onChange={() => toggle(classIds, row.id, setClassIds)} />{row.name}</label>)}
          </section>
          <section className="max-h-[50vh] overflow-y-auto rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-3 font-semibold">Giao trực tiếp học sinh</h2>
            {students.map(row => <label key={row.id} className="flex gap-2 py-2"><input type="checkbox" checked={studentIds.includes(row.id)} onChange={() => toggle(studentIds, row.id, setStudentIds)} /><span>{row.full_name || row.email}</span></label>)}
          </section>
        </div>
        <div className="flex justify-end"><button onClick={assign} disabled={saving || (!classIds.length && !studentIds.length)} className="rounded-xl bg-teal-600 px-5 py-3 font-medium text-white disabled:opacity-50">{saving ? 'Đang giao...' : 'Giao bài'}</button></div>
      </main>
    </div>
  )
}
