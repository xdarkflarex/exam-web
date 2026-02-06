'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import AdminSidebar from '@/components/admin/AdminSidebar'
import { 
  Megaphone, Plus, Edit2, Trash2, X, Save,
  AlertCircle, Info, Bell, Sparkles, Pin, PinOff,
  Eye, EyeOff, Calendar, Link as LinkIcon, ExternalLink
} from 'lucide-react'

interface Announcement {
  id: string
  title: string
  content: string | null
  type: 'info' | 'warning' | 'update' | 'new_exam'
  link_url: string | null
  link_text: string | null
  is_active: boolean
  is_pinned: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
}

const typeConfig = {
  info: { label: 'Thông tin', icon: Info, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  warning: { label: 'Cảnh báo', icon: AlertCircle, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  update: { label: 'Cập nhật', icon: Sparkles, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  new_exam: { label: 'Đề mới', icon: Bell, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
}

export default function AnnouncementsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'info' as Announcement['type'],
    link_url: '',
    link_text: '',
    is_active: true,
    is_pinned: false,
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        logger.supabaseError('fetch announcements', error)
        return
      }

      setAnnouncements(data || [])
    } catch (err) {
      logger.error('Fetch announcements error', err)
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setForm({
      title: '',
      content: '',
      type: 'info',
      link_url: '',
      link_text: '',
      is_active: true,
      is_pinned: false,
      start_date: '',
      end_date: ''
    })
    setEditingId(null)
    setShowModal(true)
  }

  const openEditModal = (announcement: Announcement) => {
    setForm({
      title: announcement.title,
      content: announcement.content || '',
      type: announcement.type,
      link_url: announcement.link_url || '',
      link_text: announcement.link_text || '',
      is_active: announcement.is_active,
      is_pinned: announcement.is_pinned,
      start_date: announcement.start_date ? announcement.start_date.split('T')[0] : '',
      end_date: announcement.end_date ? announcement.end_date.split('T')[0] : ''
    })
    setEditingId(announcement.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim() || null,
        type: form.type,
        link_url: form.link_url.trim() || null,
        link_text: form.link_text.trim() || null,
        is_active: form.is_active,
        is_pinned: form.is_pinned,
        start_date: form.start_date || null,
        end_date: form.end_date || null
      }

      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingId)

        if (error) {
          logger.supabaseError('update announcement', error)
          return
        }
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert(payload)

        if (error) {
          logger.supabaseError('create announcement', error)
          return
        }
      }

      setShowModal(false)
      fetchAnnouncements()
    } catch (err) {
      logger.error('Save announcement error', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa thông báo này?')) return

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id)

      if (error) {
        logger.supabaseError('delete announcement', error)
        return
      }

      fetchAnnouncements()
    } catch (err) {
      logger.error('Delete announcement error', err)
    }
  }

  const toggleActive = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: !current })
        .eq('id', id)

      if (error) {
        logger.supabaseError('toggle announcement', error)
        return
      }

      fetchAnnouncements()
    } catch (err) {
      logger.error('Toggle announcement error', err)
    }
  }

  const togglePinned = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_pinned: !current })
        .eq('id', id)

      if (error) {
        logger.supabaseError('pin announcement', error)
        return
      }

      fetchAnnouncements()
    } catch (err) {
      logger.error('Pin announcement error', err)
    }
  }

  const isCurrentlyActive = (a: Announcement) => {
    if (!a.is_active) return false
    const now = new Date()
    if (a.start_date && new Date(a.start_date) > now) return false
    if (a.end_date && new Date(a.end_date) < now) return false
    return true
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminSidebar />

      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                <Megaphone className="w-7 h-7 text-teal-600" />
                Quản lý thông báo
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Đăng và quản lý thông báo trên trang chủ
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Tạo thông báo
            </button>
          </div>

          {/* Announcements List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : announcements.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Megaphone className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có thông báo</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">Tạo thông báo đầu tiên để hiển thị trên trang chủ</p>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tạo thông báo
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((a) => {
                const config = typeConfig[a.type]
                const TypeIcon = config.icon
                const active = isCurrentlyActive(a)

                return (
                  <div
                    key={a.id}
                    className={`bg-white dark:bg-slate-800 rounded-xl border ${
                      active 
                        ? 'border-teal-300 dark:border-teal-700' 
                        : 'border-slate-200 dark:border-slate-700 opacity-60'
                    } p-5 transition-opacity`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {a.is_pinned && (
                            <Pin className="w-4 h-4 text-amber-500" />
                          )}
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
                            <TypeIcon className="w-3.5 h-3.5" />
                            {config.label}
                          </span>
                          {!a.is_active && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs rounded-full">
                              Ẩn
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                          {a.title}
                        </h3>

                        {a.content && (
                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-2 line-clamp-2">
                            {a.content}
                          </p>
                        )}

                        {a.link_url && (
                          <a 
                            href={a.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            {a.link_text || a.link_url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(a.created_at).toLocaleDateString('vi-VN')}
                          </span>
                          {a.start_date && (
                            <span>Từ: {new Date(a.start_date).toLocaleDateString('vi-VN')}</span>
                          )}
                          {a.end_date && (
                            <span>Đến: {new Date(a.end_date).toLocaleDateString('vi-VN')}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePinned(a.id, a.is_pinned)}
                          className={`p-2 rounded-lg transition-colors ${
                            a.is_pinned 
                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' 
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400'
                          }`}
                          title={a.is_pinned ? 'Bỏ ghim' : 'Ghim'}
                        >
                          {a.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => toggleActive(a.id, a.is_active)}
                          className={`p-2 rounded-lg transition-colors ${
                            a.is_active 
                              ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400' 
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                          }`}
                          title={a.is_active ? 'Ẩn' : 'Hiện'}
                        >
                          {a.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openEditModal(a)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                          title="Sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                {editingId ? 'Sửa thông báo' : 'Tạo thông báo mới'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tiêu đề *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Nhập tiêu đề thông báo"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nội dung
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  placeholder="Nội dung chi tiết (tùy chọn)"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Loại thông báo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(typeConfig).map(([key, config]) => {
                    const TypeIcon = config.icon
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm({ ...form, type: key as Announcement['type'] })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                          form.type === key
                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <TypeIcon className="w-4 h-4" />
                        <span className="text-sm">{config.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Link URL
                  </label>
                  <input
                    type="url"
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Text hiển thị
                  </label>
                  <input
                    type="text"
                    value={form.link_text}
                    onChange={(e) => setForm({ ...form, link_text: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Xem thêm"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ngày bắt đầu
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ngày kết thúc
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Kích hoạt</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Ghim lên đầu</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
