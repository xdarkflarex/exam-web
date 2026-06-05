'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Star,
  Layers,
  FolderOpen,
  FileText,
  Loader2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Theory } from '@/types/theories'

/* ------------------------------------------------------------------ */
/*  Types for taxonomy data                                            */
/* ------------------------------------------------------------------ */
interface Topic {
  id: string
  name: string
  order_index: number
}
interface Category {
  id: string
  name: string
  topic_id: string
  order_index: number
}
interface Section {
  id: string
  name: string
  category_id: string
  topic_id: string
  order_index: number
}

/* ------------------------------------------------------------------ */
/*  Difficulty stars helper                                            */
/* ------------------------------------------------------------------ */
function DifficultyStars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i <= level
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-300 dark:text-slate-600'
          }`}
        />
      ))}
    </div>
  )
}

/* ================================================================== */
/*  MAIN PAGE COMPONENT                                                */
/* ================================================================== */
export default function LearnPage() {
  /* ---- data state ---- */
  const [topics, setTopics] = useState<Topic[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [theories, setTheories] = useState<Theory[]>([])
  const [loading, setLoading] = useState(true)

  /* ---- UI state ---- */
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  /* ---- selected section (via query param or click) ---- */
  const searchParams = useSearchParams()
  const sectionIdFromUrl = searchParams.get('section')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  // Sync URL param → state
  useEffect(() => {
    if (sectionIdFromUrl) setSelectedSectionId(sectionIdFromUrl)
  }, [sectionIdFromUrl])

  /* ---------------------------------------------------------------- */
  /*  Fetch data                                                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const supabase = createClient()
        const [topicsRes, categoriesRes, sectionsRes, theoriesRes] = await Promise.all([
          supabase.from('topics').select('*').order('order_index'),
          supabase.from('categories').select('*').order('order_index'),
          supabase.from('sections').select('*').order('order_index'),
          supabase
            .from('theories')
            .select('*')
            .eq('is_published', true)
            .order('order_index'),
        ])
        setTopics(topicsRes.data || [])
        setCategories(categoriesRes.data || [])
        setSections(sectionsRes.data || [])
        setTheories(theoriesRes.data || [])
      } catch (err) {
        console.error('Failed to load data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Computed maps                                                     */
  /* ---------------------------------------------------------------- */
  const theoriesBySectionId = useMemo(() => {
    const map: Record<string, Theory[]> = {}
    for (const t of theories) {
      if (!map[t.section_id]) map[t.section_id] = []
      map[t.section_id].push(t)
    }
    return map
  }, [theories])

  const categoriesByTopicId = useMemo(() => {
    const map: Record<string, Category[]> = {}
    for (const c of categories) {
      if (!map[c.topic_id]) map[c.topic_id] = []
      map[c.topic_id].push(c)
    }
    return map
  }, [categories])

  const sectionsByCategoryId = useMemo(() => {
    const map: Record<string, Section[]> = {}
    for (const s of sections) {
      if (!map[s.category_id]) map[s.category_id] = []
      map[s.category_id].push(s)
    }
    return map
  }, [sections])

  /* ---- filtered theories (search) ---- */
  const filteredTheories = useMemo(() => {
    if (!searchQuery.trim()) return theories
    const q = searchQuery.toLowerCase()
    return theories.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    )
  }, [theories, searchQuery])

  /* ---- theories for the selected section ---- */
  const selectedSectionTheories = useMemo(() => {
    if (!selectedSectionId) return []
    return theoriesBySectionId[selectedSectionId] || []
  }, [selectedSectionId, theoriesBySectionId])

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId),
    [sections, selectedSectionId]
  )

  /* ---- auto-expand parent of selected section ---- */
  useEffect(() => {
    if (selectedSection) {
      setExpandedTopics((prev) => new Set(prev).add(selectedSection.topic_id))
      setExpandedCategories((prev) => new Set(prev).add(selectedSection.category_id))
    }
  }, [selectedSection])

  /* ---------------------------------------------------------------- */
  /*  Toggle helpers                                                    */
  /* ---------------------------------------------------------------- */
  const toggleTopic = useCallback((id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                            */
  /* ---------------------------------------------------------------- */

  /* --- Loading skeleton --- */
  if (loading) {
    return (
      <div>
        {/* Header skeleton */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-600 to-emerald-600 p-6 sm:p-10 mb-8">
          <div className="animate-pulse space-y-3">
            <div className="h-8 w-48 bg-white/20 rounded-lg" />
            <div className="h-5 w-72 bg-white/15 rounded-lg" />
          </div>
        </div>
        {/* Body skeleton */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse"
            >
              <div className="h-5 w-56 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
              <div className="h-4 w-40 bg-slate-100 dark:bg-slate-700/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isSearching = searchQuery.trim().length > 0

  return (
    <div>
      {/* ============================================================ */}
      {/*  GRADIENT HEADER                                              */}
      {/* ============================================================ */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-600 to-emerald-600 p-6 sm:p-10 mb-8">
        {/* decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-baloo">
                Kiến thức
              </h1>
            </div>
            <p className="text-teal-100 text-sm sm:text-base">
              Khám phá lý thuyết theo chủ đề
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-white/80 text-sm">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              {topics.length} chủ đề
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              {theories.length} bài lý thuyết
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  SEARCH BAR                                                   */}
      {/* ============================================================ */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Tìm kiếm bài lý thuyết..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/*  SEARCH RESULTS (when searching)                              */}
      {/* ============================================================ */}
      {isSearching && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
            Tìm thấy {filteredTheories.length} kết quả
          </h2>
          {filteredTheories.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
              <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                Không tìm thấy bài lý thuyết nào phù hợp
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTheories.map((theory) => (
                <TheoryListItem key={theory.id} theory={theory} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/*  MAIN CONTENT: Two-column on large screens                    */}
      {/* ============================================================ */}
      {!isSearching && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* --- LEFT: Taxonomy tree --- */}
          <div className={`${selectedSectionId ? 'lg:w-[340px] lg:flex-shrink-0' : 'w-full'}`}>
            <div className="space-y-3">
              {topics.map((topic) => {
                const topicCategories = categoriesByTopicId[topic.id] || []
                const isExpanded = expandedTopics.has(topic.id)
                // Count total theories in this topic
                const topicTheoryCount = topicCategories.reduce((acc, cat) => {
                  const catSections = sectionsByCategoryId[cat.id] || []
                  return (
                    acc +
                    catSections.reduce(
                      (s, sec) => s + (theoriesBySectionId[sec.id]?.length || 0),
                      0
                    )
                  )
                }, 0)

                return (
                  <div
                    key={topic.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                  >
                    {/* Topic header */}
                    <button
                      onClick={() => toggleTopic(topic.id)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                        <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 dark:text-white text-sm truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                          {topic.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {topicCategories.length} danh mục · {topicTheoryCount} bài
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Categories */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-700/50">
                        {topicCategories.map((cat) => {
                          const catSections = sectionsByCategoryId[cat.id] || []
                          const isCatExpanded = expandedCategories.has(cat.id)
                          const catTheoryCount = catSections.reduce(
                            (s, sec) => s + (theoriesBySectionId[sec.id]?.length || 0),
                            0
                          )

                          return (
                            <div key={cat.id}>
                              {/* Category header */}
                              <button
                                onClick={() => toggleCategory(cat.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 pl-8 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
                              >
                                <FolderOpen className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate block">
                                    {cat.name}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">
                                  {catTheoryCount}
                                </span>
                                {isCatExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                )}
                              </button>

                              {/* Sections */}
                              {isCatExpanded && (
                                <div className="pb-1">
                                  {catSections.map((sec) => {
                                    const count =
                                      theoriesBySectionId[sec.id]?.length || 0
                                    const isSelected = selectedSectionId === sec.id

                                    return (
                                      <button
                                        key={sec.id}
                                        onClick={() => setSelectedSectionId(sec.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 pl-14 text-left transition-colors group ${
                                          isSelected
                                            ? 'bg-teal-50 dark:bg-teal-900/20 border-r-2 border-teal-500'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                                        }`}
                                      >
                                        <FileText
                                          className={`w-3.5 h-3.5 flex-shrink-0 ${
                                            isSelected
                                              ? 'text-teal-600 dark:text-teal-400'
                                              : 'text-slate-400 dark:text-slate-500'
                                          }`}
                                        />
                                        <span
                                          className={`text-sm flex-1 min-w-0 truncate ${
                                            isSelected
                                              ? 'font-medium text-teal-700 dark:text-teal-300'
                                              : 'text-slate-600 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400'
                                          }`}
                                        >
                                          {sec.name}
                                        </span>
                                        <span
                                          className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                            isSelected
                                              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400'
                                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                          }`}
                                        >
                                          {count}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {topics.length === 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                  <Layers className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    Chưa có chủ đề nào
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* --- RIGHT: Selected section theories --- */}
          {selectedSectionId && (
            <div className="flex-1 min-w-0">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                {/* Section heading */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-white">
                      {selectedSection?.name || 'Phần'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {selectedSectionTheories.length} bài lý thuyết
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedSectionId(null)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 lg:hidden"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Theory list */}
                {selectedSectionTheories.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      Chưa có bài lý thuyết nào trong phần này
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {selectedSectionTheories.map((theory) => (
                      <TheoryListItem key={theory.id} theory={theory} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prompt when no section is selected */}
          {!selectedSectionId && (
            <div className="hidden lg:flex flex-1 items-center justify-center">
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-400 dark:text-slate-500 mb-1">
                  Chọn một phần
                </h3>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Chọn phần ở bên trái để xem danh sách bài lý thuyết
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Theory list item                                                   */
/* ================================================================== */
function TheoryListItem({ theory }: { theory: Theory }) {
  return (
    <Link
      href={`/learn/theories/${theory.id}`}
      className="block px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors text-sm sm:text-base">
            {theory.title}
          </h4>
          {theory.description && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              {theory.description}
            </p>
          )}
        </div>
        <DifficultyStars level={theory.difficulty_level} />
      </div>
    </Link>
  )
}
