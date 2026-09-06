#!/usr/bin/env node
/**
 * XUẤT BẢN BÀI LÝ THUYẾT ĐANG Ở DẠNG NHÁP, kèm chấm sao độ khó.
 *
 * VÌ SAO CÓ SCRIPT NÀY THAY VÌ BẤM TỪNG BÀI Ở /admin/theories
 * Bấm tay 14 bài thì được, nhưng KHÔNG kiểm được gì trước khi bấm. Ba lớp lỗi đã
 * gặp thật ở dự án này đều chỉ lộ ra SAU khi học sinh mở bài:
 *
 *   1. Công thức lỗi cú pháp — hiện chữ đỏ "Misplaced hline" giữa bài
 *      (2026-09-05, do parser để lọt placeholder ra ngoài).
 *   2. Hình TikZ chưa dựng sẵn — rơi xuống TikZJax, mà TikZJax không có `tkz-tab`
 *      và không biết màu riêng của bộ bài, nên ra khung mã nguồn thay vì hình.
 *   3. Bài không đủ chuỗi section -> category -> topic — `/learn` join bằng
 *      PostgREST nên bài rơi ra khỏi cây: xuất bản rồi mà không ai thấy.
 *
 * Script chạy cả ba phép kiểm TRƯỚC khi ghi, và không ghi gì nếu có bài hỏng.
 *
 * ĐỘ KHÓ: `theories.difficulty_level` là 1..5, hiện thành sao ở `/admin/theories`.
 * Nó KHÔNG khoá bài, không lọc bài, không đụng tới điểm — `/learn` có mang nó
 * xuống thẻ nhưng không vẽ ra. Tức đây là ghi chú cho giáo viên; chấm sai thì sửa
 * lại ở trang soạn bài, không có hậu quả nào với học sinh.
 *
 * Trình nhập từ LaTeX đặt cứng `difficulty_level: 3` cho mọi bài tạo mới
 * (`import-theories-from-latex.mjs`), nên số 3 của một bài mới nhập KHÔNG phải
 * một đánh giá — nó là giá trị mặc định. Bảng dưới thay mặc định đó bằng một
 * thang có nghĩa:
 *
 *   1 - chỉ cần nhớ, không có kỹ thuật nào
 *   2 - một quy trình, áp thẳng vào là ra
 *   3 - vài quy trình, phải chọn đúng cái nào
 *   4 - phải phối hợp nhiều công cụ, sai một bước là hỏng cả bài
 *   5 - tổng hợp cả chương hoặc mô hình hoá nhiều bước, chỗ mất điểm nhiều nhất
 *
 * Thang căn theo chính các bài thầy đã tự chấm: MỆNH ĐỀ 2, PHƯƠNG TRÌNH LƯỢNG
 * GIÁC CƠ BẢN 3, CÔNG THỨC LƯỢNG GIÁC 4, CẤP SỐ NHÂN 5.
 *
 * CHỈ ĐỤNG BÀI CÒN NHÁP. Bài đã xuất bản là bài thầy đã đọc và duyệt; chấm đè lên
 * đó là lấy phỏng đoán của máy ghi đè lên đánh giá của người dạy.
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/publish-theories.mjs          (chạy thử)
 *   node --env-file=.env scripts/publish-theories.mjs --ghi     (ghi thật)
 *
 * HOÀN TÁC: file `.theories-published-<dấu thời gian>.json` ghi lại trạng thái cũ
 * của đúng những bài bị đổi; PATCH ngược lại là về nguyên trạng.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--ghi')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.status === 204 ? null : res.json()
}

/**
 * Chấm theo `section_id` chứ không theo tiêu đề: hai chương khác nhau đều có bài
 * tên "HỆ THỐNG HÓA VÀ BÀI TẬP CUỐI CHƯƠNG", khớp theo tên là chấm nhầm bài.
 */
