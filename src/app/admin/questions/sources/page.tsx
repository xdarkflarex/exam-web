'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import {
  Layers, Search, RefreshCw, CheckSquare, Square, ArrowRight,
  AlertCircle, Loader2, FolderInput, Check
} from 'lucide-react'

interface SourceRow {
  source: string
  count: number
}

const DEFAULT_TARGET = 'Câu hỏi luyện chuyên đề'

export default function AdminQuestionSourcesPage() {
  const supabase = createClient()

  const [sources, setSources] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Target source
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('new')
  const [targetExisting, setTargetExisting] = useState('')
  const [targetNew, setTargetNew] = useState(DEFAULT_TARGET)

  // Confirm + status
  const [showConfirm, setShowConfirm] = useState(false)
  const [merging, setMerging] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchSources()
  }, [])

  const fetchSources = async () => {
    setLoading(true)
    try {
      // Fetch all source_exam values (non-null) and count client-side.
      const { data, error } = await supabase
        .from('questions')
        .select('source_exam')
        .not('source_exam', 'is', null)

      if (error) {
        logger.supabaseError('fetch source_exam', error)
        setMessage({ type: 'error', text: 'Không thể tải danh sách nguồn' })
        return
      }

      const countMap = new Map<string, number>()
      for (const row of data || []) {
        const s = (row.source_exam || '').trim()
        if (!s) continue
        countMap.set(s, (countMap.get(s) || 0) + 1)
      }

      const rows: SourceRow[] = [...countMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => a.source.localeCompare(b.source, 'vi'))

      setSources(rows)
    } catch (err) {
      logger.error('Fetch sources error', err)
      setMessage({ type: 'error', text: 'Lỗi kết nối' })
    } finally {
      setLoading(false)
    }
  }

  const filteredSources = useMemo(() => {
    if (!searchTerm) return sources
    const q = searchTerm.toLowerCase()
    return sources.filter(s => s.source.toLowerCase().includes(q))
  }, [sources, searchTerm])

  const toggleSelect = (source: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const allFilteredSelected = filteredSources.length > 0 &&
    filteredSources.every(s => selected.has(s.source))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredSources.map(s => s.source)))
    }
  }

  const targetValue = (targetMode === 'existing' ? targetExisting : targetNew).trim()

  const affectedCount = useMemo(() => {
    return sources
      .filter(s => selected.has(s.source))
      .reduce((sum, s) => sum + s.count, 0)
  }, [sources, selected])

  const canMerge = selected.size > 0 && targetValue.length > 0

  const openConfirm = () => {
    setMessage(null)
    if (!canMerge) return
    setShowConfirm(true)
  }

  const handleMerge = async () => {
    if (!canMerge) return
    setMerging(true)
    setMessage(null)
    try {
      const fromList = [...selected].filter(s => s !== targetValue)
      if (fromList.length === 0) {
        setMessage({ type: 'error', text: 'Các nguồn đã chọn trùng với nguồn đích.' })
        setMerging(false)
        setShowConfirm(false)
        return
      }

      const { error } = await supabase
        .from('questions')
        .update({ source_exam: targetValue })
        .in('source_exam', fromList)

      if (error) {
        setMessage({ type: 'error', text: logger.supabaseError('merge sources', error) })
        return
      }

      setMessage({
        type: 'success',
        text: `Đã gộp ${fromList.length} nguồn (${affectedCount} câu hỏi) về "${targetValue}".`
      })
      setSelected(new Set())
      setShowConfirm(false)
      await fetchSources()
    } catch (err) {
      logger.error('Merge sources error', err)
      setMessage({ type: 'error', text: 'Đã xảy ra lỗi khi gộp nguồn' })
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="min-h-screen">
      <AdminHeader
        title="Gom nguồn câu hỏi"
        subtitle={`${sources.length} nguồn (source_exam) trong hệ thống`}
      />

      <div className="p-6 space-y-6">
        {message && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message.text}
          </div>
        )}

        {/* Target selector */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <FolderInput className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Nguồn đích (gán lại về)</span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  checked={targetMode === 'new'}
                  onChange={() => setTargetMode('new')}
                  className="accent-teal-600"
                />
                Tên nguồn mới
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  checked={targetMode === 'existing'}
                  onChange={() => setTargetMode('existing')}
                  className="accent-teal-600"
                />
                Chọn nguồn có sẵn
              </label>
            </div>

            {targetMode === 'new' ? (
              <input
                type="text"
                value={targetNew}
                onChange={(e) => setTargetNew(e.target.value)}
                placeholder="VD: Câu hỏi luyện chuyên đề"
                className="w-full md:max-w-md px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            ) : (
              <select
                value={targetExisting}
                onChange={(e) => setTargetExisting(e.target.value)}
                className="w-full md:max-w-md px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              >
                <option value="">-- Chọn nguồn đích --</option>
                {sources.map(s => (
                  <option key={s.source} value={s.source}>{s.source} ({s.count})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nguồn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSources}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              onClick={toggleSelectAll}
              disabled={filteredSources.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
            <button
              onClick={openConfirm}
              disabled={!canMerge}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              Gán lại {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Đã chọn <span className="font-medium text-teal-600 dark:text-teal-400">{selected.size}</span> nguồn
            {' '}• <span className="font-medium">{affectedCount}</span> câu hỏi sẽ được gán về
            {' '}<span className="font-medium">"{targetValue || '...'}"</span>
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-12 text-center">
            <Layers className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">
              {searchTerm ? 'Không tìm thấy nguồn phù hợp' : 'Chưa có nguồn câu hỏi nào'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSources.map(row => {
              const isSelected = selected.has(row.source)
              const isTarget = row.source === targetValue
              return (
                <button
                  key={row.source}
                  onClick={() => toggleSelect(row.source)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-teal-300 bg-teal-50 dark:border-teal-600 dark:bg-teal-900/20'
                      : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-teal-200 dark:hover:border-teal-700'
                  }`}
                >
                  {isSelected
                    ? <CheckSquare className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    : <Square className="w-5 h-5 text-slate-300 dark:text-slate-500 flex-shrink-0" />}
                  <span className="flex-1 text-sm text-slate-800 dark:text-slate-100 truncate">
                    {row.source}
                    {isTarget && (
                      <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">(nguồn đích)</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                    {row.count} câu
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !merging && setShowConfirm(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Xác nhận gán lại nguồn</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Bạn sắp gán <span className="font-semibold">{affectedCount}</span> câu hỏi
              từ <span className="font-semibold">{selected.size}</span> nguồn
              về <span className="font-semibold">"{targetValue}"</span>.
              Thao tác này cập nhật trực tiếp dữ liệu và không thể hoàn tác tự động.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={merging}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleMerge}
                disabled={merging}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-lg text-sm transition-colors"
              >
                {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Xác nhận gán lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
