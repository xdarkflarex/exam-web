#!/usr/bin/env node
/**
 * Kiểm tra quyền của pipeline chấm tự luận bằng JWT học sinh thật.
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * `20260804` và `20260805` tạo ba RPC và một bảng mà chỉ `service_role` được
 * dùng. Postflight SQL chỉ kiểm được cấu hình GRANT trong catalog — nó không
 * chứng minh runtime chặn thật. `AGENTS.md` mục 8 yêu cầu negative test bằng
 * JWT thật cho mọi thay đổi bảo mật; đây là phần đó, tự động hoá.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/essay-ai-permission-check.mjs \
 *     --email <email-hoc-sinh> --password <mat-khau> [--base-url http://localhost:3000]
 *
 * `--env-file` là cờ của Node: nó nạp .env vào process.env mà không cần script
 * (hay người đọc script) mở file đó ra.
 *
 * BẢO MẬT CỦA CHÍNH SCRIPT NÀY
 * - Thông tin đăng nhập truyền qua tham số, KHÔNG hard-code, không đọc từ file
 *   nào để tránh bị commit.
 * - Script không bao giờ in access token, anon key, hay service key ra stdout.
 * - Script chỉ ĐỌC. Nó không insert, update hay delete gì. Test cascade và
 *   idempotency (mục C, D của postflight) cần ghi dữ liệu nên không nằm ở đây;
 *   chúng được xác nhận khi chạy worker thật ở bước 4.
 *
 * MÃ THOÁT: 0 nếu mọi test đạt, 1 nếu có bất kỳ test nào không đạt.
 */

const args = process.argv.slice(2)

function arg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

const email = arg('email')
const password = arg('password')
const baseUrl = (arg('base-url') || 'http://localhost:3000').replace(/\/+$/, '')

if (!email || !password) {
  console.error('Thiếu --email hoặc --password.')
  console.error('Dùng: node --env-file=.env scripts/essay-ai-permission-check.mjs --email <email> --password <mk>')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  console.error('Chạy kèm --env-file=.env, ví dụ:')
  console.error('  node --env-file=.env scripts/essay-ai-permission-check.mjs --email … --password …')
  process.exit(1)
}

const restBase = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`

// ---------------------------------------------------------------------------
// Ghi nhận kết quả
// ---------------------------------------------------------------------------

const results = []

function record(name, passed, detail, note) {
  results.push({ name, passed, detail, note })
  const tag = passed ? '\x1b[32m✓ ĐẠT\x1b[0m' : '\x1b[31m✗ KHÔNG ĐẠT\x1b[0m'
  console.log(`${tag}  ${name}`)
  console.log(`        ${detail}`)
  if (note) console.log(`        \x1b[2m${note}\x1b[0m`)
}

// ---------------------------------------------------------------------------
// Đăng nhập
// ---------------------------------------------------------------------------

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    console.error(`\nKhông đăng nhập được (HTTP ${res.status}).`)
    console.error(`Lý do: ${body.error_description || body.msg || body.error || 'không rõ'}`)
    process.exit(1)
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, user: body.user }
}

// ---------------------------------------------------------------------------
// Test bảng và RPC bằng JWT học sinh
// ---------------------------------------------------------------------------

/**
 * Đọc bảng bằng JWT học sinh.
 *
 * Hai kết quả đều ĐẠT, vì chúng chặn ở hai lớp khác nhau:
 * - HTTP 4xx (42501 insufficient_privilege): GRANT đã bị thu hồi.
 * - HTTP 200 với mảng RỖNG: RLS bật, không policy nào khớp.
 * Chỉ 200 kèm ÍT NHẤT MỘT DÒNG là không đạt — nghĩa là học sinh đọc được
 * `ai_score` gắn với bài cụ thể, tức thấy điểm trước khi công bố.
 */
async function testTableRead(token) {
  const res = await fetch(`${restBase}/essay_ai_usage?select=*&limit=5`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => null)

  if (res.status >= 400) {
    const code = body && typeof body === 'object' ? body.code : null
    record(
      'A. Học sinh đọc bảng essay_ai_usage',
      true,
      `HTTP ${res.status} — bị từ chối ở lớp quyền${code ? ` (code ${code})` : ''}.`,
      'Quyền SELECT đã thu hồi khỏi authenticated.'
    )
    return
  }

  if (Array.isArray(body) && body.length === 0) {
    record(
      'A. Học sinh đọc bảng essay_ai_usage',
      true,
      'HTTP 200 nhưng trả về 0 dòng — RLS bật, không policy nào khớp.',
      'Đạt, nhưng lưu ý: đây là chặn ở lớp RLS, không phải lớp GRANT.'
    )
    return
  }

  record(
    'A. Học sinh đọc bảng essay_ai_usage',
    false,
    `HTTP ${res.status} trả về ${Array.isArray(body) ? body.length : '?'} dòng.`,
    'NGHIÊM TRỌNG: học sinh đọc được ai_score. Thu hồi quyền NGAY trước khi chạy worker.'
  )
}

/**
 * Gọi RPC bằng JWT học sinh. Bất kỳ HTTP >= 400 là ĐẠT.
 *
 * PostgREST trả 404/PGRST202 khi hàm không nhìn thấy được (đúng như thiết kế
 * khi EXECUTE bị REVOKE), hoặc 403/42501 khi thấy mà không có quyền. Cả hai
 * đều là chặn thật. Chỉ HTTP 200 mới là lỗ hổng.
 */
async function testRpcDenied(token, fnName, payload, label, why) {
  const res = await fetch(`${restBase}/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null)
  const code = body && typeof body === 'object' && !Array.isArray(body) ? body.code : null

  if (res.status >= 400) {
    record(label, true, `HTTP ${res.status} — bị từ chối${code ? ` (code ${code})` : ''}.`, why)
  } else {
    record(label, false, `HTTP ${res.status} — hàm CHẠY ĐƯỢC bằng JWT học sinh.`, `NGHIÊM TRỌNG: ${why}`)
  }
}

