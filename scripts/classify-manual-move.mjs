#!/usr/bin/env node
/**
 * CHUYỂN CHƯƠNG cho những câu người đọc tay xác định là đang nằm sai.
 *
 * ==========================================================================
 * NGUỒN GỐC: lượt rà 2026-09-12
 *
 * Tài khoản DeepSeek hết tiền sau 632/1621 câu, nên 988 câu còn lại được rà
 * bằng người. Cách làm — vì đọc tay 988 câu là lãng phí:
 *
 *   1. Chia theo phán quyết của LUẬT: 625 câu luật đồng ý với DB (hai nguồn đã
 *      khớp), 27 câu luật mâu thuẫn (đã biết), 336 câu luật IM LẶNG.
 *   2. Với mọi câu đã phân loại, chạy một phép kiểm độc lập: **câu này có mang
 *      dấu hiệu nào của chính chương nó đang nằm không?** Không có dấu hiệu nào
 *      thì đáng ngờ.
 *   3. Người đọc 59 câu bị gắn cờ (23 + 36), không đọc 1561 câu còn lại.
 *
 * Phép kiểm ở bước 2 là ĐỘC LẬP với lớp luật: luật hỏi "câu này thuộc mạch
 * nào", phép kiểm hỏi "câu này có giống chỗ nó đang đứng không". Hai câu hỏi
 * khác nhau, nên nó bắt được cả những chỗ luật và DB cùng sai.
 *
 * MỘT BÀI HỌC ĐÃ TRẢ GIÁ: bản đầu của phép kiểm viết mẫu `/\sin/` — MỘT dấu
 * chéo ngược. Trong regex, `\s` là khoảng trắng, nên nó dò " in" chứ không dò
 * `\sin`, và 40 câu lượng giác đúng chỗ bị gắn cờ oan. Đây đúng là cái bẫy mà
 * hợp đồng mục B3 nói: ký hiệu LaTeX phải neo vào dạng lệnh, và mẫu phải được
 * thử trên văn bản thật trước khi tin.
 * ==========================================================================
 *
 * CÁCH DÙNG
 *   node --env-file=.env scripts/classify-manual-move.mjs          # chạy thử
 *   node --env-file=.env scripts/classify-manual-move.mjs --ghi
 *
 * ĐÂY LÀ GHI ĐÈ, không phải thêm mới — sao lưu dòng cũ trước khi ghi.
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--ghi')

const T_DAI_SO = 'fe1a5ca5-3579-4978-9a36-8c5793527da5'
const T_GIAI_TICH = '8a789a14-9c07-4dde-a3b3-9db66bd7d311'
const T_HINH = 'a5370b64-b66a-4b18-bdec-2f758809fb80'

const C = {
  CSC: { topic: T_DAI_SO, category: '5bbb4dbe-df45-450e-bf2b-22eb963d31eb' },
  CSN: { topic: T_DAI_SO, category: '97270c22-2b27-4ede-bc01-57219b1c4493' },
  TAP_HOP: { topic: T_DAI_SO, category: 'c47ddc17-1381-4a17-894c-9050d6a17501' },
  LUONG_GIAC: { topic: T_DAI_SO, category: 'e8c12fb3-efd9-479a-8be4-e1c1cebe47e3' },
  MU_LOG: { topic: T_DAI_SO, category: '739243e0-291e-41a0-ac8f-966cde91b4ec' },
  DAO_HAM_11: { topic: T_DAI_SO, category: '1077350c-e06e-4493-9e03-a11bda2545db' },
  GIAI_TICH: { topic: T_GIAI_TICH, category: 'f4c4d33f-d961-445e-99b6-0eccddbca9ca' },
  TICH_PHAN: { topic: T_GIAI_TICH, category: 'a4afd233-c7da-43fe-9dde-8b9ddf70ab88' },
  TOA_DO_KG: { topic: T_HINH, category: '961529ea-9871-474f-b2bb-924abcf77d03' },
  VECTO_KG: { topic: T_HINH, category: 'd3e29b68-a474-444f-9b69-88b1d67676f9' },
}

/** Mỗi dòng: id → đích, kèm LÝ DO. Không có lý do thì lần sau không ai dám giữ. */
const CHUYEN = [
  // --- "Tổ hợp và nhị thức Newton" đang giữ một loạt bài CẤP SỐ -------------
  ['ĐS.THVN.QTĐH.TSHV.TH.018', C.CSC, 'Tổ ong: vòng 1 có 6 ô, vòng 2 có 12, vòng 3 có 18 — công sai 6.'],
  ['ĐS.THVN.QTĐH.TSHV.TH.023', C.CSC, 'Tổng 100 số tự nhiên lẻ đầu tiên — tổng cấp số cộng công sai 2.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.004', C.CSC, 'Hội trường 10 dãy, dãy sau hơn dãy trước 8 ghế — công sai 8.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.008', C.CSC, 'Quyên góp: mỗi ngày góp hơn ngày trước một lượng không đổi.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.011', C.CSC, 'Bàn cờ hạt dẻ: ô sau hơn ô trước 5 hạt — công sai 5.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.013', C.CSC, 'Tích góp: tháng sau hơn tháng trước 2 triệu — công sai 2.'],
  ['ĐS.THVN.QTĐH.QTCQ.VD.001', C.CSN, 'Aladin: số điều ước GẤP ĐÔI mỗi ngày — công bội 2.'],
  ['ĐS.THVN.QTĐH.TSHV.TH.032', C.CSN, 'S = 1 + 3 + 3^2 + … + 3^2018 — tổng cấp số nhân công bội 3.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.003', C.CSN, 'Tháp 9 tầng, mỗi tầng bằng 2/3 tầng dưới — công bội 2/3.'],
  ['ĐS.THVN.QTĐH.TSHV.VD.012', C.CSN, 'Bungee: mỗi lần nảy bằng 75% lần trước — công bội 0,75.'],
  // Ngược chiều: bài BAO HÀM – LOẠI TRỪ bị xếp vào tổ hợp/cấp số.
  ['ĐS.THVN.QTĐH.QTCQ.VD.002', C.TAP_HOP, 'Nhảy Flashmob và hát, có bạn tham gia CẢ HAI — bài giao/hợp tập hợp.'],
  ['ĐS.CSN.BTTH.BTTH.VD.001', C.TAP_HOP, 'Giỏi Toán/Lý/Hoá, có em giỏi cả hai, cả ba — bao hàm loại trừ, không phải cấp số.'],
  ['ĐS.CSN.BTTH.BTTH.VD.002', C.TAP_HOP, 'Cùng dạng bao hàm loại trừ như trên.'],

  // --- Bài cấp số nấp trong chương HÌNH và chuyên đề ------------------------
  ['HHVĐ.HHKG.QHVG.TĐTT.VD.002', C.CSN, 'Tam giác đều nội tiếp lặp lại — diện tích lập thành cấp số nhân.'],
  ['HHVĐ.HHKG.QHVG.TĐTT.VD.003', C.CSN, 'Tháp 11 tầng, mỗi tầng bằng NỬA tầng dưới — công bội 1/2.'],
  ['Q_1768375520125_5U25ZLN', C.CSN, 'Diện tích rừng tăng 0,7%/năm — tăng trưởng kép, cấp số nhân.'],
  ['MSYT.MSYT.UDĐH.VDĐĐ.VD.003', C.CSN, 'Số kẹo giảm một nửa sau mỗi gợi ý — công bội 1/2.'],
  ['ĐS.HSMV.HSMV.TXĐT.TH.001', C.CSN, 'Dân số tăng 1,4%/năm trong 5 năm — tăng trưởng kép.'],
  ['XS>C.CĐ1U.VDKT.GTĐR.TH.001', C.CSC, 'Đàn kiến tăng 900 con mỗi tháng — công sai 900.'],
  ['ĐS.LG(1.PTLG.GPTS.VD.003', C.CSC, 'Xếp đồng xu thành mô hình tăng đều theo hàng — cấp số cộng.'],

  // --- Bài giới hạn / tiệm cận nằm trong chương THỐNG KÊ --------------------
  ['Q_1781846372236_KUSU8FL', C.GIAI_TICH, 'Từ các giới hạn một bên suy ra tiệm cận — khảo sát hàm số.'],
  ['Q_1781846372265_X6TJW8R', C.GIAI_TICH, 'Như trên: giới hạn một bên và tiệm cận.'],
  ['Q_1781846372283_QZ5BU90', C.GIAI_TICH, 'Giới hạn tại vô cực suy ra tiệm cận ngang.'],
  ['MSYT.MSYT.UDĐH.UDĐH.VD.002', C.GIAI_TICH, 'Hàm cầu p = 354/(1+0,01x) — ứng dụng đạo hàm, không phải thống kê.'],
  ['Q_1770187080217_KOVLKGH', C.DAO_HAM_11, 'Dùng ĐỊNH NGHĨA đạo hàm để tính giới hạn — mạch đạo hàm lớp 11.'],

  // --- Lạc chương, mỗi câu một lý do ----------------------------------------
  ['Q_1767699001442_OCN896G', C.VECTO_KG, 'Hình hộp ABCD.A\'B\'C\'D\' với các phép toán vectơ trong KHÔNG GIAN.'],
  ['HHVĐ.HHTĐ.TĐCV.TĐTĐ.NB.001', C.TOA_DO_KG, 'Đề ghi rõ "Trong KHÔNG GIAN", điểm có ba toạ độ — không phải toạ độ phẳng.'],
  ['Q_1770887927120_65G07ZP', C.MU_LOG, 'Giải (1/3)^(-2x-1) = 27 — phương trình mũ, không liên quan tích phân.'],
  ['Q_1770887927128_LIBAQ1A', C.GIAI_TICH, 'f(x) = sin2x - 2x: đạo hàm, đơn điệu, GTLN — cùng họ với 6 câu khác đã ở giải tích.'],
  ['Q_1768375520107_EGJ0HM4', C.TICH_PHAN, 'Diện tích hình phẳng giới hạn bởi hai đồ thị — ứng dụng tích phân.'],
  ['Q_1770895998015_KMYQ5SU', C.GIAI_TICH, 'Doanh thu = x(10000 - x), tìm giá trị lớn nhất — tối ưu, không phải cấp số cộng.'],
  ['TK.TKLT.BTTH.BTTH.VD.009', C.LUONG_GIAC, 'Vệ tinh quay quỹ đạo tròn, 2 giờ một vòng — góc lượng giác và chuyển động tròn.'],
  ['XS>C.CĐ1U.VDKT.GTĐR.TH.002', C.LUONG_GIAC, 'Bánh xe quay bao nhiêu vòng mỗi giây — chuyển động tròn, góc lượng giác.'],
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function lay(u, o) {
  for (let i = 0; i < 5; i++) {
    try { return await fetch(u, o) } catch (e) { if (i === 4) throw e; await new Promise((r) => setTimeout(r, 800 * (i + 1))) }
  }
}
async function all(path, page = 500) {
  const out = []
  for (let from = 0; ; from += page) {
    const res = await lay(`${url}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + page - 1}` } })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < page) return out
  }
}

