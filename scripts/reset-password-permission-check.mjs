#!/usr/bin/env node
/**
 * Negative test cho `POST /api/admin/reset-password` bằng session THẬT.
 *
 * VÌ SAO CẦN: route này cầm service role và đổi được mật khẩu của người khác.
 * `AGENTS.md` mục 4 xếp thay đổi auth/service-role là bảo mật cao, bắt buộc
 * test 401/403. Test đơn vị (`src/lib/auth/password-reset.test.ts`) chỉ kiểm
 * luật; script này kiểm đúng con đường production: cookie session của
 * `@supabase/ssr` → route handler → `requireAdmin()`.
 *
 * CHỈ ĐỌC: mọi phép thử ở đây đều PHẢI bị từ chối, nên không mật khẩu nào bị
 * đổi. Không có nhánh "cho qua" — thử nhánh đó là đổi mật khẩu thật của một
 * người thật.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/reset-password-permission-check.mjs \
 *     --base-url https://<domain> \
 *     --student-email <hs-test> --student-password '<mk>' \
 *     [--admin-email <admin> --admin-password '<mk>']
 *
 * Có tài khoản admin thì chạy thêm hai phép: admin tự đặt lại chính mình (403)
 * và đặt lại một id không tồn tại (404). Cả hai đều không đổi gì. Admin có bật
 * OTP vẫn chạy được: route API không đi qua cổng OTP của middleware.
 *
 * MÃ THOÁT: 0 khi mọi phép đều đạt, 1 nếu có phép không đạt.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const BASE_URL = (arg('base-url') || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
const STUDENT_EMAIL = arg('student-email')
const STUDENT_PASSWORD = arg('student-password')
const ADMIN_EMAIL = arg('admin-email')
const ADMIN_PASSWORD = arg('admin-password')

if (!SUPABASE_URL || !ANON_KEY || !BASE_URL || !STUDENT_EMAIL || !STUDENT_PASSWORD) {
  console.error('Thiếu tham số. Cần NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (--env-file=.env),')
  console.error('--base-url, --student-email và --student-password.')
  process.exit(1)
}

const ROUTE = `${BASE_URL}/api/admin/reset-password`
const results = []

function record(name, passed, detail) {
  results.push(passed)
  console.log(`${passed ? '\x1b[32m✓ ĐẠT\x1b[0m' : '\x1b[31m✗ KHÔNG ĐẠT\x1b[0m'}  ${name}`)
  console.log(`        ${detail}`)
}

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await response.json().catch(() => null)
  if (!response.ok || !session?.access_token) {
    console.error(`Không đăng nhập được ${email}: HTTP ${response.status}`)
    process.exit(1)
  }
  return session
}

/** Cookie session đúng định dạng `@supabase/ssr` — chép khuôn từ essay-ai-permission-check.mjs. */
function ssrCookie(session) {
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
  const encoded = Buffer.from(JSON.stringify(session), 'utf8').toString('base64')
  return `sb-${ref}-auth-token=base64-${encoded}`
}

async function call(cookie, body) {
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

function expectStatus(name, result, expected, why) {
  const leaked = typeof result.payload?.password === 'string'
  const passed = result.status === expected && !leaked
  record(
    name,
    passed,
    `HTTP ${result.status} (${result.payload?.code || '-'})` +
      (leaked ? ' — RÒ MẬT KHẨU TRONG RESPONSE' : '') +
      (passed ? '' : ` — kỳ vọng ${expected}. ${why}`)
  )
}

console.log(`\nKiểm tra quyền đặt lại mật khẩu: ${ROUTE}\n`)

const student = await signIn(STUDENT_EMAIL, STUDENT_PASSWORD)
const studentId = student.user?.id

expectStatus(
  'A. Chưa đăng nhập',
  await call(null, { userId: studentId, mode: 'random' }),
  401,
  'Route phải tự kiểm đăng nhập — /api/* không đi qua middleware.'
)

const studentCookie = ssrCookie(student)
expectStatus(
  'B. Session học sinh, tự đặt lại mật khẩu của mình',
  await call(studentCookie, { userId: studentId, mode: 'default' }),
  403,
  'Học sinh không được gọi route quản trị.'
)
expectStatus(
  'C. Session học sinh, gửi đầu vào rác',
  await call(studentCookie, { userId: 'rác', mode: 'x' }),
  403,
  'Kiểm quyền phải đứng TRƯỚC kiểm đầu vào — trả 400 là lộ ra route tồn tại và nói nó muốn gì.'
)

if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  const adminSession = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
  const adminCookie = ssrCookie(adminSession)
  expectStatus(
    'D. Admin đặt lại mật khẩu của chính mình',
    await call(adminCookie, { userId: adminSession.user?.id, mode: 'default' }),
    403,
    'Chỉ học sinh mới bị đặt lại được — mở cho admin là một đường chiếm tài khoản.'
  )
  expectStatus(
    'E. Admin đặt lại một id không tồn tại',
    await call(adminCookie, { userId: '00000000-0000-4000-8000-000000000000', mode: 'random' }),
    404,
    'Không được "thành công" với một tài khoản không có thật.'
  )
} else {
  console.log('\x1b[33m● BỎ QUA\x1b[0m  D, E — cần --admin-email và --admin-password.')
}

const failed = results.filter((passed) => !passed).length
console.log(`\nĐạt ${results.length - failed}/${results.length}.`)
process.exit(failed > 0 ? 1 : 0)
