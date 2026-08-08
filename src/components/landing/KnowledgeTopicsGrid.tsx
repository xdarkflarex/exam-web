import Link from 'next/link'
import { FunctionSquare } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'

/**
 * Lưới chuyên mục kiến thức (lấy ý từ "Chuyên mục kiến thức" của bản thiết kế mới).
 *
 * Danh sách chuyên mục là dữ liệu THẬT đọc từ bảng `topics`; không hardcode
 * "Hàm số / Đạo hàm / Tích phân..." như bản mẫu để tránh hiện chuyên mục mà
 * hệ thống chưa có. Nếu anon không đọc được `topics` (RLS) thì `items` rỗng và
 * section tự ẩn.
 *
 * Mọi ô trỏ về `/learn` — trang này nằm sau auth (xem `src/middleware.ts`) nên
 * khách sẽ được đẩy sang `/login`, giống nav ở header.
 */
interface KnowledgeTopicsGridProps {
  items: { id: string; name: string }[]
  title?: string
  subtitle?: string
}

export default function KnowledgeTopicsGrid({
  items,
  title = 'Chuyên mục kiến thức',
  subtitle = 'Hệ thống lý thuyết được sắp theo chủ đề, đi từ nền tảng lên nâng cao.',
}: KnowledgeTopicsGridProps) {
  if (items.length === 0) return null

  return (
    <section className="py-16 bg-slate-200/50 dark:bg-slate-800/50" aria-label="Chuyên mục kiến thức">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-3 font-baloo">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
        </ScrollRevealClient>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {items.map((topic, index) => (
            <ScrollRevealClient key={topic.id} delay={index * 50}>
              <Link
                href="/learn"
                className="group flex h-full items-center gap-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 sm:p-5 bento-hover hover:border-teal-500/50 dark:hover:border-teal-400/50"
              >
                <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <FunctionSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors line-clamp-2">
                  {topic.name}
                </span>
              </Link>
            </ScrollRevealClient>
          ))}
        </div>
      </div>
    </section>
  )
}
