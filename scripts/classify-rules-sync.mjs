#!/usr/bin/env node
/**
 * Giữ lớp luật phân loại của `exam-web` và `question-bank` GIỐNG HỆT nhau.
 *
 * VÌ SAO CÓ FILE NÀY
 * `question-bank/src/services/classify-rules.ts` tự nhận là "bản song sinh" của
 * `exam-web/src/lib/questions/classify.ts`, và ép điều đó bằng đúng một dòng
 * chú thích "sửa một bên phải sửa cả bên kia". Đo ngày 2026-09-08: hai bản đã
 * lệch ở **8 điểm**, cộng hai khác biệt về đầu vào — mà chúng cùng ghi vào một
 * Supabase. Cùng một câu cho hai kết quả tuỳ mở app nào.
 *
 * Lời hứa trong chú thích không phải cơ chế. Đây mới là cơ chế.
 *
 * CÁCH LÀM
 * `exam-web` giữ bản GỐC. Script chép nguyên văn sang `question-bank` vào thư
 * mục `generated/`, chỉ đổi đúng một dòng import (đường dẫn khác nhau giữa hai
 * kho) và thêm một banner cố định. Không có bước nào phụ thuộc thời gian, nên
 * chép lại luôn ra đúng một byte — điều kiện để `--check` là phép so sánh thật.
 *
 * CÁCH DÙNG
 *   node scripts/classify-rules-sync.mjs            # xem có lệch không (mặc định)
 *   node scripts/classify-rules-sync.mjs --check    # như trên, thoát 1 khi lệch
 *   node scripts/classify-rules-sync.mjs --apply    # ghi đè bản bên question-bank
 *
 * `--check` cũng chạy trong `src/lib/questions/classify.test.ts`, và TỰ BỎ QUA
 * khi không tìm thấy thư mục anh em — máy khác chỉ clone một kho vẫn chạy test
 * được. Bỏ qua khi vắng mặt là đúng; im lặng khi CÓ mặt mà lệch thì không.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Thư mục kho question-bank. Anh em cùng cấp với exam-web. */
export const QUESTION_BANK = resolve(APP, '..', 'question-bank')

const BANNER = `/* ==========================================================================
 * FILE NÀY ĐƯỢC SINH RA — ĐỪNG SỬA TRỰC TIẾP.
 *
 * Bản gốc: exam-web/src/lib/questions/<TÊN FILE>
 * Sinh lại: (trong exam-web) node scripts/classify-rules-sync.mjs --apply
 *
 * Sửa ở đây thì lần chạy sau ghi đè mất, và trong lúc chưa chạy thì hai kho
 * phân loại cùng một câu ra hai chỗ khác nhau — trong khi chúng đẩy dữ liệu về
 * cùng một Supabase.
 * ========================================================================== */

`

/**
 * Các file phải giống nhau, và phép biến đổi tương ứng.
 *
 * `normalize.ts` đi kèm bắt buộc: nó quyết định văn bản mà mọi biểu thức trong
 * `classify.ts` chạy trên. Chép luật mà không chép bộ chuẩn hoá thì cùng bảng
 * luật vẫn cho hai kết quả — đúng một trong hai khác biệt đã đo được (bản
 * question-bank cũ GIỮ dấu câu, bản exam-web XOÁ).
 */
const FILES = [
  {
    source: 'src/lib/questions/normalize.ts',
    target: 'src/services/generated/questions-normalize.ts',
    transform: (text) => text,
  },
  {
    source: 'src/lib/questions/classify.ts',
    target: 'src/services/generated/classify-engine.ts',
    // Hai kho đặt bộ chuẩn hoá ở hai chỗ khác nhau. Đây là KHÁC BIỆT DUY NHẤT
    // được phép; mọi thứ còn lại phải trùng từng byte.
    transform: (text) => text.replace("from './normalize.ts'", "from './questions-normalize.ts'"),
  },
]

/** Nội dung mà mỗi file bên question-bank PHẢI có. */
export function buildTargets() {
  return FILES.map((file) => {
    const source = readFileSync(resolve(APP, file.source), 'utf8')
    const banner = BANNER.replace('<TÊN FILE>', file.source.split('/').pop())
    return {
      source: file.source,
      path: resolve(QUESTION_BANK, file.target),
      relative: file.target,
      content: banner + file.transform(source),
    }
  })
}

/**
 * So bản đã sinh với bản đang nằm trên đĩa.
 *
 * `skipped` khi không có kho anh em — KHÔNG phải lỗi, và cũng không phải "đạt".
 * Gộp hai trạng thái đó làm một là cách để một máy thiếu kho báo xanh mãi mãi.
 */
export function checkSync() {
  if (!existsSync(QUESTION_BANK)) {
    return { skipped: true, drifted: [], reason: `Không thấy ${QUESTION_BANK}` }
  }
  const drifted = []
  for (const target of buildTargets()) {
    const actual = existsSync(target.path) ? readFileSync(target.path, 'utf8') : null
    if (actual !== target.content) {
      drifted.push({ relative: target.relative, missing: actual === null })
    }
  }
  return { skipped: false, drifted }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const apply = process.argv.includes('--apply')

  if (!existsSync(QUESTION_BANK)) {
    console.log(`Bỏ qua: không thấy kho anh em ở ${QUESTION_BANK}.`)
    process.exit(0)
  }

  if (apply) {
    for (const target of buildTargets()) {
      mkdirSync(dirname(target.path), { recursive: true })
      writeFileSync(target.path, target.content, 'utf8')
      console.log(`Đã ghi  ${target.relative}   ← ${target.source}`)
    }
    console.log('\nXong. Chạy `npx tsc --noEmit` bên question-bank để chắc nó vẫn biên dịch.')
    process.exit(0)
  }

  const result = checkSync()
  if (result.drifted.length === 0) {
    console.log('Hai kho khớp nhau.')
    process.exit(0)
  }
  console.error('LỆCH — bản bên question-bank không khớp bản gốc:\n')
  for (const item of result.drifted) {
    console.error(`  ${item.missing ? 'THIẾU  ' : 'KHÁC   '} ${item.relative}`)
  }
  console.error('\nChạy `node scripts/classify-rules-sync.mjs --apply` để đồng bộ.')
  process.exit(1)
}
