/**
 * Hero "Hôm nay" của trang học sinh.
 *
 * Thi công Phase 9 của docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.4.
 *
 * Ba ràng buộc từ mục 7.1 được giữ nguyên ở đây, vì chúng là lý do phần trang
 * trí này không lặp lại lỗi "node emerald ghi Đã đạt 80% khi sai toàn bộ":
 *
 *  1. Mọi yếu tố thị giác neo vào một con số thật. Vòng tiến độ hiển thị ĐỘ
 *     CHÍNH XÁC (`totals.accuracy`), không phải tỷ lệ đã làm. Chuỗi ngày chỉ
 *     hiện khi có ngày học thật.
 *  2. Không bật UI thành tựu chưa có cơ chế cấp — nên ở đây không có huy hiệu,
 *     không XP, không level. Chỉ ba thứ tính được từ dữ liệu đang có.
 *  3. Chuyển động đã bị lưới an toàn `prefers-reduced-motion` trong globals.css
 *     tắt sẵn; component này không tự khai báo animation nào ngoài class chung.
 *
 * Đây là bề mặt gradient DUY NHẤT của trang (mục 7.2: mỗi trang tối đa một, dành
 * cho hành động quan trọng nhất). Đừng thêm gradient thứ hai vào `/student`.
 */

'use client'

import Link from 'next/link'
import { ArrowRight, Flame } from 'lucide-react'
import ProgressRing, { type RingTone } from '@/components/viz/ProgressRing'
import ActivityHeatmap from '@/components/viz/ActivityHeatmap'
import CountUpNumber from '@/components/motion/CountUpNumber'
import MathConstellation from '@/components/motion/MathConstellation'
import { buildHeatmap, countByDay, currentStreak } from '@/lib/analytics/activity-streak'
import type { StudentCapabilitySummary } from '@/lib/analytics/student-capability'

interface Props {
  userName: string
  /** Mốc thời gian của trang, truyền vào để ngày hiển thị và chuỗi cùng một nguồn. */
  now: number
  /** `null` khi phần năng lực chưa tải xong. Hero vẫn hiện đủ ngày + tên + chip. */
  summary: StudentCapabilitySummary | null
  chips: { label: string; value: number; className: string }[]
}

/**
 * Tông của CTA. Khớp với `recommendedAction.tone` đã có ở student-capability.
 *
 * Mỗi tông mang cả màu chữ, vì chữ phải đạt 4,5:1 trên CẢ HAI đầu gradient —
 * dòng mô tả `text-xs` trải gần hết bề ngang nút. Bản cũ để chữ trắng trên
 * đầu sáng -500/-400: thấp nhất amber 1,7:1, teal 1,9:1, rose 2,9:1 (dark
 * mode); ở light mode đầu phải cũng dưới 4,5:1 cả ba tông.
 * Amber theo quy ước đã có của dự án (xem `.bg-amber-500.text-white` trong
 * globals.css): amber sáng đi với chữ amber-950, không bao giờ chữ trắng.
 * Cùng một cặp cho light và dark: các nền này đứng được trên cả hai.
 */
const CTA_STYLE: Record<StudentCapabilitySummary['recommendedAction']['tone'], { surface: string; detail: string }> = {
  // trắng 7,9 / 6,0:1; dòng mô tả trắng/90 6,6 / 5,0:1
  rose: { surface: 'from-rose-800 to-rose-700 text-white', detail: 'text-white/90' },
  // amber-950 7,0 / 8,7:1; dòng mô tả /80 4,7 / 5,5:1
  amber: { surface: 'from-amber-500 to-amber-400 text-amber-950', detail: 'text-amber-950/80' },
  // trắng 7,5 / 5,4:1; dòng mô tả trắng/90 6,4 / 4,7:1
  teal: { surface: 'from-teal-800 to-teal-700 text-white', detail: 'text-white/90' },
  // trắng 10,4 / 7,6:1; dòng mô tả trắng/90 8,8 / 6,5:1
  slate: { surface: 'from-slate-700 to-slate-600 text-white', detail: 'text-white/90' },
}

/**
 * Màu vòng tiến độ theo mức độ chính xác, KHÔNG theo tông của CTA.
 *
 * Hai thứ này nói hai chuyện khác nhau: CTA nói "việc gấp nhất là gì", vòng nói
 * "bạn đang làm đúng bao nhiêu". Dùng chung một tông sẽ khiến một bài quá hạn
 * (rose) làm vòng đỏ lên dù học sinh đang làm đúng 90%.
 */
function accuracyTone(accuracy: number | null): RingTone {
  if (accuracy === null) return 'slate'
  if (accuracy >= 80) return 'emerald'
  if (accuracy >= 50) return 'amber'
  return 'rose'
}

