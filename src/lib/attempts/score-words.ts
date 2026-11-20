/**
 * Đọc điểm thành chữ, như dòng "Điểm (bằng chữ)" trên tờ bài kiểm tra.
 *
 * Trang kết quả hiện điểm bằng `score.toFixed(1)`, nên hàm này đọc CHÍNH chuỗi
 * đó chứ không làm tròn lại theo cách riêng: 6,25 hiện là "6.3" thì chữ phải là
 * "Sáu phẩy ba". Hai phép làm tròn khác nhau ở hai dòng liền nhau là hai con số
 * nói hai chuyện khác nhau.
 *
 * Quy ước đọc theo cách giáo viên ghi trên bài:
 *   8.0  -> "Tám"          (không ghi "phẩy không")
 *   7.5  -> "Bảy phẩy năm" (sau "phẩy" đọc "năm", không đọc "lăm")
 *   10.0 -> "Mười"
 *
 * Trả `null` cho mọi thứ ngoài thang 0–10 hoặc không phải số hữu hạn — trang
 * kết quả khi đó không hiện dòng chữ, thay vì đọc ra một con số vô nghĩa.
 */

const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function scoreInWords(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  // Kiểm trên SỐ, trước khi đọc chuỗi: (-0.5).toFixed(1) là "-0.5", và phần
  // nguyên "-0" đổi ra số là -0 — lọt qua phép so `< 0` ở dưới.
  if (score < 0 || score > 10) return null

  const shown = score.toFixed(1)
  const [whole, decimal] = shown.split('.')
  const integer = Number(whole)
  if (!Number.isInteger(integer) || integer < 0 || integer > 10) return null
  if (integer === 10 && decimal !== '0') return null

  const integerWord = integer === 10 ? 'mười' : DIGIT_WORDS[integer]
  if (decimal === '0') return capitalize(integerWord)
  return capitalize(`${integerWord} phẩy ${DIGIT_WORDS[Number(decimal)]}`)
}
