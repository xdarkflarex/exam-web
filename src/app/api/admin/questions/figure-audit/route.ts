import { type NextRequest } from 'next/server'
import { json, requireAdmin } from '@/lib/questions/audit-server'
import { auditFigures, type FigureCheckInput, type FigureIssueCode } from '@/lib/questions/figure-rules'

/**
 * GET /api/admin/questions/figure-audit
 *
 * Rà hình toàn ngân hàng. KHÔNG gọi AI, không tốn một đồng nào, và không cần
 * lượt quét — đây là luật thuần chạy trên nội dung đã có.
 *
 * Vì thế nó KHÔNG dùng `requireAuditAdmin`: tắt `QUESTION_AUDIT_ENABLED` là tắt
 * phần tốn tiền, không có lý do gì tắt luôn một phép kiểm miễn phí.
 *
 * Đọc theo trang vì Supabase đặt `db-max-rows` mặc định 1000, mà ngân hàng có
 * hơn 1400 câu — một truy vấn thường sẽ IM LẶNG cắt cụt ở câu thứ 1000 và báo
 * cáo sẽ thiếu một phần ba mà không có dấu hiệu gì.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Số câu mỗi lượt đọc. Dưới trần `db-max-rows` mặc định của Supabase. */
const PAGE_SIZE = 500

/** Trần số dòng trả về cho trình duyệt, để phản hồi không phình vô hạn. */
const MAX_REPORTS = 500

export async function GET(request: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard.ctx

  const only = request.nextUrl.searchParams.get('code') as FigureIssueCode | null

  const questions: FigureCheckInput[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('questions')
      .select('id, content, tikz_code, tikz_image_url')
      .neq('question_type', 'essay')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      return json({ error: 'Không đọc được ngân hàng câu hỏi.', code: 'QUERY_FAILED' }, 500)
    }
    const page = (data ?? []) as unknown as FigureCheckInput[]
    questions.push(...page)
    // Trang trả về ít hơn kích thước trang nghĩa là đã hết.
    if (page.length < PAGE_SIZE) break
  }

  const report = auditFigures(questions)

  const filtered = only
    ? report.reports.filter((row) => row.issues.some((issue) => issue.code === only))
    : report.reports

  // Nội dung câu chỉ lấy cho những dòng THẬT SỰ trả về, không lấy cho cả ngân
  // hàng: người duyệt cần đọc đề để biết hình đó vẽ cái gì, nhưng chỉ ở những
  // dòng đang hiện trên màn hình.
  const shown = filtered.slice(0, MAX_REPORTS)
  const byId = new Map(questions.map((question) => [question.id, question]))

  return json({
    code: 'OK',
    scanned: report.scanned,
    byCode: report.byCode,
    total: filtered.length,
    truncated: filtered.length > shown.length,
    reports: shown.map((row) => ({
      ...row,
      content: (byId.get(row.questionId)?.content ?? '').slice(0, 400),
    })),
  })
}
