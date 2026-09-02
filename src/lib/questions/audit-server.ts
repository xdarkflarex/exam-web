/**
 * Vỏ xác thực dùng chung cho bốn route của công cụ rà soát.
 *
 * `AGENTS.md` mục 4: `/api/*` KHÔNG đi qua middleware, nên mỗi route handler
 * phải tự xác thực user, role và input. File này gom phần lặp lại đó về một chỗ
 * để bốn route không trôi dạt khỏi nhau — bốn bản copy của cùng một phép kiểm
 * quyền là bốn cơ hội để một bản bị sửa lỏng ra mà không ai thấy.
 *
 * Hai bảng `question_audit_*` chỉ `service_role` chạm tới (migration 20260830),
 * nên mọi truy cập đều đi qua client service_role tạo ở đây — SAU khi session
 * cookie đã chứng minh người gọi là admin.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { readQuestionAuditFlags, type QuestionAuditFlags } from './audit-config.ts'

export function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export interface AdminContext {
  userId: string
  /** Client bypass RLS. Chỉ tồn tại sau khi đã kiểm role admin. */
  admin: SupabaseClient
  flags: QuestionAuditFlags
}

type GuardResult = { ok: true; ctx: AdminContext } | { ok: false; response: NextResponse }

/**
 * Kiểm đăng nhập + role admin, KHÔNG kiểm cờ của công cụ rà soát.
 *
 * Tách khỏi `requireAuditAdmin` vì có những route quản trị không liên quan gì
 * tới rà soát — sửa câu hỏi chẳng hạn. Bắt chúng phụ thuộc
 * `QUESTION_AUDIT_ENABLED` sẽ khiến tắt công cụ rà soát kéo theo tắt cả việc
 * sửa câu, một liên đới không ai muốn và không ai đoán được.
 */
export async function requireAdmin(): Promise<GuardResult> {
  return guard({ requireAuditFlag: false })
}

/**
 * Kiểm ba thứ, theo đúng thứ tự đó: đã đăng nhập, đúng role, và tính năng đang
 * bật. Thiếu cấu hình thì KHOÁ, không mở — fail-closed theo `AGENTS.md` mục 4.
 *
 * `role === 'admin'` so khớp chính xác, không phải `!== 'student'`. Ranh giới
 * `teacher` so với `admin` trong repo này còn chưa thống nhất (P1 đang mở), nên
 * một tính năng ghi đè được đáp án của cả ngân hàng thì lấy mức chặt hơn.
 */
export async function requireAuditAdmin(): Promise<GuardResult> {
  return guard({ requireAuditFlag: true })
}

async function guard({
  requireAuditFlag,
}: {
  requireAuditFlag: boolean
}): Promise<GuardResult> {
  const flags = readQuestionAuditFlags()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false,
      response: json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503),
    }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anonKey, {
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
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' }, 401) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return { ok: false, response: json({ error: 'Không có quyền.', code: 'FORBIDDEN' }, 403) }
  }

  if (requireAuditFlag && !flags.enabled) {
    return {
      ok: false,
      response: json(
        {
          error: 'Công cụ rà soát đang tắt. Đặt QUESTION_AUDIT_ENABLED=true ở server.',
          code: 'AUDIT_DISABLED',
        },
        503
      ),
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { ok: true, ctx: { userId: user.id, admin, flags } }
}
