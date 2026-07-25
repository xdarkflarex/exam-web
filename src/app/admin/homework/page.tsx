'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart3, ClipboardList, Loader2, Plus, Send } from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface HomeworkRow {
  id: string
  title: string
  description: string | null
  grade: number | null
  is_published: boolean
  created_at: string
  homework_questions: { count: number }[]
  homework_assignments: { count: number }[]
}

export default function AdminHomeworkPage() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<HomeworkRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('homeworks')
        .select(`
          id, title, description, grade, is_published, created_at,
          homework_questions(count),
          homework_assignments(count)
        `)
        .order('created_at', { ascending: false })
      if (error) console.error('Load homeworks:', error)
      setRows((data || []) as unknown as HomeworkRow[])
      setLoading(false)
    }
    void load()
  }, [supabase])

  return (
    <div className="min-h-screen">
      <AdminHeader
        title="Bài tập về nhà"
        subtitle="Template, lần giao bài và kết quả được quản lý độc lập với đề thi"
      />
      <main className="space-y-5 p-6">
        <div className="flex justify-end">
          <Link
            href="/admin/homework/create"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> Tạo bài tập
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-800">
            <ClipboardList className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <p className="text-slate-500">Chưa có template bài tập.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(row => (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/homework/${row.id}`} className="font-semibold text-slate-900 hover:text-teal-600 dark:text-white">
                      {row.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {row.description || 'Không có mô tả'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${row.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {row.is_published ? 'Đang dùng' : 'Bản nháp'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>{row.homework_questions?.[0]?.count || 0} câu</span>
                  <span>{row.homework_assignments?.[0]?.count || 0} lần giao</span>
                  {row.grade && <span>Lớp {row.grade}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/homework/${row.id}`} className="rounded-lg border px-3 py-2 text-sm hover:border-teal-500 hover:text-teal-600">
                    Chỉnh sửa
                  </Link>
                  <Link href={`/admin/homework/${row.id}/assign`} className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700 hover:bg-teal-100">
                    <Send className="h-4 w-4" /> Giao bài
                  </Link>
                  <Link href={`/admin/homework/${row.id}/results`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">
                    <BarChart3 className="h-4 w-4" /> Kết quả
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
