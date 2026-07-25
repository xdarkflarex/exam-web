'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import { ArrowRight, BookOpen, BrainCircuit, ClipboardList, Loader2, LockKeyhole, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MathContent, { MathProvider } from '@/components/MathContent'
import { getBlockStyle } from '@/lib/theories/block-style'
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
interface Progress { answered: number; total: number; assignments: number }
interface AssignmentInfo { id: string; homework_id: string; title: string | null; deadline: string | null; homeworkTitle: string }

export default function LearnPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLElement>(null)
  const [theories, setTheories] = useState<TheoryRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [assignmentsByTheory, setAssignmentsByTheory] = useState<Map<string, AssignmentInfo[]>>(new Map())
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
        const { data: profile } = await supabase.from('profiles').select('class_id').eq('id', user.id).maybeSingle()
        const filter = profile?.class_id ? `student_id.eq.${user.id},class_id.eq.${profile.class_id}` : `student_id.eq.${user.id}`
        const { data: recipients } = await supabase.from('homework_assignment_recipients').select('assignment_id').or(filter)
        const assignmentIds = [...new Set((recipients || []).map(row => row.assignment_id))]
        if (assignmentIds.length) {
          const { data: assignmentRows } = await supabase.from('homework_assignments')
            .select('id, homework_id, title, deadline, homeworks!inner(title, is_published)')
            .in('id', assignmentIds).eq('status', 'published').eq('homeworks.is_published', true)
          const active = assignmentRows || []
          const homeworkIds = [...new Set(active.map(row => row.homework_id))]
          const [targetsRes, questionsRes, attemptsRes] = await Promise.all([
            supabase.from('homework_knowledge_targets').select('homework_id, theory_id').in('homework_id', homeworkIds),
            supabase.rpc('get_my_homework_question_metadata'),
            supabase.from('homework_attempts').select('id, assignment_id').eq('student_id', user.id).in('assignment_id', assignmentIds),
          ])
          const attempts = attemptsRes.data || []
          const attemptIds = new Set(attempts.map(row => row.id))
          const { data: answerMetadata } = attempts.length
            ? await supabase.rpc('get_my_homework_answer_metadata')
            : { data: [] }
          const answers = ((answerMetadata || []) as Array<{ attempt_id: string; question_id: string }>)
            .filter(row => attemptIds.has(row.attempt_id))
          const theoriesByHomework = new Map<string, Set<string>>()
          for (const row of targetsRes.data || []) {
            const set = theoriesByHomework.get(row.homework_id) || new Set<string>()
            set.add(row.theory_id)
            theoriesByHomework.set(row.homework_id, set)
          }
          const questionsByHomework = new Map<string, Set<string>>()
          for (const row of questionsRes.data || []) {
            const set = questionsByHomework.get(row.homework_id) || new Set<string>()
            set.add(row.question_id)
            questionsByHomework.set(row.homework_id, set)
          }
          const attemptByAssignment = new Map(attempts.map(row => [row.assignment_id, row.id]))
          const answeredByAttempt = new Map<string, Set<string>>()
          for (const row of answers || []) {
            const set = answeredByAttempt.get(row.attempt_id) || new Set<string>()
            set.add(row.question_id)
            answeredByAttempt.set(row.attempt_id, set)
          }
          const progressMap = new Map<string, Progress>()
          const assignmentMap = new Map<string, AssignmentInfo[]>()
          for (const assignment of active) {
            const theoryIds = theoriesByHomework.get(assignment.homework_id) || new Set<string>()
            const questionIds = questionsByHomework.get(assignment.homework_id) || new Set<string>()
            const attemptId = attemptByAssignment.get(assignment.id)
            const answeredIds = attemptId ? answeredByAttempt.get(attemptId) || new Set<string>() : new Set<string>()
            const answeredCount = [...questionIds].filter(id => answeredIds.has(id)).length
            for (const theoryId of theoryIds) {
              const current = progressMap.get(theoryId) || { answered: 0, total: 0, assignments: 0 }
              progressMap.set(theoryId, { answered: current.answered + answeredCount, total: current.total + questionIds.size, assignments: current.assignments + 1 })
              const homework = assignment.homeworks as unknown as { title: string }
              assignmentMap.set(theoryId, [...(assignmentMap.get(theoryId) || []), {
                id: assignment.id, homework_id: assignment.homework_id, title: assignment.title,
                deadline: assignment.deadline, homeworkTitle: homework.title,
              }])
            }
          }
          setProgress(progressMap)
          setAssignmentsByTheory(assignmentMap)
        }
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
  const percent = useCallback((id: string) => {
    const value = progress.get(id)
    return value?.total ? Math.round(value.answered / value.total * 100) : null
  }, [progress])
  const unlocked = useCallback((id: string) => (incoming.get(id) || []).every(prerequisiteId => {
    const prerequisite = progress.get(prerequisiteId)
    return !prerequisite?.total || (percent(prerequisiteId) || 0) >= 80
  }), [incoming, percent, progress])
  const groups = useMemo(() => [...new Set(theories.map(groupOf))].sort(), [groupOf, theories])
  const items = useMemo<SkillTreeItem[]>(() => theories
    .filter(theory => (!group || groupOf(theory) === group) && (!query.trim() || theory.title.toLowerCase().includes(query.trim().toLowerCase())))
    .map(theory => {
      const value = progress.get(theory.id)
      const valuePercent = percent(theory.id)
      return {
        id: theory.id, title: theory.title, group: groupOf(theory), difficulty: theory.difficulty_level,
        progress: valuePercent, answered: value?.answered || 0, total: value?.total || 0, assignmentCount: value?.assignments || 0,
        status: !unlocked(theory.id) ? 'locked' : valuePercent === null ? 'no_homework' : valuePercent >= 80 ? 'completed' : valuePercent > 0 ? 'in_progress' : 'available',
      }
    }), [group, groupOf, percent, progress, query, theories, unlocked])
  const visible = useMemo(() => new Set(items.map(item => item.id)), [items])
  const links = useMemo<SkillTreeLink[]>(() => edges.filter(edge => visible.has(edge.from_theory_id) && visible.has(edge.to_theory_id)).map(edge => ({
    source: edge.from_theory_id, target: edge.to_theory_id, relation: edge.relation_type,
  })), [edges, visible])

  const selectTheory = useCallback((id: string) => {
    router.push(`/learn?theory=${id}`, { scroll: false })
  }, [router])

  const expandedId = selectedId
  const expandedBlocks = expandedId ? blockCache.get(expandedId) || [] : []
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

  return (
    <MathProvider>
      <div className="space-y-4">
        <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 p-5 text-white shadow-xl sm:p-7">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-300"><BrainCircuit className="h-5 w-5" />Skill tree Toán học</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Tri thức và bài tập</h1>
          <p className="mt-2 text-sm text-slate-300">Đọc bài và làm homework ngay trong một workspace.</p>
        </header>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm bài học..." className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm dark:bg-slate-900" /></label>
          <select value={group} onChange={event => { setGroup(event.target.value); void preloadGroup(event.target.value) }} className="rounded-xl border bg-white px-4 py-2.5 text-sm dark:bg-slate-900"><option value="">Tất cả chuyên đề</option>{groups.map(name => <option key={name}>{name}</option>)}</select>
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
                {!unlocked(selectedTheory.id) && <p className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100"><LockKeyhole className="h-4 w-4" />Đạt 80% ở bài tiên quyết để mở khóa.</p>}
              </aside>
            </>
          )}
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500"><BookOpen className="h-4 w-4" />Node chỉ hiển thị tiến độ homework được giao; không có homework thì không khóa bài tiếp theo.</p>
      </div>
    </MathProvider>
  )
}
