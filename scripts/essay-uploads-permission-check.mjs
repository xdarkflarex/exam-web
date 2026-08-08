#!/usr/bin/env node
/**
 * Negative test quyền của `public.essay_answer_uploads` bằng JWT học sinh thật.
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * Postflight `20260809` đọc `pg_policies` và `has_table_privilege` — nó chứng
 * minh *cấu hình* đúng, không chứng minh *runtime* chặn. Với bảng này khoảng cách
 * đó lớn hơn hẳn so với `essay_ocr_snapshots`: bảng kia dùng mẫu "RLS bật, không
 * policy nào" nên chỉ cần đếm policy là xong, còn bảng này có policy THẬT và
 * policy là thứ duy nhất chặn học sinh A đọc ảnh của học sinh B. Một lỗi đánh máy
 * trong vế `USING` vẫn hiện ra đầy đủ trong `pg_policies` mà cấp quyền cho sai
 * người, và `tsc`/`eslint`/`npm test`/`npm run build` đều không thấy gì.
 *
 * VÌ SAO CẦN HAI TÀI KHOẢN
 * "A không đọc được ảnh của B" là bất biến quan trọng nhất ở đây, và không có
 * cách nào kiểm nó bằng một tài khoản. Một tài khoản chỉ kiểm được "tôi đọc được
 * ảnh của tôi" — điều đó đúng kể cả khi policy cho phép đọc tất cả mọi người.
 *
 * TUYỆT ĐỐI KHÔNG dùng Supabase SQL Editor để làm việc này. Editor chạy bằng vai
 * trò **sở hữu** bảng: `auth.uid()` trả NULL và `FORCE ROW LEVEL SECURITY` không
 * áp cho chủ sở hữu, nên mọi policy sẽ trông như bị bỏ qua và bạn sẽ kết luận
 * migration thất bại — sai, một cách rất thuyết phục.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/essay-uploads-permission-check.mjs \
 *     --email-a hocsinh1@example.com --password-a <mk1> \
 *     --email-b hocsinh2@example.com --password-b <mk2>
 *
 * Mật khẩu truyền qua tham số, không hard-code và không đọc từ file, nên không bị
 * commit. `--env-file` là cờ của Node: nó nạp .env vào process.env mà không cần
 * script (hay người đọc script) mở file đó ra.
 *
 * ĐIỀU KIỆN: mỗi tài khoản cần MỘT attempt đang `in_progress`. Script tự tìm và
 * báo rõ nếu thiếu, thay vì đổ ở giữa với lỗi khó hiểu.
 *
 * SCRIPT NÀY GẦN NHƯ KHÔNG GHI DỮ LIỆU. Mọi câu ghi đều được dựng để bị chặn
 * TRƯỚC khi có dòng nào nằm lại: hoặc trigger raise, hoặc RLS từ chối, hoặc bộ
 * lọc khớp 0 dòng. Ngoại lệ duy nhất là test E — nếu nó KHÔNG ĐẠT thì đúng lúc đó
 * có một dòng rác nằm lại, và script in ra câu SQL dọn. Đọc phần đầu test E.
 *
 * `essay_answer_uploads` không grant DELETE cho role nào (`20260809` mục 6), nên
 * không dùng được cách "chèn thử rồi xoá" — dòng rác sẽ nằm lại vĩnh viễn.
 *
 * MÃ THOÁT: 0 nếu mọi test đạt, 1 nếu có bất kỳ test nào không đạt.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const args = process.argv.slice(2)

function arg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

const emailA = arg('email-a')
const passwordA = arg('password-a')
const emailB = arg('email-b')
const passwordB = arg('password-b')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY hoặc SUPABASE_SERVICE_KEY.')
  console.error('Chạy kèm --env-file=.env.')
  process.exit(1)
}

if (!emailA || !passwordA || !emailB || !passwordB) {
  console.error('Thiếu thông tin đăng nhập của hai tài khoản học sinh.\n')
  console.error('  node --env-file=.env scripts/essay-uploads-permission-check.mjs \\')
  console.error('    --email-a hs1@example.com --password-a <mk1> \\')
  console.error('    --email-b hs2@example.com --password-b <mk2>\n')
  console.error('Hai tài khoản phải khác nhau, và mỗi tài khoản cần một attempt đang in_progress.')
  process.exit(1)
}

if (emailA.trim().toLowerCase() === emailB.trim().toLowerCase()) {
  console.error('Hai tài khoản trùng nhau. Bất biến chính của script là "A không đọc được')
  console.error('ảnh của B" — cùng một người thì không kiểm được gì.')
  process.exit(1)
}

const authBase = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`
const restBase = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`
const TABLE = 'essay_answer_uploads'

/** UUID toàn số 0 — `gen_random_uuid()` không sinh ra nó. Bộ lọc khớp 0 dòng. */
const UUID_KHONG_TON_TAI = '00000000-0000-0000-0000-000000000000'

