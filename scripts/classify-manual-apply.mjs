#!/usr/bin/env node
/**
 * Ghi phân loại cho nhóm câu mà LỚP LUẬT bó tay — do người đọc tay gán.
 *
 * ==========================================================================
 * VÌ SAO CÓ FILE NÀY
 *
 * Sau khi lớp luật đọc thêm lời giải, ngân hàng còn 73 câu vừa CHƯA có phân
 * loại vừa không luật nào kết luận được. Chúng vô hình ở mọi màn: không lọc
 * được, không bốc vào đề được, không hiện trong cây.
 *
 * Tài khoản DeepSeek hết tiền, nên nhóm này được đọc TAY thay vì hỏi model.
 * 73 câu là việc làm được; đọc xong thì thấy chúng gần như đồng nhất.
 *
 * KẾT QUẢ ĐỌC: 68/73 câu là **bài toán thực tiễn giải bằng đạo hàm** — tối ưu
 * chi phí, quãng đường ngắn nhất, thể tích lớn nhất, tốc độ thay đổi, đồ thị
 * hàm phân thức bậc hai trên bậc nhất. Chúng thuộc "Một số yếu tố giải tích",
 * nơi 80 câu ứng dụng đạo hàm khác đã nằm.
 *
 * Vì sao lớp luật bó tay trước cả 68 câu: đề của chúng nói về **cá, bể nước,
 * hàng rào, máy bay, huyết áp** — không có một từ khoá toán học nào để luật
 * bám vào. Đây là giới hạn thật của phương pháp từ khoá, không phải lỗi cấu
 * hình. Ghi lại ở đây để lần sau không ai đi siết luật hòng "sửa" nhóm này.
 * ==========================================================================
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/classify-manual-apply.mjs          # chạy thử
 *   node --env-file=.env scripts/classify-manual-apply.mjs --ghi
 *
 * CHỈ THÊM, KHÔNG GHI ĐÈ: script bỏ qua mọi câu đã có dòng trong
 * `question_taxonomy`. Không có chế độ sửa lại.
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--ghi')

/** Mặc định của cả nhóm: bài toán thực tiễn giải bằng đạo hàm. */
const MAC_DINH = { topic: '8a789a14-9c07-4dde-a3b3-9db66bd7d311', category: 'f4c4d33f-d961-445e-99b6-0eccddbca9ca' }

/**
 * Bốn câu KHÔNG thuộc nhóm mặc định. Ghi rõ lý do từng câu — một ngoại lệ
 * không có lý do thì lần sau không ai dám sửa, cũng không ai dám giữ.
 */
const NGOAI_LE = {
  // Đường tròn (C) trong Oxy, hai đường thẳng cắt, diện tích tứ giác MNPQ.
  // Việc phải làm là hình học toạ độ phẳng, không phải khảo sát hàm.
  'Q_1782552782237_US6YI4Y': { topic: 'a5370b64-b66a-4b18-bdec-2f758809fb80', category: '66f62f0e-d4b7-434a-b173-88a8c8cd3216' },

  // "Tập xác định của hàm số (x^2-4x-3)/(x+3)". Tìm tập xác định là kỹ năng
  // SGK 10, bài Hàm số và đồ thị. Không có đạo hàm nào ở đây.
  'Q_1782552782364_3EDPIPW': { topic: 'fe1a5ca5-3579-4978-9a36-8c5793527da5', category: '5b58f19a-a5d3-43cf-8fdb-2deabf6e4c6f' },

  // Cho đồ thị f'(x), tính f(1)+f(3). Lời giải dựng lại f bằng NGUYÊN HÀM
  // ("f(x) = -x^3/3 - x^2/2 + 2x + C"), đi từ đạo hàm ngược về hàm gốc.
  'Q_1782828390645_NHCQQOF': { topic: '8a789a14-9c07-4dde-a3b3-9db66bd7d311', category: 'a4afd233-c7da-43fe-9dde-8b9ddf70ab88' },

  // Huyết áp P(t) = 100 + 20sin(7πt/3), giải P(t) = 80. Lời giải đưa về
  // sin(...) = -1 rồi giải phương trình lượng giác. KHÔNG có đạo hàm — đây là
  // bài phương trình lượng giác mặc áo thực tế.
  'Q_1782828583352_LNJIYJH': { topic: 'fe1a5ca5-3579-4978-9a36-8c5793527da5', category: 'e8c12fb3-efd9-479a-8be4-e1c1cebe47e3' },
}

/**
 * Câu KHÔNG được gán, và vì sao.
 *
 * `test-123` có nội dung đúng bằng chuỗi "Updated test" — dữ liệu rác còn sót
 * từ một lần thử. Gán phân loại cho nó là làm rác trông như dữ liệu thật; nó
 * cần bị XOÁ, mà xoá thì không phải việc của script phân loại.
 */
