/**
 * Hợp đồng và validator cho `question-audit-result.v2` —
 * `docs/QUESTION_AUDIT_PLAN.md` mục 5.
 *
 * TRẠNG THÁI: logic thuần. Không có lời gọi provider, không có migration, không
 * có đường ghi vào `answers`/`questions` trong file này — và đó là ràng buộc
 * chính của công cụ (kế hoạch mục 3.1): AI chỉ sinh ĐỀ XUẤT, người duyệt mới
 * được ghi. Một lần ghi sai `answers.is_correct` làm sai đáp án cho MỌI học
 * sinh làm câu đó về sau, khác hẳn chấm tự luận nơi sai một bài sửa được một bài.
 *
 * ĐỔI TỪ v1 SANG v2 (2026-08-30, theo yêu cầu chủ dự án)
 *
 * v1 có MỘT `ket_luan` và các nhánh loại trừ nhau: đáp án sai thì chỉ sửa đáp
 * án, lời giải sai thì chỉ sửa lời giải, cả hai sai thì KHÔNG đề xuất gì. Chạy
 * thật cho thấy nhánh cuối nuốt mất đúng loại câu cần sửa nhất — đợt nhập OCR
 * hỏng thường hỏng cả hai cùng lúc, nên công cụ im lặng ở chỗ nó đáng nói nhất.
 *
 * v2 tách thành BA phán quyết độc lập — đề, đáp án, lời giải — mỗi phần tự nói
 * có lỗi hay không và tự mang bản sửa của nó. `ket_luan` không còn do model
 * phát biểu mà được SUY RA ở đây từ ba phán quyết đó; điều này xoá hẳn lớp lỗi
 * "model nói dung nhưng lại kèm bản sửa" mà v1 phải đi kiểm từng nhánh.
 *
 * Ranh giới tin cậy: output của model là dữ liệu KHÔNG đáng tin. Mọi trường đi
 * qua đây phải được kiểm kiểu, kiểm miền giá trị, và kiểm rằng nó nói về đúng
 * câu hỏi đã gửi đi.
 */

export const QUESTION_AUDIT_SCHEMA = 'question-audit-result.v2'

/**
 * Kết luận tổng hợp, SUY RA từ ba phán quyết — model không phát biểu trường này.
 *
 * `khong_kiem_duoc` là kết luận HỢP LỆ và phải dùng thật (câu thiếu hình, thiếu
 * dữ kiện, đề mơ hồ). Ép model luôn phán một câu trả lời là cách nhanh nhất để
 * có một danh sách đề xuất không ai dám tin.
 *
 * `de_sai` là nhánh mới của v2: đề bản thân nó sai hoặc không trả lời được.
 * Khi đó KHÔNG có bản sửa nào — sửa đáp án của một đề sai là vô nghĩa, và viết
 * lại đề là đổi thứ đang được đo, không phải sửa lỗi.
 */
export type AuditConclusion =
  | 'dung'
  | 'de_sai'
  | 'dap_an_sai'
  | 'loi_giai_sai'
  | 'ca_hai_sai'
  | 'khong_kiem_duoc'

/** Phán quyết về một phần, không kèm bản sửa. */
export interface PartVerdict {
  co_loi: boolean
  /** Bắt buộc khi `co_loi`. Câu tiếng Việt nói SAI Ở ĐÂU, để người soạn đọc. */
  mo_ta: string | null
}

export interface AnswerVerdict extends PartVerdict {
  /**
   * Đáp án đúng do model đề xuất, biểu diễn theo dạng câu:
   *
   * - `multiple_choice`: đúng MỘT `answers.id`.
   * - `true_false`: danh sách `answers.id` của những ý phải mang `is_correct =
   *   true`, nối bằng dấu phẩy; chuỗi rỗng nghĩa là cả bốn ý đều Sai.
   * - `short_answer`: giá trị đáp án dạng văn bản.
   *
   * Dùng id thay vì chuỗi "ĐSĐS" để đề xuất không phụ thuộc thứ tự hiển thị.
   */
  dap_an_dung_moi: string | null
}

/**
 * Hai ô lời giải là HAI cột khác nhau trong `questions`, và học sinh thấy cả
 * hai với hai nhãn khác nhau ("Giải thích" và "Lời giải"). v1 chỉ có một trường
 * `loi_giai_moi` và RPC luôn ghi vào `explanation` — tức là lỗi nằm ở `solution`
 * thì bản sửa rơi nhầm ô, và ô sai vẫn còn nguyên cho học sinh đọc.
 */