/** Dấu nhận biết dòng rác của test E, nếu test đó không đạt. */
const HASH_DAU_VET = 'permissioncheck'.padEnd(64, '0')
const PAGE_DAU_VET = 9999

/** 42501 = insufficient_privilege: ACL hoặc RLS chặn. */
const INSUFFICIENT_PRIVILEGE = '42501'
/** P0001 = raise_exception: trigger của migration chặn. */
const RAISE_EXCEPTION = 'P0001'

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

/** Bỏ qua KHÔNG phải đạt: nó vào tổng kết như một việc chưa kiểm. */
function skip(name, detail, note) {
  results.push({ name, passed: false, skipped: true, detail, note })
  console.log(`\x1b[33m~ BỎ QUA\x1b[0m  ${name}`)
  console.log(`        ${detail}`)
  if (note) console.log(`        \x1b[2m${note}\x1b[0m`)
}

async function docLoi(res) {
  const body = await res.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return { code: body.code, message: body.message ?? '', detail: body.details ?? '' }
}

// ---------------------------------------------------------------------------
// Đăng nhập và chuẩn bị dữ liệu
// ---------------------------------------------------------------------------

async function signIn(email, password, label) {
  const res = await fetch(`${authBase}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    console.error(`\nKhông đăng nhập được tài khoản ${label} (HTTP ${res.status}).`)
    console.error(`Lý do: ${body.error_description || body.msg || body.error || 'không rõ'}`)
    process.exit(1)
  }
  return { token: body.access_token, userId: body.user?.id }
}

function studentHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Tìm attempt và một question_id hợp lệ bằng service key.
 *
 * Dùng service key CHỈ cho bước tra cứu chuẩn bị này, không cho bất kỳ test nào.
 * Lý do: các test phải đi đúng con đường production (JWT học sinh → PostgREST),
 * còn việc "attempt nào đang mở" là dữ kiện môi trường — tra bằng quyền học sinh
 * sẽ làm script thất bại vì RLS của bảng khác, không phải vì bảng đang test.
 *
 * `question_id` cần THẬT vì test E đi tới lớp RLS, và nếu FK sai thì Postgres có
 * thể chặn ở FK trước, cho ra mã lỗi khác và làm test nói sai nguyên nhân.
 */
async function chuanBi() {
  const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  const attemptRes = await fetch(
    `${restBase}/exam_attempts?select=id,student_id,status&order=start_time.desc&limit=500`,
    { headers: svc }
  )
  const attempts = await attemptRes.json().catch(() => null)
  if (!attemptRes.ok || !Array.isArray(attempts)) {
    const err = await docLoi(attemptRes).catch(() => ({}))
    console.error('\nKhông đọc được exam_attempts bằng service key.')
    console.error(`HTTP ${attemptRes.status}${err.code ? ` (code ${err.code})` : ''} — ${err.message || 'không rõ nguyên nhân'}`)
    console.error('Kiểm SUPABASE_SERVICE_KEY, hoặc schema exam_attempts đã đổi tên cột.')
    process.exit(1)
  }

  const qRes = await fetch(`${restBase}/questions?select=id&limit=1`, { headers: svc })
  const questions = await qRes.json().catch(() => null)
  if (!qRes.ok || !Array.isArray(questions) || questions.length === 0) {
    console.error('\nKhông tìm được question_id nào. Database chưa có câu hỏi?')
    process.exit(1)
  }

  return { attempts, questionId: questions[0].id }
}

function timAttempt(attempts, userId, status) {
  return attempts.find((a) => a.student_id === userId && a.status === status) ?? null
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

console.log('\n\x1b[1mNegative test quyền essay_answer_uploads (20260809)\x1b[0m')
console.log(`Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]}…`)
console.log('\x1b[2mHai tài khoản học sinh thật. Không dùng SQL Editor cho việc này —\x1b[0m')
console.log('\x1b[2mEditor chạy bằng vai trò sở hữu nên mọi policy trông như bị bỏ qua.\x1b[0m\n')

const A = await signIn(emailA, passwordA, 'A')
const B = await signIn(emailB, passwordB, 'B')

if (A.userId === B.userId) {
  console.error('Hai email khác nhau nhưng cùng một user id. Kiểm lại tài khoản.')
  process.exit(1)
}

const { attempts, questionId } = await chuanBi()

const attemptA = timAttempt(attempts, A.userId, 'in_progress')
const attemptB = timAttempt(attempts, B.userId, 'in_progress')
const attemptASubmitted = timAttempt(attempts, A.userId, 'submitted')

if (!attemptA || !attemptB) {
  console.error('\n\x1b[31mThiếu điều kiện chạy.\x1b[0m')
  if (!attemptA) console.error(`  Tài khoản A (${emailA}) không có attempt nào đang in_progress.`)
  if (!attemptB) console.error(`  Tài khoản B (${emailB}) không có attempt nào đang in_progress.`)
  console.error('\nMở một đề bằng mỗi tài khoản (bắt đầu làm, đừng nộp), rồi chạy lại.')
  console.error('Đây không phải test không đạt — chưa test được gì cả.')
  process.exit(1)
}

console.log(`A: attempt ${attemptA.id}`)
console.log(`B: attempt ${attemptB.id}\n`)

// ---------------------------------------------------------------------------
// Nhóm 1: đọc
// ---------------------------------------------------------------------------

console.log('\x1b[1m— Đọc —\x1b[0m')

{
  // A đọc ảnh của chính mình. 0 dòng vẫn là ĐẠT: điều cần chứng minh là truy vấn
  // KHÔNG bị lỗi quyền, không phải là đã có ảnh.
  const res = await fetch(
    `${restBase}/${TABLE}?select=id,page_index&attempt_id=eq.${encodeURIComponent(attemptA.id)}`,
    { headers: studentHeaders(A.token) }
  )
  const body = await res.json().catch(() => null)

  if (res.ok && Array.isArray(body)) {
    record(
      'A. A đọc ảnh của chính mình',
      true,
      `HTTP 200 — đọc được, ${body.length} dòng.`,
      '0 dòng vẫn đạt: cần chứng minh không bị chặn quyền, không phải đã có ảnh.'
    )
  } else {
    const err = await docLoi(res)
    record(
      'A. A đọc ảnh của chính mình',
      false,
      `HTTP ${res.status} (code ${err.code ?? '?'}) — ${err.message}`,
      'Học sinh không xem lại được ảnh của mình. Policy student_select sai.'
    )
  }
}

{
  // BẤT BIẾN QUAN TRỌNG NHẤT CỦA CẢ SCRIPT.
  const res = await fetch(
    `${restBase}/${TABLE}?select=id,student_id&attempt_id=eq.${encodeURIComponent(attemptB.id)}`,
    { headers: studentHeaders(A.token) }
  )
  const body = await res.json().catch(() => null)

  if (res.status >= 400) {
    const err = await docLoi(res)
    record(
      'B. A đọc ảnh của học sinh B',
      true,
      `HTTP ${res.status} (code ${err.code ?? '?'}) — bị chặn.`,
      'Chặn ở lớp quyền thay vì lớp hàng; vẫn đạt.'
    )
  } else if (Array.isArray(body) && body.length === 0) {
    record(
      'B. A đọc ảnh của học sinh B',
      true,
      'HTTP 200 nhưng 0 dòng — RLS lọc hết.',
      'Đây là hành vi mong đợi: policy student_select chỉ khớp student_id = auth.uid().'
    )
  } else {
    record(
      'B. A đọc ảnh của học sinh B',
      false,
      `HTTP ${res.status} trả về ${Array.isArray(body) ? body.length : '?'} dòng.`,
      'NGHIÊM TRỌNG: học sinh đọc được đường dẫn ảnh bài làm của học sinh khác.'
    )
  }
}

// ---------------------------------------------------------------------------
// Nhóm 2: ghi — phải bị chặn
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m— Ghi phải bị chặn —\x1b[0m')

{
  // Đường dẫn sai cố ý. Trigger raise TRƯỚC khi có dòng nào nằm lại, nên test này
  // chứng minh hai việc cùng lúc: A ĐƯỢC PHÉP ghi vào attempt của mình (qua được
  // GRANT và RLS), và trigger đang canh đường dẫn.
  const id = crypto.randomUUID()
  const res = await fetch(`${restBase}/${TABLE}`, {
    method: 'POST',
    headers: studentHeaders(A.token),
    body: JSON.stringify({
      id,
      attempt_id: attemptA.id,
      question_id: questionId,
      student_id: A.userId,
      storage_path: `sai/duong/dan/${id}`,
      mime_type: 'image/jpeg',
      byte_size: 1234,
      content_hash: HASH_DAU_VET,
      page_index: PAGE_DAU_VET,
      status: 'pending',
    }),
  })
  const err = await docLoi(res)
  const khop = err.code === RAISE_EXCEPTION && /UPLOAD_PATH_MISMATCH/.test(err.message + err.detail)

  record(
    'C. A ghi vào attempt của mình với storage_path sai',
    khop,
    khop
      ? `HTTP ${res.status} (${err.code}) — UPLOAD_PATH_MISMATCH.`
      : `HTTP ${res.status} (code ${err.code ?? 'không lỗi'}) — ${err.message || 'ghi thành công?'}`,
    khop
      ? 'Trigger canh đường dẫn, và A qua được GRANT + RLS cho attempt của mình. Không dòng nào nằm lại.'
      : 'Policy storage đọc attempt_id TỪ đường dẫn, nên đường dẫn không khớp là đường vòng qua kiểm quyền.'
  )
}

{
  // attempt của B nhưng khai student_id của A. Trigger BEFORE chạy trước khi RLS
  // WITH CHECK được đánh giá, nên chặn ở UPLOAD_OWNER_MISMATCH.
  const id = crypto.randomUUID()
  const res = await fetch(`${restBase}/${TABLE}`, {
    method: 'POST',
    headers: studentHeaders(A.token),
    body: JSON.stringify({
      id,
      attempt_id: attemptB.id,
      question_id: questionId,
      student_id: A.userId,
      storage_path: `${attemptB.id}/${questionId}/${id}`,
      mime_type: 'image/jpeg',
      byte_size: 1234,
      content_hash: HASH_DAU_VET,
      page_index: PAGE_DAU_VET,
      status: 'pending',
    }),
  })
  const err = await docLoi(res)
  const khop =
    res.status >= 400 &&
    (/UPLOAD_OWNER_MISMATCH/.test(err.message + err.detail) ||
      err.code === INSUFFICIENT_PRIVILEGE)

  record(
    'D. A ghi ảnh vào attempt của B (khai student_id của A)',
    khop,
    khop
      ? `HTTP ${res.status} (${err.code}) — ${/OWNER_MISMATCH/.test(err.message) ? 'UPLOAD_OWNER_MISMATCH' : 'RLS từ chối'}.`
      : `HTTP ${res.status} — ${err.message || 'ghi thành công?'}`,
    khop
      ? 'Chặn trước khi có dòng nào nằm lại.'
      : 'NGHIÊM TRỌNG: học sinh gắn được ảnh vào bài của người khác.'
  )
}

{
  // TEST DUY NHẤT CÓ THỂ ĐỂ LẠI DÒNG RÁC, và chỉ khi nó KHÔNG ĐẠT.
  //
  // Ở đây mọi thứ được dựng để hợp lệ với TRIGGER: attempt của B, student_id của
  // B, đường dẫn khớp. Vậy lớp duy nhất còn lại để chặn là RLS `WITH CHECK
  // (student_id = auth.uid())` — và auth.uid() là A. Nếu RLS đúng thì 42501 và
  // không có gì nằm lại. Nếu RLS sai thì một dòng của B do A tạo sẽ nằm lại, và
  // đúng lúc đó dòng rác là vấn đề nhỏ hơn nhiều so với lỗ hổng vừa phát hiện.
  //
  // `page_index = 9999` và `content_hash` có dấu để câu SQL dọn không thể xoá lầm
  // dữ liệu thật.
  const id = crypto.randomUUID()
  const res = await fetch(`${restBase}/${TABLE}`, {
    method: 'POST',
    headers: { ...studentHeaders(A.token), Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      attempt_id: attemptB.id,
      question_id: questionId,
      student_id: B.userId,
      storage_path: `${attemptB.id}/${questionId}/${id}`,
      mime_type: 'image/jpeg',
      byte_size: 1234,
      content_hash: HASH_DAU_VET,
      page_index: PAGE_DAU_VET,
      status: 'pending',
    }),
  })
  const err = await docLoi(res)
  const khop = err.code === INSUFFICIENT_PRIVILEGE || res.status === 403

  record(
    'E. A ghi ảnh mạo danh B (chỉ RLS chặn được)',
    khop,
    khop
      ? `HTTP ${res.status} (${err.code}) — RLS WITH CHECK từ chối.`
      : `HTTP ${res.status} — GHI ĐƯỢC. Dòng id=${id} đã nằm trong bảng.`,
    khop
      ? 'Đây là test đo đúng lớp RLS: trigger đã cho qua, chỉ policy chặn.'
      : `NGHIÊM TRỌNG: dọn ngay bằng kết nối chủ sở hữu:\n        ` +
        `DELETE FROM public.essay_answer_uploads WHERE id = '${id}';`
  )
}