const BO_QUA = new Set(['test-123'])

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

/* PostgREST cắt ở 1000 dòng và KHÔNG báo — hợp đồng mục F5. */
async function all(path, page = 500) {
  const out = []
  for (let from = 0; ; from += page) {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + page - 1}` } })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) return out
  }
}

const { suggestTopic, classificationText } = await import(`file:///${APP}/src/lib/questions/classify.ts`)

const isOld = (row) => !String(row.id).startsWith('sgk-')
const topics = (await all('topics?select=id,name&order=order_index')).filter(isOld)
const cats = (await all('categories?select=id,name,topic_id&order=order_index')).filter(isOld)
const questions = await all('questions?select=id,content,question_type,solution&order=id.asc')
const answerRows = await all('answers?select=question_id,content')
const answersBy = new Map()
for (const row of answerRows) {
  const list = answersBy.get(row.question_id)
  if (list) list.push(row.content ?? '')
  else answersBy.set(row.question_id, [row.content ?? ''])
}
const daGan = new Set((await all('question_taxonomy?select=question_id')).map((r) => r.question_id))
const catName = new Map(cats.map((c) => [c.id, c.name]))

/* Dựng lại ĐÚNG nhóm đã đọc tay: chưa gắn VÀ luật bó tay. Không nhận danh sách
   id cứng — nếu lớp luật được siết thêm giữa chừng thì nhóm này co lại, và
   script phải tôn trọng điều đó thay vì ghi đè lên kết luận mới của luật. */
const rows = []
const boQua = []
let luatDaQuyet = 0
for (const q of questions) {
  if (daGan.has(q.id)) continue
  const text = classificationText(q.content ?? '', q.question_type, answersBy.get(q.id) ?? [], q.solution)
  if (suggestTopic(text, topics, cats)) { luatDaQuyet++; continue }
  if (BO_QUA.has(q.id)) { boQua.push(q.id); continue }
  const dich = NGOAI_LE[q.id] ?? MAC_DINH
  rows.push({
    question_id: q.id,
    topic_id: dich.topic,
    category_id: dich.category,
    section_id: null,
    subsection_id: null,
  })
}

/* Kiểm nhánh có thật và đúng quan hệ cha–con TRƯỚC khi ghi. Gõ nhầm một ký tự
   trong UUID là tạo ra dòng trỏ vào hư không, và không màn nào báo lỗi. */
const catById = new Map(cats.map((c) => [c.id, c]))
for (const r of rows) {
  const c = catById.get(r.category_id)
  if (!c) throw new Error(`Chương không tồn tại: ${r.category_id} (câu ${r.question_id})`)
  if (c.topic_id !== r.topic_id) throw new Error(`Chương ${c.name} không thuộc chủ đề đã chọn (câu ${r.question_id})`)
}

const nhom = new Map()
for (const r of rows) nhom.set(catName.get(r.category_id), (nhom.get(catName.get(r.category_id)) ?? 0) + 1)

console.log(`Chưa gắn và luật bó tay: ${rows.length + boQua.length} câu`)
console.log(`(luật tự quyết được ${luatDaQuyet} câu khác — để questions:classify-rules lo)\n`)
for (const [k, v] of [...nhom].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
if (boQua.length) console.log(`\n  Cố ý BỎ QUA (dữ liệu rác, cần xoá chứ không cần gán): ${boQua.join(', ')}`)
console.log(`\nChế độ: ${WRITE ? 'GHI THẬT' : 'CHẠY THỬ'}`)

if (!WRITE) {
  console.log('Chạy thử — chưa ghi gì. Thêm --ghi để thực hiện.')
  process.exit(0)
}

/* Lùi lại được: các dòng này chưa từng tồn tại, nên hoàn tác là XOÁ đúng chúng.
   Không có bảng lịch sử cho `question_taxonomy` (hợp đồng mục F3). */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = resolve(APP, `.taxonomy-added-${stamp}.json`)
writeFileSync(file, JSON.stringify(rows.map((r) => r.question_id), null, 2), 'utf8')
console.log(`Đã ghi danh sách hoàn tác vào ${file}`)
console.log('Lùi lại: DELETE /rest/v1/question_taxonomy?question_id=in.(...)')

for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200)
  const res = await fetch(`${url}/rest/v1/question_taxonomy`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(chunk),
  })
  if (!res.ok) throw new Error(`POST -> ${res.status} ${(await res.text()).slice(0, 300)}`)
  process.stdout.write('.')
}
console.log(`\nXong: ghi ${rows.length} dòng.`)
