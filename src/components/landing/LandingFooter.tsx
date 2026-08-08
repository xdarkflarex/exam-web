import Link from 'next/link'
import { Facebook, Mail, MapPin, Phone } from 'lucide-react'
import MinhMathLogo from '@/components/MinhMathLogo'

/**
 * Footer 4 cột (lấy ý từ footer của bản thiết kế mới).
 *
 * Chỉ nhận dữ liệu đã có trong `landing.brand` (name/copyright/hotline/email/address).
 * Trường nào admin chưa nhập thì không render — không bịa số điện thoại hay địa chỉ.
 *
 * Link chính sách trỏ tới các anchor/route công khai đang tồn tại; không thêm
 * route mới ở bước này.
 */
interface LandingFooterProps {
  brandName: string
  copyright: string
  hotline?: string
  email?: string
  address?: string
  facebookUrl?: string
}

const EXPLORE_LINKS = [
  { label: 'Đề thi nổi bật', href: '/#exams' },
  { label: 'Lợi ích', href: '/#benefits' },
  { label: 'Bài viết', href: '/#posts' },
  { label: 'Đăng ký học', href: '/#enrollment-form' },
] as const

const ACCOUNT_LINKS = [
  { label: 'Đăng nhập', href: '/login' },
  { label: 'Tạo tài khoản', href: '/signup' },
  { label: 'Kiến thức', href: '/learn' },
] as const

export default function LandingFooter({
  brandName,
  copyright,
  hotline,
  email,
  address,
  facebookUrl = 'https://www.facebook.com/minhmath',
}: LandingFooterProps) {
  const hasContact = Boolean(hotline || email || address)
  // Số cột bám theo số khối thực tế: cột "Liên hệ" tự ẩn khi admin chưa nhập
  // gì, nên nếu để cứng 4 cột thì footer sẽ chừa một rãnh trống bên phải.
  const gridCols = hasContact
    ? 'sm:grid-cols-2 lg:grid-cols-4'
    : 'sm:grid-cols-3 lg:grid-cols-3'

  return (
    <footer className="border-t border-slate-300/60 dark:border-slate-700/60 bg-slate-200/40 dark:bg-slate-800/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className={`grid grid-cols-1 ${gridCols} gap-8 lg:gap-10`}>
          {/* Cột 1 — thương hiệu */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 group mb-4">
              <MinhMathLogo size={36} />
              <span className="text-lg font-bold text-slate-800 dark:text-slate-100 font-baloo group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                {brandName}
              </span>
            </Link>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
              Nền tảng luyện thi Toán THPT: làm đề, xem phân tích chi tiết và theo dõi
              tiến bộ qua từng ngày.
            </p>
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Fanpage ${brandName}`}
              className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-slate-300/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 hover:bg-teal-600 hover:text-white dark:hover:bg-teal-500 transition-colors"
            >
              <Facebook className="w-5 h-5" />
            </a>
          </div>

          {/* Cột 2 — khám phá */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-4">
              Khám phá
            </h3>
            <ul className="space-y-2.5">
              {EXPLORE_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cột 3 — tài khoản */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-4">
              Tài khoản
            </h3>
            <ul className="space-y-2.5">
              {ACCOUNT_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cột 4 — liên hệ; chỉ render khi admin đã nhập ít nhất một trường */}
          {hasContact && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-4">
                Liên hệ
              </h3>
              <ul className="space-y-3">
                {hotline && (
                  <li>
                    <a
                      href={`tel:${hotline.replace(/\s/g, '')}`}
                      className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    >
                      <Phone className="w-4 h-4 mt-0.5 shrink-0" />
                      {hotline}
                    </a>
                  </li>
                )}
                {email && (
                  <li>
                    <a
                      href={`mailto:${email}`}
                      className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors break-all"
                    >
                      <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                      {email}
                    </a>
                  </li>
                )}
                {address && (
                  <li className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    {address}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Thanh dưới */}
        <div className="mt-10 pt-6 border-t border-slate-300/60 dark:border-slate-700/60">
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center sm:text-left">
            {copyright}
          </p>
        </div>
      </div>
    </footer>
  )
}
