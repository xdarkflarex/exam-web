'use client'

import { useState, useEffect } from 'react'
import { FileText, HelpCircle, Users, ClipboardList } from 'lucide-react'
import { AdminHeader, StatCard, RecentExamsList, RecentFeedbackList } from '@/components/admin'
import { createClient } from '@/lib/supabase/client'
import { useLoading } from '@/contexts/LoadingContext'

interface Stats {
  totalExams: number
  totalQuestions: number
  totalAttempts: number
  totalStudents: number
}

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

export default function AdminDashboard() {
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()
  const [stats, setStats] = useState<Stats>({ totalExams: 0, totalQuestions: 0, totalAttempts: 0, totalStudents: 0 })
  const [recentExams, setRecentExams] = useState<RecentExam[]>([])
  const [recentFeedbacks, setRecentFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    showLoading('Đang tải dữ liệu dashboard...')
    try {
      // Fetch stats in parallel
      const [examsRes, questionsRes, attemptsRes, studentsRes] = await Promise.all([
        supabase.from('exams').select('*', { count: 'exact', head: true }),
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('exam_attempts').select('*', { count: 'exact', head: true }),
        supabase.from('exam_attempts').select('student_id')
      ])

      // Count unique students
      const uniqueStudents = new Set(studentsRes.data?.map(a => a.student_id) || []).size

      setStats({
        totalExams: examsRes.count || 0,
        totalQuestions: questionsRes.count || 0,
        totalAttempts: attemptsRes.count || 0,
        totalStudents: uniqueStudents
      })

      // Fetch recent exams with question count
      const { data: examsData } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          created_at,
          exam_questions(count)
        `)
        .order('created_at', { ascending: false })
        .limit(5)

      if (examsData) {
        setRecentExams(examsData.map(exam => ({
          id: exam.id,
          title: exam.title,
          questionCount: (exam.exam_questions as any)?.[0]?.count || 0,
          createdAt: formatTimeAgo(exam.created_at)
        })))
      }

      // Fetch recent feedbacks
      const { data: feedbacksData } = await supabase
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
        .limit(5)

      if (feedbacksData) {
        setRecentFeedbacks(feedbacksData.map(fb => {
          const question = fb.questions as any
          const examQuestion = question?.exam_questions?.[0]
          return {
            id: fb.id,
            studentName: (fb.profiles as any)?.full_name || 'Học sinh',
            examTitle: examQuestion?.exams?.title || 'Đề thi',
            questionNumber: examQuestion?.order || 1,
            content: fb.message,
            createdAt: formatTimeAgo(fb.created_at),
            status: mapFeedbackStatus(fb.status)
          }
        }))
      }

    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
      hideLoading()
    }
  }

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} phút trước`
    if (diffHours < 24) return `${diffHours} giờ trước`
    if (diffDays < 7) return `${diffDays} ngày trước`
    return `${Math.floor(diffDays / 7)} tuần trước`
  }

  const mapFeedbackStatus = (status: string): 'pending' | 'reviewed' | 'resolved' => {
    if (status === 'fixed') return 'resolved'
    if (status === 'reviewed') return 'reviewed'
    return 'pending'
  }
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Header */}
      <AdminHeader 
        title="Tổng quan" 
        subtitle="Chào mừng trở lại! Đây là tổng quan hệ thống của bạn."
      />

      {/* Content */}
      <div className="p-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 mb-8 text-white">
          <h1 className="text-2xl font-bold mb-2">Xin chào, Giáo viên! 👋</h1>
          <p className="text-teal-100">
            Hôm nay là ngày tuyệt vời để tạo những bài kiểm tra mới. Hãy bắt đầu nào!
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Tổng số đề"
            value={stats.totalExams}
            icon={FileText}
            color="teal"
          />
          <StatCard
            title="Tổng câu hỏi"
            value={stats.totalQuestions}
            icon={HelpCircle}
            color="blue"
          />
          <StatCard
            title="Lượt làm bài"
            value={stats.totalAttempts}
            icon={ClipboardList}
            color="purple"
          />
          <StatCard
            title="Số học sinh"
            value={stats.totalStudents}
            icon={Users}
            color="amber"
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RecentExamsList exams={recentExams} />
          <RecentFeedbackList feedbacks={recentFeedbacks} />
        </div>
      </div>
    </div>
  )
}
