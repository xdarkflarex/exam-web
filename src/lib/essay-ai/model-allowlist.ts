/**
 * Allowlist model và đọc cấu hình provider.
 *
 * Vì sao cần allowlist: `AGENTS.md` mục 4 yêu cầu tên model không được tin
 * một cách mù quáng. Hôm nay giá trị đến từ biến môi trường (do người vận hành
 * đặt), nhưng nếu sau này cấu hình chuyển vào database hoặc trang admin thì
 * một giá trị do người dùng kiểm soát sẽ đi thẳng vào URL/body gọi provider.
 * Chặn ở đây một lần rẻ hơn nhiều so với sửa sau.
 *
 * Module này chỉ chạy phía server. Không import vào client component.
 */

import { ProviderError } from './contracts'

export type OcrProviderName = 'openai' | 'gemini'
export type GradingProviderName = 'deepseek'

/**
 * Model được phép dùng cho OCR. Danh sách cố ý ngắn và phải được cập nhật
 * có chủ đích sau benchmark, không mở rộng vì "model mới chắc tốt hơn".
 * Chưa benchmark model nào tính đến 2026-08-03; đây là khung, không phải
 * khuyến nghị đã kiểm chứng.
 */
const OCR_MODEL_ALLOWLIST: Readonly<Record<OcrProviderName, readonly string[]>> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  gemini: [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    // Họ 3.x. Khác 2.x ở chỗ có thinking mặc định bật: xem
    // `supportsThinkingConfig` trong ocr-provider.ts — không tắt thì mỗi lượt
    // OCR trả thêm vài trăm thinking token vô ích cho việc chép chữ.
    'gemini-3.6-flash',
    'gemini-3.6-flash-lite',
    'gemini-3.5-flash-lite',
  ],
}

const GRADING_MODEL_ALLOWLIST: Readonly<Record<GradingProviderName, readonly string[]>> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
}

function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new ProviderError({
      provider: 'config',
      kind: 'config',
      message: 'Cấu hình provider AI chỉ được đọc phía server.',
      retryable: false,
    })
  }
}

function isOcrProviderName(value: string): value is OcrProviderName {
  return value === 'openai' || value === 'gemini'
}

export function assertAllowedOcrModel(provider: OcrProviderName, model: string): void {
  if (!OCR_MODEL_ALLOWLIST[provider].includes(model)) {
    throw new ProviderError({
      provider,
      kind: 'config',
      message: `Model OCR "${model}" không nằm trong allowlist của ${provider}.`,
      retryable: false,
    })
  }
}

export function assertAllowedGradingModel(
  provider: GradingProviderName,
  model: string
): void {
  if (!GRADING_MODEL_ALLOWLIST[provider].includes(model)) {
    throw new ProviderError({
      provider,
      kind: 'config',
      message: `Model chấm "${model}" không nằm trong allowlist của ${provider}.`,
      retryable: false,
    })
  }
}

export interface OcrConfig {
  provider: OcrProviderName
  apiKey: string
  model: string
}

export interface GradingConfig {
  provider: GradingProviderName
  apiKey: string
  model: string
}

export interface EssayAiFlags {
  /** Kill-switch toàn pipeline. */
  enabled: boolean
  /** Kill-switch riêng cho việc AI tự chốt điểm. */
  autoFinalize: boolean
  /** Ngưỡng confidence tối thiểu để được auto-chốt. */
  confidenceMin: number
  /** Trần chi phí tháng, USD. 0 nghĩa là chưa đặt trần. */
  monthlyCostCapUsd: number
}

function readEnv(name: string): string | null {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readBooleanFlag(name: string): boolean {
  // Mặc định false: chỉ chuỗi 'true' tường minh mới bật.
  // Fail-closed theo AGENTS.md mục 4.
  return readEnv(name)?.toLowerCase() === 'true'
}

/**
 * Đọc kill-switch và ngưỡng. Không throw khi thiếu cấu hình — trả về trạng
 * thái tắt, để pipeline degrade về luồng giáo viên duyệt thay vì vỡ.
 */
export function readEssayAiFlags(): EssayAiFlags {
  assertServerOnly()

  const rawConfidence = Number(readEnv('ESSAY_AI_CONFIDENCE_MIN') ?? '')
  const rawCostCap = Number(readEnv('ESSAY_AI_MONTHLY_COST_CAP') ?? '')

  return {
    enabled: readBooleanFlag('ESSAY_AI_ENABLED'),
    autoFinalize: readBooleanFlag('ESSAY_AI_AUTO_FINALIZE'),
    // Ngưỡng không hợp lệ hoặc thiếu -> 1.0, nghĩa là gần như không bao giờ
    // auto-chốt. Cấu hình sai phải làm hệ thống thận trọng hơn, không lỏng hơn.
    confidenceMin:
      Number.isFinite(rawConfidence) && rawConfidence > 0 && rawConfidence <= 1
        ? rawConfidence
        : 1,
    monthlyCostCapUsd:
      Number.isFinite(rawCostCap) && rawCostCap > 0 ? rawCostCap : 0,
  }
}

export function readOcrConfig(): OcrConfig {
  assertServerOnly()

  // Mặc định gemini vì đó là key người dùng đã cấu hình. Vẫn cho phép ghi đè
  // bằng OCR_PROVIDER nếu sau này đổi sang OpenAI.
  const provider = readEnv('OCR_PROVIDER') ?? 'gemini'

  // Chấp nhận cả GEMINI_API_KEY (tên quen thuộc) lẫn OCR_API_KEY (tên chung
  // của adapter). KHÔNG đọc biến NEXT_PUBLIC_*: giá trị mang tiền tố đó đã bị
  // Next.js nhúng vào bundle trình duyệt, tức là key đã công khai — đọc nó ở
  // server chỉ hợp thức hoá một key đã rò rỉ.
  const apiKey =
    readEnv('OCR_API_KEY') ??
    (provider === 'gemini' ? readEnv('GEMINI_API_KEY') : null)

  const model =
    readEnv('OCR_MODEL') ?? (provider === 'gemini' ? 'gemini-3.6-flash' : null)

  if (!apiKey || !model) {
    throw new ProviderError({
      provider,
      kind: 'config',
      message:
        provider === 'gemini'
          ? 'Thiếu GEMINI_API_KEY (hoặc OCR_API_KEY) trong biến môi trường server.'
          : 'Thiếu OCR_PROVIDER, OCR_API_KEY hoặc OCR_MODEL.',
      retryable: false,
    })
  }

  if (!isOcrProviderName(provider)) {
    throw new ProviderError({
      provider,
      kind: 'config',
      message: `OCR_PROVIDER "${provider}" không được hỗ trợ.`,
      retryable: false,
    })
  }

  assertAllowedOcrModel(provider, model)
  return { provider, apiKey, model }
}

export function readGradingConfig(): GradingConfig {
  assertServerOnly()

  const apiKey = readEnv('DEEPSEEK_API_KEY')
  const model = readEnv('DEEPSEEK_MODEL')

  if (!apiKey || !model) {
    throw new ProviderError({
      provider: 'deepseek',
      kind: 'config',
      message: 'Thiếu DEEPSEEK_API_KEY hoặc DEEPSEEK_MODEL.',
      retryable: false,
    })
  }

  assertAllowedGradingModel('deepseek', model)
  return { provider: 'deepseek', apiKey, model }
}
