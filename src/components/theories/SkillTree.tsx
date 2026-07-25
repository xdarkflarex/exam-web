'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import gsap from 'gsap'
import { BookOpen, CheckCircle2, ClipboardList, FileText, GitBranch, LockKeyhole, Sparkles } from 'lucide-react'
import { getBlockStyle } from '@/lib/theories/block-style'
import type { BlockType } from '@/types/theories'

export type SkillNodeStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'no_homework'

export interface SkillTreeItem {
  id: string
  title: string
  group: string
  difficulty: number
  progress: number | null
  answered: number
  total: number
  assignmentCount: number
  status: SkillNodeStatus
}

export interface SkillTreeLink {
  source: string
  target: string
  relation: 'prerequisite' | 'related' | 'extension'
}

export interface SkillTreeBlock {
  id: string
  theory_id: string
  block_type: BlockType
  title?: string | null
  order_index: number
}

export interface SkillTreeBlockLink {
  source: string
  target: string
  relation: SkillTreeLink['relation']
}

interface Props {
  items: SkillTreeItem[]
  links: SkillTreeLink[]
  selectedId?: string | null
  expandedId?: string | null
  expandedBlocks?: SkillTreeBlock[]
  expandedBlockLinks?: SkillTreeBlockLink[]
  onSelect: (item: SkillTreeItem) => void
}

const LESSON_WIDTH = 248
const LESSON_HEIGHT = 104
const BLOCK_WIDTH = 244
const BLOCK_HEIGHT = 92

type BranchKey = 'foundation' | 'theorem' | 'rules' | 'method' | 'practice' | 'note'

const BRANCH_ORDER: BranchKey[] = ['foundation', 'theorem', 'rules', 'method', 'practice', 'note']