{
  // Không role nào được grant DELETE. Bộ lọc là uuid không tồn tại nên kể cả nếu
  // quyền có bị nới thì cũng khớp 0 dòng — Postgres kiểm quyền TRƯỚC khi khớp dòng.
  const res = await fetch(`${restBase}/${TABLE}?id=eq.${UUID_KHONG_TON_TAI}`, {
    method: 'DELETE',
    headers: studentHeaders(A.token),
  })
  const err = await docLoi(res)
  const khop = res.status >= 400 && err.code === INSUFFICIENT_PRIVILEGE

  record(
    'F. A xoá cứng một dòng',
    khop,
    khop
      ? `HTTP ${res.status} (${err.code}) — permission denied.`
      : `HTTP ${res.status} (code ${err.code ?? 'không lỗi'}) — không bị chặn ở lớp quyền.`,
    khop
      ? 'Bảng chỉ xoá mềm; không role nào có DELETE (20260809 mục 6).'
      : 'Xoá cứng phá dấu vết "đã chụp rồi bỏ" và bằng chứng chấm điểm.'
  )
}

// ---------------------------------------------------------------------------
// Nhóm 3: điểm đóng băng
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m— Điểm đóng băng (sau khi nộp) —\x1b[0m')

if (!attemptASubmitted) {
  skip(
    'G. A thêm ảnh vào bài đã nộp',
    `Tài khoản A (${emailA}) không có attempt nào ở trạng thái submitted.`,
    'Nộp một bài bằng tài khoản A rồi chạy lại. Đây là việc CHƯA kiểm, không phải đạt.'
  )
} else {
  const id = crypto.randomUUID()
  const res = await fetch(`${restBase}/${TABLE}`, {
    method: 'POST',
    headers: studentHeaders(A.token),
    body: JSON.stringify({
      id,
      attempt_id: attemptASubmitted.id,
      question_id: questionId,
      student_id: A.userId,
      storage_path: `${attemptASubmitted.id}/${questionId}/${id}`,
      mime_type: 'image/jpeg',
      byte_size: 1234,
      content_hash: HASH_DAU_VET,
      page_index: PAGE_DAU_VET,
      status: 'pending',
    }),
  })
  const err = await docLoi(res)
  const khop =
    res.status >= 400 &&
    (/ATTEMPT_NOT_ACTIVE/.test(err.message + err.detail) || err.code === INSUFFICIENT_PRIVILEGE)

  record(
    'G. A thêm ảnh vào bài đã nộp',
    khop,
    khop
      ? `HTTP ${res.status} (${err.code}) — ${/NOT_ACTIVE/.test(err.message) ? 'ATTEMPT_NOT_ACTIVE' : 'RLS từ chối'}.`
      : `HTTP ${res.status} — GHI ĐƯỢC vào bài đã nộp. Dòng id=${id}.`,
    khop
      ? 'Điểm đóng băng có hiệu lực: sau khi nộp, ảnh chỉ được xem.'
      : `NGHIÊM TRỌNG: bổ sung được bằng chứng vào bài đã chấm. Dọn:\n        ` +
        `DELETE FROM public.essay_answer_uploads WHERE id = '${id}';`
  )
}

// ---------------------------------------------------------------------------
// Nhóm 4: chưa đăng nhập
// ---------------------------------------------------------------------------

console.log('\n\x1b[1m— Chưa đăng nhập —\x1b[0m')

{
  const res = await fetch(`${restBase}/${TABLE}?select=id&limit=5`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  const body = await res.json().catch(() => null)

  if (res.status >= 400) {
    const code = body && typeof body === 'object' ? body.code : null
    record(
      'H. anon đọc bảng ảnh',
      true,
      `HTTP ${res.status}${code ? ` (code ${code})` : ''} — bị chặn ở lớp quyền.`,
      'Quyền đã thu hồi khỏi anon (20260809 mục 6).'
    )
  } else if (Array.isArray(body) && body.length === 0) {
    record(
      'H. anon đọc bảng ảnh',
      true,
      'HTTP 200 nhưng 0 dòng — không policy nào khớp anon.',
      'Đạt, nhưng chặn ở lớp RLS chứ không phải lớp GRANT. Postflight kiểm cả hai.'
    )
  } else {
    record(
      'H. anon đọc bảng ảnh',
      false,
      `HTTP ${res.status} trả về ${Array.isArray(body) ? body.length : '?'} dòng.`,
      'NGHIÊM TRỌNG: người chưa đăng nhập đọc được đường dẫn ảnh bài làm.'
    )
  }
}

// ---------------------------------------------------------------------------
// Tổng kết
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.passed && !r.skipped)
const skipped = results.filter((r) => r.skipped)

console.log(`\n\x1b[1m— Tổng kết —\x1b[0m`)
console.log(`${results.length - failed.length - skipped.length}/${results.length} test đạt.`)
if (skipped.length > 0) console.log(`${skipped.length} test bỏ qua vì thiếu dữ liệu.`)

if (failed.length > 0) {
  console.log('\n\x1b[31mKhông đạt:\x1b[0m')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exit(1)
}

if (skipped.length > 0) {
  console.log('\n\x1b[33mBỏ qua (chưa kiểm, không phải đạt):\x1b[0m')
  for (const s of skipped) console.log(`  - ${s.name}`)
}

console.log(
  '\n\x1b[2mCòn hai thứ script này KHÔNG chứng minh được:\n' +
    '  - Policy trên storage.objects. Script kiểm bảng metadata; quyền đọc TỆP đi\n' +
    '    qua signed URL nên phải thử bằng tay: mở /result của A rồi thử dán URL ảnh\n' +
    '    của A vào tab đăng nhập bằng B.\n' +
    '  - Luồng đầu-cuối. Chụp một ảnh thật bằng tài khoản học sinh, xoá được trong\n' +
    '    giờ thi, nộp bài, rồi xác nhận ảnh còn xem được mà không xoá được nữa.\x1b[0m'
)
process.exit(0)
