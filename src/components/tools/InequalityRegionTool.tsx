'use client'

import { useMemo, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { MathJax } from 'better-react-mathjax'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  PencilRuler,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { MathProvider } from '@/components/MathContent'
import InequalityPlot, { computeView, LINE_COLORS } from './InequalityPlot'
import RichText from './RichText'
import { Frac } from '@/lib/tools/inequality-region/fraction'
import {
  inequalityTex,
  linearTex,
  opTex,
  parseInequalityLine,
  parseLinearExpression,
  type Linear,
} from '@/lib/tools/inequality-region/parse'
import { analyzeLine, analyzeRegion, checkPoint, optimize, type Pt } from '@/lib/tools/inequality-region/solve'
import { buildSteps, optimizationLines, ptTex, substituteTex, type SystemItem } from '@/lib/tools/inequality-region/steps'

/**
 * Công cụ vẽ miền nghiệm hệ bất phương trình bậc nhất hai ẩn (Toán 10, chương 2).
 *
 * Luồng: học sinh nhập hệ → bấm Vẽ → đi từng bước đúng như bài giải tay (vẽ bờ,
 * chọn điểm thử, gạch bỏ) → kết luận miền nghiệm và các đỉnh. Kèm hai việc hay
 * gặp trong cùng bài: kiểm tra một điểm có thuộc miền nghiệm không, và tìm
 * GTLN – GTNN của F = ax + by.
 *
 * Toàn bộ tính ở trình duyệt, không gọi server, không ghi gì.
 */

const MAX_INEQUALITIES = LINE_COLORS.length

interface Row {
  id: number
  text: string
}

interface Example {
  label: string
  rows: string[]
  objective?: string
}

const EXAMPLES: Example[] = [
  { label: 'Ví dụ SGK', rows: ['3x + y <= 6', 'x + y <= 4', 'x >= 0', 'y >= 0'] },
  { label: 'Có dấu chặt', rows: ['x + y < 5', 'x - y > -1', 'y >= 0'] },
  { label: 'Miền không bị chặn', rows: ['x + y >= 2', 'x - 2y <= 2', 'x >= 0'] },
  { label: 'Bài toán thực tế', rows: ['x + y <= 6', '2x + y <= 8', 'x >= 0', 'y >= 0'], objective: 'F = 3x + 2y' },
]

let nextId = 1
const toRows = (texts: string[]): Row[] => texts.map((text) => ({ id: nextId++, text }))

/** Các dòng hợp lệ → danh sách bất phương trình (dòng `0 ≤ x ≤ 5` cho ra hai). */
function itemsOf(rows: Row[]): SystemItem[] {
  return rows.flatMap((row) => {
    if (!row.text.trim()) return []
    const r = parseInequalityLine(row.text)
    return r.ok ? r.items.map((parsed) => ({ source: row.text, parsed, fromChain: r.items.length > 1 })) : []
  })
}

const keyOf = (rows: Row[]) => rows.map((r) => r.text.trim()).join('\n')

/** Tách đoạn dán vào: xuống dòng, dấu `;`, `\\` của môi trường `cases`. */
function splitPasted(text: string): string[] {
  return text
    .replace(/\\begin\{cases\}|\\end\{cases\}|\\left\\\{|\\right\.|\\\{/g, '\n')
    .split(/\r?\n|;|\\\\/)
    .map((s) => s.replace(/^\s*\{/, '').trim())
    .filter(Boolean)
}

const fieldClass =
  'rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
const inputClass = `${fieldClass} w-full`

export default function InequalityRegionTool() {
  // Mở trang là đã có ví dụ SGK vẽ sẵn ở bước 1: học sinh thấy ngay công cụ làm
  // gì, thay vì nhìn một khung trống và tự đoán phải gõ gì.
  const [initialRows] = useState<Row[]>(() => toRows(EXAMPLES[0].rows))
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [committed, setCommitted] = useState<{ items: SystemItem[]; key: string; version: number } | null>(() => ({
    items: itemsOf(initialRows),
    key: keyOf(initialRows),
    version: 1,
  }))
  const [stepIndex, setStepIndex] = useState(0)
  const [probeX, setProbeX] = useState('')
  const [probeY, setProbeY] = useState('')
  const [probe, setProbe] = useState<{ pt: Pt } | null>(null)
  const [probeError, setProbeError] = useState('')
  const [objective, setObjective] = useState('')
  const [objectiveValue, setObjectiveValue] = useState<Linear | null>(null)
  const [objectiveError, setObjectiveError] = useState('')

  const parsedRows = rows.map((row) => (row.text.trim() ? parseInequalityLine(row.text) : null))
  const validItems = itemsOf(rows)
  const hasErrors = parsedRows.some((r) => r && !r.ok)
  const tooMany = validItems.length > MAX_INEQUALITIES
  const rowsKey = keyOf(rows)
  const stale = committed !== null && committed.key !== rowsKey

  const system = useMemo(() => {
    if (!committed) return null
    const inequalities = committed.items.map((it) => it.parsed.inequality)
    const lines = inequalities.map(analyzeLine)
    const region = analyzeRegion(inequalities)
    const steps = buildSteps(committed.items, region)
    return { inequalities, lines, region, steps }
  }, [committed])

  const probeResult = useMemo(() => {
    if (!system || !probe) return null
    return checkPoint(system.inequalities, probe.pt)
  }, [system, probe])

  const optimization = useMemo(() => {
    if (!system || !objectiveValue) return null
    return optimize(system.inequalities, system.region, objectiveValue)
  }, [system, objectiveValue])

  const view = useMemo(() => {
    if (!system) return computeView([])
    const pts: Pt[] = [
      ...system.lines.flatMap((l) => [...l.points, l.testPoint]),
      ...system.region.vertices,
      ...(probe ? [probe.pt] : []),
    ]
    return computeView(pts)
  }, [system, probe])

  const step = system ? system.steps[Math.min(stepIndex, system.steps.length - 1)] : null
  const lastIndex = system ? system.steps.length - 1 : 0

  function draw(texts?: string[], nextObjective?: string) {
    let items = validItems
    let key = rowsKey
    if (texts) {
      const fresh = toRows(texts)
      setRows(fresh)
      key = keyOf(fresh)
      items = itemsOf(fresh)
    }
    if (items.length === 0 || items.length > MAX_INEQUALITIES) return
    setCommitted((prev) => ({ items, key, version: (prev?.version ?? 0) + 1 }))
    setStepIndex(0)
    setProbe(null)
    setProbeError('')
    if (nextObjective !== undefined) {
      setObjective(nextObjective)
      const r = parseLinearExpression(nextObjective)
      setObjectiveValue(r.ok ? r.value : null)
    } else {
      setObjectiveValue(null)
    }
    setObjectiveError('')
  }

  function updateRow(id: number, text: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, text } : r)))
  }

  function onPaste(id: number, e: ClipboardEvent<HTMLInputElement>) {
    const parts = splitPasted(e.clipboardData.getData('text'))
    if (parts.length <= 1) return
    e.preventDefault()
    setRows((rs) => {
      const at = rs.findIndex((r) => r.id === id)
      return [...rs.slice(0, at), ...toRows(parts), ...rs.slice(at + 1)]
    })
  }

  function go(index: number) {
    if (!system) return
    setStepIndex(Math.max(0, Math.min(system.steps.length - 1, index)))
  }

  function onStepsKey(e: KeyboardEvent<HTMLElement>) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(stepIndex + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(stepIndex - 1)
    }
  }

  function runProbe() {
    const x = Frac.parse(probeX)
    const y = Frac.parse(probeY)
    if (!x || !y) {
      setProbeError('Nhập hoành độ và tung độ là số, ví dụ 1, −2, 0,5 hoặc 3/4.')
      setProbe(null)
      return
    }
    setProbeError('')
    setProbe({ pt: { x, y } })
  }

  function runObjective() {
    const r = parseLinearExpression(objective)
    if (!r.ok) {
      setObjectiveError(r.error)
      setObjectiveValue(null)
      return
    }
    setObjectiveError('')
    setObjectiveValue(r.value)
    // GTLN – GTNN đọc ở các đỉnh, nên nhảy tới bước kết luận để thấy đỉnh.
    if (system) setStepIndex(system.steps.length - 1)
  }

  const highlight =
    optimization && step?.stage.final
      ? [...new Set([...(optimization.max.attained ? optimization.max.at : []), ...(optimization.min.attained ? optimization.min.at : [])])]
      : []

  return (
    <MathProvider>
      <main className="min-h-screen p-4 lg:p-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/student/tools"
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Công cụ
          </Link>

          <header className="animate-dash-in bento-tile-lead mb-6 overflow-hidden">
            <div className="paper-grid p-5 sm:p-6">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-white sm:text-3xl">
                <PencilRuler className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                Vẽ miền nghiệm hệ bất phương trình
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Toán 10 · Chương 2 · Bất phương trình và hệ bất phương trình bậc nhất hai ẩn
              </p>
              <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <LegendChip>
                  <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="2.4" /></svg>
                  Nét liền: dấu ≤, ≥ — bờ thuộc miền nghiệm
                </LegendChip>
                <LegendChip>
                  <svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth="2.4" strokeDasharray="6 4" /></svg>
                  Nét đứt: dấu &lt;, &gt; — bờ không thuộc miền nghiệm
                </LegendChip>
                <LegendChip>
                  <svg width="18" height="14" aria-hidden="true">
                    <path d="M0 14 L14 0 M4 14 L18 0 M-4 14 L10 0" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Phần bị gạch: KHÔNG phải nghiệm
                </LegendChip>
              </ul>
            </div>
          </header>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
            {/* ── Nhập hệ ── */}
            <section aria-labelledby="ir-input" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="ir-input" className="text-base font-semibold text-slate-800 dark:text-white">
                  Nhập hệ bất phương trình
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">mỗi dòng một bất phương trình</span>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => draw(ex.rows, ex.objective ?? '')}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <ol className="space-y-2">
                {rows.map((row, i) => {
                  const r = parsedRows[i]
                  const errorId = `ir-err-${row.id}`
                  return (
                    <li key={row.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-xs font-semibold text-slate-400">{i + 1}.</span>
                        <input
                          value={row.text}
                          onChange={(e) => updateRow(row.id, e.target.value)}
                          onPaste={(e) => onPaste(row.id, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              draw()
                            }
                          }}
                          placeholder="ví dụ: 2x + y <= 4"
                          aria-label={`Bất phương trình dòng ${i + 1}`}
                          aria-invalid={r ? !r.ok : undefined}
                          aria-describedby={r && !r.ok ? errorId : undefined}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          inputMode="text"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== row.id) : [{ ...row, text: '' }]))}
                          aria-label={`Xoá dòng ${i + 1}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {r && !r.ok && (
                        <p id={errorId} className="ml-8 mt-1 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {r.error}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>

              <p className="ml-8 mt-2 text-xs text-slate-500 dark:text-slate-400">
                Gõ <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">&lt;=</code> cho ≤,{' '}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">&gt;=</code> cho ≥. Nhận cả{' '}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">y &gt;= 2x - 1</code>,{' '}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">0 &lt;= x &lt;= 5</code>, phân số, số thập phân.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRows((rs) => [...rs, ...toRows([''])])}
                  disabled={validItems.length >= MAX_INEQUALITIES}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm dòng
                </button>
                <button
                  type="button"
                  onClick={() => draw()}
                  disabled={validItems.length === 0 || hasErrors || tooMany}
                  className="btn-action ml-auto inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400"
                >
                  <PencilRuler className="h-4 w-4" aria-hidden="true" />
                  {committed ? 'Vẽ lại' : 'Vẽ miền nghiệm'}
                </button>
              </div>
              {tooMany && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  Tối đa {MAX_INEQUALITIES} bất phương trình để hình còn đọc được.
                </p>
              )}
              {stale && !hasErrors && (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400" role="status">
                  Hệ đã sửa — bấm “Vẽ lại” để cập nhật hình.
                </p>
              )}
            </section>

            {/* ── Hình ── */}
            <section
              aria-label="Hình vẽ miền nghiệm"
              className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1"
            >
              {system && step ? (
                <InequalityPlot
                  inequalities={system.inequalities}
                  lines={system.lines}
                  region={system.region}
                  view={view}
                  stage={step.stage}
                  probe={probe && probeResult ? { pt: probe.pt, inside: probeResult.inside } : null}
                  highlight={highlight}
                  title={`Hệ trục Oxy, bước ${stepIndex + 1} trên ${system.steps.length}: ${step.title.replace(/\$/g, '')}`}
                />
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                  <PencilRuler className="h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nhập hệ rồi bấm <strong>Vẽ miền nghiệm</strong>, hoặc chọn một ví dụ.
                  </p>
                </div>
              )}
              {system && (
                <MathJax dynamic key={`legend-${committed?.version}`}>
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-sm text-slate-700 dark:text-slate-300">
                    {system.inequalities.map((q, i) => (
                      <li key={i} className="inline-flex items-center gap-1.5">
                        <svg width="22" height="8" aria-hidden="true">
                          <line
                            x1="1"
                            y1="4"
                            x2="21"
                            y2="4"
                            stroke={LINE_COLORS[i]}
                            strokeWidth="2.6"
                            strokeDasharray={system.lines[i].strict ? '5 3' : undefined}
                          />
                        </svg>
                        <span>
                          {`$d_{${i + 1}}$`}: {`$${inequalityTex(q)}$`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </MathJax>
              )}
            </section>

            {/* ── Từng bước ── */}
            {system && step && (
              <section
                aria-labelledby="ir-steps"
                onKeyDown={onStepsKey}
                className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-2"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 id="ir-steps" className="text-base font-semibold text-slate-800 dark:text-white">
                    Từng bước
                  </h2>
                  <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                    Bước {stepIndex + 1}/{system.steps.length}
                  </span>
                </div>

                {/* Thanh tiến độ: mỗi bất phương trình ba đoạn cùng màu, cuối là kết luận. */}
                <div className="mb-4 flex gap-1" role="group" aria-label="Chọn bước">
                  {system.steps.map((s, i) => {
                    const color = s.group === null ? undefined : LINE_COLORS[s.group]
                    const done = i <= stepIndex
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => go(i)}
                        aria-label={`Bước ${i + 1}: ${s.title.replace(/\$/g, '')}`}
                        aria-current={i === stepIndex ? 'step' : undefined}
                        className={`h-2 flex-1 rounded-full transition-opacity ${s.group === null ? 'bg-teal-600 dark:bg-teal-400' : ''} ${
                          done ? 'opacity-100' : 'opacity-25'
                        } ${i === stepIndex ? 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-800' : ''}`}
                        style={color ? { backgroundColor: color } : undefined}
                      />
                    )
                  })}
                </div>

                {/* `aria-live` nằm NGOÀI khối có key: khối bên trong bị dựng lại mỗi bước, vùng
                    thông báo phải là phần tử sống lâu thì trình đọc màn hình mới đọc thay đổi. */}
                <div aria-live="polite">
                <MathJax dynamic key={`step-${committed?.version}-${step.key}`}>
                  <div
                    className="border-l-4 pl-3"
                    style={{ borderColor: step.group === null ? '#0d9488' : LINE_COLORS[step.group] }}
                  >
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                      <RichText text={step.title} />
                    </h3>
                    <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {step.lines.map((line, i) => (
                        <p key={`${step.key}-${i}`}>
                          <RichText text={line} />
                        </p>
                      ))}
                    </div>
                  </div>
                </MathJax>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => go(stepIndex - 1)}
                    disabled={stepIndex === 0}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Trước
                  </button>
                  {stepIndex < lastIndex ? (
                    <>
                      <button
                        type="button"
                        onClick={() => go(stepIndex + 1)}
                        className="btn-action inline-flex items-center gap-1 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
                      >
                        Bước tiếp
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => go(lastIndex)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <SkipForward className="h-4 w-4" aria-hidden="true" />
                        Xem kết quả
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go(0)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Xem lại từ đầu
                    </button>
                  )}
                </div>
                <p className="mt-2 hidden text-xs text-slate-400 lg:block">Mẹo: dùng phím ← → để chuyển bước.</p>
              </section>
            )}

            {/* ── Kiểm tra điểm + GTLN–GTNN ── */}
            {system && (
              <div className="space-y-5 lg:col-start-2 lg:row-start-3">
                <section aria-labelledby="ir-probe" className="bento-tile p-4 sm:p-5">
                  <h2 id="ir-probe" className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-white">
                    <Crosshair className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    Điểm này có thuộc miền nghiệm không?
                  </h2>
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      runProbe()
                    }}
                  >
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      x
                      <input value={probeX} onChange={(e) => setProbeX(e.target.value)} className={`${fieldClass} mt-1 block w-24`} placeholder="1" />
                    </label>
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      y
                      <input value={probeY} onChange={(e) => setProbeY(e.target.value)} className={`${fieldClass} mt-1 block w-24`} placeholder="2" />
                    </label>
                    <button
                      type="submit"
                      className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950/40"
                    >
                      Kiểm tra
                    </button>
                  </form>
                  {probeError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{probeError}</p>}
                  {probe && probeResult && (
                    <MathJax dynamic key={`probe-${committed?.version}-${probe.pt.x.toPlain()}-${probe.pt.y.toPlain()}`}>
                      <ul className="mt-3 space-y-1 text-[15px] text-slate-700 dark:text-slate-300">
                        {system.inequalities.map((q, i) => (
                          <li key={i} className="flex items-center gap-2">
                            {probeResult.rows[i].holds ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="thoả" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-label="không thoả" />
                            )}
                            <span>
                              ({i + 1}): {`$${substituteTex(q.a, q.b, probe.pt)} ${opTex(q.op)} ${q.c.toTex()}$`}{' '}
                              <span className={probeResult.rows[i].holds ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                                {probeResult.rows[i].holds ? 'đúng' : 'sai'}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className={`mt-3 font-semibold ${probeResult.inside ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {`$M${ptTex(probe.pt)}$`}{' '}
                        {probeResult.inside
                          ? 'thoả mọi bất phương trình nên THUỘC miền nghiệm.'
                          : 'không thoả ít nhất một bất phương trình nên KHÔNG thuộc miền nghiệm.'}
                      </p>
                    </MathJax>
                  )}
                </section>

                <section aria-labelledby="ir-opt" className="bento-tile p-4 sm:p-5">
                  <h2 id="ir-opt" className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-white">
                    <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    Tìm GTLN – GTNN của F = ax + by
                  </h2>
                  {system.region.status === 'empty' ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Hệ vô nghiệm nên không có gì để tìm.</p>
                  ) : (
                    <>
                      <form
                        className="mt-3 flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          runObjective()
                        }}
                      >
                        <input
                          value={objective}
                          onChange={(e) => setObjective(e.target.value)}
                          placeholder="F = 3x + 2y"
                          aria-label="Biểu thức F"
                          className={`${fieldClass} min-w-0 flex-1`}
                        />
                        <button
                          type="submit"
                          className="rounded-xl border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950/40"
                        >
                          Tính
                        </button>
                      </form>
                      {objectiveError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{objectiveError}</p>}
                      {optimization && objectiveValue && (
                        <MathJax dynamic key={`opt-${committed?.version}-${linearTex(objectiveValue)}`}>
                          {optimization.table.length > 0 && (
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full text-[15px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                                    <th className="py-1.5 pr-3 font-medium">Đỉnh</th>
                                    <th className="py-1.5 font-medium">Giá trị F</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {optimization.table.map(({ vertex, value }) => {
                                    const isMax = optimization.max.value?.eq(value) && optimization.max.attained
                                    const isMin = optimization.min.value?.eq(value) && optimization.min.attained
                                    return (
                                      <tr key={vertex.name} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                        <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{`$${vertex.name}${ptTex(vertex)}$`}</td>
                                        <td className="py-1.5 text-slate-700 dark:text-slate-300">
                                          {`$${substituteTex(objectiveValue.a, objectiveValue.b, vertex, objectiveValue.k)}$`}
                                          {isMax && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">lớn nhất</span>}
                                          {isMin && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">nhỏ nhất</span>}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                            {optimizationLines(objectiveValue, system.region, optimization).map((line, i) => (
                              <p key={i}>
                                <RichText text={line} />
                              </p>
                            ))}
                          </div>
                        </MathJax>
                      )}
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </MathProvider>
  )
}

function LegendChip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-[var(--background-card)] px-3 py-1 dark:border-slate-700">
      {children}
    </li>
  )
}

