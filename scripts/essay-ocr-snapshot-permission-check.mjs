#!/usr/bin/env node
/**
 * Negative test quyền của `public.essay_ocr_snapshots` bằng service key thật.
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * Postflight `20260808` chỉ đọc `pg_class.relacl` và `has_table_privilege` —
 * nó chứng minh *cấu hình* đúng, không chứng minh *runtime* chặn. `AGENTS.md`
 * mục 8 đòi negative test thật. Đây là phần đó.
 *
 * VÌ SAO QUA PostgREST, KHÔNG QUA psql
 * Đường mà code thật đi là `admin.from('essay_ocr_snapshots')` trong
 * `src/app/api/essay-ai/ocr/route.ts` — tức Supabase JS client → PostgREST →
 * Postgres. PostgREST đọc claim `role` trong service key rồi `SET LOCAL ROLE
 * service_role` trước khi chạy câu lệnh, nên ACL của bảng có hiệu lực đúng như
 * trong psql. Test qua đây kiểm chính con đường production dùng.
 *
 * TUYỆT ĐỐI KHÔNG dùng Supabase SQL Editor để làm việc này: Editor chạy bằng
 * vai trò **sở hữu** bảng, và chủ sở hữu có đủ quyền bất chấp mọi REVOKE. Nó sẽ
 * cho phép UPDATE/DELETE và bạn kết luận migration thất bại — sai, một cách rất
 * thuyết phục.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/essay-ocr-snapshot-permission-check.mjs
 *
 * `--env-file` là cờ của Node: nó nạp .env vào process.env mà không cần script
 * (hay người đọc script) mở file đó ra.
 *
 * SCRIPT NÀY KHÔNG GHI DỮ LIỆU. Chi tiết ở comment của từng test — điểm mấu chốt
 * là mọi câu lệnh ghi đều được dựng để **không khớp dòng nào** hoặc **thất bại ở
 * ràng buộc khoá ngoại**, trong khi phép kiểm quyền của Postgres xảy ra TRƯỚC
 * lúc khớp dòng. Nhờ vậy phân biệt được "bị chặn quyền" với "được phép nhưng
 * không có gì để sửa" mà không chạm một dòng thật nào.
 *
 * KHÔNG TEST ĐƯỢC TRUNCATE. PostgREST không có động từ nào map sang TRUNCATE, và
 * đó chính là lý do quyền này nguy hiểm: nó xoá sạch bảng mà không cần DELETE,
 * lại không xuất hiện trên bề mặt REST nên dễ bị bỏ qua khi rà. Dòng
 * `service_role_thua_quyen_ghi` của postflight có kiểm TRUNCATE; script này xác
 * nhận phần runtime của UPDATE/DELETE.
 *
 * MÃ THOÁT: 0 nếu mọi test đạt, 1 nếu có bất kỳ test nào không đạt.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  console.error('Chạy kèm --env-file=.env:')
  console.error('  node --env-file=.env scripts/essay-ocr-snapshot-permission-check.mjs')
  process.exit(1)
}

const restBase = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`
const TABLE = 'essay_ocr_snapshots'

// UUID toàn số 0 — không thể là id thật (`gen_random_uuid()` không sinh ra nó).
// Dùng làm bộ lọc để mọi câu UPDATE/DELETE khớp 0 dòng.
const UUID_KHONG_TON_TAI = '00000000-0000-0000-0000-000000000000'

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

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

/** Đọc `code` của lỗi PostgREST; nó chuyển tiếp SQLSTATE của Postgres. */
async function docLoi(res) {
  const body = await res.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return { code: body.code, message: body.message, detail: body.details }
}

/** 42501 = insufficient_privilege. Đây là mã duy nhất chứng minh ACL chặn. */
const INSUFFICIENT_PRIVILEGE = '42501'
/** 23503 = foreign_key_violation. Nghĩa là đã qua kiểm quyền, chặn ở lớp FK. */
const FOREIGN_KEY_VIOLATION = '23503'

// ---------------------------------------------------------------------------
// Nhóm 1: các quyền PHẢI bị chặn
// ---------------------------------------------------------------------------

