import { NextResponse, type NextRequest } from 'next/server'
import { createOcrProvider } from '@/lib/essay-ai/ocr-provider'
import { ProviderError, type OcrResult } from '@/lib/essay-ai/contracts'
import { hashText } from '@/lib/essay-ai/normalize'
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_BUCKET,
  createAdminClient,
  gateAttempt,
  hashBytes,
  isAllowedUploadMime,
} from '@/lib/essay-ai/uploads'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * POST /api/essay-ai/ocr
 *
 * Nhận **mã ảnh đã nằm trên Storage** (không phải ảnh), gọi Gemini nhận dạng
 * phía server, trả về text đã chuẩn hoá và đã lọc PII.
 *
 * ĐỔI TỪ 2026-08-06 (`20260809`): trước đây route nhận ảnh base64 trong body.
 * Cách đó có ba vấn đề: 8 MB ảnh thành ~10,7 MB body (vượt giới hạn 4,5 MB của
 * serverless function trên Vercel), ảnh bị vứt đi sau khi đọc nên không còn bản
 * gốc để đối chiếu khi tranh chấp điểm, và snapshot chất lượng không gắn được
 * vào tấm ảnh nào cụ thể. Giờ client upload thẳng lên bucket private qua signed
 * URL (`POST /api/essay-ai/upload-url`), rồi gọi route này với `uploadId`.
 *
 * Vì sao vẫn phải đi qua server để gọi Gemini: biến `NEXT_PUBLIC_*` được Next.js
 * nhúng vào bundle gửi xuống client, nên key đặt ở đó là key công khai. Ở đây key
 * chỉ tồn tại trong tiến trình server.
 *
 * Route KHÔNG ghi điểm. Nó trả text để học sinh xem/sửa trước khi nộp; việc chấm
 * và ghi điểm vẫn thuộc về RPC nộp bài và worker.
 *
 * `AGENTS.md` mục 4: `/api/*` không đi qua middleware, nên route tự xác thực,
 * tự kiểm ownership và tự validate input (`gateAttempt` làm ba việc đầu).
 */

interface ApiResponse {
  text?: string
  confidence?: number
  warnings?: string[]
  /**
   * Bản ghi chất lượng nhận dạng đã lưu được hay chưa. `false` nghĩa là bài này
   * sẽ KHÔNG được AI tự chốt điểm dù nội dung đọc tốt tới đâu — không có dữ liệu
   * đối chiếu thì `auto-finalize.ts` chặn (`ocr_snapshot_missing`).
   */
  snapshotWritten?: boolean
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
 * Lưu chất lượng nhận dạng vào `essay_ocr_snapshots`, gắn với đúng tấm ảnh.
 *
 * `upload_id` là mắt xích mới của `20260809`. Không có nó, worker chỉ biết "bài
 * này có những lần OCR nào theo thời gian" và buộc phải tính cả lần đọc của ảnh
 * học sinh đã xoá. Vì `service_role` không có UPDATE trên bảng snapshot
 * (`20260808` — append-only), giá trị này phải ghi NGAY lúc INSERT; đó là lý do
 * OCR chạy sau khi ảnh đã lên Storage, không song song.
 *
 * Trả `false` thay vì throw khi ghi hỏng, và đó là lựa chọn có chủ đích: học sinh
 * đang làm bài giữa giờ thi. Chặn OCR vì database lỗi sẽ cướp mất chức năng nhập
 * bài của họ để đổi lấy một dòng nhật ký. Hướng an toàn là để học sinh tiếp tục —
 * bài vẫn nộp được, chỉ là worker sẽ thấy "không có snapshot" và đẩy bài về cho
 * giáo viên duyệt tay. Rủi ro rơi đúng chỗ nên rơi.
 */
async function writeOcrSnapshot(params: {
  admin: SupabaseClient
  attemptId: string
  questionId: string
  uploadId: string
  result: OcrResult
}): Promise<boolean> {
  const { result } = params

  try {
    const { error } = await params.admin.from('essay_ocr_snapshots').insert({
      attempt_id: params.attemptId,
      question_id: params.questionId,
      upload_id: params.uploadId,
      provider: result.provider,
      model: result.model,
      confidence: result.confidence,
      // Hai mảng song song, cùng độ dài, ghép lại bằng chỉ số ở phía worker.
      warning_kinds: result.warnings.map((warning) => warning.kind),
      warning_details: result.warnings.map((warning) => warning.detail),
      text_hash: hashText(result.normalizedText),
      text_length: result.normalizedText.length,
    })

    if (error) {
      console.error('[essay-ai ocr] ghi snapshot hỏng:', error.message)
      return false
    }

    return true
  } catch (error) {
    console.error(
      '[essay-ai ocr] ghi snapshot hỏng:',
      error instanceof Error ? error.message : 'unknown'
    )
    return false
  }
}

/** Đánh dấu ảnh không dùng được. Không chặn luồng nếu chính việc này hỏng. */
async function markUploadStatus(
  admin: SupabaseClient,
  uploadId: string,
  status: 'stored' | 'ocr_done' | 'failed'
): Promise<void> {
  const { error } = await admin
    .from('essay_answer_uploads')
    .update({ status })
    .eq('id', uploadId)

  if (error) {
    console.error(`[essay-ai ocr] đặt status=${status} hỏng:`, error.message)
  }
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

  const { attemptId, uploadId } = body as Record<string, unknown>

  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    return json({ error: 'Thiếu mã bài thi.', code: 'MISSING_ATTEMPT' }, 400)
  }
  if (typeof uploadId !== 'string' || uploadId.length === 0) {
    return json({ error: 'Thiếu mã ảnh.', code: 'MISSING_UPLOAD' }, 400)
  }