export interface SolutionVerdict extends PartVerdict {
  explanation_moi: string | null
  solution_moi: string | null
}

export interface QuestionAuditResult {
  schema: typeof QUESTION_AUDIT_SCHEMA
  question_id: string
  /** Lời giải model tự làm. Điền TRƯỚC khi được nhìn đáp án đang lưu. */
  loi_giai_tu_lam: string
  dap_an_tu_lam: string
  khong_kiem_duoc: boolean
  ly_do_khong_kiem_duoc: string | null
  danh_gia_de: PartVerdict
  danh_gia_dap_an: AnswerVerdict
  danh_gia_loi_giai: SolutionVerdict
  /** Lỗi LaTeX model nhìn thấy. Bổ sung cho lớp luật, không thay thế. */
  loi_latex: string[]
  /** 0..1. KHÔNG phải xác suất đã hiệu chuẩn — chỉ để xếp thứ tự đọc. */
  do_tin_cay: number
  /** SUY RA ở validator, không đọc từ JSON của model. */
  ket_luan: AuditConclusion
}

export interface AuditExpectation {
  /** Câu đã gửi đi. Kết quả trỏ tới câu khác là bị từ chối, không phải sửa lại. */
  questionId: string
  questionType: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  /** Toàn bộ `answers.id` của câu, theo đúng dữ liệu đã gửi cho model. */
  answerIds: string[]
  /**
   * Hai ô lời giải hiện CÓ nội dung hay không.
   *
   * Dùng để chặn một việc khác hẳn: điền lời giải vào ô đang trống. Đó là "viết
   * lời giải mới", không phải "sửa lời giải sai" — khác về chi phí, khác về chất
   * lượng cần kiểm, và không phải thứ chủ dự án bấm quét để nhận.
   */
  hasExplanation: boolean
  hasSolution: boolean
}

/**
 * Thứ tự trường bắt buộc, chống mồi đáp án (kế hoạch mục 5).
 *
 * Nếu model được nhìn đáp án đang lưu trước khi tự giải, nó có xu hướng đồng ý
 * với cái nó đã thấy — và một công cụ luôn nói "khớp" thì vô dụng. Prompt bắt
 * điền `loi_giai_tu_lam`/`dap_an_tu_lam` trước; validator ở đây kiểm rằng model
 * đã thật sự làm vậy, bằng thứ tự khoá trong JSON nó trả về.
 *
 * `JSON.parse` giữ nguyên thứ tự khoá chuỗi, nên `Object.keys` đọc lại được
 * đúng thứ tự model đã sinh ra. Đây là bằng chứng gián tiếp chứ không phải bảo
 * đảm — model vẫn có thể suy luận ngược rồi in xuôi — nên nó là MỘT lớp, không
 * phải cả phòng thủ. Lớp còn lại là đo tỉ lệ "đồng ý với đáp án lưu" (mục 5).
 */
const SELF_SOLVE_FIRST = ['loi_giai_tu_lam', 'dap_an_tu_lam'] as const
const AFTER_SELF_SOLVE = ['danh_gia_de', 'danh_gia_dap_an', 'danh_gia_loi_giai'] as const

const MAX_TEXT_LENGTH = 8_000
const MAX_LATEX_ISSUES = 20

