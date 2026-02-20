'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, Search, Filter, UserCheck, UserX, Shield, GraduationCap,
  Mail, Calendar, MoreVertical, ChevronDown, Eye, Trash2, RefreshCw, AlertCircle,
  Pencil, X, Save, Loader2, CheckCircle, School, Clock, Hash
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'

interface UserProfile {
  id: string
  full_name: string | null
  email: string | null
  role: 'admin' | 'teacher' | 'student'
  class_id: string | null
  school: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  // Stats
  exam_attempts_count?: number
}

export default function AdminUsersPage() {
  const supabase = createClient()
  
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      // Fetch profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        const userMessage = logger.supabaseError('fetch profiles', error, { operation: 'fetchUsers' })
        setErrorMessage(userMessage)
        setLoading(false)
        return
      }

      logger.debug('Fetched profiles', { count: profiles?.length || 0 })

      // Get exam attempt counts for each user
      const userIds = profiles?.map(p => p.id) || []
      
      if (userIds.length > 0) {
        const { data: attempts } = await supabase
          .from('exam_attempts')
          .select('student_id')
          .in('student_id', userIds)

        // Count attempts per user
        const attemptCounts: Record<string, number> = {}
        for (const attempt of attempts || []) {
          attemptCounts[attempt.student_id] = (attemptCounts[attempt.student_id] || 0) + 1
        }

        // Merge with profiles
        const usersWithStats = profiles?.map(p => ({
          ...p,
          exam_attempts_count: attemptCounts[p.id] || 0
        })) || []

        setUsers(usersWithStats)
      } else {
        setUsers(profiles || [])
      }
    } catch (err) {
      logger.error('Unexpected error fetching users', err)
      setErrorMessage('Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.')
    }
    setLoading(false)
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRole = !roleFilter || user.role === roleFilter
    
    return matchesSearch && matchesRole
  })

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin' || u.role === 'teacher').length,
    students: users.filter(u => u.role === 'student').length
  }

  // Debug log to check fetched data
  useEffect(() => {
    if (users.length > 0) {
      logger.debug('Users loaded', { count: users.length })
    }
  }, [users])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const handleViewDetail = (user: UserProfile) => {
    setSelectedUser(user)
    setShowDetailModal(true)
  }

  return (
    <div className="min-h-screen">
      <AdminHeader 
        title="Quản lý tài khoản" 
        subtitle={`${users.length} tài khoản trong hệ thống`} 
      />
      
      <div className="p-6">
        {/* Error Message */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Không thể tải danh sách</p>
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
            <button
              onClick={fetchUsers}
              className="ml-auto px-3 py-1.5 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tổng tài khoản</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.admins}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Quản trị viên</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.students}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Học sinh</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên hoặc email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
            >
              <option value="">Tất cả vai trò</option>
              <option value="admin">Quản trị viên</option>
              <option value="teacher">Giáo viên</option>
              <option value="student">Học sinh</option>
            </select>
            <button
              onClick={fetchUsers}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Làm mới
            </button>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 dark:text-slate-400">Đang tải danh sách...</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Không tìm thấy tài khoản
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Người dùng</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Vai trò</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Lượt làm bài</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Ngày tạo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-100 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-medium">
                          {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{user.full_name || 'Chưa đặt tên'}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' 
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {user.role === 'admin' ? (
                          <><Shield className="w-3 h-3" /> Admin</>
                        ) : (
                          <><GraduationCap className="w-3 h-3" /> Học sinh</>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {user.exam_attempts_count || 0} lượt
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {formatDate(user.created_at)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewDetail(user)}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                        title="Xem chi tiết"
                      >
                        <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setShowDetailModal(false)}
          onSave={() => fetchUsers()}
          formatDate={formatDate}
        />
      )}
    </div>
  )
}

