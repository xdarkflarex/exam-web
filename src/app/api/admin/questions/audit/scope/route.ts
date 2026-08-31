import { type NextRequest } from 'next/server'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'
import {
  estimateCost,
  isScopeMode,
  selectScopeIds,
  type AuditScopeMode,
} from '@/lib/questions/audit-scope'

/**
 * GET /api/admin/questions/audit/scope
 *
 * Xem trước một phạm vi TRƯỚC khi tốn tiền: có bao nhiêu câu, lượt quét sẽ lấy
 * bao nhiêu, và ước tính hết bao nhiêu USD.
 *
 * Tồn tại vì hai chế độ mới có thể rất lớn. "Quét toàn bộ ngân hàng" mà không
 * biết trước con số là cách chắc chắn để một hôm mở hoá đơn ra và ngạc nhiên.
 *
 * Chỉ ĐỌC. Không tạo lượt quét, không gọi model.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin, flags } = guard.ctx

  const params = request.nextUrl.searchParams
  const rawMode = params.get('mode') ?? 'taxonomy'
  if (!isScopeMode(rawMode)) {
    return json({ error: 'Chế độ phạm vi không hợp lệ.', code: 'BAD_MODE' }, 400)
  }
  const mode: AuditScopeMode = rawMode

  const scope = {
    topicId: params.get('topicId')?.trim() || null,
    categoryId: params.get('categoryId')?.trim() || null,
    sectionId: params.get('sectionId')?.trim() || null,
    subsectionId: params.get('subsectionId')?.trim() || null,
  }
  const skipScanned = params.get('skipScanned') === 'true'

  if (
    mode === 'taxonomy' &&
    !scope.topicId &&
    !scope.categoryId &&
    !scope.sectionId &&
    !scope.subsectionId
  ) {
    return json({
      code: 'OK',
      mode,
      total: 0,
      willScan: 0,
      remaining: 0,
      truncated: false,
      cost: null,
    })
  }

  try {
    const selection = await selectScopeIds(admin, mode, scope, {
      limit: flags.maxQuestionsPerRun,
      skipScanned,
    })
    const cost = await estimateCost(admin, selection.ids.length)

    return json({
      code: 'OK',
      mode,
      skipScanned,
      /** Số câu của phạm vi, đã trừ nhóm bỏ qua. */
      total: selection.total,
      /** Số câu lượt quét này sẽ thực sự chạy. */
      willScan: selection.ids.length,
      /** Còn lại sau lượt này — bấm quét tiếp là chạy đúng phần đó. */
      remaining: selection.remaining,
      truncated: selection.truncated,
      maxPerRun: flags.maxQuestionsPerRun,
      cost,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : ''
    if (message.includes('SCOPE_REQUIRED')) {
      return json({ error: 'Phải chọn ít nhất một chương hoặc bài.', code: 'SCOPE_REQUIRED' }, 400)
    }
    return json({ error: 'Không đếm được phạm vi.', code: 'QUERY_FAILED', detail: message }, 500)
  }
}
