'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { tikzFigureKey } from '@/lib/theories/tikz-figure-key'

/**
 * Hiển thị một hình TikZ, theo thứ tự ưu tiên:
 *
 * 1. SVG dựng sẵn ở `public/tikz/<khoá>.svg` — do
 *    `scripts/render-tikz-svg.mjs` biên dịch bằng LaTeX thật của thầy. Giống
 *    hệt hình trong sách in, tải nhanh, không cần mạng ngoài.
 * 2. TikZJax trong trình duyệt — dự phòng cho hình chưa kịp dựng. Lưu ý nó
 *    KHÔNG có `tkz-tab` và không biết các màu riêng của bộ bài, nên bảng biến
 *    thiên gần như chắc chắn rơi xuống bước 3.
 * 3. Khung xổ ra mã TikZ để còn đọc được nội dung.
 */

interface TikzRendererProps {
  /** Raw TikZ code, with or without \begin{tikzpicture}...\end{tikzpicture}. */
  code: string
  className?: string
  packages?: Record<string, string>
}

/** Thư mục chứa SVG dựng sẵn, tương ứng `--out` của script. */
const PREBUILT_DIR = '/tikz'

let tikzjaxLoaded = false
let tikzjaxLoading = false
const tikzjaxCallbacks: (() => void)[] = []
const tikzSvgCache = new Map<string, string>()
const EMPTY_PACKAGES: Record<string, string> = {}

type TikzWindow = Window & {
  tikzjax?: () => void
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return `${value.length}:${hash}`
}

function loadTikzJax(): Promise<void> {
  return new Promise((resolve) => {
    if (tikzjaxLoaded) {
      resolve()
      return
    }

    tikzjaxCallbacks.push(resolve)
    if (tikzjaxLoading) return
    tikzjaxLoading = true

    const fontLink = document.createElement('link')
    fontLink.rel = 'stylesheet'
    fontLink.type = 'text/css'
    fontLink.href = 'https://tikzjax.com/v1/fonts.css'
    document.head.appendChild(fontLink)

    const script = document.createElement('script')
    script.src = 'https://tikzjax.com/v1/tikzjax.js'
    script.async = true
    script.onload = () => {
      tikzjaxLoaded = true
      tikzjaxLoading = false
      tikzjaxCallbacks.splice(0).forEach(callback => callback())
    }
    script.onerror = () => {
      tikzjaxLoading = false
      tikzjaxCallbacks.splice(0).forEach(callback => callback())
    }
    document.head.appendChild(script)
  })
}

function normalizeTikzCode(code: string) {
  const cleanCode = code.trim()
  if (cleanCode.includes('\\begin{tikzpicture}')) return cleanCode
  return `\\begin{tikzpicture}\n${cleanCode}\n\\end{tikzpicture}`
}