function UserDetailModal({
  user,
  onClose,
  onSave,
  formatDate
}: {
  user: UserProfile
  onClose: () => void
  onSave: () => void
  formatDate: (date: string) => string
}) {
  const supabase = createClient()
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Edit form state
  const [editName, setEditName] = useState(user.full_name || '')
  const [editSchool, setEditSchool] = useState(user.school || '')
  const [editRole, setEditRole] = useState<string>(user.role)
  const [editClassId, setEditClassId] = useState(user.class_id || '')

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName.trim() || null,
          school: editSchool.trim() || null,
          role: editRole,
          class_id: editClassId.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) {
        logger.supabaseError('update profile', error)
        setSaveError('Không thể cập nhật thông tin. Vui lòng thử lại.')
        setSaving(false)
        return
      }

      setSaveSuccess(true)
      setSaving(false)
      setIsEditing(false)
      onSave()

      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      logger.error('Unexpected error updating profile', err)
      setSaveError('Đã xảy ra lỗi không mong muốn.')
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditName(user.full_name || '')
    setEditSchool(user.school || '')
    setEditRole(user.role)
    setEditClassId(user.class_id || '')
    setIsEditing(false)
    setSaveError(null)
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Quản trị viên'
      case 'teacher': return 'Giáo viên'
      case 'student': return 'Học sinh'
      default: return role
    }
  }

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
      case 'teacher': return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
      case 'student': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-[slideUp_0.3s_ease-out]">
        {/* Gradient Header */}
        <div className="relative bg-gradient-to-r from-teal-500 via-teal-600 to-blue-600 px-6 pt-6 pb-16">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white/90">Thông tin tài khoản</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Avatar + Name overlay */}
        <div className="relative px-6 -mt-10 mb-4">
          <div className="flex items-end gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg border-4 border-white dark:border-slate-900 flex-shrink-0">
              {user.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-lg font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Nhập họ tên..."
                />
              ) : (
                <h3 className="text-xl font-bold text-slate-800 dark:text-white truncate">
                  {user.full_name || 'Chưa đặt tên'}
                </h3>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {saveSuccess && (
          <div className="mx-6 mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-700 dark:text-green-300">Cập nhật thành công!</span>
          </div>
        )}
        {saveError && (
          <div className="mx-6 mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm text-red-700 dark:text-red-300">{saveError}</span>
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-2 space-y-4">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Vai trò */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Vai trò</p>
              </div>
              {isEditing ? (
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-white"
                >
                  <option value="student">Học sinh</option>
                  <option value="teacher">Giáo viên</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClass(user.role)}`}>
                  {user.role === 'admin' && <Shield className="w-3 h-3" />}
                  {user.role === 'teacher' && <UserCheck className="w-3 h-3" />}
                  {user.role === 'student' && <GraduationCap className="w-3 h-3" />}
                  {getRoleLabel(user.role)}
                </span>
              )}
            </div>

            {/* Lượt làm bài */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Lượt làm bài</p>
              </div>
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                {user.exam_attempts_count || 0}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">lượt</span>
              </p>
            </div>

            {/* Trường */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <School className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Trường</p>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={editSchool}
                  onChange={(e) => setEditSchool(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-white"
                  placeholder="Nhập tên trường..."
                />
              ) : (
                <p className="font-medium text-slate-800 dark:text-white text-sm">
                  {user.school || <span className="text-slate-400 italic">Chưa cập nhật</span>}
                </p>
              )}
            </div>

            {/* Lớp */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Lớp</p>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={editClassId}
                  onChange={(e) => setEditClassId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-white"
                  placeholder="Nhập lớp..."
                />
              ) : (
                <p className="font-medium text-slate-800 dark:text-white text-sm">
                  {user.class_id || <span className="text-slate-400 italic">Chưa cập nhật</span>}
                </p>
              )}
            </div>
          </div>

          {/* Date row */}
          <div className="flex items-center gap-6 px-1">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>Ngày tạo: <span className="text-slate-700 dark:text-slate-300 font-medium">{formatDate(user.created_at)}</span></span>
            </div>
            {user.updated_at && user.updated_at !== user.created_at && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Clock className="w-4 h-4" />
                <span>Cập nhật: <span className="text-slate-700 dark:text-slate-300 font-medium">{formatDate(user.updated_at)}</span></span>
              </div>
            )}
          </div>

          {/* ID */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3.5 py-2.5 border border-slate-100 dark:border-slate-700/50">
            <p className="text-xs text-slate-400 mb-0.5">ID tài khoản</p>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all select-all">
              {user.id}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 mt-2 border-t border-slate-200 dark:border-slate-700">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-600/50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Lưu thay đổi
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                Đóng
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Chỉnh sửa
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
