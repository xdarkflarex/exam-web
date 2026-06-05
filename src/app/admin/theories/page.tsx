'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import Link from 'next/link'
import {
  BookOpen, Plus, Search, Star, CheckCircle, Clock,
  Filter, ChevronDown, BookMarked
} from 'lucide-react'
import type { Theory } from '@/types/theories'

interface TheoryWithSection extends Theory {
  sections: {
    id: string
    name: string
    categories: {
      id: string
      name: string
      topics: {
        id: string
        name: string
      }
    }
  }
}

interface TaxonomyItem {
  id: string
  name: string
}

export default function TheoriesListPage() {
  const supabase = createClient()
  const [theories, setTheories] = useState<TheoryWithSection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [topicFilter, setTopicFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')

  const [topics, setTopics] = useState<TaxonomyItem[]>([])
  const [categories, setCategories] = useState<(TaxonomyItem & { topic_id: string })[]>([])
  const [sections, setSections] = useState<(TaxonomyItem & { category_id: string; topic_id: string })[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('theories')
        .select(`*, sections!inner(id, name, categories!inner(id, name, topics!inner(id, name)))`)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setTheories(data as TheoryWithSection[])
      }

      const [topicsRes, categoriesRes, sectionsRes] = await Promise.all([
        supabase.from('topics').select('id, name').order('order_index'),
        supabase.from('categories').select('id, name, topic_id').order('order_index'),
        supabase.from('sections').select('id, name, category_id, topic_id').order('order_index'),
      ])

      if (topicsRes.data) setTopics(topicsRes.data)
      if (categoriesRes.data) setCategories(categoriesRes.data)
      if (sectionsRes.data) setSections(sectionsRes.data)
    } catch (err) {
      console.error('Error fetching theories:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalCount = theories.length
  const publishedCount = theories.filter(t => t.is_published).length
  const draftCount = theories.filter(t => !t.is_published).length

  const filteredCategories = topicFilter
    ? categories.filter(c => c.topic_id === topicFilter)
    : categories

  const filteredSections = categoryFilter
    ? sections.filter(s => s.category_id === categoryFilter)
    : topicFilter
      ? sections.filter(s => s.topic_id === topicFilter)
      : sections

  const filteredTheories = theories
    .filter(t => {
      if (statusFilter === 'published') return t.is_published
      if (statusFilter === 'draft') return !t.is_published
      return true
    })
    .filter(t => {
      if (sectionFilter) return t.section_id === sectionFilter
      if (categoryFilter) return t.sections?.categories?.id === categoryFilter
      if (topicFilter) return t.sections?.categories?.topics?.id === topicFilter
      return true
    })
    .filter(t => {
      if (!searchQuery) return true
      return t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    })

  const renderStars = (level: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i < level ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
      />
    ))
  }

  return (
    <>
      <AdminHeader title="Quản lý lý thuyết" subtitle="Quản lý bài lý thuyết theo chương mục" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <button
              onClick={() => setStatusFilter('all')}
              className={`p-4 rounded-xl border transition-all text-left ${
                statusFilter === 'all'
                  ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 ring-2 ring-teal-500/30'
                  : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700'
              }`}
            >
              <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400 mb-1" />
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tổng bài</p>
            </button>
            <button
              onClick={() => setStatusFilter('published')}
              className={`p-4 rounded-xl border transition-all text-left ${
                statusFilter === 'published'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 ring-2 ring-green-500/30'
                  : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-700'
              }`}
            >
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mb-1" />
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{publishedCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Đã xuất bản</p>
            </button>
            <button
              onClick={() => setStatusFilter('draft')}
              className={`p-4 rounded-xl border transition-all text-left ${
                statusFilter === 'draft'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 ring-2 ring-amber-500/30'
                  : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700'
              }`}
            >
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-1" />
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{draftCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Bản nháp</p>
            </button>
          </div>

          {/* Search + Create */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm bài lý thuyết..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
              />
            </div>
            <Link
              href="/admin/theories/new"
              className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Tạo bài mới
            </Link>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <Filter className="w-4 h-4" />
              Lọc:
            </div>
            <select
              value={topicFilter}
              onChange={(e) => {
                setTopicFilter(e.target.value)
                setCategoryFilter('')
                setSectionFilter('')
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
            >
              <option value="">Tất cả chủ đề</option>
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                setSectionFilter('')
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
            >
              <option value="">Tất cả danh mục</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
            >
              <option value="">Tất cả chương</option>
              {filteredSections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Đang tải...</p>
            </div>
          ) : filteredTheories.length === 0 ? (
            /* Empty State */
            <div className="text-center py-16">
              <BookMarked className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400 mb-2">Chưa có bài lý thuyết nào</p>
              <Link href="/admin/theories/new" className="text-teal-600 dark:text-teal-400 text-sm hover:underline">
                Tạo bài lý thuyết đầu tiên →
              </Link>
            </div>
          ) : (
            /* Theory Cards */
            <div className="space-y-3">
              {filteredTheories.map(theory => (
                <Link
                  key={theory.id}
                  href={`/admin/theories/${theory.id}/edit`}
                  className="block bg-white dark:bg-slate-800/50 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 hover:border-teal-500/40 dark:hover:border-teal-400/40 transition-all hover:shadow-sm group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                        {theory.title}
                      </h3>
                      {theory.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                          {theory.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          theory.is_published
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}>
                          {theory.is_published ? (
                            <><CheckCircle className="w-3 h-3" /> Đã xuất bản</>
                          ) : (
                            <><Clock className="w-3 h-3" /> Bản nháp</>
                          )}
                        </span>
                        {/* Section name */}
                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                          {theory.sections?.name}
                        </span>
                        {/* Difficulty stars */}
                        <span className="flex items-center gap-0.5">
                          {renderStars(theory.difficulty_level)}
                        </span>
                        {/* Date */}
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(theory.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className="w-5 h-5 text-slate-400 -rotate-90 flex-shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
