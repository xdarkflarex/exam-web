/**
 * Lưu nháp bài làm trên MÁY HỌC SINH, để F5 hay sập trình duyệt giữa giờ thi
 * không mất bài.
 *
 * VÌ SAO CẦN: `ExamRunner` giữ đáp án trong state React và chỉ gửi lên server
 * một lần duy nhất lúc nộp (`submit_exam_attempt`). Thiết kế đó rất nhẹ cho
 * server — một transaction cho một bài thi thay vì hàng nghìn lượt autosave —
 * nhưng nó có đúng một hệ quả xấu: tải lại trang là mất sạch đáp án đã chọn,
 * và không có cách nào cứu. Hệ quả ấy rơi vào người thật, giữa lúc đang thi.
 *
 * VÌ SAO LÀ `localStorage` CHỨ KHÔNG PHẢI SERVER: giữ nguyên tính chất "server
 * chỉ nhận một lần ghi cho mỗi bài thi". Bản nháp nằm trên máy của chính học
 * sinh, không đi đâu cả, nên cũng không thêm rủi ro lộ dữ liệu.
 *
 * BA ĐIỀU BẤT BIẾN:
 *
 * 1. **Không bao giờ được làm vỡ buổi thi.** Mọi lời gọi ở đây đều nuốt lỗi:
 *    chế độ riêng tư, hết quota, `localStorage` bị chặn — tất cả đều chỉ dẫn
 *    tới "không có nháp", không bao giờ dẫn tới một exception ném ra giữa giờ.
 * 2. **Khoá theo `attemptId`, không theo `examId`.** Một học sinh có thể làm
 *    cùng một đề nhiều lượt; trộn nháp giữa hai lượt là ghi đáp án của lượt cũ
 *    vào lượt mới.
 * 3. **Nháp không phải nguồn sự thật.** Nộp xong là xoá. Điểm số và bài làm
 *    chính thức nằm ở `student_answers` trên server, không ở đây.
 */

import type { QuestionType } from '@/types'

/** Đúng hình dạng đáp án mà `ExamRunner` giữ trong state. */
export interface ExamDraftAnswer {
  questionId: string
  questionType: QuestionType
  selectedAnswer?: string
  selectedAnswers?: Record<string, boolean>
  textAnswer?: string
}

export type ExamDraftAnswers = Record<string, ExamDraftAnswer>

export interface ExamDraft {
  answers: ExamDraftAnswers
  /** Thời điểm lưu, ISO. Dùng để báo cho học sinh và để dọn nháp cũ. */
  savedAt: string
}

/** Chỉ cần đúng phần API của `localStorage` mà module này dùng. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

const PREFIX = 'exam-draft:'
const VERSION = 1
/** Nháp cũ hơn ngần này thì dọn: lượt thi quá hạn không bao giờ nộp được nữa. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function defaultStorage(): DraftStorage | null {
  try {
    // `globalThis.localStorage` ném ngay khi đọc trong một số cấu hình chặn
    // cookie, nên phép thử phải nằm trong try.
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

export function draftKey(attemptId: string): string {
  return `${PREFIX}${attemptId}`
}

/**
 * Lọc bỏ những gì không còn đúng hình dạng.
 *
 * Nháp hỏng một phần vẫn cứu được phần lành: bỏ câu hỏng, giữ câu còn đọc được.
 * Ném lỗi ở đây là biến một bản nháp méo thành một buổi thi trắng.
 */
function sanitizeAnswers(value: unknown, validQuestionIds?: ReadonlySet<string>): ExamDraftAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: ExamDraftAnswers = {}

  for (const [questionId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    if (validQuestionIds && !validQuestionIds.has(questionId)) continue

    const item = raw as Record<string, unknown>
    if (typeof item.questionType !== 'string') continue

    const answer: ExamDraftAnswer = {
      questionId,
      questionType: item.questionType as QuestionType,
    }
    if (typeof item.selectedAnswer === 'string') answer.selectedAnswer = item.selectedAnswer
    if (typeof item.textAnswer === 'string') answer.textAnswer = item.textAnswer
    if (item.selectedAnswers && typeof item.selectedAnswers === 'object' && !Array.isArray(item.selectedAnswers)) {
      const picks: Record<string, boolean> = {}
      for (const [key, flag] of Object.entries(item.selectedAnswers as Record<string, unknown>)) {
        if (typeof flag === 'boolean') picks[key] = flag
      }
      answer.selectedAnswers = picks
    }
    out[questionId] = answer
  }
  return out
}

