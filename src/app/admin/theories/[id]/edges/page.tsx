'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import {
  getTheoryById,
  getTheoryEdges,
  createTheoryEdge,
  deleteTheoryEdge,
  searchTheories,
} from '@/lib/theories/actions'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, GitBranch, Plus, Trash2, Search, X,
  ArrowRight, Link2, Layers
} from 'lucide-react'
import type { EdgeRelationType, TheoryEdgeWithDetails, Theory } from '@/types/theories'

const RELATION_LABELS: Record<EdgeRelationType, { label: string; color: string }> = {
  prerequisite: {
    label: 'Tiên quyết',
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  },
  related: {
    label: 'Liên quan',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  },
  extension: {
    label: 'Mở rộng',
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  },
}

export default function TheoryEdgesPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const theoryId = params.id as string

  const [loading, setLoading] = useState(true)
  const [theoryTitle, setTheoryTitle] = useState('')
  const [edges, setEdges] = useState<TheoryEdgeWithDetails[]>([])

  // Add edge form
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Theory[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedTheory, setSelectedTheory] = useState<Theory | null>(null)
  const [relationType, setRelationType] = useState<EdgeRelationType>('prerequisite')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [theoryId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const theory = await getTheoryById(theoryId)
      if (theory) {
        setTheoryTitle(theory.title)
      }

      const edgesData = await getTheoryEdges(theoryId)
      if (edgesData) {
        setEdges(edgesData as TheoryEdgeWithDetails[])
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const results = await searchTheories(query)
      // Filter out current theory
      setSearchResults(results.filter(t => t.id !== theoryId))
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleAddEdge = async () => {
    if (!selectedTheory) {
      setMessage({ type: 'error', text: 'Vui lòng chọn bài lý thuyết' })
      return
    }
    setAdding(true)
    setMessage(null)

    try {
      await createTheoryEdge(theoryId, selectedTheory.id, relationType)
      setMessage({ type: 'success', text: 'Đã thêm liên kết!' })
      setSelectedTheory(null)
      setSearchQuery('')
      setSearchResults([])
      await fetchData()
    } catch (err: any) {
      console.error('Add edge error:', err)
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi thêm liên kết' })
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteEdge = async (edgeId: string) => {
    if (!confirm('Bạn có chắc muốn xóa liên kết này?')) return
    try {
      await deleteTheoryEdge(edgeId)
      setEdges(edges.filter(e => e.id !== edgeId))
      setMessage({ type: 'success', text: 'Đã xóa liên kết!' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi xóa' })
    }
  }

  if (loading) {
    return (
      <>
        <AdminHeader title="Quản lý tiên quyết" />
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">Đang tải...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AdminHeader title="Quản lý tiên quyết" />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => router.push(`/admin/theories/${theoryId}/edit`)}
              className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Quản lý tiên quyết
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Bài: <span className="font-medium text-slate-700 dark:text-slate-300">{theoryTitle}</span>
              </p>
            </div>
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

          {/* Add New Edge */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 mb-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Thêm liên kết mới
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Search theory */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tìm bài lý thuyết
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Tìm theo tên bài..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
                  />
                  {/* Search results dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                      {searchResults.map(theory => (
                        <button
                          key={theory.id}
                          onClick={() => {
                            setSelectedTheory(theory)
                            setSearchQuery(theory.title)
                            setSearchResults([])
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-sm text-slate-800 dark:text-slate-100 transition-colors first:rounded-t-xl last:rounded-b-xl"
                        >
                          {theory.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedTheory && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-1 rounded-lg">
                      Đã chọn: {selectedTheory.title}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedTheory(null)
                        setSearchQuery('')
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Relation type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Loại quan hệ
                </label>
                <select
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value as EdgeRelationType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm outline-none"
                >
                  <option value="prerequisite">Tiên quyết</option>
                  <option value="related">Liên quan</option>
                  <option value="extension">Mở rộng</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleAddEdge}
              disabled={!selectedTheory || adding}
              className="mt-4 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {adding ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Thêm liên kết
            </button>
          </div>

          {/* Existing Edges */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Liên kết hiện tại ({edges.length})
              </h3>
            </div>

            {edges.length === 0 ? (
              <div className="text-center py-12">
                <Link2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">Chưa có liên kết nào</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {edges.map(edge => {
                  const isFrom = edge.from_theory_id === theoryId
                  const otherTheory = isFrom ? edge.to_theory : edge.from_theory
                  const relationConfig = RELATION_LABELS[edge.relation_type]

                  return (
                    <div key={edge.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ArrowRight className={`w-4 h-4 flex-shrink-0 ${
                          isFrom ? 'text-teal-500' : 'text-slate-400 rotate-180'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {otherTheory?.title || 'Không xác định'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${relationConfig.color}`}>
                              {relationConfig.label}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {isFrom ? 'Bài này → Bài kia' : 'Bài kia → Bài này'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEdge(edge.id)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
                        title="Xóa liên kết"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
