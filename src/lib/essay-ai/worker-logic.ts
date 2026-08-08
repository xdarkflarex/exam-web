/**
 * Phần thuần logic của worker chấm: parse gói chấm, chọn ngưỡng, ánh xạ lý do.
 *
 * Tách khỏi `worker.ts` vì hai lý do:
 *
 * 1. Test được. `worker.ts` import `@supabase/supabase-js` và (gián tiếp, qua
 *    `grading-provider.ts`) các module dùng alias `@/`, mà `node --test
 *    --experimental-strip-types` không phân giải được. Module này chỉ có import
 *    kiểu — bị strip hết khi chạy — nên test nạp được trực tiếp.
 *
 * 2. Đây là chỗ dữ liệu KHÔNG ĐÁNG TIN đi vào hệ thống. Gói chấm là jsonb do
 *    database trả, chứa đề bài và bài làm học sinh. `AGENTS.md` mục 4 yêu cầu
 *    validate lại thay vì ép kiểu. Gom việc đó vào một file có test riêng thì
 *    khó bỏ sót hơn.
 */

import type { EssayRubricCriterion } from '@/lib/essay-grading/prompt'

/** Gói chấm đã được kiểm kiểu, sẵn sàng đưa vào provider. */
export interface GradingPackage {
  gradingRef: string
  rubricVersion: number
  question: string
  referenceAnswer: string
  rubric: EssayRubricCriterion[]
  studentAnswer: string
  maxScore: number
  aiEnabled: boolean
  /** Ngưỡng riêng của câu hỏi; null khi cấu hình không đặt. */
  minConfidence: number | null
}

/** Lý do một bài bị bỏ qua TRƯỚC khi gọi provider (chi phí = 0). */
export type SkipReason =
  | 'ai_disabled_for_question'
  | 'rubric_version_changed'
  | 'grading_config_missing'
  | 'answer_no_longer_pending'
  | 'already_graded_same_input'
  | 'package_unavailable'

export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 25

/**
 * Kẹp `limit` vào 1..25. Giá trị lạ (NaN, âm, chuỗi) về mặc định thay vì throw:
 * một tham số sai không đáng làm hỏng cả lượt cron.
 */
export function clampLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

/**
 * Ngưỡng confidence cuối = giá trị CHẶT HƠN giữa cấu hình toàn cục (env) và
 * cấu hình riêng của câu hỏi.
 *
 * Đây là quy tắc quan trọng: mỗi nguồn đều được phép siết, không nguồn nào
 * được nới. Nếu lấy `min` thay vì `max`, một câu hỏi cấu hình lỏng sẽ vô hiệu
 * hoá ngưỡng chung của cả hệ thống.
 */
export function resolveConfidenceMin(
  flagsConfidenceMin: number,
  packageMinConfidence: number | null
): number {
  return Math.max(flagsConfidenceMin, packageMinConfidence ?? 0)
}

/**
 * Rubric đổi sau khi học sinh nộp thì kết quả chấm không dùng được:
 * `ai_finalize_essay_answer` so `p_rubric_version` với
 * `student_answers.grading_rubric_version` (snapshot lúc nộp), trong khi gói
 * chấm trả `question_grading_configs.rubric_version` (hiện tại).
 *
 * Lệch nhau thì RPC raise `RUBRIC_VERSION_MISMATCH` — an toàn, nhưng chỉ sau
 * khi đã trả tiền cho một lời gọi provider. So trước ở đây để khỏi tốn.
 *
 * `null` (chưa có snapshot) cũng coi là lệch: không có gì để đối chiếu thì
 * không được auto-chốt.
 */
export function rubricVersionMatches(
  packageVersion: number,
  answerSnapshotVersion: number | null
): boolean {
  return answerSnapshotVersion !== null && packageVersion === answerSnapshotVersion
}

/**
 * Ánh xạ mã lỗi của `get_essay_grading_package` về lý do bỏ qua.
 *
 * Các mã này do migration 20260804 định nghĩa và không chứa dữ liệu học sinh,
 * nên an toàn để đưa vào báo cáo và log.
 */
export function mapPackageError(message: string): SkipReason {
  if (message.includes('GRADING_CONFIG_MISSING')) return 'grading_config_missing'
  if (message.includes('ANSWER_NOT_PENDING')) return 'answer_no_longer_pending'
  if (message.includes('ATTEMPT_NOT_SUBMITTED')) return 'answer_no_longer_pending'
  return 'package_unavailable'
}

/**
 * Kiểm kiểu gói chấm trả về từ database.
 *
 * Trả `null` khi bất kỳ trường bắt buộc nào sai kiểu hoặc rỗng — người gọi sẽ
 * bỏ qua bài đó. Fail-closed: thà không chấm còn hơn chấm trên dữ liệu méo.
 */
export function parsePackage(raw: unknown): GradingPackage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>

  const gradingRef = value.grading_ref
  const rubricVersion = value.rubric_version
  const question = value.question
  const referenceAnswer = value.reference_answer
  const studentAnswer = value.student_answer
  const maxScore = value.max_score

  if (
    typeof gradingRef !== 'string' ||
    gradingRef.length === 0 ||
    typeof rubricVersion !== 'number' ||
    !Number.isInteger(rubricVersion) ||
    typeof question !== 'string' ||
    question.trim().length === 0 ||
    typeof referenceAnswer !== 'string' ||
    typeof studentAnswer !== 'string' ||
    studentAnswer.trim().length === 0 ||
    typeof maxScore !== 'number' ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0
  ) {
    return null
  }

  const rubric = parseRubric(value.rubric)
  if (!rubric) return null

  const minConfidence = value.min_confidence

  return {
    gradingRef,
    rubricVersion,
    question,
    referenceAnswer,
    rubric,
    studentAnswer,
    maxScore,
    // Mặc định false: chỉ `true` tường minh mới bật, giống readBooleanFlag.
    aiEnabled: value.ai_enabled === true,
    minConfidence:
      typeof minConfidence === 'number' &&
      Number.isFinite(minConfidence) &&
      minConfidence >= 0 &&
      minConfidence <= 1
        ? minConfidence
        : null,
  }
}

/**
 * Rubric rỗng nghĩa là không có tiêu chí nào để chấm theo — từ chối thay vì để
 * model tự nghĩ ra thang điểm.
 */
export function parseRubric(raw: unknown): EssayRubricCriterion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null

  const rubric: EssayRubricCriterion[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const item = entry as Record<string, unknown>

    if (
      typeof item.criterion_id !== 'string' ||
      item.criterion_id.length === 0 ||
      typeof item.title !== 'string' ||
      typeof item.max_score !== 'number' ||
      !Number.isFinite(item.max_score) ||
      item.max_score <= 0
    ) {
      return null
    }

    // Trùng criterion_id làm `parseEssayGradingSuggestion` không kiểm đủ được
    // "mỗi tiêu chí đúng một lần"; chặn ngay từ đầu vào.
    if (seen.has(item.criterion_id)) return null
    seen.add(item.criterion_id)

    rubric.push({
      criterion_id: item.criterion_id,
      title: item.title,
      description: typeof item.description === 'string' ? item.description : '',
      max_score: item.max_score,
    })
  }

  return rubric
}
