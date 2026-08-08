'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import { ArrowRight, BookOpen, BrainCircuit, ClipboardList, Loader2, LockKeyhole, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MathContent, { MathProvider } from '@/components/MathContent'
import { getBlockStyle } from '@/lib/theories/block-style'
import { getMasteryStatusLabel, isMasteryAchieved, type MasteryStat } from '@/lib/analytics/knowledge-mastery'
import { loadTheoryMastery, type TheoryAssignmentInfo, type TheoryProgress } from '@/lib/analytics/theory-mastery-data'
import type { KnowledgeBlock, KnowledgeBlockEdge } from '@/types/theories'
import type { SkillTreeBlockLink, SkillTreeItem, SkillTreeLink } from '@/components/theories/SkillTree'

const SkillTree = dynamic(() => import('@/components/theories/SkillTree'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>,
})

interface TheoryRow {
  id: string
  title: string
  description: string | null
  content_md?: string | null
  difficulty_level: number
  section_id: string
  sections?: { name: string; categories?: { name: string; topics?: { name: string } } }
}
interface EdgeRow { from_theory_id: string; to_theory_id: string; relation_type: SkillTreeLink['relation'] }

/**
 * `useSearchParams()` bắt buộc phải nằm trong ranh giới `<Suspense>` — xem chú
 * thích cùng loại ở `src/app/(auth)/login/page.tsx`. Trang này đọc query để mở
 * sẵn một chủ đề, nên `fallback` chỉ cần một khung chờ.
 */
export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      }
    >
      <LearnPageContent />
    </Suspense>
  )
}

