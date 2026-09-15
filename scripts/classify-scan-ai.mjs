#!/usr/bin/env node
/**
 * QUÉT LẠI phân loại toàn ngân hàng bằng AI, và đối chiếu BA nguồn.
 *
 * ==========================================================================
 * ĐÂY KHÔNG PHẢI "AI PHÂN LOẠI LẠI RỒI GHI ĐÈ"
 *
 * Nếu chỉ để AI xếp lại rồi ghi, ta được đúng thứ đã hỏng: một lượt đoán hàng
 * loạt không ai kiểm. Script này hỏi AI về MỌI câu — kể cả câu lớp luật đã
 * quyết được — rồi so ba nguồn độc lập:
 *
 *     DB (đang lưu)  ·  LUẬT (tất định)  ·  AI (v4-pro)
 *
 * Ba nguồn trùng nhau  → gần như chắc đúng, không cần ai nhìn.
 * Luật và AI trùng, khác DB → ứng viên sửa mạnh nhất.
 * Luật và AI đá nhau  → đúng chỗ cần người, và là chỗ đáng đọc nhất.
 *
 * Hỏi AI cả những câu luật đã quyết là CỐ Ý và là điểm khác biệt so với route
 * `/api/admin/questions/classify` (ở đó luật chạy trước để tiết kiệm). Ở một
 * lượt rà soát, hai ý kiến độc lập trùng nhau mới là bằng chứng; một ý kiến thì
 * chỉ là ý kiến.
 * ==========================================================================
 *
 * **KHÔNG GHI GÌ.** Không có cờ `--ghi`, và không có đường ghi nào trong file.
 * Đầu ra là một CSV để người soạn đọc và quyết.
 *
 * CÁCH DÙNG
 *   node --env-file=.env --experimental-strip-types scripts/classify-scan-ai.mjs --uoc-tinh
 *   node --env-file=.env --experimental-strip-types scripts/classify-scan-ai.mjs --chay
 *   ... --gioi-han 50     chỉ quét 50 câu đầu (chạy thử cho rẻ)
 *   ... --model <tên>     mặc định deepseek-v4-pro
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { suggestTopic, findRuleConflict, classificationText } = await import(
  `file:///${APP}/src/lib/questions/classify.ts`
)
const { buildClassifyPrompt } = await import(`file:///${APP}/src/lib/questions/classify-ai-prompt.ts`)
const { parseClassifyResult } = await import(`file:///${APP}/src/lib/questions/classify-ai.ts`)

const args = process.argv.slice(2)
const RUN = args.includes('--chay')
const at = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const MODEL = at('--model', 'deepseek-v4-pro')
const LIMIT = Number(at('--gioi-han', '0')) || 0

/** Giá `deepseek-v4-pro`, peak + cache miss — mức ĐẮT NHẤT, để không báo thấp. */
const GIA_VAO_1M = 1.32
const GIA_RA_1M = 3.96
/** Cùng `BATCH_SIZE` của route: cây taxonomy nằm trong mọi lô nên gộp mới rẻ. */
const BATCH = 10

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const aiKey = process.env.DEEPSEEK_API_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}` }

/* PostgREST cắt ở 1000 dòng và KHÔNG báo — hợp đồng mục F5. */
async function all(path, page = 500) {
  const out = []
  for (let from = 0; ; from += page) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...H, Range: `${from}-${from + page - 1}` },
    })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) return out
  }
}

const isOld = (row) => !String(row.id).startsWith('sgk-')
const tree = {
  topics: (await all('topics?select=id,name&order=order_index')).filter(isOld),
  categories: (await all('categories?select=id,name,topic_id&order=order_index')).filter(isOld),
  sections: (await all('sections?select=id,name,category_id,topic_id&order=order_index')).filter(isOld),
  subsections: (await all('subsections?select=id,name,section_id&order=order_index')).filter(isOld),
}
const allQuestions = await all('questions?select=id,content,question_type,solution&order=id.asc')
const questions = LIMIT ? allQuestions.slice(0, LIMIT) : allQuestions
const answerRows = await all('answers?select=question_id,content')
const answersBy = new Map()
for (const row of answerRows) {
  const list = answersBy.get(row.question_id)
  if (list) list.push(row.content ?? '')
  else answersBy.set(row.question_id, [row.content ?? ''])
}
const taxonomy = await all('question_taxonomy?select=question_id,topic_id,category_id')
const taxBy = new Map(taxonomy.map((row) => [row.question_id, row]))
const catName = new Map(tree.categories.map((row) => [row.id, row.name]))
const topName = new Map(tree.topics.map((row) => [row.id, row.name]))

const withAnswers = (question) =>
  question.question_type === 'true_false' || question.question_type === 'short_answer'
    ? (answersBy.get(question.id) ?? [])
    : undefined

const batches = []
for (let i = 0; i < questions.length; i += BATCH) batches.push(questions.slice(i, i + BATCH))

/* Ước tính bằng cách DỰNG THẬT từng prompt rồi đếm ký tự — không nhân nhẩm từ
   một con số trung bình. Cây taxonomy lặp trong mọi lô nên nó mới là phần
   chiếm chỗ, và chỉ dựng thật mới thấy đúng. */
let promptChars = 0
for (const batch of batches) {
  promptChars += buildClassifyPrompt({
    questions: batch.map((q) => ({
      id: q.id,
      content: q.content ?? '',
      answers: withAnswers(q),
      solution: q.solution,
    })),
    tree,
  }).length
}
const tokenVao = Math.round(promptChars / 2.2)
/* 700 chứ không phải 110: đo thật trên v4-pro là ~723 token đầu ra mỗi câu.
   `ly_do` chỉ dài trung bình 110 KÝ TỰ, nên phần chênh là thinking token —
   v4-pro suy luận trước khi trả lời và tính tiền phần đó. */
const tokenRa = questions.length * 700
const tien = (tokenVao / 1e6) * GIA_VAO_1M + (tokenRa / 1e6) * GIA_RA_1M

console.log(`Model: ${MODEL}`)
console.log(`Phạm vi: ${questions.length}/${allQuestions.length} câu · ${batches.length} lô × ${BATCH}`)
console.log(`Prompt dựng thật: ${promptChars.toLocaleString('vi-VN')} ký tự ≈ ${tokenVao.toLocaleString('vi-VN')} token vào`)
console.log(`Đầu ra ước tính: ${tokenRa.toLocaleString('vi-VN')} token`)
console.log(`Chi phí ước tính (mức ĐẮT NHẤT): ${tien.toFixed(2)} USD`)

if (!RUN) {
  console.log('\nMới ước tính, chưa gọi API. Thêm --chay để quét thật.')
  process.exit(0)
}
if (!aiKey) {
  console.error('Thiếu DEEPSEEK_API_KEY.')
  process.exit(1)
}

async function hoiAI(batch) {
  const prompt = buildClassifyPrompt({
    questions: batch.map((q) => ({
      id: q.id,
      content: q.content ?? '',
      answers: withAnswers(q),
      solution: q.solution,
    })),
    tree,
  })
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      // 0 vì đây là việc phân loại, không phải viết văn: cùng một câu chạy hai
      // lần phải ra cùng một chương, nếu không thì không tái hiện được để đi tìm
      // nguyên nhân.
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`DeepSeek ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const usage = data.usage ?? {}
  /*
    CẮT HAI TẦNG SÂU TRƯỚC KHI VALIDATE.

    `parseClassifyResult` giết CẢ lô khi một mục sai — đúng và cố ý cho luồng
    ghi: model bịa một chỗ thì phần còn lại của cùng lượt không đáng tin hơn.

    Nhưng lượt quét này chỉ so tới tầng CHƯƠNG (`luatCat` / `aiCat` / `dbCat`);
    `section_id` và `subsection_id` không được dùng vào việc gì. Đo thật:
    v4-pro bịa `subsection_id` khoảng 1 mục mỗi 10, và mỗi lần như thế là mất
    trắng 9 câu trả lời tốt. Bỏ hai tầng ta không đọc tới là bỏ đúng cái nguồn
    hỏng đó, không nới lỏng phép kiểm nào đang được dùng.

    Phần kiểm còn giữ nguyên: schema, id có thật, và category phải thuộc topic.
  */
  const value = JSON.parse(raw)
  for (const item of value?.ket_qua ?? []) {
    item.section_id = null
    item.subsection_id = null
  }
  const suggestions = parseClassifyResult(value, { questionIds: batch.map((q) => q.id), tree })
  return { suggestions, usage }
}