/** Cắt phần bao quanh JSON mà model hay thêm (```json ... ```, lời dẫn). */
function extractJson(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Không tìm thấy JSON trong phản hồi AI.')
  return trimmed.slice(start, end + 1)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} phải là chuỗi.`)
  return value.slice(0, MAX_TEXT_LENGTH)
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  const text = requireString(value, label)
  // Chuỗi rỗng và null nói cùng một điều; quy về null để phía dưới chỉ phải
  // kiểm một dạng. NGOẠI LỆ `dap_an_dung_moi` xử lý riêng — chuỗi rỗng ở đó có
  // nghĩa thật ("cả bốn ý Đúng/Sai đều Sai").
  return text.trim().length === 0 ? null : text
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} phải là object.`)
  }
  return value as Record<string, unknown>
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} phải là boolean.`)
  return value
}

function assertFieldOrder(keys: string[]): void {
  const positionOf = (name: string) => keys.indexOf(name)

  for (const field of SELF_SOLVE_FIRST) {
    if (positionOf(field) < 0) throw new Error(`Thiếu trường ${field}.`)
  }
  const latestSelfSolve = Math.max(...SELF_SOLVE_FIRST.map(positionOf))

  for (const field of AFTER_SELF_SOLVE) {
    const position = positionOf(field)
    if (position >= 0 && position < latestSelfSolve) {
      throw new Error(
        `Sai thứ tự trường: "${field}" đứng trước phần model tự giải. ` +
          'Kết quả này có thể đã bị mồi bởi đáp án đang lưu.'
      )
    }
  }
}

/** Đáp án đề xuất phải trỏ tới phương án CÓ THẬT của đúng câu đã gửi. */
function assertSuggestedAnswerShape(value: string, expected: AuditExpectation): void {
  const allowed = new Set(expected.answerIds)

  switch (expected.questionType) {
    case 'multiple_choice': {
      if (!allowed.has(value.trim())) {
        throw new Error('Đáp án đề xuất không phải một phương án của câu này.')
      }
      return
    }
    case 'true_false': {
      const ids = value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
      if (new Set(ids).size !== ids.length) {
        throw new Error('Đáp án đề xuất cho câu Đúng/Sai có id lặp lại.')
      }
      for (const id of ids) {
        if (!allowed.has(id)) throw new Error('Đáp án đề xuất chứa id không thuộc câu này.')
      }
      return
    }
    case 'short_answer': {
      if (value.trim().length === 0) throw new Error('Đáp án đề xuất rỗng.')
      return
    }
    case 'essay': {
      // `essay` là pilot tự luận riêng, chấm theo rubric chứ không có đáp án
      // đánh dấu sẵn. Công cụ này không có gì để đề xuất ở đó.
      throw new Error('Câu tự luận không nằm trong phạm vi công cụ rà soát đáp án.')
    }
  }
}

/**
 * Suy ra kết luận tổng hợp từ ba phán quyết.
 *
 * Thứ tự ưu tiên có ý nghĩa: `khong_kiem_duoc` và `de_sai` đứng trên, vì cả hai
 * đều có nghĩa "đừng áp dụng gì cả". Xếp `dap_an_sai` lên trước hai nhánh đó sẽ
 * cho ra một nút Áp dụng trên một câu mà chính model nói là không đọc được.
 */
function deriveConclusion(result: {
  khong_kiem_duoc: boolean
  danh_gia_de: PartVerdict
  danh_gia_dap_an: AnswerVerdict
  danh_gia_loi_giai: SolutionVerdict
}): AuditConclusion {
  if (result.khong_kiem_duoc) return 'khong_kiem_duoc'
  if (result.danh_gia_de.co_loi) return 'de_sai'
  const answerWrong = result.danh_gia_dap_an.co_loi
  const solutionWrong = result.danh_gia_loi_giai.co_loi
  if (answerWrong && solutionWrong) return 'ca_hai_sai'
  if (answerWrong) return 'dap_an_sai'
  if (solutionWrong) return 'loi_giai_sai'
  return 'dung'
}

/**
 * Parse và kiểm output của model.
 *
 * Ném lỗi khi kết quả không dùng được — không "sửa hộ" và không trả về giá trị
 * mặc định. Người gọi bắt lỗi rồi ghi câu đó lại thành `khong_kiem_duoc` kèm lý
 * do, để lượt quét vẫn chạy tiếp mà không âm thầm nuốt một kết quả hỏng.
 *
 * @param raw Chuỗi thô model trả về, hoặc object đã parse sẵn (cho test).
 */
export function parseQuestionAuditResult(
  raw: string | Record<string, unknown>,
  expected: AuditExpectation
): QuestionAuditResult {
  const value: unknown = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw
  const result = requireObject(value, 'Kết quả AI')

  if (result.schema !== QUESTION_AUDIT_SCHEMA) {
    throw new Error(`Sai schema, cần "${QUESTION_AUDIT_SCHEMA}".`)
  }
  if (result.question_id !== expected.questionId) {
    throw new Error('Kết quả không thuộc đúng câu hỏi đã gửi.')
  }

  assertFieldOrder(Object.keys(result))

  const loiGiaiTuLam = requireString(result.loi_giai_tu_lam, 'loi_giai_tu_lam')
  const dapAnTuLam = requireString(result.dap_an_tu_lam, 'dap_an_tu_lam')
  const khongKiemDuoc = requireBoolean(result.khong_kiem_duoc, 'khong_kiem_duoc')
  const lyDo = requireNullableString(result.ly_do_khong_kiem_duoc, 'ly_do_khong_kiem_duoc')

  // Chỉ `khong_kiem_duoc` được phép để trống phần tự giải — đó đúng là nghĩa
  // của nó. Mọi trường hợp khác mà không có lời giải riêng thì không có căn cứ.
  if (!khongKiemDuoc && (loiGiaiTuLam.trim().length === 0 || dapAnTuLam.trim().length === 0)) {
    throw new Error('Model phải tự giải trước khi kết luận.')
  }
  if (khongKiemDuoc && !lyDo) {
    throw new Error('Không kiểm được thì phải nói vì sao.')
  }

  if (
    typeof result.do_tin_cay !== 'number' ||
    !Number.isFinite(result.do_tin_cay) ||
    result.do_tin_cay < 0 ||
    result.do_tin_cay > 1
  ) {
    throw new Error('do_tin_cay phải nằm trong 0..1.')
  }

  if (!Array.isArray(result.loi_latex) || result.loi_latex.some((item) => typeof item !== 'string')) {
    throw new Error('loi_latex phải là danh sách chuỗi.')
  }

  // --- Ba phán quyết -------------------------------------------------------

  const rawDe = requireObject(result.danh_gia_de, 'danh_gia_de')
  const danhGiaDe: PartVerdict = {
    co_loi: requireBoolean(rawDe.co_loi, 'danh_gia_de.co_loi'),
    mo_ta: requireNullableString(rawDe.mo_ta, 'danh_gia_de.mo_ta'),
  }

  const rawDapAn = requireObject(result.danh_gia_dap_an, 'danh_gia_dap_an')
  const danhGiaDapAn: AnswerVerdict = {
    co_loi: requireBoolean(rawDapAn.co_loi, 'danh_gia_dap_an.co_loi'),
    mo_ta: requireNullableString(rawDapAn.mo_ta, 'danh_gia_dap_an.mo_ta'),
    // KHÔNG dùng `requireNullableString`: chuỗi rỗng ở đây có nghĩa thật với
    // câu Đúng/Sai — "cả bốn ý đều Sai" là một bản sửa hợp lệ.
    dap_an_dung_moi:
      rawDapAn.dap_an_dung_moi === null || rawDapAn.dap_an_dung_moi === undefined
        ? null
        : requireString(rawDapAn.dap_an_dung_moi, 'dap_an_dung_moi'),
  }

  const rawLoiGiai = requireObject(result.danh_gia_loi_giai, 'danh_gia_loi_giai')
  const danhGiaLoiGiai: SolutionVerdict = {
    co_loi: requireBoolean(rawLoiGiai.co_loi, 'danh_gia_loi_giai.co_loi'),
    mo_ta: requireNullableString(rawLoiGiai.mo_ta, 'danh_gia_loi_giai.mo_ta'),
    explanation_moi: requireNullableString(rawLoiGiai.explanation_moi, 'explanation_moi'),
    solution_moi: requireNullableString(rawLoiGiai.solution_moi, 'solution_moi'),
  }

  const ketLuan = deriveConclusion({
    khong_kiem_duoc: khongKiemDuoc,
    danh_gia_de: danhGiaDe,
    danh_gia_dap_an: danhGiaDapAn,
    danh_gia_loi_giai: danhGiaLoiGiai,
  })

  // --- Ràng buộc nghiệp vụ -------------------------------------------------

  // Không đọc được câu, hoặc chính đề đã sai: KHÔNG có bản sửa nào hợp lệ. Sửa
  // đáp án của một đề sai là vô nghĩa, và viết lại đề là đổi thứ đang được đo.
  if (khongKiemDuoc || danhGiaDe.co_loi) {
    if (danhGiaDapAn.dap_an_dung_moi !== null) {
      throw new Error('Đề sai hoặc không kiểm được thì không được đề xuất đáp án mới.')
    }
    if (danhGiaLoiGiai.explanation_moi !== null || danhGiaLoiGiai.solution_moi !== null) {
      throw new Error('Đề sai hoặc không kiểm được thì không được đề xuất lời giải mới.')
    }
  }

  if (danhGiaDe.co_loi && !danhGiaDe.mo_ta) {
    throw new Error('Báo đề sai thì phải nói sai ở đâu.')
  }

  if (danhGiaDapAn.co_loi) {
    if (!danhGiaDapAn.mo_ta) throw new Error('Báo đáp án sai thì phải nói sai ở đâu.')
    if (!khongKiemDuoc && !danhGiaDe.co_loi && danhGiaDapAn.dap_an_dung_moi === null) {
      throw new Error('Báo đáp án sai thì phải kèm đáp án đúng mới.')
    }
  } else if (danhGiaDapAn.dap_an_dung_moi !== null) {
    throw new Error('Không báo đáp án sai thì không được đề xuất đáp án mới.')
  }

  if (danhGiaLoiGiai.co_loi) {
    if (!danhGiaLoiGiai.mo_ta) throw new Error('Báo lời giải sai thì phải nói sai ở đâu.')
    if (
      !khongKiemDuoc &&
      !danhGiaDe.co_loi &&
      danhGiaLoiGiai.explanation_moi === null &&
      danhGiaLoiGiai.solution_moi === null
    ) {
      throw new Error('Báo lời giải sai thì phải kèm bản viết lại của ít nhất một ô.')
    }
  } else if (danhGiaLoiGiai.explanation_moi !== null || danhGiaLoiGiai.solution_moi !== null) {
    throw new Error('Không báo lời giải sai thì không được đề xuất lời giải mới.')
  }

  // Chặn việc điền vào ô đang trống: đó là "viết lời giải mới", một việc khác
  // hẳn về chi phí và về mức cần kiểm, và không phải thứ người dùng bấm quét
  // để nhận.
  if (danhGiaLoiGiai.explanation_moi !== null && !expected.hasExplanation) {
    throw new Error('Ô "Giải thích" đang trống — công cụ chỉ sửa lời giải sai, không viết mới.')
  }
  if (danhGiaLoiGiai.solution_moi !== null && !expected.hasSolution) {
    throw new Error('Ô "Lời giải" đang trống — công cụ chỉ sửa lời giải sai, không viết mới.')
  }

  if (danhGiaDapAn.dap_an_dung_moi !== null) {
    assertSuggestedAnswerShape(danhGiaDapAn.dap_an_dung_moi, expected)
  }

  return {
    schema: QUESTION_AUDIT_SCHEMA,
    question_id: expected.questionId,
    loi_giai_tu_lam: loiGiaiTuLam,
    dap_an_tu_lam: dapAnTuLam,
    khong_kiem_duoc: khongKiemDuoc,
    ly_do_khong_kiem_duoc: lyDo,
    danh_gia_de: danhGiaDe,
    danh_gia_dap_an: danhGiaDapAn,
    danh_gia_loi_giai: danhGiaLoiGiai,
    loi_latex: (result.loi_latex as string[])
      .slice(0, MAX_LATEX_ISSUES)
      .map((item) => item.slice(0, 500)),
    do_tin_cay: result.do_tin_cay,
    ket_luan: ketLuan,
  }
}

/** Câu này có bản sửa nào để người duyệt bấm không. */
export function hasApplicableFix(result: QuestionAuditResult): boolean {
  return (
    result.danh_gia_dap_an.dap_an_dung_moi !== null ||
    result.danh_gia_loi_giai.explanation_moi !== null ||
    result.danh_gia_loi_giai.solution_moi !== null
  )
}

/**
 * Mức tin của một đề xuất sau khi gộp hai tầng model (kế hoạch mục 4).
 *
 * `gan_chac` chỉ dành cho trường hợp HAI tầng cùng nói đáp án đang lưu sai và
 * cùng một bản sửa — và chỉ nhóm đó mới được phép áp dụng hàng loạt.
 */
export type AuditAgreement =
  | 'gan_chac'
  | 'hai_tang_dong_y'
  | 'hai_model_khong_dong_y'
  /** Mới chạy tầng 1; chưa có gì để đối chiếu. */
  | 'mot_tang'

export function combineTiers(
  tier1: QuestionAuditResult,
  tier2: QuestionAuditResult | null
): { agreement: AuditAgreement; canBulkApply: boolean } {
  if (!tier2) return { agreement: 'mot_tang', canBulkApply: false }

  const sameConclusion = tier1.ket_luan === tier2.ket_luan
  // Cùng kết luận nhưng khác bản sửa vẫn là bất đồng — cái người duyệt phải
  // quyết định chính là bản sửa, không phải nhãn kết luận.
  const sameFix =
    tier1.danh_gia_dap_an.dap_an_dung_moi === tier2.danh_gia_dap_an.dap_an_dung_moi

  if (!sameConclusion || !sameFix) {
    return { agreement: 'hai_model_khong_dong_y', canBulkApply: false }
  }
  if (tier1.ket_luan === 'dap_an_sai') {
    return { agreement: 'gan_chac', canBulkApply: true }
  }
  return { agreement: 'hai_tang_dong_y', canBulkApply: false }
}
