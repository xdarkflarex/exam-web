/**
 * Vòng tiến độ.
 *
 * SVG thuần, không thư viện chart. Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 7.3:
 * ba hình cần dùng không đủ để biện minh cho ~100KB của recharts.
 *
 * Số luôn nằm ở tâm vòng. Trạng thái không bao giờ chỉ được truyền đạt bằng màu
 * (docs/DESIGN_SYSTEM.md).
 */

export type RingTone = 'teal' | 'amber' | 'rose' | 'slate' | 'emerald'

const TONE_STROKE: Record<RingTone, string> = {
  teal: 'stroke-teal-500 dark:stroke-teal-400',
  amber: 'stroke-amber-500 dark:stroke-amber-400',
  rose: 'stroke-rose-500 dark:stroke-rose-400',
  emerald: 'stroke-emerald-500 dark:stroke-emerald-400',
  slate: 'stroke-slate-400 dark:stroke-slate-500',
}

const TONE_TEXT: Record<RingTone, string> = {
  teal: 'text-teal-700 dark:text-teal-300',
  amber: 'text-amber-700 dark:text-amber-300',
  rose: 'text-rose-700 dark:text-rose-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  slate: 'text-slate-600 dark:text-slate-300',
}

interface Props {
  /** 0-100. Giá trị ngoài khoảng bị kẹp lại; `null` là "chưa có dữ liệu". */
  value: number | null
  /** Đường kính px. */
  size?: number
  thickness?: number
  tone?: RingTone
  /** Nhãn nhỏ dưới số, ví dụ "đúng". */
  caption?: string
  /** Bắt buộc: mô tả cho screen reader, phải chứa cả con số và ý nghĩa. */
  ariaLabel: string
  /**
   * Vẽ cung dần khi hiện ra, thay vì hiện sẵn nguyên cung.
   *
   * Mặc định `false`: các chỗ dùng để đọc số liệu (analytics, history) không
   * nên chuyển động. Chỉ bật ở nơi vòng là điểm nhìn đầu tiên của trang.
   *
   * Hoàn toàn bằng CSS (`.ring-arc-animate` trong `globals.css`) nên component
   * này vẫn là server component — không cần `'use client'`, không thêm JS.
   */
  animate?: boolean
}

export default function ProgressRing({
  value,
  size = 96,
  thickness = 8,
  tone = 'teal',
  caption,
  ariaLabel,
  animate = false,
}: Props) {
  const hasValue = value !== null && Number.isFinite(value)
  const clamped = hasValue ? Math.min(100, Math.max(0, value as number)) : 0
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (clamped / 100) * circumference

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Rãnh nền */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        {hasValue && clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            /*
              Một giá trị (= chu vi) + `strokeDashoffset`, thay cho cặp
              `cung khoảng-trống`. Trạng thái tĩnh giống hệt cách cũ, nhưng chu
              kỳ mẫu nét đứt thành hai lần chu vi nên phép dịch offset mới vẽ
              được cung ra dần — xem chú thích `ring-draw` trong `globals.css`.
            */
            strokeDasharray={circumference}
            strokeDashoffset={circumference - dash}
            // Bắt đầu từ 12 giờ thay vì 3 giờ.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={`${TONE_STROKE[tone]}${animate ? ' ring-arc-animate' : ''}`}
            style={
              animate
                ? ({
                    '--ring-len': circumference,
                    '--ring-offset': circumference - dash,
                  } as React.CSSProperties)
                : undefined
            }
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {hasValue ? (
          <>
            <span className={`font-baloo font-bold ${TONE_TEXT[tone]}`} style={{ fontSize: size * 0.28 }}>
              {Math.round(clamped)}
              <span style={{ fontSize: size * 0.16 }}>%</span>
            </span>
            {caption && (
              <span className="mt-0.5 text-slate-500 dark:text-slate-400" style={{ fontSize: size * 0.12 }}>
                {caption}
              </span>
            )}
          </>
        ) : (
          <span className="px-2 text-center text-slate-400 dark:text-slate-500" style={{ fontSize: size * 0.13 }}>
            Chưa có
            <br />
            dữ liệu
          </span>
        )}
      </div>
    </div>
  )
}
