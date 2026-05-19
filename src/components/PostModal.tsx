'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, Calendar, Tag } from 'lucide-react'

interface PostData {
  id: string
  title: string
  excerpt: string | null
  content: string | null
  cover_image: string | null
  category: string | null
  published_at: string | null
}

interface PostModalProps {
  postId: string | null
  onClose: () => void
}

export default function PostModal({ postId, onClose }: PostModalProps) {
  const supabase = createClient()
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!postId) {
      setPost(null)
      return
    }

    const fetchPost = async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('posts')
          .select('id, title, excerpt, content, cover_image, category, published_at')
          .eq('id', postId)
          .single()

        setPost(data)
      } catch {
        setPost(null)
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [postId])

  useEffect(() => {
    if (!postId) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [postId, onClose])

  if (!postId) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[5vh] sm:pt-[8vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl max-h-[85vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : post ? (
          <div className="overflow-y-auto flex-1">
            {/* Cover image */}
            {post.cover_image && (
              <div className="w-full h-48 sm:h-64 overflow-hidden">
                <img
                  src={post.cover_image}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Body */}
            <div className="p-6 sm:p-8">
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {post.category && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2.5 py-1 rounded-lg">
                    <Tag className="w-3 h-3" />
                    {post.category}
                  </span>
                )}
                {post.published_at && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(post.published_at).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 leading-tight">
                {post.title}
              </h2>

              {/* Excerpt */}
              {post.excerpt && (
                <p className="text-slate-500 dark:text-slate-400 text-sm italic mb-6 border-l-4 border-teal-500 pl-4">
                  {post.excerpt}
                </p>
              )}

              {/* Markdown content */}
              {post.content && (
                <div className="prose prose-slate dark:prose-invert prose-sm sm:prose-base max-w-none prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-a:text-teal-600 dark:prose-a:text-teal-400 prose-img:rounded-xl">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {post.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-slate-500">Không tìm thấy bài viết.</p>
          </div>
        )}
      </div>
    </div>
  )
}
