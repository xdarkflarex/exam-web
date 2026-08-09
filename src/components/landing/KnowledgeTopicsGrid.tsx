import Link from 'next/link'
import { ArrowRight, FunctionSquare } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import { surfaceClass, type SectionSurface } from './sectionSurface'

/**
 * Chuyên mục kiến thức.
 *
 * Danh sách chuyên mục là dữ liệu THẬT đọc từ bảng `topics`; không hardcode
 * "Hàm số / Đạo hàm / Tích phân..." như bản mẫu để tránh hiện chuyên mục mà
 * hệ thống chưa có. Nếu anon không đọc được `topics` (RLS) thì `items` rỗng và
 * section tự ẩn.
 *
 * Mọi ô trỏ về `/learn` — trang này nằm sau auth (xem `src/middleware.ts`) nên
 * khách sẽ được đẩy sang `/login`, giống nav ở header.
 *
 * KHÔNG dùng lưới card nữa. Hai lý do, cả hai đều là lý do thật:
 *
 * 1. Đây là danh sách NHÃN, không phải danh sách nội dung. Mỗi ô chỉ có một
 *    cụm từ; đóng khung mỗi cụm từ vào một card 4-cột-đều-nhau làm nó trông
 *    hệt khối đề thi và khối truy cập nhanh ngay trên nó.
 * 2. Số chuyên mục là dữ liệu động (tối đa 12, nhưng có thể là 5 hay 7). Lưới
 *    có ô span nhiều cột thì cứ đổi số phần tử là lòi ra lỗ trống ở hàng cuối.
 *    Dải pill chạy theo chiều ngang không bao giờ có lỗ: mỗi pill rộng đúng
 *    bằng chữ của nó, nên các ô tự khác cỡ nhau mà không cần tính toán gì.
 *
 * Chuyên mục đầu (theo `order_index`, tức nền tảng nhất) được nâng thành ô dẫn
 * dắt để dải này vẫn có một điểm vào rõ ràng thay vì mười hai lối ngang nhau.
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

  const [lead, ...rest] = items

  return (
    <section className={`py-16 ${surfaceClass(surface)}`} aria-label="Chuyên mục kiến thức">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
        </ScrollRevealClient>

        <ScrollRevealClient>
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            {/* Ô dẫn dắt: pill lớn hơn, nền teal đặc — teal là màu của hành động. */}
            <Link
              href="/learn"
              className="group inline-flex items-center gap-3 rounded-full bg-teal-600 dark:bg-teal-500 px-5 py-3 text-white transition-all duration-300 hover:bg-teal-700 dark:hover:bg-teal-400 hover:scale-[1.03] active:scale-[0.98]"
            >
              <FunctionSquare className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="text-sm sm:text-base font-semibold font-baloo">{lead.name}</span>
              <ArrowRight className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>

            {rest.map(topic => (
              <Link
                key={topic.id}
                href="/learn"
                className="group inline-flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-600 bg-[var(--background-card)] px-4 py-2.5 transition-colors duration-200 hover:border-teal-500 dark:hover:border-teal-400"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 transition-colors duration-200 group-hover:bg-teal-500"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                  {topic.name}
                </span>
              </Link>
            ))}
          </div>
        </ScrollRevealClient>
      </div>
    </section>
  )
}
