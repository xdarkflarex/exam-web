'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AdminHeader } from '@/components/admin'
import { getTheoryCoverage } from '@/lib/theories/actions'
import type { TheoryQuestionCoverage } from '@/types/theories'
import {
  Link2,
  Search,
  AlertTriangle,
  ChevronRight,
  BookOpen,
  RefreshCw,
} from 'lucide-react'

export default function KnowledgeLinksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [coverage, setCoverage] = useState<TheoryQuestionCoverage[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadCoverage = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTheoryCoverage()
      setCoverage(data)
    } catch (err) {
      console.error('Lỗi tải coverage:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể tải coverage. Hãy kiểm tra migration question_knowledge_links.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCoverage()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? coverage.filter(c => c.theory_title?.toLowerCase().includes(q))
      : coverage
    return [...list].sort((a, b) => a.mapped_questions - b.mapped_questions)
  }, [coverage, search])

  const totals = useMemo(() => {
    const totalTheories = coverage.length
    const noQuestion = coverage.filter(c => c.mapped_questions === 0).length
    const mappedTotal = coverage.reduce((s, c) => s + (c.mapped_questions || 0), 0)
    return { totalTheories, noQuestion, mappedTotal }
  }, [coverage])

  return (
    <>
      <AdminHeader title="Liên kết kiến thức - câu hỏi" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Quản lý liên kết kiến thức
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Liên kết câu hỏi tới bài lý thuyết và khối tri thức. Không ảnh hưởng tới các editor hiện tại.
          </p>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Tổng số bài</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totals.totalTheories}</p>
            </div>
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Tổng coverage theo bài</p>
              <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{totals.mappedTotal}</p>
            </div>
            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Bài chưa có câu hỏi</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{totals.noQuestion}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm bài lý thuyết..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Không tải được dữ liệu liên kết</p>
                  <p className="mt-1 text-sm">{error}</p>
                  <button
                    onClick={() => void loadCoverage()}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
                  Không có bài lý thuyết phù hợp
                </div>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.theory_id}
                    onClick={() => router.push(`/admin/knowledge-links/${c.theory_id}`)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {c.theory_title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {c.mapped_questions === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3" /> Chưa có câu hỏi
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                          {c.mapped_questions} câu ({c.block_mapped_questions} theo block)
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
