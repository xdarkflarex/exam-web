'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { 
  PenLine, Plus, Search, Trash2, Edit3, Eye, 
  Clock, CheckCircle, AlertCircle, FileText 
} from 'lucide-react'

interface Post {
  id: string
  title: string
  slug: string
  excerpt: string | null
  status: 'draft' | 'review' | 'published'
  category: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  view_count: number
}

const STATUS_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'review', label: 'Chờ duyệt' },
  { key: 'published', label: 'Đã xuất bản' },
]

const STATUS_CONFIG = {
  draft: { label: 'Nháp', color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300', icon: Clock },
  review: { label: 'Chờ duyệt', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', icon: AlertCircle },
  published: { label: 'Đã xuất bản', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
}

export default function PostsListPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, slug, excerpt, status, category, published_at, created_at, updated_at, view_count')
        .order('updated_at', { ascending: false })

      if (!error && data) {
        setPosts(data)
      }
    } catch (err) {
      console.error('Error fetching posts:', err)
    } finally {
      setLoading(false)
    }
  }

  const deletePost = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa bài viết này?')) return
    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (!error) {
      setPosts(posts.filter(p => p.id !== id))
    }
  }

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status }
    if (status === 'published') {
      updates.published_at = new Date().toISOString()
    }
    const { error } = await supabase.from('posts').update(updates).eq('id', id)
    if (!error) {
      setPosts(posts.map(p => p.id === id ? { ...p, ...updates } : p))
    }
  }

  const filteredPosts = posts
    .filter(p => activeTab === 'all' || p.status === activeTab)
    .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()))

  const counts = {
    all: posts.length,
    draft: posts.filter(p => p.status === 'draft').length,
    review: posts.filter(p => p.status === 'review').length,
    published: posts.filter(p => p.status === 'published').length,
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <PenLine className="w-7 h-7 text-teal-600 dark:text-teal-400" />
              Bài viết
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Quản lý bài viết & tin tức
            </p>
          </div>
          <Link
            href="/admin/posts/new"
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 text-white font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Tạo bài viết
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm bài viết..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-teal-500 dark:focus:border-teal-400 outline-none transition-colors"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-200 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-fit px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label} ({counts[tab.key as keyof typeof counts]})
            </button>
          ))}
        </div>

        {/* Posts List */}
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">Chưa có bài viết nào</p>
            <Link href="/admin/posts/new" className="text-teal-600 dark:text-teal-400 text-sm hover:underline mt-2 inline-block">
              Tạo bài viết đầu tiên →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map(post => {
              const statusCfg = STATUS_CONFIG[post.status]
              const StatusIcon = statusCfg.icon
              return (
                <div key={post.id} className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-300 dark:border-slate-700 hover:border-teal-500/40 dark:hover:border-teal-400/40 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link href={`/admin/posts/${post.id}/edit`} className="group">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                          {post.title || 'Chưa có tiêu đề'}
                        </h3>
                      </Link>
                      {post.excerpt && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{post.excerpt}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                        {post.category && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {post.category}
                          </span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(post.updated_at).toLocaleDateString('vi-VN')}
                        </span>
                        {post.status === 'published' && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {post.view_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {post.status === 'draft' && (
                        <button
                          onClick={() => updateStatus(post.id, 'review')}
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          title="Gửi duyệt"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      )}
                      {post.status === 'review' && (
                        <button
                          onClick={() => updateStatus(post.id, 'published')}
                          className="p-2 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                          title="Xuất bản"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <Link
                        href={`/admin/posts/${post.id}/edit`}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => deletePost(post.id)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