/**
 * Vì sao test này không ghi gì: bộ lọc `id=eq.<uuid toàn 0>` không khớp dòng nào.
 *
 * Vì sao nó vẫn phát hiện được quyền thừa: Postgres kiểm quyền trên bảng ở lúc
 * thực thi, TRƯỚC khi lọc dòng. `UPDATE t SET x=1 WHERE false` vẫn raise 42501
 * nếu thiếu quyền UPDATE. Nên:
 *   - 4xx + code 42501  → ACL chặn thật. ĐẠT.
 *   - 2xx (0 dòng)      → có quyền UPDATE, chỉ là không có gì để sửa. KHÔNG ĐẠT.
 */
async function testUpdateBiChan() {
  const res = await fetch(`${restBase}/${TABLE}?id=eq.${UUID_KHONG_TON_TAI}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ confidence: 0.99 }),
  })

  if (res.status >= 400) {
    const { code, message } = await docLoi(res)
    const dungMa = code === INSUFFICIENT_PRIVILEGE
    record(
      'A. service_role UPDATE bảng snapshot',
      dungMa,
      `HTTP ${res.status}${code ? ` (code ${code})` : ''} — ${message || 'không có message'}`,
      dungMa
        ? 'Bị chặn ở lớp quyền, đúng như 20260808 muốn.'
        : 'Bị chặn nhưng KHÔNG phải vì thiếu quyền. Chưa chứng minh được ACL đúng — đọc message trên.'
    )
    return
  }

  record(
    'A. service_role UPDATE bảng snapshot',
    false,
    `HTTP ${res.status} — câu UPDATE chạy được (khớp 0 dòng nên không dữ liệu nào đổi).`,
    'service_role VẪN CÓ quyền UPDATE. Nhật ký chất lượng OCR sửa được sau khi ghi — ' +
      'đúng lỗ hổng 20260808 phải đóng. Kiểm lại migration đã áp chưa.'
  )
}

/**
 * Cùng cách như test A. Lưu ý PostgREST **từ chối** DELETE không có bộ lọc (bảo
 * vệ khỏi xoá cả bảng do sơ suất), nên bộ lọc ở đây là bắt buộc về mặt kỹ thuật,
 * không chỉ để an toàn.
 */
async function testDeleteBiChan() {
  const res = await fetch(`${restBase}/${TABLE}?id=eq.${UUID_KHONG_TON_TAI}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })

  if (res.status >= 400) {
    const { code, message } = await docLoi(res)
    const dungMa = code === INSUFFICIENT_PRIVILEGE
    record(
      'B. service_role DELETE bảng snapshot',
      dungMa,
      `HTTP ${res.status}${code ? ` (code ${code})` : ''} — ${message || 'không có message'}`,
      dungMa
        ? 'Bị chặn ở lớp quyền, đúng như 20260808 muốn.'
        : 'Bị chặn nhưng KHÔNG phải vì thiếu quyền. Đọc message trên.'
    )
    return
  }

  record(
    'B. service_role DELETE bảng snapshot',
    false,
    `HTTP ${res.status} — câu DELETE chạy được (khớp 0 dòng nên không dữ liệu nào mất).`,
    'service_role VẪN CÓ quyền DELETE. Một script dọn dữ liệu chạy bằng service key ' +
      'xoá được sạch dấu vết chất lượng OCR. Kiểm lại migration đã áp chưa.'
  )
}

// ---------------------------------------------------------------------------
// Nhóm 2: các quyền PHẢI còn nguyên
// ---------------------------------------------------------------------------

/**
 * SELECT phải chạy được, nếu không `worker.ts` không đọc được snapshot và sẽ coi
 * mọi bài có ảnh là mất dấu vết → chặn auto-chốt toàn bộ. Fail-closed nên không
 * sai điểm, nhưng nghĩa là tính năng ngừng hoạt động im lặng.
 *
 * `head: true` + `count=exact`: chỉ lấy số đếm qua header, không tải dòng nào về.
 * Bảng này không chứa text bài làm, nhưng vẫn không có lý do gì để kéo dữ liệu
 * học sinh vào stdout của một script kiểm quyền.
 */