  const gate = await gateAttempt({ attemptId, requireActive: true })
  if (!gate.ok) {
    return json({ error: gate.error, code: gate.code }, gate.status)
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error('[essay-ai ocr] thiếu SUPABASE_SERVICE_KEY')
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  // `question_id` lấy TỪ dòng metadata, không nhận từ client. Trước bản này
  // client gửi `questionId` và server tin — nghĩa là snapshot chất lượng của
  // câu 5 có thể bị gắn sang câu 3 chỉ bằng cách sửa một dòng JSON.
  //
  // Ba điều kiện lọc đều cần: `attempt_id` và `student_id` chặn dùng `uploadId`
  // của người khác, `deleted_at` chặn OCR một ảnh vừa bị xoá.
  const { data: upload, error: lookupError } = await admin
    .from('essay_answer_uploads')
    .select('id, question_id, storage_path, mime_type, content_hash, deleted_at')
    .eq('id', uploadId)
    .eq('attempt_id', attemptId)
    .eq('student_id', gate.userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupError) {
    console.error('[essay-ai ocr] tra ảnh hỏng:', lookupError.message)
    return json({ error: 'Không đọc được ảnh.', code: 'UPLOAD_LOOKUP_FAILED' }, 500)
  }

  if (!upload) {
    return json({ error: 'Không tìm thấy ảnh.', code: 'UPLOAD_NOT_FOUND' }, 404)
  }

  if (!isAllowedUploadMime(upload.mime_type)) {
    // Chỉ xảy ra nếu dữ liệu trong bảng bị làm bẩn: CHECK constraint đã chặn ở
    // tầng database. Kiểm lại vì `ocr-provider` nhận kiểu hẹp.
    await markUploadStatus(admin, uploadId, 'failed')
    return json({ error: 'Định dạng ảnh không hỗ trợ.', code: 'UNSUPPORTED_MIME' }, 400)
  }

  const { data: blob, error: downloadError } = await admin.storage
    .from(UPLOAD_BUCKET)
    .download(upload.storage_path)

  if (downloadError || !blob) {
    // Dòng metadata có nhưng tệp không có: học sinh bỏ giữa lúc upload, hoặc
    // signed URL hết hạn trước khi họ bấm gửi. Giữ `pending` để phân biệt với
    // ảnh hỏng thật.
    console.error(
      '[essay-ai ocr] tải ảnh hỏng:',
      downloadError?.message ?? 'không có nội dung'
    )
    return json(
      { error: 'Ảnh chưa tải lên xong. Hãy thử chụp lại.', code: 'UPLOAD_NOT_STORED' },
      409
    )
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())

  // Kích thước thật, không phải kích thước client khai lúc xin signed URL.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    await markUploadStatus(admin, uploadId, 'failed')
    return json({ error: 'Ảnh không hợp lệ.', code: 'IMAGE_SIZE_INVALID' }, 413)
  }

