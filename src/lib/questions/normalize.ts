/**
 * Chuẩn hoá nội dung câu hỏi Toán viết bằng LaTeX.
 *
 * Dùng chung cho hai việc: tìm câu trùng (`duplicates.ts`) và phân loại theo
 * luật. Cả hai đều cần "hai câu này có thật sự khác nhau không", mà chuỗi thô
 * thì không trả lời được — cùng một câu gõ hai lần trong LaTeX gần như luôn
 * khác nhau vài ký tự.
 *
 * KHÔNG dùng cho chấm điểm hay so khớp đáp án. Chuẩn hoá ở đây cố ý làm MẤT
 * thông tin (bỏ khoảng trắng, gộp `\dfrac` với `\frac`), nên dùng nó để kết
 * luận "học sinh trả lời đúng" là sai mục đích.
 */

/**
 * Tiền tố đánh số câu do người soạn gõ tay hoặc do bộ nhập đề sinh ra.
 * Phải cắt, nếu không cùng một câu đứng ở vị trí khác nhau trong hai đề sẽ
 * không bao giờ khớp.
 */
const QUESTION_PREFIX = /^\s*(câu|bài|question|c)\s*\d+\s*[:.)\-–]?\s*/i

/** Lệnh chỉ điều chỉnh khoảng cách hiển thị, không mang nghĩa toán học. */
const SPACING_COMMANDS = /\\(?:,|;|:|!|quad|qquad|hspace\{[^}]*\}|vspace\{[^}]*\})/g

/**
 * Cặp lệnh đồng nghĩa. Người soạn dùng lẫn lộn, nên phải quy về một dạng —
 * nếu không thì `\dfrac` và `\frac` của cùng một câu bị coi là hai câu khác.
 */
const SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\dfrac|\\tfrac/g, '\\frac'],
  [/\\geqslant/g, '\\geq'],
  [/\\leqslant/g, '\\leq'],
  [/\\ge\b/g, '\\geq'],
  [/\\le\b/g, '\\leq'],
  [/\\ne\b/g, '\\neq'],
  [/\\to\b/g, '\\rightarrow'],
  [/\\cdot|\\times/g, '*'],
  [/\\lbrace/g, '{'],
  [/\\rbrace/g, '}'],
]

/**
 * Chuẩn hoá một nội dung câu hỏi về dạng so sánh được.
 *
 * Thứ tự các bước có ý nghĩa: cắt tiền tố TRƯỚC khi bỏ dấu câu, vì "Câu 1:"
 * cần dấu hai chấm để nhận ra; gộp khoảng trắng SAU CÙNG, vì các bước trên đều
 * sinh thêm khoảng trắng.
 */
export function normalizeQuestion(raw: string): string {
  if (!raw) return ''

  let text = raw.normalize('NFC')

  // HTML thường lẫn vào khi nhập từ Word.
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/gi, ' ')

  text = text.replace(QUESTION_PREFIX, '')

  // Dấu phân định công thức không mang nghĩa; nội dung bên trong mới có.
  text = text.replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, ' ')

  // `\left(` và `(` vẽ ra khác nhau nhưng là cùng một dấu ngoặc.
  text = text.replace(/\\left|\\right|\\big[lr]?|\\Big[lr]?/g, '')

  text = text.replace(SPACING_COMMANDS, ' ')
  for (const [pattern, replacement] of SYNONYMS) {
    text = text.replace(pattern, replacement)
  }

  // Ngoặc nhóm của LaTeX: `x^{2}` và `x^2` là một.
  text = text.replace(/[{}]/g, '')

  text = text.toLowerCase()

  // Bỏ dấu câu ở mức ký tự, giữ lại ký hiệu toán học có nghĩa.
  text = text.replace(/[.,;:!?"'`]/g, ' ')

  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Khoá dùng để SO SÁNH hai câu — bỏ luôn mọi khoảng trắng.
 *
 * `normalizeQuestion` giữ khoảng trắng vì kết quả của nó còn để người đọc.
 * Nhưng để so trùng thì khoảng trắng là nhiễu thuần tuý: cùng một công thức gõ
 * `f(x) = x^2 + 1` và `f(x)=x^2+1` là một câu, mà so chuỗi thì ra hai. Người
 * soạn không hề gõ nhất quán khoảng trắng quanh `=` và `+`, nên đây là nguồn
 * âm-tính-giả lớn nhất nếu bỏ qua.
 */
export function compareKey(raw: string): string {
  return normalizeQuestion(raw).replace(/\s+/g, '')
}

/**
 * "Bộ xương" của câu: chuẩn hoá rồi thay MỌI con số bằng `#`.
 *
 * Đây là thứ trả lời câu hỏi thật sự hữu ích khi soạn đề: "đề này có hai câu
 * cùng một dạng không". Hai câu cấp số nhân chỉ khác `u1=2, q=-3` với
 * `u1=5, q=2` là cùng một kỹ năng — nhét cả hai vào một đề là đo một thứ hai
 * lần, lỗi mà mắt người rất khó thấy khi ngân hàng lên vài nghìn câu.
 *
 * ĐÁNH ĐỔI phải biết: bộ xương cũng gộp `x^2` với `x^3`. Với đa số câu THPT
 * thì đúng là cùng dạng, nhưng không phải luôn luôn — nên kết quả là GỢI Ý để
 * người soạn duyệt, không phải căn cứ để xoá tự động.
 */
export function skeletonOf(raw: string): string {
  return compareKey(raw).replace(/-?\d+(?:[.,]\d+)?/g, '#')
}

/**
 * Tập n-gram ký tự dùng để đo độ giống nhau.
 *
 * Dùng n-gram KÝ TỰ chứ không phải từ: công thức toán sau chuẩn hoá thường
 * dính thành một khối dài không có khoảng trắng (`f(x)=x^2+2/x^2`), nên tách
 * theo từ sẽ cho ra vài "từ" khổng lồ và Jaccard mất hết độ phân giải.
 */
export function shingles(text: string, size = 5): Set<string> {
  const normalized = normalizeQuestion(text).replace(/\s/g, '')
  const result = new Set<string>()
  if (normalized.length === 0) return result
  if (normalized.length <= size) {
    result.add(normalized)
    return result
  }
  for (let i = 0; i + size <= normalized.length; i++) {
    result.add(normalized.slice(i, i + size))
  }
  return result
}

/** Độ giống Jaccard giữa hai tập. Hai tập rỗng coi như giống hệt. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  // Duyệt tập nhỏ hơn để chi phí là O(min) thay vì O(max).
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const item of small) {
    if (large.has(item)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}
