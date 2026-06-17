'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Search, Box, Square, Network } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import KnowledgeGraph, { type GraphNode, type GraphLink } from '@/components/theories/KnowledgeGraph'
import { RELATION_STYLES } from '@/lib/theories/block-style'
import type { EdgeRelationType } from '@/types/theories'

interface TheoryRow {
  id: string
  title: string
  difficulty_level: number
  section_id: string
  sections?: {
    name: string
    categories?: { name: string }
  }
}

interface EdgeRow {
  from_theory_id: string
  to_theory_id: string
  relation_type: EdgeRelationType
}

export default function KnowledgeGraphPage() {
  const router = useRouter()
  const [theories, setTheories] = useState<TheoryRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const [{ data: theoryData }, { data: edgeData }] = await Promise.all([
        supabase
          .from('theories')
          .select('id, title, difficulty_level, section_id, sections(name, categories(name))')
          .eq('is_published', true),
        supabase
          .from('theory_edges')
          .select('from_theory_id, to_theory_id, relation_type'),
      ])
      setTheories((theoryData || []) as unknown as TheoryRow[])
      setEdges((edgeData || []) as EdgeRow[])
      setLoading(false)
    }
    load()
  }, [])

  const { nodes, links } = useMemo(() => {
    const idSet = new Set(theories.map((t) => t.id))
    // Đếm bậc để chỉnh kích thước node
    const degree = new Map<string, number>()
    for (const e of edges) {
      if (idSet.has(e.from_theory_id)) degree.set(e.from_theory_id, (degree.get(e.from_theory_id) || 0) + 1)
      if (idSet.has(e.to_theory_id)) degree.set(e.to_theory_id, (degree.get(e.to_theory_id) || 0) + 1)
    }
    const q = query.trim().toLowerCase()
    const nodes: GraphNode[] = theories.map((t) => {
      const group = t.sections?.categories?.name || t.sections?.name || 'Khác'
      const dim = q.length > 0 && !t.title.toLowerCase().includes(q)
      return {
        id: t.id,
        label: t.title,
        group,
        difficulty: t.difficulty_level,
        val: 4 + Math.min(degree.get(t.id) || 0, 8),
        color: dim ? '#cbd5e1' : undefined,
      }
    })
    const links: GraphLink[] = edges
      .filter((e) => idSet.has(e.from_theory_id) && idSet.has(e.to_theory_id))
      .map((e) => ({
        source: e.from_theory_id,
        target: e.to_theory_id,
        relation: e.relation_type,
      }))
    return { nodes, links }
  }, [theories, edges, query])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white font-baloo flex items-center gap-2">
            <Network className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Đồ thị tri thức
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {nodes.length} bài • {links.length} liên kết — click vào node để mở bài
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm bài..."
              className="pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 w-40"
            />
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setMode('2d')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                mode === '2d'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Square className="w-4 h-4" /> 2D
            </button>
            <button
              onClick={() => setMode('3d')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                mode === '3d'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Box className="w-4 h-4" /> 3D
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-slate-500 dark:text-slate-400">
        {(Object.keys(RELATION_STYLES) as EdgeRelationType[]).map((rel) => (
          <span key={rel} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-5 h-0.5"
              style={{
                backgroundColor: RELATION_STYLES[rel].color,
                borderTop: RELATION_STYLES[rel].dashed ? `2px dashed ${RELATION_STYLES[rel].color}` : undefined,
              }}
            />
            {RELATION_STYLES[rel].label}
          </span>
        ))}
      </div>

      {/* Graph canvas */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden h-[70vh]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-teal-600 dark:text-teal-400 animate-spin" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            Chưa có bài lý thuyết nào được xuất bản.
          </div>
        ) : (
          <KnowledgeGraph
            nodes={nodes}
            links={links}
            mode={mode}
            onNodeClick={(n) => router.push(`/learn/theories/${n.id}`)}
          />
        )}
      </div>
    </div>
  )
}
