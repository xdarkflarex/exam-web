'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import {
  AdminHeader,
  InboxPanel,
  QuickActions,
  RecentExamsList,
  RecentFeedbackList,
  type InboxItem,
} from '@/components/admin'
import { createClient } from '@/lib/supabase/client'
import { useLoading } from '@/contexts/LoadingContext'

interface RecentExam {
  id: string
  title: string
  questionCount: number
  createdAt: string
}

interface Feedback {
  id: string
  studentName: string
  examTitle: string
  questionNumber: number
  content: string
  createdAt: string
  status: 'pending' | 'reviewed' | 'resolved'
}

interface Counts {
  /** Bài tự luận đang chờ giáo viên duyệt. `null` khi cột chưa tồn tại trên DB. */
  pendingEssays: number | null
  pendingFeedbacks: number | null
  overdueHomeworks: number | null
  uncoveredTheories: number | null
}

const EMPTY_COUNTS: Counts = {
  pendingEssays: null,
  pendingFeedbacks: null,
  overdueHomeworks: null,
  uncoveredTheories: null,
}

function formatTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  return `${Math.floor(diffDays / 7)} tuần trước`
}

function mapFeedbackStatus(status: string): Feedback['status'] {
  if (status === 'fixed') return 'resolved'
  if (status === 'reviewed') return 'reviewed'
  return 'pending'
}

