'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import { useRouter } from 'next/navigation'
import {
  ClipboardList, Loader2, AlertCircle, Calendar, Users,
  GraduationCap, Save, BarChart3, Eye, CheckCircle, Clock3, MinusCircle
} from 'lucide-react'

interface HomeworkExam {
  id: string
  title: string
  end_time: string | null
  grade: number | null
}
interface ClassRow { id: string; name: string }
interface StudentRow { id: string; full_name: string | null; email: string | null; class_id: string | null }
interface AssignmentRow { id: string; exam_id: string; class_id: string | null; student_id: string | null }
interface AttemptRow { id: string; student_id: string; status: string; score: number | null; submit_time: string | null }
interface ProgressRow {
  studentId: string
  name: string
  className: string
  status: 'submitted' | 'in_progress' | 'not_started'
  score: number | null
  submitTime: string | null
  attemptId: string | null
}

export default function AdminHomeworkPage() {
  const supabase = createClient()
  const router = useRouter()

  const [exams, setExams] = useState<HomeworkExam[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [deadline, setDeadline] = useState<string>('')
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all')
  const [existing, setExisting] = useState<AssignmentRow[]>([])

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [loadingProgress, setLoadingProgress] = useState(false)

  useEffect(() => { loadBase() }, [])

  const loadBase = async () => {
    setLoading(true)
    try {
      const [examsRes, classesRes, studentsRes] = await Promise.all([
        supabase.from('exams').select('id, title, end_time, grade').eq('exam_mode', 'homework').order('created_at', { ascending: false }),
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name, email, class_id').eq('role', 'student').order('full_name'),
      ])
      if (examsRes.error) { logger.supabaseError('load homework exams', examsRes.error) }
      setExams((examsRes.data || []) as HomeworkExam[])
      setClasses((classesRes.data || []) as ClassRow[])
      setStudents((studentsRes.data || []) as StudentRow[])
    } finally {
      setLoading(false)
    }
  }

  const loadProgress = useCallback(async (examId: string, assignments: AssignmentRow[]) => {
    setLoadingProgress(true)
    try {
      // 1. Tập hợp HS được giao: trực tiếp + qua lớp
      const classIds = assignments.filter(a => a.class_id).map(a => a.class_id as string)
      const directIds = assignments.filter(a => a.student_id).map(a => a.student_id as string)
      const assigned = new Map<string, StudentRow>()
      students.forEach(s => {
        if (directIds.includes(s.id)) assigned.set(s.id, s)
        if (s.class_id && classIds.includes(s.class_id)) assigned.set(s.id, s)
      })

      // 2. Lấy attempts của đề này
      const { data: attemptsData } = await supabase
        .from('exam_attempts')
        .select('id, student_id, status, score, submit_time')
        .eq('exam_id', examId)
        .order('submit_time', { ascending: false })
      const attempts = (attemptsData || []) as AttemptRow[]

      // best attempt per student (ưu tiên submitted điểm cao nhất, sau đó in_progress)
      const bestByStudent = new Map<string, AttemptRow>()
      for (const a of attempts) {
        const cur = bestByStudent.get(a.student_id)
        if (!cur) { bestByStudent.set(a.student_id, a); continue }
        const rank = (x: AttemptRow) => x.status === 'submitted' ? 2 : x.status === 'in_progress' ? 1 : 0
        if (rank(a) > rank(cur) || (rank(a) === rank(cur) && (a.score || 0) > (cur.score || 0))) {
          bestByStudent.set(a.student_id, a)
        }
      }

      const rows: ProgressRow[] = Array.from(assigned.values()).map(s => {
        const a = bestByStudent.get(s.id)
        const status: ProgressRow['status'] = a
          ? (a.status === 'submitted' ? 'submitted' : 'in_progress')
          : 'not_started'
        return {
          studentId: s.id,
          name: s.full_name || s.email || s.id,
          className: classes.find(c => c.id === s.class_id)?.name || 'Chưa xếp lớp',
          status,
          score: a?.status === 'submitted' ? a.score : null,
          submitTime: a?.submit_time || null,
          attemptId: a?.id || null,
        }
      }).sort((x, y) => x.name.localeCompare(y.name))

      setProgress(rows)
    } finally {
      setLoadingProgress(false)
    }
  }, [students, classes, supabase])

  const loadAssignments = useCallback(async (examId: string) => {
    const { data } = await supabase
      .from('exam_assignments')
      .select('id, exam_id, class_id, student_id')
      .eq('exam_id', examId)
    const rows = (data || []) as AssignmentRow[]
    setExisting(rows)
    setSelectedClassIds(new Set(rows.filter(r => r.class_id).map(r => r.class_id as string)))
    setSelectedStudentIds(new Set(rows.filter(r => r.student_id).map(r => r.student_id as string)))
    loadProgress(examId, rows)
  }, [loadProgress, supabase])

  const onSelectExam = (examId: string) => {
    setSelectedExamId(examId)
    setMessage(null)
    setProgress([])
    const exam = exams.find(e => e.id === examId)
    setDeadline(exam?.end_time ? new Date(exam.end_time).toISOString().slice(0, 16) : '')
    if (examId) loadAssignments(examId)
    else { setExisting([]); setSelectedClassIds(new Set()); setSelectedStudentIds(new Set()) }
  }

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }

  const filteredStudents = students.filter(s =>
    studentClassFilter === 'all'
      ? true
      : studentClassFilter === 'none'
        ? !s.class_id
        : s.class_id === studentClassFilter
  )

  const classNameOf = (id: string | null) => classes.find(c => c.id === id)?.name || 'Chưa xếp lớp'

  const selectAllFiltered = () => {
    const next = new Set(selectedStudentIds)
    filteredStudents.forEach(s => next.add(s.id))
    setSelectedStudentIds(next)
  }

  const clearAllFiltered = () => {
    const next = new Set(selectedStudentIds)
    filteredStudents.forEach(s => next.delete(s.id))
    setSelectedStudentIds(next)
  }

  const handleSave = async () => {
    if (!selectedExamId) return
    setSaving(true)
    setMessage(null)
    try {
      // 1. Cập nhật hạn nộp (end_time) trên exam
      await supabase.from('exams')
        .update({ end_time: deadline ? new Date(deadline).toISOString() : null })
        .eq('id', selectedExamId)

      // 2. Đồng bộ assignments: xóa cũ, thêm mới theo lựa chọn hiện tại
      await supabase.from('exam_assignments').delete().eq('exam_id', selectedExamId)

      const { data: { user } } = await supabase.auth.getUser()
      const rows: { exam_id: string; class_id: string | null; student_id: string | null; assigned_by: string | null }[] = []
      for (const cid of selectedClassIds) rows.push({ exam_id: selectedExamId, class_id: cid, student_id: null, assigned_by: user?.id || null })
      for (const sid of selectedStudentIds) rows.push({ exam_id: selectedExamId, class_id: null, student_id: sid, assigned_by: user?.id || null })

      if (rows.length > 0) {
        const { error } = await supabase.from('exam_assignments').insert(rows)
        if (error) {
          setMessage({ type: 'error', text: logger.supabaseError('save assignments', error) })
          return
        }
      }

      setMessage({ type: 'success', text: `Đã giao bài cho ${selectedClassIds.size} lớp và ${selectedStudentIds.size} HS.` })
      loadAssignments(selectedExamId)
    } catch (err) {
      logger.error('save homework', err)
      setMessage({ type: 'error', text: 'Lỗi khi lưu giao bài.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <AdminHeader title="Bài tập về nhà" subtitle="Giao bài tập cho lớp hoặc từng học sinh" />

      <div className="p-6 space-y-6">
        {message && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-teal-600 animate-spin" /></div>
        ) : exams.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">Chưa có đề nào ở chế độ "Bài tập về nhà". Tạo đề mới và chọn loại "Bài tập về nhà".</p>
          </div>
        ) : (
          <>
            {/* Chọn đề + hạn nộp */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Chọn bài tập</label>
                <select
                  value={selectedExamId}
                  onChange={(e) => onSelectExam(e.target.value)}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                >
                  <option value="">-- Chọn bài tập --</option>
                  {exams.map(e => <option key={e.id} value={e.id}>{e.title}{e.grade ? ` (Lớp ${e.grade})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> Hạn nộp
                </label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={!selectedExamId}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100 disabled:opacity-50"
                />
              </div>
            </div>

            {selectedExamId && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lớp */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">Giao theo lớp</h2>
                  </div>
                  {classes.length === 0 ? (
                    <p className="text-sm text-slate-500">Chưa có lớp.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {classes.map(c => (
                        <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedClassIds.has(c.id)}
                            onChange={() => toggle(selectedClassIds, c.id, setSelectedClassIds)}
                            className="accent-teal-600"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Học sinh */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">Giao cho từng học sinh</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={studentClassFilter}
                      onChange={(e) => setStudentClassFilter(e.target.value)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-slate-100"
                    >
                      <option value="all">Tất cả lớp</option>
                      <option value="none">Chưa xếp lớp</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={selectAllFiltered} className="px-2.5 py-1.5 text-xs rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200">Chọn tất cả</button>
                    <button onClick={clearAllFiltered} className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200">Bỏ chọn</button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2">Không có học sinh phù hợp.</p>
                    ) : filteredStudents.map(s => (
                      <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(s.id)}
                          onChange={() => toggle(selectedStudentIds, s.id, setSelectedStudentIds)}
                          className="accent-teal-600"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200 truncate flex-1">{s.full_name || s.email}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{classNameOf(s.class_id)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedExamId && (
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Lưu giao bài
                </button>
              </div>
            )}

            {/* Tiến độ làm bài */}
            {selectedExamId && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">Tiến độ làm bài</h2>
                  </div>
                  {progress.length > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Đã nộp {progress.filter(p => p.status === 'submitted').length}/{progress.length}
                    </span>
                  )}
                </div>

                {loadingProgress ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
                ) : progress.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">Chưa có học sinh nào được giao bài này (lưu giao bài trước).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 pr-3 font-medium">Học sinh</th>
                          <th className="py-2 px-3 font-medium">Lớp</th>
                          <th className="py-2 px-3 font-medium">Trạng thái</th>
                          <th className="py-2 px-3 font-medium">Điểm</th>
                          <th className="py-2 px-3 font-medium">Nộp lúc</th>
                          <th className="py-2 pl-3 font-medium text-right">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progress.map(p => (
                          <tr key={p.studentId} className="border-b border-slate-100 dark:border-slate-700/50">
                            <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">{p.name}</td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.className}</td>
                            <td className="py-2 px-3">
                              {p.status === 'submitted' ? (
                                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle className="w-4 h-4" /> Đã nộp</span>
                              ) : p.status === 'in_progress' ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock3 className="w-4 h-4" /> Đang làm</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-400"><MinusCircle className="w-4 h-4" /> Chưa làm</span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100">{p.score != null ? p.score.toFixed(1) : '—'}</td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.submitTime ? new Date(p.submitTime).toLocaleString('vi-VN') : '—'}</td>
                            <td className="py-2 pl-3 text-right">
                              {p.attemptId && p.status === 'submitted' ? (
                                <button
                                  onClick={() => router.push(`/result/${p.attemptId}`)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200 text-xs"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Xem
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
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
          </>
        )}
      </div>
    </div>
  )
}
