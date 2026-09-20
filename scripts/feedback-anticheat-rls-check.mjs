#!/usr/bin/env node
/**
 * Negative + positive test RLS của `question_feedbacks` và `anti_cheat_logs`
 * bằng **JWT học sinh thật**, qua đúng con đường production (PostgREST).
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * Postflight của `20260920` chỉ đọc catalog. `AGENTS.md` mục 4 nói thẳng:
 * "Postflight đọc catalog KHÔNG chứng minh được lớp lỗi này" — `20260809` từng
 * có postflight đạt toàn bộ trong khi tính năng hỏng hoàn toàn. Đây là phần
 * chứng minh còn thiếu.
 *
 * TUYỆT ĐỐI KHÔNG dùng Supabase SQL Editor: nó chạy bằng vai trò chủ sở hữu,
 * `auth.uid()` là NULL và `FORCE ROW LEVEL SECURITY` không áp, nên mọi policy
 * trông như bị bỏ qua.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/feedback-anticheat-rls-check.mjs \
 *     --email hocsinh@example.com --password '...'
 *
 * Mặc định CHỈ ĐỌC và chỉ chạy các nhánh phải-bị-chặn. Thêm `--write` để chạy
 * cả nhánh phải-cho-qua; nhánh đó GHI THẬT và để lại dòng rác, script sẽ in
 * câu SQL dọn ở cuối.
 *
 * Tuỳ chọn `--other-attempt <id>`: một `exam_attempts.id` KHÔNG thuộc học sinh
 * đang đăng nhập. Không có nó thì script tự tìm bằng `SUPABASE_SERVICE_KEY`
 * nếu biến đó có mặt; không có cả hai thì hai phép thử quan trọng nhất bị
 * BỎ QUA — và bỏ qua KHÔNG phải là đạt.
 *
 * MÃ THOÁT: 0 khi mọi phép thử đã chạy đều đạt và không có phép nào bị bỏ qua;
 * 1 nếu có phép không đạt; 2 nếu có phép bị bỏ qua (chưa kết luận được).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  console.error('Chạy kèm --env-file=.env.')
  process.exit(1)
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const EMAIL = arg('email')
const PASSWORD = arg('password')
const OTHER_ATTEMPT_ARG = arg('other-attempt')
const WRITE = process.argv.includes('--write')

if (!EMAIL || !PASSWORD) {
  console.error('Thiếu --email hoặc --password (tài khoản HỌC SINH dùng để thử).')
  process.exit(1)
}

const base = SUPABASE_URL.replace(/\/+$/, '')
const restBase = `${base}/rest/v1`

/** 42501 = insufficient_privilege — mã duy nhất chứng minh RLS chặn. */
const INSUFFICIENT_PRIVILEGE = '42501'

const results = []
function record(name, state, detail, note) {
  results.push({ name, state })
  const tag =
    state === 'pass' ? '\x1b[32m✓ ĐẠT\x1b[0m'
    : state === 'fail' ? '\x1b[31m✗ KHÔNG ĐẠT\x1b[0m'
    : '\x1b[33m● BỎ QUA\x1b[0m'
  console.log(`${tag}  ${name}`)
  console.log(`        ${detail}`)
  if (note) console.log(`        \x1b[2m${note}\x1b[0m`)
}

async function body(res) {
  const parsed = await res.json().catch(() => null)
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed
}

// ---------------------------------------------------------------------------
// Đăng nhập bằng anon key — đúng cách trình duyệt học sinh làm
// ---------------------------------------------------------------------------

const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})

if (!signIn.ok) {
  const err = await body(signIn)
  console.error(`Không đăng nhập được: HTTP ${signIn.status} — ${err.error_description || err.msg || ''}`)
  process.exit(1)
}

const session = await signIn.json()
const USER_ID = session?.user?.id
const studentHeaders = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
}

console.log(`Đăng nhập: ${EMAIL} (${USER_ID})`)
console.log(WRITE ? 'Chế độ: CÓ GHI (--write)\n' : 'Chế độ: chỉ đọc — thêm --write để thử cả nhánh cho qua\n')

