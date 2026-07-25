'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'

interface ClassRow {
  id: string
  name: string
}

interface StudentRow {
  id: string
  full_name: string | null
  email: string | null
  class_id: string | null
  access_tier: string | null
}

interface ExamRow {
  id: string
  title: string
  exam_mode: string
  end_time: string | null
}

interface AssignmentRow {
  exam_id: string
  class_id: string | null
  student_id: string | null
}

interface AttemptRow {
  id: string
  exam_id: string
  student_id: string
  status: string
  score: number | null
  submit_time: string | null
}

interface AssignmentProgress {
  examId: string
  title: string
  mode: string
  deadline: string | null
  assigned: number
  started: number
  submitted: number
  late: number
  averageScore: number
}

interface WeakTheory {
  theoryId: string
  title: string
  attempted: number
  correct: number
  accuracy: number
}

interface StudentRisk {
  id: string
  name: string
  accessTier: string | null
  assigned: number
  submitted: number
  averageScore: number
}

export default function TeacherAnalyticsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [progress, setProgress] = useState<AssignmentProgress[]>([])
  const [weakTheories, setWeakTheories] = useState<WeakTheory[]>([])
  const [studentRisks, setStudentRisks] = useState<StudentRisk[]>([])
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) throw new Error('Phiên đăng nhập không hợp lệ.')

        const [classRes, ownExamRes, assignmentRes] = await Promise.all([
          supabase
            .from('classes')
            .select('id, name')
            .eq('teacher_id', userId)
            .order('name'),
          supabase
            .from('exams')
            .select('id, title, exam_mode, end_time')
            .eq('created_by', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('exam_assignments')
            .select('exam_id, class_id, student_id')
            .eq('assigned_by', userId),
        ])
        if (classRes.error) throw classRes.error
        if (ownExamRes.error) throw ownExamRes.error
        if (assignmentRes.error) throw assignmentRes.error

        const teacherClasses = (classRes.data || []) as ClassRow[]
        const assignments = (assignmentRes.data || []) as AssignmentRow[]
        const classIds = new Set([
          ...teacherClasses.map((item) => item.id),
          ...assignments
            .map((assignment) => assignment.class_id)
            .filter((id): id is string => Boolean(id)),
        ])
        const directStudentIds = assignments
          .map((assignment) => assignment.student_id)
          .filter((id): id is string => Boolean(id))

        const studentQueries = []
        if (classIds.size > 0) {
          studentQueries.push(
            supabase
              .from('profiles')
              .select('id, full_name, email, class_id, access_tier')
              .eq('role', 'student')
              .in('class_id', Array.from(classIds))
          )
        }
        if (directStudentIds.length > 0) {
          studentQueries.push(
            supabase
              .from('profiles')
              .select('id, full_name, email, class_id, access_tier')
              .in('id', directStudentIds)
          )
        }
        const studentResults = await Promise.all(studentQueries)
        const studentMap = new Map<string, StudentRow>()
        for (const result of studentResults) {
          if (result.error) throw result.error
          for (const student of result.data || []) {
            studentMap.set(student.id, student as StudentRow)
          }
        }
        const allScopedStudents = Array.from(studentMap.values())
        const scopedStudents =
          selectedClassId === 'all'
            ? allScopedStudents
            : allScopedStudents.filter(
                (student) => student.class_id === selectedClassId
              )

        const ownExams = (ownExamRes.data || []) as ExamRow[]
        const assignedExamIds = assignments.map((assignment) => assignment.exam_id)
        const missingExamIds = assignedExamIds.filter(
          (id) => !ownExams.some((exam) => exam.id === id)
        )
        let extraExams: ExamRow[] = []
        if (missingExamIds.length > 0) {
          const extraExamRes = await supabase
            .from('exams')
            .select('id, title, exam_mode, end_time')
            .in('id', missingExamIds)
          if (extraExamRes.error) throw extraExamRes.error
          extraExams = (extraExamRes.data || []) as ExamRow[]
        }
        const examMap = new Map(
          [...ownExams, ...extraExams].map((exam) => [exam.id, exam])
        )
        const examIds = Array.from(examMap.keys())

        let attempts: AttemptRow[] = []
        if (examIds.length > 0) {
          const attemptRes = await supabase
            .from('exam_attempts')
            .select('id, exam_id, student_id, status, score, submit_time')
            .in('exam_id', examIds)
          if (attemptRes.error) throw attemptRes.error
          attempts = (attemptRes.data || []) as AttemptRow[]
        }

        const recipientsByExam = new Map<string, Set<string>>()
        for (const assignment of assignments) {
          const recipients = recipientsByExam.get(assignment.exam_id) || new Set<string>()
          if (assignment.student_id) recipients.add(assignment.student_id)
          if (assignment.class_id) {
            for (const student of scopedStudents) {
              if (student.class_id === assignment.class_id) recipients.add(student.id)
            }
          }
          recipientsByExam.set(assignment.exam_id, recipients)
        }

        const now = Date.now()
        const assignmentProgress: AssignmentProgress[] = Array.from(examMap.values())
          .map((exam) => {
            const recipients = recipientsByExam.get(exam.id) || new Set<string>()
            const examAttempts = attempts.filter(
              (attempt) =>
                attempt.exam_id === exam.id &&
                (recipients.size === 0 || recipients.has(attempt.student_id))
            )
            const startedStudents = new Set(examAttempts.map((attempt) => attempt.student_id))
            const submittedAttempts = examAttempts.filter(
              (attempt) => attempt.status === 'submitted' || attempt.status === 'graded'
            )
            const submittedStudents = new Set(
              submittedAttempts.map((attempt) => attempt.student_id)
            )
            const late = submittedAttempts.filter(
              (attempt) =>
                exam.end_time &&
                attempt.submit_time &&
                new Date(attempt.submit_time).getTime() >
                  new Date(exam.end_time).getTime()
            ).length
            const averageScore =
              submittedAttempts.length > 0
                ? submittedAttempts.reduce(
                    (sum, attempt) => sum + (attempt.score || 0),
                    0
                  ) / submittedAttempts.length
                : 0
            return {
              examId: exam.id,
              title: exam.title,
              mode: exam.exam_mode,
              deadline: exam.end_time,
              assigned: recipients.size,
              started: startedStudents.size,
              submitted: submittedStudents.size,
              late,
              averageScore,
            }
          })
          .filter((item) => item.assigned > 0 || item.started > 0)
          .sort((a, b) => {
            const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity
            const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity
            return Math.abs(aTime - now) - Math.abs(bTime - now)
          })

        const scopedStudentIds = scopedStudents.map((student) => student.id)
        const evidenceRows: Array<{
          student_id: string
          theory_id: string
          is_correct: boolean
          theories: { title: string } | null
        }> = []
        const scopedAttemptIds = attempts
          .filter(
            (attempt) =>
              scopedStudentIds.includes(attempt.student_id) &&
              (attempt.status === 'submitted' || attempt.status === 'graded')
          )
          .map((attempt) => attempt.id)
        const studentByAttempt = new Map(
          attempts.map((attempt) => [attempt.id, attempt.student_id])
        )

        if (scopedAttemptIds.length > 0) {
          const answerRes = await supabase
            .from('student_answers')
            .select('attempt_id, question_id, is_correct')
            .in('attempt_id', scopedAttemptIds)
          if (answerRes.error) throw answerRes.error

          const answers = (answerRes.data || []) as Array<{
            attempt_id: string
            question_id: string
            is_correct: boolean | null
          }>
          const questionIds = [...new Set(answers.map((answer) => answer.question_id))]

          if (questionIds.length > 0) {
            const linkRes = await supabase
              .from('question_knowledge_links')
              .select('question_id, theory_id')
              .in('question_id', questionIds)
            if (linkRes.error) throw linkRes.error

            const links = (linkRes.data || []) as Array<{
              question_id: string
              theory_id: string | null
            }>
            const theoryIds = [
              ...new Set(
                links
                  .map((link) => link.theory_id)
                  .filter((id): id is string => Boolean(id))
              ),
            ]
            const theoryRes = theoryIds.length
              ? await supabase.from('theories').select('id, title').in('id', theoryIds)
              : { data: [] }
            if ('error' in theoryRes && theoryRes.error) throw theoryRes.error

            const theoryTitle = new Map(
              ((theoryRes.data || []) as Array<{ id: string; title: string }>).map((theory) => [
                theory.id,
                theory.title,
              ])
            )
            const linksByQuestion = new Map<string, Array<{ theory_id: string }>>()
            for (const link of links) {
              if (!link.theory_id) continue
              linksByQuestion.set(link.question_id, [
                ...(linksByQuestion.get(link.question_id) || []),
                { theory_id: link.theory_id },
              ])
            }

            for (const answer of answers) {
              const studentId = studentByAttempt.get(answer.attempt_id)
              if (!studentId) continue
              for (const link of linksByQuestion.get(answer.question_id) || []) {
                evidenceRows.push({
                  student_id: studentId,
                  theory_id: link.theory_id,
                  is_correct: answer.is_correct === true,
                  theories: { title: theoryTitle.get(link.theory_id) || 'Kiến thức' },
                })
              }
            }
          }
        }

        const theoryStats = new Map<
          string,
          { title: string; attempted: number; correct: number }
        >()
        for (const evidence of evidenceRows) {
          const current = theoryStats.get(evidence.theory_id) || {
            title: evidence.theories?.title || 'Kiến thức',
            attempted: 0,
            correct: 0,
          }
          current.attempted++
          if (evidence.is_correct) current.correct++
          theoryStats.set(evidence.theory_id, current)
        }
        const weak = Array.from(theoryStats.entries())
          .map(([theoryId, value]) => ({
            theoryId,
            title: value.title,
            attempted: value.attempted,
            correct: value.correct,
            accuracy:
              value.attempted > 0
                ? Math.round((value.correct / value.attempted) * 100)
                : 0,
          }))
          .filter((item) => item.attempted >= 3)
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, 8)

        const riskRows = scopedStudents
          .map((student) => {
            const assigned = Array.from(recipientsByExam.values()).filter((recipients) =>
              recipients.has(student.id)
            ).length
            const submittedAttempts = attempts.filter(
              (attempt) =>
                attempt.student_id === student.id &&
                (attempt.status === 'submitted' || attempt.status === 'graded')
            )
            const averageScore =
              submittedAttempts.length > 0
                ? submittedAttempts.reduce(
                    (sum, attempt) => sum + (attempt.score || 0),
                    0
                  ) / submittedAttempts.length
                : 0
            return {
              id: student.id,
              accessTier: student.access_tier,
              name: student.full_name || student.email || 'Học sinh',
              assigned,
              submitted: submittedAttempts.length,
              averageScore,
            }
          })
          .filter(
            (student) =>
              student.assigned > student.submitted ||
              (student.submitted > 0 && student.averageScore < 5)
          )
          .sort((a, b) => {
            const missingA = a.assigned - a.submitted
            const missingB = b.assigned - b.submitted
            return missingB - missingA || a.averageScore - b.averageScore
          })
          .slice(0, 10)

        setClasses(teacherClasses)
        setStudents(scopedStudents)
        setProgress(assignmentProgress)
        setWeakTheories(weak)
        setStudentRisks(riskRows)
      } catch (err) {
        console.error('Teacher analytics error:', err)
        setError(
          err instanceof Error
            ? err.message
            : 'Không thể tải thống kê theo giáo viên.'
        )
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshKey, selectedClassId, supabase])

  const filteredStudents = students
  const filteredStudentIds = new Set(students.map((student) => student.id))
  const scopedRisks = studentRisks.filter((student) => filteredStudentIds.has(student.id))
  const tierTotals = useMemo(() => ({
    full: filteredStudents.filter((student) => student.access_tier === 'full').length,
    basic: filteredStudents.filter((student) => student.access_tier !== 'full').length,
  }), [filteredStudents])

  const totals = useMemo(() => {
    const assigned = progress.reduce((sum, item) => sum + item.assigned, 0)
    const started = progress.reduce((sum, item) => sum + item.started, 0)
    const submitted = progress.reduce((sum, item) => sum + item.submitted, 0)
    const weightedScoreCount = progress.reduce(
      (sum, item) => sum + item.averageScore * item.submitted,
      0
    )
    return {
      assigned,
      started,
      submitted,
      completionRate: assigned > 0 ? Math.round((submitted / assigned) * 100) : 0,
      startRate: assigned > 0 ? Math.round((started / assigned) * 100) : 0,
      averageScore: submitted > 0 ? weightedScoreCount / submitted : 0,
    }
  }, [progress])

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader
        title="Thống kê lớp học"
        subtitle="Tiến độ bài tập và năng lực của học sinh thuộc phạm vi bạn phụ trách"
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="all">Tất cả lớp của tôi</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[55vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <MetricCard
                icon={Users}
                label="Học sinh"
                value={filteredStudents.length.toString()}
                tone="blue"
              />
              <MetricCard
                icon={TrendingUp}
                label="Đã bắt đầu"
                value={`${totals.startRate}%`}
                note={`${totals.started}/${totals.assigned} lượt được giao`}
                tone="teal"
              />
              <MetricCard
                icon={CheckCircle2}
                label="Hoàn thành"
                value={`${totals.completionRate}%`}
                note={`${totals.submitted}/${totals.assigned} lượt được giao`}
                tone="green"
              />
              <MetricCard
                icon={Target}
                label="Điểm trung bình"
                value={totals.averageScore.toFixed(2)}
                tone="amber"
              />
              <MetricCard
                icon={Sparkles}
                label="Gói nâng cao"
                value={tierTotals.full.toString()}
                note={`${tierTotals.basic} cơ bản`}
                tone="blue"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Tiến độ theo bài được giao
                  </h2>
                  <p className="text-xs text-slate-500">
                    Completion = số học sinh đã nộp / số học sinh được giao.
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {progress.map((item) => {
                    const completion =
                      item.assigned > 0
                        ? Math.round((item.submitted / item.assigned) * 100)
                        : 0
                    return (
                      <div key={item.examId} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800 dark:text-white">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.mode === 'homework' ? 'Bài tập về nhà' : 'Đề thi'} ·
                              Bắt đầu {item.started}/{item.assigned} · Đã nộp{' '}
                              {item.submitted}/{item.assigned}
                              {item.late > 0 ? ` · Trễ ${item.late}` : ''}
                            </p>
                          </div>
                          <span className="text-lg font-bold text-teal-600">
                            {completion}%
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${completion}%` }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                          <span>Điểm TB {item.averageScore.toFixed(2)}</span>
                          <Link
                            href={`/admin/exams/${item.examId}/results`}
                            className="inline-flex items-center gap-1 text-teal-600 hover:underline"
                          >
                            Chi tiết <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {progress.length === 0 && (
                    <p className="p-10 text-center text-sm text-slate-500">
                      Chưa có bài được giao trong phạm vi của bạn.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-white">
                      Học sinh cần xử lý
                    </h2>
                    <p className="text-xs text-slate-500">
                      Còn thiếu bài hoặc điểm trung bình dưới 5.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {scopedRisks.map((student) => (
                    <Link
                      key={student.id}
                      href={`/admin/students/${student.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 hover:bg-slate-100 dark:bg-slate-700/40 dark:hover:bg-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
                          {student.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Đã nộp {student.submitted}/{student.assigned} · Điểm TB{' '}
                          {student.averageScore.toFixed(1)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        student.accessTier === 'full'
                          ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {student.accessTier === 'full' ? 'Nâng cao' : 'Cơ bản'}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </Link>
                  ))}
                  {scopedRisks.length === 0 && (
                    <p className="py-8 text-center text-sm text-slate-500">
                      Không có cảnh báo trong phạm vi đang chọn.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-rose-500" />
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Kiến thức yếu nhất
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dựa trên câu trả lời đã nộp và liên kết câu hỏi - kiến thức, tối thiểu 3 câu.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {weakTheories.map((item) => (
                  <div
                    key={item.theoryId}
                    className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                  >
                    <p className="line-clamp-2 min-h-10 text-sm font-medium text-slate-800 dark:text-white">
                      {item.title}
                    </p>
                    <div className="mt-3 flex items-end justify-between">
                      <span
                        className={`text-2xl font-bold ${
                          item.accuracy < 50 ? 'text-rose-600' : 'text-amber-600'
                        }`}
                      >
                        {item.accuracy}%
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.correct}/{item.attempted}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div
                        className={item.accuracy < 50 ? 'h-full bg-rose-500' : 'h-full bg-amber-500'}
                        style={{ width: `${item.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
                {weakTheories.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-slate-500">
                    Chưa có đủ câu trả lời đã liên kết kiến thức trong phạm vi đang chọn.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  note?: string
  tone: 'blue' | 'teal' | 'green' | 'amber'
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {note && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
          <Clock3 className="h-3 w-3" />
          {note}
        </p>
      )}
    </div>
  )
}
