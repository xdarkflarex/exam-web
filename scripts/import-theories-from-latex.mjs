#!/usr/bin/env node
/**
 * Nhập lý thuyết từ kho LaTeX vào bảng `theories` + `knowledge_blocks`.
 *
 * VÌ SAO CÓ SCRIPT NÀY, TRONG KHI ĐÃ CÓ `/admin/theories/import`
 * Trang admin luôn TẠO MỚI: import lại một bài đã có sinh ra bản thứ hai. Với 29
 * bài và một kho LaTeX còn sửa dài dài thì cần một đường nhập **chạy lại được**
 * — sửa file .tex rồi chạy lại, bài trên web cập nhật tại chỗ, không đẻ bản sao.
 *
 * NGUỒN SỰ THẬT LÀ BA FILE CHÍNH, KHÔNG PHẢI THƯ MỤC.
 * `filechinh-lop10/11/12.tex` quyết định bài nào thuộc sách và theo thứ tự nào.
 * Quét thư mục sẽ vơ cả bản nháp: `chapters/lop12/.../bai01-on-tap-dao-ham.tex`
 * (280 dòng) KHÔNG nằm trong sách — file chính nạp bản `-chuan` (70 dòng). Hai
 * file này cùng tiêu đề "ÔN TẬP ĐẠO HÀM", nên quét thư mục còn tạo ra trùng tên.
 *
 * KHOÁ ĐỐI CHIẾU LÀ (chương, tiêu đề), KHÔNG PHẢI TIÊU ĐỀ.
 * "HỆ THỐNG HÓA VÀ BÀI TẬP CUỐI CHƯƠNG" xuất hiện ở cả chương 2 và chương 3 lớp
 * 12 — hai bài khác nhau, trùng tên một cách hợp lệ. Khoá chỉ theo tiêu đề sẽ
 * ghi đè bài này lên bài kia.
 *
 * CÁCH DÙNG
 *   node --env-file=.env --experimental-strip-types scripts/import-theories-from-latex.mjs
 *   node --env-file=.env --experimental-strip-types scripts/import-theories-from-latex.mjs --ghi
 *
 * Mặc định CHẠY THỬ, không ghi gì. Phải có `--ghi` mới đụng vào database.
 *
 * `is_published` KHÔNG bị script đụng tới: bài đã có giữ nguyên trạng thái đang
 * xuất bản, bài mới vào ở dạng nháp. Đẩy 25 bài chưa ai đọc lại thẳng ra cho học
 * sinh là quyết định của giáo viên, không phải của một script đồng bộ.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const TEX_ROOT = process.env.TEX_ROOT || 'D:/ToanTHPT/LATEX/HethongtrithucToanTHPT'
const WRITE = process.argv.includes('--ghi')

const { parseTexFile } = await import(`file:///${APP}/src/lib/theories/latex-parser.ts`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  console.error('Chạy bằng: node --env-file=.env --experimental-strip-types scripts/import-theories-from-latex.mjs')
  process.exit(1)
}

const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function rest(path, init) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

/* Thư mục chương trong kho LaTeX -> id `categories` đã có sẵn trên database.
   Bảng này là chỗ DUY NHẤT nối hai thế giới; sai một dòng ở đây là bài rơi vào
   nhầm chương mà không có lỗi nào bắn ra. */
const CATEGORY_BY_DIR = {
  'lop10/chuong01-menh-de-va-tap-hop': 'sgk-l10-c01',
  'lop10/chuong02-bat-phuong-trinh-va-he-bat-phuong-trinh-bac-nhat-hai-an': 'sgk-l10-c02',
  'lop11/chuong01-ham-so-luong-giac-va-phuong-trinh-luong-giac': 'sgk-l11-c01',
  'lop11/chuong02-day-so-cap-so-cong-va-cap-so-nhan': 'sgk-l11-c02',
  'lop12/chuong01-ung-dung-dao-ham': 'sgk-l12-c01',
  'lop12/chuong02-vecto-va-he-truc-toa-do': 'sgk-l12-c02',
  'lop12/chuong03-thong-ke': 'sgk-l12-c03',
  'lop12/phu-luc-kien-thuc-nen': 'sgk-l12-pl',
}

