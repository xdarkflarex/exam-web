/**
 * Danh sách đề thi thử.
 *
 * Xem `src/app/(student)/student/practice/page.tsx` — hai trang chia nhau
 * `AssessmentListPage`, khác nhau đúng một tham số `mode`.
 */

'use client'

import AssessmentListPage from '@/components/student/AssessmentListPage'

export default function ExamsPage() {
  return <AssessmentListPage mode="simulation" />
}