async function testSelectConChay() {
  const res = await fetch(`${restBase}/${TABLE}?select=id&limit=1`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact' },
  })

  if (res.ok) {
    const range = res.headers.get('content-range')
    const tong = range && range.includes('/') ? range.split('/')[1] : '?'
    record(
      'C. service_role SELECT bảng snapshot',
      true,
      `HTTP ${res.status} — đọc được. Bảng đang có ${tong} dòng.`,
      tong === '0'
        ? 'Bảng rỗng: bình thường nếu chưa ai chụp ảnh sau khi nạp 20260807.'
        : 'Worker đọc được snapshot để cấp dữ liệu cho cổng OCR.'
    )
    return
  }

  const { code, message } = await docLoi(res)
  record(
    'C. service_role SELECT bảng snapshot',
    false,
    `HTTP ${res.status}${code ? ` (code ${code})` : ''} — ${message || 'không có message'}`,
    'SIẾT QUÁ TAY: worker mất đường đọc snapshot → chặn auto-chốt mọi bài. ' +
      'Chạy supabase/rollback/20260808_essay_ocr_snapshots_lock_rollback.sql.'
  )
}

/**
 * INSERT phải chạy được, nếu không route OCR lỗi và học sinh mất chức năng chụp
 * ảnh bài làm.
 *
 * KHÔNG GHI DỮ LIỆU, và cách làm điều đó là phần đáng đọc của test này. Payload
 * dùng `attempt_id`/`question_id` không tồn tại, nên câu INSERT chắc chắn thất
 * bại ở ràng buộc khoá ngoại. Nhưng Postgres kiểm quyền TRƯỚC khi kiểm FK, nên
 * hai kết quả phân biệt được rõ ràng:
 *   - code 23503 (FK violation) → đã qua kiểm quyền. INSERT còn nguyên. ĐẠT.
 *   - code 42501 (no privilege) → chặn ngay ở quyền. INSERT đã mất. KHÔNG ĐẠT.
 *
 * Đây là lý do không dùng cách "insert rồi xoá đi": sau 20260808 thì service_role
 * KHÔNG CÒN quyền DELETE, nên một dòng rác chèn vào sẽ nằm lại vĩnh viễn trong
 * bảng nhật ký — chính tính bất biến mà migration tạo ra khiến cách đó không
 * dùng được.
 */