/** Đọc danh sách `\input{chapters/...}` theo đúng thứ tự trong một file chính. */
function readMainFile(name) {
  const p = join(TEX_ROOT, name)
  if (!existsSync(p)) throw new Error(`Không thấy file chính ${name}`)
  const out = []
  for (const m of readFileSync(p, 'utf8').matchAll(/\\input\{chapters\/([^}]+)\}/g)) {
    out.push(m[1])
  }
  return out
}

function relToCategory(rel) {
  const dir = rel.slice(0, rel.lastIndexOf('/'))
  const cat = CATEGORY_BY_DIR[dir]
  if (!cat) throw new Error(`Chưa ánh xạ thư mục "${dir}" sang chương nào. Bổ sung vào CATEGORY_BY_DIR.`)
  return cat
}

// ---------------------------------------------------------------------------
// 1. Gom danh sách bài từ ba file chính
// ---------------------------------------------------------------------------
const lessons = []
for (const main of ['filechinh-lop10.tex', 'filechinh-lop11.tex', 'filechinh-lop12.tex']) {
  for (const rel of readMainFile(main)) {
    const file = join(TEX_ROOT, 'chapters', `${rel}.tex`)
    if (!existsSync(file)) throw new Error(`${main} nạp ${rel} nhưng không có file`)
    const parsed = parseTexFile(readFileSync(file, 'utf8'))
    if (!parsed.title) throw new Error(`${rel}: thiếu \\LessonBox nên không có tiêu đề`)
    lessons.push({
      rel,
      categoryId: relToCategory(rel),
      title: parsed.title,
      slug: parsed.slug,
      contentMd: parsed.contentMd,
      blocks: parsed.blocks || [],
      tikzCount: (parsed.tikzBlocks || []).length,
    })
  }
}

// Trùng (chương, tiêu đề) là lỗi dữ liệu, không phải chuyện script tự xử được.
const seen = new Map()
for (const l of lessons) {
  const k = `${l.categoryId}\u0000${l.title}`
  if (seen.has(k)) throw new Error(`Trùng (chương, tiêu đề): "${l.title}" ở cả ${seen.get(k)} và ${l.rel}`)
  seen.set(k, l.rel)
}

// ---------------------------------------------------------------------------
// 2. Đọc trạng thái hiện có trên database
// ---------------------------------------------------------------------------
const categories = await rest('categories?select=id,topic_id')
const topicByCategory = new Map(categories.map(c => [c.id, c.topic_id]))
const sections = await rest('sections?select=id,category_id,name,order_index')
const theories = await rest('theories?select=id,section_id,title,is_published')
const categoryBySection = new Map(sections.map(s => [s.id, s.category_id]))

/*
  Đối chiếu theo BÀI LÝ THUYẾT, không theo tên section.

  Section và theory không bắt buộc cùng tên: bốn bài nhập tay trước đây có section
  tên "Bài 1. Ôn tập đạo hàm" trong khi theory tên "ÔN TẬP ĐẠO HÀM". Khớp theo tên
  section thì ba trong bốn bài đó bị coi là mới, script đẻ bản trùng, còn bản cũ
  (đang lỗi `Misplaced \hline`) vẫn nằm nguyên cho học sinh đọc.

  Tiêu đề theory thì lấy thẳng từ `\LessonBox` nên luôn khớp với file .tex.
*/
function findTheory(categoryId, title) {
  return theories.find(t =>
    categoryBySection.get(t.section_id) === categoryId &&
    (t.title || '').trim() === title.trim()
  )
}

/** Id ổn định cho section mới: chương + tên file, nên chạy lại luôn ra cùng id. */
function newSectionId(l) {
  const base = l.rel.slice(l.rel.lastIndexOf('/') + 1)
  return `${l.categoryId}--${base}`.slice(0, 120)
}

