/**
 * Rà soát HÌNH của câu hỏi — logic thuần, không AI, không mạng.
 *
 * Ba chế độ hỏng, tách riêng vì cách sửa khác hẳn nhau:
 *
 *  1. `tikz_lan_trong_de` — mã TikZ nằm trong `content` thay vì cột `tikz_code`.
 *     Học sinh đọc đề thấy `Unknown environment 'tikzpicture'` màu đỏ kèm hàng
 *     chục dòng `\draw`. Sửa được TẠI CHỖ bằng nút tách mã.
 *
 *  2. `nhac_hinh_ma_thieu` — đề nói "như hình vẽ" nhưng không có hình nào cả.
 *     Câu này KHÔNG LÀM ĐƯỢC: học sinh được bảo nhìn một thứ không tồn tại.
 *     Phải bổ sung hình ở question-bank.
 *
 *  3. `co_ma_chua_co_anh` — có `tikz_code` nhưng chưa có ảnh dựng sẵn. Mã đúng,
 *     chỉ là chưa ai dựng SVG. Học sinh không thấy gì.
 *
 * VÌ SAO TÁCH KHỎI `audit-rules.ts`: lớp luật ở đó chạy trong lượt quét AI và
 * quyết định câu nào ĐÁNG GỬI cho model. Rà hình là việc khác — nó quét cả ngân
 * hàng, miễn phí, tức thì, và không liên quan gì tới DeepSeek.
 */

import { hasInlineTikz } from './tikz-extract.ts'

export type FigureIssueCode =
  | 'tikz_lan_trong_de'
  | 'nhac_hinh_ma_thieu'
  | 'co_ma_chua_co_anh'

export interface FigureIssue {
  code: FigureIssueCode
  /** Câu tiếng Việt nói hỏng gì và sửa ở đâu. */
  message: string
  /** Sửa được ngay trong exam-web hay phải sang question-bank. */
  suaTaiCho: boolean
}

export interface FigureCheckInput {
  id: string
  content: string
  tikz_code?: string | null
  tikz_image_url?: string | null
}

/**
 * Đề có ĐANG NHẮC TỚI một hình không.
 *
 * CÁI BẪY LỚN NHẤT của phép kiểm này là từ "hình" trong tiếng Việt: "hình chóp",
 * "hình vuông", "hình bình hành", "hình trụ" là TÊN HÌNH KHỐI, không phải lời
 * mời nhìn một bức vẽ. Bắt trượt sang nhóm đó thì gần như mọi câu Hình học đều
 * bị gắn cờ, và danh sách thành vô dụng.
 *
 * Nên mọi mẫu dưới đây đều đòi một từ chỉ HÀNH ĐỘNG NHÌN hoặc một dấu ngoặc
 * đánh số hình đứng kèm — không mẫu nào khớp chỉ với chữ "hình" đơn độc.
 */
const FIGURE_MENTION: ReadonlyArray<RegExp> = [
  // `[Hình 1]`, `[Hình vẽ]`, `[HÌNH 2.3]` — dấu chỗ người nhập chừa lại.
  /\[\s*hình[^\]]*\]/i,
  /như\s+hình/i,
  /hình\s+vẽ/i,
  /hình\s+bên/i,
  /hình\s+sau/i,
  /xem\s+hình/i,
  /theo\s+hình/i,
  /quan\s+sát\s+hình/i,
  /cho\s+bởi\s+hình/i,
  /trong\s+hình/i,
  // Bảng biến thiên gần như luôn là một hình dựng sẵn.
  /bảng\s+biến\s+thiên/i,
  /đồ\s+thị\s+như/i,
]

export function mentionsFigure(content: string): boolean {
  if (!content) return false
  return FIGURE_MENTION.some((pattern) => pattern.test(content))
}

function isFilled(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0)
}

/** Rà hình cho MỘT câu. Trả về rỗng nghĩa là không có vấn đề gì về hình. */
export function checkFigure(question: FigureCheckInput): FigureIssue[] {
  const issues: FigureIssue[] = []
  const content = question.content ?? ''

  const inlineTikz = hasInlineTikz(content)
  const hasCode = isFilled(question.tikz_code)
  const hasImage = isFilled(question.tikz_image_url)

  if (inlineTikz) {
    issues.push({
      code: 'tikz_lan_trong_de',
      message:
        'Mã TikZ nằm trong nội dung đề thay vì cột tikz_code. Học sinh đang đọc đề ' +
        'thấy "Unknown environment \'tikzpicture\'" và hàng chục dòng lệnh vẽ.',
      suaTaiCho: true,
    })
  }

  if (hasCode && !hasImage) {
    issues.push({
      code: 'co_ma_chua_co_anh',
      message:
        'Có mã TikZ nhưng chưa có ảnh dựng sẵn — học sinh không thấy hình. ' +
        'Dựng SVG ở question-bank rồi điền lại đường dẫn ảnh.',
      suaTaiCho: false,
    })
  }

  // Đề nhắc tới hình mà KHÔNG có nguồn hình nào: mã lẫn trong đề cũng được tính
  // là có nguồn — sau khi tách ra thì nó thành `tikz_code`, nên câu đó thuộc
  // nhóm 1 chứ không phải nhóm này.
  if (mentionsFigure(content) && !inlineTikz && !hasCode && !hasImage) {
    issues.push({
      code: 'nhac_hinh_ma_thieu',
      message:
        'Đề nhắc tới hình vẽ nhưng câu không có hình nào. Học sinh được bảo nhìn ' +
        'một thứ không tồn tại — câu này hiện KHÔNG LÀM ĐƯỢC.',
      suaTaiCho: false,
    })
  }

  return issues
}

export interface FigureReport {
  questionId: string
  issues: FigureIssue[]
}

export interface FigureAuditSummary {
  scanned: number
  reports: FigureReport[]
  byCode: Record<FigureIssueCode, number>
}

export function auditFigures(questions: FigureCheckInput[]): FigureAuditSummary {
  const reports: FigureReport[] = []
  const byCode: Record<FigureIssueCode, number> = {
    tikz_lan_trong_de: 0,
    nhac_hinh_ma_thieu: 0,
    co_ma_chua_co_anh: 0,
  }

  for (const question of questions) {
    const issues = checkFigure(question)
    if (issues.length === 0) continue
    for (const issue of issues) byCode[issue.code]++
    reports.push({ questionId: question.id, issues })
  }

  return { scanned: questions.length, reports, byCode }
}
