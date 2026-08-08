'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  Search,
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
  class_id: string | null
  created_at: string
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
  grading_status: string | null
  pending_grading_count: number | null
  start_time: string
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
  medianScore: number | null
  pendingReview: number
  pendingEssayCount: number
  scores: number[]
}

interface WeakTheory {
  theoryId: string
  title: string
  attempted: number
  correct: number
  accuracy: number
}

type StudentStanding = 'needs_support' | 'stable' | 'standout' | 'no_data'
type ActivityFilter = 'all' | 'simulation' | 'practice'
type PeriodFilter = 'all' | '7d' | '30d' | '90d'

interface StudentSummary {
  id: string
  name: string
  className: string
  assigned: number
  started: number
  submitted: number
  medianScore: number | null
  pendingReview: number
  standing: StudentStanding
  latestAttemptId: string | null
  latestActivityAt: string | null
}

interface PendingReviewItem {
  attemptId: string
  examTitle: string
  studentName: string
  pendingCount: number
  submittedAt: string | null
}

const ACTIVITY_LABELS: Record<ActivityFilter, string> = {
  all: 'Thi thử và ôn tập',
  simulation: 'Thi thử',
  practice: 'Ôn tập',
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'Tất cả thời gian',
  '7d': '7 ngày gần đây',
  '30d': '30 ngày gần đây',
  '90d': '90 ngày gần đây',
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function isExamInPeriod(exam: ExamRow, period: PeriodFilter): boolean {
  if (period === 'all') return true
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const referenceTime = new Date(exam.end_time || exam.created_at).getTime()
  return (
    Number.isFinite(referenceTime) &&
    referenceTime >= Date.now() - days * 86_400_000
  )
}

function attemptTimestamp(attempt: AttemptRow): number {
  return new Date(attempt.submit_time || attempt.start_time).getTime()
}

function nullableTimestamp(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER
}

function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1)
}

