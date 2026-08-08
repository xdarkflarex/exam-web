/**
 * Chuẩn hoá text bài làm và sinh hash.
 *
 * Mục tiêu: hai lần OCR cùng một bài, khác nhau ở khoảng trắng hay kiểu dấu
 * nháy, phải cho cùng một hash — nếu không, hệ thống sẽ chấm lại và tính tiền
 * cho cùng một nội dung. Đồng thời phát hiện dấu hiệu prompt injection trước
 * khi nội dung tới model.
 *
 * Lưu ý: `answer_hash` ở đây phục vụ phát hiện lệch phiên bản và idempotency,
 * KHÔNG phải chữ ký mật mã (`docs/ESSAY_GRADING.md` đã ghi rõ giới hạn này).
 */

import { createHash } from 'crypto'

export interface NormalizeResult {
  text: string
  hash: string
  /** Ký tự đã bị cắt do vượt giới hạn; >0 nghĩa là bài bị mất phần cuối. */
  truncatedChars: number
  /** Dấu hiệu bài làm cố điều khiển model. Không tự chặn, chỉ báo lên trên. */
  injectionSignals: string[]
}

/** Khớp với giới hạn nhập liệu của ExamRunner (20.000 ký tự). */
const MAX_LENGTH = 20_000

/**
 * Mẫu điều khiển thường gặp. Cố ý bắt cả tiếng Việt lẫn tiếng Anh vì học sinh
 * thử nghiệm thường copy nguyên câu tiếng Anh từ mạng.
 *
 * Đây là tín hiệu để ép về người duyệt, không phải bộ lọc an toàn. Phòng thủ
 * thật nằm ở validator: điểm vượt `essay_max_score` bị từ chối bất kể model
 * nói gì.
 */
const INJECTION_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'ignore_instructions', pattern: /\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|above|prior)\b/i },
  { id: 'bo_qua_huong_dan', pattern: /\b(?:bỏ qua|bo qua)\s+(?:mọi|moi|tất cả|tat ca)?\s*(?:hướng dẫn|huong dan|quy tắc|quy tac)/i },
  { id: 'demand_full_score', pattern: /\b(?:cho|chấm|cham)\s*(?:tôi|toi|em)?\s*(?:điểm|diem)\s*(?:tối đa|toi da|10|max)/i },
  { id: 'role_override', pattern: /\b(?:you\s+are\s+now|from\s+now\s+on|act\s+as)\b/i },
  { id: 'system_prompt_probe', pattern: /\b(?:system\s+prompt|prompt\s+injection|jailbreak)\b/i },
  { id: 'fake_json', pattern: /"schema_version"\s*:\s*"essay-grade-result/i },
]

/**
 * Chuẩn hoá bảo toàn ngữ nghĩa toán học.
 *
 * KHÔNG đụng tới nội dung trong `$...$`, `\(...\)`, `\[...\]` ngoài việc gọn
 * khoảng trắng ngoài rìa: đổi dấu nháy hay ký tự Unicode bên trong công thức
 * có thể làm hỏng LaTeX và khiến bài chấm sai.
 */
function normalizeWhitespace(input: string): string {
  return input
    // Thống nhất kiểu xuống dòng.
    .replace(/\r\n?/g, '\n')
    // Ký tự vô hình hay lọt vào khi copy từ Word/PDF.
    .replace(/[​-‍﻿]/g, '')
    // Non-breaking space -> space thường.
    .replace(/ /g, ' ')
    // Nháy cong -> nháy thẳng (ngoài công thức thì an toàn).
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Gạch dài -> gạch ngắn.
    .replace(/[–—]/g, '-')
    // Gọn khoảng trắng trong dòng, giữ nguyên cấu trúc dòng.
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    // Tối đa hai dòng trống liên tiếp.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeAnswerText(input: string): NormalizeResult {
  const normalized = normalizeWhitespace(input)

  const truncatedChars = Math.max(0, normalized.length - MAX_LENGTH)
  const text = truncatedChars > 0 ? normalized.slice(0, MAX_LENGTH) : normalized

  const injectionSignals = INJECTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ id }) => id
  )

  return {
    text,
    hash: hashText(text),
    truncatedChars,
    injectionSignals,
  }
}

/** SHA-256 hex của text đã chuẩn hoá. */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Hash của toàn bộ input gửi provider, dùng làm khoá idempotency.
 *
 * Gồm cả rubric version và model: đổi rubric hoặc đổi model nghĩa là kết quả
 * cũ không còn dùng được, phải chấm lại. Nếu bỏ hai trường này ra khỏi hash,
 * hệ thống sẽ tái dùng nhầm kết quả của phiên bản khác.
 */
export function hashGradingInput(params: {
  answerHash: string
  rubricVersion: number
  questionId: string
  model: string
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        answer_hash: params.answerHash,
        rubric_version: params.rubricVersion,
        question_id: params.questionId,
        model: params.model,
      }),
      'utf8'
    )
    .digest('hex')
}
