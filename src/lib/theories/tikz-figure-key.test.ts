/**
 * Test cho khoá hình TikZ.
 *
 * Khoá là hợp đồng giữa hai bên chẳng bao giờ chạy cùng lúc:
 * `scripts/render-tikz-svg.mjs` (Node, lúc dựng) và `TikzRenderer` (trình
 * duyệt, lúc xem). Lệch một chút là web đi tìm tệp không có và lặng lẽ rơi
 * xuống TikZJax — hỏng mà không báo. Nên khoá được ghim cứng giá trị ở đây.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeTikzSource, tikzFigureKey } from './tikz-figure-key.ts'

const FIGURE = [
  '\\begin{tikzpicture}',
  '\\tkzTabInit[lgt=2,espcl=2.5]',
  "{$x$/1,$y'$/1,$y$/2}",
  '{$-\\infty$,$-1$,$1$,$+\\infty$}',
  '\\tkzTabLine{,+,z,-,z,+,}',
  "\\tkzTabVar{-/$-\\infty$,+/$2$,-/$-2$,+/$+\\infty$}",
  '\\end{tikzpicture}',
].join('\n')

test('khoá ổn định theo thời gian', () => {
  // Đổi giá trị này nghĩa là mọi SVG đã dựng thành rác — chỉ đổi khi cố ý
  assert.equal(tikzFigureKey(FIGURE), 'ec735774529a4020')
  assert.match(tikzFigureKey(FIGURE), /^[0-9a-f]{16}$/)
})

test('xuống dòng kiểu Windows và khoảng trắng cuối dòng không đổi khoá', () => {
  const windowsStyle = FIGURE.replace(/\n/g, '\r\n')
  const trailingSpaces = FIGURE.split('\n').map(line => line + '   ').join('\n')

  assert.equal(tikzFigureKey(windowsStyle), tikzFigureKey(FIGURE))
  assert.equal(tikzFigureKey(trailingSpaces), tikzFigureKey(FIGURE))
  assert.equal(tikzFigureKey(`\n\n${FIGURE}\n\n`), tikzFigureKey(FIGURE))
})

test('đổi một con số là ra khoá khác', () => {
  const edited = FIGURE.replace('espcl=2.5', 'espcl=3')

  assert.notEqual(tikzFigureKey(edited), tikzFigureKey(FIGURE))
})

test('normalizeTikzSource cắt gọn nhưng giữ nguyên nội dung', () => {
  assert.equal(normalizeTikzSource('  \\draw (0,0);  \n\n'), '\\draw (0,0);')
})
