'use client'

import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { getBlockStyle, getRelationStyle } from '@/lib/theories/block-style'
import type { KnowledgeBlock, KnowledgeBlockEdge, BlockType, EdgeRelationType } from '@/types/theories'

interface TheoryMindmapProps {
  blocks: KnowledgeBlock[]
  edges: KnowledgeBlockEdge[]
  selectedId?: string | null
  onSelect?: (block: KnowledgeBlock) => void
}

type BlockNodeData = {
  block: KnowledgeBlock
  selected: boolean
}

const NODE_W = 220
const NODE_H = 64

/* Node tùy biến hiển thị 1 khối tri thức */
function BlockNode({ data }: NodeProps) {
  const { block, selected } = data as BlockNodeData
  const style = getBlockStyle(block.block_type as BlockType)
  return (
    <div
      className={`rounded-xl border-2 px-3 py-2 shadow-sm transition-all ${style.bg} ${
        selected ? 'ring-2 ring-offset-2 ring-teal-500 dark:ring-offset-slate-900' : ''
      }`}
      style={{ width: NODE_W, borderColor: style.color }}
    >
      <Handle type="target" position={Position.Top} style={{ background: style.color }} />
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm">{style.icon}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.text}`}>
          {style.label}
        </span>
      </div>
      <div className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
        {block.title || '(không tiêu đề)'}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: style.color }} />
    </div>
  )
}

const nodeTypes = { block: BlockNode }

/* Dagre layout: sắp xếp cây tri thức từ trên xuống */
function layout(blocks: KnowledgeBlock[], edges: KnowledgeBlockEdge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })

  for (const b of blocks) g.setNode(b.id, { width: NODE_W, height: NODE_H })
  for (const e of edges) {
    if (blocks.find((b) => b.id === e.from_block_id) && blocks.find((b) => b.id === e.to_block_id)) {
      g.setEdge(e.from_block_id, e.to_block_id)
    }
  }
  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  // Cột dự phòng cho node cô lập
  let isolatedX = 0
  for (const b of blocks) {
    const n = g.node(b.id)
    if (n) positions.set(b.id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 })
    else {
      positions.set(b.id, { x: isolatedX, y: -120 })
      isolatedX += NODE_W + 40
    }
  }
  return positions
}

export default function TheoryMindmap({ blocks, edges, selectedId, onSelect }: TheoryMindmapProps) {
  const positions = useMemo(() => layout(blocks, edges), [blocks, edges])

  const nodes: Node[] = useMemo(
    () =>
      blocks.map((b) => ({
        id: b.id,
        type: 'block',
        position: positions.get(b.id) || { x: 0, y: 0 },
        data: { block: b, selected: b.id === selectedId },
        draggable: true,
      })),
    [blocks, positions, selectedId]
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      edges
        .filter(
          (e) =>
            blocks.find((b) => b.id === e.from_block_id) &&
            blocks.find((b) => b.id === e.to_block_id)
        )
        .map((e) => {
          const rel = getRelationStyle(e.relation_type as EdgeRelationType)
          return {
            id: e.id,
            source: e.from_block_id,
            target: e.to_block_id,
            animated: e.relation_type === 'prerequisite',
            style: {
              stroke: rel.color,
              strokeWidth: 1.8,
              strokeDasharray: rel.dashed ? '5 4' : undefined,
            },
          } as Edge
        }),
    [edges, blocks]
  )

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const data = node.data as BlockNodeData
      onSelect?.(data.block)
    },
    [onSelect]
  )

  return (
    <div className="w-full h-[55vh] rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#94a3b8" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
