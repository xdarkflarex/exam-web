/**
 * Hợp đồng và validator cho gợi ý phân loại bằng AI —
 * `docs/QUESTION_AUDIT_PLAN.md` mục 8.
 *
 * ĐỌC CÁI NÀY TRƯỚC KHI SỬA. `src/lib/questions/classify.ts` là bộ phân loại
 * BẰNG LUẬT, và phần đầu file đó ghi rõ nó ra đời để **đi sửa những câu mà AI
 * phân loại sai**. Module này KHÔNG thay thế nó và không được phép thay thế:
 *
 *   1. Luật chạy TRƯỚC. AI chỉ được hỏi khi luật trả `null`.
 *   2. AI chỉ SINH GỢI Ý. Đường ghi vẫn là `BulkTaxonomyDialog` như cũ.
 *   3. AI chỉ được chọn trong cây taxonomy CÓ THẬT, gửi kèm trong prompt.
 *      Không khớp thì trả null, không tự nghĩ ra nhánh mới.
 *
 * Điều luật KHÔNG làm được và AI làm được: gợi ý cả ĐƯỜNG ĐI trong cây
 * (topic → category → section → subsection). `suggestTopic` chỉ ra tới tầng
 * topic. Đó là lý do module này tồn tại, chứ không phải vì AI "thông minh hơn".
 */

export const CLASSIFY_SCHEMA = 'question-classify-result.v1'

export interface TaxonomyNodeRef {
  id: string
  name: string
}
export interface CategoryRef extends TaxonomyNodeRef {
  topic_id: string
}
export interface SectionRef extends TaxonomyNodeRef {
  category_id: string
  topic_id: string
}
export interface SubsectionRef extends TaxonomyNodeRef {
  section_id: string
}

export interface TaxonomyTree {
  topics: TaxonomyNodeRef[]
  categories: CategoryRef[]
  sections: SectionRef[]
  subsections: SubsectionRef[]
}

/**
 * Một đường đi trong cây. Mọi tầng đều có thể `null` — gợi ý nông vẫn dùng
 * được, và ép model đi tới tầng cuối là cách chắc chắn để nó bịa.
 *
 * `topic_id === null` nghĩa là KHÔNG KHỚP: cây không có nhánh nào hợp với câu
 * này. Đây là câu trả lời hợp lệ và phải dùng thật.
 */
export interface TaxonomyPath {
  topic_id: string | null
  category_id: string | null
  section_id: string | null
  subsection_id: string | null
}

export interface ClassifySuggestion extends TaxonomyPath {
  question_id: string
  /** Vì sao model chọn nhánh này. Để người duyệt đọc, không phải để máy đọc. */
  ly_do: string
  /** 0..1. KHÔNG phải xác suất đã hiệu chuẩn — chỉ để xếp thứ tự đọc. */
  do_tin_cay: number
}

const MAX_REASON_LENGTH = 300

/** Cắt phần bao quanh JSON mà model hay thêm (```json ... ```, lời dẫn). */
function extractJson(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Không tìm thấy JSON trong phản hồi AI.')
  return trimmed.slice(start, end + 1)
}

function nullableId(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`${label} phải là chuỗi hoặc null.`)
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Kiểm một đường đi có THẬT SỰ nằm trong cây không.
 *
 * Hai loại lỗi phải chặn, và loại thứ hai là loại nguy hiểm:
 *
 *   - id không tồn tại — model bịa ra một nhánh.
 *   - id tồn tại nhưng KHÔNG THUỘC nhánh cha đã chọn — ví dụ section của chương
 *     khác gắn dưới topic này. Dòng ghi ra sẽ tự mâu thuẫn, và **mọi bộ lọc
 *     theo cây đọc sai từ đó trở đi**. Đây đúng là cái bẫy mà comment trong
 *     `BulkTaxonomyDialog.apply()` cảnh báo.
 *
 * Cũng chặn việc nhảy cóc tầng: có `section_id` mà thiếu `category_id` thì
 * đường đi không dựng lại được, dù cả hai id đều có thật.
 */
