'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'

interface ScrollRevealClientProps {
  children: ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade'
}

export default function ScrollRevealClient({ 
  children, 
  className = '', 
  delay = 0,
  direction = 'up' 
}: ScrollRevealClientProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsVisible(true)
          }, delay)
          observer.unobserve(entry.target)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [delay])

  const getInitialTransform = () => {
    switch (direction) {
      case 'up': return 'translate-y-8'
      case 'down': return '-translate-y-8'
      case 'left': return 'translate-x-8'
      case 'right': return '-translate-x-8'
      case 'fade': return ''
      default: return 'translate-y-8'
    }
  }

  /*
    `scroll-reveal` là móc cho lưới reduced-motion trong `globals.css`.

    Trạng thái ban đầu ở đây là `opacity-0` + `translate` — utility class, KHÔNG
    phải animation. Nên lưới an toàn cuối `globals.css` không chạm tới được: nó
    chỉ rút ngắn `animation-duration`/`transition-duration`, và ép `opacity: 1`
    cho đúng hai lớp `.stagger-children` / `.animate-list-stagger`. Thiếu móc
    này thì bật "giảm chuyển động" xong nội dung vẫn trượt vào khi cuộn.

    Xử lý bằng CSS chứ không phải `matchMedia` trong effect, vì hai lý do: đọc
    media query rồi `setState` ngay trong thân effect là cascading render (quy
    tắc `react-hooks/set-state-in-effect` chặn, và `CountUpNumber` đã tránh đúng
    bẫy này), còn tính ở `useState(() => …)` thì server render ra `false` và
    client render ra `true` — lệch hydration.
  */
  return (
    <div
      ref={ref}
      className={`scroll-reveal transition-all duration-700 ease-out ${className} ${
        isVisible
          ? 'opacity-100 translate-x-0 translate-y-0'
          : `opacity-0 ${getInitialTransform()}`
      }`}
    >
      {children}
    </div>
  )
}