export default function AdminDashboard() {
  const supabase = useMemo(() => createClient(), [])
  const { showLoading, hideLoading } = useLoading()
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [recentExams, setRecentExams] = useState<RecentExam[]>([])
  const [recentFeedbacks, setRecentFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setError(null)
    showLoading('Đang tải dữ liệu dashboard...')

    try {
      const nowIso = new Date().toISOString()

      // Mỗi truy vấn độc lập: một cái hỏng không được làm trắng cả trang.
      // `head: true` chỉ lấy count, không kéo dòng về client — khác với bản cũ
      // tải toàn bộ `exam_attempts` rồi đếm distinct bằng Set trong browser.
      const [essayRes, feedbackRes, overdueRes, theoryRes, targetRes, examsRes, feedbackListRes] =
        await Promise.allSettled([
          supabase
            .from('exam_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('grading_status', 'pending_review'),
          supabase
            .from('question_feedbacks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('homework_attempts')
            .select('id, status, homework_assignments!inner(deadline)')
            .not('homework_assignments.deadline', 'is', null)
            .lt('homework_assignments.deadline', nowIso)
            .not('status', 'in', '("submitted","graded")'),
          supabase.from('theories').select('id').eq('is_published', true),
          supabase.from('homework_knowledge_targets').select('theory_id'),
          supabase
            .from('exams')
            .select('id, title, created_at, exam_questions(count)')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('question_feedbacks')
            .select(`
              id,
              message,
              status,
              created_at,
              profiles!student_id(full_name),
              questions!question_id(
                content,
                exam_questions(
                  order,
                  exams(title)
                )
              )
            `)
            .order('created_at', { ascending: false })
            .limit(5),
        ])

      const countOf = (result: PromiseSettledResult<{ count: number | null; error: unknown }>) => {
        if (result.status !== 'fulfilled' || result.value.error) return null
        return result.value.count ?? null
      }

      // Chuyên đề chưa được giao bài tập nào. Với quyết định "cây kỹ năng chỉ
      // dùng homework được giao", đây là chỉ báo vận hành quan trọng nhất:
      // không giao bài thì node không có tín hiệu năng lực nào.
      let uncoveredTheories: number | null = null
      if (
        theoryRes.status === 'fulfilled' && !theoryRes.value.error &&
        targetRes.status === 'fulfilled' && !targetRes.value.error
      ) {
        const covered = new Set(
          ((targetRes.value.data || []) as Array<{ theory_id: string }>).map((row) => row.theory_id)
        )
        const published = (theoryRes.value.data || []) as Array<{ id: string }>
        uncoveredTheories = published.filter((row) => !covered.has(row.id)).length
      }

      setCounts({
        pendingEssays: countOf(essayRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
        pendingFeedbacks: countOf(feedbackRes as PromiseSettledResult<{ count: number | null; error: unknown }>),
        overdueHomeworks:
          overdueRes.status === 'fulfilled' && !overdueRes.value.error
            ? (overdueRes.value.data || []).length
            : null,
        uncoveredTheories,
      })

      if (examsRes.status === 'fulfilled' && examsRes.value.data) {
        setRecentExams(
          examsRes.value.data.map((exam) => {
            const questions = exam.exam_questions as unknown as Array<{ count: number }> | null
            return {
              id: exam.id,
              title: exam.title,
              questionCount: questions?.[0]?.count || 0,
              createdAt: formatTimeAgo(exam.created_at),
            }
          })
        )
      }

      if (feedbackListRes.status === 'fulfilled' && feedbackListRes.value.data) {
        setRecentFeedbacks(
          feedbackListRes.value.data.map((row) => {
            const question = row.questions as unknown as {
              exam_questions?: Array<{ order?: number; exams?: { title?: string } }>
            } | null
            const examQuestion = question?.exam_questions?.[0]
            const profile = row.profiles as unknown as { full_name?: string } | null
            return {
              id: row.id,
              studentName: profile?.full_name || 'Học sinh',
              examTitle: examQuestion?.exams?.title || 'Đề thi',
              questionNumber: examQuestion?.order || 1,
              content: row.message,
              createdAt: formatTimeAgo(row.created_at),
              status: mapFeedbackStatus(row.status),
            }
          })
        )
      }

      const allFailed = [essayRes, feedbackRes, overdueRes, examsRes].every(
        (result) => result.status === 'rejected'
      )
      if (allFailed) throw new Error('Không tải được dữ liệu tổng quan.')
    } catch (dashboardError) {
      console.error('Dashboard fetch error:', dashboardError)
      setError('Không tải được dữ liệu tổng quan. Vui lòng thử lại.')
    } finally {
      setLoading(false)
      hideLoading()
    }
  }, [hideLoading, showLoading, supabase])

  useEffect(() => {
    void fetchDashboardData()
  }, [fetchDashboardData])

  const inboxItems: InboxItem[] = [
    {
      id: 'essays',
      label: 'Bài tự luận chờ duyệt',
      count: counts.pendingEssays,
      href: '/admin/exams',
      note: counts.pendingEssays === null ? 'Chưa bật chấm tự luận' : 'Học sinh chưa thấy điểm tổng',
      tone: 'rose',
    },
    {
      id: 'feedbacks',
      label: 'Góp ý chưa xem',
      count: counts.pendingFeedbacks,
      href: '/admin/feedback',
      tone: 'amber',
    },
    {
      id: 'overdue',
      label: 'Bài tập quá hạn chưa nộp',
      count: counts.overdueHomeworks,
      href: '/admin/homework',
      note: 'Cần nhắc học sinh',
      tone: 'amber',
    },
    {
      id: 'uncovered',
      label: 'Chuyên đề chưa có bài tập',
      count: counts.uncoveredTheories,
      href: '/admin/knowledge-links',
      note: 'Cây kỹ năng chưa đo được các bài này',
      tone: 'teal',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader title="Tổng quan" subtitle="Việc đang chờ và hoạt động gần đây" />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error && (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={() => void fetchDashboardData()}
              className="inline-flex items-center gap-2 font-semibold hover:underline"
            >
              <RefreshCcw className="h-4 w-4" />
              Thử lại
            </button>
          </div>
        )}

        <QuickActions />

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <InboxPanel items={inboxItems} loading={loading} />
          <RecentFeedbackList feedbacks={recentFeedbacks} />
        </div>

        <RecentExamsList exams={recentExams} />

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cần số liệu chi tiết hơn?{' '}
          <Link href="/admin/analytics" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Mở trang thống kê
          </Link>
        </p>
      </div>
    </div>
  )
}
