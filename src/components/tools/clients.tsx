'use client'

import dynamic from 'next/dynamic'

/**
 * Các công cụ chỉ dựng ở trình duyệt.
 *
 * VÌ SAO KHÔNG SSR: MathJax sửa DOM tại chỗ (thay `$…$` bằng `mjx-container`).
 * Nếu server đã dựng sẵn lời giải thì MathJax — khi đã nạp từ trang trước —
 * typeset HTML đó TRƯỚC khi React hydrate, và React báo "Hydration failed" vì
 * DOM không còn khớp (đã gặp thật ngày 2026-09-13). Công cụ không có dữ liệu
 * server, không cần SEO, nên bỏ SSR là cách sạch nhất.
 */

function Loading() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" role="status" aria-live="polite">
      <div className="bento-tile aspect-square animate-pulse" />
      <div className="bento-tile h-80 animate-pulse" />
      <span className="sr-only">Đang tải công cụ…</span>
    </div>
  )
}

export const FunctionAnalysisClient = dynamic(() => import('./FunctionAnalysisTool'), { ssr: false, loading: Loading })
export const InequalityRegionClient = dynamic(() => import('./InequalityRegionTool'), { ssr: false, loading: Loading })
export const GroupedDataClient = dynamic(() => import('./GroupedDataTool'), { ssr: false, loading: Loading })
export const ConditionalProbabilityClient = dynamic(() => import('./ConditionalProbabilityTool'), {
  ssr: false,
  loading: Loading,
})
