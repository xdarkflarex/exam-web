'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Star,
  BookOpen,
  Link2,
  AlertTriangle,
  Loader2,
  List,
  Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MathContent from '@/components/MathContent'
import type { Theory } from '@/types/theories'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TheoryWithTaxonomy {
  id: string
  section_id: string
  title: string
  slug: string
  description?: string | null
  content_md?: string | null
  difficulty_level: number
  order_index: number
  is_published: boolean
  created_at: string
  updated_at: string
  sections?: {
    id: string
    name: string
    categories?: {
      id: string
      name: string
      topics?: {
        id: string
        name: string
      }
    }
  }
}

interface TheoryEdgeWithDetails {
  id: string
  from_theory_id: string
  to_theory_id: string
  relation_type: 'prerequisite' | 'related' | 'extension'
  from_theory?: { id: string; title: string; section_id: string }
  to_theory?: { id: string; title: string; section_id: string }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function DifficultyStars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i <= level
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-300 dark:text-slate-600'
          }`}
        />
      ))}
    </div>
  )
}

function DifficultyLabel({ level }: { level: number }) {
  const labels = ['', 'Cơ bản', 'Dễ', 'Trung bình', 'Khó', 'Nâng cao']
  const colors = [
    '',
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors[level] || colors[1]}`}>
      <DifficultyStars level={level} />
      {labels[level] || labels[1]}
    </span>
  )
}

