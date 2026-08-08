/**
 * Adapter gọi provider chấm (DeepSeek) và validate kết quả.
 *
 * Ranh giới: module này chỉ chạy phía server. Nó KHÔNG quyết định điểm cuối —
 * chỉ trả về gợi ý đã qua validator. Quyết định chốt hay đẩy về người nằm ở
 * `auto-finalize.ts`, và việc ghi điểm phải qua trusted RPC (`AGENTS.md` mục 4).
 *
 * Tái dùng `buildEssayGradingPrompt` và `parseEssayGradingSuggestion` của pilot
 * thủ công thay vì viết parser thứ hai: hai parser khác nhau cho cùng một
 * schema là cách chắc chắn để chúng lệch nhau theo thời gian.
 */

import {
  buildEssayGradingPrompt,
  parseEssayGradingSuggestion,
  type EssayRubricCriterion,
} from '@/lib/essay-grading/prompt'
import { ProviderError, type GradeSuggestion } from './contracts'
import { hashGradingInput, hashText } from './normalize'
import { assertNoIdentifiers } from './redaction'
import { readGradingConfig, type GradingConfig } from './model-allowlist'

export interface GradingRequest {
  gradingRef: string
  rubricVersion: number
  questionId: string
  question: string
  referenceAnswer: string
  /** Bài làm đã chuẩn hoá VÀ đã qua redaction. */
  studentAnswer: string
  answerHash: string
  rubric: EssayRubricCriterion[]
  maxScore: number
}

export interface GradingProvider {
  grade(request: GradingRequest): Promise<GradeSuggestion>
}

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const REQUEST_TIMEOUT_MS = 60_000

/**
 * Giá tham khảo để ước tính chi phí. Số này chắc chắn sẽ lỗi thời — nó chỉ
 * phục vụ cost cap, không phải hoá đơn. Đối chiếu bảng giá chính thức trước
 * khi dựa vào con số này để ra quyết định tài chính.
 */
const COST_PER_1K_PROMPT_TOKENS_USD = 0.00014
const COST_PER_1K_COMPLETION_TOKENS_USD = 0.00028

export function createDeepSeekGradingProvider(
  config: GradingConfig = readGradingConfig()
): GradingProvider {
  return {
    async grade(request: GradingRequest): Promise<GradeSuggestion> {
      // Chốt chặn cuối trước khi dữ liệu rời server. Nếu throw ở đây thì một
      // chỗ phía trên đã lắp sai dữ liệu — sửa chỗ đó, đừng nới danh sách.
      assertNoIdentifiers({
        grading_ref: request.gradingRef,
        question: request.question,
        reference_answer: request.referenceAnswer,
        student_answer: request.studentAnswer,
        rubric: request.rubric,
      })

      const prompt = buildEssayGradingPrompt({
        gradingRef: request.gradingRef,
        rubricVersion: request.rubricVersion,
        question: request.question,
        referenceAnswer: request.referenceAnswer,
        studentAnswer: request.studentAnswer,
        rubric: request.rubric,
        maxScore: request.maxScore,
      })

      const inputHash = hashGradingInput({
        answerHash: request.answerHash,
        rubricVersion: request.rubricVersion,
        questionId: request.questionId,
        model: config.model,
      })

      const startedAt = Date.now()
      const raw = await callDeepSeek(config, prompt)
      const latencyMs = Date.now() - startedAt

      let suggestion
      try {
        suggestion = parseEssayGradingSuggestion(raw.content, {
          gradingRef: request.gradingRef,
          rubricVersion: request.rubricVersion,
          rubric: request.rubric,
          maxScore: request.maxScore,
        })
      } catch (error) {
        // Không đính kèm `raw.content` vào lỗi: nội dung đó chứa nguyên văn
        // bài làm và sẽ đi vào log.
        throw new ProviderError({
          provider: config.provider,
          kind: 'invalid_response',
          message: `Kết quả chấm không hợp lệ: ${
            error instanceof Error ? error.message : 'lỗi không xác định'
          }`,
          retryable: true,
        })
      }

      return {
        suggestion,
        provider: config.provider,
        model: config.model,
        inputHash,
        responseHash: hashText(raw.content),
        promptTokens: raw.promptTokens,
        completionTokens: raw.completionTokens,
        estimatedCostUsd:
          (raw.promptTokens / 1000) * COST_PER_1K_PROMPT_TOKENS_USD +
          (raw.completionTokens / 1000) * COST_PER_1K_COMPLETION_TOKENS_USD,
        latencyMs,
      }
    },
  }
}

interface RawCompletion {
  content: string
  promptTokens: number
  completionTokens: number
}

async function callDeepSeek(config: GradingConfig, prompt: string): Promise<RawCompletion> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        // Nhiệt độ thấp: chấm điểm cần ổn định, không cần sáng tạo.
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new ProviderError({
      provider: config.provider,
      kind: aborted ? 'timeout' : 'network',
      message: aborted ? 'Quá thời gian chờ dịch vụ chấm.' : 'Không gọi được dịch vụ chấm.',
      retryable: true,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // Cố ý không đọc body lỗi vào message: một số provider phản chiếu lại
    // request (kèm bài làm) trong phần lỗi.
    throw new ProviderError({
      provider: config.provider,
      kind: classifyStatus(response.status),
      message: `Dịch vụ chấm trả mã ${response.status}.`,
      retryable: response.status === 429 || response.status >= 500,
      statusCode: response.status,
    })
  }

  const payload: unknown = await response.json()
  return readCompletion(config, payload)
}

function classifyStatus(status: number) {
  if (status === 401 || status === 403) return 'auth' as const
  if (status === 429) return 'rate_limit' as const
  if (status >= 500) return 'network' as const
  return 'unknown' as const
}

function readCompletion(config: GradingConfig, payload: unknown): RawCompletion {
  if (!payload || typeof payload !== 'object') {
    throw new ProviderError({
      provider: config.provider,
      kind: 'invalid_response',
      message: 'Phản hồi dịch vụ chấm không phải JSON object.',
      retryable: true,
    })
  }

  const body = payload as Record<string, unknown>
  const choices = body.choices
  const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined
  const message = first?.message as Record<string, unknown> | undefined
  const content = message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ProviderError({
      provider: config.provider,
      kind: 'invalid_response',
      message: 'Phản hồi dịch vụ chấm không có nội dung.',
      retryable: true,
    })
  }

  const usage = body.usage as Record<string, unknown> | undefined
  return {
    content,
    promptTokens: readNumber(usage?.prompt_tokens),
    completionTokens: readNumber(usage?.completion_tokens),
  }
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
