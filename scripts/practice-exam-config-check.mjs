#!/usr/bin/env node
/**
 * Hậu kiểm cho `20260905_practice_exams_no_timer.sql` và
 * `20260906_practice_exams_unlimited_attempts.sql`.
 *
 * VÌ SAO CẦN SCRIPT NÀY
 * Hai migration đó là thay đổi DỮ LIỆU, không phải thay đổi cấu trúc. Không có
 * hàm mới để `to_regprocedure` hỏi, không có cột mới để `information_schema` đếm
 * — cách duy nhất biết chúng đã chạy là NHÌN VÀO SỐ LIỆU. Chạy tay trong SQL
 * Editor thì được, nhưng phải nhớ bốn truy vấn và tự đối chiếu; script này chạy
 * cả bốn rồi nói đạt hay không.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/practice-exam-config-check.mjs
 *
 * `--env-file` là cờ của Node: nó nạp .env vào process.env mà không cần script
 * (hay người đọc script) mở file đó ra.
 *
 * BẢO MẬT
 * - Script CHỈ ĐỌC. Không insert, update, delete gì.
 * - Không in service key, URL đầy đủ, hay bất kỳ định danh học sinh nào.
 * - Chỉ đọc bảng `exams`, không chạm dữ liệu bài làm.
 *
 * MÃ THOÁT: 0 nếu mọi phép kiểm đạt, 1 nếu có bất kỳ phép kiểm nào không đạt.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  console.error('Chạy bằng: node --env-file=.env scripts/practice-exam-config-check.mjs')
  process.exit(1)
}

/* PostgREST mặc định trả tối đa 1000 dòng và KHÔNG báo là đã cắt. Đọc theo
   trang để một ngân hàng đề lớn hơn 1000 không âm thầm biến thành "mọi phép
   kiểm đều đạt" — đúng kiểu kết luận sai nguy hiểm nhất mà một script hậu kiểm
   có thể đưa ra. */
const PAGE = 500

async function fetchAllExams() {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/exams`
        + `?select=id,title,exam_mode,duration,max_attempts,is_published`
        + `&order=id.asc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + PAGE - 1}`,
        },
      }
    )
    if (!res.ok) {
      throw new Error(`PostgREST ${res.status}: ${await res.text()}`)
    }
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** `NULL` được coi như giá trị mặc định của cột, giống `COALESCE` trong postflight. */
const num = (value, fallback) => (value === null || value === undefined ? fallback : value)

const exams = await fetchAllExams()
const practice = exams.filter(e => e.exam_mode === 'practice')
const simulation = exams.filter(e => e.exam_mode === 'simulation')

const checks = [
  {
    name: 'Đề ôn tập không còn đồng hồ đếm ngược',
    migration: '20260905',
    bad: practice.filter(e => num(e.duration, 0) !== 0),
    why: 'Đề ôn tập còn `duration` khác 0 — học sinh vẫn bị đếm ngược.',
  },
  {
    name: 'Đề ôn tập làm lại không giới hạn',
    migration: '20260906',
    bad: practice.filter(e => num(e.max_attempts, 1) !== 0),
    why: 'Đề ôn tập còn giới hạn lượt — học sinh hết lượt là không luyện lại được.',
  },
  {
    /* Chốt theo hướng NGƯỢC lại. Một migration chạy sai phạm vi sẽ làm phép
       kiểm xuôi đạt rực rỡ trong khi vừa phá đề thi thật. */
    name: 'Đề thi đã xuất bản vẫn còn đồng hồ',
    migration: '20260905 (chốt ngược)',
    bad: simulation.filter(e => e.is_published && num(e.duration, 0) === 0),
    why: 'Đề thi đã xuất bản mà mất giờ là mất luôn phép chặn nộp muộn phía server.',
  },
  {
    name: 'Đề thi vẫn còn giới hạn lượt',
    migration: '20260906 (chốt ngược)',
    bad: simulation.filter(e => num(e.max_attempts, 1) === 0),
    why: 'Đề thi cho làm lại vô hạn là hỏng cả việc chấm.',
  },
]

console.log(`Đã đọc ${exams.length} đề: ${practice.length} ôn tập, ${simulation.length} thi.`)
console.log('')

let failed = 0
for (const check of checks) {
  const ok = check.bad.length === 0
  if (!ok) failed++
  console.log(`${ok ? 'ĐẠT ' : 'HỎNG'}  [${check.migration}] ${check.name}: ${check.bad.length} đề sai`)
  if (!ok) {
    console.log(`        ${check.why}`)
    for (const e of check.bad.slice(0, 10)) {
      console.log(`        - ${e.id} | ${e.title} | duration=${e.duration} | max_attempts=${e.max_attempts}`)
    }
    if (check.bad.length > 10) console.log(`        ... và ${check.bad.length - 10} đề nữa`)
  }
}

console.log('')
if (practice.length === 0) {
  /* Không có đề ôn tập nào thì hai phép kiểm xuôi đạt một cách RỖNG. Nói ra,
     vì "0 đề sai trên 0 đề" không chứng minh migration đã chạy. */
  console.log('LƯU Ý: không có đề ôn tập nào trong database, nên hai phép kiểm')
  console.log('       của 20260905/20260906 đạt một cách rỗng — chưa chứng minh')
  console.log('       được migration đã chạy.')
}
console.log(failed === 0 ? 'Tất cả phép kiểm ĐẠT.' : `${failed} phép kiểm KHÔNG ĐẠT.`)
process.exit(failed === 0 ? 0 : 1)
