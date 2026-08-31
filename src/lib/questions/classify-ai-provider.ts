/**
 * Adapter gọi DeepSeek cho gợi ý phân loại.
 *
 * Chỉ chạy phía server. KHÔNG ghi gì vào database — đường ghi vẫn là
 * `BulkTaxonomyDialog` sau khi người soạn tick từng câu.
 *
 * Dùng lại cấu hình và allowlist của công cụ rà soát
 * (`QUESTION_AUDIT_ENABLED`, `QUESTION_AUDIT_MODEL`): hai tính năng cùng phục
 * vụ ngân hàng câu hỏi, cùng một khoá, cùng một túi tiền. Thêm một cặp biến môi
 * trường thứ ba cho một tính năng con chỉ làm bảng cấu hình dài ra mà không cho
 * ai thêm quyền quyết định gì.
 */

import { ProviderError } from '@/lib/essay-ai/contracts'
import { readQuestionAuditConfig, type QuestionAuditConfig } from './audit-config.ts'
import { parseClassifyResult, type ClassifySuggestion, type TaxonomyTree } from './classify-ai.ts'
import { buildClassifyPrompt } from './classify-ai-prompt.ts'

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const REQUEST_TIMEOUT_MS = 90_000

/** Giá tham khảo, chỉ để ước tính. Xem ghi chú trong `audit-provider.ts`. */
const COST_PER_1K_PROMPT_TOKENS_USD = 0.00014
const COST_PER_1K_COMPLETION_TOKENS_USD = 0.00028

export interface ClassifyBatchResult {
  suggestions: ClassifySuggestion[]
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
}

export interface ClassifyProvider {
  classify(
    questions: Array<{ id: string; content: string }>,
    tree: TaxonomyTree
  ): Promise<ClassifyBatchResult>
}

export function createDeepSeekClassifyProvider(
  config: QuestionAuditConfig = readQuestionAuditConfig()
): ClassifyProvider {
  return {
    async classify(questions, tree) {
      const prompt = buildClassifyPrompt({ questions, tree })
      const raw = await callDeepSeek(config, prompt)

      let suggestions: ClassifySuggestion[]
      try {
        suggestions = parseClassifyResult(raw.content, {
          questionIds: questions.map((question) => question.id),
          tree,
        })
      } catch (error) {
        // Không đính kèm `raw.content`: nó chứa nguyên văn đề bài và đi vào log.
        throw new ProviderError({
          provider: config.provider,
          kind: 'invalid_response',
          message: `Gợi ý phân loại không hợp lệ: ${
            error instanceof Error ? error.message : 'lỗi không xác định'
          }`,
          retryable: true,
        })
      }

      return {
        suggestions,
        promptTokens: raw.promptTokens,
        completionTokens: raw.completionTokens,
        estimatedCostUsd:
          (raw.promptTokens / 1000) * COST_PER_1K_PROMPT_TOKENS_USD +
          (raw.completionTokens / 1000) * COST_PER_1K_COMPLETION_TOKENS_USD,
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
        // Phân loại phải ổn định: chạy lại cùng một lô mà ra nhánh khác thì
        // người soạn không biết tin lần nào.
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
    throw new ProviderError({
      provider: config.provider,
      kind: response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'network' : 'auth',
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

  const toCount = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0

  return {
    content,
    promptTokens: toCount(body.usage?.prompt_tokens),
    completionTokens: toCount(body.usage?.completion_tokens),
  }
}
