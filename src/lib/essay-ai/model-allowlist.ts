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

import { ProviderError } from './contracts.ts'

export type OcrProviderName = 'openai' | 'gemini' | 'deepseek'
export type GradingProviderName = 'deepseek'

/**
 * Model được phép dùng cho OCR. Danh sách cố ý ngắn và phải được cập nhật
 * có chủ đích sau benchmark, không mở rộng vì "model mới chắc tốt hơn".
 * Chưa benchmark model nào tính đến 2026-08-03; đây là khung, không phải
 * khuyến nghị đã kiểm chứng.
 */
const OCR_MODEL_ALLOWLIST: Readonly<Record<OcrProviderName, readonly string[]>> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  /**
   * DeepSeek — THÊM 2026-10-26, CHƯA BENCHMARK, VÀ TÊN MODEL CHƯA XÁC MINH
   * TẠI NGUỒN.
   *
   * DeepSeek có vision trên API từ tháng 8/2026 (`deepseek-v4-flash-vision-exp`),
   * rồi tháng 9/2026 gộp multimodal vào model chính và khai tử bản thử nghiệm.
   * Hai tên dưới đây lấy từ tài liệu bên thứ ba: phiên thêm chúng bị chặn ra
   * deepseek.com nên KHÔNG đọc được tài liệu gốc, mà các nguồn thứ ba thì mâu
   * thuẫn nhau về tên và về ngày.
   *
   * Trước khi đặt `OCR_PROVIDER=deepseek` trên production, chạy
   * `node scripts/deepseek-vision-probe.mjs <ảnh>` để hỏi thẳng API xem tên nào
   * còn sống và nó có nhận ảnh thật không. Nhớ bài học ngày 2026-09-10 ở khối
   * chú thích phía dưới: API trả 200 không có nghĩa là model bạn gọi đang chạy.
   */
  deepseek: ['deepseek-flash', 'deepseek-v4-flash'],
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

/**
 * ==========================================================================
 * CẬP NHẬT 2026-09-10 — `deepseek-chat` đã QUÁ HẠN KHAI TỬ
 *
 * DeepSeek thông báo: "deepseek-chat & deepseek-reasoner will be fully retired
 * and inaccessible after Jul 24th, 2026, 15:59 (UTC). (Currently routing to
 * deepseek-v4-flash non-thinking/thinking.)"
 *
 * Đo ngày 2026-09-10 (quá hạn 48 ngày): gọi `deepseek-chat` vẫn trả 200, nhưng
 * trường `model` trong phản hồi ghi `deepseek-flash`. Alias còn sống ngoài cam
 * kết, và có thể tắt bất cứ lúc nào không báo trước.
 *
 * ĐIỀU QUAN TRỌNG PHẢI HIỂU ĐÚNG: **model chấm bài đã đổi rồi**, từ phía
 * DeepSeek, im lặng. Đổi tên ở đây KHÔNG đổi thứ đang chạy — nó chỉ làm cái
 * đang chạy trở nên nhìn thấy được, và gỡ quả bom hẹn giờ khi alias tắt.
 *
 * VÌ SAO GIỮ HAI TÊN CŨ: `.env` đang đặt `DEEPSEEK_MODEL=deepseek-chat` và
 * `ESSAY_AI_AUTO_FINALIZE=true`. Gỡ ngay là pipeline chấm bài fail-closed
 * (`ProviderError`) cho tới khi ai đó sửa `.env` — đúng lúc học sinh đang nộp
 * bài. Hai tên cũ ở lại đến khi `.env` chuyển sang `deepseek-v4-flash`, rồi mới
 * xoá.
 *
 * `deepseek-v4-pro` được thêm nhưng CHƯA benchmark cho việc chấm bài. Đúng
 * tinh thần khối chú thích ở trên: allowlist là danh sách "được phép", không
 * phải "được khuyến nghị".
 * ==========================================================================
 */
const GRADING_MODEL_ALLOWLIST: Readonly<Record<GradingProviderName, readonly string[]>> = {
  deepseek: [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    // Đã quá hạn khai tử — giữ để không làm đứt cấu hình đang chạy. Xoá sau khi
    // `.env` đổi sang tên v4.
    'deepseek-chat',
    'deepseek-reasoner',
  ],
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
  return value === 'openai' || value === 'gemini' || value === 'deepseek'
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
    (provider === 'gemini'
      ? readEnv('GEMINI_API_KEY')
      : // Dùng chung key với pipeline chấm bài: cùng một tài khoản DeepSeek,
        // không bắt người vận hành đặt hai biến cho cùng một key.
        provider === 'deepseek'
        ? readEnv('DEEPSEEK_API_KEY')
        : null)

  // Gemini có mặc định vì đó là đường đang chạy. DeepSeek CỐ Ý không có mặc
  // định: tên model bên đó đã đổi ngầm một lần rồi, nên bắt đặt `OCR_MODEL`
  // tường minh để người vận hành biết chính xác mình đang gọi cái gì.
  const model =
    readEnv('OCR_MODEL') ?? (provider === 'gemini' ? 'gemini-3.6-flash' : null)

  if (!apiKey || !model) {
    throw new ProviderError({
      provider,
      kind: 'config',
      message:
        provider === 'gemini'
          ? 'Thiếu GEMINI_API_KEY (hoặc OCR_API_KEY) trong biến môi trường server.'
          : provider === 'deepseek'
            ? 'Thiếu DEEPSEEK_API_KEY (hoặc OCR_API_KEY) và OCR_MODEL. DeepSeek không có model mặc định — đặt OCR_MODEL tường minh.'
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
