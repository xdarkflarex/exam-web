import { redirect } from 'next/navigation'
import { STUDENT_TOOLS } from '@/lib/tools/registry'

/**
 * Khu công cụ không có trang danh sách riêng: vào thẳng công cụ đầu tiên, các
 * công cụ khác nằm ngay trên thanh tab — bớt một lần bấm.
 */
export default function StudentToolsPage() {
  redirect(`/student/tools/${STUDENT_TOOLS[0].slug}`)
}
