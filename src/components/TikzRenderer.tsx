'use client'

import { useEffect, useRef, useState } from 'react'

// ==============================================
// TikZ Renderer: Render TikZ code trên browser
// Sử dụng tikzjax (WebAssembly LaTeX engine)
// ==============================================

interface TikzRendererProps {
  /** Raw TikZ code (bao gồm \begin{tikzpicture}...\end{tikzpicture}) */
  code: string
  /** CSS class cho container */
  className?: string
  /** Các gói TikZ cần load (mặc định: tkz-tab, calc, arrows.meta) */
  packages?: Record<string, string>
}

// Track tikzjax loading state globally
let tikzjaxLoaded = false
let tikzjaxLoading = false
const tikzjaxCallbacks: (() => void)[] = []

/**
 * Load TikZJax script từ CDN (chỉ load 1 lần)
 */
function loadTikzJax(): Promise<void> {
  return new Promise((resolve) => {
    if (tikzjaxLoaded) {
      resolve()
      return
    }

    tikzjaxCallbacks.push(resolve)

    if (tikzjaxLoading) return
    tikzjaxLoading = true

    // Load fonts CSS
    const fontLink = document.createElement('link')
    fontLink.rel = 'stylesheet'
    fontLink.type = 'text/css'
    fontLink.href = 'https://tikzjax.com/v1/fonts.css'
    document.head.appendChild(fontLink)

    // Load tikzjax script
    const script = document.createElement('script')
    script.src = 'https://tikzjax.com/v1/tikzjax.js'
    script.async = true
    script.onload = () => {
      tikzjaxLoaded = true
      tikzjaxLoading = false
      tikzjaxCallbacks.forEach(cb => cb())
      tikzjaxCallbacks.length = 0
    }
    script.onerror = () => {
      tikzjaxLoading = false
      console.error('Failed to load TikZJax')
      tikzjaxCallbacks.forEach(cb => cb())
      tikzjaxCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

/**
 * Component render 1 TikZ block
 */
export default function TikzRenderer({
  code,
  className = '',
  packages = {},
}: TikzRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fallbackMode, setFallbackMode] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        await loadTikzJax()
        if (cancelled || !containerRef.current) return

        // Clear previous content
        containerRef.current.innerHTML = ''

        // Tạo thẻ <script type="text/tikz">
        const tikzScript = document.createElement('script')
        tikzScript.type = 'text/tikz'

        // Thêm packages nếu cần (tkz-tab, calc, arrows.meta mặc định)
        const defaultPackages: Record<string, string> = {
          'tkz-tab': '',
          ...packages,
        }
        tikzScript.dataset.texPackages = JSON.stringify(defaultPackages)

        // Clean code: đảm bảo có \begin{tikzpicture}
        let cleanCode = code.trim()
        if (!cleanCode.includes('\\begin{tikzpicture}')) {
          cleanCode = `\\begin{tikzpicture}\n${cleanCode}\n\\end{tikzpicture}`
        }

        tikzScript.textContent = cleanCode
        containerRef.current.appendChild(tikzScript)

        // Trigger tikzjax rendering
        // tikzjax sẽ tự detect và render <script type="text/tikz"> mới
        if (typeof (window as any).tikzjax !== 'undefined') {
          (window as any).tikzjax()
        }

        // Fallback: nếu sau 5 giây không render được, show code
        const timeout = setTimeout(() => {
          if (!cancelled && containerRef.current) {
            const svgs = containerRef.current.querySelectorAll('svg')
            if (svgs.length === 0) {
              setFallbackMode(true)
            }
          }
        }, 5000)

        setStatus('ready')
        return () => clearTimeout(timeout)
      } catch (err) {
        console.error('TikZ render error:', err)
        if (!cancelled) {
          setStatus('error')
          setFallbackMode(true)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [code, packages])

  // Fallback: hiển thị code dạng preformatted
  if (fallbackMode) {
    return (
      <div className={`my-4 ${className}`}>
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 overflow-x-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
              TikZ
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              (Cần LaTeX để render hình)
            </span>
          </div>
          <pre className="text-xs text-slate-600 dark:text-slate-300 font-mono whitespace-pre-wrap">
            {code}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className={`my-4 flex justify-center ${className}`}>
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 py-4">
          <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          Đang render hình...
        </div>
      )}
      <div
        ref={containerRef}
        className="tikz-container [&_svg]:max-w-full [&_svg]:h-auto"
      />
    </div>
  )
}

/**
 * Kiểm tra xem string có chứa TikZ code không
 */
export function hasTikzCode(content: string): boolean {
  return /```tikz/.test(content) || /\\begin\{tikzpicture\}/.test(content)
}

/**
 * Trích xuất các TikZ blocks từ Markdown content
 * (blocks nằm trong ```tikz ... ``` fences)
 */
export function extractTikzFromMarkdown(content: string): {
  blocks: string[]
  contentWithoutTikz: string
} {
  const blocks: string[] = []
  const contentWithoutTikz = content.replace(
    /```tikz\n([\s\S]*?)```/g,
    (_match, code) => {
      blocks.push(code.trim())
      return `%%TIKZ_BLOCK_${blocks.length - 1}%%`
    }
  )
  return { blocks, contentWithoutTikz }
}
