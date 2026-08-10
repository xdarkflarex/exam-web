/**
 * Test cho parser LaTeX của lý thuyết.
 *
 * Mọi trường hợp dưới đây đều là lỗi CÓ THẬT quan sát được khi nhập file
 * `bai02-tinh-don-dieu-cua-ham-so.tex` lần đầu (2026-08-09), không phải tình
 * huống tưởng tượng. Bản sao file đó nằm ở `fixtures/theory-bai02-tinh-don-dieu.tex`
 * để test chạy được mà không cần kho LaTeX bên cạnh.
 *
 * Ba nhóm quan trọng nhất:
 * - Display math `\[...\]` phải ra `$$...$$`. Bản cũ khôi phục placeholder bằng
 *   chuỗi, mà trong chuỗi thay thế `$$` nghĩa là MỘT dấu `$` — nên mọi công
 *   thức tách dòng tụt xuống thành inline.
 * - Hình TikZ phải ra khối ```tikz, kể cả khi nằm trong ô của `tabular`.
 * - Tiêu đề khối đọc bằng ngoặc cân bằng, vì có tiêu đề chứa `$\{0\}$`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { latexToMarkdown, parseKnowledgeBlocks, parseTexFile } from './latex-parser.ts'

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/theory-bai02-tinh-don-dieu.tex',
)

const countOf = (text: string, pattern: RegExp) => (text.match(pattern) || []).length

// ==============================================
// DISPLAY MATH
// ==============================================

test('\\[...\\] ra $$...$$ chứ không tụt xuống một dấu $', () => {
  const md = latexToMarkdown('Ta có\n\\[\ny=x^3-3x.\n\\]\nxong.')

  assert.match(md, /\$\$\ny=x\^3-3x\.\n\$\$/)
  assert.equal(countOf(md, /\$\$/g), 2)
})

test('nội dung có $ không bị String.replace nuốt khi khôi phục placeholder', () => {
  // "$&" và "$`" là ký hiệu đặc biệt của chuỗi thay thế; phải giữ nguyên văn
  const md = latexToMarkdown('\\[\na \\& b \\quad c\n\\]')

  assert.ok(md.includes('a \\& b'), md)
})

// ==============================================
// TIKZ
// ==============================================

test('mỗi tikzpicture thành đúng một khối ```tikz', () => {
  const tex = readFileSync(FIXTURE, 'utf8')
  const parsed = parseTexFile(tex)

  assert.equal(parsed.tikzBlocks.length, 8)
  assert.equal(countOf(parsed.contentMd, /```tikz/g), 8)
  // Không còn tikzpicture nào nằm trần cho MathJax gặm
  assert.equal(countOf(parsed.contentMd, /```/g), 16)
})

test('tikz trong ô tabular vẫn giữ nguyên hình', () => {
  const tex = [
    '\\begin{tabular}{|c|c|}',
    '\\hline',
    '\\textbf{Tên} & \\textbf{Hình}\\\\ \\hline',
    'Đoạn $[a;b]$ & \\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\\\\ \\hline',
    '\\end{tabular}',
  ].join('\n')

  const md = latexToMarkdown(tex)

  assert.equal(countOf(md, /```tikz/g), 1)
  assert.ok(md.includes('\\draw (0,0)--(1,1);'), md)
  // Trải thành dòng chứ không nhét hình vào ô bảng Markdown
  assert.ok(!/\|.*```tikz/.test(md), md)
  assert.ok(md.includes('**Đoạn $[a;b]$**'), md)
  assert.ok(md.includes('**Hình:**') === false, md)
})

test('khai báo cột có ngoặc lồng vẫn thành bảng Markdown', () => {
  const tex = [
    '\\begin{tabular}{|p{0.40\\textwidth}|p{0.24\\textwidth}|}',
    '\\hline',
    'Một & Hai\\\\ \\hline',
    'Ba & Bốn\\\\ \\hline',
    '\\end{tabular}',
  ].join('\n')

  const md = latexToMarkdown(tex)

  assert.ok(md.includes('| Một | Hai |'), md)
  assert.ok(!md.includes('\\textwidth'), md)
})

// ==============================================
// KHỐI TRI THỨC
// ==============================================

test('tiêu đề khối có ngoặc không bị cắt cụt', () => {
  const tex =
    '\\begin{chuy}[id-rong]{Phân biệt $\\varnothing$, $\\{0\\}$ và $\\{\\varnothing\\}$}\n' +
    '\\begin{itemize}\n' +
    '\\item $\\varnothing$ không có phần tử.\n' +
    '\\end{itemize}\n' +
    '\\end{chuy}'

  const [block] = parseKnowledgeBlocks(tex)

  assert.equal(block.title, 'Phân biệt $\\varnothing$, $\\{0\\}$ và $\\{\\varnothing\\}$')
  assert.equal(block.externalId, 'id-rong')
  // Thân khối phải sạch \item — trước đây phần đuôi tiêu đề trôi vào đây
  assert.ok(!block.bodyMd.includes('\\item'), block.bodyMd)
  assert.ok(block.bodyMd.startsWith('- '), block.bodyMd)
})

test('đọc đủ khối và cạnh của bài thật', () => {
  const parsed = parseTexFile(readFileSync(FIXTURE, 'utf8'))

  assert.equal(parsed.title, 'TÍNH ĐƠN ĐIỆU CỦA HÀM SỐ')
  assert.equal(parsed.externalId, 'lop12-bai02')
  assert.equal(parsed.blocks.length, 10)
  assert.equal(
    parsed.blocks.reduce((sum, block) => sum + block.edges.length, 0),
    9,
  )
  assert.deepEqual(parsed.blocks[0].edges, [])
  assert.deepEqual(parsed.blocks[1].edges, [
    { relation: 'prerequisite', toExternalId: 'bai02-dn-tinh-don-dieu' },
  ])
})

test('không tự sinh ký tự # ngoài các heading Markdown', () => {
  const parsed = parseTexFile(readFileSync(FIXTURE, 'utf8'))

  // File nguồn không có dấu # nào; mọi dấu # trong kết quả phải là heading `## `
  assert.equal(countOf(readFileSync(FIXTURE, 'utf8'), /#/g), 0)
  assert.equal(countOf(parsed.contentMd, /#/g), countOf(parsed.contentMd, /^## /gm) * 2)
})

// ==============================================
// LỆNH VĂN BẢN
// ==============================================

test('\\textbf có ngoặc lồng bên trong vẫn được chuyển', () => {
  const md = latexToMarkdown('\\textbf{Vectơ $\\vec{a}$ khác $\\vec{0}$}')

  assert.equal(md, '**Vectơ $\\vec{a}$ khác $\\vec{0}$**')
})

test('enumerate ra danh sách đánh số, itemize ra gạch đầu dòng', () => {
  const md = latexToMarkdown(
    '\\begin{enumerate}[leftmargin=2.3em]\n\\item Tìm tập xác định.\n\\item Tính đạo hàm.\n\\end{enumerate}',
  )

  assert.ok(md.includes('1. Tìm tập xác định.'), md)
  assert.ok(md.includes('2. Tính đạo hàm.'), md)

  const bullets = latexToMarkdown('\\begin{itemize}\n\\item Một\n\\item Hai\n\\end{itemize}')
  assert.ok(bullets.includes('- Một'), bullets)
  assert.ok(bullets.includes('- Hai'), bullets)
})

test('\\choice thành bốn phương án A B C D', () => {
  const md = latexToMarkdown('Độ dài bằng\n\\choice{$14$}{$\\sqrt{14}$}{$6$}{$\\sqrt6$}')

  assert.ok(md.includes('**A.** $14$'), md)
  assert.ok(md.includes('**B.** $\\sqrt{14}$'), md)
  assert.ok(md.includes('**D.** $\\sqrt6$'), md)
  assert.ok(!md.includes('\\choice'), md)
})

test('\\renewcommand{\\arraystretch} bị gỡ khỏi math', () => {
  const md = latexToMarkdown(
    '\\[\n\\renewcommand{\\arraystretch}{1.8}\n\\begin{array}{c|c}a & b\\end{array}\n\\]',
  )

  assert.ok(!md.includes('renewcommand'), md)
  assert.ok(!md.includes('arraystretch'), md)
  assert.ok(md.includes('\\begin{array}{c|c}'), md)
})

test('lệnh cỡ chữ bị gỡ, không rơi vào Markdown', () => {
  const md = latexToMarkdown('\\small Bảng dưới đây \\normalsize xong.')

  assert.ok(!md.includes('\\small'), md)
  assert.ok(!md.includes('\\normalsize'), md)
  assert.ok(md.includes('Bảng dưới đây'), md)
})