  // ĐỐI CHIẾU HASH. `content_hash` được client khai lúc xin signed URL và bị
  // trigger đóng băng (không sửa được sau khi ghi), nên phép so ở đây trả lời
  // được một câu cụ thể: byte đang chuẩn bị đưa cho AI đọc có đúng là byte mà
  // học sinh đã cam kết gửi hay không. Lệch nghĩa là tệp bị thay giữa hai bước.
  //
  // Đây cũng là thứ làm cho việc lưu ảnh có giá trị làm bằng chứng: khi tranh
  // chấp điểm, hash trong bảng chứng minh ảnh đang xem là ảnh đã được chấm.
  if (hashBytes(bytes) !== upload.content_hash) {
    await markUploadStatus(admin, uploadId, 'failed')
    return json(
      { error: 'Ảnh tải lên không khớp bản gốc. Hãy chụp lại.', code: 'HASH_MISMATCH' },
      422
    )
  }

  await markUploadStatus(admin, uploadId, 'stored')

  try {
    const provider = createOcrProvider()
    const result = await provider.recognize({
      imageBase64: Buffer.from(bytes).toString('base64'),
      mimeType: upload.mime_type,
    })

    // Ghi bản ghi chất lượng TRƯỚC khi trả text về. Đây là mắt xích khiến các
    // cổng OCR trong `auto-finalize.ts` có dữ liệu để chạy; thiếu nó thì worker
    // coi bài là "mất dấu vết" và chặn auto-chốt.
    //
    // Ghi bằng service_role vì `essay_ocr_snapshots` REVOKE hết khỏi
    // authenticated — học sinh đọc được bảng này là biết bài mình có bị gắn cờ
    // chất lượng thấp hay không, suy ra được cách bài sẽ được xử lý.
    const snapshotWritten = await writeOcrSnapshot({
      admin,
      attemptId,
      questionId: upload.question_id,
      uploadId,
      result,
    })

    await markUploadStatus(admin, uploadId, snapshotWritten ? 'ocr_done' : 'stored')

    return json({
      text: result.normalizedText,
      confidence: result.confidence,
      warnings: result.warnings.map((warning) => warning.detail),
      // Client dùng cờ này để cảnh báo học sinh đọc kỹ lại bài. Không tiết lộ
      // lý do ghi hỏng — đó là chuyện nội bộ của server.
      snapshotWritten,
      code: 'OK',
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      // Ảnh vẫn giữ nguyên trên Storage dù OCR đổ: giáo viên đọc được bằng mắt,
      // và đó chính là lý do lưu ảnh. Chỉ đánh dấu là chưa có bản đọc máy.
      await markUploadStatus(admin, uploadId, 'stored')

      // Thông điệp của ProviderError đã được viết để không chứa nội dung bài
      // làm hay key. Vẫn ánh xạ về mã HTTP phù hợp để client xử lý retry.
      const status =
        error.kind === 'config'
          ? 503
          : error.kind === 'rate_limit'
            ? 429
            : error.kind === 'timeout'
              ? 504
              : error.kind === 'content_rejected'
                ? 422
                : 502

      return json({ error: error.message, code: error.kind.toUpperCase() }, status)
    }

    await markUploadStatus(admin, uploadId, 'stored')

    // Không đưa error gốc vào response: nó có thể chứa fragment của request.
    console.error('OCR route failed:', error instanceof Error ? error.message : 'unknown')
    return json({ error: 'Không nhận dạng được ảnh.', code: 'OCR_FAILED' }, 500)
  }
}