/** Ghi nháp. Trả `false` khi không ghi được — người gọi KHÔNG cần xử lý gì thêm. */
export function saveDraft(
  attemptId: string,
  answers: ExamDraftAnswers,
  storage: DraftStorage | null = defaultStorage(),
  now: Date = new Date()
): boolean {
  if (!storage || !attemptId) return false
  const payload = JSON.stringify({ v: VERSION, attemptId, savedAt: now.toISOString(), answers })

  try {
    storage.setItem(draftKey(attemptId), payload)
    return true
  } catch {
    // Nhiều khả năng là hết quota. Dọn nháp của các lượt khác rồi thử lại đúng
    // một lần — bài đang thi quan trọng hơn mọi bản nháp cũ.
    try {
      pruneDrafts(storage, now, attemptId)
      storage.setItem(draftKey(attemptId), payload)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Đọc nháp của một lượt thi. `null` khi không có, hỏng, hoặc khác `attemptId`.
 *
 * `validQuestionIds` lọc theo đề đang mở: câu không thuộc đề này bị bỏ, để một
 * bản nháp cũ không chèn đáp án của câu đã bị gỡ khỏi đề.
 */
export function loadDraft(
  attemptId: string,
  validQuestionIds?: ReadonlySet<string>,
  storage: DraftStorage | null = defaultStorage()
): ExamDraft | null {
  if (!storage || !attemptId) return null
  let raw: string | null
  try {
    raw = storage.getItem(draftKey(attemptId))
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed?.v !== VERSION) return null
    // Khoá có thể bị sửa tay; đối chiếu lại để không nạp nháp của lượt khác.
    if (typeof parsed.attemptId === 'string' && parsed.attemptId !== attemptId) return null

    const answers = sanitizeAnswers(parsed.answers, validQuestionIds)
    if (Object.keys(answers).length === 0) return null

    return {
      answers,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    }
  } catch {
    return null
  }
}

export function clearDraft(attemptId: string, storage: DraftStorage | null = defaultStorage()): void {
  if (!storage || !attemptId) return
  try {
    storage.removeItem(draftKey(attemptId))
  } catch {
    /* không ghi được thì cũng không xoá được; bỏ qua */
  }
}

/**
 * Dọn nháp quá hạn (và tuỳ chọn: mọi nháp trừ lượt đang thi, khi hết quota).
 * Trả về số khoá đã xoá.
 */
export function pruneDrafts(
  storage: DraftStorage | null = defaultStorage(),
  now: Date = new Date(),
  keepAttemptId?: string
): number {
  if (!storage) return 0
  const doomed: string[] = []

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !key.startsWith(PREFIX)) continue
      if (keepAttemptId && key === draftKey(keepAttemptId)) continue

      // Hết quota (`keepAttemptId` có mặt) thì dọn sạch mọi lượt khác; bình
      // thường thì chỉ dọn cái quá hạn.
      if (keepAttemptId) {
        doomed.push(key)
        continue
      }
      let savedAt: unknown = null
      try {
        savedAt = (JSON.parse(storage.getItem(key) ?? '{}') as Record<string, unknown>).savedAt
      } catch {
        doomed.push(key)
        continue
      }
      const stamp = typeof savedAt === 'string' ? Date.parse(savedAt) : Number.NaN
      if (!Number.isFinite(stamp) || now.getTime() - stamp > MAX_AGE_MS) doomed.push(key)
    }

    for (const key of doomed) storage.removeItem(key)
  } catch {
    return 0
  }
  return doomed.length
}

/** `14:05 ngày 27/10` — để báo học sinh biết nháp lưu lúc nào. */
export function formatSavedAt(savedAt: string): string | null {
  const stamp = Date.parse(savedAt)
  if (!Number.isFinite(stamp)) return null
  const date = new Date(stamp)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${two(date.getHours())}:${two(date.getMinutes())} ngày ${two(date.getDate())}/${two(date.getMonth() + 1)}`
}
