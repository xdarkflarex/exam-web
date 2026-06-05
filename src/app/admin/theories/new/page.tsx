'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import MathContent, { MathProvider } from '@/components/MathContent'
import { createTheory } from '@/lib/theories/actions'
import { useRouter } from 'next/navigation'
import {
  Save, ArrowLeft, Eye, Edit3, Star, BookOpen
} from 'lucide-react'

interface TaxonomyItem {
  id: string
  name: string
  order_index: number
}

const generateSlug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export default function NewTheoryPage() {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [difficultyLevel, setDifficultyLevel] = useState(1)
  const [isPublished, setIsPublished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [topics, setTopics] = useState<TaxonomyItem[]>([])
  const [categories, setCategories] = useState<(TaxonomyItem & { topic_id: string })[]>([])
  const [sections, setSections] = useState<(TaxonomyItem & { category_id: string; topic_id: string })[]>([])

  useEffect(() => {
    fetchTaxonomy()
  }, [])

  const fetchTaxonomy = async () => {
    const [topicsRes, categoriesRes, sectionsRes] = await Promise.all([
      supabase.from('topics').select('id, name, order_index').order('order_index'),
      supabase.from('categories').select('id, name, topic_id, order_index').order('order_index'),
      supabase.from('sections').select('id, name, category_id, topic_id, order_index').order('order_index'),
    ])
    if (topicsRes.data) setTopics(topicsRes.data)
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (sectionsRes.data) setSections(sectionsRes.data)
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    setSlug(generateSlug(value))
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tiêu đề' })
      return
    }
    if (!sectionId) {
      setMessage({ type: 'error', text: 'Vui lòng chọn chương' })
      return
    }
    setSaving(true)
    setMessage(null)

    try {
      await createTheory({
        title: title.trim(),
        slug: slug || generateSlug(title),
        description: description.trim() || undefined,
        content_md: contentMd || undefined,
        section_id: sectionId,
        difficulty_level: difficultyLevel,
        is_published: isPublished,
      })
      setMessage({ type: 'success', text: 'Đã tạo bài lý thuyết thành công!' })
      setTimeout(() => router.push('/admin/theories'), 1000)
    } catch (err: any) {
      console.error('Save error:', err)
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi lưu bài lý thuyết' })
    } finally {
      setSaving(false)
    }
  }

  // Build hierarchical section options
  const sectionOptions = topics.flatMap(topic => {
    const topicCategories = categories.filter(c => c.topic_id === topic.id)
    return topicCategories.flatMap(cat => {
      const catSections = sections.filter(s => s.category_id === cat.id)
      return catSections.map(sec => ({
        id: sec.id,
        label: `${topic.name} > ${cat.name} > ${sec.name}`,
      }))
    })
  })

  return (
    <MathProvider>
      <AdminHeader title="Tạo bài lý thuyết mới" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin/theories')}
                className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Tạo bài lý thuyết mới
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/admin/theories')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Lưu bài
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

          {/* Form Fields */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 mb-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tiêu đề</label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Nhập tiêu đề bài lý thuyết..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-lg font-medium focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Chương</label>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                >
                  <option value="">-- Chọn chương --</option>
                  {sectionOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Độ khó</label>
                <div className="flex items-center gap-1 pt-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDifficultyLevel(level)}
                      className="p-0.5"
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          level <= difficultyLevel
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Trạng thái</label>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <div
                    onClick={() => setIsPublished(!isPublished)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                      isPublished ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        isPublished ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {isPublished ? 'Xuất bản' : 'Bản nháp'}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Mô tả ngắn cho bài lý thuyết..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Content Editor with Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  Nội dung (Markdown)
                </span>
              </div>
              <textarea
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                placeholder="Viết nội dung bài lý thuyết bằng Markdown...&#10;&#10;Hỗ trợ: **bold**, *italic*, # heading, - list, $math$, $$display math$$"
                className="w-full min-h-[500px] p-4 bg-transparent text-slate-800 dark:text-slate-100 outline-none resize-y font-mono text-sm leading-relaxed"
              />
            </div>

            {/* Preview */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Xem trước
                </span>
              </div>
              <div className="p-4 min-h-[500px]">
                {contentMd ? (
                  <MathContent content={contentMd} className="text-slate-800 dark:text-slate-100" />
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic text-sm">Nội dung xem trước sẽ hiện ở đây...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MathProvider>
  )
}