const statusTheme: Record<SkillNodeStatus, { border: string; glow: string; accent: string; icon: string; label: string }> = {
  locked: {
    border: '#64748b',
    glow: '0 0 0 1px rgba(100,116,139,.22)',
    accent: '#64748b',
    icon: 'bg-slate-600',
    label: 'Chưa mở khóa',
  },
  available: {
    border: '#22d3ee',
    glow: '0 0 24px rgba(34,211,238,.22)',
    accent: '#22d3ee',
    icon: 'bg-cyan-500',
    label: 'Có thể học',
  },
  in_progress: {
    border: '#f59e0b',
    glow: '0 0 28px rgba(245,158,11,.24)',
    accent: '#f59e0b',
    icon: 'bg-amber-500',
    label: 'Đang làm bài',
  },
  completed: {
    border: '#10b981',
    glow: '0 0 30px rgba(16,185,129,.28)',
    accent: '#10b981',
    icon: 'bg-emerald-500',
    label: 'Đã đạt 80%',
  },
  no_homework: {
    border: '#8b5cf6',
    glow: '0 0 26px rgba(139,92,246,.25)',
    accent: '#8b5cf6',
    icon: 'bg-violet-500',
    label: 'Chưa có bài tập',
  },
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function branchKeyOf(type: BlockType): BranchKey {
  if (type === 'dinh_nghia') return 'foundation'
  if (type === 'dinh_ly') return 'theorem'
  if (type === 'tinh_chat' || type === 'he_qua' || type === 'cong_thuc') return 'rules'
  if (type === 'phuong_phap') return 'method'
  if (type === 'chu_y') return 'note'
  return 'practice'
}

function branchGroups(blocks: SkillTreeBlock[]) {
  const buckets = new Map<BranchKey, SkillTreeBlock[]>()
  for (const block of [...blocks].sort((a, b) => a.order_index - b.order_index)) {
    const key = branchKeyOf(block.block_type)
    buckets.set(key, [...(buckets.get(key) || []), block])
  }
  return BRANCH_ORDER.map(key => buckets.get(key) || []).filter(group => group.length > 0)
}

function LessonNode({ data }: NodeProps) {
  const { item, selected, expanded, dimmed } = data as unknown as {
    item: SkillTreeItem
    selected: boolean
    expanded: boolean
    dimmed: boolean
  }
  const theme = statusTheme[item.status]
  const progress = item.progress ?? 0

  return (
    <div
      className={`mind-node lesson-node-shell group rounded-[18px] border bg-slate-950/95 p-3 text-white shadow-xl transition-[filter,box-shadow,opacity] duration-200 hover:brightness-125 hover:shadow-2xl ${selected ? 'lesson-selected' : ''} ${expanded ? 'lesson-expanded' : ''} ${dimmed ? 'opacity-45 saturate-50' : ''} ${item.status === 'locked' ? 'opacity-60' : ''}`}
      style={{
        width: LESSON_WIDTH,
        minHeight: LESSON_HEIGHT,
        borderColor: theme.border,
        boxShadow: selected || expanded ? theme.glow : '0 12px 32px rgba(2, 6, 23, .35)',
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${theme.icon}`}>
          {item.status === 'locked' ? (
            <LockKeyhole className="h-4 w-4" />
          ) : item.status === 'completed' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <BookOpen className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.group}</p>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-black uppercase leading-snug tracking-tight">{item.title}</h3>
        </div>
        {item.progress !== null && (
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-black" style={{ color: theme.accent }}>
            {item.progress}%
          </span>
        )}
      </div>

      {item.progress !== null ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="skill-progress-fill h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%`, backgroundColor: theme.accent }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
            <span>{theme.label}</span>
            <span>{item.answered}/{item.total} câu</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-500/10 px-2 py-1.5 text-[11px] text-violet-200">
          <ClipboardList className="h-3.5 w-3.5" />
          Chưa có bài tập được giao
        </div>
      )}
      {expanded && (
        <div className="pointer-events-none absolute -right-2 -top-2 rounded-full border border-teal-300/40 bg-teal-400/20 p-1 text-teal-200">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-teal-400" />
    </div>
  )
}

function BlockNode({ data }: NodeProps) {
  const { block, focused } = data as unknown as { block: SkillTreeBlock; focused: boolean }
  const style = getBlockStyle(block.block_type)
  const title = block.title?.trim() || style.label
  return (
    <div
      className={`mind-node block-node-shell group rounded-[16px] border bg-slate-950/90 p-3 text-white shadow-xl backdrop-blur transition-[filter,box-shadow] duration-200 hover:brightness-125 ${focused ? 'ring-2 ring-white/20' : ''}`}
      style={{
        width: BLOCK_WIDTH,
        minHeight: BLOCK_HEIGHT,
        borderColor: style.color,
        boxShadow: `0 0 0 1px ${hexToRgba(style.color, 0.22)}, 0 18px 42px ${hexToRgba(style.color, 0.14)}`,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ backgroundColor: style.color }} />
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ backgroundColor: hexToRgba(style.color, 0.18), color: style.color }}>
          {style.icon || <FileText className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: style.color }}>{style.label}</p>
          <h4 className="mt-1 line-clamp-2 text-[13px] font-bold leading-snug text-slate-100">{title}</h4>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ backgroundColor: style.color }} />
    </div>
  )
}

const nodeTypes = { lesson: LessonNode, block: BlockNode }

function layoutLessons(items: SkillTreeItem[], links: SkillTreeLink[], expandedId?: string | null) {
  if (!items.length) return new Map<string, { x: number; y: number }>()

  if (expandedId) {
    const rowGap = 154
    const railX = 64
    return new Map(items.map((item, index) => [item.id, {
      x: railX,
      y: index * rowGap,
    }]))
  }

  const shouldUseDagre = links.length >= Math.max(1, Math.floor(items.length / 2))
  if (shouldUseDagre) {
    const graph = new dagre.graphlib.Graph()
    graph.setDefaultEdgeLabel(() => ({}))
    graph.setGraph({ rankdir: 'TB', nodesep: 84, ranksep: 94, marginx: 90, marginy: 80 })
    items.forEach(item => graph.setNode(item.id, { width: LESSON_WIDTH, height: LESSON_HEIGHT }))
    links.forEach(link => graph.setEdge(link.source, link.target))
    dagre.layout(graph)
    return new Map(items.map(item => {
      const point = graph.node(item.id)
      return [item.id, { x: point.x - LESSON_WIDTH / 2, y: point.y - LESSON_HEIGHT / 2 }]
    }))
  }

  const columns = Math.min(items.length, 2)
  const xGap = 352
  const yGap = 154
  return new Map(items.map((item, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    return [item.id, {
      x: col * xGap + (row % 2) * 72,
      y: row * yGap + (col % 2) * 34,
    }]
  }))
}

