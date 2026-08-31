/**
 * Prompt cho lượt rà soát một câu hỏi.
 *
 * Điểm quan trọng nhất của file này là THỨ TỰ. Kế hoạch mục 5 chọn phương án
 * "một lượt có ràng buộc thứ tự" thay vì hai lượt: model được thấy đáp án đang
 * lưu, nhưng bị bắt tự giải và điền `loi_giai_tu_lam` / `dap_an_tu_lam` TRƯỚC.
 * `parseQuestionAuditResult` từ chối kết quả nào không theo thứ tự đó.
 *
 * Nếu gửi đáp án kèm ngay từ đầu mà không ràng buộc gì, model có xu hướng đồng ý
 * với cái nó đã thấy — và một công cụ luôn nói "khớp" thì vô dụng.
 *
 * v2 (2026-08-30): bắt model soát BA PHẦN ĐỘC LẬP — đề, đáp án, lời giải — và
 * cho phép báo lỗi ở nhiều phần cùng lúc. Bản v1 bắt chọn một nhánh duy nhất,
 * nên câu hỏng cả đáp án lẫn lời giải (hình dạng điển hình của một đợt nhập OCR
 * hỏng) rơi vào nhánh "không đề xuất gì" và biến mất khỏi danh sách.
 *
 * KHÔNG có dữ liệu học sinh trong payload: chỉ nội dung câu hỏi, mã TikZ, lời
 * giải và đáp án. Đây là lý do công cụ này không cần lớp redaction như
 * `src/lib/essay-ai/redaction.ts`.
 */

import { QUESTION_AUDIT_SCHEMA } from './audit-contracts.ts'

export interface AuditPromptInput {
  questionId: string
  questionType: 'multiple_choice' | 'true_false' | 'short_answer'
  content: string
  tikzCode?: string | null
  explanation?: string | null
  solution?: string | null
  answers: Array<{ id: string; content: string; is_correct: boolean }>
}

/** Cách diễn đạt `dap_an_dung_moi` theo từng dạng câu. */
const ANSWER_FORMAT: Record<AuditPromptInput['questionType'], string> = {
  multiple_choice: 'đúng MỘT id phương án, ví dụ "ans_3"',
  true_false:
    'danh sách id các ý phải mang Đúng, nối bằng dấu phẩy, ví dụ "y1,y3"; ' +
    'chuỗi rỗng "" nếu cả bốn ý đều Sai',
  short_answer: 'giá trị đáp án dạng văn bản, ví dụ "3,5"',
}

function section(title: string, body: string | null | undefined): string {
  const text = (body ?? '').trim()
  return text.length > 0 ? `${title}:\n${text}` : `${title}: (đang trống)`
}