async function testInsertConChay() {
  const res = await fetch(`${restBase}/${TABLE}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      attempt_id: `permission-check-khong-ton-tai-${UUID_KHONG_TON_TAI}`,
      question_id: `permission-check-khong-ton-tai-${UUID_KHONG_TON_TAI}`,
      provider: 'permission-check',
      model: 'permission-check',
      confidence: 0.5,
      text_hash: 'permission-check',
      text_length: 0,
    }),
  })

  if (res.ok) {
    record(
      'D. service_role INSERT bảng snapshot',
      false,
      `HTTP ${res.status} — INSERT THÀNH CÔNG, nhưng lẽ ra phải thất bại ở khoá ngoại.`,
      'NGHIÊM TRỌNG THEO CÁCH KHÁC: hai FK tới exam_attempts/questions không còn hiệu lực. ' +
        'Bảng đang nhận được dòng trỏ tới attempt không tồn tại. Có một dòng rác vừa được ' +
        `ghi vào (attempt_id bắt đầu bằng "permission-check-") và service_role không có ` +
        'quyền DELETE để dọn — phải xoá bằng Supabase SQL Editor. Kiểm lại 20260807.'
    )
    return
  }

  const { code, message } = await docLoi(res)

  if (code === FOREIGN_KEY_VIOLATION) {
    record(
      'D. service_role INSERT bảng snapshot',
      true,
      `HTTP ${res.status} (code ${code}) — thất bại ở khoá ngoại, KHÔNG phải ở quyền.`,
      'Đúng như mong đợi: quyền INSERT còn nguyên (đã qua kiểm quyền mới tới FK), ' +
        'và không dòng nào được ghi. Route OCR vẫn ghi được snapshot thật.'
    )
    return
  }

  if (code === INSUFFICIENT_PRIVILEGE) {
    record(
      'D. service_role INSERT bảng snapshot',
      false,
      `HTTP ${res.status} (code ${code}) — bị chặn ở lớp quyền.`,
      'SIẾT QUÁ TAY: route /api/essay-ai/ocr sẽ lỗi khi ghi snapshot, học sinh mất ' +
        'chức năng chụp ảnh bài làm. Chạy ' +
        'supabase/rollback/20260808_essay_ocr_snapshots_lock_rollback.sql.'
    )
    return
  }

  record(
    'D. service_role INSERT bảng snapshot',
    false,
    `HTTP ${res.status}${code ? ` (code ${code})` : ''} — ${message || 'không có message'}`,
    'Lỗi không thuộc hai trường hợp đã lường (42501 thiếu quyền / 23503 khoá ngoại). ' +
      'Đọc message trên; có thể schema đã đổi so với 20260807.'
  )
}

// ---------------------------------------------------------------------------
// Nhóm 3: client không được chạm bảng
// ---------------------------------------------------------------------------

/**
 * Kiểm bằng anon key, không cần đăng nhập. Lỗ hổng này nghiêm trọng hơn hẳn cái
 * 20260808 đang sửa: học sinh đọc được bảng là biết bài mình có bị gắn cờ chất
 * lượng thấp hay không, từ đó suy ra bài sẽ được xử lý thế nào.
 *
 * Hai kết quả đều ĐẠT vì chúng chặn ở hai lớp khác nhau:
 *   - 4xx (42501)        → GRANT đã thu hồi. Lớp quyền.
 *   - 200 + mảng rỗng    → RLS bật, không policy nào khớp. Lớp hàng.
 * Chỉ 200 kèm ít nhất một dòng là không đạt.
 */
async function testAnonBiChan() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) {
    record(
      'E. anon đọc bảng snapshot',
      false,
      'Không có NEXT_PUBLIC_SUPABASE_ANON_KEY để kiểm.',
      'Test này bỏ qua, không phải đạt. Thêm biến vào .env rồi chạy lại.'
    )
    return
  }

  const res = await fetch(`${restBase}/${TABLE}?select=id&limit=5`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  const body = await res.json().catch(() => null)

  if (res.status >= 400) {
    const code = body && typeof body === 'object' ? body.code : null
    record(
      'E. anon đọc bảng snapshot',
      true,
      `HTTP ${res.status}${code ? ` (code ${code})` : ''} — bị chặn ở lớp quyền.`,
      'Quyền SELECT đã thu hồi khỏi anon.'
    )
    return
  }

  if (Array.isArray(body) && body.length === 0) {
    record(
      'E. anon đọc bảng snapshot',
      true,
      'HTTP 200 nhưng 0 dòng — RLS bật, không policy nào khớp.',
      'Đạt, nhưng chặn ở lớp RLS chứ không phải lớp GRANT. Postflight kiểm cả hai lớp.'
    )
    return
  }

  record(
    'E. anon đọc bảng snapshot',
    false,
    `HTTP ${res.status} trả về ${Array.isArray(body) ? body.length : '?'} dòng.`,
    'NGHIÊM TRỌNG: người chưa đăng nhập đọc được cờ chất lượng OCR của bài học sinh.'
  )
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------

console.log('\n\x1b[1mNegative test quyền essay_ocr_snapshots\x1b[0m')
console.log(`Supabase: ${SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]}…`)
console.log('\x1b[2mScript không ghi dữ liệu: mọi câu ghi đều khớp 0 dòng hoặc thất bại ở khoá ngoại.\x1b[0m\n')

console.log('\x1b[1m— Phải bị chặn (20260808) —\x1b[0m')
await testUpdateBiChan()
await testDeleteBiChan()

console.log('\n\x1b[1m— Phải còn nguyên —\x1b[0m')
await testSelectConChay()
await testInsertConChay()

console.log('\n\x1b[1m— Client không được chạm —\x1b[0m')
await testAnonBiChan()

// ---------------------------------------------------------------------------
// Tổng kết
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.passed)

console.log(`\n\x1b[1m— Tổng kết —\x1b[0m`)
console.log(`${results.length - failed.length}/${results.length} test đạt.`)

if (failed.length > 0) {
  console.log('\n\x1b[31mKhông đạt:\x1b[0m')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  process.exit(1)
}

console.log(
  '\n\x1b[2mCòn hai thứ script này KHÔNG chứng minh được:\n' +
    '  - TRUNCATE: PostgREST không có động từ nào map sang nó. Dòng\n' +
    '    service_role_thua_quyen_ghi của postflight 20260808 có kiểm ở lớp catalog.\n' +
    '  - Luồng OCR đầu-cuối: test D dùng FK không tồn tại nên không ghi dòng thật.\n' +
    '    Chụp một ảnh bài làm bằng tài khoản học sinh rồi kiểm bảng có dòng mới\n' +
    '    (bước 6 mục 20260808 trong docs/RUNBOOK.md).\x1b[0m'
)
process.exit(0)
