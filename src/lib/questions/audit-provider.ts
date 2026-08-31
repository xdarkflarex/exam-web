/**
 * Adapter gọi DeepSeek cho công cụ rà soát ngân hàng câu hỏi.
 *
 * Chỉ chạy phía server. Module này KHÔNG ghi gì vào database và không quyết
 * định gì — nó trả về một kết quả đã qua validator, hoặc ném lỗi. Việc ghi đi
 * qua `apply_question_audit_finding` sau khi người duyệt bấm.
 *
 * Cố ý tách khỏi `src/lib/essay-ai/grading-provider.ts` dù cùng gọi một endpoint:
 * hai bên khác schema, khác allowlist ngữ nghĩa, khác kill-switch. Nhét cả hai
 * vào một adapter thì đổi cái này sẽ làm hỏng cái kia.
 */

import { ProviderError } from '@/lib/essay-ai/contracts'
import { parseQuestionAuditResult, type QuestionAuditResult } from './audit-contracts.ts'
import { buildQuestionAuditPrompt, type AuditPromptInput } from './audit-prompt.ts'
import { readQuestionAuditConfig, type QuestionAuditConfig } from './audit-config.ts'

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const REQUEST_TIMEOUT_MS = 90_000

/**
 * Giá tham khảo để ước tính chi phí. Số này chắc chắn sẽ lỗi thời — nó chỉ phục
 * vụ trần chi phí, KHÔNG phải hoá đơn. Đối chiếu bảng giá chính thức trước khi
 * dựa vào nó để ra quyết định tài chính.
 */
const COST_PER_1K_PROMPT_TOKENS_USD = 0.00014
const COST_PER_1K_COMPLETION_TOKENS_USD = 0.00028

export interface AuditCallResult {
  result: QuestionAuditResult
  model: string
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
  latencyMs: number
}

export interface QuestionAuditProvider {
  audit(input: AuditPromptInput): Promise<AuditCallResult>
}

export function createDeepSeekAuditProvider(
  config: QuestionAuditConfig = readQuestionAuditConfig()
): QuestionAuditProvider {
  return {
    async audit(input: AuditPromptInput): Promise<AuditCallResult> {
      const prompt = buildQuestionAuditPrompt(input)

      const startedAt = Date.now()
      const raw = await callDeepSeek(config, prompt)
      const latencyMs = Date.now() - startedAt

      let result: QuestionAuditResult
      try {
        result = parseQuestionAuditResult(raw.content, {
          questionId: input.questionId,
          questionType: input.questionType,
          answerIds: input.answers.map((answer) => answer.id),
          // Validator dùng hai cờ này để chặn việc điền vào ô lời giải đang
          // trống — đó là viết mới, không phải sửa lỗi.
          hasExplanation: (input.explanation ?? '').trim().length > 0,
          hasSolution: (input.solution ?? '').trim().length > 0,
        })
      } catch (error) {
        // Không đính kèm `raw.content`: nó chứa nguyên văn đề và lời giải, và
        // message lỗi đi vào log.
        throw new ProviderError({
          provider: config.provider,
          kind: 'invalid_response',
          message: `Kết quả rà soát không hợp lệ: ${
            error instanceof Error ? error.message : 'lỗi không xác định'
          }`,
          retryable: true,
        })
      }

      return {
        result,
        model: config.model,
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

async function callDeepSeek(
  config: QuestionAuditConfig,
  prompt: string
): Promise<RawCompletion> {
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
        // Soát đáp án cần ổn định, không cần sáng tạo. Nhiệt độ > 0 khiến hai
        // lần quét cùng một chương cho hai danh sách khác nhau, và người soạn
        // sẽ không biết tin lần nào.
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
      message: aborted ? 'Quá thời gian chờ DeepSeek.' : 'Không gọi được DeepSeek.',
      retryable: true,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // Cố ý không đọc body lỗi vào message: một số provider phản chiếu lại
    // request (kèm toàn bộ đề) trong phần lỗi.
    throw new ProviderError({
      provider: config.provider,
      kind: classifyStatus(response.status),
      message: `DeepSeek trả mã ${response.status}.`,
      retryable: response.status === 429 || response.status >= 500,
      statusCode: response.status,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProviderError({
      provider: config.provider,
      kind: 'invalid_response',
      message: 'DeepSeek trả về nội dung không phải JSON.',
      retryable: true,
    })
  }

  const body = payload as {
    choices?: Array<{ message?: { content?: unknown } }>
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new ProviderError({
      provider: config.provider,
      kind: 'invalid_response',
      message: 'DeepSeek trả về phản hồi rỗng.',
      retryable: true,
    })
  }

  return {
    content,
    promptTokens: toCount(body.usage?.prompt_tokens),
    completionTokens: toCount(body.usage?.completion_tokens),
  }
}

/** Số token thiếu hoặc sai kiểu -> 0. Ước tính thấp còn hơn ném lỗi ở đây. */
function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function classifyStatus(status: number): 'auth' | 'rate_limit' | 'network' | 'unknown' {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'network'
  return 'unknown'
}
