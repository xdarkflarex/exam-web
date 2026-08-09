'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { surfaceClass, type SectionSurface } from '@/components/landing/sectionSurface'

export interface VideoItem {
  youtube_url: string
  title?: string
}

interface VideoSectionProps {
  videos: VideoItem[]
  title?: string
  subtitle?: string
  surface?: SectionSurface
}

function getYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/
  )
  return match ? match[1] : null
}

export default function VideoSection({
  videos,
  title = 'Video giới thiệu',
  subtitle = 'Tìm hiểu thêm về chúng tôi qua video',
  surface = 'plain',
}: VideoSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (videos.length === 0) return null

  const activeVideo = videos[activeIndex]
  const activeId = getYouTubeId(activeVideo.youtube_url)

  return (
    <section className={`py-16 sm:py-20 ${surfaceClass(surface)}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
            {title}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        </div>

        <div className={`grid gap-6 ${videos.length > 1 ? 'lg:grid-cols-3' : ''}`}>
          {/* Main video */}
          <div className={videos.length > 1 ? 'lg:col-span-2' : ''}>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-xl">
              {activeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${activeId}?rel=0`}
                  title={activeVideo.title || 'Video'}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <p>Video không hợp lệ</p>
                </div>
              )}
            </div>
            {activeVideo.title && (
              <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                {activeVideo.title}
              </h3>
            )}
          </div>

          {/* Thumbnails sidebar */}
          {videos.length > 1 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {videos.map((video, i) => {
                const vid = getYouTubeId(video.youtube_url)
                const thumbUrl = vid
                  ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
                  : ''
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-current={i === activeIndex ? 'true' : undefined}
                    className={`w-full flex items-start gap-3 p-2 rounded-xl transition-all duration-200 text-left ${
                      i === activeIndex
                        ? 'bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-500 dark:border-teal-400'
                        : 'bg-[var(--background-card)] border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/*
                      `<button>` chỉ được chứa phrasing content. Bản trước lồng
                      `<div>` và `<p>` vào trong nút — HTML không hợp lệ, và
                      "Invalid HTML tag nesting" nằm đúng trong danh sách nguyên
                      nhân gây lỗi hydration của Next.js. Mọi khối ở đây đổi sang
                      `<span className="block">`, cấu trúc thị giác giữ nguyên.
                    */}
                    <span className="relative block w-28 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-300 dark:bg-slate-700">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white ml-0.5" aria-hidden="true" />
                        </span>
                      </span>
                    </span>
                    <span className="flex-1 min-w-0 py-0.5">
                      <span className={`block text-sm font-medium truncate ${
                        i === activeIndex
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {video.title || `Video ${i + 1}`}
                      </span>
                      {/* Trạng thái = màu + icon + CHỮ. Viền teal một mình không
                          nói được "video nào đang phát" cho người không phân biệt
                          được màu. */}
                      {i === activeIndex && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                          <Play className="w-3 h-3" aria-hidden="true" />
                          Đang xem
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
