'use client'

import { useState, useEffect } from 'react'
import { AdminHeader } from '@/components/admin'
import {
  getLatexTemplates,
  createLatexTemplate,
  updateLatexTemplate,
  deleteLatexTemplate,
} from '@/lib/theories/actions'
import {
  FileCode, Plus, Save, Trash2, Edit3, X, Star, Eye, Code
} from 'lucide-react'
import type { LatexTemplate, LatexTemplateFormData } from '@/types/theories'

export default function LatexTemplatesPage() {
  const [templates, setTemplates] = useState<LatexTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTemplate, setFormTemplate] = useState('')
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await getLatexTemplates()
      setTemplates(data)
    } catch (err) {
      console.error('Error fetching templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormTemplate('')
    setFormIsDefault(false)
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (template: LatexTemplate) => {
    setEditingId(template.id)
    setFormName(template.name)
    setFormDescription(template.description || '')
    setFormTemplate(template.template_text)
    setFormIsDefault(template.is_default)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tên template' })
      return
    }
    if (!formTemplate.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập nội dung template' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      const formData: LatexTemplateFormData = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        template_text: formTemplate,
        is_default: formIsDefault,
      }

      if (editingId) {
        await updateLatexTemplate(editingId, formData)
        setMessage({ type: 'success', text: 'Đã cập nhật template!' })
      } else {
        await createLatexTemplate(formData)
        setMessage({ type: 'success', text: 'Đã tạo template mới!' })
      }

      resetForm()
      await fetchTemplates()
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi lưu template' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteLatexTemplate(id)
      setTemplates(templates.filter(t => t.id !== id))
      setShowDeleteConfirm(null)
      setMessage({ type: 'success', text: 'Đã xóa template!' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi xóa' })
    }
  }

  return (
    <>
      <AdminHeader title="Quản lý Template LaTeX" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Template LaTeX
            </h2>
            {!showForm && (
              <button
                onClick={() => {
                  resetForm()
                  setShowForm(true)
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Tạo template
              </button>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
            }`}>
              {message.text}
            </div>
          )}

          {/* Inline Form */}
          {showForm && (
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {editingId ? 'Chỉnh sửa template' : 'Tạo template mới'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tên template</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="VD: Template chuẩn A4..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Mô tả</label>
                    <input
                      type="text"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Mô tả ngắn..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nội dung template</label>
                  <textarea
                    value={formTemplate}
                    onChange={(e) => setFormTemplate(e.target.value)}
                    rows={12}
                    placeholder="\\documentclass{article}&#10;\\begin{document}&#10;{{content}}&#10;\\end{document}"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors resize-y font-mono"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Sử dụng placeholder: {'{{title}}'}, {'{{content}}'}, {'{{section_name}}'}, {'{{date}}'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setFormIsDefault(!formIsDefault)}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        formIsDefault ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          formIsDefault ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">Template mặc định</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {editingId ? 'Cập nhật' : 'Tạo mới'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Templates List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Đang tải...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16">
              <Code className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400">Chưa có template nào</p>
              <button
                onClick={() => {
                  resetForm()
                  setShowForm(true)
                }}
                className="text-teal-600 dark:text-teal-400 text-sm hover:underline mt-2"
              >
                Tạo template đầu tiên →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(template => (
                <div key={template.id}>
                  <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                            {template.name}
                          </h3>
                          {template.is_default && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              <Star className="w-3 h-3 fill-current" />
                              Mặc định
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            {template.description}
                          </p>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Cập nhật: {new Date(template.updated_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setPreviewId(previewId === template.id ? null : template.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            previewId === template.id
                              ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                          title="Xem trước"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(template.id)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Preview area */}
                    {previewId === template.id && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <pre className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                          {template.template_text}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Delete Confirmation */}
                  {showDeleteConfirm === template.id && (
                    <div className="mt-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center justify-between">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Xóa template <strong>&quot;{template.name}&quot;</strong>?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
