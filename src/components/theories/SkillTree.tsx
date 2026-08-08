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
import gsap from 'gsap'
import { BookOpen, CheckCircle2, ClipboardList, FileText, GitBranch, LockKeyhole, Sparkles } from 'lucide-react'
import { getBlockStyle } from '@/lib/theories/block-style'
import {
  getMasteryStatusLabel,
  type MasteryStatus,
} from '@/lib/analytics/knowledge-mastery'
import type { BlockType } from '@/types/theories'

/**
 * Trạng thái HOẠT ĐỘNG của bài học: học sinh đã làm bài tới đâu.
 *
 * Cố ý tách khỏi mức năng lực (`MasteryStatus`). Trước đây hai khái niệm này bị
 * trộn vào một trường: node đạt 100% số câu ĐÃ TRẢ LỜI được gắn nhãn
 * "Đã đạt 80%" màu xanh, kể cả khi sai toàn bộ.
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 2.1.
 */
export type SkillNodeStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'no_homework'

export interface SkillTreeItem {
  id: string
  title: string
  group: string
  difficulty: number
  /** Tỷ lệ câu ĐÃ LÀM trên tổng số câu được giao. Không phải tỷ lệ đúng. */
  progress: number | null
  answered: number
  total: number
  /** Số câu đã làm nhưng giáo viên chưa mở đáp án nên chưa tính năng lực. */
  pending: number
  assignmentCount: number
  status: SkillNodeStatus
  /** Mức năng lực dựa trên ĐỘ CHÍNH XÁC. `no_data` khi chưa có câu nào được chấm. */
  mastery: MasteryStatus
  /** Độ chính xác 0-100, `null` khi chưa có bằng chứng đã chấm. */
  accuracy: number | null
  /** Bài tiên quyết chưa đạt. Khóa mềm: vẫn vào được, chỉ để cảnh báo. */
  missingPrerequisites: string[]
  /**
   * Có khớp bộ lọc/tìm kiếm hiện tại không.
   *
   * Node không khớp vẫn được vẽ, chỉ làm mờ. Bỏ node khỏi cây khi lọc sẽ làm bố
   * cục nhảy mỗi lần gõ phím — xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.3.
   */
  matched: boolean
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

/**
 * Theme theo trạng thái HOẠT ĐỘNG. Chỉ nói về việc đã làm bài tới đâu, tuyệt đối
 * không hàm ý làm đúng hay sai — phần đó thuộc `masteryTheme`.
 */
const statusTheme: Record<SkillNodeStatus, { border: string; glow: string; accent: string; icon: string; label: string }> = {
  locked: {
    // Khóa mềm: học sinh vẫn vào được, viền chỉ để nhắc thứ tự nên học.
    border: '#64748b',
    glow: '0 0 0 1px rgba(100,116,139,.22)',
    accent: '#94a3b8',
    icon: 'bg-slate-600',
    label: 'Nên học sau',
  },
  available: {
    border: '#22d3ee',
    glow: '0 0 24px rgba(34,211,238,.22)',
    accent: '#22d3ee',
    icon: 'bg-cyan-500',
    label: 'Chưa làm bài',
  },
  in_progress: {
    border: '#f59e0b',
    glow: '0 0 28px rgba(245,158,11,.24)',
    accent: '#f59e0b',
    icon: 'bg-amber-500',
    label: 'Đang làm',
  },
  completed: {
    border: '#10b981',
    glow: '0 0 30px rgba(16,185,129,.28)',
    accent: '#10b981',
    icon: 'bg-emerald-500',
    // Trước đây là "Đã đạt 80%" — sai, vì `progress` chỉ đếm câu đã trả lời.
    label: 'Đã làm hết',
  },
  no_homework: {
    border: '#8b5cf6',
    glow: '0 0 26px rgba(139,92,246,.25)',
    accent: '#8b5cf6',
    icon: 'bg-violet-500',
    label: 'Chưa có bài tập',
  },
}

/**
 * Theme theo mức NĂNG LỰC (độ chính xác). Đây mới là thứ được phép dùng màu xanh
 * "đã đạt". Nhãn lấy từ `getMasteryStatusLabel` để không lệch với `/student/analytics`.
 */
const masteryTheme: Record<MasteryStatus, { color: string; chip: string }> = {
  no_data: { color: '#94a3b8', chip: 'border-slate-400/25 bg-slate-400/10 text-slate-300' },
  collecting: { color: '#a78bfa', chip: 'border-violet-400/25 bg-violet-400/10 text-violet-200' },
  needs_work: { color: '#f87171', chip: 'border-red-400/25 bg-red-400/10 text-red-200' },
  building: { color: '#fbbf24', chip: 'border-amber-400/25 bg-amber-400/10 text-amber-100' },
  stable: { color: '#34d399', chip: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' },
  mastered: { color: '#10b981', chip: 'border-emerald-400/35 bg-emerald-400/15 text-emerald-100' },
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
  const mastery = masteryTheme[item.mastery]
  const progress = item.progress ?? 0
  const hasMastery = item.mastery !== 'no_data' && item.accuracy !== null

  // Viền lấy màu theo NĂNG LỰC khi đã có bằng chứng đã chấm; chưa có thì mới rơi
  // về màu theo tiến độ. Nhờ vậy màu xanh trên cây luôn có nghĩa là "làm đúng".
  const borderColor = hasMastery ? mastery.color : theme.border

  return (
    <div
      className={`mind-node lesson-node-shell group rounded-[18px] border bg-slate-950/95 p-3 text-white shadow-xl transition-[filter,box-shadow,opacity] duration-200 hover:brightness-125 hover:shadow-2xl ${selected ? 'lesson-selected' : ''} ${expanded ? 'lesson-expanded' : ''} ${dimmed ? 'opacity-45 saturate-50' : ''}`}
      style={{
        width: LESSON_WIDTH,
        minHeight: LESSON_HEIGHT,
        borderColor,
        boxShadow: selected || expanded ? theme.glow : '0 12px 32px rgba(2, 6, 23, .35)',
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${theme.icon}`}>
          {item.mastery === 'mastered' || item.mastery === 'stable' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : item.status === 'locked' ? (
            <LockKeyhole className="h-4 w-4" />
          ) : (
            <BookOpen className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.group}</p>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-black uppercase leading-snug tracking-tight">{item.title}</h3>
        </div>
        {hasMastery && (
          <span
            className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-black"
            style={{ color: mastery.color }}
            title="Tỷ lệ trả lời đúng"
          >
            {item.accuracy}%
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
          {/* Nhãn năng lực luôn kèm chữ, không chỉ dựa vào màu (DESIGN_SYSTEM.md). */}
          <p className={`mt-1.5 truncate rounded-md border px-1.5 py-1 text-[10px] font-semibold ${mastery.chip}`}>
            {getMasteryStatusLabel(item.mastery)}
            {item.pending > 0 && ` · ${item.pending} câu chờ chấm`}
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-500/10 px-2 py-1.5 text-[11px] text-violet-200">
          <ClipboardList className="h-3.5 w-3.5" />
          Chưa có bài tập — đọc lý thuyết được
        </div>
      )}
      {item.missingPrerequisites.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-200/80">
          <LockKeyhole className="h-3 w-3 shrink-0" />
          Nên học {item.missingPrerequisites.length} bài trước
        </p>
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

const LESSON_COL_GAP = 372
const LESSON_ROW_GAP = 158
/** Lệch nhẹ theo hàng để đường nối không nằm đè lên nhau. Không đổi theo dữ liệu. */
const LESSON_ROW_STAGGER = 26

/**
 * Bố cục lộ trình: mỗi chuyên đề là một cột, bài học chảy từ trên xuống.
 *
 * Đây là MÔ HÌNH DUY NHẤT. Trước đây hàm này đổi mô hình theo dữ liệu — dùng
 * dagre khi `links.length >= items.length / 2`, còn lại rơi về lưới 2 cột zig-zag,
 * và khi mở một bài thì dồn tất cả về một cột dọc. Hệ quả: học sinh gõ tìm kiếm
 * là bố cục nhảy, click vào một bài là cây biến thành danh sách phẳng. Không xây
 * được bản đồ trong đầu, mà đó là toàn bộ giá trị của một cây kỹ năng.
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 2.2.
 *
 * Vị trí chỉ phụ thuộc vào chuyên đề và thứ tự bài trong chuyên đề, nên lọc hay
 * mở bài đều không làm node dịch chuyển — miễn là danh sách truyền vào là toàn
 * bộ bài học (page lọc bằng cách làm mờ, không bằng cách bỏ node).
 */
function layoutLessons(items: SkillTreeItem[]) {
  if (!items.length) return new Map<string, { x: number; y: number }>()

  const columnOrder: string[] = []
  const rowByGroup = new Map<string, number>()
  const positions = new Map<string, { x: number; y: number }>()

  for (const item of items) {
    if (!rowByGroup.has(item.group)) {
      rowByGroup.set(item.group, 0)
      columnOrder.push(item.group)
    }
    const row = rowByGroup.get(item.group) as number
    rowByGroup.set(item.group, row + 1)
    const col = columnOrder.indexOf(item.group)
    positions.set(item.id, {
      x: col * LESSON_COL_GAP + (row % 2) * LESSON_ROW_STAGGER,
      y: row * LESSON_ROW_GAP,
    })
  }

  return positions
}

function layoutBlocks(
  expandedId: string | null | undefined,
  blocks: SkillTreeBlock[],
  lessonPositions: Map<string, { x: number; y: number }>,
  realLinks: SkillTreeBlockLink[] = [],
) {
  if (!expandedId || !blocks.length) return new Map<string, { x: number; y: number }>()

  const root = lessonPositions.get(expandedId) || { x: 0, y: 0 }
  const groups = branchGroups(blocks)
  // Đặt nhánh kiến thức bên phải TOÀN BỘ các cột chuyên đề, không chỉ bên phải
  // bài đang mở — nếu không nó sẽ chồng lên cột chuyên đề kế tiếp.
  let maxLessonX = root.x
  for (const point of lessonPositions.values()) {
    if (point.x > maxLessonX) maxLessonX = point.x
  }
  const startX = maxLessonX + LESSON_WIDTH + 230
  const colGap = 340
  const branchGap = 168
  const totalHeight = (groups.length - 1) * branchGap + BLOCK_HEIGHT
  const topY = Math.max(112, root.y + LESSON_HEIGHT / 2 - totalHeight / 2)
  const positions = new Map<string, { x: number; y: number }>()

  // Khi có quan hệ thật, cột được tính bằng độ sâu trong đồ thị để mũi tên luôn
  // chảy từ trái sang phải. Không có quan hệ thật thì cột là thứ tự trong nhánh.
  const blockIds = new Set(blocks.map(block => block.id))
  const usableLinks = realLinks.filter(link => blockIds.has(link.source) && blockIds.has(link.target))
  const depthOf = new Map<string, number>()

  if (usableLinks.length) {
    const incoming = new Map<string, string[]>()
    for (const link of usableLinks) {
      incoming.set(link.target, [...(incoming.get(link.target) || []), link.source])
    }
    // Đồ thị nhỏ (số khối của một bài học), nên lặp tới điểm dừng là đủ; giới hạn
    // số vòng để chu trình dữ liệu xấu không treo UI.
    for (const block of blocks) depthOf.set(block.id, 0)
    for (let pass = 0; pass < blocks.length; pass += 1) {
      let changed = false
      for (const block of blocks) {
        const parents = incoming.get(block.id) || []
        if (!parents.length) continue
        const next = Math.max(...parents.map(id => (depthOf.get(id) ?? 0) + 1))
        if (next > (depthOf.get(block.id) ?? 0)) {
          depthOf.set(block.id, next)
          changed = true
        }
      }
      if (!changed) break
    }
  }

  groups.forEach((group, branchIndex) => {
    const y = topY + branchIndex * branchGap
    group.forEach((block, depth) => {
      positions.set(block.id, {
        x: startX + (depthOf.get(block.id) ?? depth) * colGap,
        y,
      })
    })
  })

  return positions
}

/**
 * Dựng cạnh cho nhánh kiến thức.
 *
 * Ưu tiên quan hệ THẬT từ `knowledge_block_edges` (tham số `realLinks`). Trước
 * đây hàm này luôn tự nối các block thành chuỗi tuyến tính theo `order_index`,
 * trong khi prop chứa quan hệ thật bị bỏ quên không destructure — nên sơ đồ
 * hiển thị là do code bịa ra. Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 2.
 *
 * Chuỗi theo `order_index` chỉ còn là fallback khi bài học chưa được khai báo
 * quan hệ nào giữa các khối.
 */
function buildBlockEdges(
  expandedId: string | null | undefined,
  blocks: SkillTreeBlock[],
  realLinks: SkillTreeBlockLink[] = [],
) {
  if (!expandedId || !blocks.length) return []

  const blockIds = new Set(blocks.map(block => block.id))
  const edges: SkillTreeLink[] = []

  const usableLinks = realLinks.filter(link => blockIds.has(link.source) && blockIds.has(link.target))

  if (usableLinks.length) {
    // Block không có cạnh vào thì treo trực tiếp vào bài học, nếu không nó sẽ
    // trôi lơ lửng không nối với gì.
    const hasIncoming = new Set(usableLinks.map(link => link.target))
    for (const block of blocks) {
      if (!hasIncoming.has(block.id)) {
        edges.push({ source: expandedId, target: block.id, relation: 'extension' })
      }
    }
    for (const link of usableLinks) {
      edges.push({ source: link.source, target: link.target, relation: link.relation })
    }
    return edges
  }

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

function SkillTreeCanvas({
  items,
  links,
  selectedId,
  expandedId,
  expandedBlocks = [],
  expandedBlockLinks = [],
  onSelect,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [displayExpandedId, setDisplayExpandedId] = useState<string | null | undefined>(expandedId)
  const [displayBlocks, setDisplayBlocks] = useState<SkillTreeBlock[]>(expandedBlocks)
  const [displayBlockLinks, setDisplayBlockLinks] = useState<SkillTreeBlockLink[]>(expandedBlockLinks)
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (expandedId !== displayExpandedId) return
    const timer = window.setTimeout(() => {
      setDisplayBlocks(expandedBlocks)
      setDisplayBlockLinks(expandedBlockLinks)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [displayExpandedId, expandedBlockLinks, expandedBlocks, expandedId])

  useEffect(() => {
    if (expandedId === displayExpandedId) return
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !displayExpandedId) {
      const timer = window.setTimeout(() => {
        setDisplayBlocks(expandedBlocks)
        setDisplayBlockLinks(expandedBlockLinks)
        setDisplayExpandedId(expandedId)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          setDisplayBlocks(expandedBlocks)
          setDisplayBlockLinks(expandedBlockLinks)
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
  }, [displayExpandedId, expandedBlockLinks, expandedBlocks, expandedId])

  const lessonPositions = useMemo(() => layoutLessons(items), [items])
  const blockPositions = useMemo(
    () => layoutBlocks(displayExpandedId, displayBlocks, lessonPositions, displayBlockLinks),
    [displayBlockLinks, displayBlocks, displayExpandedId, lessonPositions]
  )
  const blockEdges = useMemo(
    () => buildBlockEdges(displayExpandedId, displayBlocks, displayBlockLinks),
    [displayBlockLinks, displayBlocks, displayExpandedId]
  )

  const nodes: Node[] = useMemo(() => {
    const lessonNodes: Node[] = items.map(item => ({
      id: item.id,
      type: 'lesson',
      position: lessonPositions.get(item.id) || { x: 0, y: 0 },
      data: {
        item,
        selected: selectedId === item.id,
        expanded: displayExpandedId === item.id,
        // Làm mờ khi: không khớp bộ lọc, hoặc đang mở một bài khác.
        dimmed:
          !item.matched ||
          Boolean(displayExpandedId && displayExpandedId !== item.id && selectedId !== item.id),
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
    // Giữ nguyên cạnh tiên quyết cả khi đang mở một bài. Trước đây dòng này là
    // `displayExpandedId ? [] : links`, tức click vào một bài sẽ xoá sạch quan hệ
    // tiên quyết — đúng cái thông tin mà cây tồn tại để thể hiện. Khi mở bài, cạnh
    // không liên quan chỉ bị làm mờ đi.
    const theoryEdges = links.map((link, index): Edge => {
      const related =
        !displayExpandedId || link.source === displayExpandedId || link.target === displayExpandedId

      return {
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
          opacity: related ? 1 : 0.22,
        },
      }
    })

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
        Mỗi cột là một chuyên đề • màu theo tỷ lệ trả lời đúng
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
