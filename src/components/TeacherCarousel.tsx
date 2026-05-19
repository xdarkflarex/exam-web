'use client'

import { useState, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface Teacher {
  name: string
  image_url: string
  description?: string
}

interface TeacherCarouselProps {
  teachers: Teacher[]
  title?: string
  subtitle?: string
}

export default function TeacherCarousel({
  teachers,
  title = 'Đội ngũ giáo viên',
  subtitle = 'Những chuyên gia giàu kinh nghiệm, đam mê giảng dạy và luôn tận tâm với công việc',
}: TeacherCarouselProps) {
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(4)

  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 640) setPerPage(1)
      else if (window.innerWidth < 1024) setPerPage(2)
      else setPerPage(4)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const totalPages = Math.ceil(teachers.length / perPage)

  const next = useCallback(() => {
    setPage((p) => (p + 1) % totalPages)
  }, [totalPages])

  const prev = useCallback(() => {
    setPage((p) => (p - 1 + totalPages) % totalPages)
  }, [totalPages])

  if (teachers.length === 0) return null

  const visibleTeachers = teachers.slice(page * perPage, page * perPage + perPage)

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-2">Đội ngũ</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
            {title}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Carousel */}
        <div className="relative">
          {/* Arrows */}
          {totalPages > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute -left-4 sm:-left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={next}
                className="absolute -right-4 sm:-right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {visibleTeachers.map((teacher, i) => (
              <div
                key={`${page}-${i}`}
                className="group text-center animate-in fade-in duration-500"
              >
                <div className="relative w-40 h-40 sm:w-44 sm:h-44 mx-auto mb-4 rounded-2xl overflow-hidden border-4 border-slate-200 dark:border-slate-700 group-hover:border-teal-500 dark:group-hover:border-teal-400 transition-all duration-300 shadow-md group-hover:shadow-xl">
                  <img
                    src={teacher.image_url}
                    alt={teacher.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-lg group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {teacher.name}
                </h3>
                {teacher.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {teacher.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dots */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === page
                    ? 'w-8 h-2.5 bg-teal-600 dark:bg-teal-400'
                    : 'w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
