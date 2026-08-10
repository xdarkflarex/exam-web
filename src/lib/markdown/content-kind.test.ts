/**
 * Test cho phép đoán HTML / Markdown.
 *
 * Đây là chỗ hỏng khiến cả màn nhập lý thuyết vỡ ngày 2026-08-09: mẫu cũ
 * `/<[^>]+>/` thấy dấu `<` trong `$x_1<x_2$` và dấu `>` ở câu sau là kết luận
 * "có HTML", thế là nội dung Markdown bị đổ thẳng qua `dangerouslySetInnerHTML`.
 * Ba test đầu giữ đúng ranh giới đó.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasHtmlMarkup, hasMarkdownSyntax } from './content-kind.ts'

test('bất đẳng thức trong công thức không bị coi là thẻ HTML', () => {
  const content = [
    'Cho hàm số $y=f(x)$ xác định trên khoảng $K$.',
    '',
    '- Hàm số $f$ đồng biến nếu $x_1<x_2$ thì $f(x_1)<f(x_2)$.',
    '- Hàm số $f$ nghịch biến nếu $x_1<x_2$ thì $f(x_1)>f(x_2)$.',
  ].join('\n')

  assert.equal(hasHtmlMarkup(content), false)
  assert.equal(hasMarkdownSyntax(content), true)
})

test('tuỳ chọn mũi tên của TikZ không bị coi là thẻ HTML', () => {
  const content = '```tikz\n\\begin{tikzpicture}[x=0.72cm,>=Stealth]\n\\draw[->] (0,0)--(1,0);\n\\end{tikzpicture}\n```'

  assert.equal(hasHtmlMarkup(content), false)
})

test('hai dấu $ lẻ quanh tên thẻ một chữ không bị coi là HTML', () => {
  // `<b$ và $c>` từng lọt vì `\b` coi ranh giới chữ–ký hiệu là hợp lệ
  assert.equal(hasHtmlMarkup('Vì $a<b$ và $c>d$ nên...'), false)
  assert.equal(hasHtmlMarkup('Tích vô hướng $<u,v>$ dương.'), false)
  assert.equal(hasHtmlMarkup('Ta có $m<n$, đồng thời $p>q$.'), false)
})

test('HTML thật vẫn được nhận ra', () => {
  assert.equal(hasHtmlMarkup('<p>Câu hỏi</p>'), true)
  assert.equal(hasHtmlMarkup('Hình: <img src="/a.png" alt="" />'), true)
  assert.equal(hasHtmlMarkup('dòng một<br>dòng hai'), true)
  assert.equal(hasHtmlMarkup('<table><tr><td>1</td></tr></table>'), true)
  // Thẻ cũ Word hay nhả ra khi dán câu hỏi
  assert.equal(hasHtmlMarkup('<font size="3">Câu 1</font>'), true)
  assert.equal(hasHtmlMarkup('<center>Đáp án</center>'), true)
  assert.equal(hasHtmlMarkup('<span style="color:red">A</span>'), true)
})

test('chữ thường không phải Markdown cũng không phải HTML', () => {
  assert.equal(hasHtmlMarkup('Đáp án đúng là $x=2$.'), false)
  assert.equal(hasMarkdownSyntax('Đáp án đúng là $x=2$.'), false)
})