function layoutBlocks(
  expandedId: string | null | undefined,
  blocks: SkillTreeBlock[],
  lessonPositions: Map<string, { x: number; y: number }>,
) {
  if (!expandedId || !blocks.length) return new Map<string, { x: number; y: number }>()

  const root = lessonPositions.get(expandedId) || { x: 0, y: 0 }
  const groups = branchGroups(blocks)
  const startX = root.x + LESSON_WIDTH + 230
  const colGap = 340
  const branchGap = 168
  const totalHeight = (groups.length - 1) * branchGap + BLOCK_HEIGHT
  const topY = Math.max(112, root.y + LESSON_HEIGHT / 2 - totalHeight / 2)
  const positions = new Map<string, { x: number; y: number }>()

  groups.forEach((group, branchIndex) => {
    const y = topY + branchIndex * branchGap
    group.forEach((block, depth) => {
      positions.set(block.id, {
        x: startX + depth * colGap,
        y,
      })
    })
  })

  return positions
}

function buildBlockEdges(expandedId: string | null | undefined, blocks: SkillTreeBlock[]) {
  if (!expandedId || !blocks.length) return []

  const edges: SkillTreeLink[] = []

  for (const group of branchGroups(blocks)) {
    const [head, ...children] = group
    edges.push({ source: expandedId, target: head.id, relation: 'extension' })
    children.forEach((child, index) => {
      edges.push({ source: group[index].id, target: child.id, relation: 'related' })
    })
  }

  return edges
}

function relationColor(relation: SkillTreeLink['relation']) {
  if (relation === 'prerequisite') return '#f59e0b'
  if (relation === 'extension') return '#14b8a6'
  return '#94a3b8'
}

