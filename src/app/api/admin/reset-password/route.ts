import type { NextRequest } from 'next/server'
import { json, requireAdmin } from '@/lib/questions/audit-server'
import {
  checkResetTarget,
  describeAuthPasswordError,
  parseResetRequest,
} from '@/lib/auth/password-reset'
import { generateTempPassword } from '@/lib/auth/temp-password'

/**
 * POST /api/admin/reset-password — đặt lại mật khẩu một tài khoản HỌC SINH.
 *
 * BODY  { userId: uuid, mode: 'default' | 'random' }
 * TRẢ   { success, email, fullName, password, mode }
 *
 * BẢO MẬT
 * - `/api/*` không đi qua middleware (`AGENTS.md` mục 4): `requireAdmin()` tự
 *   kiểm đăng nhập + role `admin` EXACT, như mọi route quản trị khác.
 * - Chỉ đặt lại được role `student`, không bao giờ là chính mình
 *   (`checkResetTarget`). Vai trò đọc bằng service role, không qua RLS của
 *   `profiles` — quyết định quyền không được phụ thuộc RLS bảng khác.
 * - Luôn bật `must_change_password`: học sinh đăng nhập bằng mật khẩu này là bị
 *   middleware đưa thẳng sang `/change-password`, phải đặt mật khẩu ≥ 8 ký tự.
 * - Mật khẩu chỉ đi đúng một đường: trong response này, tới người admin vừa
 *   bấm, kèm `Cache-Control: no-store`. Không ghi log, không lưu ở đâu cả.
 *
 * GIỚI HẠN ĐÃ BIẾT: không đăng xuất các phiên đang mở của học sinh — Supabase
 * Auth không có API admin nào làm việc đó theo user id. Đặt lại vì nghi tài
 * khoản bị người khác dùng thì xoá phiên bằng SQL (`RUNBOOK.md` mục 14).
 */

/**
 * Mật khẩu của lựa chọn "Mật khẩu mặc định". Chỉ sống ở server: client chỉ gửi
 * `mode`, và chỉ thấy giá trị này trong response sau khi đã đặt lại xong.
 */
const DEFAULT_RESET_PASSWORD = '123456'

export async function POST(request: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { userId: actorId, admin } = guard.ctx

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ.', code: 'INVALID_JSON' }, 400)
  }

  const parsed = parseResetRequest(body)
  if (!parsed.ok) {
    return json({ error: parsed.rejection.error, code: parsed.rejection.code }, parsed.rejection.status)
  }
  const { userId, mode } = parsed.value

  const { data: target, error: lookupError } = await admin
    .from('profiles')
    .select('id, role, email, full_name, must_change_password')
    .eq('id', userId)
    .maybeSingle()
  if (lookupError) {
    return json({ error: 'Không đọc được tài khoản.', code: 'LOOKUP_FAILED' }, 500)
  }

  const rejection = checkResetTarget(actorId, target ? { id: target.id, role: target.role } : null)
  if (rejection || !target) {
    const reason = rejection ?? { status: 404, code: 'USER_NOT_FOUND', error: 'Không tìm thấy tài khoản.' }
    return json({ error: reason.error, code: reason.code }, reason.status)
  }

  /*
    BẬT CỜ TRƯỚC, ĐỔI MẬT KHẨU SAU — thứ tự này có chủ đích.

    Đổi mật khẩu trước rồi bật cờ hỏng là để lại một tài khoản mang mật khẩu
    admin vừa đặt mà KHÔNG bị bắt đổi — với "123456" thì đó là cửa mở. Bật cờ
    trước mà đổi mật khẩu hỏng thì tệ nhất học sinh bị hỏi đổi mật khẩu bằng
    chính mật khẩu cũ của mình; và nhánh lỗi bên dưới trả cờ về như cũ.
  */
  const previousFlag = target.must_change_password === true
  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', userId)
  if (flagError) {
    return json({ error: 'Không bật được yêu cầu đổi mật khẩu nên chưa đổi gì.', code: 'FLAG_FAILED' }, 500)
  }

  const password = mode === 'default' ? DEFAULT_RESET_PASSWORD : generateTempPassword()
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { password })
  if (authError) {
    if (!previousFlag) {
      await admin.from('profiles').update({ must_change_password: false }).eq('id', userId)
    }
    const described = describeAuthPasswordError(authError)
    return json({ error: described.error, code: described.code }, described.status)
  }

  // Ai đặt lại cho ai, kiểu nào — KHÔNG có mật khẩu, không có email.
  console.info(`[reset-password] admin ${actorId} đặt lại mật khẩu cho ${userId} (${mode})`)

  return json({
    success: true,
    email: target.email,
    fullName: target.full_name,
    password,
    mode,
  })
}

export function GET() {
  return json({ error: 'Method not allowed' }, 405)
}
