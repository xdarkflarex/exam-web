'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckSquare,
  ChevronRight,
  CircleOff,
  Eye,
  Filter,
  Link2,
  Loader2,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'
import MathContent, { MathProvider } from '@/components/MathContent'
import { createClient } from '@/lib/supabase/client'
import {
  bulkMapQuestionsToKnowledge,
  getBlockCoverage,
  getKnowledgeLinksForTheory,
  mapQuestionToKnowledge,
  unmapKnowledgeLink,
} from '@/lib/theories/actions'
import { getBlockStyle } from '@/lib/theories/block-style'
import type {
  BlockQuestionCoverage,
  KnowledgeBlock,
  KnowledgeLinkType,
  QuestionKnowledgeLink,
} from '@/types/theories'

interface TheoryRow {
  id: string
  title: string
  section_id: string
  description: string | null
}

interface QuestionRow {
  id: string
  content: string
  question_type: string
  difficulty: number
  cognitive_level: string | null
  source_exam: string | null
  section_id: string | null
  section_name: string | null
  subsection_name: string | null
}

type MappingFilter = 'all' | 'mapped' | 'unmapped'

const LINK_LABELS: Record<KnowledgeLinkType, string> = {
  primary: 'Chính',
  supporting: 'Bổ trợ',
  prerequisite: 'Tiên quyết',
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Nhiều lựa chọn',
  true_false: 'Đúng / sai',
  short_answer: 'Trả lời ngắn',
}

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function TheoryKnowledgeLinksPage() {
  const params = useParams()
  const theoryId = params.theoryId as string
  const supabase = useMemo(() => createClient(), [])

  const [theory, setTheory] = useState<TheoryRow | null>(null)
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([])
  const [coverage, setCoverage] = useState<BlockQuestionCoverage[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [links, setLinks] = useState<QuestionKnowledgeLink[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [targetBlockId, setTargetBlockId] = useState<string | null>(null)
  const [linkType, setLinkType] = useState<KnowledgeLinkType>('supporting')
  const [search, setSearch] = useState('')
  const [questionType, setQuestionType] = useState('')
  const [cognitiveLevel, setCognitiveLevel] = useState('')
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all')
  const [recommendedOnly, setRecommendedOnly] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewQuestion, setPreviewQuestion] = useState<QuestionRow | null>(null)

  const loadLinksAndCoverage = useCallback(async () => {
    const [linkRows, coverageRows] = await Promise.all([
      getKnowledgeLinksForTheory(theoryId),
      getBlockCoverage(theoryId),
    ])
    setLinks(linkRows)
    setCoverage(coverageRows)
  }, [theoryId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [theoryRes, blocksRes, questionsRes] = await Promise.all([
        supabase
          .from('theories')
          .select('id, title, section_id, description')
          .eq('id', theoryId)
          .single(),
        supabase
          .from('knowledge_blocks')
          .select('*')
          .eq('theory_id', theoryId)
          .order('order_index'),
        supabase
          .from('questions')
          .select('id, content, question_type, difficulty, cognitive_level, source_exam')
          .order('created_at', { ascending: false })
          .limit(500),
      ])

      if (theoryRes.error) throw theoryRes.error
      if (blocksRes.error) throw blocksRes.error
      if (questionsRes.error) throw questionsRes.error

      const baseQuestions = questionsRes.data || []
      const questionIds = baseQuestions.map((question) => question.id)
      const taxonomyRes = questionIds.length
        ? await supabase
            .from('question_taxonomy')
            .select(`
              question_id,
              section_id,
              sections:section_id(name),
              subsections:subsection_id(name)
            `)
            .in('question_id', questionIds)
        : { data: [], error: null }

      if (taxonomyRes.error) throw taxonomyRes.error

      const taxonomyByQuestion = new Map(
        (taxonomyRes.data || []).map((row) => [row.question_id, row])
      )

      setTheory(theoryRes.data as TheoryRow)
      setBlocks((blocksRes.data || []) as KnowledgeBlock[])
      setQuestions(
        baseQuestions.map((question) => {
          const taxonomy = taxonomyByQuestion.get(question.id)
          return {
            ...question,
            section_id: taxonomy?.section_id || null,
            section_name: (taxonomy?.sections as unknown as { name?: string } | null)?.name || null,
            subsection_name:
              (taxonomy?.subsections as unknown as { name?: string } | null)?.name || null,
          }
        })
      )
      await loadLinksAndCoverage()
    } catch (err) {
      console.error('Load knowledge links workspace error:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu liên kết.')
    } finally {
      setLoading(false)
    }
  }, [loadLinksAndCoverage, supabase, theoryId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const targetLinksByQuestion = useMemo(() => {
    const map = new Map<string, QuestionKnowledgeLink[]>()
    for (const link of links) {
      const matchesTarget = targetBlockId
        ? link.knowledge_block_id === targetBlockId
        : link.knowledge_block_id == null
      if (!matchesTarget) continue
      const current = map.get(link.question_id) || []
      current.push(link)
      map.set(link.question_id, current)
    }
    return map
  }, [links, targetBlockId])

  const allLinksByQuestion = useMemo(() => {
    const map = new Map<string, QuestionKnowledgeLink[]>()
    for (const link of links) {
      const current = map.get(link.question_id) || []
      current.push(link)
      map.set(link.question_id, current)
    }
    return map
  }, [links])

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return questions
      .filter((question) => {
        const isRecommended = question.section_id === theory?.section_id
        const isMapped = targetLinksByQuestion.has(question.id)
        if (recommendedOnly && !isRecommended) return false
        if (questionType && question.question_type !== questionType) return false
        if (cognitiveLevel && question.cognitive_level !== cognitiveLevel) return false
        if (mappingFilter === 'mapped' && !isMapped) return false
        if (mappingFilter === 'unmapped' && isMapped) return false
        if (
          query &&
          !plainText(question.content).toLowerCase().includes(query) &&
          !question.id.toLowerCase().includes(query) &&
          !(question.source_exam || '').toLowerCase().includes(query)
        ) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        const aRecommended = a.section_id === theory?.section_id ? 1 : 0
        const bRecommended = b.section_id === theory?.section_id ? 1 : 0
        return bRecommended - aRecommended
      })
  }, [
    cognitiveLevel,
    mappingFilter,
    questionType,
    questions,
    recommendedOnly,
    search,
    targetLinksByQuestion,
    theory?.section_id,
  ])

  const selectedTarget = targetBlockId
    ? blocks.find((block) => block.id === targetBlockId) || null
    : null

  const coverageByBlock = useMemo(
    () => new Map(coverage.map((item) => [item.knowledge_block_id, item.mapped_questions])),
    [coverage]
  )

  const theoryLevelCount = links.filter((link) => link.knowledge_block_id == null).length

  const toggleQuestion = (questionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleAllFiltered = () => {
    setSelectedIds((current) => {
      const filteredIds = filteredQuestions.map((question) => question.id)
      const allSelected = filteredIds.length > 0 && filteredIds.every((id) => current.has(id))
      const next = new Set(current)
      for (const id of filteredIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const handleBulkMap = async () => {
    if (selectedIds.size === 0) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const count = await bulkMapQuestionsToKnowledge({
        questionIds: Array.from(selectedIds),
        theoryId,
        knowledgeBlockId: targetBlockId,
        linkType,
        createdBy: authData.user?.id || null,
      })
      await loadLinksAndCoverage()
      setSelectedIds(new Set())
      setMessage(`Đã liên kết ${count} câu hỏi.`)
    } catch (err) {
      console.error('Bulk map error:', err)
      setError(err instanceof Error ? err.message : 'Không thể liên kết câu hỏi.')
    } finally {
      setSaving(false)
    }
  }

  const handleSingleMap = async (questionId: string) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      await mapQuestionToKnowledge({
        questionId,
        theoryId,
        knowledgeBlockId: targetBlockId,
        linkType,
        createdBy: authData.user?.id || null,
      })
      await loadLinksAndCoverage()
      setMessage('Đã cập nhật liên kết.')
    } catch (err) {
      console.error('Map question error:', err)
      setError(err instanceof Error ? err.message : 'Không thể liên kết câu hỏi.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (linkId: string) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await unmapKnowledgeLink(linkId)
      await loadLinksAndCoverage()
      setMessage('Đã xóa liên kết.')
    } catch (err) {
      console.error('Remove knowledge link error:', err)
      setError(err instanceof Error ? err.message : 'Không thể xóa liên kết.')
    } finally {
      setSaving(false)
    }
  }

  const allFilteredSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((question) => selectedIds.has(question.id))

  if (loading) {
    return (
      <>
        <AdminHeader title="Liên kết kiến thức - câu hỏi" />
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      </>
    )
  }

  if (!theory) {
    return (
      <>
        <AdminHeader title="Liên kết kiến thức - câu hỏi" />
        <div className="p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error || 'Không tìm thấy bài lý thuyết.'}
          </div>
        </div>
      </>
    )
  }

  return (
    <MathProvider>
      <AdminHeader title="Liên kết kiến thức - câu hỏi" subtitle={theory.title} />
      <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link
                href="/admin/knowledge-links"
                className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Danh sách bài
              </Link>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {theory.title}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Chọn đích liên kết, lọc câu hỏi rồi map theo vai trò phù hợp.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              <span className="text-slate-500">Tổng liên kết: </span>
              <strong className="text-teal-600">{links.length}</strong>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <Check className="h-4 w-4" />
              {message}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                    Đích liên kết
                  </h2>
                  <p className="text-xs text-slate-500">Theory hoặc knowledge block</p>
                </div>
                <button
                  onClick={() => {
                    setTargetBlockId(null)
                    setSelectedIds(new Set())
                  }}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left dark:border-slate-700/60 ${
                    targetBlockId === null
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate text-sm font-medium">Toàn bài lý thuyết</span>
                  </span>
                  <span className="text-xs">{theoryLevelCount}</span>
                </button>
                <div className="max-h-[55vh] overflow-y-auto">
                  {blocks.map((block) => {
                    const style = getBlockStyle(block.block_type)
                    const active = targetBlockId === block.id
                    return (
                      <button
                        key={block.id}
                        onClick={() => {
                          setTargetBlockId(block.id)
                          setSelectedIds(new Set())
                        }}
                        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 dark:border-slate-700/60 ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-900/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className={`block text-[10px] font-semibold uppercase ${style.text}`}>
                            {style.icon} {style.label}
                          </span>
                          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {block.title || '(Không có tiêu đề)'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          {coverageByBlock.get(block.id) || 0}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    )
                  })}
                  {blocks.length === 0 && (
                    <div className="p-5 text-center text-sm text-slate-500">
                      Bài này chưa có knowledge block.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
                <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Cấu hình liên kết
                </h3>
                <label className="mb-1 block text-xs text-slate-500">Vai trò câu hỏi</label>
                <select
                  value={linkType}
                  onChange={(event) => setLinkType(event.target.value as KnowledgeLinkType)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="supporting">Bổ trợ</option>
                  <option value="primary">Chính</option>
                  <option value="prerequisite">Tiên quyết</option>
                </select>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Mỗi câu chỉ có một liên kết chính. Khi chọn “Chính”, liên kết chính cũ
                  sẽ tự chuyển thành “Bổ trợ”.
                </p>
              </div>
            </aside>

            <main className="min-w-0">
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Đang liên kết vào
                    </p>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      {selectedTarget?.title || theory.title}
                    </p>
                  </div>
                  <button
                    onClick={handleBulkMap}
                    disabled={saving || selectedIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Liên kết {selectedIds.size} câu
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Tìm nội dung, ID hoặc nguồn đề..."
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-800"
                    />
                  </div>
                  <select
                    value={questionType}
                    onChange={(event) => setQuestionType(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="">Mọi loại câu</option>
                    <option value="multiple_choice">Nhiều lựa chọn</option>
                    <option value="true_false">Đúng / sai</option>
                    <option value="short_answer">Trả lời ngắn</option>
                  </select>
                  <select
                    value={cognitiveLevel}
                    onChange={(event) => setCognitiveLevel(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="">Mọi mức độ</option>
                    <option value="NB">Nhận biết</option>
                    <option value="TH">Thông hiểu</option>
                    <option value="VD">Vận dụng</option>
                    <option value="VDC">Vận dụng cao</option>
                  </select>
                  <select
                    value={mappingFilter}
                    onChange={(event) => setMappingFilter(event.target.value as MappingFilter)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="unmapped">Chưa map vào đích này</option>
                    <option value="mapped">Đã map vào đích này</option>
                  </select>
                </div>

                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={recommendedOnly}
                    onChange={(event) => setRecommendedOnly(event.target.checked)}
                    className="accent-teal-600"
                  />
                  Chỉ hiện câu cùng section với bài lý thuyết
                </label>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <button
                    onClick={toggleAllFiltered}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-600 dark:text-slate-200"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="h-4 w-4 text-teal-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Chọn tất cả kết quả
                  </button>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Filter className="h-3.5 w-3.5" />
                    {filteredQuestions.length}/{questions.length} câu
                  </span>
                </div>

                <div className="max-h-[68vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
                  {filteredQuestions.map((question) => {
                    const exactLinks = targetLinksByQuestion.get(question.id) || []
                    const allQuestionLinks = allLinksByQuestion.get(question.id) || []
                    const recommended = question.section_id === theory.section_id
                    const selected = selectedIds.has(question.id)
                    return (
                      <div
                        key={question.id}
                        className={`p-4 transition-colors ${
                          selected ? 'bg-teal-50/70 dark:bg-teal-900/10' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleQuestion(question.id)}
                            className="mt-1 flex-shrink-0 text-slate-400 hover:text-teal-600"
                            aria-label={selected ? 'Bỏ chọn câu hỏi' : 'Chọn câu hỏi'}
                          >
                            {selected ? (
                              <CheckSquare className="h-5 w-5 text-teal-600" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-700">
                                {question.id}
                              </span>
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}
                              </span>
                              {question.cognitive_level && (
                                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                  {question.cognitive_level}
                                </span>
                              )}
                              {recommended && (
                                <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                  Cùng section
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-3 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                              {plainText(question.content) || '(Câu hỏi không có nội dung chữ)'}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {question.subsection_name || question.section_name ? (
                                <span>{question.subsection_name || question.section_name}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-600">
                                  <CircleOff className="h-3 w-3" />
                                  Chưa có taxonomy
                                </span>
                              )}
                              {question.source_exam && <span>• {question.source_exam}</span>}
                              {allQuestionLinks.length > 0 && (
                                <span>• {allQuestionLinks.length} liên kết trong bài</span>
                              )}
                            </div>

                            {exactLinks.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {exactLinks.map((link) => (
                                  <span
                                    key={link.id}
                                    className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-xs text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                                  >
                                    {LINK_LABELS[link.link_type]}
                                    <button
                                      onClick={() => handleRemove(link.id)}
                                      disabled={saving}
                                      className="rounded-full p-0.5 hover:bg-teal-200 disabled:opacity-50 dark:hover:bg-teal-800"
                                      title="Xóa liên kết"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-1">
                            <button
                              onClick={() => setPreviewQuestion(question)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                              title="Xem đầy đủ"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleSingleMap(question.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Map
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {filteredQuestions.length === 0 && (
                    <div className="p-12 text-center">
                      <Search className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                      <p className="text-sm text-slate-500">
                        Không có câu hỏi phù hợp bộ lọc.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      {previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setPreviewQuestion(null)}
          />
          <div className="relative max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">{previewQuestion.id}</p>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                  Xem trước câu hỏi
                </h3>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <MathContent content={previewQuestion.content} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {targetLinksByQuestion.get(previewQuestion.id)?.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleRemove(link.id)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa {LINK_LABELS[link.link_type]}
                </button>
              ))}
              <button
                onClick={() => handleSingleMap(previewQuestion.id)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Map {LINK_LABELS[linkType]}
              </button>
            </div>
          </div>
        </div>
      )}
    </MathProvider>
  )
}
