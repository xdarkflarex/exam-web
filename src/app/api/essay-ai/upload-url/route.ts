import { NextResponse, type NextRequest } from 'next/server'
import {
  MAX_PAGES_PER_ANSWER,
  MAX_UPLOAD_BYTES,
  UPLOAD_BUCKET,
  buildStoragePath,
  createAdminClient,
  gateAttempt,
  isAllowedUploadMime,
} from '@/lib/essay-ai/uploads'

/**
 * POST /api/essay-ai/upload-url
 *
 * Cấp quyền tải một ảnh bài làm lên bucket private, và tạo trước dòng metadata
 * cho ảnh đó.
 *
 * VÌ SAO KHÔNG CHO CLIENT UPLOAD TRỰC TIẾP BẰNG ANON KEY. Policy
 * `essay_uploads_student_write` trên `storage.objects` đúng là cho phép, và nó
 * vẫn ở đó làm lớp phòng thủ thứ hai. Nhưng đường chính đi qua route này vì chỉ
 * server mới quyết định được ba thứ mà client không được tự chọn:
 *
 *   1. `uploadId` và do đó `storage_path`. Trigger buộc đường dẫn khớp id dòng,
 *      còn policy storage đọc `attempt_id` TỪ đường dẫn để kiểm quyền — để client
 *      tự đặt đường dẫn là mời nó thử ghi vào thư mục của attempt khác.
 *   2. `page_index` tiếp theo. Có UNIQUE trên (attempt, question, page) cho ảnh
 *      còn sống, nên hai ảnh cùng chỉ số sẽ đụng nhau; client không thấy được
 *      ảnh đã xoá mềm nên không tính đúng chỉ số kế tiếp.
 *   3. Quota số trang. Client tự kiểm quota là không có quota.
 *
 * VÌ SAO KHÔNG ĐI QUA SERVER LUÔN CẢ PHẦN BYTE. Ảnh đi trong body của một
 * serverless function là đường ngắn nhất tới giới hạn body (4,5 MB trên Vercel)
 * và tới việc trả tiền cho băng thông hai lần. Signed URL đưa byte đi thẳng từ
 * điện thoại học sinh tới Storage.
 *
 * Route KHÔNG chấm điểm và KHÔNG gọi OCR. Nó chỉ mở đường ghi một tệp.
 */

interface ApiResponse {
  uploadId?: string
  path?: string
  /** Token của signed upload URL; client dùng với `uploadToSignedUrl`. */
  token?: string
  pageIndex?: number
  error?: string
  code: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** SHA-256 hex, 64 ký tự hex thường. Do client tính trên đúng blob sẽ upload. */
function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
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

