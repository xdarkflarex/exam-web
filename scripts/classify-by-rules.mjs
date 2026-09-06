#!/usr/bin/env node
/**
 * Phân loại ngân hàng câu hỏi bằng LỚP LUẬT, không gọi AI.
 *
 * VÌ SAO CÓ SCRIPT NÀY THAY VÌ BẤM NÚT TRÊN WEB
 * Trang `/admin/questions` sinh gợi ý rồi để người soạn tick từng câu — đúng cho
 * gợi ý AI, vì AI đoán. Lớp luật thì khác hẳn: nó tất định, đọc được, và chạy
 * lại cho đúng kết quả cũ. Với hơn 1600 câu thì tick tay từng dòng không phải
 * thận trọng, chỉ là chậm.
 *
 * Nhưng đây VẪN là ghi hàng loạt vào dữ liệu thật, nên:
 *   * mặc định CHẠY THỬ, phải có `--ghi` mới đụng database;
 *   * mặc định KHÔNG ghi đè câu đã phân loại — `--sua-sai` mới cho phép, và chỉ
 *     với những câu mà hàng rào luật khẳng định là đang sai;
 *   * mọi thay đổi in ra trước khi ghi.
 *
 * BA PHẠM VI, tách riêng vì mức rủi ro khác hẳn nhau:
 *   1. (mặc định) Câu CHƯA có dòng nào trong `question_taxonomy`. Không ghi đè
 *      gì cả, nên an toàn nhất.
 *   2. `--sua-sai`: thêm những câu ĐANG có phân loại mà `findRuleConflict` nói
 *      là mâu thuẫn với đề bài. Đây là ghi đè, nên phải bật tường minh.
 *   3. Không có chế độ "ghi đè tất cả". Luật không giỏi hơn người ở mọi câu; nó
 *      chỉ chắc chắn ở những câu có dấu hiệu rõ, và đó đúng là hai nhóm trên.
 *
 * CÁCH DÙNG
 *   node --env-file=.env --experimental-strip-types scripts/classify-by-rules.mjs
 *   node --env-file=.env --experimental-strip-types scripts/classify-by-rules.mjs --ghi
 *   node --env-file=.env --experimental-strip-types scripts/classify-by-rules.mjs --sua-sai --ghi
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { suggestTopic, findRuleConflict, classificationText } = await import(`file:///${APP}/src/lib/questions/classify.ts`)

const WRITE = process.argv.includes('--ghi')
const FIX_WRONG = process.argv.includes('--sua-sai')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

/* PostgREST cắt ở 1000 dòng và KHÔNG báo. Ngân hàng đang hơn 1600 câu, nên đọc
   một phát là im lặng mất một phần ba — đúng loại lỗi khiến báo cáo trông sạch
   trong khi dữ liệu thì không. */
async function all(path, page = 500) {
  const out = []
  for (let from = 0; ; from += page) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + page - 1}` } })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) return out
  }
}

const questions = await all('questions?select=id,content,question_type&order=id.asc')
/* Đáp án của câu Đúng/Sai và trả lời ngắn mang phần lớn từ khoá — xem
   `classificationText`. Không đọc chúng thì 86 câu có đề dưới 120 ký tự gần như
   không có gì để luật bám vào. */
const answerRows = await all('answers?select=question_id,content')
const answersByQuestion = new Map()
for (const row of answerRows) {
  if (!answersByQuestion.has(row.question_id)) answersByQuestion.set(row.question_id, [])
  answersByQuestion.get(row.question_id).push(row.content ?? '')
}
const taxonomy = await all('question_taxonomy?select=question_id,topic_id,category_id,section_id,subsection_id')
/* Chỉ lấy nhánh CŨ. Cây `sgk-*` là của lý thuyết và `/learn`; ngân hàng câu hỏi
   phân loại theo cây cũ (quyết định của chủ dự án 2026-09-04). Trộn hai cây vào
   một lượt gợi ý là cách chắc chắn để câu rơi sang nhánh không ai bốc tới. */
const topics = (await all('topics?select=id,name&order=order_index')).filter((t) => !String(t.id).startsWith('sgk-'))
const categories = (await all('categories?select=id,name,topic_id&order=order_index')).filter(
  (c) => !String(c.id).startsWith('sgk-'),
)

const taxById = new Map(taxonomy.map((row) => [row.question_id, row]))
const catName = new Map(categories.map((c) => [c.id, c.name]))
const topName = new Map(topics.map((t) => [t.id, t.name]))

const willInsert = []
const willUpdate = []
let noRule = 0
let ruleAgrees = 0
let skippedWrongButNotAsked = 0

for (const question of questions) {
  const content = classificationText(
    question.content ?? '',
    question.question_type,
    answersByQuestion.get(question.id) ?? [],
  )
  const current = taxById.get(question.id)
  const hit = suggestTopic(content, topics, categories)

  if (!current) {
    if (!hit) { noRule++; continue }
    willInsert.push({ question, hit })
    continue
  }

  const conflict = findRuleConflict(
    content,
    { topicId: current.topic_id, categoryId: current.category_id },
    topics,
    categories,
  )
  if (!conflict) { ruleAgrees++; continue }
  if (!hit) { ruleAgrees++; continue }
  if (!FIX_WRONG) { skippedWrongButNotAsked++; continue }
  willUpdate.push({ question, hit, current, conflict })
}

const label = (h) => `${h.topicName}${h.categoryName ? ` › ${h.categoryName}` : ' (chỉ tới chủ đề)'}`

console.log(`Ngân hàng: ${questions.length} câu · đã phân loại ${taxonomy.length} · chưa ${questions.length - taxonomy.length}`)
console.log(`Chế độ: ${WRITE ? 'GHI THẬT' : 'CHẠY THỬ'}${FIX_WRONG ? ' · có --sua-sai' : ''}\n`)

const group = (list) => {
  const map = new Map()
  for (const item of list) {
    const k = label(item.hit)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map].sort((a, b) => b[1] - a[1])
}

console.log(`=== THÊM MỚI: ${willInsert.length} câu chưa có phân loại ===`)
for (const [k, v] of group(willInsert)) console.log(`  ${String(v).padStart(4)}  ${k}`)
console.log(`\n  Không luật nào khớp, để nguyên: ${noRule} câu`)

if (FIX_WRONG) {
  console.log(`\n=== SỬA LẠI: ${willUpdate.length} câu luật khẳng định đang sai ===`)
  const moves = new Map()
  for (const item of willUpdate) {
    const from = catName.get(item.current.category_id) ?? topName.get(item.current.topic_id) ?? '(trống)'
    const k = `${from}  →  ${label(item.hit)}`
    moves.set(k, (moves.get(k) ?? 0) + 1)
  }
  for (const [k, v] of [...moves].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  ${k}`)
} else {
  console.log(`\n  Đang xếp sai nhưng KHÔNG sửa (thiếu --sua-sai): ${skippedWrongButNotAsked} câu`)
}
console.log(`\n  Luật đồng ý với phân loại hiện có: ${ruleAgrees} câu`)

