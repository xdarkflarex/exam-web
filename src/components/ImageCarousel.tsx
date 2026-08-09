'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CarouselSlide {
  image_url: string
  title?: string
  subtitle?: string
  link?: string
}

interface ImageCarouselProps {
  slides: CarouselSlide[]
  interval?: number
  height?: string
  overlay?: boolean
  showDots?: boolean
  showArrows?: boolean
  objectFit?: 'cover' | 'contain'
  children?: React.ReactNode
}

export default function ImageCarousel({
  slides,
  interval = 5000,
  height = 'h-[400px] sm:h-[500px] lg:h-[560px]',
  overlay = true,
  showDots = true,
  showArrows = true,
  objectFit = 'cover',
  children,
}: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)

  const total = slides.length

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % total)
  }, [total])

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + total) % total)
  }, [total])

  useEffect(() => {
    if (paused || total <= 1) return
    const timer = setInterval(next, interval)
    return () => clearInterval(timer)
  }, [paused, total, interval, next])

  if (total === 0) return null

  return (
    <div
      className={`relative w-full ${height} overflow-hidden group`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      {slides.map((slide, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-all duration-700 ease-in-out ${
            i === current
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-105'
          }`}
        >
          <img
            src={slide.image_url}
            alt={slide.title || `Slide ${i + 1}`}
            className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </div>
      ))}

      {/* Overlay gradient */}
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
      )}

      {/* Slide text overlay */}
      {(slides[current]?.title || slides[current]?.subtitle) && !children && (
        <div className="absolute bottom-16 left-0 right-0 text-center px-6 z-10">
          {slides[current].title && (
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 drop-shadow-lg font-baloo">
              {slides[current].title}
            </h2>
          )}
          {slides[current].subtitle && (
            <p className="text-base sm:text-lg text-white/90 max-w-2xl mx-auto drop-shadow">
              {slides[current].subtitle}
            </p>
          )}
        </div>
      )}

      {/* Custom overlay content (e.g. hero CTA) */}
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {children}
        </div>
      )}

      {/*
        Mũi tên.

        Trước đây là `opacity-0 group-hover:opacity-100`, tức chỉ hiện khi rê
        chuột — trên điện thoại không có trạng thái hover nên chúng VÔ HÌNH
        VĨNH VIỄN. Học sinh dùng điện thoại là phần lớn, nên mặc định hiện; từ
        `sm` trở lên mới quay lại kiểu ẩn-hiện-theo-hover cho desktop đỡ rối.

        Nền cũng đổi: bản cũ đặt `bg-white` rồi để chữ `text-white` lên trên —
        icon trắng trên nền trắng, gần như không nhìn thấy ở light mode.
      */}
      {showArrows && total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-slate-900/45 hover:bg-slate-900/65 text-white flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-slate-900/45 hover:bg-slate-900/65 text-white flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Ảnh tiếp theo"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </>
      )}

      {/*
        Chấm chuyển slide.

        Chấm nhìn thấy vẫn 10px, nhưng VÙNG BẤM phải đủ lớn: bản cũ để cả nút
        cao 10px, dưới xa mọi ngưỡng chạm. Nên nút được đệm `p-3` (thành 34px
        cao, và `-my-1.5` kéo lại để không đẩy layout), phần chấm chuyển vào
        `<span>` bên trong. Hình không đổi, ngón tay bấm được.
      */}
      {showDots && total > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="group/dot px-2 py-4 focus:outline-none"
              aria-label={`Chuyển tới ảnh ${i + 1}`}
              aria-current={i === current ? 'true' : undefined}
            >
              <span
                className={`block rounded-full transition-all duration-300 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-white ${
                  i === current
                    ? 'w-8 h-2.5 bg-white'
                    : 'w-2.5 h-2.5 bg-white/55 group-hover/dot:bg-white/80'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