function SkillTreeCanvas({ items, links, selectedId, expandedId, expandedBlocks = [], onSelect }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [displayExpandedId, setDisplayExpandedId] = useState<string | null | undefined>(expandedId)
  const [displayBlocks, setDisplayBlocks] = useState<SkillTreeBlock[]>(expandedBlocks)
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (expandedId !== displayExpandedId) return
    const timer = window.setTimeout(() => setDisplayBlocks(expandedBlocks), 0)
    return () => window.clearTimeout(timer)
  }, [displayExpandedId, expandedBlocks, expandedId])

  useEffect(() => {
    if (expandedId === displayExpandedId) return
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !displayExpandedId) {
      const timer = window.setTimeout(() => {
        setDisplayBlocks(expandedBlocks)
        setDisplayExpandedId(expandedId)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          setDisplayBlocks(expandedBlocks)
          setDisplayExpandedId(expandedId)
        },
      })

      timeline.to('.block-edge .react-flow__edge-path', {
        strokeDasharray: 560,
        strokeDashoffset: 560,
        duration: 0.22,
        stagger: { each: 0.018, from: 'end' },
      }, 0)
      timeline.to('.block-node-shell', {
        autoAlpha: 0,
        x: -24,
        scale: 0.9,
        duration: 0.24,
        stagger: { each: 0.026, from: 'end' },
      }, 0)
    }, root)

    return () => context.revert()
  }, [displayExpandedId, expandedBlocks, expandedId])

  const lessonPositions = useMemo(() => layoutLessons(items, links, displayExpandedId), [displayExpandedId, items, links])
  const blockPositions = useMemo(() => layoutBlocks(displayExpandedId, displayBlocks, lessonPositions), [displayBlocks, displayExpandedId, lessonPositions])
  const blockEdges = useMemo(() => buildBlockEdges(displayExpandedId, displayBlocks), [displayBlocks, displayExpandedId])

  const nodes: Node[] = useMemo(() => {
    const lessonNodes: Node[] = items.map(item => ({
      id: item.id,
      type: 'lesson',
      position: lessonPositions.get(item.id) || { x: 0, y: 0 },
      data: {
        item,
        selected: selectedId === item.id,
        expanded: displayExpandedId === item.id,
        dimmed: Boolean(displayExpandedId && displayExpandedId !== item.id && selectedId !== item.id),
      },
      draggable: false,
    }))

    const blockNodes: Node[] = displayBlocks.map(block => ({
      id: block.id,
      type: 'block',
      position: blockPositions.get(block.id) || { x: 0, y: 0 },
      data: { block, focused: displayExpandedId === selectedId },
      draggable: false,
      selectable: false,
    }))

    return [...lessonNodes, ...blockNodes]
  }, [blockPositions, displayBlocks, displayExpandedId, items, lessonPositions, selectedId])

  const edges: Edge[] = useMemo(() => {
    const visibleTheoryLinks = displayExpandedId ? [] : links

    const theoryEdges = visibleTheoryLinks.map((link, index): Edge => ({
      id: `theory-${link.source}-${link.target}-${index}`,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      className: 'mind-edge theory-edge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: relationColor(link.relation) },
      style: {
        stroke: relationColor(link.relation),
        strokeWidth: link.relation === 'prerequisite' ? 2.4 : 1.7,
        strokeDasharray: link.relation === 'prerequisite' ? undefined : '6 7',
        strokeLinecap: 'round',
      },
    }))

    const expandedEdges = blockEdges.map((link, index): Edge => {
      const targetBlock = displayBlocks.find(block => block.id === link.target)
      const stroke = targetBlock ? getBlockStyle(targetBlock.block_type).color : relationColor(link.relation)

      return {
        id: `block-${link.source}-${link.target}-${index}`,
        source: link.source,
        target: link.target,
        type: 'smoothstep',
        className: 'mind-edge block-edge',
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: stroke },
        style: {
          stroke,
          strokeWidth: link.relation === 'extension' ? 2.4 : 2,
          strokeDasharray: link.relation === 'related' ? '7 8' : '5 7',
          strokeLinecap: 'round',
        },
      }
    })

    return [...theoryEdges, ...expandedEdges]
  }, [blockEdges, displayBlocks, displayExpandedId, links])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: displayExpandedId ? 0.18 : 0.24, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480 })
    }, 40)
    return () => window.clearTimeout(timer)
  }, [displayBlocks.length, displayExpandedId, fitView, items.length, links.length])

  useEffect(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = gsap.context(() => {
      gsap.fromTo(
        '.lesson-node-shell',
        { autoAlpha: 0, y: 18, scale: 0.92 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.045, ease: 'back.out(1.35)' },
      )
      gsap.fromTo(
        '.mind-edge .react-flow__edge-path',
        { strokeDasharray: 560, strokeDashoffset: 560 },
        { strokeDashoffset: 0, duration: 0.72, stagger: 0.035, ease: 'power2.out' },
      )
    }, root)
    return () => context.revert()
  }, [items.length, links.length])

  useEffect(() => {
    if (!root.current || !displayExpandedId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = gsap.context(() => {
      gsap.fromTo(
        '.block-node-shell',
        { autoAlpha: 0, x: -28, scale: 0.86 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.38, stagger: 0.055, ease: 'back.out(1.45)' },
      )
      gsap.fromTo(
        '.lesson-expanded',
        { scale: 0.98 },
        { scale: 1.03, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' },
      )
    }, root)
    return () => context.revert()
  }, [displayBlocks.length, displayExpandedId])

  return (
    <div ref={root} className="relative h-full w-full overflow-hidden rounded-2xl bg-[#061124]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(20,184,166,0.13),transparent_34%),linear-gradient(120deg,rgba(37,99,235,0.12),transparent_32%,rgba(139,92,246,0.10))]" />
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold text-slate-300 backdrop-blur">
        <Sparkles className="h-3.5 w-3.5 text-teal-300" />
        Bài học ở cột trái • nhánh kiến thức bung bên phải
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.18}
        maxZoom={1.65}
        panOnScroll
        selectionOnDrag
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const data = node.data as unknown as { item?: SkillTreeItem }
          if (data.item) onSelect(data.item)
        }}
      >
        <Background color="rgba(148, 163, 184, .45)" gap={20} size={1.05} />
        <Controls showInteractive={false} className="!border !border-white/10 !bg-white/90 dark:!bg-slate-900/90" />
      </ReactFlow>
    </div>
  )
}

export default function SkillTree(props: Props) {
  return (
    <ReactFlowProvider>
      <SkillTreeCanvas {...props} />
    </ReactFlowProvider>
  )
}