const rows = []
let tokVao = 0
let tokRa = 0
const loHong = []

/*
  CHẠY SONG SONG 4 LÔ.

  Đo thật: v4-pro mất khoảng hai phút mỗi lô vì nó suy luận trước khi trả lời.
  163 lô nối đuôi nhau là hơn năm tiếng. Bốn luồng đưa xuống khoảng một tiếng
  rưỡi.

  Bốn chứ không phải bốn mươi: DeepSeek không công bố trần nhịp gọi, và một
  lượt bị chặn giữa chừng thì đã tốn tiền cho phần gọi được mà không có báo cáo.
*/
const SONG_SONG = 4
const ketQuaLo = new Array(batches.length).fill(null)
let daXong = 0
let ke = 0

await Promise.all(
  Array.from({ length: Math.min(SONG_SONG, batches.length) }, async () => {
    while (ke < batches.length) {
      const index = ke++
      try {
        const out = await hoiAI(batches[index])
        ketQuaLo[index] = out.suggestions
        tokVao += out.usage.prompt_tokens ?? 0
        tokRa += out.usage.completion_tokens ?? 0
      } catch (caught) {
        // Một lô hỏng không làm hỏng cả lượt — những lô khác vẫn dùng được.
        ketQuaLo[index] = []
        loHong.push(`Lô ${index + 1}: ${caught instanceof Error ? caught.message : caught}`)
      }
      daXong++
      process.stdout.write(`\rĐã xong ${daXong}/${batches.length} lô…`)
    }
  }),
)

