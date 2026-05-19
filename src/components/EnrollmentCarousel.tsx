'use client'

import { useState } from 'react'
import { ZoomIn, X } from 'lucide-react'
import ImageCarousel, { CarouselSlide } from './ImageCarousel'

interface EnrollmentCarouselProps {
  slides: CarouselSlide[]
  title?: string
  subtitle?: string
  interval?: number
}

export default function EnrollmentCarousel({
  slides,
  title = 'Tuyển sinh & Lịch khai giảng',
  subtitle = 'Đăng ký ngay — Số lượng có hạn!',
  interval = 6000,
}: EnrollmentCarouselProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  if (slides.length === 0) return null

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-2">Tuyển sinh</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
            {title}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Banner Carousel */}
        <div className="relative rounded-2xl overflow-hidden shadow-xl border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-950 group/carousel">
          <ImageCarousel
            slides={slides}
            interval={interval}
            height="aspect-video"
            overlay={false}
            showDots={true}
            showArrows={true}
            objectFit="contain"
          />
          {/* Zoom button */}
          <button
            onClick={() => setLightboxIdx(0)}
            className="absolute top-3 right-3 z-30 p-2.5 rounded-xl bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white transition-all opacity-0 group-hover/carousel:opacity-100"
            title="Xem phóng to"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>

        {/* Slide thumbnails for zoom */}
        {slides.length > 1 && (
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            {slides.map((slide, i) => (
              <button
                key={i}
                onClick={() => setLightboxIdx(i)}
                className="w-16 h-10 rounded-lg overflow-hidden border-2 border-transparent hover:border-teal-500 transition-all opacity-80 hover:opacity-100"
                title={`Xem banner ${i + 1}`}
              >
                <img src={slide.image_url} alt={slide.title || `Banner ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Popup */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-[enroll-fadeIn_0.2s_ease]"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation */}
          {slides.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + slides.length) % slides.length) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % slides.length) }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </>
          )}

          <img
            src={slides[lightboxIdx].image_url}
            alt={slides[lightboxIdx].title || 'Banner'}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-[enroll-slideUp_0.3s_ease]"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Slide indicator */}
          {slides.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx(i) }}
                  className={`rounded-full transition-all ${i === lightboxIdx ? 'w-8 h-2.5 bg-white' : 'w-2.5 h-2.5 bg-white/50 hover:bg-white/70'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
