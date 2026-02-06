'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import Link from 'next/link'
import { 
  Users, Search, Filter, GraduationCap, Mail, Calendar,
  ChevronRight, RefreshCw, TrendingUp, Target, BarChart3,
  Download, ArrowUpDown
} from 'lucide-react'

interface Student {
  id: string
  full_name: string
  email: string
  school: string | null
  class_id: string | null
  created_at: string
  totalAttempts: number
  avgScore: number
  lastActivity: string | null
}

type SortField = 'name' | 'avgScore' | 'totalAttempts' | 'lastActivity'
type SortOrder = 'asc' | 'desc'

export default function StudentsListPage() {
  const supabase = createClient()
  
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('avgScore')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    setLoading(true)
    try {
      // Fetch all student profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false })

      if (profilesError) {
        logger.supabaseError('fetch students', profilesError)
        return
      }

      if (!profiles || profiles.length === 0) {
        setStudents([])
        setLoading(false)
        return
      }

      // Fetch all attempts for these students
      const studentIds = profiles.map(p => p.id)
      const { data: attempts } = await supabase
        .from('exam_attempts')
        .select('student_id, score, status, created_at')
        .in('student_id', studentIds)
        .in('status', ['submitted', 'graded'])

      // Calculate stats per student
      const attemptMap = new Map<string, { scores: number[]; lastActivity: string | null }>()
      
      for (const attempt of attempts || []) {
        if (!attemptMap.has(attempt.student_id)) {
          attemptMap.set(attempt.student_id, { scores: [], lastActivity: null })
        }
        const data = attemptMap.get(attempt.student_id)!
        if (attempt.score !== null) {
          data.scores.push(attempt.score)
        }
        if (!data.lastActivity || attempt.created_at > data.lastActivity) {
          data.lastActivity = attempt.created_at
        }
      }

      const studentsWithStats: Student[] = profiles.map(p => {
        const stats = attemptMap.get(p.id)
        return {
          id: p.id,
          full_name: p.full_name || 'Chưa đặt tên',
          email: p.email || '',
          school: p.school,
          class_id: p.class_id,
          created_at: p.created_at,
          totalAttempts: stats?.scores.length || 0,
          avgScore: stats?.scores.length ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length : 0,
          lastActivity: stats?.lastActivity || null
        }
      })

      setStudents(studentsWithStats)
    } catch (err) {
      logger.error('Fetch students error', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const filteredAndSortedStudents = students
    .filter(s => 
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.school?.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.full_name.localeCompare(b.full_name)
          break
        case 'avgScore':
          comparison = a.avgScore - b.avgScore
          break
        case 'totalAttempts':
          comparison = a.totalAttempts - b.totalAttempts
          break
        case 'lastActivity':
          comparison = (a.lastActivity || '').localeCompare(b.lastActivity || '')
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const totalStudents = students.length
  const activeStudents = students.filter(s => s.totalAttempts > 0).length
  const avgScoreAll = students.length > 0 
    ? students.filter(s => s.totalAttempts > 0).reduce((sum, s) => sum + s.avgScore, 0) / activeStudents || 0
    : 0

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Chưa có'
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Chưa hoạt động'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffDays === 0) return 'Hôm nay'
    if (diffDays === 1) return 'Hôm qua'
    if (diffDays < 7) return `${diffDays} ngày trước`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`
    return `${Math.floor(diffDays / 30)} tháng trước`
  }

  const exportToCSV = () => {
    const headers = ['Họ tên', 'Email', 'Trường', 'Lớp', 'Số lượt thi', 'Điểm TB', 'Hoạt động gần nhất']
    const rows = filteredAndSortedStudents.map(s => [
      s.full_name,
      s.email,
      s.school || '',
      s.class_id || '',
      s.totalAttempts.toString(),
      s.avgScore.toFixed(2),
      s.lastActivity ? new Date(s.lastActivity).toLocaleDateString('vi-VN') : ''
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `danh-sach-hoc-sinh-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader 
        title="Danh sách học sinh" 
        subtitle={`${totalStudents} học sinh trong hệ thống`}
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{totalStudents}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tổng học sinh</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{activeStudents}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Đã làm bài</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{avgScoreAll.toFixed(2)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Điểm TB chung</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên, email hoặc trường..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              onClick={fetchStudents}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Xuất CSV
            </button>
          </div>
        </div>

        {/* Students Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 dark:text-slate-400">Đang tải danh sách...</p>
            </div>
          </div>
        ) : filteredAndSortedStudents.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Không tìm thấy học sinh</h3>
            <p className="text-slate-500 dark:text-slate-400">Thử thay đổi từ khóa tìm kiếm</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
                      Học sinh
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Trường/Lớp</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                    <button onClick={() => handleSort('totalAttempts')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 mx-auto">
                      Lượt thi
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                    <button onClick={() => handleSort('avgScore')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 mx-auto">
                      Điểm TB
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                    <button onClick={() => handleSort('lastActivity')} className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
                      Hoạt động
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredAndSortedStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-medium">
                          {student.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{student.full_name}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{student.school || '-'}</p>
                      <p className="text-xs text-slate-400">{student.class_id || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
                        <BarChart3 className="w-3 h-3" />
                        {student.totalAttempts}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-bold ${
                        student.avgScore >= 8 ? 'text-green-600 dark:text-green-400' :
                        student.avgScore >= 5 ? 'text-amber-600 dark:text-amber-400' :
                        student.totalAttempts === 0 ? 'text-slate-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {student.totalAttempts > 0 ? student.avgScore.toFixed(2) : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(student.lastActivity)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded-lg text-sm hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
                      >
                        Chi tiết
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
