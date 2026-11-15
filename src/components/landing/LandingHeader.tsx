'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Search, X, Menu, Phone } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import AuthHeaderClient from '@/components/AuthHeaderClient'
import MinhMathLogo from '@/components/MinhMathLogo'

/**
 * Nav của landing page.
 *
 * `/learn` và `/practice` nằm sau auth (xem `src/middleware.ts`): khách chưa đăng nhập
 * bấm vào sẽ được middleware đẩy sang `/login`. Đây là hành vi có chủ đích, không phải lỗi.
 * `#benefits` neo xuống section trong trang.
 */
/*
  MỘT TẦNG (2026-11-15). Bản trước xếp hai tầng dính liền — 64px thương hiệu +
  48px điều hướng — tức 112px màn hình bị chiếm suốt lúc cuộn, trên laptop
  768px chiều cao là gần 15%. Ba mục điều hướng giờ đứng cùng hàng với thương
  hiệu từ `lg`; dưới `lg` chúng nằm trong menu mở bằng nút ba gạch, như cũ.

  Ô tìm kiếm co giãn (`flex-1`) nên là thứ nhường chỗ đầu tiên khi hẹp. Bề
  ngang đã tính ở 1024px cho cả hai trạng thái của `AuthHeaderClient` (chưa và
  đã đăng nhập): phần cố định ~770px trong khung 960px, ô tìm kiếm còn ~190px.
*/
const NAV_ITEMS = [
  { label: 'Kiến thức', href: '/learn' },
  { label: 'Luyện đề', href: '/practice' },
  { label: 'Giới thiệu', href: '/#benefits' },
] as const

interface LandingHeaderProps {
  brandName: string
  /** Số hotline lấy từ `landing.brand.hotline`; không có thì không render. */
  hotline?: string
  /** Từ khoá đang lọc, đọc từ `?q=` để input giữ giá trị sau khi điều hướng. */
  initialQuery?: string
}

export default function LandingHeader({
  brandName,
  hotline,
  initialQuery = '',
}: LandingHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState(initialQuery)

  /*
    Thanh nav nổi lên khi trang đã cuộn qua hero.

    Chỉ đổi BÓNG, không đổi chiều cao hay padding: đổi kích thước thanh dính ở
    đỉnh làm cả trang nhích lên một nhịp mỗi lần cuộn qua ngưỡng — đúng loại
    layout shift mà NT8 cấm. Ngưỡng 24px để một cú cuộn nhẹ không làm nó nhấp
    nháy, và `setScrolled` nhận cùng giá trị thì React bỏ qua nên không có
    render thừa.
  */
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string) =>
    !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`))

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    setMenuOpen(false)
    router.push(q ? `/?q=${encodeURIComponent(q)}#exams` : '/')
  }

  const clearSearch = () => {
    setQuery('')
    router.push('/')
  }

  const searchForm = (autoFocusable: boolean) => (
    <form onSubmit={submitSearch} role="search" className="relative w-full">
      <label htmlFor={autoFocusable ? 'landing-search-mobile' : 'landing-search'} className="sr-only">
        Tìm kiếm đề thi
      </label>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500"
        aria-hidden="true"
      />
      <input
        id={autoFocusable ? 'landing-search-mobile' : 'landing-search'}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Tìm kiếm bài học, chuyên đề hoặc đề thi..."
        className="w-full h-10 pl-11 pr-10 rounded-full text-sm bg-slate-200/70 dark:bg-slate-700/60 text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all duration-200"
      />
      {query && (
        <button
          type="button"
          onClick={clearSearch}
          aria-label="Xoá từ khoá tìm kiếm"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-300/70 dark:hover:bg-slate-600/70 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  )

  return (
    <header
      className={`sticky top-0 z-50 glass-strong fade-in transition-shadow duration-300 ${
        scrolled ? 'shadow-lg shadow-slate-900/10 dark:shadow-black/40' : 'shadow-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:gap-5 h-16">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <MinhMathLogo size={40} />
            <span className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 font-baloo">
              {brandName}
            </span>
          </Link>

          {/* Điều hướng — cùng hàng với thương hiệu từ lg trở lên. Vạch chân của
              mục đang mở dùng lại `.nav-underline` (chọn theo aria-current). */}
          <nav aria-label="Điều hướng chính" className="hidden lg:flex items-center gap-1 shrink-0">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`nav-underline px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive(item.href)
                    ? 'text-teal-600 dark:text-teal-400 bg-teal-100/70 dark:bg-teal-900/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:block flex-1 min-w-0 lg:max-w-md lg:ml-auto">{searchForm(false)}</div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto md:ml-0 shrink-0">
            {hotline && (
              <a
                href={`tel:${hotline.replace(/\s/g, '')}`}
                className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-all duration-200"
              >
                <Phone className="w-4 h-4" />
                {hotline}
              </a>
            )}
            <ThemeToggle />
            <AuthHeaderClient />
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-all duration-200 active:scale-90"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu thu gọn (dưới lg) — điều hướng, và thêm ô tìm kiếm khi dưới md vì
          lúc đó thanh trên không còn chỗ cho nó. */}
      {menuOpen && (
        <div
          id="landing-mobile-menu"
          className="lg:hidden border-t border-slate-300/40 dark:border-slate-700/40 slide-in-up"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-3">
            <div className="md:hidden">{searchForm(true)}</div>
            <nav aria-label="Điều hướng chính" className="flex flex-col gap-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    isActive(item.href)
                      ? 'text-teal-600 dark:text-teal-400 bg-teal-100/70 dark:bg-teal-900/30'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {hotline && (
                <a
                  href={`tel:${hotline.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  {hotline}
                </a>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
