'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import MathContent from '@/components/MathContent'
import { parseTexFile, parseMultipleTexFiles, parseMainFile, markdownToTexLesson } from '@/lib/theories/latex-parser'
import type { ParsedBlock } from '@/lib/theories/latex-parser'
import { createTheory, createKnowledgeBlock, createKnowledgeBlockEdge, getLatexTemplates } from '@/lib/theories/actions'
import { BLOCK_STYLES } from '@/lib/theories/block-style'
import type { BlockType, LatexTemplate } from '@/types/theories'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Upload, FileText, CheckCircle, AlertCircle, ArrowLeft,
  Eye, Code, Download, ChevronDown, ChevronRight,
  BookOpen, FolderOpen, Star, RefreshCw, Copy, Plus, Trash2,
  PenLine, Save
} from 'lucide-react'

const generateSlug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface ManualBlock {
  tempId: string
  block_type: BlockType
  title: string
  body_md: string
}

interface TaxonomyItem {
  id: string
  name: string
  order_index: number
}

interface ParsedPreview {
  title: string
  slug: string
  externalId: string
  contentMd: string
  tikzCount: number
  blocks: ParsedBlock[]
  selected: boolean
}

export default function ImportTheoriesPage() {
  const supabase = createClient()
  const router = useRouter()

  // Hướng làm việc: tạo thủ công | import LaTeX | xuất LaTeX
  const [direction, setDirection] = useState<'manual' | 'import' | 'export'>('manual')

  // State
  const [mode, setMode] = useState<'upload' | 'preview' | 'result'>('upload')
  const [texInput, setTexInput] = useState('')
  const [parsedLessons, setParsedLessons] = useState<ParsedPreview[]>([])
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  // Taxonomy
  const [topics, setTopics] = useState<TaxonomyItem[]>([])
  const [categories, setCategories] = useState<(TaxonomyItem & { topic_id: string })[]>([])
  const [sections, setSections] = useState<(TaxonomyItem & { category_id: string; topic_id: string })[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')

  // Import state
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ title: string; success: boolean; error?: string }[]>([])

  // Export state (web → LaTeX)
  const [exportedTex, setExportedTex] = useState('')
  const [templates, setTemplates] = useState<LatexTemplate[]>([])
  const [exportTemplateId, setExportTemplateId] = useState('')

  // Manual create state
  const [mTitle, setMTitle] = useState('')
  const [mSlug, setMSlug] = useState('')
  const [mDescription, setMDescription] = useState('')
  const [mContentMd, setMContentMd] = useState('')
  const [mDifficulty, setMDifficulty] = useState(3)
  const [mPublished, setMPublished] = useState(false)
  const [mBlocks, setMBlocks] = useState<ManualBlock[]>([])
  const [mSaving, setMSaving] = useState(false)
  const [mMessage, setMMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchTaxonomy()
    getLatexTemplates().then(setTemplates).catch(() => {})
  }, [])

  const fetchTaxonomy = async () => {
    const [topicsRes, categoriesRes, sectionsRes] = await Promise.all([
      supabase.from('topics').select('id, name, order_index').order('order_index'),
      supabase.from('categories').select('id, name, topic_id, order_index').order('order_index'),
      supabase.from('sections').select('id, name, category_id, topic_id, order_index').order('order_index'),
    ])
    if (topicsRes.data) setTopics(topicsRes.data)
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (sectionsRes.data) setSections(sectionsRes.data)
  }

  // Build hierarchical section options
  const sectionOptions = topics.flatMap(topic => {
    const topicCategories = categories.filter(c => c.topic_id === topic.id)
    return topicCategories.flatMap(cat => {
      const catSections = sections.filter(s => s.category_id === cat.id)
      return catSections.map(sec => ({
        id: sec.id,
        label: `${topic.name} > ${cat.name} > ${sec.name}`,
      }))
    })
  })

  // =============================================
  // PARSE LaTeX
  // =============================================

  const handleParse = useCallback(() => {
    if (!texInput.trim()) return

    // Kiểm tra xem có phải nhiều file không (tách bởi %%FILE:filename%%)
    const fileMarkerRegex = /%%FILE:(.+?)%%/g
    const hasMultipleFiles = fileMarkerRegex.test(texInput)

    let lessons: ParsedPreview[]

    if (hasMultipleFiles) {
      // Parse nhiều file
      const files: { name: string; content: string }[] = []
      const parts = texInput.split(/%%FILE:(.+?)%%/)
      for (let i = 1; i < parts.length; i += 2) {
        files.push({ name: parts[i].trim(), content: parts[i + 1] || '' })
      }
      const parsed = parseMultipleTexFiles(files)
      lessons = parsed.map(p => ({
        title: p.title,
        slug: p.slug,
        externalId: p.externalId,
        contentMd: p.contentMd,
        tikzCount: p.tikzBlocks.length,
        blocks: p.blocks,
        selected: true,
      }))
    } else {
      // Parse 1 file
      const parsed = parseTexFile(texInput)
      lessons = [{
        title: parsed.title,
        slug: parsed.slug,
        externalId: parsed.externalId,
        contentMd: parsed.contentMd,
        tikzCount: parsed.tikzBlocks.length,
        blocks: parsed.blocks,
        selected: true,
      }]
    }

    setParsedLessons(lessons)
    setPreviewIndex(0)
    setMode('preview')
  }, [texInput])

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    let combined = ''
    for (const file of Array.from(files)) {
      const text = await file.text()
      if (files.length > 1) {
        combined += `%%FILE:${file.name}%%\n${text}\n\n`
      } else {
        combined = text
      }
    }
    setTexInput(combined)
  }

  // =============================================
  // IMPORT → Supabase
  // =============================================

  const handleImport = async () => {
    if (!selectedSectionId) {
      alert('Vui lòng chọn chương (section) để gắn bài lý thuyết')
      return
    }

    const toImport = parsedLessons.filter(l => l.selected)
    if (toImport.length === 0) {
      alert('Chưa chọn bài nào để import')
      return
    }

    setImporting(true)
    const results: typeof importResults = []

    // Map externalId (LaTeX [id]) -> block id thực trong DB, để dựng cạnh sau
    const externalIdToBlockId = new Map<string, string>()
    // Lưu các cạnh chờ tạo (sau khi đã có đủ block id)
    const pendingEdges: { fromExternalId: string; toExternalId: string; relation: 'prerequisite' | 'related' | 'extension' }[] = []

    for (let i = 0; i < toImport.length; i++) {
      const lesson = toImport[i]
      try {
        const theory = await createTheory({
          section_id: selectedSectionId,
          title: lesson.title,
          slug: lesson.slug,
          description: `Bài lý thuyết: ${lesson.title}`,
          content_md: lesson.contentMd,
          difficulty_level: 3,
          order_index: i,
          is_published: false,
        })

        // Tạo các khối tri thức có kiểu
        for (let b = 0; b < lesson.blocks.length; b++) {
          const blk = lesson.blocks[b]
          const created = await createKnowledgeBlock({
            theory_id: theory.id,
            block_type: blk.blockType,
            title: blk.title || null,
            body_md: blk.bodyMd || null,
            order_index: b,
            external_id: blk.externalId || null,
          })
          if (blk.externalId) externalIdToBlockId.set(blk.externalId, created.id)
          for (const e of blk.edges) {
            pendingEdges.push({
              fromExternalId: blk.externalId,
              toExternalId: e.toExternalId,
              relation: e.relation,
            })
          }
        }

        results.push({ title: lesson.title, success: true })
      } catch (err: any) {
        results.push({
          title: lesson.title,
          success: false,
          error: err?.message || 'Lỗi không xác định',
        })
      }
    }

    // Dựng cạnh giữa các khối (chỉ khi cả 2 đầu đã có block id)
    for (const edge of pendingEdges) {
      const fromId = externalIdToBlockId.get(edge.fromExternalId)
      const toId = externalIdToBlockId.get(edge.toExternalId)
      if (fromId && toId) {
        try {
          // \tienquyet trong khối A trỏ tới B nghĩa là B là tiên quyết của A
          // => cạnh prerequisite đi từ B (to) -> A (from)
          if (edge.relation === 'prerequisite') {
            await createKnowledgeBlockEdge(toId, fromId, 'prerequisite')
          } else {
            await createKnowledgeBlockEdge(fromId, toId, edge.relation)
          }
        } catch {
          // bỏ qua cạnh lỗi, không chặn import
        }
      }
    }

    setImportResults(results)
    setImporting(false)
    setMode('result')
  }

  // =============================================
  // MANUAL CREATE (tạo thủ công + khối tri thức)
  // =============================================

  const addManualBlock = () => {
    setMBlocks(prev => [
      ...prev,
      { tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, block_type: 'dinh_nghia', title: '', body_md: '' },
    ])
  }

  const updateManualBlock = (tempId: string, patch: Partial<ManualBlock>) => {
    setMBlocks(prev => prev.map(b => (b.tempId === tempId ? { ...b, ...patch } : b)))
  }

  const removeManualBlock = (tempId: string) => {
    setMBlocks(prev => prev.filter(b => b.tempId !== tempId))
  }

  const handleManualTitleChange = (value: string) => {
    setMTitle(value)
    setMSlug(generateSlug(value))
  }

  const handleManualSave = async () => {
    if (!mTitle.trim()) {
      setMMessage({ type: 'error', text: 'Vui lòng nhập tiêu đề' })
      return
    }
    if (!selectedSectionId) {
      setMMessage({ type: 'error', text: 'Vui lòng chọn chương (section)' })
      return
    }
    setMSaving(true)
    setMMessage(null)
    try {
      const theory = await createTheory({
        section_id: selectedSectionId,
        title: mTitle.trim(),
        slug: mSlug || generateSlug(mTitle),
        description: mDescription.trim() || undefined,
        content_md: mContentMd || undefined,
        difficulty_level: mDifficulty,
        is_published: mPublished,
      })
      for (let i = 0; i < mBlocks.length; i++) {
        const blk = mBlocks[i]
        await createKnowledgeBlock({
          theory_id: theory.id,
          block_type: blk.block_type,
          title: blk.title.trim() || null,
          body_md: blk.body_md.trim() || null,
          order_index: i,
        })
      }
      setMMessage({ type: 'success', text: 'Đã tạo bài lý thuyết thành công!' })
      setTimeout(() => router.push('/admin/theories'), 900)
    } catch (err: any) {
      setMMessage({ type: 'error', text: err?.message || 'Lỗi khi lưu bài lý thuyết' })
    } finally {
      setMSaving(false)
    }
  }

  // =============================================
  // EXPORT: Web theories → LaTeX files
  // =============================================

  const handleExportFromWeb = async () => {
    if (!selectedSectionId) {
      alert('Chọn chương cần xuất')
      return
    }

    const { data: theories, error } = await supabase
      .from('theories')
      .select('title, content_md')
      .eq('section_id', selectedSectionId)
      .order('order_index')

    if (error || !theories || theories.length === 0) {
      alert('Không có bài lý thuyết nào trong chương này')
      return
    }

    // Convert each theory to .tex format
    const texParts = theories.map((t: any) =>
      markdownToTexLesson(t.title, t.content_md || '')
    )
    const body = texParts.join('\n\n\\clearpage\n\n')

    // Áp template LaTeX (nếu chọn): thay {{content}}, {{date}}
    const tpl = templates.find(t => t.id === exportTemplateId)
    if (tpl) {
      const sectionName = sectionOptions.find(o => o.id === selectedSectionId)?.label || ''
      const filled = tpl.template_text
        .replace(/\{\{\s*content\s*\}\}/g, body)
        .replace(/\{\{\s*title\s*\}\}/g, sectionName)
        .replace(/\{\{\s*section_name\s*\}\}/g, sectionName)
        .replace(/\{\{\s*date\s*\}\}/g, new Date().toLocaleDateString('vi-VN'))
      setExportedTex(filled)
    } else {
      setExportedTex(body)
    }
  }

  const downloadTex = () => {
    const blob = new Blob([exportedTex], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'theories-export.tex'
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyTex = () => {
    navigator.clipboard.writeText(exportedTex)
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <>
      <AdminHeader title="Import / Export LaTeX" subtitle="Đồng bộ lý thuyết giữa LaTeX và Web" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">

          {/* Header Actions */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/theories"
                className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </Link>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Đồng bộ LaTeX ↔ Web
              </h2>
            </div>

            {/* Direction toggle */}
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1">
              <button
                onClick={() => setDirection('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'manual'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <PenLine className="w-4 h-4 inline mr-1.5" />
                Tạo thủ công
              </button>
              <button
                onClick={() => { setDirection('import'); setMode('upload') }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'import'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Upload className="w-4 h-4 inline mr-1.5" />
                Import LaTeX
              </button>
              <button
                onClick={() => setDirection('export')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'export'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Download className="w-4 h-4 inline mr-1.5" />
                Xuất LaTeX
              </button>
            </div>
          </div>

          {/* Section picker (dùng chung) */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Chương (Section) để import/export
            </label>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none text-sm"
            >
              <option value="">-- Chọn chương --</option>
              {sectionOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* ============================================ */}
          {/* MODE: MANUAL CREATE (tạo thủ công) */}
          {/* ============================================ */}
          {direction === 'manual' && (
            <div className="space-y-4">
              {mMessage && (
                <div className={`p-3 rounded-xl text-sm ${
                  mMessage.type === 'success'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
                }`}>
                  {mMessage.text}
                </div>
              )}

              {/* Thông tin bài */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tiêu đề</label>
                  <input
                    type="text"
                    value={mTitle}
                    onChange={(e) => handleManualTitleChange(e.target.value)}
                    placeholder="Nhập tiêu đề bài lý thuyết..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-lg font-medium focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Slug</label>
                    <input
                      type="text"
                      value={mSlug}
                      onChange={(e) => setMSlug(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Độ khó</label>
                    <div className="flex items-center gap-1 pt-1">
                      {[1, 2, 3, 4, 5].map(level => (
                        <button key={level} type="button" onClick={() => setMDifficulty(level)} className="p-0.5">
                          <Star className={`w-6 h-6 transition-colors ${level <= mDifficulty ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Trạng thái</label>
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <div
                        onClick={() => setMPublished(!mPublished)}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${mPublished ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mPublished ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{mPublished ? 'Xuất bản' : 'Bản nháp'}</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Mô tả</label>
                  <textarea
                    value={mDescription}
                    onChange={(e) => setMDescription(e.target.value)}
                    rows={2}
                    placeholder="Mô tả ngắn cho bài lý thuyết..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nội dung tổng quan (Markdown, tùy chọn)</label>
                  <textarea
                    value={mContentMd}
                    onChange={(e) => setMContentMd(e.target.value)}
                    rows={4}
                    placeholder="Phần giới thiệu / nội dung chính... Hỗ trợ $math$, $$display$$"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none resize-y font-mono"
                  />
                </div>
              </div>

              {/* Khối tri thức */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                    Khối tri thức ({mBlocks.length})
                  </h3>
                  <button
                    onClick={addManualBlock}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Thêm khối
                  </button>
                </div>

                {mBlocks.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
                    Chưa có khối tri thức nào. Thêm các khối (định nghĩa, định lý, ví dụ...) để hiển thị mindmap & đồ thị.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {mBlocks.map((blk, idx) => (
                      <div key={blk.tempId} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/30">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 w-6">#{idx + 1}</span>
                          <select
                            value={blk.block_type}
                            onChange={(e) => updateManualBlock(blk.tempId, { block_type: e.target.value as BlockType })}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                          >
                            {(Object.keys(BLOCK_STYLES) as BlockType[]).map(bt => (
                              <option key={bt} value={bt}>{BLOCK_STYLES[bt].icon} {BLOCK_STYLES[bt].label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={blk.title}
                            onChange={(e) => updateManualBlock(blk.tempId, { title: e.target.value })}
                            placeholder="Tiêu đề khối (tùy chọn)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                          />
                          <button
                            onClick={() => removeManualBlock(blk.tempId)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="Xóa khối"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={blk.body_md}
                          onChange={(e) => updateManualBlock(blk.tempId, { body_md: e.target.value })}
                          rows={3}
                          placeholder="Nội dung khối (Markdown + $math$ + tikz)..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none resize-y font-mono"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => router.push('/admin/theories')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleManualSave}
                  disabled={mSaving}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {mSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Lưu bài
                </button>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* MODE: EXPORT (Web → LaTeX) */}
          {/* ============================================ */}
          {direction === 'export' && (
            <div className="space-y-4">
              {/* Template picker */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Template LaTeX (tùy chọn — dùng <code>{'{{content}}'}</code> làm chỗ chèn)
                </label>
                <select
                  value={exportTemplateId}
                  onChange={(e) => setExportTemplateId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none text-sm"
                >
                  <option value="">-- Không dùng template (chỉ nội dung bài) --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (mặc định)' : ''}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleExportFromWeb}
                disabled={!selectedSectionId}
                className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Xuất theories → LaTeX
              </button>

              {exportedTex && (
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Code className="w-4 h-4" />
                      LaTeX Output
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyTex}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                      <button
                        onClick={downloadTex}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Tải .tex
                      </button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={exportedTex}
                    className="w-full min-h-[400px] p-4 bg-transparent font-mono text-xs text-slate-700 dark:text-slate-300 outline-none resize-y"
                  />
                </div>
              )}
            </div>
          )}

          {/* ============================================ */}
          {/* MODE: IMPORT (LaTeX → Web) */}
          {/* ============================================ */}
          {direction === 'import' && mode === 'upload' && (
            <div className="space-y-4">
              {/* File upload */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Kéo thả file <code>.tex</code> hoặc click để chọn
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Hỗ trợ upload nhiều file cùng lúc (mỗi file = 1 bài lý thuyết)
                </p>
                <input
                  type="file"
                  accept=".tex"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="tex-upload"
                />
                <label
                  htmlFor="tex-upload"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Chọn file .tex
                </label>
              </div>

              {/* Hoặc paste trực tiếp */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Hoặc paste nội dung LaTeX trực tiếp
                  </span>
                </div>
                <textarea
                  value={texInput}
                  onChange={(e) => setTexInput(e.target.value)}
                  placeholder={`Paste nội dung file .tex ở đây...\n\nVí dụ:\n\\LessonBox{ÔN TẬP ĐẠO HÀM}\n\\begin{theorybox}\n...\n\\end{theorybox}`}
                  className="w-full min-h-[300px] p-4 bg-transparent font-mono text-sm text-slate-700 dark:text-slate-300 outline-none resize-y"
                />
              </div>

              <button
                onClick={handleParse}
                disabled={!texInput.trim()}
                className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Parse & Xem trước
              </button>
            </div>
          )}

          {/* ============================================ */}
          {/* MODE: PREVIEW */}
          {/* ============================================ */}
          {direction === 'import' && mode === 'preview' && (
            <div className="space-y-4">
              {/* Lesson list */}
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                    Đã parse {parsedLessons.length} bài
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMode('upload')}
                      className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      ← Quay lại
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing || !selectedSectionId}
                      className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {importing ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Import {parsedLessons.filter(l => l.selected).length} bài
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {parsedLessons.map((lesson, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        previewIndex === idx
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700'
                      }`}
                      onClick={() => setPreviewIndex(idx)}
                    >
                      <input
                        type="checkbox"
                        checked={lesson.selected}
                        onChange={(e) => {
                          e.stopPropagation()
                          setParsedLessons(prev =>
                            prev.map((l, i) => i === idx ? { ...l, selected: !l.selected } : l)
                          )
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {lesson.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          slug: {lesson.slug}
                          {lesson.tikzCount > 0 && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">
                              • {lesson.tikzCount} hình TikZ
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${previewIndex === idx ? 'rotate-90' : ''}`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview panel */}
              {previewIndex !== null && parsedLessons[previewIndex] && (
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Xem trước: {parsedLessons[previewIndex].title}
                    </span>
                    <div className="flex items-center bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5">
                      <button
                        onClick={() => setShowPreview(true)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          showPreview ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Eye className="w-3 h-3 inline mr-1" /> Preview
                      </button>
                      <button
                        onClick={() => setShowPreview(false)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          !showPreview ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Code className="w-3 h-3 inline mr-1" /> Markdown
                      </button>
                    </div>
                  </div>
                  <div className="p-6 max-h-[600px] overflow-y-auto">
                    {showPreview ? (
                      <div className="prose prose-slate dark:prose-invert max-w-none">
                        <MathContent content={parsedLessons[previewIndex].contentMd} />
                      </div>
                    ) : (
                      <pre className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {parsedLessons[previewIndex].contentMd}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================ */}
          {/* MODE: RESULT */}
          {/* ============================================ */}
          {direction === 'import' && mode === 'result' && (
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
                Kết quả Import
              </h3>

              <div className="space-y-2 mb-6">
                {importResults.map((r, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      r.success
                        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    {r.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
                      {r.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/admin/theories"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors"
                >
                  Xem danh sách lý thuyết
                </Link>
                <button
                  onClick={() => {
                    setMode('upload')
                    setTexInput('')
                    setParsedLessons([])
                    setImportResults([])
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Import thêm
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