const cats = await all('categories?select=id,name,topic_id')
const catById = new Map(cats.map((c) => [c.id, c]))
const tax = await all('question_taxonomy?select=question_id,topic_id,category_id,section_id,subsection_id')
const taxBy = new Map(tax.map((r) => [r.question_id, r]))

const rows = []
const cu = []
const thieu = []
for (const [id, dich, lyDo] of CHUYEN) {
  const hienTai = taxBy.get(id)
  if (!hienTai) { thieu.push(id); continue }
  const c = catById.get(dich.category)
  if (!c) throw new Error(`Chương không tồn tại: ${dich.category} (câu ${id})`)
  if (c.topic_id !== dich.topic) throw new Error(`Chương ${c.name} không thuộc chủ đề đã chọn (câu ${id})`)
  if (hienTai.category_id === dich.category) continue
  cu.push(hienTai)
  /* Đổi chương thì XOÁ hai tầng dưới: `question_taxonomy` là một ĐƯỜNG ĐI trong
     cây, giữ `section_id` cũ sẽ tạo dòng mà mục không thuộc chương — dữ liệu tự
     mâu thuẫn, và mọi bộ lọc theo cây đọc sai từ đó. */
  rows.push({ question_id: id, topic_id: dich.topic, category_id: dich.category, section_id: null, subsection_id: null })
  const tuTen = catById.get(hienTai.category_id)?.name ?? '(trống)'
  console.log(`${tuTen.slice(0, 40).padEnd(42)} →  ${c.name.slice(0, 26).padEnd(28)} ${id}`)
  console.log(`   ${lyDo}`)
}

if (thieu.length) console.log(`\nKhông tìm thấy trong question_taxonomy: ${thieu.join(', ')}`)
console.log(`\nSẽ chuyển ${rows.length} câu · Chế độ: ${WRITE ? 'GHI THẬT' : 'CHẠY THỬ'}`)

if (!WRITE) {
  console.log('Chạy thử — chưa ghi gì. Thêm --ghi để thực hiện.')
  process.exit(0)
}

/* GHI ĐÈ thì phải sao lưu: không có bảng lịch sử cho `question_taxonomy`, ghi
   đè xong là mất hẳn trạng thái trước (hợp đồng mục F3). */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = resolve(APP, `.taxonomy-backup-${stamp}.json`)
writeFileSync(file, JSON.stringify(cu, null, 2), 'utf8')
console.log(`Đã sao lưu ${cu.length} dòng cũ vào ${file}`)
console.log('Lùi lại: POST lại file đó với Prefer: resolution=merge-duplicates')

const res = await lay(`${url}/rest/v1/question_taxonomy`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify(rows),
})
if (!res.ok) throw new Error(`POST -> ${res.status} ${(await res.text()).slice(0, 300)}`)
console.log(`Xong: chuyển ${rows.length} câu.`)
