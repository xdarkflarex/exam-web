'use client'

/**
 * Khối đếm ngược tới kỳ thi tốt nghiệp THPT, đặt ngay dưới hero.
 *
 * VÌ SAO ĐẶT Ở ĐÂY: người lạ vào trang chủ cần một lý do để làm đề HÔM NAY chứ
 * không phải "để sau". Một con số đang giảm là lý do đó — và nút ngay cạnh nó
 * dẫn thẳng xuống khối đề, không bắt đăng ký trước.
 *
 * BA ĐIỀU BẤT BIẾN:
 *
 * 1. **Không lệch hydration.** Server không biết đồng hồ của người xem, nên mọi
 *    con số đều đến từ `useSyncExternalStore`: lúc hydrate dùng snapshot của
 *    server (`null` → ô hiện "–"), rồi mới chuyển sang giờ thật. Không có
 *    `Date.now()` nào trong lần render đầu.
 * 2. **Không xê dịch bố cục (NT8).** Chữ số `tabular-nums`, ô có bề rộng tối
 *    thiểu cố định: "9" chuyển thành "10" không đẩy được gì sang bên.
 * 3. **Không đọc to từng giây.** `role="timer"` mặc định `aria-live="off"`;
 *    trình đọc màn hình nhận một câu tóm tắt theo NGÀY, không phải 60 câu một
 *    phút.
 *
 * Không có hiệu ứng lật số: chữ đổi mỗi giây là thông tin, không phải chuyển
 * động trang trí — và nhờ vậy không cần khai báo gì thêm vào lưới
 * `prefers-reduced-motion`.
 */

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarClock } from 'lucide-react'
import ScrollRevealClient from '@/components/ScrollRevealClient'
import {
  countdownParts,
  pad2,
  type CountdownParts,
  type ExamCountdownConfig,
} from '@/lib/landing/exam-countdown'
import { surfaceClass, type SectionSurface } from './sectionSurface'

// ── Đồng hồ dùng chung cho mọi bản đếm ngược trên trang ─────────────────────
//
// Giá trị là GIÂY nguyên, chỉ đổi khi bộ đếm nhích: `getSnapshot` gọi hai lần
// liền nhau phải ra cùng một giá trị, nếu không React báo lỗi và render lại
// vô hạn. Bộ đếm canh đúng mép giây của đồng hồ thật, nên chữ số giây không
// bao giờ nhảy cóc hai đơn vị.

let currentSecond: number | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function readNow(): number {
  return Math.floor(Date.now() / 1000)
}

function scheduleTick() {
  timer = setTimeout(() => {
    currentSecond = readNow()
    listeners.forEach((listener) => listener())
    scheduleTick()
  }, 1000 - (Date.now() % 1000) + 5)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    currentSecond = readNow()
    scheduleTick()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

function getSnapshot(): number {
  if (currentSecond === null) currentSecond = readNow()
  return currentSecond
}

function getServerSnapshot(): number | null {
  return null
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExamCountdownProps {
  config: ExamCountdownConfig
  /** Nền của section, do `src/app/page.tsx` tính theo nhịp cả trang. */
  surface?: SectionSurface
}

const UNITS: { key: Exclude<keyof CountdownParts, 'phase'>; label: string }[] = [
  { key: 'days', label: 'ngày' },
  { key: 'hours', label: 'giờ' },
  { key: 'minutes', label: 'phút' },
  { key: 'seconds', label: 'giây' },
]

export default function ExamCountdown({ config, surface = 'plain' }: ExamCountdownProps) {
  const nowSecond = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const parts = nowSecond === null ? null : countdownParts(nowSecond * 1000, config)
  const phase = parts?.phase ?? 'before'

  const summary =
    parts === null
      ? ''
      : phase === 'before'
        ? `Còn ${parts.days} ngày tới ${config.title}.`
        : phase === 'during'
          ? `${config.title} đang diễn ra.`
          : `${config.title} đã kết thúc.`

  return (
    <section
      className={`py-10 sm:py-12 ${surfaceClass(surface)}`}
      aria-labelledby="exam-countdown-title"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollRevealClient>
          <div className="bento-tile-lead overflow-hidden flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
            {/* Trái: kỳ thi nào, ngày nào, chắc chắn tới đâu. */}
            <div className="min-w-0 lg:w-[36%] lg:shrink-0">
              <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Đếm ngược
              </p>
              <h2
                id="exam-countdown-title"
                className="font-baloo text-2xl font-bold leading-snug text-slate-800 dark:text-slate-100 sm:text-3xl"
              >
                {config.title}
              </h2>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                {config.tentative ? 'Dự kiến ' : 'Ngày thi: '}
                <strong className="font-semibold text-slate-800 dark:text-slate-100">{config.dateLabel}</strong>
              </p>
              {config.note && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{config.note}</p>
              )}
            </div>

            {/* Phải: con số, rồi việc nên làm với con số đó. */}
            <div className="min-w-0 flex-1">
              {phase === 'before' ? (
                <div role="timer" aria-label={summary || undefined} className="grid grid-cols-4 gap-2 sm:gap-3">
                  {UNITS.map(({ key, label }, index) => {
                    const value = parts === null ? null : parts[key]
                    const lead = index === 0
                    return (
                      <div
                        key={key}
                        className={`flex min-w-0 flex-col items-center justify-center rounded-2xl border px-1 py-3 sm:py-4 ${
                          lead
                            ? 'border-teal-500/40 bg-teal-50 dark:border-teal-400/30 dark:bg-teal-900/20'
                            : 'border-slate-300 bg-white/60 dark:border-slate-600 dark:bg-slate-800/60'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`font-baloo font-bold leading-none tabular-nums ${
                            lead
                              ? 'text-3xl text-teal-700 dark:text-teal-300 sm:text-5xl'
                              : 'text-2xl text-slate-800 dark:text-slate-100 sm:text-4xl'
                          }`}
                        >
                          {value === null ? '–' : lead ? value : pad2(value)}
                        </span>
                        <span className="mt-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p
                  role="status"
                  className="rounded-2xl border border-teal-500/40 bg-teal-50 px-4 py-5 text-center font-baloo text-xl font-bold text-teal-800 dark:border-teal-400/30 dark:bg-teal-900/20 dark:text-teal-200 sm:text-2xl"
                >
                  {phase === 'during'
                    ? 'Kỳ thi đang diễn ra — chúc các em bình tĩnh, tự tin!'
                    : 'Kỳ thi đã kết thúc. Chúc các em đạt kết quả như mong muốn!'}
                </p>
              )}

              {phase === 'before' && (
                <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Mỗi ngày một đề — đến ngày thi là đủ quen tay.
                  </p>
                  <Link
                    href="/#exams"
                    className="group btn-action inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
                  >
                    Luyện đề ngay
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </ScrollRevealClient>
      </div>
    </section>
  )
}
