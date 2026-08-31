import { type NextRequest } from 'next/server'
import { ProviderError } from '@/lib/essay-ai/contracts'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'
import { runAuditStep } from '@/lib/questions/audit-worker'

/**
 * POST /api/admin/questions/audit/step
 *
 * Xử lý MỘT lô nhỏ của một lượt quét. Trang quản trị gọi lại cho tới khi
 * `done = true` — đó là cách tiến trình hiện ra được trên màn hình mà không cần
 * một job chạy nền (thứ không có gì bảo đảm sống sót trên serverless).
 *
 * Con trỏ nằm ở `question_audit_runs.next_index` trong database, nên đóng tab
 * giữa chừng thì lượt quét dừng đúng chỗ đó và mở lại là chạy tiếp.
 *
 * Logic nằm ở `src/lib/questions/audit-worker.ts`; route này chỉ là vỏ HTTP.
 */

export const dynamic = 'force-dynamic'
// Một lô mặc định 5 câu; DeepSeek chậm nhất khoảng 90s mỗi câu (timeout của
// adapter). Hạ `QUESTION_AUDIT_BATCH_SIZE` nếu nền tảng có trần thấp hơn.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin, flags } = guard.ctx

  let runId: string
  try {
    const body = (await request.json()) as { runId?: unknown }
    if (typeof body.runId !== 'string' || body.runId.trim().length === 0) {
      return json({ error: 'Thiếu runId.', code: 'BAD_REQUEST' }, 400)
    }
    runId = body.runId.trim()
  } catch {
    return json({ error: 'Body không phải JSON.', code: 'BAD_REQUEST' }, 400)
  }

  try {
    const progress = await runAuditStep(admin, flags, runId)
    return json({ code: 'OK', progress })
  } catch (caught) {
    // Lỗi cấu hình (thiếu key, model ngoài allowlist) là lỗi của người vận hành
    // và sẽ lặp lại ở mọi lô — nói thẳng ra thay vì để trang quay vòng vô ích.
    if (caught instanceof ProviderError && caught.kind === 'config') {
      return json({ error: caught.message, code: 'PROVIDER_CONFIG_ERROR' }, 503)
    }
    const message = caught instanceof Error ? caught.message : 'Lỗi không xác định.'
    return json({ error: message, code: 'STEP_FAILED' }, 500)
  }
}