for (const [index, batch] of batches.entries()) {
  const suggestions = ketQuaLo[index] ?? []

  const aiById = new Map()
  for (const item of suggestions) {
    if (item.topic_id) aiById.set(item.question_id, item)
  }

  for (const question of batch) {
    const text = classificationText(
      question.content ?? '',
      question.question_type,
      answersBy.get(question.id) ?? [],
      question.solution,
    )
    const luat = suggestTopic(text, tree.topics, tree.categories)
    const ai = aiById.get(question.id) ?? null
    const db = taxBy.get(question.id) ?? null
    const conflict = ai
      ? findRuleConflict(
          text,
          { topicId: ai.topic_id, categoryId: ai.category_id },
          tree.topics,
          tree.categories,
        )
      : null

    const ten = (topicId, categoryId) =>
      categoryId ? (catName.get(categoryId) ?? '?') : (topName.get(topicId) ?? '(trống)')

    rows.push({
      id: question.id,
      db: db ? ten(db.topic_id, db.category_id) : '(CHƯA GẮN)',
      dbCat: db?.category_id ?? '',
      luat: luat ? (luat.categoryName ?? luat.topicName) : '(chịu)',
      luatCat: luat?.categoryId ?? '',
      ai: ai ? ten(ai.topic_id, ai.category_id) : '(chịu)',
      aiCat: ai?.category_id ?? '',
      hangRao: conflict ?? '',
      lyDo: ai?.ly_do ?? '',
      trich: (question.content ?? '').replace(/\s+/g, ' ').slice(0, 120),
    })
  }
}
process.stdout.write('\r')

