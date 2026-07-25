'use client'

import { useEffect, useRef, useState } from 'react'

interface TikzRendererProps {
  /** Raw TikZ code, with or without \begin{tikzpicture}...\end{tikzpicture}. */
  code: string
  className?: string
  packages?: Record<string, string>
}

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
  }, [code, isVisible, packages, retryKey])

  if (fallbackMode || status === 'error') {
    return (
      <div ref={viewportRef} className={`my-4 ${className}`}>
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
