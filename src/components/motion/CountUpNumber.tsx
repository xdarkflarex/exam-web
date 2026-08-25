'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Số đếm tăng dần khi cuộn tới.
 *
 * Vì sao cần component riêng thay vì một class CSS: đây là animation trên GIÁ TRỊ
 * (text nội dung), không phải trên thuộc tính style, nên khối
 * `prefers-reduced-motion` trong `globals.css` không chạm tới được. Việc tôn trọng
 * reduced-motion phải làm bằng JS — đọc media query và render thẳng số cuối.
 *
 * Số cuối luôn là `value` truyền vào (đếm thật từ DB), không phải số tự sinh.
 * Nếu JS không chạy hoặc observer không kích hoạt, giá trị hiển thị vẫn là số
 * cuối chứ không phải 0 — số liệu không được phụ thuộc vào animation.
 */
interface CountUpNumberProps {
  value: number
  /** Thời lượng đếm (ms). Ngắn thôi: đây là số liệu, không phải màn trình diễn. */
  durationMs?: number
  className?: string
}

/** Định dạng theo locale Việt (1.234) — khớp với `formatCount` ở StatsStrip. */
function format(value: number) {
  return value.toLocaleString('vi-VN')
}

/**
 * Dưới ngưỡng này thì hiện thẳng số, không đếm.
 *
 * Đếm từ 0 lên 3 không đọc ra là "đang đếm" — nó đọc ra là số bị nhấp nháy. Hiệu
 * ứng chỉ có nghĩa khi quãng đường đủ dài để mắt thấy được chiều tăng.
 *
 * Đặt ngưỡng ở ĐÂY chứ không phải ở từng chỗ dùng là có chủ đích: chỗ dùng
 * thường không biết trước giá trị (số câu đã làm, số đề — đều là dữ liệu chạy),
 * nên để mỗi nơi tự đoán sẽ ra mỗi nơi một luật.
 */
const MIN_DE_DEM = 10

export default function CountUpNumber({
  value,
  durationMs = 900,
  className = '',
}: CountUpNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(value)
  const hasRun = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Không setState ở nhánh này: `display` đã khởi tạo bằng `value`, nên khi
    // người dùng bật reduced-motion (hoặc số bằng 0) thì giá trị đúng đã có sẵn
    // trên màn hình — gọi setState chỉ tạo thêm một lượt render vô ích.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || value < MIN_DE_DEM) return

    let frame = 0
    let startedAt = 0

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasRun.current) return
        hasRun.current = true
        observer.unobserve(entry.target)

        // setState nằm trong callback của observer (external system), không phải
        // trong thân effect — đây là hướng dùng effect mà React khuyến nghị.
        const step = (timestamp: number) => {
          if (!startedAt) startedAt = timestamp
          const progress = Math.min(1, (timestamp - startedAt) / durationMs)
          // easeOutCubic: nhanh lúc đầu, chậm dần về đích — đọc dễ hơn linear.
          const eased = 1 - Math.pow(1 - progress, 3)
          setDisplay(Math.round(value * eased))
          if (progress < 1) frame = requestAnimationFrame(step)
        }
        setDisplay(0)
        frame = requestAnimationFrame(step)
      },
      { threshold: 0.4 }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [value, durationMs])

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  )
}
