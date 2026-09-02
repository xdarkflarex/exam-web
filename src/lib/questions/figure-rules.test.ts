import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditFigures, checkFigure, mentionsFigure } from './figure-rules.ts'
import { extractTikz, findTikzBlocks, hasInlineTikz } from './tikz-extract.ts'

const TIKZ = '\\begin{tikzpicture}[scale=1.5]\n  \\draw[->] (-5,0)--(3,0);\n\\end{tikzpicture}'

// --- Tách mã TikZ ----------------------------------------------------------

test('tìm được khối tikzpicture kèm tuỳ chọn', () => {
  const blocks = findTikzBlocks(`Cho hàm số $y=ax+b$ có đồ thị\n${TIKZ}\nHỏi gì đó.`)
  assert.equal(blocks.length, 1)
  assert.ok(blocks[0].code.startsWith('\\begin{tikzpicture}[scale=1.5]'))
  assert.ok(blocks[0].code.endsWith('\\end{tikzpicture}'))
})

test('tách xong thì đề còn nguyên chữ, chỉ mất khối hình', () => {
  const result = extractTikz(`Cho hàm số $y=ax+b$ có đồ thị như hình vẽ\n\n${TIKZ}\n\nHỏi gì đó.`)
  assert.equal(result.content, 'Cho hàm số $y=ax+b$ có đồ thị như hình vẽ\n\nHỏi gì đó.')
  assert.ok(result.tikzCode.includes('\\draw'))
})

test('nhiều khối thì nối lại, giữ đúng thứ tự', () => {
  const a = '\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}'
  const b = '\\begin{tikzpicture}\\draw (1,1);\\end{tikzpicture}'
  const result = extractTikz(`Hình 1: ${a} và Hình 2: ${b}`)
  assert.equal(result.blocks.length, 2)
  assert.ok(result.tikzCode.indexOf('(0,0)') < result.tikzCode.indexOf('(1,1)'))
})

test('khối lồng nhau vẫn cắt đúng cặp ngoài cùng', () => {
  const nested =
    '\\begin{tikzpicture}\\draw (0,0);\\begin{tikzpicture}\\draw (1,1);\\end{tikzpicture}\\end{tikzpicture}'
  const blocks = findTikzBlocks(`Đề bài. ${nested} Hết.`)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].code, nested)
})

test('\\begin không đóng thì KHÔNG tách gì — không được nuốt phần đề đứng sau', () => {
  const broken = 'Cho hình vẽ \\begin{tikzpicture}\\draw (0,0); rồi hỏi tiếp.'
  const result = extractTikz(broken)
  assert.equal(result.blocks.length, 0)
  assert.equal(result.content, broken)
})

test('\\end mồ côi cũng không cắt', () => {
  const orphan = 'Phần đề quan trọng \\end{tikzpicture} còn lại.'
  assert.equal(findTikzBlocks(orphan).length, 0)
  assert.equal(extractTikz(orphan).content, orphan)
})

test('không có TikZ thì trả nội dung y nguyên', () => {
  const plain = 'Tính đạo hàm của $f(x)=x^2$.'
  assert.equal(hasInlineTikz(plain), false)
  assert.equal(extractTikz(plain).content, plain)
})

// --- Nhận ra đề có nhắc tới hình -------------------------------------------

test('bắt được các cách nhắc tới hình', () => {
  for (const text of [
    'Cho hàm số có đồ thị như hình vẽ bên.',
    'Quan sát hình sau và trả lời.',
    '[Hình 2.3]',
    'Cho bảng biến thiên của hàm số như sau',
    'Đường cong trong hình là đồ thị của hàm số nào?',
  ]) {
    assert.equal(mentionsFigure(text), true, text)
  }
})

test('KHÔNG bắt nhầm tên hình khối — đây là cái bẫy chính', () => {
  // "hình" trong tiếng Việt phần lớn là tên hình khối, không phải lời mời nhìn
  // một bức vẽ. Bắt trượt sang nhóm này thì mọi câu Hình học đều bị gắn cờ.
  for (const text of [
    'Cho hình chóp $S.ABCD$ có đáy là hình vuông cạnh $a$.',
    'Thể tích khối lăng trụ có đáy là hình bình hành.',
    'Diện tích hình tròn bán kính $R$ bằng bao nhiêu?',
    'Cho hình trụ có chiều cao $h$.',
  ]) {
    assert.equal(mentionsFigure(text), false, text)
  }
})

// --- Ba chế độ hỏng --------------------------------------------------------

test('mã TikZ lẫn trong đề — sửa được tại chỗ', () => {
  const issues = checkFigure({ id: 'q1', content: `Cho đồ thị ${TIKZ}` })
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['tikz_lan_trong_de']
  )
  assert.equal(issues[0].suaTaiCho, true)
})

test('có mã nhưng chưa có ảnh — phải dựng ở question-bank', () => {
  const issues = checkFigure({
    id: 'q1',
    content: 'Cho hàm số có đồ thị như hình vẽ.',
    tikz_code: TIKZ,
  })
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['co_ma_chua_co_anh']
  )
  assert.equal(issues[0].suaTaiCho, false)
})

test('đề nhắc hình mà không có nguồn hình nào', () => {
  const issues = checkFigure({ id: 'q1', content: 'Cho hàm số có đồ thị như hình vẽ bên.' })
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['nhac_hinh_ma_thieu']
  )
})

test('mã lẫn trong đề KHÔNG bị tính là thiếu hình', () => {
  // Sau khi tách, khối đó thành `tikz_code` — nên câu này thuộc nhóm 1, và báo
  // thêm "thiếu hình" chỉ làm người duyệt tưởng có hai việc phải làm.
  const issues = checkFigure({ id: 'q1', content: `Cho đồ thị như hình vẽ ${TIKZ}` })
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['tikz_lan_trong_de']
  )
})

test('câu đủ hình thì không báo gì', () => {
  assert.deepEqual(
    checkFigure({
      id: 'q1',
      content: 'Cho hàm số có đồ thị như hình vẽ.',
      tikz_code: TIKZ,
      tikz_image_url: 'https://example.test/hinh.svg',
    }),
    []
  )
})

test('câu không nhắc hình và không có hình thì không báo gì', () => {
  assert.deepEqual(checkFigure({ id: 'q1', content: 'Tính $\\int x\\,dx$.' }), [])
})

test('báo cáo lô: đếm theo mã và giữ mẫu số', () => {
  const report = auditFigures([
    { id: 'sach', content: 'Tính $1+1$.' },
    { id: 'lan', content: `Đồ thị ${TIKZ}` },
    { id: 'thieu', content: 'Cho hình vẽ bên.' },
    { id: 'chua-anh', content: 'Xem hình.', tikz_code: TIKZ },
  ])

  assert.equal(report.scanned, 4)
  assert.equal(report.reports.length, 3)
  assert.deepEqual(report.byCode, {
    tikz_lan_trong_de: 1,
    nhac_hinh_ma_thieu: 1,
    co_ma_chua_co_anh: 1,
  })
})
