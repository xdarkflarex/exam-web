/**
 * Luật của nút "Đặt lại mật khẩu" ở `/admin/users`, tách khỏi route để test
 * được từng nhánh từ chối mà không cần dựng Next.js hay Supabase.
 *
 * `AGENTS.md` mục 4: thay đổi auth/service-role là thay đổi bảo mật cao, phải
 * có test negative 401/403 và cross-user. Phần 401/403 do `requireAdmin()` lo
 * (đăng nhập + role admin exact); file này lo phần còn lại — đầu vào, và AI
 * được phép bị đặt lại mật khẩu.
 *
 * KHÔNG có giá trị mật khẩu nào trong file này. Mật khẩu mặc định nằm ở route
 * (chỉ chạy trên server): `AGENTS.md` mục 5 cấm đưa mật khẩu tạm vào client, và
 * file này được component phía client import để lấy kiểu dữ liệu.
 */

/** `default`: mật khẩu mặc định cố định (đặt ở server). `random`: sinh ngẫu nhiên. */
export type ResetMode = 'default' | 'random'

export interface ResetRequest {
  userId: string
  mode: ResetMode
}

export interface ResetRejection {
  status: number
  code: string
  error: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseResetRequest(body: unknown): { ok: true; value: ResetRequest } | { ok: false; rejection: ResetRejection } {
  const bad = (error: string): { ok: false; rejection: ResetRejection } => ({
    ok: false,
    rejection: { status: 400, code: 'INVALID_INPUT', error },
  })
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Dữ liệu không hợp lệ.')
  const { userId, mode } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !UUID.test(userId)) return bad('Thiếu hoặc sai mã tài khoản.')
  // Không đoán mode: gửi thiếu hay gửi lạ là lỗi, không âm thầm rơi về mật
  // khẩu mặc định — rơi về cái dễ đoán nhất là hướng sai để fail.
  if (mode !== 'default' && mode !== 'random') return bad('Chưa chọn kiểu mật khẩu mới.')
  return { ok: true, value: { userId, mode } }
}

export interface ResetTarget {
  id: string
  role: string | null
}

/**
 * Chỉ đặt lại được tài khoản HỌC SINH, và không bao giờ là chính mình.
 *
 * Mở cho `teacher`/`admin` là mở một đường chiếm tài khoản: admin A đặt lại
 * mật khẩu admin B về một giá trị A biết, rồi đăng nhập thành B. Ranh giới
 * teacher/admin còn là P1 đang mở (`AGENTS.md` mục 4) nên càng không nới ở đây.
 */
export function checkResetTarget(actorId: string, target: ResetTarget | null): ResetRejection | null {
  if (!target) return { status: 404, code: 'USER_NOT_FOUND', error: 'Không tìm thấy tài khoản.' }
  if (target.id === actorId) {
    return { status: 403, code: 'CANNOT_RESET_SELF', error: 'Không đặt lại mật khẩu của chính mình ở đây. Dùng trang Đổi mật khẩu.' }
  }
  if (target.role !== 'student') {
    return { status: 403, code: 'NOT_A_STUDENT', error: 'Chỉ đặt lại được mật khẩu tài khoản học sinh.' }
  }
  return null
}

/**
 * Đổi lỗi của Supabase Auth thành câu admin hiểu và làm theo được.
 *
 * Ca hay gặp nhất: project Supabase đặt chính sách mật khẩu mạnh hơn mặc định
 * (độ dài tối thiểu, ký tự bắt buộc) nên từ chối mật khẩu mặc định. Không thể
 * sửa ở code — chỉ có thể chọn mật khẩu ngẫu nhiên, hoặc nới chính sách.
 */
export function describeAuthPasswordError(error: { code?: string; message?: string } | null): ResetRejection {
  const code = error?.code || ''
  const message = (error?.message || '').toLowerCase()
  if (code === 'weak_password' || message.includes('weak') || message.includes('password should')) {
    return {
      status: 422,
      code: 'WEAK_PASSWORD',
      error:
        'Supabase từ chối mật khẩu này vì chính sách mật khẩu của project. Chọn "Mật khẩu ngẫu nhiên", ' +
        'hoặc nới chính sách ở Supabase → Authentication → Policies.',
    }
  }
  return { status: 500, code: 'AUTH_ERROR', error: 'Không đổi được mật khẩu. Vui lòng thử lại.' }
}