// ---------------------------------------------------------------------------
// Test route handler
// ---------------------------------------------------------------------------

async function testRoute(label, url, init, expectedStatus, why) {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    record(label, false, `Không gọi được: ${err.message}`, 'Dev server có đang chạy ở --base-url không?')
    return null
  }
  const passed = res.status === expectedStatus
  record(
    label,
    passed,
    `HTTP ${res.status}${passed ? '' : ` (kỳ vọng ${expectedStatus})`}`,
    passed ? why : `Kỳ vọng ${expectedStatus}. ${why}`
  )
  return res.status
}

/**
 * Dựng cookie session theo định dạng của @supabase/ssr để test route dùng
 * `createServerClient`. Route đọc session từ cookie, không đọc Authorization
 * header, nên không dựng cookie thì mọi test chỉ ra 401 và không phân biệt
 * được "chưa đăng nhập" với "đăng nhập nhưng không phải admin".
 */
function buildSsrCookie(session) {
  const ref = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]
  const payload = JSON.stringify(session)
  const encoded = Buffer.from(payload, 'utf8').toString('base64')
  return `sb-${ref}-auth-token=base64-${encoded}`
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

console.log('\n\x1b[1mKiểm tra quyền pipeline chấm tự luận\x1b[0m')
console.log(`Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]}…`)
console.log(`App:      ${baseUrl}\n`)

const { accessToken, refreshToken, user } = await signIn()

// Xác nhận đây đúng là tài khoản học sinh — chạy bộ test này bằng JWT admin sẽ
// cho kết quả vô nghĩa (admin bị chặn ở RPC là đúng, nhưng không chứng minh
// được điều ta cần chứng minh về học sinh).
const profileRes = await fetch(`${restBase}/profiles?select=role&id=eq.${user.id}`, {
  headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
})
const profile = await profileRes.json().catch(() => null)
const role = Array.isArray(profile) && profile[0] ? profile[0].role : null

console.log(`Đăng nhập thành công. role = ${role ?? 'không đọc được'}\n`)

if (role && role !== 'student') {
  console.error(`\x1b[31mDỪNG: tài khoản này có role "${role}", không phải "student".\x1b[0m`)
  console.error('Bộ test này chỉ có ý nghĩa với JWT học sinh. Dùng tài khoản học sinh thật.')
  process.exit(1)
}

console.log('\x1b[1m— Lớp database (JWT học sinh) —\x1b[0m')

await testTableRead(accessToken)

