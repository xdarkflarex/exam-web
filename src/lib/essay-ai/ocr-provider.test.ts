/**
 * Test adapter OCR và cấu hình provider.
 *
 * Không gọi mạng: chỉ kiểm hình dạng request và luật đọc cấu hình — đúng những
 * thứ mà một lần đổi provider dễ làm hỏng im lặng. Chất lượng đọc chữ thì
 * `scripts/essay-ai-benchmark.mjs --ocr` đo, vì nó cần ảnh thật và tốn tiền.
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { buildChatVisionBody, chatVisionEndpoint } from './ocr-provider.ts'
import { assertAllowedOcrModel, readOcrConfig } from './model-allowlist.ts'

const REQUEST = { imageBase64: 'AAAA', mimeType: 'image/png' as const }

const ENV_KEYS = ['OCR_PROVIDER', 'OCR_API_KEY', 'OCR_MODEL', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY']
const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function setEnv(values: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value
  }
}

// ── Hình dạng request ───────────────────────────────────────────────────────

test('ảnh gửi dạng data URL, nhiệt độ 0, bắt buộc trả JSON', () => {
  const body = buildChatVisionBody({ provider: 'deepseek', model: 'deepseek-flash' }, REQUEST)
  assert.equal(body.model, 'deepseek-flash')
  assert.equal(body.temperature, 0)
  assert.deepEqual(body.response_format, { type: 'json_object' })

  const content = (body.messages as { content: unknown[] }[])[0].content as Record<string, never>[]
  const image = content[1] as unknown as { image_url: { url: string } }
  assert.match(image.image_url.url, /^data:image\/png;base64,AAAA$/)
})

test('`detail` chỉ gửi cho OpenAI — trường lạ gửi sang nhà khác là trò may rủi', () => {
  const pick = (provider: 'openai' | 'deepseek') => {
    const body = buildChatVisionBody({ provider, model: 'm' }, REQUEST)
    const content = (body.messages as { content: unknown[] }[])[0].content
    return (content[1] as { image_url: Record<string, unknown> }).image_url
  }
  assert.equal(pick('openai').detail, 'high')
  assert.equal('detail' in pick('deepseek'), false)
})

test('mỗi provider đi đúng endpoint của nó', () => {
  assert.equal(chatVisionEndpoint('openai'), 'https://api.openai.com/v1/chat/completions')
  assert.equal(chatVisionEndpoint('deepseek'), 'https://api.deepseek.com/chat/completions')
  // Gemini nói giao thức khác nên không có endpoint ở bảng này; gọi nhầm phải
  // nổ ngay chứ không được fetch(undefined).
  assert.throws(() => chatVisionEndpoint('gemini'), /endpoint/i)
})

// ── Allowlist ───────────────────────────────────────────────────────────────

test('allowlist chặn model lạ, kể cả khi provider đúng', () => {
  assert.doesNotThrow(() => assertAllowedOcrModel('deepseek', 'deepseek-flash'))
  assert.doesNotThrow(() => assertAllowedOcrModel('gemini', 'gemini-3.6-flash'))
  assert.throws(() => assertAllowedOcrModel('deepseek', 'deepseek-v9-sieu-cap'), /allowlist/)
  // Model của nhà này không dùng được cho nhà kia.
  assert.throws(() => assertAllowedOcrModel('deepseek', 'gemini-3.6-flash'), /allowlist/)
})

// ── Đọc cấu hình ────────────────────────────────────────────────────────────

test('deepseek dùng chung DEEPSEEK_API_KEY với pipeline chấm bài', () => {
  setEnv({ OCR_PROVIDER: 'deepseek', OCR_MODEL: 'deepseek-flash', DEEPSEEK_API_KEY: 'sk-test' })
  const config = readOcrConfig()
  assert.deepEqual(config, { provider: 'deepseek', apiKey: 'sk-test', model: 'deepseek-flash' })
})

test('deepseek KHÔNG có model mặc định — thiếu OCR_MODEL là dừng, không đoán', () => {
  setEnv({ OCR_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'sk-test' })
  assert.throws(() => readOcrConfig(), /OCR_MODEL/)
})

test('gemini vẫn là mặc định khi không đặt OCR_PROVIDER', () => {
  setEnv({ GEMINI_API_KEY: 'g-test' })
  const config = readOcrConfig()
  assert.equal(config.provider, 'gemini')
  assert.equal(config.model, 'gemini-3.6-flash')
})

test('OCR_API_KEY được ưu tiên hơn key riêng của từng nhà', () => {
  setEnv({
    OCR_PROVIDER: 'deepseek',
    OCR_MODEL: 'deepseek-v4-flash',
    OCR_API_KEY: 'chung',
    DEEPSEEK_API_KEY: 'rieng',
  })
  assert.equal(readOcrConfig().apiKey, 'chung')
})

test('provider lạ bị chặn, không âm thầm rơi về nhà mặc định', () => {
  setEnv({ OCR_PROVIDER: 'nha-khong-ton-tai', OCR_API_KEY: 'k', OCR_MODEL: 'm' })
  assert.throws(() => readOcrConfig(), /không được hỗ trợ/)
})