function LearnPageContent() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLElement>(null)
  const [theories, setTheories] = useState<TheoryRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [progress, setProgress] = useState<Map<string, TheoryProgress>>(new Map())
  const [masteryByTheory, setMasteryByTheory] = useState<Map<string, MasteryStat>>(new Map())
  const [assignmentsByTheory, setAssignmentsByTheory] = useState<Map<string, TheoryAssignmentInfo[]>>(new Map())
  const [contentCache, setContentCache] = useState<Map<string, TheoryRow>>(new Map())
  const [blockCache, setBlockCache] = useState<Map<string, KnowledgeBlock[]>>(new Map())
  const [blockEdgeCache, setBlockEdgeCache] = useState<Map<string, KnowledgeBlockEdge[]>>(new Map())
  const [loadedGroups, setLoadedGroups] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const selectedId = searchParams.get('theory')
  const groupOf = useCallback((theory: TheoryRow) => theory.sections?.categories?.name || theory.sections?.name || 'Khác', [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const [theoryRes, edgeRes] = await Promise.all([
        supabase.from('theories').select('id, title, description, difficulty_level, section_id, sections(name, categories(name, topics(name)))').eq('is_published', true).order('order_index'),
        supabase.from('theory_edges').select('from_theory_id, to_theory_id, relation_type'),
      ])
      setTheories((theoryRes.data || []) as unknown as TheoryRow[])
      setEdges((edgeRes.data || []) as EdgeRow[])

      if (user) {
        // Toàn bộ việc quy gán bằng chứng nằm trong module dùng chung, để `/learn`
        // và `/student/analytics` không còn hai thang đo khác nhau.
        const data = await loadTheoryMastery(user.id)
        setProgress(data.progressByTheory)
        setMasteryByTheory(data.masteryByTheory)
        setAssignmentsByTheory(data.assignmentsByTheory)
      }
      setLoading(false)
    }
    void load()
  }, [supabase])

  const preloadGroup = useCallback(async (groupName: string) => {
    if (!groupName || loadedGroups.has(groupName)) return
    const ids = theories.filter(theory => groupOf(theory) === groupName).map(theory => theory.id)
    if (!ids.length) return
    setLoadedGroups(current => new Set(current).add(groupName))
    const [contentRes, blocksRes] = await Promise.all([
      supabase.from('theories').select('id, title, description, content_md, difficulty_level, section_id').in('id', ids),
      supabase.from('knowledge_blocks').select('*').in('theory_id', ids).order('order_index'),
    ])
    const loadedBlocks = (blocksRes.data || []) as KnowledgeBlock[]
    const blockIds = loadedBlocks.map(block => block.id)
    const { data: edgeRows } = blockIds.length
      ? await supabase.from('knowledge_block_edges').select('from_block_id, to_block_id, relation_type').in('from_block_id', blockIds).in('to_block_id', blockIds)
      : { data: [] }
    setContentCache(current => {
      const next = new Map(current)
      for (const row of (contentRes.data || []) as TheoryRow[]) next.set(row.id, row)
      return next
    })
    setBlockCache(current => {
      const next = new Map(current)
      for (const id of ids) next.set(id, [])
      for (const block of loadedBlocks) next.set(block.theory_id, [...(next.get(block.theory_id) || []), block])
      return next
    })
    setBlockEdgeCache(current => {
      const next = new Map(current)
      const theoryByBlock = new Map(loadedBlocks.map(block => [block.id, block.theory_id]))
      for (const id of ids) next.set(id, [])
      for (const edge of (edgeRows || []) as KnowledgeBlockEdge[]) {
        const fromTheoryId = theoryByBlock.get(edge.from_block_id)
        const toTheoryId = theoryByBlock.get(edge.to_block_id)
        if (!fromTheoryId || fromTheoryId !== toTheoryId) continue
        next.set(fromTheoryId, [...(next.get(fromTheoryId) || []), edge])
      }
      return next
    })
  }, [groupOf, loadedGroups, supabase, theories])

  const selectedTheory = theories.find(theory => theory.id === selectedId) || null
  useEffect(() => {
    if (!selectedTheory) return
    const timer = window.setTimeout(() => void preloadGroup(groupOf(selectedTheory)), 0)
    return () => window.clearTimeout(timer)
  }, [groupOf, preloadGroup, selectedTheory])
  useEffect(() => {
    if (!panelRef.current || !selectedId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(panelRef.current, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power2.out' })
  }, [selectedId])

  const incoming = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const edge of edges.filter(edge => edge.relation_type === 'prerequisite')) map.set(edge.to_theory_id, [...(map.get(edge.to_theory_id) || []), edge.from_theory_id])
    return map
  }, [edges])

  const titleById = useMemo(() => new Map(theories.map(theory => [theory.id, theory.title])), [theories])

  /**
   * Khóa mềm: trả về TÊN các bài tiên quyết chưa đạt, không phải cờ chặn.
   *
   * Bài tiên quyết chưa có bài tập nào thì không tính là thiếu — giáo viên chưa
   * phủ hết cây là chuyện bình thường, không nên vì thế mà cảnh báo học sinh.
   */
  const missingPrerequisitesOf = useCallback((id: string) => (incoming.get(id) || [])
    .filter(prerequisiteId => {
      const stat = masteryByTheory.get(prerequisiteId)
      if (!stat) return false
      return !isMasteryAchieved(stat.status)
    })
    .map(prerequisiteId => titleById.get(prerequisiteId) || 'Bài trước'),
  [incoming, masteryByTheory, titleById])

  const groups = useMemo(() => [...new Set(theories.map(groupOf))].sort(), [groupOf, theories])

  const matches = useCallback((theory: TheoryRow) => (
    (!group || groupOf(theory) === group)
    && (!query.trim() || theory.title.toLowerCase().includes(query.trim().toLowerCase()))
  ), [group, groupOf, query])

  /**
   * Dựng TOÀN BỘ node, kể cả node không khớp bộ lọc.
   *
   * Lọc bằng cách bỏ node khiến bố cục nhảy mỗi lần gõ phím, và học sinh không
   * bao giờ xây được bản đồ không gian của cây. Node không khớp chỉ bị làm mờ.
   */
  const items = useMemo<SkillTreeItem[]>(() => theories.map((theory): SkillTreeItem => {
    const value = progress.get(theory.id)
    const stat = masteryByTheory.get(theory.id)
    const total = value?.total || 0
    const answered = value?.answered || 0
    const completion = total > 0 ? Math.round((answered / total) * 100) : null
    const missing = missingPrerequisitesOf(theory.id)

    return {
      id: theory.id,
      title: theory.title,
      group: groupOf(theory),
      difficulty: theory.difficulty_level,
      progress: completion,
      answered,
      total,
      pending: value?.pending || 0,
      assignmentCount: value?.assignmentCount || 0,
      // Trạng thái hoạt động: chỉ nói về việc đã làm bài tới đâu.
      status: completion === null
        ? 'no_homework'
        : missing.length > 0 && answered === 0
          ? 'locked'
          : completion >= 100
            ? 'completed'
            : completion > 0
              ? 'in_progress'
              : 'available',
      mastery: stat?.status || 'no_data',
      accuracy: stat ? stat.accuracy : null,
      missingPrerequisites: missing,
      matched: matches(theory),
    }
  }), [groupOf, masteryByTheory, matches, missingPrerequisitesOf, progress, theories])

  const links = useMemo<SkillTreeLink[]>(() => edges.map(edge => ({
    source: edge.from_theory_id, target: edge.to_theory_id, relation: edge.relation_type,
  })), [edges])

  const selectTheory = useCallback((id: string) => {
    router.push(`/learn?theory=${id}`, { scroll: false })
  }, [router])

  const expandedId = selectedId
  // Memo hoá: `SkillTree` có effect đồng bộ prop này vào state, nên trả về mảng
  // mới mỗi lần render sẽ tạo vòng lặp set-state.
  const expandedBlocks = useMemo(
    () => (expandedId ? blockCache.get(expandedId) || [] : []),
    [blockCache, expandedId]
  )
  const expandedBlockLinks = useMemo<SkillTreeBlockLink[]>(() => (
    expandedId
      ? (blockEdgeCache.get(expandedId) || []).map(edge => ({
        source: edge.from_block_id,
        target: edge.to_block_id,
        relation: edge.relation_type,
      }))
      : []
  ), [blockEdgeCache, expandedId])

  const content = selectedId ? contentCache.get(selectedId) : null
  const blocks = selectedId ? blockCache.get(selectedId) || [] : []
  const selectedAssignments = selectedId ? assignmentsByTheory.get(selectedId) || [] : []
  const prerequisites = selectedId ? (incoming.get(selectedId) || []).map(id => theories.find(theory => theory.id === id)).filter(Boolean) as TheoryRow[] : []
  const selectedStat = selectedId ? masteryByTheory.get(selectedId) : undefined
  const selectedMissing = selectedId ? missingPrerequisitesOf(selectedId) : []
  const matchedCount = items.filter(item => item.matched).length
  const isFiltering = Boolean(group || query.trim())

  return (
    <MathProvider>
      <div className="space-y-4">
        <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-5 text-white shadow-xl sm:p-7">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-300"><BrainCircuit className="h-5 w-5" />Skill tree Toán học</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Tri thức và bài tập</h1>
          <p className="mt-2 text-sm text-slate-300">Đọc bài và làm homework ngay trong một workspace.</p>
        </header>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm bài học..." className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm dark:bg-slate-900" /></label>
          <select value={group} onChange={event => { setGroup(event.target.value); void preloadGroup(event.target.value) }} className="rounded-xl border bg-white px-4 py-2.5 text-sm dark:bg-slate-900"><option value="">Tất cả chuyên đề</option>{groups.map(name => <option key={name}>{name}</option>)}</select>
          {isFiltering && (
            <p className="text-xs text-slate-500" role="status">
              {matchedCount > 0
                ? `${matchedCount}/${items.length} bài khớp — các bài còn lại được làm mờ`
                : 'Không có bài nào khớp'}
            </p>
          )}
        </div>
        <div className={`grid gap-4 ${selectedTheory ? 'lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.65fr)]' : ''}`}>
          <section className="h-[76vh] min-h-[620px] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl">
            {loading ? (
              <Loader2 className="mx-auto mt-40 h-8 w-8 animate-spin text-teal-600" />
            ) : (
              <SkillTree
                items={items}
                links={links}
                selectedId={selectedId}
                expandedId={expandedId}
                expandedBlocks={expandedBlocks}
                expandedBlockLinks={expandedBlockLinks}
                onSelect={item => selectTheory(item.id)}
              />
            )}
          </section>
          {selectedTheory && (
            <>
              <button aria-label="Đóng nội dung" onClick={() => router.push('/learn', { scroll: false })} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              <aside ref={panelRef} className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-t-3xl border border-slate-700/70 bg-slate-950 p-5 text-slate-100 shadow-2xl lg:static lg:z-auto lg:max-h-[76vh] lg:rounded-2xl">
                <div className="sticky -top-5 z-10 -mx-5 mb-4 border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-300">{groupOf(selectedTheory)}</p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-white">{selectedTheory.title}</h2>
                    </div>
                    <button onClick={() => router.push('/learn', { scroll: false })} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
                  </div>
                </div>
                {selectedTheory.description && <p className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">{selectedTheory.description}</p>}
                {selectedStat && (
                  <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Năng lực của bạn ở bài này</p>
                    <p className="mt-1.5 text-lg font-black text-white">
                      {getMasteryStatusLabel(selectedStat.status)}
                      <span className="ml-2 text-sm font-semibold text-slate-400">{selectedStat.accuracy}% đúng</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Tính trên {selectedStat.answeredCount} câu đã được chấm ({selectedStat.correctCount} câu đúng).
                    </p>
                  </div>
                )}
                {prerequisites.length > 0 && <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100"><p className="mb-1 font-semibold text-amber-200">Tiên quyết</p>{prerequisites.map(item => <button key={item.id} onClick={() => selectTheory(item.id)} className="mr-2 text-amber-100 hover:underline">{item.title}</button>)}</div>}
                {!content ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div> : (
                  <div key={selectedId} className="space-y-4">
                    {content.content_md && !blocks.length && (
                      <div className="min-w-0 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <MathContent content={content.content_md} className="max-w-full text-slate-100" />
                      </div>
                    )}
                    {blocks.map(block => {
                      const style = getBlockStyle(block.block_type)
                      return (
                        <section key={block.id} className="min-w-0 overflow-hidden rounded-2xl border bg-white/[0.035] p-4 shadow-lg shadow-black/20" style={{ borderColor: style.color }}>
                          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em]" style={{ color: style.color }}>{style.icon} {style.label}</p>
                          {block.title && <h3 className="mb-3 text-lg font-black leading-snug text-white">{block.title}</h3>}
                          {block.body_md && (
                            <div className="min-w-0 max-w-full overflow-x-auto pb-1 text-slate-100 [scrollbar-width:thin]">
                              <MathContent content={block.body_md} className="max-w-full" />
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
                <div className="mt-5 border-t border-white/10 pt-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><ClipboardList className="h-4 w-4 text-teal-300" />Bài tập được giao</h3>
                  {selectedAssignments.map(assignment => (
                    <div key={assignment.id} className="mb-2 rounded-xl border border-teal-300/20 bg-teal-400/10 p-3">
                      <p className="font-medium">{assignment.title || assignment.homeworkTitle}</p>
                      <p className="text-xs text-slate-400">{assignment.deadline ? `Hạn ${new Date(assignment.deadline).toLocaleString('vi-VN')}` : 'Không hạn nộp'}</p>
                      <Link href={`/homework/prepare/${assignment.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-300">Làm bài <ArrowRight className="h-4 w-4" /></Link>
                    </div>
                  ))}
                  {!selectedAssignments.length && <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">Chưa có bài tập được giao cho bài học này.</p>}
                </div>
                {selectedMissing.length > 0 && (
                  <p className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                    <LockKeyhole className="h-4 w-4 shrink-0" />
                    <span>
                      Nên học vững {selectedMissing.join(', ')} trước. Bài này vẫn mở — bạn có thể đọc và làm ngay nếu muốn.
                    </span>
                  </p>
                )}
              </aside>
            </>
          )}
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500"><BookOpen className="h-4 w-4" />Màu và phần trăm trên node là tỷ lệ trả lời đúng ở các bài tập được giao. Bài chưa được giao bài tập vẫn đọc lý thuyết được.</p>
      </div>
    </MathProvider>
  )
}
