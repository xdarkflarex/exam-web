/**
 * Quy đổi thời hạn của đề giữa ISO (database) và giá trị ô input (trình duyệt).
 *
 * VÌ SAO TÁCH RA KHỎI TRANG. Bốn hàm dưới đây là chỗ duy nhất trong luồng cấu
 * hình đề mà một lỗi lệch múi giờ có thể lọt qua mà không ai thấy: form vẫn hiện
 * một con số trông hợp lý, chỉ là sai vài tiếng hoặc sai một ngày. Nằm trong
 * trang `'use client'` thì không test được; ở đây thì test được.
 *
 * HAI LOẠI ĐỀ, HAI CÁCH ĐẶT HẠN
 * - `simulation` (thi thử, thi học kì): `duration` phút đếm ngược + mốc bắt đầu
 *   / kết thúc chính xác tới phút.
 * - `practice` (ôn tập theo chương): KHÔNG đếm ngược. Chỉ một khung NGÀY để thúc
 *   học sinh làm xong.
 */

/**
 * `exam_mode` không phải 'practice' thì coi như đề thi.
 *
 * Chọn mặc định về phía `simulation` là có chủ đích: cột lỗi hoặc thiếu mà đoán
 * thành 'practice' sẽ GỠ đồng hồ khỏi một đề thi thật — hỏng theo hướng nguy
 * hiểm. Đoán ngược lại thì cùng lắm là giữ nguyên hành vi cũ.
 */
export function isPracticeExam(mode: string | null | undefined): boolean {
  return mode === 'practice'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * ISO -> giá trị cho `<input type="datetime-local">`, theo giờ ĐỊA PHƯƠNG.
 *
 * Bản cũ trong trang xuất bản dùng `new Date(iso).toISOString().slice(0, 16)`,
 * tức đổi sang UTC rồi đưa cho một ô input vốn hiểu giờ địa phương. Ở +07:00 thì
 * mốc 07:00 sáng hiện thành 00:00; và nếu giáo viên bấm Lưu, cái 00:00 đó được
 * đọc lại như giờ địa phương — nên mỗi lượt mở-rồi-lưu là mốc lùi thêm 7 tiếng.
 */
export function toLocalDateTimeInput(iso: string | null | undefined): string {
  const d = parse(iso)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO -> giá trị cho `<input type="date">`, theo giờ địa phương. */
export function toLocalDateInput(iso: string | null | undefined): string {
  const d = parse(iso)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Giá trị `<input type="date">` -> ISO.
 *
 * `edge` quyết định lấy đầu hay cuối ngày: mở lúc 00:00:00, hạn cuối lúc
 * 23:59:59.999. Hạn cuối mà lấy 00:00 thì ngày ghi trên form lại là ngày học
 * sinh KHÔNG còn làm được — lệch đúng một ngày, và là kiểu lệch không ai nhận ra
 * cho tới khi có học sinh kêu.
 *
 * Dựng bằng `new Date(y, m, d, ...)` chứ KHÔNG `new Date('2026-09-10')`: chuỗi
 * chỉ-có-ngày được đặc tả đọc là UTC, nên ở +07:00 nó lùi về 19:00 hôm trước.
 */
export function fromDateInput(value: string, edge: 'start' | 'end'): string | null {
  if (!value) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null
  const [year, month, day] = parts
  if (!year || !month || !day) return null
  const d = edge === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Giá trị `<input type="datetime-local">` -> ISO, đọc theo giờ địa phương. */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}
