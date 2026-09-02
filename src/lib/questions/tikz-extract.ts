/**
 * Tách mã TikZ lẫn trong nội dung đề ra khỏi đó.
 *
 * VÌ SAO CẦN. Một số câu nhập bằng OCR có nguyên khối
 * `\begin{tikzpicture}...\end{tikzpicture}` nằm trong `questions.content` thay
 * vì ở cột `tikz_code`. Hậu quả nhìn thấy được: `MathContent` đưa cả khối đó cho
 * MathJax, MathJax không biết môi trường `tikzpicture` và in ra
 * `Unknown environment 'tikzpicture'` màu đỏ — HỌC SINH ĐỌC ĐỀ THẤY DÒNG ĐÓ.
 * Kèm theo là hàng chục dòng `\draw`, `\foreach` hiện ra như văn bản.
 *
 * Tách ra không dựng được hình — exam-web không có LaTeX toolchain, việc dựng
 * SVG thuộc về question-bank. Nhưng nó dừng ngay phần rác hiển thị, và đưa mã
 * về đúng cột để question-bank dựng ảnh sau.
 *
 * Logic thuần: không đụng database, không gọi mạng, chạy lại cho cùng kết quả.
 */

/**
 * Một khối `tikzpicture` tìm thấy trong văn bản.
 *
 * Giữ cả vị trí để bên gọi ghép lại phần còn lại mà không phải dò lần hai.
 */
export interface TikzBlock {
  /** Nguyên khối, kể cả `\begin{tikzpicture}` và `\end{tikzpicture}`. */
  code: string
  start: number
  end: number
}

export interface ExtractResult {
  /** Nội dung sau khi đã bỏ các khối TikZ, đã gọn khoảng trắng thừa. */
  content: string
  /** Các khối tìm được, theo thứ tự xuất hiện. */
  blocks: TikzBlock[]
  /** Nhiều khối thì nối bằng dòng trống — `tikz_code` chỉ có một ô. */
  tikzCode: string
}

/**
 * Tìm các khối `tikzpicture`, hỗ trợ LỒNG NHAU.
 *
 * Vì sao không dùng một regex: `\begin{tikzpicture}` có thể lồng trong một khối
 * khác (hiếm nhưng có, ví dụ hình chèn hình), và regex không cân được cặp lồng —
 * nó sẽ cắt ở `\end` đầu tiên và để lại một nửa khối trong đề. Đếm độ sâu thì
 * đúng trong mọi trường hợp.
 *
 * `\begin{tikzpicture}[scale=1.5]` có tuỳ chọn sau tên môi trường; phần tuỳ chọn
 * đó thuộc về khối nên được giữ nguyên.
 */
export function findTikzBlocks(text: string): TikzBlock[] {
  if (!text) return []

  const blocks: TikzBlock[] = []
  const token = /\\(begin|end)\s*\{\s*tikzpicture\s*\}/g

  let depth = 0
  let blockStart = -1
  let match: RegExpExecArray | null

  while ((match = token.exec(text)) !== null) {
    if (match[1] === 'begin') {
      if (depth === 0) blockStart = match.index
      depth++
      continue
    }

    // `\end` khi chưa mở khối nào: mã hỏng. Bỏ qua thay vì cắt bừa — cắt theo
    // một `\end` mồ côi sẽ nuốt mất phần đề đứng trước nó.
    if (depth === 0) continue

    depth--
    if (depth === 0 && blockStart >= 0) {
      const end = match.index + match[0].length
      blocks.push({ code: text.slice(blockStart, end), start: blockStart, end })
      blockStart = -1
    }
  }

  // Còn `depth > 0`: có `\begin` không đóng. KHÔNG tách gì cả — cắt tới hết
  // chuỗi sẽ nuốt phần đề nằm sau đó, mà đề mới là thứ không được mất.
  return blocks
}

/** Có mã TikZ nằm lẫn trong văn bản không. */
export function hasInlineTikz(text: string): boolean {
  return findTikzBlocks(text).length > 0
}

/**
 * Tách mã TikZ ra khỏi nội dung.
 *
 * Không tìm thấy khối nào thì trả về nội dung Y NGUYÊN — kể cả khi văn bản có
 * `\begin{tikzpicture}` không đóng. Hàm này không được phép làm mất chữ của đề.
 */
export function extractTikz(text: string): ExtractResult {
  const blocks = findTikzBlocks(text ?? '')
  if (blocks.length === 0) {
    return { content: text ?? '', blocks: [], tikzCode: '' }
  }

  let content = ''
  let cursor = 0
  for (const block of blocks) {
    content += text.slice(cursor, block.start)
    cursor = block.end
  }
  content += text.slice(cursor)

  return {
    content: tidy(content),
    blocks,
    // Nhiều hình trong một câu thì nối bằng dòng trống. `tikz_code` là một ô
    // văn bản, và question-bank đọc được nhiều khối liên tiếp.
    tikzCode: blocks.map((block) => block.code.trim()).join('\n\n'),
  }
}

/**
 * Gọn khoảng trắng do việc cắt để lại.
 *
 * Chỉ đụng khoảng trắng: cắt một khối giữa hai đoạn văn thường để lại ba bốn
 * dòng trống liên tiếp, hoặc khoảng trắng lửng ở cuối dòng.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