const DO_KHO = {
  // Lớp 11 chương 2 — bài tập cuối chương, gộp dãy số + cấp số cộng + cấp số
  // nhân, có cả bài mô hình thực tế (bậc cầu thang, tế bào phân đôi). Thầy đã
  // chấm riêng CẤP SỐ NHÂN là 5.
  'sgk-l11-c02--bai-tap-cuoi-chuong02': 5,

  // Lớp 12 chương 1 — ứng dụng đạo hàm.
  // Tiệm cận: quy trình rõ nhưng đầy bẫy (bội nghiệm, điểm loại, hai tiệm cận ngang).
  'sgk-l12-c01--bai05-duong-tiem-can-cua-do-thi-ham-so': 4,
  // Khảo sát: bài nặng nhất chương, ba lớp hàm cộng phần đọc ngược đồ thị ra hàm.
  'sgk-l12-c01--bai06-khao-sat-su-bien-thien-va-ve-do-thi-ham-so': 5,
  // Bài toán thực tế: mô hình hoá nhiều bước, chỗ học sinh mất điểm nhiều nhất.
  'sgk-l12-c01--bai07-ung-dung-dao-ham-giai-bai-toan-thuc-te': 5,

  // Lớp 12 chương 2 — vectơ và toạ độ trong không gian.
  'sgk-l12-c02--bai01-vecto-trong-khong-gian': 4,
  // Toạ độ Oxyz: ý tưởng đơn giản, việc chính là gắn hệ trục vào hình.
  'sgk-l12-c02--bai02-he-truc-toa-do-trong-khong-gian': 3,
  'sgk-l12-c02--bai03-bieu-thuc-toa-do-cua-cac-phep-toan-vecto': 4,
  'sgk-l12-c02--bai04-bai-tap-cuoi-chuong': 5,

  // Lớp 12 chương 3 — thống kê mẫu ghép nhóm. Mỗi bài một quy trình, làm theo
  // bảng là ra; bài cuối chương thì có thêm dạng ngược (tìm tần số chưa biết).
  'sgk-l12-c03--bai01-khoang-bien-thien-va-khoang-tu-phan-vi': 3,
  'sgk-l12-c03--bai02-phuong-sai-va-do-lech-chuan': 3,
  'sgk-l12-c03--bai03-bai-tap-cuoi-chuong': 4,

  // Phụ lục — tra cứu kiến thức nền, đọc để nhớ lại chứ không phải bài mới.
  'sgk-l12-pl--phu-luc-a-hinh-hoc-thcs': 2,
  'sgk-l12-pl--phu-luc-b-dai-so-toi-uu-lop10': 3,
  'sgk-l12-pl--phu-luc-c-conic-lop10': 3,
}

const drafts = await rest(
  'theories?is_published=eq.false&select=id,title,section_id,difficulty_level,content_md&order=section_id',
)
if (drafts.length === 0) {
  console.log('Không còn bài nháp nào.')
  process.exit(0)
}

console.log(`Bài đang ở dạng nháp: ${drafts.length}\n`)

// --------------------------------------------------------------------------
// KIỂM 1 — chuỗi section -> category -> topic
// --------------------------------------------------------------------------
const sectionIds = [...new Set(drafts.map((t) => t.section_id))]
const sections = await rest(
  `sections?select=id,name,category_id,categories(id,name,topic_id,topics(id,name))` +
    `&id=in.(${sectionIds.map((s) => `"${s}"`).join(',')})`,
)
const sectionById = new Map(sections.map((s) => [s.id, s]))
const mocNoi = drafts.filter((t) => {
  const s = sectionById.get(t.section_id)
  return !s || !s.categories || !s.categories.topics
})

// --------------------------------------------------------------------------
// KIỂM 2 — mọi hình TikZ đều đã có SVG dựng sẵn trong public/tikz
// --------------------------------------------------------------------------
const { tikzFigureKey } = await import(`file:///${APP}/src/lib/theories/tikz-figure-key.ts`)
const KHOI_TIKZ = /```tikz\n([\s\S]*?)```/g
const hinhThieu = []
let tongHinh = 0
for (const t of drafts) {
  for (const m of (t.content_md ?? '').matchAll(KHOI_TIKZ)) {
    tongHinh++
    const figKey = tikzFigureKey(m[1])
    if (!existsSync(resolve(APP, 'public', 'tikz', `${figKey}.svg`))) {
      hinhThieu.push({ title: t.title, figKey })
    }
  }
}

