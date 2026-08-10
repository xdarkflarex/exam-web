/**
 * Khoá định danh một hình TikZ, tính từ chính mã nguồn của hình.
 *
 * Dùng chung hai đầu:
 * - `scripts/render-tikz-svg.mjs` biên dịch hình bằng LaTeX thật rồi ghi ra
 *   `public/tikz/<khoá>.svg`.
 * - `TikzRenderer` lấy đúng khoá đó để hiển thị SVG đã dựng sẵn.
 *
 * Nhờ vậy hai bên không cần biết nhau: sửa hình trong file `.tex` là ra khoá
 * mới, chạy lại script là có SVG mới, web tự nhặt.
 *
 * Hàm băm phải ĐỒNG BỘ để component gọi được lúc render, nên dùng FNV-1a
 * (hai vòng khác hạt giống → 64 bit) thay vì Web Crypto vốn bất đồng bộ.
 */

function fnv1a(input: string, seed: number): number {
  let hash = seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // hash * 16777619, giữ trong 32 bit
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Chuẩn hoá trước khi băm để mã đọc từ file `.tex` và mã đọc từ khối
 * ```` ```tikz ```` trong Markdown cho ra cùng một khoá.
 */
export function normalizeTikzSource(code: string): string {
  return code
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
}

/** Khoá 16 ký tự hex của một hình TikZ. */
export function tikzFigureKey(code: string): string {
  const normalized = normalizeTikzSource(code)
  const high = fnv1a(normalized, 0x811c9dc5)
  const low = fnv1a(normalized, 0x9e3779b9)
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0')
}