// ---------------------------------------------------------------------------
// Tìm một lượt thi CỦA MÌNH và một lượt thi CỦA NGƯỜI KHÁC
// ---------------------------------------------------------------------------

const mineRes = await fetch(
  `${restBase}/exam_attempts?student_id=eq.${USER_ID}&select=id&limit=1`,
  { headers: studentHeaders }
)
const mine = mineRes.ok ? await mineRes.json() : []
const MY_ATTEMPT = Array.isArray(mine) && mine[0]?.id

let OTHER_ATTEMPT = OTHER_ATTEMPT_ARG
if (!OTHER_ATTEMPT && SERVICE_KEY) {
  // Chỉ dùng service key để TÌM một id, không ghi gì. Đây là thứ học sinh không
  // tự khám phá được — và chính vì vậy mới cần đường khác để dựng phép thử.
  const otherRes = await fetch(
    `${restBase}/exam_attempts?student_id=neq.${USER_ID}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  )
  const other = otherRes.ok ? await otherRes.json() : []
  OTHER_ATTEMPT = Array.isArray(other) ? other[0]?.id : undefined
}

// ---------------------------------------------------------------------------
// Nhóm 1 — PHẢI BỊ CHẶN
// ---------------------------------------------------------------------------

/**
 * Vì sao phép thử này dùng một `attempt_id` CÓ THẬT của người khác chứ không
 * phải một id bịa: id bịa vi phạm khoá ngoại, nên Postgres có thể trả 23503
 * trước khi kịp chạm tới RLS. Khi đó không phân biệt được "RLS chặn" với "FK
 * chặn" — và chỉ một trong hai chứng minh được điều đang cần chứng minh.
 */
async function testFeedbackLuotThiNguoiKhac() {
  if (!OTHER_ATTEMPT) {
    record(
      '1. Gửi góp ý vào lượt thi của người khác',
      'skip',
      'Không có `--other-attempt` và không có SUPABASE_SERVICE_KEY để tự tìm.',
      'Đây là phép thử quan trọng nhất của A19. Chưa chạy được thì CHƯA kết luận được.'
    )
    return
  }

  const res = await fetch(`${restBase}/question_feedbacks`, {
    method: 'POST',
    headers: { ...studentHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      question_id: 'rls-check-khong-ton-tai',
      attempt_id: OTHER_ATTEMPT,
      student_id: USER_ID,
      message: '[rls-check] phép thử tự động, không phải góp ý thật',
      status: 'pending',
    }),
  })

  if (res.status >= 400) {
    const err = await body(res)
    const rlsChan = err.code === INSUFFICIENT_PRIVILEGE
    record(
      '1. Gửi góp ý vào lượt thi của người khác',
      rlsChan ? 'pass' : 'fail',
      `HTTP ${res.status} (code ${err.code || '?'}) — ${err.message || ''}`,
      rlsChan
        ? 'RLS chặn, đúng ý đồ của question_feedbacks_student_insert.'
        : 'Bị chặn nhưng KHÔNG vì RLS (nhiều khả năng khoá ngoại question_id). Chưa chứng minh được gì — đổi question_id thành một id CÓ THẬT rồi chạy lại.'
    )
    return
  }

  record(
    '1. Gửi góp ý vào lượt thi của người khác',
    'fail',
    `HTTP ${res.status} — ghi được.`,
    'A19 CHƯA được đóng: học sinh gắn được góp ý vào lượt thi người khác.'
  )
}

async function testAntiCheatLuotThiNguoiKhac() {
  if (!OTHER_ATTEMPT) {
    record(
      '2. Ghi anti_cheat_logs vào lượt thi của người khác',
      'skip',
      'Không có `--other-attempt` và không có SUPABASE_SERVICE_KEY để tự tìm.',
      'Đây chính là A20. Chưa chạy được thì CHƯA kết luận được.'
    )
    return
  }

  const res = await fetch(`${restBase}/anti_cheat_logs`, {
    method: 'POST',
    headers: { ...studentHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      attempt_id: OTHER_ATTEMPT,
      event_type: 'tab_switch',
      severity: 'medium',
      details: { source: 'rls-check' },
    }),
  })

  if (res.status >= 400) {
    const err = await body(res)
    const rlsChan = err.code === INSUFFICIENT_PRIVILEGE
    record(
      '2. Ghi anti_cheat_logs vào lượt thi của người khác',
      rlsChan ? 'pass' : 'fail',
      `HTTP ${res.status} (code ${err.code || '?'}) — ${err.message || ''}`,
      rlsChan ? 'RLS chặn, đúng ý đồ của A20.' : 'Bị chặn nhưng không vì RLS — đọc message.'
    )
    return
  }

  record(
    '2. Ghi anti_cheat_logs vào lượt thi của người khác',
    'fail',
    `HTTP ${res.status} — ghi được.`,
    'A20 CHƯA được đóng: sổ theo dõi gian lận vẫn ai cũng viết vào được.'
  )
}

/** Học sinh chỉ được thấy góp ý của chính mình, không thấy của ai khác. */
async function testDocGopYNguoiKhac() {
  const res = await fetch(`${restBase}/question_feedbacks?select=id,student_id&limit=200`, {
    headers: studentHeaders,
  })

  if (!res.ok) {
    const err = await body(res)
    record(
      '3. Đọc question_feedbacks',
      'fail',
      `HTTP ${res.status} (code ${err.code || '?'}) — ${err.message || ''}`,
      'Học sinh phải đọc được góp ý CỦA MÌNH. Lỗi ở đây nghĩa là policy SELECT thiếu hoặc sai.'
    )
    return
  }

  const rows = await res.json()
  const cuaNguoiKhac = Array.isArray(rows) ? rows.filter((r) => r.student_id !== USER_ID) : []
  record(
    '3. Đọc question_feedbacks',
    cuaNguoiKhac.length === 0 ? 'pass' : 'fail',
    `Nhận ${Array.isArray(rows) ? rows.length : 0} dòng, trong đó ${cuaNguoiKhac.length} dòng KHÔNG phải của mình.`,
    cuaNguoiKhac.length === 0
      ? 'Chỉ thấy góp ý của chính mình.'
      : 'RLS đang TẮT hoặc policy SELECT sai — đây chính là nửa "rò rỉ" của A19.'
  )
}

/** Nhật ký chống gian lận không được để chính học sinh đọc. */
async function testDocAntiCheatCuaMinh() {
  const res = await fetch(`${restBase}/anti_cheat_logs?select=id&limit=5`, {
    headers: studentHeaders,
  })
  const rows = res.ok ? await res.json() : []
  const soDong = Array.isArray(rows) ? rows.length : 0
  record(
    '4. Học sinh đọc anti_cheat_logs',
    soDong === 0 ? 'pass' : 'fail',
    `HTTP ${res.status} — nhận ${soDong} dòng.`,
    soDong === 0
      ? 'Không đọc được, đúng như trước và sau migration.'
      : 'Học sinh thấy được hệ thống đếm gì về mình — biết đếm gì là biết cách né.'
  )
}

// ---------------------------------------------------------------------------
// Nhóm 2 — PHẢI CHO QUA (chỉ chạy với --write)
// ---------------------------------------------------------------------------

const rac = []

async function testGuiGopYChoLuotThiCuaMinh() {
  if (!WRITE) {
    record('5. Gửi góp ý cho lượt thi của MÌNH', 'skip', 'Cần --write (phép thử này ghi thật).')
    return
  }
  if (!MY_ATTEMPT) {
    record(
      '5. Gửi góp ý cho lượt thi của MÌNH',
      'skip',
      'Tài khoản này chưa có lượt thi nào.',
      'Cho học sinh test làm một đề rồi chạy lại — nếu không thì nhánh "cho qua" chưa được kiểm.'
    )
    return
  }

  // `question_id` phải CÓ THẬT, nếu không khoá ngoại chặn trước và phép thử vô
  // nghĩa. Lấy một câu của chính lượt thi này qua RPC mà học sinh vẫn dùng.
  const qRes = await fetch(`${restBase}/rpc/get_exam_attempt_questions`, {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify({ p_attempt_id: MY_ATTEMPT }),
  })
  const bundle = qRes.ok ? await qRes.json() : null
  const questionId = bundle?.questions?.[0]?.id

  if (!questionId) {
    record(
      '5. Gửi góp ý cho lượt thi của MÌNH',
      'skip',
      'Không lấy được câu hỏi nào của lượt thi này qua get_exam_attempt_questions.'
    )
    return
  }

  const res = await fetch(`${restBase}/question_feedbacks`, {
    method: 'POST',
    headers: { ...studentHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      question_id: questionId,
      attempt_id: MY_ATTEMPT,
      student_id: USER_ID,
      message: '[rls-check] phép thử tự động, xoá giúp dòng này',
      status: 'pending',
    }),
  })

  if (!res.ok) {
    const err = await body(res)
    record(
      '5. Gửi góp ý cho lượt thi của MÌNH',
      'fail',
      `HTTP ${res.status} (code ${err.code || '?'}) — ${err.message || ''}`,
      'Nhánh CHO QUA hỏng: học sinh không gửi được góp ý hợp lệ. Đây là triệu chứng A19 khi RLS bật mà thiếu policy.'
    )
    return
  }

  const rows = await res.json()
  const id = Array.isArray(rows) ? rows[0]?.id : undefined
  if (id) rac.push(`DELETE FROM public.question_feedbacks WHERE id = '${id}';`)
  record('5. Gửi góp ý cho lượt thi của MÌNH', 'pass', `HTTP ${res.status} — ghi được (id ${id || '?'}).`)
}

async function testGhiAntiCheatChoLuotThiCuaMinh() {
  if (!WRITE) {
    record('6. Ghi anti_cheat_logs cho lượt thi của MÌNH', 'skip', 'Cần --write (phép thử này ghi thật).')
    return
  }
  if (!MY_ATTEMPT) {
    record('6. Ghi anti_cheat_logs cho lượt thi của MÌNH', 'skip', 'Tài khoản này chưa có lượt thi nào.')
    return
  }

  const res = await fetch(`${restBase}/anti_cheat_logs`, {
    method: 'POST',
    headers: { ...studentHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      attempt_id: MY_ATTEMPT,
      event_type: 'tab_switch',
      severity: 'medium',
      details: { source: 'rls-check' },
    }),
  })

  if (!res.ok) {
    const err = await body(res)
    record(
      '6. Ghi anti_cheat_logs cho lượt thi của MÌNH',
      'fail',
      `HTTP ${res.status} (code ${err.code || '?'}) — ${err.message || ''}`,
      'Nhánh CHO QUA hỏng: `useExamAntiCheat` sẽ không ghi được gì, và sổ trống trông y hệt "không có gì xảy ra".'
    )
    return
  }

  rac.push(
    `DELETE FROM public.anti_cheat_logs WHERE attempt_id = '${MY_ATTEMPT}' AND details->>'source' = 'rls-check';`
  )
  record('6. Ghi anti_cheat_logs cho lượt thi của MÌNH', 'pass', `HTTP ${res.status} — ghi được.`)
}

// ---------------------------------------------------------------------------

await testFeedbackLuotThiNguoiKhac()
await testAntiCheatLuotThiNguoiKhac()
await testDocGopYNguoiKhac()
await testDocAntiCheatCuaMinh()
await testGuiGopYChoLuotThiCuaMinh()
await testGhiAntiCheatChoLuotThiCuaMinh()

const fail = results.filter((r) => r.state === 'fail').length
const skip = results.filter((r) => r.state === 'skip').length

console.log(`\nĐạt ${results.length - fail - skip}/${results.length}, không đạt ${fail}, bỏ qua ${skip}.`)

if (rac.length > 0) {
  console.log('\nDòng rác phép thử vừa tạo — chạy bằng service role để dọn:')
  for (const sql of rac) console.log(`  ${sql}`)
}

if (fail > 0) process.exit(1)
if (skip > 0) {
  console.log('\nCòn phép thử bị bỏ qua. BỎ QUA KHÔNG PHẢI LÀ ĐẠT.')
  process.exit(2)
}
process.exit(0)
