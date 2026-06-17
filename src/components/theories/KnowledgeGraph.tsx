'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { getRelationStyle } from '@/lib/theories/block-style'
import type { EdgeRelationType } from '@/types/theories'

// react-force-graph dùng window → chỉ load ở client
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

export interface GraphNode {
  id: string
  label: string
  group?: string          // chương / chủ đề để tô màu
  difficulty?: number
  val?: number            // kích thước node
  color?: string
}

export interface GraphLink {
  source: string
  target: string
  relation: EdgeRelationType
}

interface KnowledgeGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  mode: '2d' | '3d'
  onNodeClick?: (node: GraphNode) => void
  highlightId?: string | null
}

// Palette tô màu theo nhóm
const GROUP_PALETTE = [
  '#2563EB', '#7C3AED', '#0891B2', '#0D9488', '#B45309',
  '#15803D', '#DC2626', '#DB2777', '#4F46E5', '#CA8A04',
]

export default function KnowledgeGraph({
  nodes,
  links,
  mode,
  onNodeClick,
  highlightId,
}: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [hoverId, setHoverId] = useState<string | null>(null)

  // Đo kích thước container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Gán màu theo nhóm
  const groupColor = useMemo(() => {
    const groups = Array.from(new Set(nodes.map((n) => n.group || 'default')))
    const map = new Map<string, string>()
    groups.forEach((g, i) => map.set(g, GROUP_PALETTE[i % GROUP_PALETTE.length]))
    return map
  }, [nodes])

  const data = useMemo(() => {
    // Tập id láng giềng của node đang hover/highlight để làm nổi bật
    const focus = hoverId || highlightId
    return {
      nodes: nodes.map((n) => ({
        ...n,
        color: n.color || groupColor.get(n.group || 'default'),
        val: n.val ?? 4,
      })),
      links: links.map((l) => ({ ...l })),
      focus,
    }
  }, [nodes, links, groupColor, hoverId, highlightId])

  const linkColor = useCallback(
    (l: any) => getRelationStyle(l.relation as EdgeRelationType).color,
    []
  )

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label as string
      const isFocus = node.id === (hoverId || highlightId)
      const r = (node.val ?? 4) + (isFocus ? 3 : 0)
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()
      if (isFocus) {
        ctx.lineWidth = 2 / globalScale
        ctx.strokeStyle = '#0f172a'
        ctx.stroke()
      }
      // Nhãn khi đủ phóng to hoặc đang focus
      if (globalScale > 1.2 || isFocus) {
        const fontSize = Math.max(11 / globalScale, 3)
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#334155'
        const text = label.length > 28 ? label.slice(0, 27) + '…' : label
        ctx.fillText(text, node.x, node.y + r + 1)
      }
    },
    [hoverId, highlightId]
  )

  const commonProps = {
    graphData: data,
    width: size.width,
    height: size.height,
    nodeId: 'id',
    nodeLabel: 'label',
    nodeVal: 'val',
    nodeColor: 'color',
    linkColor,
    linkDirectionalArrowLength: 3.5,
    linkDirectionalArrowRelPos: 1,
    linkWidth: (l: any) =>
      (l.relation as EdgeRelationType) === 'prerequisite' ? 1.6 : 0.8,
    onNodeClick: (n: any) => onNodeClick?.(n as GraphNode),
    onNodeHover: (n: any) => setHoverId(n ? n.id : null),
    cooldownTicks: 120,
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      {mode === '3d' ? (
        <ForceGraph3D
          {...(commonProps as any)}
          backgroundColor="rgba(0,0,0,0)"
          linkDirectionalParticles={(l: any) =>
            (l.relation as EdgeRelationType) === 'prerequisite' ? 2 : 0
          }
          linkDirectionalParticleSpeed={0.006}
          nodeOpacity={0.95}
          nodeResolution={16}
        />
      ) : (
        <ForceGraph2D
          {...(commonProps as any)}
          backgroundColor="rgba(0,0,0,0)"
          linkDirectionalParticles={(l: any) =>
            (l.relation as EdgeRelationType) === 'prerequisite' ? 2 : 0
          }
          linkDirectionalParticleWidth={2}
          linkLineDash={(l: any) =>
            getRelationStyle(l.relation as EdgeRelationType).dashed ? [4, 3] : null
          }
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.beginPath()
            ctx.arc(node.x, node.y, (node.val ?? 4) + 4, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
        />
      )}
    </div>
  )
}
