'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import AdminSidebar from '@/components/admin/AdminSidebar'
import { 
  FileSpreadsheet, FileText, Download, Filter,
  Calendar, Users, BookOpen, ChevronDown, Loader2,
  CheckCircle
} from 'lucide-react'

interface Exam {
  id: string
  title: string
}

interface ClassItem {
  id: string
  name: string
}

type ReportType = 'student_scores' | 'exam_stats' | 'class_report'

export default function ReportsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [success, setSuccess] = useState(false)
  
  const [exams, setExams] = useState<Exam[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  
  const [reportType, setReportType] = useState<ReportType>('student_scores')
  const [selectedExam, setSelectedExam] = useState<string>('all')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [examsRes, classesRes] = await Promise.all([
        supabase.from('exams').select('id, title').order('created_at', { ascending: false }),
        supabase.from('classes').select('id, name').order('name')
      ])

      setExams(examsRes.data || [])
      setClasses(classesRes.data || [])
    } catch (err) {
      logger.error('Fetch data error', err)
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return

    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header]
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value ?? ''
        }).join(',')
      )
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const handleExport = async () => {
    setExporting(true)
    setSuccess(false)
    
    try {
      let data: any[] = []
      let filename = ''

      switch (reportType) {
        case 'student_scores':
          data = await fetchStudentScores()
          filename = 'bang_diem_hoc_sinh'
          break
        case 'exam_stats':
          data = await fetchExamStats()
          filename = 'thong_ke_de_thi'
          break
        case 'class_report':
          data = await fetchClassReport()
          filename = 'bao_cao_lop_hoc'
          break
      }

      if (data.length > 0) {
        exportToCSV(data, filename)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } else {
        logger.error('Không có dữ liệu để xuất')
      }
    } catch (err) {
      logger.error('Export error', err)
    } finally {
      setExporting(false)
    }
  }

  const fetchStudentScores = async () => {
    let query = supabase
      .from('exam_attempts')
      .select(`
        id,
        score,
        total_questions,
        correct_answers,
        time_spent,
        created_at,
        user:profiles(full_name, email),
        exam:exams(title)
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    if (selectedExam !== 'all') {
      query = query.eq('exam_id', selectedExam)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59')
    }

    const { data, error } = await query

    if (error) {
      logger.supabaseError('fetch student scores', error)
      return []
    }

    return (data || []).map((row: any) => ({
      'Họ tên': row.user?.full_name || 'N/A',
      'Email': row.user?.email || 'N/A',
      'Đề thi': row.exam?.title || 'N/A',
      'Điểm': row.score?.toFixed(2) || 0,
      'Số câu đúng': `${row.correct_answers || 0}/${row.total_questions || 0}`,
      'Thời gian (phút)': Math.round((row.time_spent || 0) / 60),
      'Ngày làm': new Date(row.created_at).toLocaleString('vi-VN')
    }))
  }

  const fetchExamStats = async () => {
    let query = supabase
      .from('exams')
      .select(`
        id,
        title,
        time_limit,
        passing_score,
        is_published,
        created_at,
        exam_attempts(score, status)
      `)
      .order('created_at', { ascending: false })

    if (selectedExam !== 'all') {
      query = query.eq('id', selectedExam)
    }

    const { data, error } = await query

    if (error) {
      logger.supabaseError('fetch exam stats', error)
      return []
    }

    return (data || []).map((exam: any) => {
      const attempts = (exam.exam_attempts || []).filter((a: any) => a.status === 'completed')
      const scores = attempts.map((a: any) => a.score || 0)
      const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0
      const passCount = scores.filter((s: number) => s >= (exam.passing_score || 5)).length

      return {
        'Tên đề': exam.title,
        'Thời gian (phút)': exam.time_limit || 0,
        'Điểm đạt': exam.passing_score || 5,
        'Trạng thái': exam.is_published ? 'Đã xuất bản' : 'Nháp',
        'Lượt làm': attempts.length,
        'Điểm TB': avgScore.toFixed(2),
        'Điểm cao nhất': scores.length > 0 ? Math.max(...scores).toFixed(2) : 0,
        'Điểm thấp nhất': scores.length > 0 ? Math.min(...scores).toFixed(2) : 0,
        'Tỷ lệ đạt': attempts.length > 0 ? `${((passCount / attempts.length) * 100).toFixed(1)}%` : '0%',
        'Ngày tạo': new Date(exam.created_at).toLocaleDateString('vi-VN')
      }
    })
  }

  const fetchClassReport = async () => {
    let query = supabase
      .from('classes')
      .select(`
        id,
        name,
        description,
        created_at,
        profiles(id, full_name, email)
      `)
      .order('name')

    if (selectedClass !== 'all') {
      query = query.eq('id', selectedClass)
    }

    const { data: classesData, error } = await query

    if (error) {
      logger.supabaseError('fetch class report', error)
      return []
    }

    const results: any[] = []

    for (const cls of classesData || []) {
      const students = (cls as any).profiles || []
      
      if (students.length === 0) {
        results.push({
          'Lớp': cls.name,
          'Mô tả': cls.description || '',
          'Học sinh': 'Chưa có học sinh',
          'Email': '',
          'Số bài đã làm': 0,
          'Điểm TB': 0
        })
        continue
      }

      for (const student of students) {
        const { data: attempts } = await supabase
          .from('exam_attempts')
          .select('score')
          .eq('user_id', student.id)
          .eq('status', 'completed')

        const scores = (attempts || []).map((a: any) => a.score || 0)
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

        results.push({
          'Lớp': cls.name,
          'Mô tả': cls.description || '',
          'Học sinh': student.full_name || 'N/A',
          'Email': student.email || 'N/A',
          'Số bài đã làm': scores.length,
          'Điểm TB': avgScore.toFixed(2)
        })
      }
    }

    return results
  }

  const reportTypes = [
    { 
      id: 'student_scores', 
      label: 'Bảng điểm học sinh', 
      description: 'Xuất danh sách điểm của học sinh theo đề thi',
      icon: Users 
    },
    { 
      id: 'exam_stats', 
      label: 'Thống kê đề thi', 
      description: 'Thống kê lượt làm, điểm TB của từng đề',
      icon: BookOpen 
    },
    { 
      id: 'class_report', 
      label: 'Báo cáo lớp học', 
      description: 'Danh sách học sinh và điểm theo lớp',
      icon: Users 
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminSidebar />

      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <FileSpreadsheet className="w-7 h-7 text-teal-600" />
              Xuất báo cáo
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Xuất dữ liệu ra file Excel/CSV
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Report Type Selection */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
                    Chọn loại báo cáo
                  </h2>
                  <div className="space-y-3">
                    {reportTypes.map((type) => {
                      const Icon = type.icon
                      return (
                        <button
                          key={type.id}
                          onClick={() => setReportType(type.id as ReportType)}
                          className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                            reportType === type.id
                              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            reportType === type.id
                              ? 'bg-teal-100 dark:bg-teal-900/50'
                              : 'bg-slate-100 dark:bg-slate-700'
                          }`}>
                            <Icon className={`w-5 h-5 ${
                              reportType === type.id
                                ? 'text-teal-600 dark:text-teal-400'
                                : 'text-slate-500'
                            }`} />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-800 dark:text-white">
                              {type.label}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {type.description}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Filter className="w-5 h-5" />
                    Bộ lọc
                  </h2>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Exam Filter */}
                    {reportType !== 'class_report' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Đề thi
                        </label>
                        <div className="relative">
                          <select
                            value={selectedExam}
                            onChange={(e) => setSelectedExam(e.target.value)}
                            className="w-full appearance-none px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="all">Tất cả đề thi</option>
                            {exams.map((exam) => (
                              <option key={exam.id} value={exam.id}>{exam.title}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {/* Class Filter */}
                    {reportType === 'class_report' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Lớp học
                        </label>
                        <div className="relative">
                          <select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            className="w-full appearance-none px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="all">Tất cả lớp</option>
                            {classes.map((cls) => (
                              <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {/* Date From */}
                    {reportType === 'student_scores' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Từ ngày
                          </label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Đến ngày
                          </label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Export Panel */}
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 sticky top-20">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
                    Xuất file
                  </h2>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                        Loại báo cáo:
                      </p>
                      <p className="font-medium text-slate-800 dark:text-white">
                        {reportTypes.find(r => r.id === reportType)?.label}
                      </p>
                    </div>

                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors ${
                        success
                          ? 'bg-green-500 text-white'
                          : 'bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white'
                      }`}
                    >
                      {exporting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Đang xuất...
                        </>
                      ) : success ? (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Đã tải xuống!
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Xuất CSV
                        </>
                      )}
                    </button>

                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                      File CSV có thể mở bằng Excel, Google Sheets
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
