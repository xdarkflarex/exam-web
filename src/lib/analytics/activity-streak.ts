/**
 * Chuỗi ngày học và lưới hoạt động.
 *
 * Hàm thuần, không import Supabase/React — test được không cần mạng.
 *
 * Đây là NƠI DUY NHẤT tính streak theo ngày. Trước đây logic này được viết lặp
 * hai lần ở `src/app/badges/page.tsx` và `src/app/goals/page.tsx` với cách xử lý
 * ngày khác nhau. Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 6.1.
 *
 * Lưu ý về múi giờ: mọi phép quy đổi dùng giờ ĐỊA PHƯƠNG của trình duyệt. Học
 * sinh ở Việt Nam làm bài lúc 23:30 phải được tính vào ngày hôm đó, không phải
 * ngày UTC kế tiếp.
 */

/** Khóa ngày `YYYY-MM-DD` theo giờ địa phương. */
export function dayKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Đếm số hoạt động theo từng ngày. Mốc thời gian không hợp lệ bị bỏ qua. */
export function countByDay(timestamps: Array<string | null | undefined>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const timestamp of timestamps) {
    if (!timestamp) continue
    const key = dayKey(timestamp)
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Số ngày liên tiếp có hoạt động, tính ngược từ hôm nay.
 *
 * Hôm nay chưa học KHÔNG làm mất chuỗi — ngày vẫn đang diễn ra. Chuỗi chỉ đứt
 * khi hôm qua cũng không có hoạt động. Không có quy tắc này, học sinh mở app
 * buổi sáng sẽ thấy chuỗi về 0 rồi lại lên, gây hoang mang.
 */
export function currentStreak(
  counts: Map<string, number>,
  today: Date = new Date()
): number {
  const todayKey = dayKey(today)
  const yesterdayKey = dayKey(shiftDays(today, -1))

  // Chuỗi đã đứt hẳn: cả hôm nay lẫn hôm qua đều trống.
  if (!counts.has(todayKey) && !counts.has(yesterdayKey)) return 0

  let streak = 0
  let cursor = counts.has(todayKey) ? new Date(today) : shiftDays(today, -1)

  // Giới hạn vòng lặp: dữ liệu xấu không được treo UI.
  for (let step = 0; step < 3650; step += 1) {
    if (!counts.has(dayKey(cursor))) break
    streak += 1
    cursor = shiftDays(cursor, -1)
  }

  return streak
}

export interface HeatmapCell {
  /** `YYYY-MM-DD` theo giờ địa phương. */
  key: string
  count: number
  /** 0-4. Dùng để chọn bậc màu; 0 nghĩa là không có hoạt động. */
  level: number
  /** 0 = Chủ nhật ... 6 = Thứ bảy. */
  weekday: number
}

/**
 * Lưới ngày liên tục cho heatmap, cũ → mới, kết thúc ở `today`.
 *
 * Bậc màu chia theo NGƯỠNG TUYỆT ĐỐI, không theo phân vị. Chia theo phân vị làm
 * một ngày làm 2 câu trông "đậm" y như ngày làm 20 câu chỉ vì đó là ngày cao
 * nhất trong tuần — mức độ phải so được giữa các tuần.
 */
export function buildHeatmap(
  counts: Map<string, number>,
  days = 28,
  today: Date = new Date()
): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  const total = Math.max(1, days)

  for (let offset = total - 1; offset >= 0; offset -= 1) {
    const date = shiftDays(today, -offset)
    const key = dayKey(date)
    const count = counts.get(key) || 0
    cells.push({ key, count, level: activityLevel(count), weekday: date.getDay() })
  }

  return cells
}

export function activityLevel(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

/** Nhãn tiếng Việt cho screen reader và tooltip. */
export function describeCell(cell: HeatmapCell): string {
  const [year, month, day] = cell.key.split('-')
  const date = `${day}/${month}/${year}`
  return cell.count > 0 ? `${date}: ${cell.count} câu` : `${date}: không học`
}
