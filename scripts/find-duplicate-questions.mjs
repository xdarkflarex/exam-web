/**
 * Quét ngân hàng câu hỏi, tìm câu trùng.
 *
 * Dùng:
 *   node --experimental-strip-types --env-file=.env \
 *     scripts/find-duplicate-questions.mjs --email <email> --password <mk>
 *
 * Cờ thêm:
 *   --near 0.9        ngưỡng "gần giống" (mặc định 0,85)
 *   --limit 5000      số câu tối đa quét
 *   --out bao-cao.json  ghi kết quả đầy đủ ra file
 *
 * VÌ SAO ĐĂNG NHẬP BẰNG TÀI KHOẢN THẬT chứ không dùng SUPABASE_SERVICE_KEY:
 * service key đi vòng qua toàn bộ RLS. Script này chỉ cần ĐỌC những câu mà
 * chính giáo viên đã đọc được trên giao diện, nên chạy bằng session của họ là
 * đủ — và nếu RLS có chặn gì thì script phải chịu chặn y như giao diện, không
 * được nhìn nhiều hơn. Cùng khuôn với `scripts/essay-ai-permission-check.mjs`.
 *
 * KHÔNG GHI GÌ VÀO DATABASE. Kết quả là báo cáo để người soạn đọc và tự quyết.
 * Xoá câu trùng tự động là chuyện khác hẳn về mức rủi ro, và không thuộc script
 * này.
 */

import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { findDuplicates } from '../src/lib/questions/duplicates.ts'

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`)
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = arg('email')
const password = arg('password')

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  console.error('Chạy kèm --env-file=.env, ví dụ:')
  console.error('  node --experimental-strip-types --env-file=.env \\')
  console.error('    scripts/find-duplicate-questions.mjs --email … --password …')
  process.exit(1)
}

if (!email) {
  console.error('Thiếu --email <email> của tài khoản giáo viên/admin.')
  process.exit(1)
}

/**
 * Mật khẩu: ưu tiên KHÔNG nhận qua tham số dòng lệnh.
 *
 * Tham số dòng lệnh nằm lại trong lịch sử shell và hiện ra ở danh sách tiến
 * trình của máy. Nhập lúc chạy thì nó chỉ sống trong bộ nhớ tiến trình này.
 * Vẫn giữ `--password` cho trường hợp chạy tự động, nhưng không phải mặc định.
 */
async function askPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`Mật khẩu của ${email}: `)
  rl.close()
  return answer.trim()
}

const restBase = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`

async function signIn(secret) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: secret }),
  })
  if (!res.ok) {
    console.error(`Đăng nhập thất bại (${res.status}). Kiểm tra lại email/mật khẩu.`)
    process.exit(1)
  }
  const data = await res.json()
  return data.access_token
}

/** Lấy câu hỏi theo trang. PostgREST mặc định trần 1000 dòng mỗi lượt. */
async function fetchQuestions(token, max) {
  const pageSize = 1000
  const rows = []

  for (let offset = 0; offset < max; offset += pageSize) {
    const take = Math.min(pageSize, max - offset)
    const url = `${restBase}/questions?select=id,content,question_type,cognitive_level&order=id&limit=${take}&offset=${offset}`
    const res = await fetch(url, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error(`Không đọc được bảng questions (${res.status}): ${await res.text()}`)
      process.exit(1)
    }
    const page = await res.json()
    rows.push(...page)
    process.stdout.write(`\rĐã tải ${rows.length} câu…`)
    if (page.length < take) break
  }

  process.stdout.write('\n')
  return rows
}

function truncate(text, length = 90) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length <= length ? flat : `${flat.slice(0, length)}…`
}

const token = await signIn(password || (await askPassword()))
const questions = await fetchQuestions(token, Number(arg('limit', '20000')))

if (questions.length === 0) {
  console.log('Không đọc được câu nào. Có thể RLS chặn, hoặc tài khoản không phải giáo viên/admin.')
  process.exit(0)
}

const byId = new Map(questions.map((question) => [question.id, question]))
const report = findDuplicates(questions, { nearThreshold: Number(arg('near', '0.85')) })

const pairCount = (cluster) => (cluster.length * (cluster.length - 1)) / 2
const exactPairs = report.exact.reduce((sum, c) => sum + pairCount(c.questionIds), 0)
const templatePairs = report.sameTemplate.reduce((sum, c) => sum + pairCount(c.questionIds), 0)

console.log('')
console.log(`Đã quét ${report.scanned} câu.`)
console.log('')
console.log(`  TRÙNG HỆT    ${report.exact.length} nhóm (${exactPairs} cặp) — gần như luôn nên gộp`)
console.log(`  CÙNG DẠNG    ${report.sameTemplate.length} nhóm (${templatePairs} cặp) — đừng để chung một đề`)
console.log(`  GẦN GIỐNG    ${report.near.length} cặp — cần đọc lại`)
console.log('')

function printClusters(title, clusters, limit = 15) {
  if (clusters.length === 0) return
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)
  for (const cluster of clusters.slice(0, limit)) {
    console.log('')
    for (const id of cluster.questionIds) {
      console.log(`  ${id}  ${truncate(byId.get(id)?.content)}`)
    }
  }
  if (clusters.length > limit) {
    console.log(`\n  … còn ${clusters.length - limit} nhóm nữa (xem file --out)`)
  }
  console.log('')
}

printClusters('TRÙNG HỆT', report.exact)
printClusters('CÙNG DẠNG (chỉ khác con số)', report.sameTemplate)

if (report.near.length > 0) {
  console.log(`── GẦN GIỐNG ${'─'.repeat(49)}`)
  for (const pair of report.near.slice(0, 15)) {
    console.log('')
    console.log(`  giống ${(pair.similarity * 100).toFixed(1)}%`)
    console.log(`  ${pair.aId}  ${truncate(byId.get(pair.aId)?.content)}`)
    console.log(`  ${pair.bId}  ${truncate(byId.get(pair.bId)?.content)}`)
  }
  if (report.near.length > 15) {
    console.log(`\n  … còn ${report.near.length - 15} cặp nữa (xem file --out)`)
  }
  console.log('')
}

const outPath = arg('out')
if (outPath) {
  const withContent = {
    ...report,
    exact: report.exact.map((c) => ({
      ...c,
      questions: c.questionIds.map((id) => ({ id, content: byId.get(id)?.content })),
    })),
    sameTemplate: report.sameTemplate.map((c) => ({
      ...c,
      questions: c.questionIds.map((id) => ({ id, content: byId.get(id)?.content })),
    })),
    near: report.near.map((p) => ({
      ...p,
      a: byId.get(p.aId)?.content,
      b: byId.get(p.bId)?.content,
    })),
  }
  writeFileSync(outPath, JSON.stringify(withContent, null, 2), 'utf8')
  console.log(`Đã ghi báo cáo đầy đủ: ${outPath}`)
}
