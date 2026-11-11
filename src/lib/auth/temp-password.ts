/**
 * Sinh mật khẩu tạm cho tài khoản học sinh — dùng chung cho tạo tài khoản
 * (`/api/admin/create-account`) và đặt lại mật khẩu (`/api/admin/reset-password`).
 *
 * VÌ SAO TÁCH RA ĐÂY: trước đây hàm này nằm riêng trong route tạo tài khoản và
 * bốc ký tự bằng `Math.random()`, rồi xáo bằng `sort(() => Math.random() - 0.5)`.
 * Cả hai đều không dành cho mật khẩu: `Math.random` không phải nguồn ngẫu nhiên
 * mật mã, còn xáo bằng `sort` cho phân phối lệch. Thêm một route cần mật khẩu
 * tạm thì hoặc chép lại hai lỗi đó, hoặc gom về một chỗ và sửa một lần.
 *
 * Định dạng giữ NGUYÊN như cũ — 2 hoa, 3 thường, 3 số, một `@`, tổng 9 ký tự —
 * vì giáo viên đã quen đọc mật khẩu kiểu này cho học sinh qua điện thoại. Bộ ký
 * tự bỏ những chữ dễ đọc nhầm (`0/O`, `1/l/I`), cũng như cũ.
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOL = '@'

/** Số nguyên ngẫu nhiên mật mã trong [0, max). Loại bỏ phần dư để không lệch. */
function cryptoInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buffer = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buffer)
    if (buffer[0] < limit) return buffer[0] % max
  }
}

/**
 * `randomInt` chỉ để test truyền vào nguồn ngẫu nhiên cố định; code thật luôn
 * dùng mặc định.
 */
export function generateTempPassword(randomInt: (max: number) => number = cryptoInt): string {
  const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)]
  const chars = [
    pick(UPPER), pick(UPPER),
    pick(LOWER), pick(LOWER), pick(LOWER),
    pick(DIGITS), pick(DIGITS), pick(DIGITS),
    SYMBOL,
  ]
  // Fisher–Yates: mỗi hoán vị có xác suất bằng nhau.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
