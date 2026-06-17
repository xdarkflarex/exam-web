'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  UserPlus, Search, RefreshCw, Trash2, ChevronLeft, ChevronRight,
  CheckCircle, AlertCircle, Phone, Mail, GraduationCap, Calendar,
  Filter, Download, Users, MessageSquare, ExternalLink, BarChart2,
  ChevronDown, Clock, KeyRound, Copy, UserCheck, Loader2
} from 'lucide-react'
import * as XLSX from 'xlsx'

const STATUS_CONFIG = {
  new: { label: 'Mới', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  contacted: { label: 'Đã liên hệ', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  enrolled: { label: 'Đã nhập học', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  rejected: { label: 'Không tham gia', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
} as const

type Status = keyof typeof STATUS_CONFIG

interface Enrollment {
  id: string
  full_name: string
  email: string
  phone: string
  class: string
  status: Status
  parent_name: string | null
  parent_phone: string | null
  user_notes: string | null
  created_account_id: string | null
  account_created_at: string | null
  created_at: string
  updated_at: string
}

interface CreatedCredentials {
  email: string
  tempPassword: string
  fullName: string
}

const PAGE_SIZE = 10

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

interface LandingFormInfo {
  title: string
  subtitle: string
}

interface StatusCounts {
  new: number
  contacted: number
  enrolled: number
  rejected: number
}

export default function EnrollmentsPage() {
  const supabase = createClient()
  const [data, setData] = useState<Enrollment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ new: 0, contacted: 0, enrolled: 0, rejected: 0 })
  const [landingFormInfo, setLandingFormInfo] = useState<LandingFormInfo>({
    title: 'Đăng ký học ngay hôm nay',
    subtitle: 'Điền thông tin bên dưới, chúng tôi sẽ liên hệ với bạn trong 24 giờ',
  })

  // Load landing page form info
  useEffect(() => {
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'landing.enrollment_form_section')
      .single()
      .then(({ data }) => {
        if (data?.value) setLandingFormInfo(data.value as LandingFormInfo)
      })
  }, [])

  // Load total counts by status (across ALL records)
  const loadStatusCounts = useCallback(async () => {
    const counts: StatusCounts = { new: 0, contacted: 0, enrolled: 0, rejected: 0 }
    await Promise.all(
      (['new', 'contacted', 'enrolled', 'rejected'] as Status[]).map(async (s) => {
        const { count } = await supabase
          .from('enrollment_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', s)
        counts[s] = count || 0
      })
    )
    setStatusCounts(counts)
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('enrollment_registrations')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus)
      }
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      const { data: rows, count, error } = await query

      if (error) throw error
      setData(rows || [])
      setTotal(count || 0)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Không thể tải danh sách đăng ký.' })
    } finally {
      setIsLoading(false)
    }
  }, [page, search, filterStatus])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStatusCounts() }, [loadStatusCounts])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleFilterStatus = (status: Status | 'all') => {
    setFilterStatus(status)
    setPage(1)
  }

  const handleUpdateStatus = async (id: string, newStatus: Status) => {
    setUpdatingId(id)
    try {
      const { error } = await supabase
        .from('enrollment_registrations')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) throw error

      setData(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
      setMessage({ type: 'success', text: 'Đã cập nhật trạng thái.' })
      setTimeout(() => setMessage(null), 3000)
      loadStatusCounts()
    } catch {
      setMessage({ type: 'error', text: 'Lỗi khi cập nhật trạng thái.' })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleCreateAccount = async (id: string) => {
    setCreatingId(id)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Không thể tạo tài khoản.' })
        return
      }
      setCredentials({ email: json.email, tempPassword: json.tempPassword, fullName: json.fullName })
      setData(prev => prev.map(r => r.id === id
        ? { ...r, status: 'enrolled', created_account_id: 'created', account_created_at: new Date().toISOString() }
        : r))
      loadStatusCounts()
    } catch {
      setMessage({ type: 'error', text: 'Lỗi kết nối khi tạo tài khoản.' })
    } finally {
      setCreatingId(null)
    }
  }

  const handleCopyCredentials = () => {
    if (!credentials) return
    const text = `Tài khoản luyện thi\nEmail: ${credentials.email}\nMật khẩu tạm: ${credentials.tempPassword}\n(Vui lòng đổi mật khẩu sau khi đăng nhập)`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Xóa đơn đăng ký của "${name}"?`)) return
    setDeletingId(id)
    try {
      const { error } = await supabase
        .from('enrollment_registrations')
        .delete()
        .eq('id', id)

      if (error) throw error
      setData(prev => prev.filter(r => r.id !== id))
      setTotal(prev => prev - 1)
      setMessage({ type: 'success', text: 'Đã xóa đơn đăng ký.' })
      setTimeout(() => setMessage(null), 3000)
      loadStatusCounts()
    } catch {
      setMessage({ type: 'error', text: 'Lỗi khi xóa.' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleExportExcel = () => {
    if (data.length === 0) return
    const rows = data.map(r => ({
      'Tên học viên': r.full_name,
      'Email': r.email,
      'SĐT học viên': r.phone,
      'Lớp': r.class,
      'Tên phụ huynh': r.parent_name || '',
      'SĐT phụ huynh': r.parent_phone || '',
      'Ghi chú': r.user_notes || '',
      'Trạng thái': STATUS_CONFIG[r.status]?.label || r.status,
      'Ngày đăng ký': formatDate(r.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Đơn đăng ký')
    XLSX.writeFile(wb, `don-dang-ky-hoc-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalAllRecords = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  // Stats
  const statuses: Status[] = ['new', 'contacted', 'enrolled', 'rejected']

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <UserPlus className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Đơn đăng ký học
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Quản lý đơn đăng ký từ landing page
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Tải lại"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportExcel}
            disabled={data.length === 0}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
            : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Landing page form info banner */}
      <div className="mb-6 p-4 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold uppercase tracking-wide mb-0.5">Form đang hiển thị trên Landing Page</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{landingFormInfo.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{landingFormInfo.subtitle}</p>
          </div>
        </div>
        <Link
          href="/admin/landing"
          className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Chỉnh sửa form
        </Link>
      </div>

      {/* Stats — real totals from DB */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statuses.map(s => {
          const cfg = STATUS_CONFIG[s]
          const count = statusCounts[s]
          return (
            <button
              key={s}
              onClick={() => handleFilterStatus(filterStatus === s ? 'all' : s)}
              className={`rounded-xl border p-4 text-left transition-all ${
                filterStatus === s
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 hover:border-teal-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-xs text-slate-500 dark:text-slate-400">{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{count}</div>
            </button>
          )
        })}
      </div>

      {/* Total overview bar */}
      {totalAllRecords > 0 && (
        <div className="mb-6 p-3 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center gap-3">
          <BarChart2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <div className="flex-1 flex items-center gap-1 h-2.5 rounded-full overflow-hidden bg-slate-300 dark:bg-slate-700">
            {statuses.map(s => {
              const pct = (statusCounts[s] / totalAllRecords) * 100
              if (pct === 0) return null
              const colors = { new: 'bg-blue-500', contacted: 'bg-yellow-500', enrolled: 'bg-green-500', rejected: 'bg-red-500' }
              return <div key={s} className={`h-full ${colors[s]} transition-all`} style={{ width: `${pct}%` }} title={`${STATUS_CONFIG[s].label}: ${statusCounts[s]}`} />
            })}
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{totalAllRecords} tổng</span>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Tìm theo tên, email, số điện thoại..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white text-sm font-medium transition-colors"
          >
            Tìm
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <select
            value={filterStatus}
            onChange={e => handleFilterStatus(e.target.value as Status | 'all')}
            className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-teal-500"
          >
            <option value="all">Tất cả trạng thái</option>
            {statuses.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
        </div>
      </div>

      {/* Cards list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Đang tải...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700">
            <div className="w-16 h-16 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium">
              {search || filterStatus !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có đơn đăng ký nào'}
            </p>
            {(search || filterStatus !== 'all') && (
              <button onClick={() => { setSearch(''); setSearchInput(''); setFilterStatus('all'); setPage(1) }} className="text-sm text-teal-600 hover:underline">
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          data.map(row => {
            const isExpanded = expandedId === row.id
            return (
              <div key={row.id} className="bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden transition-all">
                {/* Summary row — click to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-300/50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{row.full_name}</span>
                      <StatusBadge status={row.status} />
                      <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <GraduationCap className="w-3.5 h-3.5 text-teal-500" />
                        {row.class}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{row.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{row.phone}</span>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-300 dark:border-slate-700 px-4 py-4 bg-slate-100 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      {/* Học viên */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Học viên</p>
                        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium">
                          <UserPlus className="w-4 h-4 text-teal-500 flex-shrink-0" />
                          {row.full_name}
                        </div>
                      </div>
                      {/* Email */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Email</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="break-all">{row.email}</span>
                        </div>
                      </div>
                      {/* SĐT */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Số điện thoại</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {row.phone}
                        </div>
                      </div>
                      {/* Lớp */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Lớp học</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <GraduationCap className="w-4 h-4 text-teal-500 flex-shrink-0" />
                          {row.class}
                        </div>
                      </div>
                      {/* Tên phụ huynh */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Họ tên phụ huynh</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {row.parent_name || <span className="text-slate-400 italic">— Chưa có</span>}
                        </div>
                      </div>
                      {/* SĐT phụ huynh */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">SĐT phụ huynh</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {row.parent_phone || <span className="text-slate-400 italic">— Chưa có</span>}
                        </div>
                      </div>
                      {/* Ghi chú */}
                      <div className="sm:col-span-2 lg:col-span-3">
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Ghi chú / Câu hỏi</p>
                        <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                          <MessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span>{row.user_notes || <span className="text-slate-400 italic">— Không có ghi chú</span>}</span>
                        </div>
                      </div>
                      {/* Ngày đăng ký */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Ngày đăng ký</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {formatDate(row.created_at)}
                        </div>
                      </div>
                      {/* Cập nhật lần cuối */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Cập nhật cuối</p>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {formatDate(row.updated_at)}
                        </div>
                      </div>
                      {/* Trạng thái */}
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Trạng thái</p>
                        <select
                          value={row.status}
                          onChange={e => handleUpdateStatus(row.id, e.target.value as Status)}
                          disabled={updatingId === row.id}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-teal-500 cursor-pointer disabled:opacity-50"
                        >
                          {statuses.map(s => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-300 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-mono">ID: {row.id.slice(0, 8)}...</span>
                      <div className="flex items-center gap-2">
                      {row.created_account_id ? (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 text-xs font-medium">
                          <UserCheck className="w-3.5 h-3.5" /> Đã tạo tài khoản
                        </span>
                      ) : (
                        <button
                          onClick={() => handleCreateAccount(row.id)}
                          disabled={creatingId === row.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors text-xs font-medium disabled:opacity-40"
                        >
                          {creatingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                          Tạo tài khoản
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(row.id, row.full_name)}
                        disabled={deletingId === row.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-xs font-medium disabled:opacity-40"
                      >
                        {deletingId === row.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Xóa đơn
                      </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between px-4 py-3 bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total} đơn
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Total count */}
      {!isLoading && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 text-right">
          Tổng: <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span> đơn đăng ký
        </p>
      )}

      {/* Credentials Modal */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCredentials(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Đã tạo tài khoản</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Gửi thông tin này cho <span className="font-medium">{credentials.fullName}</span>. Học sinh sẽ được yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Email đăng nhập</p>
                <p className="font-mono text-sm bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 select-all">{credentials.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Mật khẩu tạm</p>
                <p className="font-mono text-sm bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 select-all">{credentials.tempPassword}</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Mật khẩu tạm chỉ hiển thị một lần. Hãy sao chép và lưu lại ngay.
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={handleCopyCredentials}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </button>
              <button
                onClick={() => setCredentials(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
