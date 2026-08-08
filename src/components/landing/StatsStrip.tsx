import { BookOpen, GraduationCap, Newspaper, Layers } from 'lucide-react'
import CountUpNumber from './CountUpNumber'

/**
 * Dải số liệu dưới hero.
 *
 * Số liệu ở đây là số ĐẾM THẬT từ dữ liệu công khai (đề đã xuất bản, chuyên đề
 * đã xuất bản, bài viết đã xuất bản). Không hardcode "50k+ học sinh" như trong
 * bản thiết kế mẫu: trang tuyển sinh nói số không có thật là vấn đề tin cậy.
 *
 * Ô nào không lấy được số (RLS chặn, bảng rỗng) thì bị loại khỏi lưới thay vì
 * hiển thị 0 — xem `StatsStripProps`.
 */
export interface LandingStats {
  exams: number
  theories: number
  posts: number
  topics: number
}

interface StatsStripProps {
  stats: LandingStats
}

const ITEMS = [
  { key: 'exams', label: 'Đề luyện tập', Icon: BookOpen },
  { key: 'topics', label: 'Chủ đề', Icon: Layers },
  { key: 'theories', label: 'Bài lý thuyết', Icon: GraduationCap },
  { key: 'posts', label: 'Bài viết', Icon: Newspaper },
] as const

/** Số hiển thị do `CountUpNumber` tự định dạng theo locale Việt (1.234). */
export default function StatsStrip({ stats }: StatsStripProps) {
  const shown = ITEMS.filter(item => stats[item.key] > 0)
  if (shown.length === 0) return null

  const colClass =
    shown.length >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : shown.length === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2'

  return (
    <section className="py-10 sm:py-12" aria-label="Số liệu nền tảng">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`grid grid-cols-2 ${colClass} gap-6 sm:gap-8 rounded-2xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-6 sm:p-8 lg:p-10 soft-shadow`}
        >
          {shown.map(({ key, label, Icon }, index) => (
            <div
              key={key}
              className={`group/stat text-center ${
                index > 0 ? 'sm:border-l sm:border-slate-300/70 dark:sm:border-slate-700/70' : ''
              }`}
            >
              <div className="w-11 h-11 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto mb-3 transition-transform duration-300 group-hover/stat:scale-110">
                <Icon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 font-baloo tabular-nums">
                <CountUpNumber value={stats[key]} />
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