// ---------------------------------------------------------------------------
// 3. Lên kế hoạch
// ---------------------------------------------------------------------------
const plan = []
const orderByCategory = new Map()
for (const l of lessons) {
  const n = orderByCategory.get(l.categoryId) ?? 0
  orderByCategory.set(l.categoryId, n + 1)

  const theory = findTheory(l.categoryId, l.title)
  plan.push({
    ...l,
    orderIndex: n,
    sectionId: theory?.section_id ?? newSectionId(l),
    sectionExists: !!theory,
    theoryId: theory?.id,
    action: theory ? 'CẬP NHẬT' : 'TẠO MỚI',
  })
}

console.log(`Kho LaTeX: ${TEX_ROOT}`)
console.log(`${lessons.length} bài trong ba file chính · ${WRITE ? 'CHẾ ĐỘ GHI' : 'CHẠY THỬ (không ghi gì)'}\n`)

let lastCat = ''
for (const p of plan) {
  if (p.categoryId !== lastCat) { console.log(`  [${p.categoryId}]`); lastCat = p.categoryId }
  const marks = [
    p.sectionExists ? '' : 'section mới',
    `${p.blocks.length} khối`,
    p.tikzCount ? `${p.tikzCount} hình` : '',
  ].filter(Boolean).join(', ')
  console.log(`    ${p.action.padEnd(9)} ${p.title.slice(0, 52).padEnd(54)} ${marks}`)
}
const nNew = plan.filter(p => p.action === 'TẠO MỚI').length
console.log(`\nTổng: ${nNew} tạo mới, ${plan.length - nNew} cập nhật.`)

if (!WRITE) {
  console.log('\nChạy thử — chưa ghi gì. Thêm --ghi để thực hiện.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 4. Ghi
// ---------------------------------------------------------------------------
let created = 0, updated = 0, blocksWritten = 0
for (const p of plan) {
  if (!p.sectionExists) {
    await rest('sections', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: p.sectionId,
        category_id: p.categoryId,
        topic_id: topicByCategory.get(p.categoryId) ?? null,
        name: p.title,
        description: null,
        order_index: p.orderIndex,
      }),
    })
  }

  const payload = {
    section_id: p.sectionId,
    title: p.title,
    slug: p.slug,
    description: `Bài lý thuyết: ${p.title}`,
    content_md: p.contentMd,
    order_index: p.orderIndex,
    updated_at: new Date().toISOString(),
  }

  let theoryId = p.theoryId
  if (theoryId) {
    // KHÔNG đụng `is_published`: bài đang cho học sinh đọc phải giữ nguyên.
    await rest(`theories?id=eq.${encodeURIComponent(theoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    updated++
  } else {
    const rows = await rest('theories', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...payload, difficulty_level: 3, is_published: false }),
    })
    theoryId = rows[0].id
    created++
  }

  /* Khối tri thức: xoá rồi ghi lại, không cố khớp từng khối. Người soạn thêm,
     bớt, đổi thứ tự khối trong file .tex; khớp từng cái sẽ để lại khối mồ côi
     của lần nhập trước, và khối mồ côi thì hiện ra cho học sinh y như khối thật. */
  await rest(`knowledge_blocks?theory_id=eq.${encodeURIComponent(theoryId)}`, { method: 'DELETE' })
  if (p.blocks.length) {
    await rest('knowledge_blocks', {
      method: 'POST',
      body: JSON.stringify(p.blocks.map((b, i) => ({
        theory_id: theoryId,
        block_type: b.blockType,
        title: b.title || null,
        body_md: b.bodyMd || null,
        order_index: i,
        external_id: b.externalId || null,
      }))),
    })
    blocksWritten += p.blocks.length
  }
  process.stdout.write('.')
}

console.log(`\n\nXong: ${created} bài tạo mới, ${updated} bài cập nhật, ${blocksWritten} khối tri thức.`)
console.log('Bài mới ở trạng thái NHÁP — vào /admin/theories xuất bản khi đã xem lại.')
