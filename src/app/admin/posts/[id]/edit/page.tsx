'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { 
  Save, ArrowLeft, Eye, Edit3, 
  Bold, Italic, Heading1, Heading2, Link2, 
  Image, List, ListOrdered, Code, Quote, Trash2
} from 'lucide-react'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const CATEGORIES = ['Tin tức', 'Hướng dẫn', 'Toán học', 'Tin học', 'Tuyển sinh', 'Khác']

export default function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'draft' | 'review' | 'published'>('draft')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadPost()
  }, [id])

  const loadPost = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      if (data) {
        setTitle(data.title || '')
        setSlug(data.slug || '')
        setExcerpt(data.excerpt || '')
        setContent(data.content || '')
        setCoverImage(data.cover_image || '')
        setCategory(data.category || '')
        setStatus(data.status || 'draft')
      }
    } catch (err) {
      console.error('Load post error:', err)
      setMessage({ type: 'error', text: 'Không tìm thấy bài viết' })
    } finally {
      setLoading(false)
    }
  }

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.getElementById('content-editor') as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.substring(start, end)
    const newContent = content.substring(0, start) + before + selected + after + content.substring(end)
    setContent(newContent)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
    }, 0)
  }

  const toolbarActions = [
    { icon: Bold, action: () => insertMarkdown('**', '**'), title: 'Bold' },
    { icon: Italic, action: () => insertMarkdown('*', '*'), title: 'Italic' },
    { icon: Heading1, action: () => insertMarkdown('# '), title: 'Heading 1' },
    { icon: Heading2, action: () => insertMarkdown('## '), title: 'Heading 2' },
    { icon: Link2, action: () => insertMarkdown('[', '](url)'), title: 'Link' },
    { icon: Image, action: () => insertMarkdown('![alt](', ')'), title: 'Image' },
    { icon: List, action: () => insertMarkdown('- '), title: 'List' },
    { icon: ListOrdered, action: () => insertMarkdown('1. '), title: 'Ordered list' },
    { icon: Code, action: () => insertMarkdown('`', '`'), title: 'Code' },
    { icon: Quote, action: () => insertMarkdown('> '), title: 'Quote' },
  ]

  const handleSave = async () => {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tiêu đề' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      const updates: any = {
        title: title.trim(),
        slug: slug || slugify(title),
        excerpt: excerpt.trim() || null,
        content,
        cover_image: coverImage.trim() || null,
        category: category || null,
        status,
      }
      if (status === 'published') {
        updates.published_at = new Date().toISOString()
      }

      const { error } = await supabase.from('posts').update(updates).eq('id', id)
      if (error) throw error

      setMessage({ type: 'success', text: 'Đã cập nhật bài viết!' })
    } catch (err: any) {
      console.error('Save error:', err)
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi lưu' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Bạn có chắc muốn xóa bài viết này?')) return
    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (!error) {
      router.push('/admin/posts')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/posts')}
              className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Chỉnh sửa bài viết</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-2 rounded-xl text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title="Xóa bài viết"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
            >
              <option value="draft">Nháp</option>
              <option value="review">Chờ duyệt</option>
              <option value="published">Xuất bản</option>
            </select>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Lưu
            </button>
          </div>
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

        {/* Meta fields */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-5 border border-slate-300 dark:border-slate-700 mb-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tiêu đề</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề bài viết..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-lg font-medium focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Danh mục</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm outline-none"
              >
                <option value="">-- Chọn --</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ảnh bìa URL</label>
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tóm tắt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="Mô tả ngắn cho bài viết..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors resize-none"
            />
          </div>
        </div>

        {/* Markdown Editor */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50 flex-wrap">
            {toolbarActions.map((action, i) => {
              const Icon = action.icon
              return (
                <button
                  key={i}
                  onClick={action.action}
                  title={action.title}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </button>
              )
            })}
            <div className="flex-1" />
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                previewMode
                  ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {previewMode ? 'Soạn thảo' : 'Xem trước'}
            </button>
          </div>

          {/* Editor / Preview */}
          {previewMode ? (
            <div className="p-6 min-h-[400px] prose prose-slate dark:prose-invert max-w-none">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-slate-400 italic">Chưa có nội dung</p>
              )}
            </div>
          ) : (
            <textarea
              id="content-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Viết nội dung bài viết bằng Markdown..."
              className="w-full min-h-[400px] p-6 bg-transparent text-slate-800 dark:text-slate-100 outline-none resize-y font-mono text-sm leading-relaxed"
            />
          )}
        </div>
      </div>
    </div>
  )
}
