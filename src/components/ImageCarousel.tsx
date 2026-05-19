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

      {/* Arrows */}
      {showArrows && total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Dots */}
      {showDots && total > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-8 h-2.5 bg-white'
                  : 'w-2.5 h-2.5 bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
