import { type NextRequest } from 'next/server'
import { ProviderError } from '@/lib/essay-ai/contracts'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'
import { suggestTopic } from '@/lib/questions/classify'
import { createDeepSeekClassifyProvider } from '@/lib/questions/classify-ai-provider'
import type { ClassifySuggestion, TaxonomyTree } from '@/lib/questions/classify-ai'
import { selectScopeIds } from '@/lib/questions/audit-scope'

/**
 * POST /api/admin/questions/classify
 *
 * Gợi ý phân loại cho một nhóm câu. CHỈ ĐỌC và CHỈ GỢI Ý — không có đường ghi
 * nào vào `question_taxonomy` ở đây. Ghi vẫn qua `BulkTaxonomyDialog`, sau khi
 * người soạn tick từng câu (`docs/QUESTION_AUDIT_PLAN.md` mục 8).
 *
 * THỨ TỰ XỬ LÝ — luật trước, AI sau:
 *
 *   1. `suggestTopic` (bảng luật) chạy trên MỌI câu. Rẻ, tất định, và là thứ
 *      repo đã cố ý chọn ở chỗ này.
 *   2. Chỉ những câu luật trả `null` mới được gửi cho DeepSeek.
 *
 * Bỏ thứ tự đó đi là quay lại đúng vấn đề mà `classify.ts` sinh ra để dọn: một
 * mô hình chạy lại trên cùng một câu phần lớn cho lại cùng kết quả sai, còn
 * luật thì sửa một lần là hết sai.
 *
 * `deepSummary` là lối thoát cho tình huống ngược lại: luật CÓ đoán được topic
 * nhưng chỉ tới tầng topic, mà người soạn muốn cả đường đi. Bật cờ đó thì AI
 * được hỏi cả những câu luật đã đoán — tốn hơn, nên phải chọn có chủ đích.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Số câu gửi trong MỘT lời gọi. Cây taxonomy nằm trong mọi lô nên gộp mới rẻ. */
const BATCH_SIZE = 10

/** Trần cho danh sách id người dùng tự tick. */
const MAX_QUESTIONS = 200

/**
 * Số câu mỗi trang khi chạy theo PHẠM VI.
 *
 * Nhỏ hơn `MAX_QUESTIONS` có lý do: 50 câu = 5 lượt gọi DeepSeek tuần tự trong
 * MỘT request HTTP. Ở 200 câu thì 20 lượt gọi nối nhau rất dễ chạm trần
 * `maxDuration` 300 giây, và khi đó cả trang mất trắng chứ không mất một phần.
 * Trang tự gọi tiếp trang sau, nên chia nhỏ không làm chậm tổng thể.
 */
const SCOPE_PAGE_SIZE = 50

interface ClassifyBody {
  /** Cách 1 — danh sách câu người dùng tự tick ở `/admin/questions`. */
  questionIds?: unknown
  /**
   * Cách 2 — phạm vi, để không phải tick tay 297 câu.
   *
   * `chua_phan_loai` là ca chính: nhóm chưa có dòng trong `question_taxonomy`.
   * `tat_ca` GHI ĐÈ lên phân loại tay nếu người duyệt tick, nên trang mặc định
   * bỏ tick hết ở chế độ đó.
   */
  scopeMode?: unknown
  /** Trang trong phạm vi. Trang gọi lần lượt để không nuốt cả 297 câu một lần. */
  offset?: unknown
  /** Hỏi AI cả những câu luật đã đoán được topic, để lấy thêm tầng sâu. */
  deepSuggest?: unknown
}

