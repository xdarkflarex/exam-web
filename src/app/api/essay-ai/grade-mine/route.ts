import { NextResponse, type NextRequest } from 'next/server'
import { runGradingBatch } from '@/lib/essay-ai/worker'
import { gateAttempt } from '@/lib/essay-ai/uploads'

/**
 * POST /api/essay-ai/grade-mine
 *
 * Chấm ngay phần tự luận của attempt mà chính người gọi vừa nộp.
 *
 * VÌ SAO CẦN ROUTE NÀY. `POST /api/essay-ai/grade-queue` xác thực bằng
 * `CRON_SECRET` nên trình duyệt không gọi được — và không được phép gọi được,
 * secret đó tương đương quyền admin. Không có route này thì bài chỉ được chấm ở
 * lượt cron kế tiếp, tức học sinh nộp xong phải chờ. Yêu cầu sản phẩm của chủ dự
 * án (2026-08-07) là nộp xong thấy điểm luôn.
 *
 * KHÁC `grade-queue` Ở ĐÚNG MỘT ĐIỂM: xác thực bằng session học sinh thay vì
 * secret, và phạm vi bị khoá cứng vào attempt của chính người gọi. Mọi thứ khác —
 * cờ kill-switch, cổng override, cổng OCR, validator, đường ghi điểm qua trusted
 * RPC — đi qua đúng `runGradingBatch` như cron, không có nhánh riêng. Một nhánh
 * chấm riêng cho client là chỗ để các cổng an toàn lệch nhau.
 *
 * ROUTE NÀY KHÔNG CHỌN BÀI ĐỂ CHẤM. Nó chỉ truyền `attemptId`; việc bài nào đủ
 * điều kiện vẫn do `fetchQueue` quyết định (đúng `question_type`, đang
 * `pending_review`, attempt đã `submitted`, đề `simulation`, text không rỗng).
 * Nhờ vậy một học sinh không thể dùng route này để bắt chấm lại bài đã chốt điểm.
 *
 * CHỐNG LẠM DỤNG: `gateAttempt` đòi attempt thuộc người gọi. Gọi lặp lại vô hại vì
 * `usageExists(inputHash)` chặn gọi provider lần hai cho cùng bài + rubric + model,
 * và bài đã chấm không còn `pending_review` nên rơi ra khỏi hàng chờ.
 */

export const dynamic = 'force-dynamic'
/** Nhiều câu tự luận, mỗi câu một lời gọi provider 2–4s. */
export const maxDuration = 120

interface ApiResponse {
  /** Số bài đã được AI chốt điểm ngay. */
  autoFinalized?: number
  /** Số bài đã chấm nhưng để giáo viên duyệt (cổng an toàn chặn). */
  pendingReview?: number
  /** Số bài lấy từ hàng chờ. 0 nghĩa là không có câu tự luận nào cần chấm. */
  picked?: number
  error?: string
  code: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Yêu cầu không hợp lệ.', code: 'CROSS_SITE_REQUEST' }, 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_BODY' }, 400)
  }

  const { attemptId } = body as Record<string, unknown>

  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    return json({ error: 'Thiếu mã bài thi.', code: 'MISSING_ATTEMPT' }, 400)
  }

  // `requireActive: false` — ngược với các route ảnh. Ở đây attempt PHẢI đã nộp
  // rồi mới có gì để chấm; `gateAttempt` chỉ dùng để chứng minh quyền sở hữu.
  const gate = await gateAttempt({ attemptId, requireActive: false })
  if (!gate.ok) {
    return json({ error: gate.error, code: gate.code }, gate.status)
  }

  // Bài chưa nộp thì không có gì để chấm, và `fetchQueue` cũng sẽ lọc ra. Trả lời
  // rõ ràng ở đây thay vì để client nhận `picked: 0` và không biết vì sao.
  if (gate.attemptStatus === 'in_progress') {
    return json({ error: 'Bài thi chưa nộp.', code: 'ATTEMPT_NOT_SUBMITTED' }, 409)
  }

  try {
    const report = await runGradingBatch({ attemptId, limit: 20 })

    return json({
      autoFinalized: report.autoFinalized,
      pendingReview: report.pendingReview,
      picked: report.picked,
      code: 'OK',
    })
  } catch (error) {
    // Không đưa lỗi gốc ra ngoài: nó có thể chứa message của provider hoặc
    // fragment bài làm. `BatchReport` cố ý không mang id hay nội dung, nhưng
    // exception thô thì không có bảo đảm đó.
    console.error(
      '[essay-ai grade-mine] batch failed:',
      error instanceof Error ? error.message : 'unknown'
    )
    return json({ error: 'Không chấm được bài lúc này.', code: 'GRADE_FAILED' }, 502)
  }
}
