'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, Search, Filter, UserCheck, UserX, Shield, GraduationCap,
  Mail, Calendar, MoreVertical, ChevronDown, Eye, Trash2, RefreshCw
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'

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

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      // Fetch profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching users:', error)
        setLoading(false)
        return
      }

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
      console.error('Error:', err)
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
      console.log('Fetched users:', users.map(u => ({ name: u.full_name, role: u.role })))
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
          formatDate={formatDate}
        />
      )}
    </div>
  )
}

function UserDetailModal({
  user,
  onClose,
  formatDate
}: {
  user: UserProfile
  onClose: () => void
  formatDate: (date: string) => string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-slate-50 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold">
              {user.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                {user.full_name || 'Chưa đặt tên'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Vai trò</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {user.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}
              </p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Lượt làm bài</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {user.exam_attempts_count || 0} lượt
              </p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ngày tạo</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {formatDate(user.created_at)}
              </p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Trường</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {user.school || 'Chưa cập nhật'}
              </p>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">ID tài khoản</p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
              {user.id}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
