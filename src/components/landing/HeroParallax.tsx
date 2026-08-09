'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Lớp trang trí hero trôi chậm hơn nội dung khi cuộn.
 *
 * VÌ SAO KHÔNG DÙNG GSAP ScrollTrigger. Dự án có sẵn `gsap`, nhưng ScrollTrigger
 * là một plugin riêng và kéo nó vào chỉ để chạy đúng một hiệu ứng trang trí trên
 * trang chủ là không đáng — phần dưới đây là một `requestAnimationFrame` với
 * `transform`, không thêm byte nào vào bundle.
 *
 * Ba ràng buộc lấy từ chính khuyến nghị của skill ui-ux-pro-max (preset
 * "Parallax Scroll", tier Subtle), và cả ba đều có lý do:
 *
 *  1. **Chỉ áp cho lớp trang trí, không bao giờ cho chữ.** Parallax lên nội dung
 *     đọc được gây mỏi mắt và say chuyển động.
 *  2. **Biên độ nhỏ.** Giữ dưới ~15% chiều cao khung nhìn để nền và nội dung
 *     không lệch pha tới mức gây chú ý.
 *  3. **`will-change` chỉ bật trong lúc cuộn**, gỡ ra khi nghỉ — để nguyên là
 *     giữ một lớp hợp thành trên GPU suốt vòng đời trang.
 *
 * Tôn trọng `prefers-reduced-motion` bằng cách KHÔNG gắn listener nào cả. Lưới
 * an toàn trong `globals.css` chỉ tắt được `animation`/`transition` của CSS,
 * không chạm tới `transform` do JS đặt — nên phải chặn ngay từ đây.
 */
interface HeroParallaxProps {
  children: ReactNode
  /** Phần trăm chiều cao khung nhìn mà lớp này dịch khi cuộn hết hero. */
  strength?: number
  className?: string
}

export default function HeroParallax({
  children,
  strength = 12,
  className = '',
}: HeroParallaxProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return

    let frame = 0
    let idle: number | undefined

    /*
      Đo trên PHẦN TỬ CHA, không đo trên `el`.

      `el` là thứ đang bị `transform`, nên `getBoundingClientRect()` của nó đã
      cộng luôn phép dịch vừa đặt — vừa đo vừa dịch chính nó thì giá trị phản hồi
      lẫn nhau và tiến độ bị kẹt. Section cha không bao giờ bị transform nên là
      mốc ổn định.
    */
    const moc = el.parentElement ?? el

    const apply = () => {
      frame = 0
      // Chỉ tính khi hero còn dính màn hình; cuộn qua rồi thì thôi.
      const rect = moc.getBoundingClientRect()
      if (rect.bottom < 0) return
      const tien = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)))
      el.style.transform = `translate3d(0, ${(tien * strength).toFixed(2)}%, 0)`
    }

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(apply)
      el.style.willChange = 'transform'
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        el.style.willChange = 'auto'
      }, 160)
    }

    apply()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      window.clearTimeout(idle)
      el.style.willChange = 'auto'
      el.style.transform = ''
    }
  }, [strength])

  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  )
}
