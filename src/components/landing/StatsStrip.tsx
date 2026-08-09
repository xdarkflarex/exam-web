import { BookOpen, GraduationCap, Newspaper, Layers } from 'lucide-react'
import CountUpNumber from './CountUpNumber'
import { surfaceClass, type SectionSurface } from './sectionSurface'

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
  /** Nền của section, do `src/app/page.tsx` tính theo nhịp cả trang. */
  surface?: SectionSurface
}

const ITEMS = [
  { key: 'exams', label: 'Đề luyện tập', Icon: BookOpen },
  { key: 'topics', label: 'Chủ đề', Icon: Layers },
  { key: 'theories', label: 'Bài lý thuyết', Icon: GraduationCap },
  { key: 'posts', label: 'Bài viết', Icon: Newspaper },
] as const

/** Số cột cho nhóm số liệu phụ. Class phải viết tường minh để Tailwind quét được. */
const REST_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
}

/** Số hiển thị do `CountUpNumber` tự định dạng theo locale Việt (1.234). */
/**
 * Ngưỡng để một con số được phép lên trang.
 *
 * Số nhỏ HẠI HƠN là không có số. "4 đề luyện tập" nói với người lạ rằng nền
 * tảng gần như trống, trong khi không hiện gì thì họ đánh giá bằng phần còn lại
 * của trang. Trước đây điều kiện chỉ là `> 0`, nên lúc mới mở lớp trang chủ tự
 * khoe đúng cái điểm yếu của mình.
 *
 * Đây là con số THẨM MỸ/TIẾP THỊ, không phải ràng buộc kỹ thuật — chỉnh một
 * dòng này là đổi được. Khi ngân hàng đề lớn lên, dải số liệu tự hiện lại mà
 * không phải sửa code.
 */
const MIN_DE_HIEN = 10

export default function StatsStrip({ stats, surface = 'plain' }: StatsStripProps) {
  const shown = ITEMS.filter(item => stats[item.key] >= MIN_DE_HIEN)
  if (shown.length === 0) return null

  /*
    Bốn ô bằng nhau, mỗi ô một vòng tròn icon teal — đó đúng là công thức của
    mọi khối khác trên trang. Ở đây chỉ có MỘT con số đáng nhớ (số đề luyện tập,
    là thứ người vào trang đang đi tìm), ba con số còn lại là bối cảnh. Nên tách
    thành hai vùng trong CÙNG một tấm: vùng dẫn dắt bên trái với số cỡ lớn, ba
    số phụ dồn sang phải ở cỡ nhỏ hơn.

    Cách này còn tránh được cái bẫy của lưới bento thật: số ô thay đổi theo dữ
    liệu (ô nào = 0 thì bị loại), mà lưới có ô span 2 cột thì cứ đổi số phần tử
    là lòi ra một lỗ trống ở hàng cuối.
  */
  const [lead, ...rest] = shown
  const restCols = REST_COLS[Math.min(rest.length, 3)] || 'grid-cols-3'

  return (
    <section className={`py-10 sm:py-12 ${surfaceClass(surface)}`} aria-label="Số liệu nền tảng">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bento-tile-lead overflow-hidden flex flex-col lg:flex-row">
          {/* Ô dẫn dắt: dải teal mỏng bên trái thay cho một khung riêng. */}
          <div
            className="bento-rail flex items-center gap-5 p-6 sm:p-8 lg:w-[38%] lg:shrink-0"
            style={{ '--rail': '#14b8a6' } as React.CSSProperties}
          >
            <span className="w-14 h-14 shrink-0 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <lead.Icon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            </span>
            <span className="min-w-0">
              <span className="block text-4xl sm:text-5xl font-bold font-baloo tabular-nums leading-none text-slate-800 dark:text-slate-100">
                <CountUpNumber value={stats[lead.key]} />
              </span>
              <span className="block text-sm text-slate-600 dark:text-slate-400 mt-2">
                {lead.label}
              </span>
            </span>
          </div>

          {rest.length > 0 && (
            <div
              className={`grid ${restCols} flex-1 border-t border-slate-300/70 dark:border-slate-700/70 lg:border-t-0 lg:border-l`}
            >
              {rest.map(({ key, label, Icon }, index) => (
                <div
                  key={key}
                  className={`px-4 py-5 sm:px-6 sm:py-7 text-center ${
                    index > 0 ? 'border-l border-slate-300/70 dark:border-slate-700/70' : ''
                  }`}
                >
                  <Icon
                    className="w-5 h-5 mx-auto mb-2 text-slate-400 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <div className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 font-baloo tabular-nums">
                    <CountUpNumber value={stats[key]} />
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
