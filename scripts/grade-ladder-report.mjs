#!/usr/bin/env node
/**
 * Chạy THANG LỚP trên toàn ngân hàng và báo cáo. **KHÔNG GHI GÌ.**
 *
 * `docs/CLASSIFICATION_RULES.md` mục 10 bước 6: thang lớp chạy ở chế độ chỉ báo
 * cáo cho tới khi chủ dự án chốt bốn dòng còn treo ở mục 11, rồi mới thêm cột
 * `question_taxonomy.grade`. Script này cố ý KHÔNG có cờ `--ghi` — không có
 * chỗ nào để ghi, và thêm một cờ như thế trước khi có cột là mời tai nạn.
 *
 * Đổi lớp là đổi việc HỌC SINH NÀO NHÌN THẤY CÂU ĐÓ, không phải sửa một nhãn.
 * Nên nó xuất danh sách và chờ người duyệt (mục F4).
 *
 * CÁCH DÙNG
 *   node --env-file=.env --experimental-strip-types scripts/grade-ladder-report.mjs
 *   ... --lech      chỉ in nhóm lệch với nhãn lớp của chương
 *   ... --can-xem   chỉ in nhóm máy tự nhận là chưa chắc
 *   ... --csv <file>  ghi toàn bộ phán quyết ra CSV để mở bằng Excel
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { gradeOf } = await import(`file:///${APP}/src/lib/questions/grade-ladder.ts`)

const args = process.argv.slice(2)
const ONLY_DRIFT = args.includes('--lech')
const ONLY_UNCERTAIN = args.includes('--can-xem')
const csvIndex = args.indexOf('--csv')
const CSV_PATH = csvIndex >= 0 ? args[csvIndex + 1] : null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}` }

/* PostgREST cắt ở 1000 dòng và KHÔNG báo (mục F5). Ngân hàng hơn 1600 câu, nên
   đọc một phát là im lặng mất một phần ba — và báo cáo trông vẫn sạch. */
async function all(path, page = 500) {
  const out = []
  for (let from = 0; ; from += page) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...H, Range: `${from}-${from + page - 1}` },
    })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) return out
  }
}

const questions = await all('questions?select=id,content,question_type&order=id.asc')
const answerRows = await all('answers?select=question_id,content')
const answersByQuestion = new Map()
for (const row of answerRows) {
  const list = answersByQuestion.get(row.question_id)
  if (list) list.push(row.content ?? '')
  else answersByQuestion.set(row.question_id, [row.content ?? ''])
}
const taxonomy = await all('question_taxonomy?select=question_id,topic_id,category_id')
const categories = (await all('categories?select=id,name,topic_id')).filter(
  (row) => !String(row.id).startsWith('sgk-'),
)
const catById = new Map(categories.map((row) => [row.id, row.name]))
const taxByQuestion = new Map(taxonomy.map((row) => [row.question_id, row]))

/**
 * Lớp mà TÊN CHƯƠNG đang ngụ ý.
 *
 * Đây chính là thứ mục E1 nói là không nên tồn tại: lớp bị nhét vào tên chương
 * nên muốn biết nó phải đọc bằng biểu thức chính quy. Ở đây làm vậy là để ĐO độ
 * lệch, không phải để dùng lâu dài.
 */
function chapterGrade(name) {
  if (!name) return null
  if (/lớp 10 \+ 11/i.test(name)) return 11
  if (/kết hợp 10 \+ 12/i.test(name)) return 12
  if (/lớp 11 \+ 12/i.test(name)) return 12
  if (/lớp 10/i.test(name)) return 10
  if (/lớp 11/i.test(name)) return 11
  if (/lớp 12/i.test(name)) return 12
  if (/^dãy số|^cấp số/i.test(name)) return 11
  if (/giải tích|nguyên hàm|toạ độ không gian|tọa độ không gian|xác suất có điều kiện|chuyên đề 12/i.test(name))
    return 12
  return null
}

const rows = []
for (const question of questions) {
  const verdict = gradeOf(question.content ?? '', {
    questionType: question.question_type,
    answers: answersByQuestion.get(question.id) ?? [],
  })
  const tax = taxByQuestion.get(question.id)
  const chapter = tax ? (catById.get(tax.category_id) ?? null) : null
  rows.push({
    id: question.id,
    verdict,
    chapter,
    chapterGrade: chapterGrade(chapter),
    snippet: (question.content ?? '').replace(/\s+/g, ' ').slice(0, 150),
  })
}

