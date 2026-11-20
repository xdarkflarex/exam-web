/**
 * Test cho việc giữ công thức khi đi qua Markdown.
 *
 * Chạy qua đúng react-markdown + remark-gfm mà `MathContent` dùng, vì cái cần
 * chứng minh là chuỗi MathJax nhận được, không phải chuỗi sau khi thoát.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { protectMathForMarkdown } from './protect-math.ts'

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown))
}

test('ngoặc nhọn, xuống dòng của hệ và khoảng cách nhỏ còn nguyên', () => {
  const html = render(protectMathForMarkdown(
    String.raw`**Bước 1.** $D=\mathbb{R}\setminus\{1\}$, hệ $\begin{cases} a=1 \\ b=2 \end{cases}$, dài $2\,\text{m}$.`,
  ))

  assert.match(html, /<strong>Bước 1\.<\/strong>/)
  assert.ok(html.includes(String.raw`$D=\mathbb{R}\setminus\{1\}$`))
  assert.ok(html.includes(String.raw`$\begin{cases} a=1 \\ b=2 \end{cases}$`))
  assert.ok(html.includes(String.raw`$2\,\text{m}$`))
})

test('dấu * và _ trong công thức không thành chữ nghiêng', () => {
  const html = render(protectMathForMarkdown('Tích $a*b*c$ và $x_1 + x_2 = y_1$.'))

  assert.ok(html.includes('$a*b*c$'))
  assert.ok(html.includes('$x_1 + x_2 = y_1$'))
  assert.ok(!html.includes('<em>'))
})

test('công thức riêng dòng và giá trị tuyệt đối trong danh sách', () => {
  const html = render(protectMathForMarkdown([
    '- Ý a: $|x-1| < 2$',
    '',
    String.raw`$$\lim\limits_{x\to+\infty}\dfrac{1}{x}=0$$`,
  ].join('\n')))

  assert.ok(html.includes('<li>Ý a: $|x-1| &lt; 2$</li>'))
  assert.ok(html.includes(String.raw`$$\lim\limits_{x\to+\infty}\dfrac{1}{x}=0$$`))
})

test('khối tikz và code inline không bị thêm dấu thoát', () => {
  const tikz = '```tikz\n\\draw (0,0) node {$x_1$};\n```'
  const input = `Hình: $\\{a\\}$\n\n${tikz}\n\nLệnh \`\\{x\\}\``

  const out = protectMathForMarkdown(input)
  assert.ok(out.includes(tikz))
  assert.ok(out.includes('`\\{x\\}`'))
  assert.ok(out.startsWith('Hình: \\$\\\\\\{a\\\\\\}\\$'))
})

test('đô la thoát và chữ thường giữ nguyên', () => {
  assert.equal(protectMathForMarkdown('Giá \\$5 cho **mỗi** sản phẩm.'), 'Giá \\$5 cho **mỗi** sản phẩm.')
  assert.equal(protectMathForMarkdown('Không có công thức.'), 'Không có công thức.')
})