await testRpcDenied(
  accessToken,
  'essay_ai_month_to_date_cost',
  {},
  'B. Học sinh gọi essay_ai_month_to_date_cost()',
  'Hàm SECURITY DEFINER đọc bảng mà học sinh không được đọc; cấp cho học sinh là đi vòng qua RLS.'
)

await testRpcDenied(
  accessToken,
  'ai_finalize_essay_answer',
  {
    p_student_answer_id: '00000000-0000-0000-0000-000000000000',
    p_answer_hash: 'x',
    p_rubric_version: 1,
    p_ai_score: 10,
    p_ai_confidence: 1,
    p_ai_feedback: 'x',
    p_ai_breakdown: [],
    p_ai_model: 'x',
  },
  'C. Học sinh gọi ai_finalize_essay_answer()',
  'Đây là hàm ghi điểm. Học sinh gọi được nghĩa là tự chấm điểm cho mình.'
)

await testRpcDenied(
  accessToken,
  'get_essay_grading_package',
  { p_student_answer_id: '00000000-0000-0000-0000-000000000000' },
  'D. Học sinh gọi get_essay_grading_package()',
  'Gói chấm chứa đáp án tham chiếu và rubric — học sinh đọc được là biết đáp án.'
)

console.log('\n\x1b[1m— Lớp route handler —\x1b[0m')

await testRoute(
  'E. POST /api/essay-ai/grade-queue không kèm token',
  `${baseUrl}/api/essay-ai/grade-queue`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  401,
  'Không có bearer token thì không ai kích hoạt được worker.'
)

await testRoute(
  'F. POST /api/essay-ai/grade-queue sai token',
  `${baseUrl}/api/essay-ai/grade-queue`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sai-hoan-toan' },
    body: '{}',
  },
  401,
  'Token sai bị từ chối; so sánh dùng timingSafeEqual nên không rò độ dài.'
)

await testRoute(
  'G. GET /api/essay-ai/grade-queue',
  `${baseUrl}/api/essay-ai/grade-queue`,
  { method: 'GET' },
  405,
  'Chỉ POST được phép — GET có thể bị prefetch hoặc crawl.'
)

await testRoute(
  'H. GET /api/admin/essay-ai/stats chưa đăng nhập',
  `${baseUrl}/api/admin/essay-ai/stats`,
  { method: 'GET' },
  401,
  'Không session thì không đọc được số liệu vận hành.'
)

const studentCookie = buildSsrCookie({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user,
})

const statsStatus = await testRoute(
  'I. GET /api/admin/essay-ai/stats bằng session học sinh',
  `${baseUrl}/api/admin/essay-ai/stats`,
  { method: 'GET', headers: { Cookie: studentCookie } },
  403,
  'Học sinh đăng nhập vẫn phải bị chặn: route so khớp role === "admin" chính xác.'
)

if (statsStatus === 401) {
  console.log(
    '\n\x1b[33mLƯU Ý về test I:\x1b[0m route trả 401 chứ không phải 403, nghĩa là nó\n' +
      'không đọc được cookie session mà script dựng ra. Route vẫn CHẶN đúng (401 cũng\n' +
      'là từ chối), nhưng test này chưa chứng minh được nhánh "đăng nhập rồi mà không\n' +
      'phải admin". Kiểm tay: đăng nhập bằng tài khoản học sinh trên trình duyệt rồi mở\n' +
      `${baseUrl}/api/admin/essay-ai/stats — phải thấy 403 FORBIDDEN.`
  )
}

// ---------------------------------------------------------------------------
// Tổng kết
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.passed)

console.log(`\n\x1b[1m— Tổng kết —\x1b[0m`)
console.log(`${results.length - failed.length}/${results.length} test đạt.`)

if (failed.length > 0) {
  console.log('\n\x1b[31mKhông đạt:\x1b[0m')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  console.log('\nĐừng chạy worker cho tới khi các mục trên đạt.')
  process.exit(1)
}

console.log(
  '\nCòn hai test cần ghi dữ liệu nên không nằm trong script này:\n' +
    '  - Insert hai dòng cùng input_hash → dòng thứ hai phải bị chặn (chống gọi provider 2 lần).\n' +
    '  - Xoá exam_attempt thử → dòng usage phải biến mất theo (CASCADE).\n' +
    'Cả hai được xác nhận khi chạy worker thật ở bước tiếp theo.'
)
process.exit(0)
