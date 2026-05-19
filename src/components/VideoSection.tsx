'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'

export interface VideoItem {
  youtube_url: string
  title?: string
}

interface VideoSectionProps {
  videos: VideoItem[]
  title?: string
  subtitle?: string
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
}: VideoSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (videos.length === 0) return null

  const activeVideo = videos[activeIndex]
  const activeId = getYouTubeId(activeVideo.youtube_url)

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3">
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
                    onClick={() => setActiveIndex(i)}
                    className={`w-full flex items-start gap-3 p-2 rounded-xl transition-all duration-200 text-left ${
                      i === activeIndex
                        ? 'bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-500 dark:border-teal-400'
                        : 'bg-slate-200 dark:bg-slate-800 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="relative w-28 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-300 dark:bg-slate-700">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={video.title || `Video ${i + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className={`text-sm font-medium truncate ${
                        i === activeIndex
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {video.title || `Video ${i + 1}`}
                      </p>
                    </div>
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
