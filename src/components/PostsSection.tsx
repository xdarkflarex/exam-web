'use client'

import { useState } from 'react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import PostModal from '@/components/PostModal'

interface PostItem {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image: string | null
  category: string | null
  published_at: string | null
}

interface PostsSectionProps {
  posts: PostItem[]
}

export default function PostsSection({ posts }: PostsSectionProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)

  if (posts.length === 0) return null

  return (
    <>
      <section className="py-16 bg-slate-200/50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollRevealClient>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">Bài viết mới nhất</h2>
              <p className="text-slate-600 dark:text-slate-400">Tin tức, hướng dẫn và kiến thức bổ ích</p>
            </div>
          </ScrollRevealClient>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, index) => (
              <ScrollRevealClient key={post.id} delay={index * 80}>
                <div
                  onClick={() => setSelectedPostId(post.id)}
                  className="group cursor-pointer bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 hover:border-teal-500/60 dark:hover:border-teal-400/60 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                >
                  {post.cover_image && (
                    <div className="h-40 overflow-hidden">
                      <img src={post.cover_image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="p-5">
                    {post.category && <span className="inline-block text-xs font-medium text-teal-600 dark:text-teal-400 mb-2">{post.category}</span>}
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-2 mb-2">{post.title}</h3>
                    {post.excerpt && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{post.excerpt}</p>}
                    {post.published_at && <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">{new Date(post.published_at).toLocaleDateString('vi-VN')}</p>}
                  </div>
                </div>
              </ScrollRevealClient>
            ))}
          </div>
        </div>
      </section>

      <PostModal postId={selectedPostId} onClose={() => setSelectedPostId(null)} />
    </>
  )
}
