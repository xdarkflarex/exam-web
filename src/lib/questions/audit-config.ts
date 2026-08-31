/**
 * Cờ bật/tắt và cấu hình model cho công cụ rà soát ngân hàng câu hỏi.
 *
 * Chỉ chạy phía server. Không import vào client component.
 *
 * VÌ SAO KILL-SWITCH RIÊNG, KHÔNG DÙNG CHUNG `ESSAY_AI_ENABLED`
 * (`docs/QUESTION_AUDIT_PLAN.md` mục 3.4): tắt pipeline chấm bài và tắt công cụ
 * rà soát là hai quyết định khác nhau. Chấm bài hỏng thì học sinh không có điểm
 * — phải tắt ngay. Rà soát hỏng thì chỉ là một danh sách đề xuất không ai bấm.
 * Gộp hai cờ nghĩa là để chữa cái này phải tắt cái kia.
 */

import { ProviderError } from '@/lib/essay-ai/contracts'
import { assertAllowedGradingModel } from '@/lib/essay-ai/model-allowlist'

export interface QuestionAuditConfig {
  provider: 'deepseek'
  apiKey: string
  model: string
}

export interface QuestionAuditFlags {
  enabled: boolean
  /** Trần chi phí tháng, USD. 0 nghĩa là chưa đặt trần. */
  monthlyCostCapUsd: number
  /** Số câu xử lý trong MỘT lần gọi `/step`. */
  batchSize: number
  /** Trần số câu một lượt quét. Chặn "quét cả ngân hàng" bằng tay. */
  maxQuestionsPerRun: number
}

/**
 * Tầng 1 của định tuyến hai tầng (kế hoạch mục 4). Phần lớn câu trong ngân hàng
 * là đúng, và với câu đúng thì việc duy nhất cần làm là xác nhận "khớp" — không
 * đáng tiền suy luận dài của `deepseek-reasoner`.
 *
 * Tầng 2 (`deepseek-reasoner`) chưa được nối vào; `combineTiers` trong
 * `audit-contracts.ts` đã sẵn sàng cho nó.
 */
const DEFAULT_MODEL = 'deepseek-chat'

function readEnv(name: string): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new ProviderError({
      provider: 'config',
      kind: 'config',
      message: 'Cấu hình rà soát chỉ được đọc phía server.',
      retryable: false,
    })
  }
}

function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = Number(readEnv(name) ?? '')
  if (!Number.isFinite(raw) || raw < 1) return fallback
  return Math.min(Math.floor(raw), max)
}

/** Không throw khi thiếu cấu hình: trả về trạng thái tắt, để route trả 503 gọn. */
export function readQuestionAuditFlags(): QuestionAuditFlags {
  assertServerOnly()

  const rawCap = Number(readEnv('QUESTION_AUDIT_MONTHLY_COST_CAP') ?? '')

  return {
    // Fail-closed: chỉ chuỗi 'true' tường minh mới bật.
    enabled: readEnv('QUESTION_AUDIT_ENABLED')?.toLowerCase() === 'true',
    monthlyCostCapUsd: Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 0,
    // 5 câu mỗi lượt gọi: đủ để tiến trình nhích thấy được trên trang, và đủ
    // ngắn để không chạm trần thời gian của route handler khi model chậm.
    batchSize: readPositiveInt('QUESTION_AUDIT_BATCH_SIZE', 5, 20),
    // Kế hoạch mục 2: không có nút "quét cả ngân hàng". Vài nghìn câu một lượt
    // vừa tốn tiền vừa cho ra một danh sách không ai đọc hết.
    maxQuestionsPerRun: readPositiveInt('QUESTION_AUDIT_MAX_QUESTIONS', 300, 1000),
  }
}

export function readQuestionAuditConfig(): QuestionAuditConfig {
  assertServerOnly()

  const apiKey = readEnv('DEEPSEEK_API_KEY')
  if (!apiKey) {
    throw new ProviderError({
      provider: 'deepseek',
      kind: 'config',
      message: 'Thiếu DEEPSEEK_API_KEY trong biến môi trường server.',
      retryable: false,
    })
  }

  // Cố ý KHÔNG dùng chung `DEEPSEEK_MODEL` với pipeline chấm bài: hai công việc
  // này có thể muốn hai model khác nhau, và đổi model chấm bài không được âm
  // thầm đổi model rà soát.
  const model = readEnv('QUESTION_AUDIT_MODEL') ?? DEFAULT_MODEL
  assertAllowedGradingModel('deepseek', model)

  return { provider: 'deepseek', apiKey, model }
}