  const { attemptId, questionId, mimeType, byteSize, contentHash } = body as Record<
    string,
    unknown
  >

  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    return json({ error: 'Thiếu mã bài thi.', code: 'MISSING_ATTEMPT' }, 400)
  }
  if (typeof questionId !== 'string' || questionId.length === 0) {
    return json({ error: 'Thiếu mã câu hỏi.', code: 'MISSING_QUESTION' }, 400)
  }
  if (!isAllowedUploadMime(mimeType)) {
    return json({ error: 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.', code: 'UNSUPPORTED_MIME' }, 400)
  }
  if (typeof byteSize !== 'number' || !Number.isInteger(byteSize) || byteSize <= 0) {
    return json({ error: 'Kích thước ảnh không hợp lệ.', code: 'INVALID_SIZE' }, 400)
  }
  if (byteSize > MAX_UPLOAD_BYTES) {
    return json(
      { error: 'Ảnh vượt quá 3 MB sau khi thu nhỏ. Hãy chụp lại.', code: 'IMAGE_TOO_LARGE' },
      413
    )
  }
  // Hash do client tính. Nó KHÔNG được tin ở đây — giá trị này bị đóng băng bởi
  // trigger (không sửa được sau khi ghi), rồi route OCR tải ảnh về, băm lại và
  // đối chiếu. Chính vì nó được khai trước và không sửa được, phép đối chiếu sau
  // đó mới có nghĩa: byte trên Storage khác lời khai nghĩa là tệp đã bị đổi giữa
  // hai bước.
  if (!isSha256Hex(contentHash)) {
    return json({ error: 'Thiếu mã kiểm tra ảnh.', code: 'INVALID_HASH' }, 400)
  }

  const gate = await gateAttempt({ attemptId, requireActive: true })
  if (!gate.ok) {
    return json({ error: gate.error, code: gate.code }, gate.status)
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error('[essay-ai upload-url] thiếu SUPABASE_SERVICE_KEY')
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  // Quota và chỉ số trang tính trên ảnh CÒN SỐNG. Ảnh đã xoá mềm không chiếm
  // quota — học sinh chụp lại nhiều lần vì ảnh mờ là chuyện bình thường, chặn
  // họ vì những tấm đã tự bỏ đi là chặn sai người.
  const { data: alive, error: aliveError } = await admin
    .from('essay_answer_uploads')
    .select('page_index')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    .is('deleted_at', null)
    .order('page_index', { ascending: false })

  if (aliveError) {
    console.error('[essay-ai upload-url] đếm trang hỏng:', aliveError.message)
    return json({ error: 'Không chuẩn bị được chỗ lưu ảnh.', code: 'PAGE_LOOKUP_FAILED' }, 500)
  }

  const pages = alive ?? []
  if (pages.length >= MAX_PAGES_PER_ANSWER) {
    return json(
      {
        error: `Mỗi câu chỉ lưu tối đa ${MAX_PAGES_PER_ANSWER} ảnh. Hãy xoá ảnh không cần trước khi chụp thêm.`,
        code: 'TOO_MANY_PAGES',
      },
      409
    )
  }

  // Lấy max + 1 chứ không lấy `pages.length`: xoá ảnh giữa rồi chụp thêm sẽ tạo
  // ra chỉ số trùng nếu đếm theo số lượng.
  const nextPageIndex = pages.length > 0 ? Number(pages[0].page_index) + 1 : 0

  const uploadId = crypto.randomUUID()
  const storagePath = buildStoragePath({ attemptId, questionId, uploadId })

  // Ghi dòng metadata TRƯỚC khi cấp signed URL. Thứ tự này tạo ra dòng `pending`
  // mồ côi nếu học sinh bỏ giữa (mất mạng, đóng tab) — chấp nhận được, vì dòng
  // `pending` không có ảnh thì không bài nào bị chấm dựa vào nó. Thứ tự ngược
  // lại thì tệ hơn nhiều: ảnh nằm trên Storage mà không có metadata nào trỏ tới,
  // tức là dữ liệu cá nhân của học sinh không ai biết để xoá.
  const { error: insertError } = await admin.from('essay_answer_uploads').insert({
    id: uploadId,
    attempt_id: attemptId,
    question_id: questionId,
    student_id: gate.userId,
    storage_path: storagePath,
    mime_type: mimeType,
    byte_size: byteSize,
    content_hash: contentHash,
    page_index: nextPageIndex,
    status: 'pending',
  })

  if (insertError) {
    // Trigger `essay_answer_uploads_guard` raise ở đây nếu attempt vừa chuyển
    // trạng thái giữa lúc kiểm và lúc ghi. Không lộ message gốc: nó chứa tên
    // constraint và cấu trúc bảng.
    console.error('[essay-ai upload-url] ghi metadata hỏng:', insertError.message)
    return json({ error: 'Không chuẩn bị được chỗ lưu ảnh.', code: 'UPLOAD_INIT_FAILED' }, 500)
  }

  const { data: signed, error: signError } = await admin.storage
    .from(UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })

  if (signError || !signed) {
    console.error('[essay-ai upload-url] cấp signed URL hỏng:', signError?.message ?? 'unknown')
    // Dòng `pending` vừa tạo để lại có chủ đích: không có DELETE cho service_role
    // trên bảng này (`20260809` mục 6), và một dòng `pending` không ảnh là vô
    // hại. Đánh dấu `failed` để job dọn về sau phân biệt được với dòng đang chờ
    // học sinh upload thật.
    await admin
      .from('essay_answer_uploads')
      .update({ status: 'failed' })
      .eq('id', uploadId)

    return json({ error: 'Không chuẩn bị được chỗ lưu ảnh.', code: 'SIGN_FAILED' }, 502)
  }

  return json({
    uploadId,
    path: storagePath,
    token: signed.token,
    pageIndex: nextPageIndex,
    code: 'OK',
  })
}