function formatRelativeTime(value: string | null): string {
  if (!value) return 'Chưa có hoạt động'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Không rõ thời gian'
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000)
  )
  if (diffMinutes < 60) return diffMinutes < 2 ? 'Vừa xong' : `${diffMinutes} phút trước`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} giờ trước`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) return `${diffDays} ngày trước`
  return new Date(value).toLocaleDateString('vi-VN')
}

export default function TeacherAnalyticsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [progress, setProgress] = useState<AssignmentProgress[]>([])
  const [weakTheories, setWeakTheories] = useState<WeakTheory[]>([])
  const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([])
  const [pendingReviews, setPendingReviews] = useState<PendingReviewItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all')
  const [studentSearch, setStudentSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [systemAdminScope, setSystemAdminScope] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) throw new Error('Phiên đăng nhập không hợp lệ.')

        const { data: actor, error: actorError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single()
        if (actorError) throw actorError
        if (actor?.role !== 'teacher' && actor?.role !== 'admin') {
          throw new Error('Bạn không có quyền xem kết quả lớp.')
        }
        const isSystemAdmin = actor.role === 'admin'
        if (!cancelled) setSystemAdminScope(isSystemAdmin)

        let classQuery = supabase
          .from('classes')
          .select('id, name')
          .order('name')
        if (!isSystemAdmin) classQuery = classQuery.eq('teacher_id', userId)
        const classRes = await classQuery
        if (classRes.error) throw classRes.error

        const teacherClasses = (classRes.data || []) as ClassRow[]
        const classIds = new Set(teacherClasses.map((item) => item.id))
        const studentMap = new Map<string, StudentRow>()

        let classStudentQuery = supabase
          .from('profiles')
          .select('id, full_name, email, class_id, access_tier')
          .eq('role', 'student')
        if (!isSystemAdmin) {
          if (classIds.size === 0) {
            classStudentQuery = classStudentQuery.in('class_id', ['__no_class__'])
          } else {
            classStudentQuery = classStudentQuery.in('class_id', Array.from(classIds))
          }
        }
        const classStudentRes = await classStudentQuery
        if (classStudentRes.error) throw classStudentRes.error
        for (const student of classStudentRes.data || []) {
          studentMap.set(student.id, student as StudentRow)
        }

        const assignmentQueries = []
        if (isSystemAdmin) {
          assignmentQueries.push(
            supabase
              .from('exam_assignments')
              .select('exam_id, class_id, student_id')
          )
        } else {
          assignmentQueries.push(
            supabase
              .from('exam_assignments')
              .select('exam_id, class_id, student_id')
              .eq('assigned_by', userId)
          )
          if (classIds.size > 0) {
            assignmentQueries.push(
              supabase
                .from('exam_assignments')
                .select('exam_id, class_id, student_id')
                .in('class_id', Array.from(classIds))
            )
          }
          const classStudentIds = Array.from(studentMap.keys())
          if (classStudentIds.length > 0) {
            assignmentQueries.push(
              supabase
                .from('exam_assignments')
                .select('exam_id, class_id, student_id')
                .in('student_id', classStudentIds)
            )
          }
        }

        const assignmentResults = await Promise.all(assignmentQueries)
        const assignmentMap = new Map<string, AssignmentRow>()
        for (const result of assignmentResults) {
          if (result.error) throw result.error
          for (const assignment of result.data || []) {
            const typedAssignment = assignment as AssignmentRow
            assignmentMap.set(
              [
                typedAssignment.exam_id,
                typedAssignment.class_id || '',
                typedAssignment.student_id || '',
              ].join(':'),
              typedAssignment
            )
          }
        }
        const assignments = Array.from(assignmentMap.values())
        const directStudentIds = assignments
          .map((assignment) => assignment.student_id)
          .filter(
            (id): id is string => Boolean(id) && !studentMap.has(id as string)
          )
        if (directStudentIds.length > 0) {
          const directStudentRes = await supabase
            .from('profiles')
            .select('id, full_name, email, class_id, access_tier')
            .eq('role', 'student')
            .in('id', directStudentIds)
          if (directStudentRes.error) throw directStudentRes.error
          for (const student of directStudentRes.data || []) {
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

        const examQueries = []
        if (isSystemAdmin) {
          examQueries.push(
            supabase
              .from('exams')
              .select('id, title, exam_mode, class_id, created_at, end_time')
              .in('exam_mode', ['simulation', 'practice'])
              .order('created_at', { ascending: false })
          )
        } else {
          examQueries.push(
            supabase
              .from('exams')
              .select('id, title, exam_mode, class_id, created_at, end_time')
              .eq('created_by', userId)
              .in('exam_mode', ['simulation', 'practice'])
          )
          if (classIds.size > 0) {
            examQueries.push(
              supabase
                .from('exams')
                .select('id, title, exam_mode, class_id, created_at, end_time')
                .in('class_id', Array.from(classIds))
                .in('exam_mode', ['simulation', 'practice'])
            )
          }
          const assignedExamIds = [
            ...new Set(assignments.map((assignment) => assignment.exam_id)),
          ]
          if (assignedExamIds.length > 0) {
            examQueries.push(
              supabase
                .from('exams')
                .select('id, title, exam_mode, class_id, created_at, end_time')
                .in('id', assignedExamIds)
                .in('exam_mode', ['simulation', 'practice'])
            )
          }
        }

        const examResults = await Promise.all(examQueries)
        const scopedExamMap = new Map<string, ExamRow>()
        for (const result of examResults) {
          if (result.error) throw result.error
          for (const exam of result.data || []) {
            scopedExamMap.set(exam.id, exam as ExamRow)
          }
        }
        const visibleExams = Array.from(scopedExamMap.values()).filter(
          (exam) =>
            (activityFilter === 'all' || exam.exam_mode === activityFilter) &&
            isExamInPeriod(exam, periodFilter)
        )
        const examMap = new Map(visibleExams.map((exam) => [exam.id, exam]))
        const examIds = Array.from(examMap.keys())

        let attempts: AttemptRow[] = []
        if (examIds.length > 0) {
          const attemptRes = await supabase
            .from('exam_attempts')
            .select(`
              id,
              exam_id,
              student_id,
              status,
              score,
              grading_status,
              pending_grading_count,
              start_time,
              submit_time
            `)
            .in('exam_id', examIds)
          if (attemptRes.error) throw attemptRes.error
          attempts = (attemptRes.data || []) as AttemptRow[]
        }

        const scopedStudentIdSet = new Set(scopedStudents.map((student) => student.id))
        const recipientsByExam = new Map<string, Set<string>>()
        for (const exam of visibleExams) {
          if (!exam.class_id) continue
          recipientsByExam.set(
            exam.id,
            new Set(
              scopedStudents
                .filter((student) => student.class_id === exam.class_id)
                .map((student) => student.id)
            )
          )
        }
        for (const assignment of assignments) {
          if (!examMap.has(assignment.exam_id)) continue
          const recipients = recipientsByExam.get(assignment.exam_id) || new Set<string>()
          if (
            assignment.student_id &&
            scopedStudentIdSet.has(assignment.student_id)
          ) {
            recipients.add(assignment.student_id)
          }
          if (assignment.class_id) {
            for (const student of scopedStudents) {
              if (student.class_id === assignment.class_id) recipients.add(student.id)
            }
          }
          recipientsByExam.set(assignment.exam_id, recipients)
        }

        const isAttemptInScope = (attempt: AttemptRow) => {
          const recipients = recipientsByExam.get(attempt.exam_id)
          if (recipients) return recipients.has(attempt.student_id)
          return scopedStudentIdSet.has(attempt.student_id)
        }
        const scopedAttempts = attempts.filter(isAttemptInScope)
        const now = Date.now()
        const assignmentProgress: AssignmentProgress[] = visibleExams
          .map((exam) => {
            const recipients = recipientsByExam.get(exam.id) || new Set<string>()
            const examAttempts = scopedAttempts.filter(
              (attempt) => attempt.exam_id === exam.id
            )
            const startedStudents = new Set(examAttempts.map((attempt) => attempt.student_id))
            const submittedAttempts = examAttempts.filter(
              (attempt) => attempt.status === 'submitted' || attempt.status === 'graded'
            )
            const submittedStudents = new Set(
              submittedAttempts.map((attempt) => attempt.student_id)
            )
            const lateStudents = new Set(
              submittedAttempts
                .filter(
                  (attempt) =>
                    exam.end_time &&
                    attempt.submit_time &&
                    new Date(attempt.submit_time).getTime() >
                      new Date(exam.end_time).getTime()
                )
                .map((attempt) => attempt.student_id)
            )
            const scores = submittedAttempts
              .filter(
                (attempt) =>
                  attempt.score !== null &&
                  attempt.grading_status !== 'pending_review' &&
                  attempt.grading_status !== 'failed'
              )
              .map((attempt) => attempt.score as number)
            const pendingAttempts = submittedAttempts.filter(
              (attempt) => attempt.grading_status === 'pending_review'
            )
            return {
              examId: exam.id,
              title: exam.title,
              mode: exam.exam_mode,
              deadline: exam.end_time,
              assigned: recipients.size,
              started: startedStudents.size,
              submitted: submittedStudents.size,
              late: lateStudents.size,
              medianScore: median(scores),
              pendingReview: pendingAttempts.length,
              pendingEssayCount: pendingAttempts.reduce(
                (sum, attempt) => sum + (attempt.pending_grading_count || 0),
                0
              ),
              scores,
            }
          })
          .filter((item) => item.assigned > 0 || item.started > 0)
          .sort((a, b) => {
            const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity
            const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity
            return Math.abs(aTime - now) - Math.abs(bTime - now)
          })

        const evidenceRows: Array<{
          student_id: string
          theory_id: string
          is_correct: boolean
          theories: { title: string } | null
        }> = []
        const scopedAttemptIds = scopedAttempts
          .filter(
            (attempt) =>
              (attempt.status === 'submitted' || attempt.status === 'graded')
          )
          .map((attempt) => attempt.id)
        const studentByAttempt = new Map(
          scopedAttempts.map((attempt) => [attempt.id, attempt.student_id])
        )

        if (scopedAttemptIds.length > 0) {
          const answerRes = await supabase
            .from('student_answers')
            .select('attempt_id, question_id, question_type, is_correct')
            .in('attempt_id', scopedAttemptIds)
          if (answerRes.error) throw answerRes.error

          const answers = (answerRes.data || []) as Array<{
            attempt_id: string
            question_id: string
            question_type: string
            is_correct: boolean | null
          }>
          const objectiveAnswers = answers.filter(
            (answer) => answer.question_type !== 'essay'
          )
          const questionIds = [
            ...new Set(objectiveAnswers.map((answer) => answer.question_id)),
          ]

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

            for (const answer of objectiveAnswers) {
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

        const classNames = new Map(
          teacherClasses.map((classItem) => [classItem.id, classItem.name])
        )
        const summaryRows: StudentSummary[] = scopedStudents.map((student) => {
          const assigned = Array.from(recipientsByExam.values()).filter((recipients) =>
            recipients.has(student.id)
          ).length
          const studentAttempts = scopedAttempts
            .filter((attempt) => attempt.student_id === student.id)
            .sort(
              (a, b) =>
                attemptTimestamp(b) - attemptTimestamp(a)
            )
          const started = new Set(
            studentAttempts.map((attempt) => attempt.exam_id)
          ).size
          const submittedAttempts = studentAttempts.filter(
            (attempt) =>
              attempt.status === 'submitted' || attempt.status === 'graded'
          )
          const submitted = new Set(
            submittedAttempts.map((attempt) => attempt.exam_id)
          ).size
          const scores = submittedAttempts
            .filter(
              (attempt) =>
                attempt.score !== null &&
                attempt.grading_status !== 'pending_review' &&
                attempt.grading_status !== 'failed'
            )
            .map((attempt) => attempt.score as number)
          const medianScore = median(scores)
          const pendingReview = submittedAttempts.filter(
            (attempt) => attempt.grading_status === 'pending_review'
          ).length
          const missing = Math.max(assigned - submitted, 0)
          let standing: StudentStanding = 'stable'
          if (assigned === 0 && studentAttempts.length === 0) {
            standing = 'no_data'
          } else if (missing > 0 || (medianScore !== null && medianScore < 5)) {
            standing = 'needs_support'
          } else if (
            assigned > 0 &&
            submitted >= assigned &&
            medianScore !== null &&
            medianScore >= 8
          ) {
            standing = 'standout'
          }

          const latestAttempt = studentAttempts[0]
          return {
            id: student.id,
            name: student.full_name || student.email || 'Học sinh',
            className: student.class_id
              ? classNames.get(student.class_id) || 'Lớp thuộc phạm vi được giao'
              : 'Chưa xếp lớp',
            assigned,
            started,
            submitted,
            medianScore,
            pendingReview,
            standing,
            latestAttemptId: latestAttempt?.id || null,
            latestActivityAt:
              latestAttempt?.submit_time || latestAttempt?.start_time || null,
          }
        })

        const pendingRows: PendingReviewItem[] = scopedAttempts
          .filter(
            (attempt) =>
              (attempt.status === 'submitted' || attempt.status === 'graded') &&
              attempt.grading_status === 'pending_review'
          )
          .map((attempt) => {
            const student = studentMap.get(attempt.student_id)
            return {
              attemptId: attempt.id,
              examTitle: examMap.get(attempt.exam_id)?.title || 'Đề thi',
              studentName:
                student?.full_name || student?.email || 'Học sinh',
              pendingCount: attempt.pending_grading_count || 0,
              submittedAt: attempt.submit_time,
            }
          })
          .sort(
            (a, b) =>
              nullableTimestamp(a.submittedAt) - nullableTimestamp(b.submittedAt)
          )

        if (!cancelled) {
          setClasses(teacherClasses)
          setStudents(scopedStudents)
          setProgress(assignmentProgress)
          setWeakTheories(weak)
          setStudentSummaries(summaryRows)
          setPendingReviews(pendingRows)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Teacher analytics error:', err)
          setError(
            err instanceof Error
              ? err.message
              : 'Không thể tải thống kê theo giáo viên.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    activityFilter,
    periodFilter,
    refreshKey,
    selectedClassId,
    supabase,
  ])

  const filteredStudentSummaries = useMemo(() => {
    const normalizedSearch = studentSearch.trim().toLocaleLowerCase('vi')
    const standingPriority: Record<StudentStanding, number> = {
      needs_support: 0,
      stable: 1,
      standout: 2,
      no_data: 3,
    }
    return studentSummaries
      .filter(
        (student) =>
          normalizedSearch.length === 0 ||
          student.name.toLocaleLowerCase('vi').includes(normalizedSearch) ||
          student.className.toLocaleLowerCase('vi').includes(normalizedSearch)
      )
      .sort(
        (a, b) =>
          standingPriority[a.standing] - standingPriority[b.standing] ||
          a.name.localeCompare(b.name, 'vi')
      )
  }, [studentSearch, studentSummaries])

  const totals = useMemo(() => {
    const assigned = progress.reduce((sum, item) => sum + item.assigned, 0)
    const started = progress.reduce((sum, item) => sum + item.started, 0)
    const submitted = progress.reduce((sum, item) => sum + item.submitted, 0)
    const scores = progress.flatMap((item) => item.scores)
    const pendingEssayCount = progress.reduce(
      (sum, item) => sum + item.pendingEssayCount,
      0
    )
    return {
      assigned,
      started,
      submitted,
      completionRate:
        assigned > 0 ? Math.round((submitted / assigned) * 100) : null,
      medianScore: median(scores),
      pendingReview: pendingReviews.length,
      pendingEssayCount,
      needsSupport: studentSummaries.filter(
        (student) => student.standing === 'needs_support'
      ).length,
    }
  }, [pendingReviews.length, progress, studentSummaries])

  const allClassesLabel = systemAdminScope
    ? 'Tất cả lớp toàn hệ thống'
    : 'Tất cả lớp của tôi'
  const selectedClassName =
    selectedClassId === 'all'
      ? allClassesLabel
      : classes.find((classItem) => classItem.id === selectedClassId)?.name ||
        'Lớp đang chọn'

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader
        title="Kết quả lớp"
        subtitle={
          systemAdminScope
            ? 'Tổng hợp thi thử và ôn tập trên toàn hệ thống'
            : 'Ưu tiên việc cần xử lý từ dữ liệu thi thử và ôn tập trong phạm vi bạn phụ trách'
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(170px,auto)_minmax(170px,auto)_auto]">
            <FilterSelect
              label="Lớp"
              value={selectedClassId}
              onChange={setSelectedClassId}
            >
              <option value="all">{allClassesLabel}</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Loại hoạt động"
              value={activityFilter}
              onChange={(value) => setActivityFilter(value as ActivityFilter)}
            >
              <option value="all">Thi thử và ôn tập</option>
              <option value="simulation">Chỉ thi thử</option>
              <option value="practice">Chỉ ôn tập</option>
            </FilterSelect>
            <FilterSelect
              label="Khoảng thời gian"
              value={periodFilter}
              onChange={(value) => setPeriodFilter(value as PeriodFilter)}
            >
              <option value="all">Tất cả thời gian</option>
              <option value="7d">7 ngày gần đây</option>
              <option value="30d">30 ngày gần đây</option>
              <option value="90d">90 ngày gần đây</option>
            </FilterSelect>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={loading}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 xl:w-auto"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Phạm vi: {selectedClassName} · {ACTIVITY_LABELS[activityFilter]} ·{' '}
            {PERIOD_LABELS[periodFilter]}. Không gộp dữ liệu bài tập về nhà.
            {periodFilter !== 'all' && (
              <span className="mt-1 block">
                Thời gian được tính theo hạn kết thúc đề; đề không có hạn dùng
                ngày tạo.
              </span>
            )}
          </p>
        </section>

        {loading ? (
          <div className="flex min-h-[55vh] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              Đang tổng hợp kết quả trong phạm vi đã chọn...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
            <h2 className="mt-3 font-semibold text-rose-900 dark:text-rose-100">
              Không tải được kết quả lớp
            </h2>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard
                icon={Users}
                label="Học sinh trong phạm vi"
                value={students.length.toString()}
                note={`${totals.needsSupport} học sinh cần hỗ trợ`}
                tone="teal"
              />
              <MetricCard
                icon={CheckCircle2}
                label="Mức hoàn thành"
                value={
                  totals.completionRate === null
                    ? '—'
                    : `${totals.completionRate}%`
                }
                note={`${totals.submitted}/${totals.assigned} lượt được giao`}
                tone="green"
              />
              <MetricCard
                icon={Target}
                label="Điểm trung vị đã chốt"
                value={
                  totals.medianScore === null
                    ? '—'
                    : totals.medianScore.toFixed(2)
                }
                note="Không tính bài đang chờ duyệt"
                tone="blue"
              />
              <MetricCard
                icon={FileCheck2}
                label="Bài cần duyệt"
                value={totals.pendingReview.toString()}
                note={`${totals.pendingEssayCount} câu tự luận đang chờ`}
                tone="amber"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Tiến độ theo hoạt động
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hoàn thành = số học sinh đã nộp / số học sinh được giao.
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {progress.map((item) => {
                    const completion =
                      item.assigned > 0
                        ? Math.round((item.submitted / item.assigned) * 100)
                        : null
                    return (
                      <div key={item.examId} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800 dark:text-white">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.mode === 'practice' ? 'Ôn tập' : 'Thi thử'} ·
                              Bắt đầu {item.started}/{item.assigned} · Đã nộp{' '}
                              {item.submitted}/{item.assigned}
                              {item.late > 0 ? ` · Trễ ${item.late}` : ''}
                            </p>
                          </div>
                          <span className="text-lg font-bold text-teal-600">
                            {completion === null ? '—' : `${completion}%`}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${completion || 0}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            Trung vị{' '}
                            {item.medianScore === null
                              ? '—'
                              : item.medianScore.toFixed(2)}
                            {item.pendingReview > 0
                              ? ` · ${item.pendingReview} bài chờ duyệt`
                              : ''}
                          </span>
                          <Link
                            href={`/admin/exams/${item.examId}/results`}
                            className="inline-flex items-center gap-1 font-medium text-teal-600 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          >
                            Xem kết quả <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {progress.length === 0 && (
                    <EmptyMessage
                      icon={ClipboardCheck}
                      title="Chưa có hoạt động phù hợp"
                      description="Hãy đổi lớp, loại hoạt động hoặc khoảng thời gian."
                    />
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-amber-500" />
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-white">
                      Hàng chờ tự luận
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bài cũ nhất được ưu tiên; giáo viên vẫn là người chốt điểm.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {pendingReviews.slice(0, 6).map((item) => (
                    <Link
                      key={item.attemptId}
                      href={`/admin/attempts/${item.attemptId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-slate-50 p-3 transition hover:border-amber-200 hover:bg-amber-50/60 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:bg-slate-700/40 dark:hover:border-amber-800 dark:hover:bg-amber-950/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
                          {item.studentName}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {item.examTitle} · {formatRelativeTime(item.submittedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        {item.pendingCount > 0
                          ? `${item.pendingCount} câu`
                          : 'Chờ duyệt'}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </Link>
                  ))}
                  {pendingReviews.length === 0 && (
                    <EmptyMessage
                      icon={CheckCircle2}
                      title="Không có bài tự luận chờ duyệt"
                      description="Các bài trong phạm vi đang chọn đã được xử lý."
                      compact
                    />
                  )}
                </div>
                {pendingReviews.length > 6 && (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Đang hiển thị 6/{pendingReviews.length} bài cũ nhất. Mở kết quả
                    từng đề để xem toàn bộ hàng chờ.
                  </p>
                )}
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="border-b border-slate-200 p-4 sm:p-5 dark:border-slate-700">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                      Theo dõi học sinh
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Cần hỗ trợ: còn thiếu bài hoặc trung vị dưới 5. Nổi bật: đã
                      nộp đủ và trung vị từ 8 trở lên.
                    </p>
                  </div>
                  <label className="relative w-full lg:max-w-sm">
                    <span className="sr-only">Tìm học sinh hoặc lớp</span>
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="Tìm học sinh hoặc lớp..."
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Hiển thị {filteredStudentSummaries.length}/
                  {studentSummaries.length} học sinh trong phạm vi.
                </p>
              </div>

              {filteredStudentSummaries.length === 0 ? (
                <EmptyMessage
                  icon={Users}
                  title={
                    studentSummaries.length === 0
                      ? 'Chưa có học sinh trong phạm vi'
                      : 'Không có học sinh khớp tìm kiếm'
                  }
                  description={
                    studentSummaries.length === 0
                      ? 'Hãy kiểm tra lớp hoặc hoạt động đã chọn.'
                      : 'Hãy thử tên hoặc lớp khác.'
                  }
                />
              ) : (
                <>
                  <div className="space-y-3 p-4 lg:hidden">
                    {filteredStudentSummaries.map((student) => (
                      <article
                        key={student.id}
                        className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                              {student.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {student.className}
                            </p>
                          </div>
                          <StandingBadge standing={student.standing} />
                        </div>
                        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">
                              Đã nộp
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                              {student.submitted}/{student.assigned}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">
                              Trung vị
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                              {formatScore(student.medianScore)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">
                              Chờ duyệt
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                              {student.pendingReview}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          Hoạt động gần nhất:{' '}
                          {formatRelativeTime(student.latestActivityAt)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={`/admin/students/${student.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                          >
                            Xem học sinh
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                          {student.latestAttemptId && (
                            <Link
                              href={`/admin/attempts/${student.latestAttemptId}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              Attempt gần nhất
                            </Link>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[980px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/60">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="px-5 py-3.5">Học sinh</th>
                          <th className="px-5 py-3.5">Tiến độ</th>
                          <th className="px-5 py-3.5">Trung vị</th>
                          <th className="px-5 py-3.5">Tự luận</th>
                          <th className="px-5 py-3.5">Trạng thái</th>
                          <th className="px-5 py-3.5">Hoạt động gần nhất</th>
                          <th className="px-5 py-3.5 text-right">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {filteredStudentSummaries.map((student) => (
                          <tr
                            key={student.id}
                            className="transition hover:bg-slate-50/80 dark:hover:bg-slate-700/30"
                          >
                            <td className="px-5 py-4">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">
                                {student.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {student.className}
                              </p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-200">
                              <span className="font-semibold">
                                {student.submitted}/{student.assigned}
                              </span>{' '}
                              đã nộp
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {student.started} hoạt động đã bắt đầu
                              </p>
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">
                              {formatScore(student.medianScore)}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-200">
                              {student.pendingReview > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                                  <Clock3 className="h-3 w-3" />
                                  {student.pendingReview} bài chờ
                                </span>
                              ) : (
                                <span className="text-slate-400">Không có</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <StandingBadge standing={student.standing} />
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {formatRelativeTime(student.latestActivityAt)}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                {student.latestAttemptId && (
                                  <Link
                                    href={`/admin/attempts/${student.latestAttemptId}`}
                                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                  >
                                    Attempt
                                  </Link>
                                )}
                                <Link
                                  href={`/admin/students/${student.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                                >
                                  Hồ sơ
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-rose-500" />
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Kiến thức cần củng cố
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chỉ dựa trên câu khách quan đã nộp và có liên kết kiến thức,
                    tối thiểu 3 câu; không suy diễn từ điểm tự luận.
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
                  <div className="col-span-full">
                    <EmptyMessage
                      icon={BarChart3}
                      title="Chưa đủ dữ liệu kiến thức"
                      description="Cần ít nhất 3 câu khách quan đã nộp và có liên kết kiến thức."
                      compact
                    />
                  </div>
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

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        {children}
      </select>
    </label>
  )
}

function StandingBadge({ standing }: { standing: StudentStanding }) {
  const meta: Record<
    StudentStanding,
    {
      label: string
      icon: typeof Users
      className: string
    }
  > = {
    needs_support: {
      label: 'Cần hỗ trợ',
      icon: AlertTriangle,
      className:
        'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    },
    stable: {
      label: 'Ổn định',
      icon: CheckCircle2,
      className:
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    standout: {
      label: 'Nổi bật',
      icon: TrendingUp,
      className:
        'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
    },
    no_data: {
      label: 'Chưa đủ dữ liệu',
      icon: BarChart3,
      className:
        'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    },
  }
  const selected = meta[standing]
  const Icon = selected.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${selected.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {selected.label}
    </span>
  )
}

function EmptyMessage({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: typeof Users
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'p-10'}`}>
      <Icon className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  )
}
