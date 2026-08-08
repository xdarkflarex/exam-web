/**
 * Hạ tầng dùng chung cho ba route ảnh bài làm tự luận.
 *
 * Ba route (`upload-url`, `upload` DELETE, `ocr`) đều phải làm đúng bốn việc
 * trước khi chạm dữ liệu: xác thực user, kiểm attempt thuộc user đó, kiểm
 * attempt còn `in_progress`, và dựng client service_role. `AGENTS.md` mục 4:
 * `/api/*` không đi qua middleware nên không route nào được bỏ bước nào.
 *
 * Gom vào đây vì ba bản sao của cùng một phép kiểm quyền là ba chỗ để lệch
 * nhau. Lệch ở đây nghĩa là một route cho phép thứ mà hai route kia chặn.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { cookies } from 'next/headers'

/** Bucket private do `20260809_essay_answer_uploads.sql` tạo. */
export const UPLOAD_BUCKET = 'essay-uploads'

/**
 * Khớp `file_size_limit` của bucket. Hai lớp kiểm cùng một con số có chủ đích:
 * route trả lỗi tiếng Việt đọc được, bucket là chốt cuối không đổi theo deploy.
 *
 * 3 MB là mức chặn ảnh CHƯA qua resize, không phải mức dự kiến — client thu về
 * cạnh dài 1600px / JPEG 0.8 nên ảnh thật khoảng 250 KB.
 */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

export const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number]

/** Tối đa số ảnh còn sống cho một câu. Chặn một học sinh chụp 200 tấm. */
export const MAX_PAGES_PER_ANSWER = 12

export function isAllowedUploadMime(value: unknown): value is AllowedUploadMime {
  return typeof value === 'string' && (ALLOWED_UPLOAD_MIME as readonly string[]).includes(value)
}

/**
 * Đường dẫn trong bucket: `{attempt_id}/{question_id}/{upload_id}`.
 *
 * PHẢI khớp hàm trigger `public.essay_answer_uploads_guard()` — trigger raise
 * `UPLOAD_PATH_MISMATCH` nếu lệch, và policy trên `storage.objects` đọc
 * `attempt_id` từ đoạn đầu đường dẫn để kiểm quyền. Đổi định dạng ở đây mà không
 * đổi migration là mở một đường vòng qua kiểm quyền.
 *
 * KHÔNG có đuôi tệp. Đuôi không mang thông tin nào mà `mime_type` chưa có, và bỏ
 * nó ra làm phép so trong trigger thành một phép nối chuỗi không cần đoán: đường
 * dẫn bằng đúng ba khoá của dòng, không hơn.
 */
export function buildStoragePath(params: {
  attemptId: string
  questionId: string
  uploadId: string
}): string {
  return `${params.attemptId}/${params.questionId}/${params.uploadId}`
}

/** SHA-256 hex của đúng số byte sẽ nằm trên Storage. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Client service_role. Trả `null` khi thiếu cấu hình thay vì throw: người gọi
 * quyết định đó là 503 hay là bỏ qua một bước không bắt buộc.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) return null

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type AttemptGateFailure = {
  ok: false
  status: number
  code: string
  error: string
}

export type AttemptGateSuccess = {
  ok: true
  userId: string
  attemptStatus: string
}

/**
 * Xác thực user rồi kiểm attempt.
 *
 * `requireActive` phân biệt hai nhóm route:
 *   - `true`  cho `upload-url`, `upload` DELETE, `ocr`: chỉ sửa được bài đang làm.
 *   - `false` cho `grade-mine` và các đường chỉ đọc: bài đã nộp vẫn hợp lệ.
 *
 * DANH TÍNH lấy từ session (cookie), nhưng QUYỀN SỞ HỮU tra bằng service_role.
 * Đây là điểm dễ làm sai nhất của hàm này, và nó đã sai thật một lần:
 *
 * Bản trước tra `exam_attempts` bằng chính session học sinh. Nhưng
 * `students_read_own_exam_attempts` (20260722) chỉ cho học sinh đọc attempt của
 * mình khi `status = 'in_progress'`, hoặc đề `practice`, hoặc đề `simulation` đã
 * `grading_status = 'completed'`. Bài thi thử VỪA NỘP không thoả điều nào, nên
 * dòng bị RLS ẩn đi và hàm trả `ATTEMPT_NOT_FOUND` (404) cho chính chủ bài.
 * `grade-mine` vì thế không bao giờ chấm được — nó chỉ chạy sau khi nộp.
 *
 * Đây là cùng một lỗi mà `20260811` sửa ở tầng policy storage: **đừng dựa vào
 * RLS của bảng khác cho một quyết định phân quyền mà mình kiểm tường minh được.**
 * So `student_id !== user.id` ở đây là phép kiểm của ta, đọc được, test được, và
 * không đổi nghĩa khi ai đó siết RLS ở chỗ khác.
 *
 * Bảo mật không nới ra: `auth.getUser()` vẫn là nguồn danh tính duy nhất, và
 * service_role chỉ dùng để ĐỌC hai cột rồi so sánh. Không có đường nào cho người
 * gọi tác động lên phép so đó.
 *
 * Không phân biệt "attempt không tồn tại" với "attempt của người khác" — phân
 * biệt hai trường hợp đó cho phép dò id attempt của người khác.
 */
export async function gateAttempt(params: {
  attemptId: string
  requireActive: boolean
}): Promise<AttemptGateFailure | AttemptGateSuccess> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 503,
      code: 'SERVER_CONFIG_ERROR',
      error: 'Hệ thống chưa sẵn sàng.',
    }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.delete({ name, ...options })
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      error: 'Phiên đăng nhập đã hết hạn.',
    }
  }

  // service_role cho phép tra cứu, KHÔNG cho phép truy cập: quyền sở hữu được so
  // tường minh ngay bên dưới. Xem khối chú thích đầu hàm để biết vì sao không
  // dùng session học sinh cho truy vấn này.
  const admin = createAdminClient()
  if (!admin) {
    console.error('[essay-ai gateAttempt] thiếu SUPABASE_SERVICE_KEY')
    return {
      ok: false,
      status: 503,
      code: 'SERVER_CONFIG_ERROR',
      error: 'Hệ thống chưa sẵn sàng.',
    }
  }

  const { data: attempt, error: attemptError } = await admin
    .from('exam_attempts')
    .select('id, student_id, status')
    .eq('id', params.attemptId)
    .maybeSingle()

  if (attemptError) {
    return {
      ok: false,
      status: 500,
      code: 'ATTEMPT_LOOKUP_FAILED',
      error: 'Không kiểm tra được bài thi.',
    }
  }

  if (!attempt || attempt.student_id !== user.id) {
    return {
      ok: false,
      status: 404,
      code: 'ATTEMPT_NOT_FOUND',
      error: 'Không tìm thấy bài thi.',
    }
  }

  if (params.requireActive && attempt.status !== 'in_progress') {
    return {
      ok: false,
      status: 409,
      code: 'ATTEMPT_NOT_ACTIVE',
      error: 'Bài thi đã kết thúc, ảnh chỉ còn xem lại được.',
    }
  }

  return { ok: true, userId: user.id, attemptStatus: attempt.status }
}