/** Extract headings from markdown content for table of contents */
function extractHeadings(md: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = []
  const regex = /^(#{1,4})\s+(.+)$/gm
  let match
  while ((match = regex.exec(md)) !== null) {
    const level = match[1].length
    const text = match[2].replace(/[*_`~]/g, '').trim()
    const id = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
    headings.push({ id, text, level })
  }
  return headings
}

/* ================================================================== */
/*  MAIN PAGE COMPONENT                                                */
/* ================================================================== */
export default function TheoryReadingPage() {
  const params = useParams()
  const theoryId = params.id as string

  /* ---- State ---- */
  const [theory, setTheory] = useState<TheoryWithTaxonomy | null>(null)
  const [edges, setEdges] = useState<TheoryEdgeWithDetails[]>([])
  const [siblingTheories, setSiblingTheories] = useState<Theory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showToc, setShowToc] = useState(false)

  /* ---- Fetch theory + edges + siblings ---- */
  useEffect(() => {
    async function fetchTheory() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createClient()

        // 1. Fetch theory with taxonomy join
        const { data: theoryData, error: theoryErr } = await supabase
          .from('theories')
          .select(`
            *,
            sections!inner(
              id, name,
              categories!inner(
                id, name,
                topics!inner(id, name)
              )
            )
          `)
          .eq('id', theoryId)
          .single()

        if (theoryErr) throw theoryErr
        if (!theoryData) {
          setError('Không tìm thấy bài lý thuyết')
          return
        }
        setTheory(theoryData as TheoryWithTaxonomy)

        // 2. Fetch edges (prerequisite, related)
        const { data: edgesData } = await supabase
          .from('theory_edges')
          .select(`
            *,
            from_theory:theories!theory_edges_from_theory_id_fkey(id, title, section_id),
            to_theory:theories!theory_edges_to_theory_id_fkey(id, title, section_id)
          `)
          .or(`from_theory_id.eq.${theoryId},to_theory_id.eq.${theoryId}`)

        setEdges((edgesData || []) as TheoryEdgeWithDetails[])

        // 3. Fetch sibling theories (same section) for prev/next
        const { data: siblingsData } = await supabase
          .from('theories')
          .select('*')
          .eq('section_id', theoryData.section_id)
          .eq('is_published', true)
          .order('order_index', { ascending: true })

        setSiblingTheories((siblingsData || []) as Theory[])
      } catch (err: unknown) {
        console.error('Failed to load theory', err)
        setError('Có lỗi xảy ra khi tải bài lý thuyết')
      } finally {
        setLoading(false)
      }
    }
    if (theoryId) fetchTheory()
  }, [theoryId])

  /* ---- Compute prev/next ---- */
  const { prevTheory, nextTheory } = useMemo(() => {
    if (!theory || siblingTheories.length === 0) return { prevTheory: null, nextTheory: null }
    const idx = siblingTheories.findIndex((t) => t.id === theory.id)
    return {
      prevTheory: idx > 0 ? siblingTheories[idx - 1] : null,
      nextTheory: idx < siblingTheories.length - 1 ? siblingTheories[idx + 1] : null,
    }
  }, [theory, siblingTheories])

  /* ---- Compute prerequisite and related ---- */
  const { prerequisites, relatedTheories } = useMemo(() => {
    const prereqs: { id: string; title: string }[] = []
    const related: { id: string; title: string }[] = []

    for (const edge of edges) {
      if (edge.relation_type === 'prerequisite') {
        // prerequisite: from_theory is the prerequisite OF to_theory
        // If this theory is the to_theory, the from is its prerequisite
        if (edge.to_theory_id === theoryId && edge.from_theory) {
          prereqs.push({ id: edge.from_theory.id, title: edge.from_theory.title })
        }
      } else {
        // related or extension
        const other =
          edge.from_theory_id === theoryId ? edge.to_theory : edge.from_theory
        if (other) {
          related.push({ id: other.id, title: other.title })
        }
      }
    }
    return { prerequisites: prereqs, relatedTheories: related }
  }, [edges, theoryId])

  /* ---- Table of contents headings ---- */
  const headings = useMemo(() => {
    if (!theory?.content_md) return []
    return extractHeadings(theory.content_md)
  }, [theory?.content_md])

  /* ---- Breadcrumb data ---- */
  const breadcrumbs = useMemo(() => {
    if (!theory?.sections) return []
    const crumbs: { label: string; href?: string }[] = []
    const sec = theory.sections
    if (sec.categories?.topics) {
      crumbs.push({ label: sec.categories.topics.name })
    }
    if (sec.categories) {
      crumbs.push({ label: sec.categories.name })
    }
    crumbs.push({ label: sec.name, href: `/learn?section=${sec.id}` })
    return crumbs
  }, [theory])

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                            */
  /* ---------------------------------------------------------------- */

  /* Loading */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  /* Error / not found */
  if (error || !theory) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
            {error || 'Không tìm thấy'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Bài lý thuyết không tồn tại hoặc chưa được xuất bản
          </p>
          <Link
            href="/learn"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-8">
      {/* ============================================================ */}
      {/*  MAIN READING AREA                                            */}
      {/* ============================================================ */}
      <article className="flex-1 min-w-0">
        {/* Back link */}
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </Link>

        {/* Breadcrumb */}
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4 flex-wrap">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* Title card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white font-baloo leading-tight">
              {theory.title}
            </h1>
            <DifficultyLabel level={theory.difficulty_level} />
          </div>

          {theory.description && (
            <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base mb-4">
              {theory.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(theory.updated_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
        </div>

        {/* Prerequisites */}
        {prerequisites.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Kiến thức tiên quyết
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {prerequisites.map((p) => (
                <Link
                  key={p.id}
                  href={`/learn/theories/${p.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-700/50 text-sm text-amber-700 dark:text-amber-300 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {p.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Mobile TOC toggle */}
        {headings.length > 0 && (
          <button
            onClick={() => setShowToc(!showToc)}
            className="lg:hidden w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Mục lục ({headings.length})
            </span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showToc ? 'rotate-90' : ''}`} />
          </button>
        )}

        {/* Mobile TOC dropdown */}
        {showToc && headings.length > 0 && (
          <div className="lg:hidden bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
            <ul className="space-y-1.5">
              {headings.map((h, i) => (
                <li key={i} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                  <span className="text-sm text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer">
                    {h.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Main content */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-8 mb-6">
          {theory.content_md ? (
            <div className="prose prose-slate dark:prose-invert max-w-none 
              prose-headings:font-baloo prose-headings:text-slate-800 dark:prose-headings:text-white
              prose-p:text-slate-600 dark:prose-p:text-slate-300
              prose-a:text-teal-600 dark:prose-a:text-teal-400
              prose-strong:text-slate-800 dark:prose-strong:text-white
              prose-code:text-teal-600 dark:prose-code:text-teal-400
              prose-pre:bg-slate-50 dark:prose-pre:bg-slate-900
              prose-blockquote:border-teal-500
              prose-img:rounded-xl
              prose-li:text-slate-600 dark:prose-li:text-slate-300
            ">
              <MathContent content={theory.content_md} />
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                Nội dung đang được cập nhật
              </p>
            </div>
          )}
        </div>

        {/* Related theories */}
        {relatedTheories.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                Bài liên quan
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {relatedTheories.map((r) => (
                <Link
                  key={r.id}
                  href={`/learn/theories/${r.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Prev / Next navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {prevTheory ? (
            <Link
              href={`/learn/theories/${prevTheory.id}`}
              className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex-shrink-0 transition-colors" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Bài trước</p>
                <p className="text-sm font-medium text-slate-800 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {prevTheory.title}
                </p>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextTheory ? (
            <Link
              href={`/learn/theories/${nextTheory.id}`}
              className="flex items-center justify-end gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700 transition-colors group text-right"
            >
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">Bài tiếp theo</p>
                <p className="text-sm font-medium text-slate-800 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {nextTheory.title}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 flex-shrink-0 transition-colors" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </article>

      {/* ============================================================ */}
      {/*  SIDEBAR: Table of Contents (desktop)                         */}
      {/* ============================================================ */}
      {headings.length > 0 && (
        <aside className="hidden lg:block w-56 xl:w-64 flex-shrink-0">
          <div className="sticky top-20">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Mục lục
              </h4>
              <ul className="space-y-1.5">
                {headings.map((h, i) => (
                  <li key={i} style={{ paddingLeft: `${(h.level - 1) * 10}px` }}>
                    <span
                      className={`block text-xs leading-relaxed transition-colors cursor-pointer hover:text-teal-600 dark:hover:text-teal-400 ${
                        h.level === 1
                          ? 'font-medium text-slate-700 dark:text-slate-200'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {h.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
