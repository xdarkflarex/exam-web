import { NextResponse, type NextRequest } from 'next/server'
import { UPLOAD_BUCKET, createAdminClient, gateAttempt } from '@/lib/essay-ai/uploads'

/**
 * DELETE /api/essay-ai/upload
 *
 * Học sinh xoá một ảnh bài làm của mình, chỉ khi bài còn đang làm.
 *
 * HAI VIỆC, PHẢI ĐÚNG THỨ TỰ:
 *   1. Đánh dấu `deleted_at` trên dòng metadata (xoá mềm — dấu vết "đã chụp 5
 *      lần, bỏ 3" là dữ liệu benchmark thật).
 *   2. Xoá tệp thật khỏi Storage.
 *
 * Thứ tự này chọn có chủ đích. Nếu bước 2 hỏng, ta có một tệp mồ côi trên
 * Storage mà metadata đã nói là đã xoá — vô hại, job TTL sẽ dọn, và học sinh
 * thấy đúng điều họ mong đợi (ảnh biến mất khỏi UI). Thứ tự ngược lại thì tệ:
 * tệp mất mà dòng vẫn "còn sống", nên worker sẽ tính snapshot của một ảnh không
 * còn tồn tại — đúng lỗ hổng mà cột `upload_id` sinh ra để đóng.
 *
 * VÌ SAO ĐI QUA ROUTE thay vì để client gọi thẳng `storage.remove()`. Hai việc
 * trên phải cùng xảy ra. Client làm hai lời gọi riêng thì mất mạng giữa hai lời
 * gọi để lại đúng trạng thái sai ở trên. Policy `essay_uploads_student_delete`
 * vẫn ở đó làm lớp phòng thủ thứ hai, không phải đường chính.
 *
 * XOÁ SAU KHI NỘP thì route này từ chối (409). Ảnh của bài đã nộp là bằng chứng
 * của một bài đã chấm; chỉ admin gỡ được, và cũng chỉ xoá mềm, qua đường quản
 * trị chứ không qua route này.
 */

interface ApiResponse {
  error?: string
  code: string
}

function json(body: ApiResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function DELETE(request: NextRequest) {
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
    console.error('[essay-ai upload delete] thiếu SUPABASE_SERVICE_KEY')
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }

  // Lọc theo cả `attempt_id` và `student_id`: `gateAttempt` đã chứng minh
  // attempt thuộc user, nhưng `uploadId` là giá trị client gửi và có thể là ảnh
  // của attempt khác. Thiếu hai điều kiện này thì học sinh xoá được ảnh của bạn.
  const { data: upload, error: lookupError } = await admin
    .from('essay_answer_uploads')
    .select('id, storage_path, deleted_at')
    .eq('id', uploadId)
    .eq('attempt_id', attemptId)
    .eq('student_id', gate.userId)
    .maybeSingle()

  if (lookupError) {
    console.error('[essay-ai upload delete] tra ảnh hỏng:', lookupError.message)
    return json({ error: 'Không xoá được ảnh.', code: 'UPLOAD_LOOKUP_FAILED' }, 500)
  }

  if (!upload) {
    return json({ error: 'Không tìm thấy ảnh.', code: 'UPLOAD_NOT_FOUND' }, 404)
  }

  // Đã xoá rồi thì coi như thành công. Xoá là thao tác idempotent; trả lỗi ở đây
  // chỉ làm UI hiện thông báo đỏ cho một việc đã đúng như học sinh muốn.
  if (upload.deleted_at !== null) {
    return json({ code: 'ALREADY_DELETED' })
  }

  const { error: updateError } = await admin
    .from('essay_answer_uploads')
    .update({ deleted_at: new Date().toISOString(), deleted_by: gate.userId })
    .eq('id', uploadId)

  if (updateError) {
    console.error('[essay-ai upload delete] xoá mềm hỏng:', updateError.message)
    return json({ error: 'Không xoá được ảnh.', code: 'SOFT_DELETE_FAILED' }, 500)
  }

  const { error: removeError } = await admin.storage
    .from(UPLOAD_BUCKET)
    .remove([upload.storage_path])

  if (removeError) {
    // KHÔNG trả lỗi cho học sinh: với họ ảnh đã xoá xong (dòng metadata đã đánh
    // dấu, UI sẽ không hiện nữa, worker sẽ không tính tới). Tệp còn lại là việc
    // của job TTL. Trả 500 ở đây sẽ khiến học sinh bấm xoá lại giữa giờ thi cho
    // một việc đã xong.
    console.error('[essay-ai upload delete] xoá tệp hỏng:', removeError.message)
  }

  return json({ code: 'OK' })
}
