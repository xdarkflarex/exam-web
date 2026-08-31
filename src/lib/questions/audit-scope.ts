/**
 * Chọn phạm vi cho một lượt rà soát, và ước tính chi phí của phạm vi đó.
 *
 * Dùng chung bởi `/start` (tạo lượt quét) và `/scope` (xem trước). Hai nơi phải
 * hỏi database CÙNG một câu hỏi: nếu xem trước nói 800 câu mà lượt quét lấy 300
 * thì con số người dùng vừa cân nhắc không phải con số họ sắp trả tiền cho.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditScopeMode = 'taxonomy' | 'chua_phan_loai' | 'tat_ca'

export const SCOPE_MODES: readonly AuditScopeMode[] = [
  'taxonomy',
  'chua_phan_loai',
  'tat_ca',
]

export function isScopeMode(value: unknown): value is AuditScopeMode {
  return typeof value === 'string' && (SCOPE_MODES as readonly string[]).includes(value)
}

export interface TaxonomyScope {
  topicId: string | null
  categoryId: string | null
  sectionId: string | null
  subsectionId: string | null
}

export interface ScopeSelection {
  ids: string[]
  /** Số câu của phạm vi (đã trừ nhóm bỏ qua) TRƯỚC khi cắt theo offset/trần. */
  total: number
  offset: number
  /** Còn câu chưa lấy trong phạm vi này — lượt quét không phủ hết. */
  truncated: boolean
  /** Số câu còn lại sau lô này. */
  remaining: number
}

export interface SelectScopeOptions {
  limit: number
  offset?: number
  /**
   * Loại những câu đã có finding ở bất kỳ lượt quét nào.
   *
   * Đây là thứ biến "bấm lại lần nữa" thành "quét tiếp phần còn lại". Không có
   * nó thì trần 300 câu/lượt khiến mọi lượt "Toàn bộ ngân hàng" quét đúng 300
   * câu đầu, mãi mãi, và im lặng.
   */
  skipScanned?: boolean
}

/**
 * Gọi `question_audit_select_scope`. Không tự dựng truy vấn PostgREST ở đây, và
 * đó là chủ ý: Supabase đặt `db-max-rows` mặc định 1000, nên một truy vấn
 * thường sẽ IM LẶNG cắt cụt danh sách ở câu thứ 1000. Hàm trong database trả
 * về một giá trị vô hướng nên không đụng trần đó.
 */
export async function selectScopeIds(
  admin: SupabaseClient,
  mode: AuditScopeMode,
  scope: TaxonomyScope,
  options: SelectScopeOptions
): Promise<ScopeSelection> {
  const offset = Math.max(0, options.offset ?? 0)

  const { data, error } = await admin.rpc('question_audit_select_scope', {
    p_mode: mode,
    p_topic_id: scope.topicId,
    p_category_id: scope.categoryId,
    p_section_id: scope.sectionId,
    p_subsection_id: scope.subsectionId,
    p_limit: options.limit,
    p_offset: offset,
    p_bo_qua_da_quet: options.skipScanned ?? false,
  })

  if (error) throw new Error(error.message)

  const payload = (data ?? {}) as { ids?: unknown; total?: unknown }
  const ids = Array.isArray(payload.ids) ? payload.ids.map((id) => String(id)) : []
  const total = typeof payload.total === 'number' ? payload.total : ids.length
  const remaining = Math.max(0, total - offset - ids.length)

  return { ids, total, offset, remaining, truncated: remaining > 0 }
}

export interface CostEstimate {
  /** USD cho mỗi câu THỰC SỰ gửi cho model, đo từ các lượt quét đã chạy. */
  perQuestionUsd: number | null
  /** Số câu đã dùng để tính trung bình. Ít quá thì con số không đáng tin. */
  sampleSize: number
  /** Ước tính cho phạm vi đang xem. `null` khi chưa có dữ liệu để đo. */
  estimatedUsd: number | null
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Ước tính chi phí từ CHI PHÍ THẬT của các lượt quét trước, không phải từ bảng
 * giá gõ tay.
 *
 * Lý do: giá của provider đổi, độ dài câu hỏi của ngân hàng này thì không.
 * Trung bình đo trên chính dữ liệu của thầy phản ánh cả hai thứ đó, còn một
 * hằng số trong code thì sai dần theo thời gian mà không ai biết.
 *
 * Mẫu số là số câu THỰC SỰ gửi cho model (`processed - skipped`): câu bị lớp
 * luật chặn không tốn đồng nào, tính chúng vào sẽ kéo trung bình xuống thấp giả.
 */
export async function estimateCost(
  admin: SupabaseClient,
  questionCount: number
): Promise<CostEstimate> {
  const { data } = await admin
    .from('question_audit_runs')
    .select('processed, skipped, cost_usd')
    .gt('processed', 0)
    .order('created_at', { ascending: false })
    .limit(50)

  let billedQuestions = 0
  let totalCost = 0
  for (const row of data ?? []) {
    const billed = Math.max(0, toNumber(row.processed) - toNumber(row.skipped))
    billedQuestions += billed
    totalCost += toNumber(row.cost_usd)
  }

  if (billedQuestions === 0 || totalCost <= 0) {
    return { perQuestionUsd: null, sampleSize: billedQuestions, estimatedUsd: null }
  }

  const perQuestionUsd = totalCost / billedQuestions
  return {
    perQuestionUsd,
    sampleSize: billedQuestions,
    estimatedUsd: perQuestionUsd * questionCount,
  }
}