export async function POST(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard.ctx

  let body: ClassifyBody
  try {
    body = (await request.json()) as ClassifyBody
  } catch {
    return json({ error: 'Body không phải JSON.', code: 'BAD_REQUEST' }, 400)
  }

  const deepSuggest = body.deepSuggest === true
  const offset = Number.isInteger(body.offset) ? Math.max(0, body.offset as number) : 0

  let questionIds: string[]
  /** Số câu còn lại của phạm vi sau trang này. 0 với chế độ tick tay. */
  let remaining = 0
  let scopeTotal = 0

  if (body.scopeMode !== undefined) {
    // Chế độ phạm vi: server tự lấy id, trang chỉ việc gọi từng trang một.
    if (body.scopeMode !== 'chua_phan_loai' && body.scopeMode !== 'tat_ca') {
      return json({ error: 'Phạm vi không hợp lệ.', code: 'BAD_SCOPE' }, 400)
    }
    try {
      const selection = await selectScopeIds(
        admin,
        body.scopeMode,
        { topicId: null, categoryId: null, sectionId: null, subsectionId: null },
        { limit: SCOPE_PAGE_SIZE, offset }
      )
      questionIds = selection.ids
      remaining = selection.remaining
      scopeTotal = selection.total
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : ''
      return json({ error: 'Không lấy được danh sách câu.', code: 'QUERY_FAILED', detail }, 500)
    }
  } else {
    questionIds = Array.isArray(body.questionIds)
      ? [...new Set(body.questionIds.filter((id): id is string => typeof id === 'string'))]
      : []
    scopeTotal = questionIds.length
    if (questionIds.length > MAX_QUESTIONS) {
      return json(
        {
          error: `Mỗi lượt tối đa ${MAX_QUESTIONS} câu. Chọn ít hơn rồi làm nhiều lượt.`,
          code: 'TOO_MANY',
        },
        400
      )
    }
  }

  if (questionIds.length === 0) {
    return json({ error: 'Không có câu nào trong phạm vi này.', code: 'NO_QUESTIONS' }, 400)
  }

  const [questionsRes, topicsRes, categoriesRes, sectionsRes, subsectionsRes] = await Promise.all([
    admin.from('questions').select('id, content').in('id', questionIds),
    admin.from('topics').select('id, name').order('order_index'),
    admin.from('categories').select('id, name, topic_id').order('order_index'),
    admin.from('sections').select('id, name, category_id, topic_id').order('order_index'),
    admin.from('subsections').select('id, name, section_id').order('order_index'),
  ])

  const tree: TaxonomyTree = {
    topics: topicsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    sections: sectionsRes.data ?? [],
    subsections: subsectionsRes.data ?? [],
  }
  if (tree.topics.length === 0) {
    return json({ error: 'Cây chuyên đề đang trống.', code: 'EMPTY_TREE' }, 400)
  }

  const questions = (questionsRes.data ?? []) as Array<{ id: string; content: string }>

  // --- Bước 1: lớp luật, chạy trên mọi câu -----------------------------------
  const suggestions: ClassifySuggestion[] = []
  const needAi: Array<{ id: string; content: string }> = []
  let byRule = 0

  for (const question of questions) {
    const ruleHit = suggestTopic(question.content ?? '', tree.topics)

    if (ruleHit && !deepSuggest) {
      suggestions.push({
        question_id: question.id,
        ly_do: `Luật: ${ruleHit.signals.join(', ')}`,
        // Luật chỉ ra tới tầng topic — đó là giới hạn của `classify.ts`, không
        // phải thiếu sót của lời gọi này.
        topic_id: ruleHit.topicId,
        category_id: null,
        section_id: null,
        subsection_id: null,
        // Luật không sinh xác suất. 1 ở đây nghĩa là "tất định", không phải
        // "chắc chắn đúng" — người soạn vẫn phải tick.
        do_tin_cay: 1,
      })
      byRule++
      continue
    }

    needAi.push({ id: question.id, content: question.content ?? '' })
  }

  // --- Bước 2: AI, chỉ cho phần còn lại --------------------------------------
  let promptTokens = 0
  let completionTokens = 0
  let costUsd = 0
  const failedBatches: string[] = []

  if (needAi.length > 0) {
    let provider
    try {
      provider = createDeepSeekClassifyProvider()
    } catch (caught) {
      if (caught instanceof ProviderError && caught.kind === 'config') {
        return json({ error: caught.message, code: 'PROVIDER_CONFIG_ERROR' }, 503)
      }
      throw caught
    }

    for (let i = 0; i < needAi.length; i += BATCH_SIZE) {
      const batch = needAi.slice(i, i + BATCH_SIZE)
      try {
        const result = await provider.classify(batch, tree)
        suggestions.push(...result.suggestions)
        promptTokens += result.promptTokens
        completionTokens += result.completionTokens
        costUsd += result.estimatedCostUsd
      } catch (caught) {
        // Một lô hỏng không được làm hỏng cả lượt: những lô khác vẫn dùng được,
        // và câu trong lô hỏng chỉ đơn giản là không có gợi ý.
        failedBatches.push(caught instanceof Error ? caught.message : 'Lỗi không xác định.')
      }
    }
  }

  // Câu nào không có gợi ý (model bỏ sót, lô hỏng, hoặc chính model nói không
  // khớp) thì KHÔNG bịa ra dòng nào — trang sẽ hiện chúng ở nhóm "máy chịu".
  const withPath = suggestions.filter((item) => item.topic_id !== null)

  return json({
    code: 'OK',
    total: questions.length,
    /** Tổng của cả phạm vi, và số còn lại sau trang này. */
    scopeTotal,
    remaining,
    offset,
    /** Số câu lớp luật tự xử được, không tốn một đồng API nào. */
    byRule,
    /** Số câu đã phải hỏi model. */
    askedAi: needAi.length,
    suggestions,
    /**
     * Nội dung rút gọn theo id.
     *
     * Ở chế độ phạm vi, trang KHÔNG có sẵn nội dung những câu này (id do server
     * chọn), mà người duyệt thì tick theo nội dung chứ không theo id. Trả kèm
     * ở đây rẻ hơn nhiều so với để client truy vấn lần hai.
     */
    contents: Object.fromEntries(
      questions.map((question) => [
        question.id,
        (question.content ?? '').replace(/\s+/g, ' ').slice(0, 200),
      ])
    ),
    /** Câu không có nhánh nào hợp, kể cả sau khi hỏi AI. */
    unresolved: questions
      .map((question) => question.id)
      .filter((id) => !withPath.some((item) => item.question_id === id)),
    usage: { promptTokens, completionTokens, estimatedCostUsd: costUsd },
    warnings: failedBatches,
  })
}
