import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'
import {
  isScopeMode,
  selectScopeIds,
  type AuditScopeMode,
  type TaxonomyScope,
} from '@/lib/questions/audit-scope'

/**
 * POST /api/admin/questions/audit/start
 *
 * Mở một lượt quét: chốt phạm vi, chụp danh sách câu, tạo dòng `question_audit_runs`.
 * KHÔNG gọi model ở đây — việc đó là của `/step`.
 *
 * BA CHẾ ĐỘ PHẠM VI
 *
 * - `taxonomy` — theo chương/bài. Vẫn phải chọn ít nhất một tầng.
 * - `chua_phan_loai` — câu KHÔNG có dòng nào trong `question_taxonomy`. Trước
 *   2026-08-31 nhóm này là điểm mù hoàn toàn: truy vấn cũ dùng nối trong với
 *   `question_taxonomy`, nên câu chưa phân loại không lượt quét nào chạm tới
 *   được. Đó đúng là nhóm nguy hiểm nhất — đợt nhập mới thường chưa kịp phân
 *   loại tay, tức là nhóm dễ sai nhất lại là nhóm không ai nhìn thấy.
 * - `tat_ca` — toàn bộ ngân hàng.
 *
 * Kế hoạch mục 2 ban đầu cấm hẳn "quét cả ngân hàng". Chủ dự án bỏ lệnh cấm đó
 * ngày 2026-08-31, và kiến trúc hiện tại đỡ được: lượt quét chia lô, con trỏ
 * nằm ở database, dừng/chạy tiếp được, trạng thái duyệt lưu theo từng dòng. Cái
 * còn lại là tiền — nên trang bắt xem trước số câu và ước tính chi phí
 * (`GET /api/admin/questions/audit/scope`) trước khi bấm.
 */

export const dynamic = 'force-dynamic'

interface StartBody {
  mode?: unknown
  topicId?: string | null
  categoryId?: string | null
  sectionId?: string | null
  subsectionId?: string | null
  /** Bỏ qua câu đã có finding ở lượt trước — để bấm lại là quét TIẾP. */
  skipScanned?: unknown
}

/** Nhãn đọc được của phạm vi, chụp lại lúc quét. */
async function buildScopeLabel(
  admin: SupabaseClient,
  mode: AuditScopeMode,
  scope: TaxonomyScope
): Promise<string> {
  if (mode === 'tat_ca') return 'Toàn bộ ngân hàng'
  if (mode === 'chua_phan_loai') return 'Câu chưa phân loại'

  const parts: string[] = []
  const lookups: ReadonlyArray<readonly [string, string | null]> = [
    ['topics', scope.topicId],
    ['categories', scope.categoryId],
    ['sections', scope.sectionId],
    ['subsections', scope.subsectionId],
  ]

  for (const [table, id] of lookups) {
    if (!id) continue
    const { data } = await admin.from(table).select('name').eq('id', id).single()
    const name = (data as { name?: unknown } | null)?.name
    if (typeof name === 'string') parts.push(name)
  }

  return parts.join(' › ')
}

export async function POST(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin, flags, userId } = guard.ctx

  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return json({ error: 'Body không phải JSON.', code: 'BAD_REQUEST' }, 400)
  }

  // Mặc định `taxonomy`: một client cũ không gửi `mode` phải giữ nguyên hành vi
  // hẹp, không bất ngờ quét cả ngân hàng.
  const mode: AuditScopeMode = isScopeMode(body.mode) ? body.mode : 'taxonomy'

  const scope: TaxonomyScope = {
    topicId: body.topicId?.trim() || null,
    categoryId: body.categoryId?.trim() || null,
    sectionId: body.sectionId?.trim() || null,
    subsectionId: body.subsectionId?.trim() || null,
  }
  const skipScanned = body.skipScanned === true

  if (
    mode === 'taxonomy' &&
    !scope.topicId &&
    !scope.categoryId &&
    !scope.sectionId &&
    !scope.subsectionId
  ) {
    return json(
      { error: 'Phải chọn ít nhất một chương hoặc bài để quét.', code: 'SCOPE_REQUIRED' },
      400
    )
  }

  let selection
  try {
    selection = await selectScopeIds(admin, mode, scope, {
      limit: flags.maxQuestionsPerRun,
      skipScanned,
    })
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : ''
    return json({ error: 'Không lấy được danh sách câu.', code: 'QUERY_FAILED', detail }, 500)
  }

  if (selection.ids.length === 0) {
    return json(
      {
        error:
          mode === 'chua_phan_loai'
            ? 'Không còn câu nào chưa phân loại — cả ngân hàng đã được gán taxonomy.'
            : 'Phạm vi này chưa có câu nào.',
        code: 'EMPTY_SCOPE',
      },
      400
    )
  }

  const scopeLabel = await buildScopeLabel(admin, mode, scope)

  const { data: run, error: insertError } = await admin
    .from('question_audit_runs')
    .insert({
      created_by: userId,
      // Lưu cả `mode` vào scope: mở lại lượt quét cũ phải biết nó đã quét theo
      // kiểu gì, không chỉ biết bốn id taxonomy (vốn đều null ở hai chế độ mới).
      scope: { ...scope, mode, skipScanned },
      scope_label: scopeLabel,
      // Model chụp lại vào dòng run: đổi `QUESTION_AUDIT_MODEL` sau này không
      // được làm lịch sử quét nói sai model đã dùng.
      model: process.env.QUESTION_AUDIT_MODEL?.trim() || 'deepseek-chat',
      question_ids: selection.ids,
      total_questions: selection.ids.length,
    })
    .select('id')
    .single()

  if (insertError || !run) {
    return json({ error: 'Không tạo được lượt quét.', code: 'INSERT_FAILED' }, 500)
  }

  return NextResponse.json(
    {
      code: 'OK',
      runId: (run as { id: string }).id,
      mode,
      total: selection.ids.length,
      scopeLabel,
      // Cho người dùng biết họ đã chạm trần, thay vì im lặng cắt bớt.
      truncated: selection.truncated,
      scopeTotal: selection.total,
      remaining: selection.remaining,
      skipScanned,
      batchSize: flags.batchSize,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