console.log(`Kiểm chuỗi cây tri thức : ${drafts.length - mocNoi.length}/${drafts.length} bài đủ section -> category -> topic`)
console.log(`Kiểm hình TikZ          : ${tongHinh - hinhThieu.length}/${tongHinh} hình đã có SVG dựng sẵn`)
console.log(`Kiểm công thức          : chạy riêng "npm run theories:check-math" (dùng chính MathJax của trình duyệt)\n`)

if (mocNoi.length) {
  console.log('THIẾU MẮT XÍCH TRONG CÂY — xuất bản thì bài không hiện ở /learn:')
  for (const t of mocNoi) console.log(`  ${t.section_id}  ${t.title}`)
}
if (hinhThieu.length) {
  console.log('THIẾU SVG DỰNG SẴN — hình sẽ rơi xuống TikZJax, nhiều khả năng ra khung mã nguồn:')
  for (const h of hinhThieu) console.log(`  ${h.figKey}  ${h.title}`)
  console.log('  Dựng bằng: npm run tikz:svg -- --chapters "D:/ToanTHPT/LATEX/HethongtrithucToanTHPT"')
}
if (mocNoi.length || hinhThieu.length) {
  console.log('\nDừng lại, không ghi gì. Sửa xong rồi chạy lại.')
  process.exit(1)
}

// --------------------------------------------------------------------------
// KẾ HOẠCH GHI
// --------------------------------------------------------------------------
const sao = (n) => '*'.repeat(n).padEnd(5, '.')
const chuaCham = []
console.log('Sẽ xuất bản:')
for (const t of drafts) {
  const moi = DO_KHO[t.section_id]
  if (moi === undefined) chuaCham.push(t)
  const ghiChu =
    moi === undefined
      ? `giữ ${t.difficulty_level} (chưa chấm)`
      : moi === t.difficulty_level
        ? `giữ ${moi}`
        : `${t.difficulty_level} -> ${moi}`
  console.log(`  ${sao(moi ?? t.difficulty_level)}  ${ghiChu.padEnd(18)}  ${t.title}`)
}
if (chuaCham.length) {
  console.log(`\n  ${chuaCham.length} bài chưa có trong bảng chấm — vẫn xuất bản, độ khó để nguyên.`)
}

if (!WRITE) {
  console.log('\nChạy thử — chưa ghi gì. Thêm --ghi để thực hiện.')
  process.exit(0)
}

/* Lưu trạng thái cũ TRƯỚC khi ghi. Không có bảng lịch sử cho `theories`, nên đây
   là đường lùi duy nhất. */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = resolve(APP, `.theories-published-${stamp}.json`)
writeFileSync(
  backup,
  JSON.stringify(
    drafts.map((t) => ({ id: t.id, title: t.title, is_published: false, difficulty_level: t.difficulty_level })),
    null,
    2,
  ),
  'utf8',
)
console.log(`\nĐã lưu trạng thái cũ vào ${backup}`)

/* PATCH từng bài chứ không upsert cả mảng: `content_md` dài tới 25 nghìn ký tự,
   và một lần upsert thiếu trường là ghi đè nội dung bài bằng NULL. */
let done = 0
for (const t of drafts) {
  const body = { is_published: true, updated_at: new Date().toISOString() }
  if (DO_KHO[t.section_id] !== undefined) body.difficulty_level = DO_KHO[t.section_id]
  await rest(`theories?id=eq.${encodeURIComponent(t.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
  done++
  process.stdout.write('.')
}
console.log(`\n\nXong: xuất bản ${done} bài.`)
console.log('Kiểm lại ở /learn, chọn đúng lớp và mở thử một bài có hình.')
