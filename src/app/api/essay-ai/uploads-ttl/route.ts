import { timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { UPLOAD_BUCKET, createAdminClient } from '@/lib/essay-ai/uploads'

/**
 * POST /api/essay-ai/uploads-ttl
 *
 * Dọn tệp ảnh bài làm quá hạn lưu, giữ lại metadata.
 *
 * XÁC THỰC: shared secret `CRON_SECRET`, giống `grade-queue`. Người gọi là
 * cron/scheduler, không phải trình duyệt. Route chạy bằng `SUPABASE_SERVICE_KEY`
 * nên nó tương đương quyền admin — thiếu secret thì 503, KHÔNG mặc định cho qua.
 *
 * VÌ SAO XOÁ TỆP MÀ GIỮ METADATA. `content_hash`, `byte_size`, `created_at` là
 * chuỗi bằng chứng của một bài đã chấm: chúng vẫn trả lời được "bài này chấm trên
 * ảnh có hash X vào lúc nào". Bỏ cả metadata thì một bài đã chấm bằng ảnh sẽ
 * trông như học sinh chưa từng nộp ảnh. Metadata vài trăm byte một dòng, giữ vĩnh
 * viễn cũng không tốn gì; tệp ảnh mới là thứ chiếm dung lượng.
 *
 * THỨ TỰ: XOÁ TỆP TRƯỚC, ĐÁNH DẤU SAU. Nếu lỗi giữa hai bước, ta có tệp đã xoá mà
 * chưa đánh dấu — lần chạy sau thử xoá lại (vô hại, idempotent) rồi đánh dấu.
 * Thứ tự ngược lại thì tệ: dòng "đã dọn" mà tệp còn nằm đó, tức là dung lượng
 * không bao giờ được thu hồi và không ai biết để đi tìm.
 *
 * XOÁ TỆP LÀ VIỆC KHÔNG HOÀN LẠI. Vì vậy route có `dryRun`, và mặc định `limit`
 * nhỏ: lần chạy đầu nên xem trước nó định xoá gì.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Mặc định 365 ngày. Đổi bằng `ESSAY_UPLOAD_TTL_DAYS`. */
const DEFAULT_TTL_DAYS = 365

/** Số ảnh xử lý mỗi lượt. Cron gọi hàng ngày nên không cần dọn hết một lần. */
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

interface TtlReport {
  ttlDays: number
  /** Số ảnh quá hạn tìm thấy trong lượt này (đã giới hạn bởi `limit`). */
  found: number
  /** Số tệp đã xoá khỏi Storage. */
  filesRemoved: number
  /** Số dòng đã đánh dấu `purged_at`. */
  marked: number
  /** Số ảnh gặp lỗi khi xoá tệp; lượt sau thử lại. */
  failed: number
  dryRun: boolean
}

interface ApiResponse {
  report?: TtlReport
  error?: string
  code: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** Giống `grade-queue`: `===` trên chuỗi rò rỉ dần từng ký tự qua thời gian chạy. */
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

/**
 * Giá trị sai hoặc thiếu KHÔNG làm TTL ngắn lại. Quy tắc giống
 * `readOverrideThresholds`: một typo trong env không được biến thành "xoá sớm hơn
 * dự định", vì xoá tệp không hoàn lại được.
 */
function readTtlDays(): number {
  const raw = process.env.ESSAY_UPLOAD_TTL_DAYS?.trim()
  if (!raw) return DEFAULT_TTL_DAYS
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) return DEFAULT_TTL_DAYS
  // Không kẹp trần: đặt TTL dài là giữ ảnh lâu hơn, và giữ lâu hơn luôn an toàn.
  return value
}

export async function POST(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Yêu cầu không hợp lệ.', code: 'CROSS_SITE_REQUEST' }, 403)
  }

  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  const provided = readBearer(request.headers.get('authorization'))
  if (!provided || !secretMatches(provided, expected)) {
    return json({ error: 'Không có quyền.', code: 'UNAUTHORIZED' }, 401)
  }

  let dryRun = false
  let limit = DEFAULT_LIMIT

  const rawBody = await request.text()
  if (rawBody.trim().length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, 400)
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const body = parsed as Record<string, unknown>
      if (body.dryRun === true) dryRun = true
      if (typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0) {
        limit = Math.min(body.limit, MAX_LIMIT)
      }
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error('[essay-ai uploads-ttl] thiếu SUPABASE_SERVICE_KEY')
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  const ttlDays = readTtlDays()
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString()

  // `purged_at IS NULL` để không xử lý lại ảnh đã dọn. Không lọc `deleted_at`:
  // ảnh học sinh đã bỏ trong giờ thi cũng chiếm dung lượng như ảnh đã nộp, và
  // route xoá của học sinh có thể đã thất bại ở bước xoá tệp — lượt này dọn nốt.
  const { data, error } = await admin
    .from('essay_answer_uploads')
    .select('id, storage_path')
    .lt('created_at', cutoff)
    .is('purged_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[essay-ai uploads-ttl] tra ảnh quá hạn hỏng:', error.message)
    return json({ error: 'Không đọc được danh sách ảnh.', code: 'LOOKUP_FAILED' }, 500)
  }

  const rows = data ?? []
  const report: TtlReport = {
    ttlDays,
    found: rows.length,
    filesRemoved: 0,
    marked: 0,
    failed: 0,
    dryRun,
  }

  if (dryRun || rows.length === 0) {
    return json({ report, code: 'OK' })
  }

  // Xoá theo lô: `remove()` nhận nhiều đường dẫn một lần, và một lời gọi mạng cho
  // 200 tệp thay vì 200 lời gọi là khác biệt giữa vài giây và vài phút.
  const { error: removeError } = await admin.storage
    .from(UPLOAD_BUCKET)
    .remove(rows.map((row) => String(row.storage_path)))

  if (removeError) {
    // KHÔNG đánh dấu gì khi xoá lô thất bại: không biết tệp nào đã xoá và tệp nào
    // chưa, và đánh dấu sai sẽ để lại tệp mồ côi vĩnh viễn. Lượt sau thử lại toàn
    // bộ lô — `remove()` trên tệp không tồn tại là no-op.
    console.error('[essay-ai uploads-ttl] xoá tệp hỏng:', removeError.message)
    report.failed = rows.length
    return json({ report, code: 'REMOVE_FAILED' }, 502)
  }

  report.filesRemoved = rows.length

  const purgedAt = new Date().toISOString()
  const { error: markError } = await admin
    .from('essay_answer_uploads')
    .update({ purged_at: purgedAt })
    .in(
      'id',
      rows.map((row) => String(row.id))
    )

  if (markError) {
    // Tệp đã xoá nhưng chưa đánh dấu. Lượt sau tìm lại đúng những dòng này
    // (`purged_at` vẫn NULL), thử xoá lại (no-op) rồi đánh dấu. Không mất gì
    // ngoài một lượt chạy.
    console.error('[essay-ai uploads-ttl] đánh dấu purged_at hỏng:', markError.message)
    report.failed = rows.length
    return json({ report, code: 'MARK_FAILED' }, 500)
  }

  report.marked = rows.length
  return json({ report, code: 'OK' })
}