export default function TikzRenderer({
  code,
  className = '',
  packages = EMPTY_PACKAGES,
}: TikzRendererProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [isVisible, setIsVisible] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const figureKey = useMemo(() => tikzFigureKey(code), [code])
  const [prebuilt, setPrebuilt] = useState<'checking' | 'found' | 'missing'>('checking')

  // Mã hình đổi thì phải hỏi lại xem có SVG dựng sẵn không
  useEffect(() => {
    setPrebuilt('checking')
  }, [figureKey])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return
    // Có SVG dựng sẵn (hoặc còn đang chờ ảnh trả lời) thì chưa cần TikZJax
    if (prebuilt !== 'missing') return

    let cancelled = false
    let pollTimer: number | undefined
    const packageKey = JSON.stringify(packages)
    const cacheKey = hashString(`${code}\n${packageKey}`)

    async function render() {
      try {
        setStatus('loading')
        setFallbackMode(false)

        if (tikzSvgCache.has(cacheKey) && containerRef.current) {
          containerRef.current.innerHTML = tikzSvgCache.get(cacheKey) || ''
          setStatus('ready')
          return
        }

        await loadTikzJax()
        if (cancelled || !containerRef.current) return

        const tikzWindow = window as TikzWindow
        if (typeof tikzWindow.tikzjax === 'undefined') {
          throw new Error('TikZJax is not available')
        }

        containerRef.current.innerHTML = ''

        const tikzScript = document.createElement('script')
        tikzScript.type = 'text/tikz'
        tikzScript.dataset.texPackages = JSON.stringify({
          'tkz-tab': '',
          calc: '',
          'arrows.meta': '',
          ...packages,
        })
        tikzScript.textContent = normalizeTikzCode(code)
        containerRef.current.appendChild(tikzScript)

        tikzWindow.tikzjax()

        const startedAt = Date.now()
        pollTimer = window.setInterval(() => {
          if (cancelled || !containerRef.current) return

          const svg = containerRef.current.querySelector('svg')
          if (svg) {
            tikzSvgCache.set(cacheKey, svg.outerHTML)
            setStatus('ready')
            setFallbackMode(false)
            if (pollTimer) window.clearInterval(pollTimer)
            return
          }

          if (Date.now() - startedAt > 6500) {
            setStatus('error')
            setFallbackMode(true)
            if (pollTimer) window.clearInterval(pollTimer)
          }
        }, 250)
      } catch (error) {
        console.error('TikZ render error:', error)
        if (!cancelled) {
          setStatus('error')
          setFallbackMode(true)
        }
      }
    }

    void render()
    return () => {
      cancelled = true
      if (pollTimer) window.clearInterval(pollTimer)
    }
  }, [code, isVisible, packages, prebuilt, retryKey])

  /*
    Ảnh dựng sẵn. Vẫn gắn vào cây DOM khi đang `checking` (ẩn đi) để trình duyệt
    tải và cho biết có tệp hay không — 404 thì `onError` chuyển sang TikZJax.
    Nền trắng cố định: SVG do LaTeX sinh ra là nét đen trên nền trong suốt, để
    nguyên thì nền tối không nhìn thấy gì.

    TUYỆT ĐỐI KHÔNG ĐẶT `loading="lazy"` Ở ĐÂY. Đó là nguyên nhân của lỗi "Đang
    tải hình..." quay mãi không ra hình, quan sát lần đầu 2026-08-13 và đo lại
    2026-09-04 trong trình duyệt:

        lazy + display:none  -> KHÔNG sự kiện nào, kẹt vĩnh viễn
        lazy + đang hiện     -> KHÔNG sự kiện nào
        eager + display:none -> onload, chạy đúng

    Thẻ `<img>` này vừa là ảnh vừa là PHÉP DÒ "có tệp hay không", và phép dò chỉ
    kết luận được bằng `onLoad`/`onError`. `lazy` cho phép trình duyệt hoãn việc
    tải vô thời hạn, mà hoãn tải nghĩa là không sự kiện nào bắn — nên nhánh
    `checking` không bao giờ thoát ra được. Ảnh thì không hiện, mà TikZJax cũng
    không được gọi vì `prebuilt` chưa bao giờ thành `missing`. Hỏng cả hai đường
    cùng lúc, và im lặng.

    Vẫn hoãn tải, nhưng hoãn bằng `IntersectionObserver` của chính component
    (`isVisible`, đệm 240px): nó quyết định KHI NÀO gắn thẻ vào cây, còn khi đã
    gắn thì tải ngay và trả lời dứt khoát.
  */
  if (prebuilt !== 'missing') {
    return (
      <div ref={viewportRef} className={`my-4 flex justify-center ${className}`}>
        {prebuilt === 'checking' && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400 dark:text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Đang tải hình...
          </div>
        )}
        {/* next/image không tối ưu SVG (còn phải bật dangerouslyAllowSVG), nên <img> là đúng ở đây */}
        {isVisible && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`${PREBUILT_DIR}/${figureKey}.svg`}
            alt="Hình minh hoạ"
            onLoad={() => setPrebuilt('found')}
            onError={() => setPrebuilt('missing')}
            className={`h-auto max-w-full rounded-xl bg-white p-2 dark:ring-1 dark:ring-slate-700 ${
              prebuilt === 'found' ? '' : 'hidden'
            }`}
          />
        )}
      </div>
    )
  }

  if (fallbackMode || status === 'error') {
    return (
      // `tex2jax_ignore`: khung dự phòng in ra mã TikZ thô, MathJax không được
      // đụng vào nếu không lại báo "Unknown environment 'tikzpicture'".
      <div ref={viewportRef} className={`my-4 tex2jax_ignore ${className}`}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">TikZ</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Không render được trong trình duyệt</span>
            <button
              type="button"
              onClick={() => setRetryKey(key => key + 1)}
              className="rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-500"
            >
              Thử render lại
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">Xem mã TikZ</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-slate-600 dark:text-slate-300">{code}</pre>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div ref={viewportRef} className={`my-4 flex justify-center ${className}`}>
      {status === 'loading' && (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-400 dark:text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          {isVisible ? 'Đang render hình...' : 'Chuẩn bị render hình...'}
        </div>
      )}
      <div
        ref={containerRef}
        className="tikz-container [&_svg]:h-auto [&_svg]:max-w-full"
      />
    </div>
  )
}

export function hasTikzCode(content: string): boolean {
  return /```tikz/.test(content) || /\\begin\{tikzpicture\}/.test(content)
}

export function extractTikzFromMarkdown(content: string): {
  blocks: string[]
  contentWithoutTikz: string
} {
  const blocks: string[] = []
  const contentWithoutTikz = content.replace(
    /```tikz\n([\s\S]*?)```/g,
    (_match, codeBlock) => {
      blocks.push(codeBlock.trim())
      return `%%TIKZ_BLOCK_${blocks.length - 1}%%`
    },
  )
  return { blocks, contentWithoutTikz }
}