export default function TodayHero({ userName, now, summary, chips }: Props) {
  const dateLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(now))

  // `answered === 0` là "chưa có bằng chứng", khác hẳn "đúng 0%". Truyền `null`
  // để ProgressRing hiện dấu gạch thay vì con số 0 gây hiểu nhầm.
  const hasEvidence = Boolean(summary && summary.totals.answered > 0)
  const accuracy = hasEvidence ? summary!.totals.accuracy : null

  const counts = countByDay(summary?.activityTimestamps ?? [])
  const streak = currentStreak(counts, new Date(now))
  // Có ngày nào trong 28 ngày qua thực sự có hoạt động không. Lưới rỗng toàn ô
  // xám đọc thành kết luận "bốn tuần không học buổi nào"; nhưng lưới rỗng cũng
  // là hình dạng của "chưa lấy được số liệu". Khi không có bằng chứng thì nói
  // thẳng "chưa ghi nhận hoạt động", không vẽ lưới như một kết luận.
  const hasActivity = buildHeatmap(counts, 28, new Date(now)).some((cell) => cell.count > 0)
  const action = summary?.recommendedAction

  return (
    <header className="animate-dash-in mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--background-card)] dark:border-slate-700">
      <div className="paper-grid relative">
        {/* Lớp nền: hai mô hình toán trôi rất chậm, lùi sau số liệu. Nằm TRƯỚC
            nội dung trong DOM và nội dung có `relative`, nên luôn bị đè lên. */}
        <MathConstellation variant="dashboard" className="absolute inset-0" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Trái: hôm nay là ngày nào, bạn là ai, và việc gấp nhất là gì */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-teal-700 dark:text-teal-400">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
              Hôm nay, {userName}
            </h1>

            {chips.length > 0 && (
              <dl className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <div
                    key={chip.label}
                    className={`inline-flex items-baseline gap-2 rounded-xl border px-3 py-2 ${chip.className}`}
                  >
                    <dd className="text-lg font-bold leading-none tabular-nums">{chip.value}</dd>
                    <dt className="text-xs font-medium">{chip.label}</dt>
                  </div>
                ))}
              </dl>
            )}

            {action ? (
              <Link
                href={action.href}
                className={`group mt-5 inline-flex max-w-full items-center gap-3 rounded-xl bg-gradient-to-r ${CTA_STYLE[action.tone].surface} px-5 py-3 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-offset-slate-900`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{action.label}</span>
                  <span className={`block truncate text-xs ${CTA_STYLE[action.tone].detail}`}>{action.detail}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : (
              <p className="mt-5 text-slate-500 dark:text-slate-400">
                {chips.length > 0
                  ? 'Bắt đầu từ việc quan trọng nhất, rồi xem phản hồi khi kết quả đã được công bố.'
                  : 'Không còn việc nào đang chờ. Bạn có thể chọn một hoạt động để luyện thêm.'}
              </p>
            )}
          </div>

          {/* Phải: bằng chứng năng lực. Ẩn hẳn khi chưa tải xong thay vì hiện
              khung rỗng — khung rỗng ở vị trí này trông như lỗi tải. */}
          {summary && (
            <div className="flex shrink-0 items-center gap-5 sm:gap-6">
              <div className="text-center">
                <ProgressRing
                  value={accuracy}
                  size={92}
                  tone={accuracyTone(accuracy)}
                  caption="đúng"
                  /* Vòng này là điểm nhìn đầu tiên của trang "Hôm nay", và nó
                     chỉ hiện khi `summary` tải xong — vẽ dần lúc đó biến một
                     lần nhảy thành một lần xuất hiện. Các chỗ dùng khác của
                     ProgressRing (analytics, history) giữ mặc định đứng yên. */
                  animate
                  ariaLabel={
                    hasEvidence
                      ? `Độ chính xác ${accuracy}%, tính trên ${summary.totals.answered} câu đã làm`
                      : 'Chưa làm câu nào nên chưa tính được độ chính xác'
                  }
                />
                {/* "đã làm", KHÔNG phải "đã chấm": `totals.answered` đếm câu đã
                    trả lời (`answered_questions` của attempt), không đảm bảo câu
                    nào cũng đã được chấm. Ghi "đã chấm" là nói quá về dữ liệu —
                    đúng loại nhầm lẫn mà mục 2.1 của kế hoạch đã dính một lần. */}
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {hasEvidence ? (
                    <>
                      <CountUpNumber
                        value={summary.totals.answered}
                        className="tabular-nums"
                      />
                      {' câu đã làm'}
                    </>
                  ) : (
                    'Chưa có dữ liệu'
                  )}
                </p>
              </div>

              <div>
                {hasActivity ? (
                  <>
                    <ActivityHeatmap counts={counts} days={28} today={new Date(now)} />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">4 tuần gần đây</p>
                    {/* Chuỗi 1 ngày không phải thành tích — mục 7.4 yêu cầu chỉ hiện
                        từ 2 ngày trở lên để không khoe một con số vô nghĩa. */}
                    {streak >= 2 && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                        {streak} ngày liên tiếp
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex h-[105px] w-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 px-2 text-center dark:border-slate-600">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Chưa ghi nhận hoạt động
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">4 tuần gần đây</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
