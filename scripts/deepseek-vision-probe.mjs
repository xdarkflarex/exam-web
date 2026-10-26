#!/usr/bin/env node
/**
 * Dò xem API DeepSeek có nhận ẢNH để OCR không, và tên model nào còn sống.
 *
 * VÌ SAO CẦN SCRIPT NÀY THAY VÌ ĐỌC TÀI LIỆU: ngày 2026-10-26 khi thêm DeepSeek
 * vào allowlist OCR, phiên làm việc bị chặn ra `deepseek.com` nên không đọc
 * được tài liệu gốc; các nguồn bên thứ ba thì mâu thuẫn nhau về tên model và
 * ngày phát hành. Thêm nữa, bài học ngày 2026-09-10 (xem
 * `src/lib/essay-ai/model-allowlist.ts`): DeepSeek từng âm thầm định tuyến
 * `deepseek-chat` sang model khác mà vẫn trả 200. Cách duy nhất biết chắc là
 * hỏi API, rồi ĐỌC trường `model` trong phản hồi.
 *
 * Cách chạy:
 *   export DEEPSEEK_API_KEY=sk-...
 *   node scripts/deepseek-vision-probe.mjs                 # chỉ dò khả năng nhận ảnh
 *   node scripts/deepseek-vision-probe.mjs anh-bai-lam.jpg # dò kèm chất lượng đọc chữ
 *
 * Script chỉ ĐỌC: không ghi database, không đụng `.env`, không sửa cấu hình.
 *
 * BẢO MẬT (AGENTS.md mục 5): nếu truyền ảnh bài làm thật thì ảnh ấy được gửi
 * lên DeepSeek. Dùng ảnh của chính bạn hoặc ảnh đã ẩn danh, đừng dùng bài của
 * học sinh thật chỉ để thử API.
 */

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const API = 'https://api.deepseek.com'
const KEY = process.env.DEEPSEEK_API_KEY

/** Ảnh 1x1 trắng — chỉ để hỏi "endpoint có chấp nhận phần image_url không". */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** Rút gọn từ OCR_PROMPT thật trong `src/lib/essay-ai/ocr-provider.ts`. */
const PROMPT = `Chép lại chính xác nội dung trong ảnh. Không giải bài, không sửa lỗi của học sinh.
Công thức toán viết bằng LaTeX giữa dấu $. Chỗ nào không đọc được thì viết [?].
Chỉ trả về JSON: {"text": "...", "confidence": 0.0}`

if (!KEY) {
  console.error('Thiếu DEEPSEEK_API_KEY trong biến môi trường.')
  process.exit(1)
}

const imagePath = process.argv[2] ?? null
let imageBase64 = PIXEL
let mimeType = 'image/png'

if (imagePath) {
  const extension = extname(imagePath).toLowerCase()
  if (!MIME[extension]) {
    console.error(`Đuôi file "${extension}" không hỗ trợ. Dùng .jpg, .png hoặc .webp.`)
    process.exit(1)
  }
  mimeType = MIME[extension]
  imageBase64 = (await readFile(imagePath)).toString('base64')
  const kb = Math.round((imageBase64.length * 3) / 4 / 1024)
  console.log(`Ảnh: ${imagePath} (${kb} KB, ${mimeType})\n`)
} else {
  console.log('Không truyền ảnh — chỉ dò khả năng nhận ảnh bằng 1 pixel trắng.\n')
}

async function listModels() {
  let response
  try {
    response = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${KEY}` } })
  } catch (error) {
    return { ok: false, status: 'không nối được', body: String(error?.cause ?? error).slice(0, 200) }
  }
  const body = await response.text()
  if (!response.ok) return { ok: false, status: response.status, body: body.slice(0, 300) }
  try {
    return { ok: true, ids: (JSON.parse(body).data ?? []).map((model) => model.id) }
  } catch {
    return { ok: false, status: response.status, body: body.slice(0, 300) }
  }
}

async function probe(model) {
  const started = Date.now()
  let response
  try {
    response = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    })
  } catch (error) {
    return { model, verdict: 'LỖI MẠNG', detail: String(error?.cause ?? error).slice(0, 160) }
  }

  const ms = Date.now() - started
  const text = await response.text()

  if (!response.ok) {
    let message = text.slice(0, 220)
    try {
      message = JSON.parse(text).error?.message ?? message
    } catch {
      /* giữ nguyên text thô */
    }
    return { model, verdict: `HTTP ${response.status}`, detail: message, ms }
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { model, verdict: 'PHẢN HỒI KHÔNG PHẢI JSON', detail: text.slice(0, 200), ms }
  }

  const content = payload.choices?.[0]?.message?.content ?? ''
  return {
    model,
    verdict: 'NHẬN ẢNH',
    /** Thứ CHẠY THẬT. Khác `model` gửi lên nghĩa là bị định tuyến ngầm. */
    servedBy: payload.model,
    usage: payload.usage,
    ms,
    preview: content.replace(/\s+/g, ' ').slice(0, 200),
    full: content,
  }
}

const models = await listModels()
if (models.ok) {
  console.log('Model key này thấy được:', models.ids.join(', '), '\n')
} else {
  console.log(`GET /models lỗi (${models.status}): ${models.body}\n`)
}

const candidates = [
  ...new Set([...(models.ids ?? []), 'deepseek-flash', 'deepseek-v4-flash', 'deepseek-chat']),
]

const results = []
for (const model of candidates) {
  const result = await probe(model)
  results.push(result)
  console.log(`— ${model}: ${result.verdict}${result.ms ? ` (${result.ms} ms)` : ''}`)
  if (result.servedBy && result.servedBy !== model) {
    console.log(`    phản hồi ghi model = ${result.servedBy}  ← bị định tuyến sang model khác`)
  }
  if (result.usage) console.log(`    token: ${JSON.stringify(result.usage)}`)
  if (result.detail) console.log(`    ${result.detail}`)
  if (result.preview) console.log(`    đọc được: ${result.preview}`)
  console.log()
}

const accepted = results.filter((result) => result.verdict === 'NHẬN ẢNH')
console.log('='.repeat(70))
console.log(
  accepted.length
    ? `CÓ nhận ảnh: ${accepted.map((result) => result.model).join(', ')}`
    : 'KHÔNG model nào nhận ảnh.'
)

if (accepted.length && imagePath) {
  console.log('\nToàn văn model đọc được (model đầu tiên nhận ảnh):\n')
  console.log(accepted[0].full)
  console.log(
    '\nSo câu chữ này với ảnh gốc — đó mới là phép thử thật, không phải mã HTTP 200.\n' +
      'Muốn số liệu so với Gemini thì chạy:\n' +
      '  node scripts/essay-ai-benchmark.mjs --ocr-compare "gemini:gemini-3.6-flash,deepseek:<tên model vừa đạt>"'
  )
} else if (accepted.length) {
  console.log(
    '\nMới chỉ chứng minh API CHẤP NHẬN ảnh. Chạy lại với ảnh bài làm thật để biết nó ĐỌC được hay không.'
  )
}
