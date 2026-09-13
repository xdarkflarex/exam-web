'use client'

import dynamic from 'next/dynamic'

/**
 * Chỉ dựng công cụ miền nghiệm ở trình duyệt.
 *
 * VÌ SAO KHÔNG SSR: MathJax sửa DOM tại chỗ (thay `$…$` bằng `mjx-container`).
 * Nếu server đã dựng sẵn lời giải thì MathJax — khi đã nạp từ trang trước —
 * typeset HTML đó TRƯỚC khi React hydrate, và React báo "Hydration failed" vì
 * DOM không còn khớp. Công cụ không có dữ liệu server, không cần SEO, nên bỏ
 * SSR là cách sạch nhất thay vì chặn MathJax từng khối.
 */
const InequalityRegionTool = dynamic(() => import('./InequalityRegionTool'), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
        <div className="bento-tile-lead mb-6 h-40 animate-pulse" />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="bento-tile aspect-square animate-pulse" />
          <div className="bento-tile h-80 animate-pulse" />
        </div>
        <span className="sr-only">Đang tải công cụ…</span>
      </div>
    </main>
  ),
})

export default function InequalityRegionClient() {
  return <InequalityRegionTool />
}
