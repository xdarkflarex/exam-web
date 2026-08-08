import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { ProviderError } from '@/lib/essay-ai/contracts'
import { runGradingBatch, type BatchReport } from '@/lib/essay-ai/worker'

/**
 * POST /api/essay-ai/grade-queue
 *
 * Kích hoạt một lượt worker chấm tự luận. Route này là vỏ HTTP mỏng: mọi logic
 * nằm trong `src/lib/essay-ai/worker.ts`.
 *
 * XÁC THỰC: shared secret `CRON_SECRET`, không phải session người dùng. Người
 * gọi là cron/scheduler, không phải trình duyệt. Worker chạy bằng
 * `SUPABASE_SERVICE_KEY` (bypass RLS hoàn toàn) nên endpoint này tương đương
 * quyền admin — không có secret thì trả 503, KHÔNG mặc định cho qua.
 *
 * Lưu ý theo `AGENTS.md` mục 4: `/api/*` không đi qua middleware, nên route
 * này tự làm toàn bộ phần xác thực.
 */

// Worker gọi mạng ra provider ngoài; không được cache và không prerender.
export const dynamic = 'force-dynamic'
// 10 bài × tối đa 60s timeout mỗi lời gọi provider. Nền tảng nào có trần thấp
// hơn thì hạ `limit` trong body xuống thay vì tăng số này.
export const maxDuration = 300

/**
 * Khoá chống chạy chồng trong cùng tiến trình. Cron gọi lại khi lượt trước
 * chưa xong là chuyện thường.
 *
 * Đây chỉ là lớp giảm lãng phí, KHÔNG phải bảo đảm: nhiều instance có biến
 * riêng. Chốt thật nằm ở `UNIQUE (input_hash)` trong `essay_ai_usage` và ở
 * kiểm tra `grading_status = 'pending_review'` bên trong RPC.
 */
let running = false

interface ApiResponse {
  report?: BatchReport
  error?: string
  code: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/**
 * So sánh secret không rò rỉ thông tin qua thời gian chạy.
 *
 * `===` trên chuỗi thoát ngay ở ký tự khác đầu tiên, nên thời gian phản hồi
 * tiết lộ dần từng ký tự. `timingSafeEqual` yêu cầu hai buffer cùng độ dài nên
 * phải kiểm độ dài trước — bản thân độ dài vẫn rò rỉ, nhưng đó là mức chấp
 * nhận được với một secret đủ dài do người vận hành sinh ra.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readBearer(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

export async function POST(request: NextRequest) {
  // Trình duyệt của học sinh không có lý do gì gọi endpoint này.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Yêu cầu không hợp lệ.', code: 'CROSS_SITE_REQUEST' }, 403)
  }

  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    // Fail-closed: thiếu cấu hình thì khoá endpoint, không mở.
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  const provided = readBearer(request.headers.get('authorization'))
  if (!provided || !secretMatches(provided, expected)) {
    return json({ error: 'Không có quyền.', code: 'UNAUTHORIZED' }, 401)
  }

  // Body tuỳ chọn: cron thường gọi rỗng.
  let limit: number | undefined
  const rawBody = await request.text()
  if (rawBody.trim().length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, 400)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_BODY' }, 400)
    }
    const value = (parsed as Record<string, unknown>).limit
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
        return json({ error: 'Giá trị limit không hợp lệ.', code: 'INVALID_LIMIT' }, 400)
      }
      // `runGradingBatch` tự kẹp trần 25; ở đây chỉ chặn giá trị vô nghĩa.
      limit = value
    }
  }

  if (running) {
    return json({ error: 'Một lượt chấm đang chạy.', code: 'ALREADY_RUNNING' }, 409)
  }

  running = true
  try {
    const report = await runGradingBatch({ limit })
    // `BatchReport` cố ý chỉ chứa số đếm và mã lý do — không có id bài làm hay
    // nội dung bài. Xem ghi chú trong worker.
    return json({ report, code: 'OK' })
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.kind === 'config' ? 503 : 502
      return json({ error: error.message, code: error.kind.toUpperCase() }, status)
    }
    console.error(
      '[essay-ai grade-queue] batch failed:',
      error instanceof Error ? error.message : 'unknown'
    )
    return json({ error: 'Không chạy được lượt chấm.', code: 'BATCH_FAILED' }, 500)
  } finally {
    running = false
  }
}

export function GET() {
  return json({ error: 'Phương thức không được hỗ trợ.', code: 'METHOD_NOT_ALLOWED' }, 405)
}
