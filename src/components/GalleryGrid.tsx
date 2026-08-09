'use client'

import { useState, useMemo } from 'react'
import { X, ZoomIn } from 'lucide-react'
import { surfaceClass, type SectionSurface } from '@/components/landing/sectionSurface'

export interface GalleryItem {
  image_url: string
  title?: string
  category?: string
}

interface GalleryGridProps {
  items: GalleryItem[]
  title?: string
  subtitle?: string
  surface?: SectionSurface
}

/**
 * Chiều cao một hàng của lưới ảnh.
 *
 * Bản cũ dùng `aspect-square` trên từng ô nên mọi ô bắt buộc bằng nhau — không
 * cách nào cho một ảnh to hơn. Đặt chiều cao hàng cố định rồi cho ô đầu
 * `row-span-2 col-span-2` thì ảnh dẫn dắt to gấp bốn mà lưới vẫn thẳng hàng.
 */
const ROW_HEIGHT = 'auto-rows-[8.5rem] sm:auto-rows-[9.5rem] lg:auto-rows-[10.5rem]'

export default function GalleryGrid({
  items,
  title = 'Thư viện ảnh',
  subtitle = 'Hình ảnh hoạt động, lớp học và sự kiện',
  surface = 'plain',
}: GalleryGridProps) {
  const [activeTab, setActiveTab] = useState('Tất cả')
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null)

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean))
    return ['Tất cả', ...Array.from(cats)] as string[]
  }, [items])

  const filtered = activeTab === 'Tất cả'
    ? items
    : items.filter(i => i.category === activeTab)

  if (items.length === 0) return null

  // Ảnh dẫn dắt chỉ có nghĩa khi còn đủ ảnh nhỏ vây quanh nó. Dưới 5 ảnh thì
  // lưới đều nhau trông gọn hơn là một ô to kèm hai ô lẻ.
  const hasLead = filtered.length >= 5

  return (
    <>
      <section className={`py-16 sm:py-20 ${surfaceClass(surface)}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {subtitle}
            </p>
          </div>

          {/* Tabs */}
          {categories.length > 1 && (
            <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  aria-pressed={activeTab === cat}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeTab === cat
                      ? 'bg-teal-600 dark:bg-teal-500 text-white shadow-md'
                      : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-teal-500 dark:hover:border-teal-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/*
            Lưới ảnh dạng bento: ảnh đầu chiếm 2×2, phần còn lại là ô đơn.
            `grid-flow-dense` để ô nhỏ lấp vào khe trống bên phải ô lớn thay vì
            để lại lỗ.

            Ô ảnh là NÚT thật (`<button>`) chứ không phải `<div onClick>` như bản
            trước — bản trước không bấm được bằng bàn phím và không có tên đọc
            được cho screen reader. `<button>` chỉ được chứa phrasing content nên
            mọi lớp phủ ở đây đều là `<span>`, không phải `<div>`.
          */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 ${ROW_HEIGHT} grid-flow-row-dense gap-3 sm:gap-4`}>
            {filtered.map((item, i) => {
              const isLead = hasLead && i === 0
              return (
                <button
                  key={`${activeTab}-${i}`}
                  type="button"
                  onClick={() => setLightbox(item)}
                  aria-label={item.title ? `Xem ảnh: ${item.title}` : `Xem ảnh ${i + 1}`}
                  className={`group relative block h-full w-full overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-700 hover:border-teal-500/60 dark:hover:border-teal-400/60 transition-all duration-300 soft-shadow hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    isLead ? 'col-span-2 row-span-2' : ''
                  }`}
                >
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    {item.title && (
                      <span className={`text-white font-medium truncate ${isLead ? 'text-base' : 'text-sm'}`}>
                        {item.title}
                      </span>
                    )}
                  </span>
                  <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300">
                    <ZoomIn className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
            aria-label="Đóng ảnh"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative max-w-4xl max-h-[85vh] animate-in zoom-in-90 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.image_url}
              alt={lightbox.title || 'Ảnh thư viện'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            {lightbox.title && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg">
                <p className="text-white font-medium text-center">{lightbox.title}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
