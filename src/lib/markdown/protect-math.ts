/**
 * Giữ nguyên công thức khi nội dung đi qua ReactMarkdown.
 *
 * VÌ SAO CẦN. CommonMark coi `\` + một dấu câu ASCII là ký tự thoát: `\{` ra `{`,
 * `\\` ra `\`, `\,` ra `,`. ReactMarkdown không biết `$...$` là công thức nên
 * thoát luôn bên trong, rồi MathJax nhận một công thức đã hỏng:
 *
 *   $\mathbb{R}\setminus\{1\}$          → $\mathbb{R}\setminus{1}$   (mất ngoặc)
 *   $\begin{cases}a\\b\end{cases}$      → $\begin{cases}a\b\end{cases}$ (mất xuống dòng)
 *   $2\,\text{m}$                       → $2,\text{m}$
 *   $a*b*c$                             → $a<em>b</em>c$
 *
 * Đo ngày 2026-10-22 bằng chính react-markdown + remark-gfm của repo. Mọi nội
 * dung bị đoán là Markdown đều dính, mà `hasMarkdownSyntax` khớp cả `$x_1+x_2$`
 * nên phần lớn lời giải có chỉ số dưới đều đi nhánh này.
 *
 * CÁCH LÀM. Trong mỗi đoạn công thức, thêm `\` trước MỌI dấu câu ASCII (kể cả
 * chính `\`). CommonMark cho phép thoát bất kỳ dấu câu ASCII nào, nên bước bỏ
 * thoát của nó trả về đúng chuỗi gốc, và các dấu `*`, `_`, `|`, `<` bên trong
 * công thức không còn bị hiểu là cú pháp Markdown. MathJax đọc DOM nên thấy
 * công thức nguyên vẹn.
 *
 * Khối code (```tikz …```) và code inline không được đụng tới: CommonMark không
 * bỏ thoát trong code, thêm `\` vào đó là làm hỏng mã TikZ.
 */

/** Khối code và code inline — giữ nguyên, không tìm công thức bên trong. */
const CODE = /```[\s\S]*?```|`[^`\n]+`/g

/**
 * Đoạn công thức: `$$…$$` (được nhiều dòng), `\[…\]`, `\(…\)`, rồi `$…$` trên
 * một dòng. `$` đứng sau `\` là dấu đô la thật, không mở công thức.
 */
const MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\\\n])+?\$/g

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/g

function escapeSegment(segment: string): string {
  return segment.replace(ASCII_PUNCTUATION, (ch) => `\\${ch}`)
}

export function protectMathForMarkdown(input: string): string {
  if (!input || !input.includes('$') && !input.includes('\\')) return input

  let out = ''
  let last = 0
  for (const match of input.matchAll(CODE)) {
    out += input.slice(last, match.index).replace(MATH, escapeSegment)
    out += match[0]
    last = match.index + match[0].length
  }
  return out + input.slice(last).replace(MATH, escapeSegment)
}
