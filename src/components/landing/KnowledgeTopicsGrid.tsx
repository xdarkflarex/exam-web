import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import SectionHeading from './SectionHeading'
import { surfaceClass, type SectionSurface } from './sectionSurface'

/**
 * Chuyên mục kiến thức.
 *
 * Danh sách chuyên mục là dữ liệu THẬT đọc từ bảng `topics`; không hardcode
 * "Hàm số / Đạo hàm / Tích phân..." như bản mẫu để tránh hiện chuyên mục mà
 * hệ thống chưa có. Nếu anon không đọc được `topics` (RLS) thì `items` rỗng và
 * section tự ẩn.
 *
 * Mọi dòng trỏ về `/learn` — trang này nằm sau auth (xem `src/middleware.ts`) nên
 * khách sẽ được đẩy sang `/login`, giống nav ở header.
 *
 * TRÌNH BÀY NHƯ TRANG MỤC LỤC CỦA SÁCH GIÁO KHOA (2026-11-15): số thứ tự, tên
 * chuyên mục, hàng chấm dẫn, mũi tên. Hai lý do, đều là lý do thật:
 *
 * 1. Đây là danh sách NHÃN có thứ tự (`order_index`, đi từ nền tảng lên nâng
 *    cao), không phải danh sách nội dung. Mục lục là hình thức sinh ra cho đúng
 *    loại dữ liệu đó — và là thứ học sinh lật ra đầu tiên ở mọi cuốn sách Toán.
 *    Bản trước là một dải pill: không lặp khuôn card, nhưng cũng không nói
 *    được rằng các mục này có thứ tự.
 * 2. Số chuyên mục là dữ liệu động (tối đa 12, có thể là 3 hay 7). Lưới card có
 *    ô span nhiều cột thì cứ đổi số phần tử là lòi lỗ trống ở hàng cuối; danh
 *    sách dòng thì kết thúc ở đâu cũng là kết thúc tự nhiên.
 *
 * Chuyên mục đầu (nền tảng nhất) vẫn là điểm vào được nhấn — số của nó nằm trong
 * ô teal đặc, teal là màu của hành động — để trang mục lục có một chỗ bắt đầu rõ
 * ràng thay vì mười hai dòng ngang nhau.
 */
interface KnowledgeTopicsGridProps {
  items: { id: string; name: string }[]
  title?: string
  subtitle?: string
  surface?: SectionSurface
}

export default function KnowledgeTopicsGrid({
  items,
  title = 'Chuyên mục kiến thức',
  subtitle = 'Hệ thống lý thuyết được sắp theo chủ đề, đi từ nền tảng lên nâng cao.',
  surface = 'plain',
}: KnowledgeTopicsGridProps) {
  if (items.length === 0) return null

  return (
    <section className={`py-16 sm:py-20 ${surfaceClass(surface)}`} aria-label="Chuyên mục kiến thức">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <SectionHeading kicker="Mục lục" title={title} subtitle={subtitle} className="mb-10" />
        </ScrollRevealClient>

        <ScrollRevealClient>
          <div className="bento-tile-lead paper-grid ruler-edge overflow-hidden px-5 pb-4 pt-8 sm:px-8 sm:pb-6 sm:pt-10">
            {/* `.animate-list-stagger` chịu được 20 con; tối đa ở đây là 12. */}
            <ol className="animate-list-stagger grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((topic, index) => {
                const lead = index === 0
                return (
                  <li key={topic.id}>
                    <Link
                      href="/learn"
                      className="group flex items-center gap-3 border-b border-dashed border-slate-300 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-600"
                    >
                      {/* Số thứ tự là hình, không phải tên: `<ol>` đã cho trình đọc
                          màn hình biết vị trí, để số lọt vào tên link thì mỗi
                          mục bị đọc thành "không một Hàm số…". */}
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-baloo text-base font-bold tabular-nums transition-colors duration-200 ${
                          lead
                            ? 'bg-teal-600 text-white dark:bg-teal-500'
                            : 'bg-teal-100 text-teal-800 group-hover:bg-teal-600 group-hover:text-white dark:bg-teal-900/40 dark:text-teal-200 dark:group-hover:bg-teal-500 dark:group-hover:text-teal-950'
                        }`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`min-w-0 text-slate-800 transition-colors group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-300 ${
                          lead ? 'font-baloo text-lg font-bold' : 'font-medium'
                        }`}
                      >
                        {topic.name}
                      </span>
                      <span aria-hidden="true" className="toc-dots" />
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-slate-400 transition-all duration-200 group-hover:translate-x-1 group-hover:text-teal-600 dark:group-hover:text-teal-400"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        </ScrollRevealClient>
      </div>
    </section>
  )
}