export function assertPathInTree(path: TaxonomyPath, tree: TaxonomyTree): void {
  if (path.topic_id === null) {
    if (path.category_id || path.section_id || path.subsection_id) {
      throw new Error('Không có chủ đề thì không được gán tầng con.')
    }
    return
  }

  const topic = tree.topics.find((item) => item.id === path.topic_id)
  if (!topic) throw new Error('Chủ đề không có trong cây đã gửi.')

  if (path.category_id === null) {
    if (path.section_id || path.subsection_id) {
      throw new Error('Thiếu chương thì không được gán bài hoặc dạng câu.')
    }
    return
  }

  const category = tree.categories.find((item) => item.id === path.category_id)
  if (!category) throw new Error('Chương không có trong cây đã gửi.')
  if (category.topic_id !== path.topic_id) {
    throw new Error('Chương không thuộc chủ đề đã chọn.')
  }

  if (path.section_id === null) {
    if (path.subsection_id) throw new Error('Thiếu bài thì không được gán dạng câu.')
    return
  }

  const section = tree.sections.find((item) => item.id === path.section_id)
  if (!section) throw new Error('Bài không có trong cây đã gửi.')
  if (section.category_id !== path.category_id) {
    throw new Error('Bài không thuộc chương đã chọn.')
  }

  if (path.subsection_id === null) return

  const subsection = tree.subsections.find((item) => item.id === path.subsection_id)
  if (!subsection) throw new Error('Dạng câu không có trong cây đã gửi.')
  if (subsection.section_id !== path.section_id) {
    throw new Error('Dạng câu không thuộc bài đã chọn.')
  }
}

export interface ClassifyExpectation {
  /** Đúng những câu đã gửi trong lô này. */
  questionIds: string[]
  tree: TaxonomyTree
}

/**
 * Parse kết quả của MỘT lô.
 *
 * Câu model bỏ sót KHÔNG làm hỏng cả lô: người gọi coi chúng là "không khớp".
 * Ngược lại, một mục SAI (id bịa, nhánh không thuộc cha) thì ném lỗi cả lô —
 * vì nó chứng tỏ model đang bịa, và những mục còn lại của cùng lượt đó không
 * đáng tin hơn.
 */
export function parseClassifyResult(
  raw: string | Record<string, unknown>,
  expected: ClassifyExpectation
): ClassifySuggestion[] {
  const value: unknown = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Kết quả AI phải là một object JSON.')
  }

  const result = value as Record<string, unknown>
  if (result.schema !== CLASSIFY_SCHEMA) {
    throw new Error(`Sai schema, cần "${CLASSIFY_SCHEMA}".`)
  }
  if (!Array.isArray(result.ket_qua)) throw new Error('Thiếu danh sách ket_qua.')

  const allowed = new Set(expected.questionIds)
  const seen = new Set<string>()
  const suggestions: ClassifySuggestion[] = []

  for (const item of result.ket_qua) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Một mục kết quả không hợp lệ.')
    }
    const row = item as Record<string, unknown>

    const questionId = nullableId(row.question_id, 'question_id')
    if (!questionId) throw new Error('Mục kết quả thiếu question_id.')
    if (!allowed.has(questionId)) throw new Error('Kết quả trỏ tới câu không thuộc lô đã gửi.')
    if (seen.has(questionId)) throw new Error('Kết quả có câu lặp lại.')
    seen.add(questionId)

    const path: TaxonomyPath = {
      topic_id: nullableId(row.topic_id, 'topic_id'),
      category_id: nullableId(row.category_id, 'category_id'),
      section_id: nullableId(row.section_id, 'section_id'),
      subsection_id: nullableId(row.subsection_id, 'subsection_id'),
    }
    assertPathInTree(path, expected.tree)

    const confidence = row.do_tin_cay
    if (
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      throw new Error('do_tin_cay phải nằm trong 0..1.')
    }

    // Không khớp thì không cần lý do dài dòng; khớp thì bắt buộc nói vì sao,
    // vì người duyệt sẽ đọc đúng dòng đó để quyết định tick hay bỏ.
    const reason = typeof row.ly_do === 'string' ? row.ly_do.slice(0, MAX_REASON_LENGTH) : ''
    if (path.topic_id !== null && reason.trim().length === 0) {
      throw new Error('Gợi ý phải kèm lý do.')
    }

    suggestions.push({ question_id: questionId, ly_do: reason, do_tin_cay: confidence, ...path })
  }

  return suggestions
}