export function buildQuestionAuditPrompt(input: AuditPromptInput): string {
  const answerLines = input.answers
    .map(
      (answer) =>
        `- id=${answer.id} | đang đánh dấu ${answer.is_correct ? 'ĐÚNG' : 'SAI'} | ${answer.content}`
    )
    .join('\n')

  const hasExplanation = (input.explanation ?? '').trim().length > 0
  const hasSolution = (input.solution ?? '').trim().length > 0

  return `Bạn là giáo viên Toán THPT Việt Nam đang soát lại một câu trong ngân hàng đề.

NHIỆM VỤ, theo đúng thứ tự này:
1. Tự giải câu hỏi từ đầu, KHÔNG nhìn phần "ĐANG LƯU" ở dưới.
2. Chỉ sau khi đã có đáp án của riêng mình, mới đối chiếu với dữ liệu đang lưu.
3. Soát BA PHẦN RIÊNG BIỆT và kết luận độc lập cho từng phần. Một câu có thể sai
   ở nhiều phần cùng lúc — đừng chỉ báo một phần rồi bỏ qua phần còn lại.

PHẦN 1 — ĐỀ BÀI (danh_gia_de)
Chỉ báo "co_loi": true khi bản thân đề SAI hoặc KHÔNG TRẢ LỜI ĐƯỢC: dữ kiện mâu
thuẫn, thiếu dữ kiện để có đáp án duy nhất, số liệu vô lý, hỏi một đằng cho dữ
kiện một nẻo, hoặc nội dung bị cụt.
KHÔNG dùng phần này cho lỗi gõ LaTeX thuần tuý — cái đó ghi vào "loi_latex".
Khi đề sai thì KHÔNG đề xuất sửa gì cả (cả đáp án lẫn lời giải đều để null): sửa
đáp án của một đề sai là vô nghĩa, và viết lại đề là đổi thứ đang được đo.

PHẦN 2 — ĐÁP ÁN (danh_gia_dap_an)
So đáp án bạn tự tìm ra với phương án đang được đánh dấu ĐÚNG.
"co_loi": true nếu đánh dấu sai. Khi đó "dap_an_dung_moi" là ${ANSWER_FORMAT[input.questionType]}.

PHẦN 3 — LỜI GIẢI (danh_gia_loi_giai)
Có HAI ô lời giải, học sinh thấy cả hai:
- "Giải thích" (explanation) — ${hasExplanation ? 'ĐANG CÓ nội dung' : 'ĐANG TRỐNG'}
- "Lời giải" (solution) — ${hasSolution ? 'ĐANG CÓ nội dung' : 'ĐANG TRỐNG'}
"co_loi": true nếu lời giải có bước sai, kết quả cuối không khớp đáp án đúng, lập
luận nhảy cóc dẫn tới sai, hoặc áp sai công thức. Khi đó viết lại ô nào sai vào
"explanation_moi" / "solution_moi"; ô nào không sai thì để null.
QUAN TRỌNG: chỉ được viết lại ô ĐANG CÓ NỘI DUNG. Ô đang trống thì để null —
điền vào ô trống là viết lời giải mới, không phải sửa lời giải sai, và kết quả
sẽ bị loại bỏ.

KHÔNG KIỂM ĐƯỢC
Đặt "khong_kiem_duoc": true kèm lý do khi thiếu hình, thiếu dữ kiện để giải, đề
mơ hồ, hoặc bạn không đủ chắc. Khi đó cả ba phần đều để "co_loi": false và không
đề xuất gì. Đây là câu trả lời HỢP LỆ và hãy dùng nó thật — đoán bừa còn tệ hơn
nhiều so với nói rằng không kiểm được.

CÂU HỎI
Dạng: ${input.questionType}
${section('Nội dung đề', input.content)}
${section('Mã TikZ của hình (đọc như LaTeX)', input.tikzCode)}

ĐANG LƯU (chỉ được dùng SAU khi bạn đã tự giải xong)
${answerLines || '(không có phương án nào)'}
${section('Ô "Giải thích" (explanation)', input.explanation)}
${section('Ô "Lời giải" (solution)', input.solution)}

ĐỊNH DẠNG TRẢ VỀ
Chỉ trả về đúng MỘT object JSON, không Markdown, không giải thích ngoài JSON.
Các khoá phải xuất hiện ĐÚNG THỨ TỰ dưới đây — "loi_giai_tu_lam" và
"dap_an_tu_lam" bắt buộc đứng trước ba phần đánh giá. Sai thứ tự thì kết quả bị
loại bỏ. KHÔNG tự thêm trường "ket_luan"; hệ thống tự suy ra từ ba phần.

{
  "schema": "${QUESTION_AUDIT_SCHEMA}",
  "question_id": "${input.questionId}",
  "loi_giai_tu_lam": "lời giải bạn tự làm, ngắn gọn, tiếng Việt, LaTeX trong $...$",
  "dap_an_tu_lam": "đáp án bạn tự tìm ra",
  "khong_kiem_duoc": false,
  "ly_do_khong_kiem_duoc": null,
  "danh_gia_de": {
    "co_loi": false,
    "mo_ta": null
  },
  "danh_gia_dap_an": {
    "co_loi": false,
    "mo_ta": null,
    "dap_an_dung_moi": null
  },
  "danh_gia_loi_giai": {
    "co_loi": false,
    "mo_ta": null,
    "explanation_moi": null,
    "solution_moi": null
  },
  "loi_latex": [],
  "do_tin_cay": 0.0
}

"mo_ta" bắt buộc có khi "co_loi": true — nói NGẮN GỌN sai ở đâu, để người soạn
đọc là hiểu ngay, đừng chép lại cả lời giải.
"loi_latex" là danh sách lỗi gõ LaTeX bạn nhìn thấy (dấu $ lẻ, ngoặc thiếu, lệnh
sai) trong đề hoặc lời giải; không có thì để [].
"do_tin_cay" là số thực 0..1.`
}