if (!WRITE) {
  console.log('\nChạy thử — chưa ghi gì. Thêm --ghi để thực hiện.')
  process.exit(0)
}

/* Ghi theo lô. `resolution=merge-duplicates` để chạy lại không nổ khoá chính:
   `question_taxonomy` khoá theo `question_id`, mỗi câu đúng một dòng. */
async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const res = await fetch(`${url}/rest/v1/question_taxonomy`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) throw new Error(`POST question_taxonomy -> ${res.status} ${(await res.text()).slice(0, 300)}`)
    process.stdout.write('.')
  }
}

/*
  SAO LƯU TRƯỚC KHI GHI ĐÈ.

  `--sua-sai` thay phân loại cũ của hàng trăm câu. Phần lớn là sửa đúng, nhưng
  "phần lớn" không phải "tất cả", và không có bảng lịch sử nào cho
  `question_taxonomy` — ghi đè xong là mất hẳn trạng thái trước.

  Chỉ sao lưu các dòng SẼ BỊ ĐỔI, không sao lưu cả bảng: file nhỏ, và khi cần
  lùi thì nạp thẳng lại đúng những dòng đó.
*/
/* Phần THÊM MỚI cũng phải lùi được. Nó không ghi đè gì, nhưng "không ghi đè"
   không có nghĩa là "không cần hoàn tác" — 142 dòng sai vẫn là 142 dòng phải đi
   tìm lại bằng tay nếu không có danh sách. Lùi: xoá đúng các `question_id` này. */
if (willInsert.length > 0) {
  const { writeFileSync } = await import('node:fs')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(APP, `.taxonomy-added-${stamp}.json`)
  writeFileSync(file, JSON.stringify(willInsert.map((item) => item.question.id), null, 2), 'utf8')
  console.log(`\nĐã ghi danh sách ${willInsert.length} câu THÊM MỚI vào ${file}`)
  console.log('Lùi lại: DELETE /rest/v1/question_taxonomy?question_id=in.(...)')
}

if (willUpdate.length > 0) {
  const { writeFileSync } = await import('node:fs')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = resolve(APP, `.taxonomy-backup-${stamp}.json`)
  writeFileSync(file, JSON.stringify(willUpdate.map((item) => item.current), null, 2), 'utf8')
  console.log(`\nĐã sao lưu ${willUpdate.length} dòng cũ vào ${file}`)
  console.log('Lùi lại: POST các dòng đó lên /rest/v1/question_taxonomy với Prefer: resolution=merge-duplicates')
}

const rows = [...willInsert, ...willUpdate].map(({ question, hit }) => ({
  question_id: question.id,
  topic_id: hit.topicId,
  category_id: hit.categoryId,
  /* Luật không ra được hai tầng này — ghi `null` chứ không giữ giá trị cũ. Giữ
     lại một `section_id` của chương CŨ trong khi chương vừa đổi là để lại một
     đường dẫn không tồn tại trong cây. */
  section_id: null,
  subsection_id: null,
}))

await upsert(rows)
console.log(`\n\nXong: ghi ${rows.length} dòng (${willInsert.length} thêm mới, ${willUpdate.length} sửa lại).`)
console.log('Kiểm lại ở /admin/questions, lọc theo chương.')
