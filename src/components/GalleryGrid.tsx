'use client'

import { useState, useMemo } from 'react'
import { X, ZoomIn } from 'lucide-react'

export interface GalleryItem {
  image_url: string
  title?: string
  category?: string
}

interface GalleryGridProps {
  items: GalleryItem[]
  title?: string
  subtitle?: string
}

export default function GalleryGrid({
  items,
  title = 'Thư viện ảnh',
  subtitle = 'Hình ảnh hoạt động, lớp học và sự kiện',
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

  return (
    <>
      <section className="py-16 sm:py-20 bg-slate-200/50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
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
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeTab === cat
                      ? 'bg-teal-600 dark:bg-teal-500 text-white shadow-md'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((item, i) => (
              <div
                key={`${activeTab}-${i}`}
                className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border border-slate-300 dark:border-slate-700 hover:border-teal-500/60 dark:hover:border-teal-400/60 transition-all duration-300 hover:shadow-xl animate-in fade-in zoom-in-95 duration-300"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => setLightbox(item)}
              >
                <img
                  src={item.image_url}
                  alt={item.title || `Gallery ${i + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                  {item.title && (
                    <span className="text-white text-sm font-medium truncate">{item.title}</span>
                  )}
                </div>
                <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 dark:bg-slate-800/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <ZoomIn className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                </div>
              </div>
            ))}
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
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative max-w-4xl max-h-[85vh] animate-in zoom-in-90 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.image_url}
              alt={lightbox.title || 'Gallery image'}
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
