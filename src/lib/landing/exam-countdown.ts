/**
 * Đếm ngược tới kỳ thi tốt nghiệp THPT ở trang chủ.
 *
 * NGÀY THI LẤY TỪ ĐÂU — và vì sao nó phải sửa được mà không cần deploy:
 *
 * Khung kế hoạch thời gian năm học của Bộ GD&ĐT (Quyết định 2308/QĐ-BGDĐT ký
 * ngày 06/8/2026, áp dụng từ năm học 2026-2027) đặt kỳ thi tốt nghiệp THPT vào
 * hai ngày **11 và 12/6 hằng năm**. Tra lại ngày 2026-11-09: báo chí đưa tin
 * thống nhất là năm 2027 thi **dự kiến 11–12/6/2027**, nhưng chưa thấy bản gốc
 * của quyết định trên cổng văn bản của Bộ, và LỊCH THI CHI TIẾT (giờ từng môn)
 * phải đợi hướng dẫn tổ chức thi năm 2027, thường ra vào đầu năm.
 *
 * Giờ đếm tới — 7 giờ 30 sáng 11/6 — là SUY RA từ lịch năm 2026: chiều 10/6
 * làm thủ tục, 7 giờ 30 sáng 11/6 phát đề Ngữ văn, 7 giờ 35 bắt đầu làm bài.
 * Đây là giả định có cơ sở, không phải lịch đã công bố.
 *
 * Nên cả hai mốc nằm trong `site_settings['landing.exam_countdown']`, sửa ở
 * `/admin/landing` → tab "Đếm ngược". Bộ công bố lịch chi tiết là sửa một ô,
 * không phải đợi một bản deploy.
 *
 * MÚI GIỜ: mốc lưu kèm `+07:00`, không bao giờ để trình duyệt tự đoán. Học
 * sinh ở nước ngoài, hay một máy để sai múi giờ, vẫn đếm tới đúng khoảnh khắc
 * phát đề ở Việt Nam.
 */

export interface ExamCountdownConfig {
  enabled: boolean
  /** Tiêu đề hiện trên trang chủ. */
  title: string
  /** Khoảnh khắc bắt đầu môn đầu tiên, ISO 8601 có múi giờ. */
  start: string
  /** Hết ngày thi cuối, ISO 8601 có múi giờ. Qua mốc này là "đã kết thúc". */
  end: string
  /** Chữ ngày thi hiện cho người đọc, ví dụ "11–12/6/2027". */
  dateLabel: string
  /** `true` khi ngày thi còn là dự kiến — trang chủ nói rõ chữ "dự kiến". */
  tentative: boolean
  /** Nguồn của ngày thi, một dòng. */
  note: string
}

export const DEFAULT_EXAM_COUNTDOWN: ExamCountdownConfig = {
  enabled: true,
  title: 'Kỳ thi tốt nghiệp THPT 2027',
  start: '2027-06-11T07:30:00+07:00',
  end: '2027-06-12T23:59:59+07:00',
  dateLabel: '11–12/6/2027',
  tentative: true,
  note: 'Theo khung kế hoạch thời gian năm học của Bộ GD&ĐT',
}

/** Qua ngày thi cuối bao lâu thì khối đếm ngược tự ẩn khỏi trang chủ. */
export const STALE_AFTER_DAYS = 7

const DAY = 86_400
const HOUR = 3_600
const MINUTE = 60

/** Mốc có múi giờ tường minh: `Z` hoặc `±hh:mm`. Thiếu là trình duyệt tự đoán. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) return null
  const ms = Date.parse(value.trim())
  return Number.isFinite(ms) ? ms : null
}

function text(value: unknown, fallback: string, max = 160): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : fallback
}

/**
 * Đọc cấu hình đã lưu. Không bao giờ ném lỗi.
 *
 * Giá trị trong `site_settings` là JSON do người sửa tay qua trang quản trị —
 * hỏng một ô thì giữ phần lành và lấy mặc định cho ô hỏng, chứ không để cả
 * trang chủ vỡ. Riêng hai mốc thời gian đi theo CẶP: mốc bắt đầu hỏng thì bỏ
 * cả cặp, vì ghép mốc bắt đầu mặc định với mốc kết thúc của người dùng có thể
 * ra một khoảng thi âm.
 */
