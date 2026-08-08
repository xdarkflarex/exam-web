/**
 * Danh sách đề ôn tập.
 *
 * Toàn bộ khung nằm ở `AssessmentListPage` dùng chung với `/student/exams`
 * (Phase 10, docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.5). `mode` ở đây là ranh
 * giới miền: nó quyết định `exams.exam_mode` được lọc, nên KHÔNG được suy ra từ
 * đường dẫn hay từ tham số URL — xem AGENTS.md mục 4.
 */

'use client'

import AssessmentListPage from '@/components/student/AssessmentListPage'

export default function PracticeExamsPage() {
  return <AssessmentListPage mode="practice" />
}
