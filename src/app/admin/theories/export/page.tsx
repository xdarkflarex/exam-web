'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { getLatexTemplates } from '@/lib/theories/actions'
import { generateLatex } from '@/lib/theories/latex-export'
import { downloadTextFile } from '@/lib/export/download'
import {
  FileDown, Copy, Download, CheckSquare, Square,
  FileCode, ChevronDown, Check, Loader2, FileText
} from 'lucide-react'
import type { LatexTemplate, Theory } from '@/types/theories'

interface TheoryItem {
  id: string
  title: string
  section_id: string
  is_published: boolean
  difficulty_level: number
  order_index: number
}

interface SectionItem {
  id: string
  name: string
  category_id: string
}

export default function TheoryExportPage() {
  const supabase = createClient()

  const [theories, setTheories] = useState<TheoryItem[]>([])
  const [sections, setSections] = useState<SectionItem[]>([])
  const [templates, setTemplates] = useState<LatexTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const [sectionFilter, setSectionFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [templateId, setTemplateId] = useState('')

  const [generatedLatex, setGeneratedLatex] = useState('')
  const [generatedFilename, setGeneratedFilename] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [theoriesRes, sectionsRes, templatesData] = await Promise.all([
        supabase
          .from('theories')
          .select('id, title, section_id, is_published, difficulty_level, order_index')
          .eq('is_published', true)
          .order('order_index', { ascending: true }),
        supabase.from('sections').select('id, name, category_id').order('order_index'),
        getLatexTemplates(),
      ])

      if (theoriesRes.data) setTheories(theoriesRes.data)
      if (sectionsRes.data) setSections(sectionsRes.data)
      setTemplates(templatesData)

      // Pre-select default template
      const defaultTpl = templatesData.find(t => t.is_default)
      if (defaultTpl) setTemplateId(defaultTpl.id)
      else if (templatesData.length > 0) setTemplateId(templatesData[0].id)
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTheories = sectionFilter
    ? theories.filter(t => t.section_id === sectionFilter)
    : theories

  const toggleTheory = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredTheories.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTheories.map(t => t.id)))
    }
  }

  const handleGenerate = async () => {
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: 'Vui lòng chọn ít nhất một bài lý thuyết' })
      return
    }
    if (!templateId) {
      setMessage({ type: 'error', text: 'Vui lòng chọn template' })
      return
    }
    setGenerating(true)
    setMessage(null)

    try {
      const result = await generateLatex(Array.from(selectedIds), templateId)
      setGeneratedLatex(result.latex)
      setGeneratedFilename(result.filename)
      setMessage({ type: 'success', text: 'Đã tạo file LaTeX thành công!' })
    } catch (err: any) {
      console.error('Generate error:', err)
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi xuất LaTeX' })
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLatex)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = generatedLatex
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    downloadTextFile(generatedFilename, generatedLatex)
  }

  return (
    <>
      <AdminHeader title="Xuất LaTeX" subtitle="Xuất bài lý thuyết sang file LaTeX" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            <FileDown className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Xuất LaTeX</h2>
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-xl text-sm ${
              message.type === 'success'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700'
            }`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Đang tải...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Selection */}
              <div className="lg:col-span-2 space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-3">
                  <select
                    value={sectionFilter}
                    onChange={(e) => {
                      setSectionFilter(e.target.value)
                      setSelectedIds(new Set())
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                  >
                    <option value="">Tất cả chương</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                  >
                    <option value="">Chọn template</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? ' (Mặc định)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Theory list */}
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  {/* Select all header */}
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    >
                      {selectedIds.size === filteredTheories.length && filteredTheories.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      Chọn tất cả ({filteredTheories.length} bài)
                    </button>
                    <span className="text-xs text-slate-400">
                      Đã chọn: {selectedIds.size}
                    </span>
                  </div>

                  {filteredTheories.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Không có bài lý thuyết nào</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
                      {filteredTheories.map(theory => {
                        const section = sections.find(s => s.id === theory.section_id)
                        return (
                          <button
                            key={theory.id}
                            onClick={() => toggleTheory(theory.id)}
                            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            {selectedIds.has(theory.id) ? (
                              <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                                {theory.title}
                              </p>
                              {section && (
                                <p className="text-xs text-slate-400 dark:text-slate-500">{section.name}</p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || selectedIds.size === 0 || !templateId}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileCode className="w-5 h-5" />
                  )}
                  Xuất file .tex
                </button>
              </div>

              {/* Right: Output */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Kết quả LaTeX</span>
                    {generatedLatex && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleCopy}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="Sao chép"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleDownload}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="Tải xuống"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea
                    readOnly
                    value={generatedLatex}
                    placeholder="Nội dung LaTeX sẽ hiện ở đây sau khi xuất..."
                    className="w-full h-96 p-4 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-mono outline-none resize-none"
                  />
                </div>

                {generatedLatex && (
                  <button
                    onClick={handleDownload}
                    className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium transition-colors flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="w-5 h-5" />
                    Tải xuống {generatedFilename}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