const decided = rows.filter((row) => row.verdict.grade !== null)
const uncertain = rows.filter((row) => row.verdict.uncertain)
const comparable = decided.filter((row) => row.chapterGrade !== null)
const lower = comparable.filter((row) => row.verdict.grade > row.chapterGrade)
const higher = comparable.filter((row) => row.verdict.grade < row.chapterGrade)

const pct = (n, d) => (d === 0 ? '0' : ((100 * n) / d).toFixed(1))

if (!ONLY_DRIFT && !ONLY_UNCERTAIN) {
  console.log(`Ngân hàng: ${questions.length} câu`)
  console.log(`Thang lớp quyết được: ${decided.length} (${pct(decided.length, questions.length)}%)`)
  const dist = { 10: 0, 11: 0, 12: 0 }
  for (const row of decided) dist[row.verdict.grade]++
  console.log(`  lớp 10: ${dist[10]}   lớp 11: ${dist[11]}   lớp 12: ${dist[12]}`)
  console.log(`Máy tự nhận chưa chắc (cần người xem): ${uncertain.length}`)
  console.log('')
  console.log(`So với nhãn lớp của CHƯƠNG (${comparable.length} câu so được):`)
  console.log(`  khớp:                              ${comparable.length - lower.length - higher.length}`)
  console.log(`  chương gán THẤP hơn kiến thức thật: ${lower.length}`)
  console.log(`  chương gán CAO hơn kiến thức thật:  ${higher.length}`)
  console.log('')
}

if (!ONLY_UNCERTAIN) {
  console.log(`=== CHƯƠNG GÁN THẤP HƠN KIẾN THỨC THẬT: ${lower.length} câu ===`)
  console.log('(câu "nhìn sơ tưởng lớp thấp" nhưng phải dùng kiến thức lớp cao hơn)\n')
  const grouped = new Map()
  for (const row of lower) {
    const label = `${row.chapter} (lớp ${row.chapterGrade}) → cần lớp ${row.verdict.grade}`
    grouped.set(label, (grouped.get(label) ?? 0) + 1)
  }
  for (const [label, count] of [...grouped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${label}`)
  }
  console.log('\n  Ví dụ:')
  for (const row of lower.slice(0, 10)) {
    const evidence = row.verdict.units.map((unit) => `${unit.code}=${unit.grade}`).join(' · ')
    console.log(`   · [${row.chapterGrade} → ${row.verdict.grade}] ${evidence}`)
    console.log(`     ${row.snippet}`)
  }
  console.log('')
}

if (!ONLY_DRIFT) {
  console.log(`=== MÁY CHƯA CHẮC: ${uncertain.length} câu ===`)
  console.log('(có cặp đáng lẽ hạ lớp, nhưng dạng hàm không nhận ra được là dạng đơn giản)\n')
  for (const row of uncertain.slice(0, 15)) {
    console.log(`   · lớp máy giữ: ${row.verdict.grade} — ${row.verdict.notes.join(' ')}`)
    console.log(`     ${row.snippet}`)
  }
  if (uncertain.length > 15) console.log(`   … và ${uncertain.length - 15} câu nữa`)
  console.log('')
}

if (CSV_PATH) {
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines = ['question_id,lop_suy_ra,lop_theo_chuong,chua_chac,chuong,bang_chung,trich_de']
  for (const row of rows) {
    lines.push(
      [
        esc(row.id),
        esc(row.verdict.grade ?? ''),
        esc(row.chapterGrade ?? ''),
        esc(row.verdict.uncertain ? 'x' : ''),
        esc(row.chapter ?? ''),
        esc(row.verdict.units.map((unit) => `${unit.code}=${unit.grade}`).join(' | ')),
        esc(row.snippet),
      ].join(','),
    )
  }
  // BOM để Excel trên Windows đọc đúng tiếng Việt.
  writeFileSync(resolve(APP, CSV_PATH), '﻿' + lines.join('\n'), 'utf8')
  console.log(`Đã ghi ${rows.length} dòng vào ${CSV_PATH}`)
}

console.log('Chỉ báo cáo — script này không ghi gì vào database.')
