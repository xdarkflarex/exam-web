'use client'

import { useState } from 'react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import PostModal from '@/components/PostModal'
import { surfaceClass, type SectionSurface } from '@/components/landing/sectionSurface'

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
  surface?: SectionSurface
}

/**
 * Một thẻ bài viết, hai cỡ.
 *
 * `featured` là bài đầu: ảnh cao hơn, tiêu đề lớn hơn, hiện đủ excerpt. Bài
 * thường nằm ngang, ảnh nhỏ bên trái để ba bài xếp vừa chiều cao của bài nổi bật.
 *
 * Khối này mở modal nên nó là NÚT thật, cần bấm được bằng bàn phím và có
 * accessible name — bản gốc dùng `<div onClick>` nên không có cả hai.
 *
 * Nhưng `<button>` chỉ được chứa phrasing content, không được chứa `<div>`,
 * `<h3>`, `<p>`. Bọc cả thẻ bài trong `<button>` là HTML không hợp lệ, và
 * "Invalid HTML tag nesting" nằm đúng trong danh sách nguyên nhân gây lỗi
 * hydration của Next.js.
 *
 * Nên dùng mẫu "stretched link": `<article>` giữ cấu trúc thật (có `<h3>` để
 * không mất document outline), `<button>` chỉ chứa chữ tiêu đề và phủ kín thẻ
 * bằng `after:absolute after:inset-0`. Vùng bấm vẫn là cả thẻ, tiêu đề vẫn là
 * tiêu đề, và markup hợp lệ.
 */
function PostCard({
  post,
  featured = false,
  onOpen,
}: {
  post: PostItem
  featured?: boolean
  onOpen: (id: string) => void
}) {
  const dateLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString('vi-VN')
    : null

  return (
    /*
      Bề mặt thẻ lấy từ từ vựng bento dùng chung (`.bento-tile-lead` /
      `.bento-tile` trong globals.css) thay vì hardcode `bg-slate-200`. Nhờ vậy
      thẻ bài viết, thẻ đề thi và ô truy cập nhanh cùng nằm trên một thang bề
      mặt — cái phân biệt chúng là CỠ và HÌNH, không phải mỗi nơi một sắc xám.
      `.bento-*-interactive` vì thẻ ở đây là `<article>`, không phải `<a>`.
    */
    <article
      className={`group relative h-full overflow-hidden bento-tile-interactive transition-all duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-500 ${
        featured ? 'bento-tile-lead flex flex-col' : 'bento-tile flex flex-row items-stretch'
      }`}
    >
      {post.cover_image && (
        <div className={featured ? 'h-56 overflow-hidden sm:h-64' : 'w-28 shrink-0 overflow-hidden sm:w-32'}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover_image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}
      <div className={`min-w-0 flex-1 ${featured ? 'p-6' : 'p-4'}`}>
        {post.category && (
          <span className="mb-2 inline-block rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
            {post.category}
          </span>
        )}
        <h3
          className={`font-semibold text-slate-800 transition-colors line-clamp-2 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-300 ${
            featured ? 'mb-3 text-xl font-baloo sm:text-2xl' : 'mb-1 text-base'
          }`}
        >
          {/* `after:` phủ kín thẻ nên vùng bấm là cả card, nhưng thẻ `button`
              chỉ chứa chữ — markup hợp lệ. `cursor-pointer` đặt ở lớp phủ để
              con trỏ đổi trên toàn thẻ chứ không riêng dòng tiêu đề. */}
          <button
            type="button"
            onClick={() => onOpen(post.id)}
            className="text-left after:absolute after:inset-0 after:cursor-pointer focus:outline-none"
          >
            {post.title}
          </button>
        </h3>
        {post.excerpt && (
          <p className={`text-sm text-slate-600 dark:text-slate-400 ${featured ? 'line-clamp-3' : 'line-clamp-2'}`}>
            {post.excerpt}
          </p>
        )}
        {/* `dark:text-slate-400`, không phải `-500`: slate-500 trên nền thẻ tối
            chỉ đạt 3,07:1, dưới chuẩn 4,5 cho chữ nhỏ (đo 2026-08-09). */}
        {dateLabel && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{dateLabel}</p>
        )}
      </div>
    </article>
  )
}

export default function PostsSection({ posts, surface = 'plain' }: PostsSectionProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)

  if (posts.length === 0) return null

  return (
    <>
      <section id="posts" className={`scroll-mt-32 py-16 ${surfaceClass(surface)}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollRevealClient>
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">Bài viết mới nhất</h2>
              <p className="text-slate-600 dark:text-slate-400">Tin tức, hướng dẫn và kiến thức bổ ích</p>
            </div>
          </ScrollRevealClient>
          {/*
            Bài đầu chiếm nửa trái, các bài còn lại xếp dọc bên phải.

            Lưới ba cột đều nhau khiến khối này trông y hệt khối đề thi ngay trên
            nó — cùng số cột, cùng cỡ card, cùng bo góc. Bất đối xứng ở đây vừa
            phá nhịp lặp vừa nói đúng một điều có thật: bài mới nhất đáng đọc
            trước. Dưới `lg` thì đổ về một cột, nên trên điện thoại vẫn là thứ
            tự đọc tự nhiên.
          */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ScrollRevealClient>
              <PostCard post={posts[0]} featured onOpen={setSelectedPostId} />
            </ScrollRevealClient>

            {posts.length > 1 && (
              <div className="flex flex-col gap-4">
                {posts.slice(1, 4).map((post, index) => (
                  <ScrollRevealClient key={post.id} delay={(index + 1) * 80}>
                    <PostCard post={post} onOpen={setSelectedPostId} />
                  </ScrollRevealClient>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <PostModal postId={selectedPostId} onClose={() => setSelectedPostId(null)} />
    </>
  )
}