export function readCountdownConfig(raw: unknown): ExamCountdownConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_EXAM_COUNTDOWN }
  const value = raw as Record<string, unknown>
  const base = DEFAULT_EXAM_COUNTDOWN

  let start = base.start
  let end = base.end
  const startMs = parseInstant(value.start)
  if (startMs !== null) {
    start = String(value.start).trim()
    const endMs = parseInstant(value.end)
    // Thiếu hay sai mốc kết thúc: lấy hết ngày thứ hai tính từ mốc bắt đầu.
    end = endMs !== null && endMs > startMs ? String(value.end).trim() : new Date(startMs + 2 * DAY * 1000).toISOString()
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : base.enabled,
    title: text(value.title, base.title, 120),
    start,
    end,
    dateLabel: text(value.dateLabel, base.dateLabel, 60),
    tentative: typeof value.tentative === 'boolean' ? value.tentative : base.tentative,
    note: text(value.note, base.note, 200),
  }
}

export type CountdownPhase = 'before' | 'during' | 'after'

export interface CountdownParts {
  phase: CountdownPhase
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Tách thời gian còn lại thành ngày/giờ/phút/giây.
 *
 * Làm tròn XUỐNG theo giây: còn 0,9 giây là đã hiện 0. Làm tròn lên thì đồng hồ
 * đứng ở "1 giây" đúng lúc phát đề — một giây sai nằm ngay ở khoảnh khắc người
 * ta nhìn kỹ nhất.
 */
export function countdownParts(nowMs: number, config: Pick<ExamCountdownConfig, 'start' | 'end'>): CountdownParts {
  const startMs = Date.parse(config.start)
  const endMs = Date.parse(config.end)

  if (nowMs >= startMs) {
    return { phase: nowMs <= endMs ? 'during' : 'after', days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  let rest = Math.floor((startMs - nowMs) / 1000)
  const days = Math.floor(rest / DAY)
  rest -= days * DAY
  const hours = Math.floor(rest / HOUR)
  rest -= hours * HOUR
  const minutes = Math.floor(rest / MINUTE)
  const seconds = rest - minutes * MINUTE
  return { phase: 'before', days, hours, minutes, seconds }
}

/**
 * Khối đếm ngược có nên lên trang không — quyết ở SERVER.
 *
 * Đếm ngược tới một kỳ thi đã qua là thứ làm trang trông bỏ hoang. Qua ngày thi
 * cuối `STALE_AFTER_DAYS` ngày mà chưa ai đổi sang năm sau thì tự ẩn; trong
 * tuần ngay sau kỳ thi vẫn hiện, với lời "đã kết thúc".
 */
export function shouldShowCountdown(config: ExamCountdownConfig, nowMs: number): boolean {
  if (!config.enabled) return false
  const endMs = Date.parse(config.end)
  return !(Number.isFinite(endMs) && nowMs > endMs + STALE_AFTER_DAYS * DAY * 1000)
}

/** `7` → `07`. Ngày thì không đệm: "214 ngày" chứ không phải "0214". */
export function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0')
}

// ── Ô nhập `datetime-local` ở trang quản trị ──────────────────────────────────
//
// `<input type="datetime-local">` không có múi giờ: nó trả "2027-06-11T07:30"
// và để trình duyệt hiểu theo giờ MÁY ĐANG DÙNG. Người sửa ở máy để giờ UTC sẽ
// lưu nhầm mốc sớm 7 tiếng. Hai hàm dưới đây ép cách hiểu về giờ Việt Nam, bất
// kể máy của người sửa để múi giờ nào.

const VN_OFFSET_MS = 7 * HOUR * 1000

/** ISO bất kỳ → "YYYY-MM-DDTHH:mm" theo giờ Việt Nam, cho ô `datetime-local`. */
export function toVietnamInputValue(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 16)
}

/** "YYYY-MM-DDTHH:mm" (giờ Việt Nam) → ISO có `+07:00`. Sai định dạng thì `null`. */
export function fromVietnamInputValue(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const iso = `${match[1]}T${match[2]}:${match[3]}:00+07:00`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}