/*
  BẢY Ô, KHÔNG PHẢI BA.

  Bản đầu chỉ xếp được câu mà CẢ luật lẫn AI đều có ý kiến — nên 18/20 câu của
  lượt chạy thử rơi ra ngoài mọi ô. Luật im lặng trên khoảng 40% ngân hàng (đó
  là thiết kế: không chắc thì không nói), nên "luật chịu" phải là ô riêng chứ
  không phải phần bị bỏ quên.

  Ô quan trọng nhất là ô 2: hai nguồn ĐỘC LẬP cùng nói dữ liệu đang lưu là sai.
  Ô 4 yếu hơn hẳn — chỉ một ý kiến — nên nó không bao giờ được tự động áp dụng.
*/
const coLuat = (r) => r.luatCat !== ''
const coAi = (r) => r.aiCat !== ''
const chuaGan = rows.filter((r) => r.db === '(CHƯA GẮN)')
const daGan = rows.filter((r) => r.db !== '(CHƯA GẮN)')

const baTrung = daGan.filter((r) => coLuat(r) && coAi(r) && r.luatCat === r.aiCat && r.aiCat === r.dbCat)
const luatAiTrungKhacDb = daGan.filter((r) => coLuat(r) && coAi(r) && r.luatCat === r.aiCat && r.aiCat !== r.dbCat)
const daNhau = daGan.filter((r) => coLuat(r) && coAi(r) && r.luatCat !== r.aiCat)
const luatChiuAiKhopDb = daGan.filter((r) => !coLuat(r) && coAi(r) && r.aiCat === r.dbCat)
const luatChiuAiKhacDb = daGan.filter((r) => !coLuat(r) && coAi(r) && r.aiCat !== r.dbCat)
const aiChiu = rows.filter((r) => !coAi(r))
const biChan = rows.filter((r) => r.hangRao)

const tienThat = (tokVao / 1e6) * GIA_VAO_1M + (tokRa / 1e6) * GIA_RA_1M
console.log(`\nĐã quét ${rows.length} câu · ${loHong.length} lô hỏng`)
console.log(`Token thật: ${tokVao.toLocaleString('vi-VN')} vào · ${tokRa.toLocaleString('vi-VN')} ra`)
console.log(`Chi phí (mức đắt nhất): ${tienThat.toFixed(2)} USD\n`)
console.log(`Đã gắn ${daGan.length} · chưa gắn ${chuaGan.length}
`)
console.log(`1. Ba nguồn TRÙNG (DB = luật = AI)      : ${baTrung.length}   chắc nhất`)
console.log(`2. Luật + AI trùng nhau, KHÁC DB        : ${luatAiTrungKhacDb.length}   <-- ứng viên sửa mạnh nhất`)
console.log(`3. Luật và AI ĐÁ NHAU                   : ${daNhau.length}   <-- cần người đọc`)
console.log(`4. Luật chịu, AI xác nhận DB            : ${luatChiuAiKhopDb.length}`)
console.log(`5. Luật chịu, AI khác DB                : ${luatChiuAiKhacDb.length}   chỉ một ý kiến`)
console.log(`6. AI cũng chịu                         : ${aiChiu.length}`)
console.log(`   Gợi ý AI bị hàng rào luật từ chối     : ${biChan.length}`)

if (luatAiTrungKhacDb.length > 0) {
  const nhom = new Map()
  for (const r of luatAiTrungKhacDb) {
    const k = `${r.db}  →  ${r.luat}`
    nhom.set(k, (nhom.get(k) ?? 0) + 1)
  }
  console.log('\n--- Luật và AI cùng nói DB sai ---')
  for (const [k, v] of [...nhom].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }
}

for (const loi of loHong.slice(0, 5)) console.log(`  ! ${loi}`)

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const file = `.quet-ai-${new Date().toISOString().slice(0, 10)}.csv`
writeFileSync(
  resolve(APP, file),
  '﻿' +
    ['question_id,dang_luu,luat,ai,hang_rao,ly_do_ai,trich_de']
      .concat(
        rows.map((r) =>
          [r.id, r.db, r.luat, r.ai, r.hangRao, r.lyDo, r.trich].map(esc).join(','),
        ),
      )
      .join('\n'),
  'utf8',
)
console.log(`\nĐã ghi ${rows.length} dòng vào ${file}`)
console.log('Chỉ báo cáo — script này không ghi gì vào database.')
