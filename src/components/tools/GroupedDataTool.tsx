'use client'

import { useState, type ClipboardEvent } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, Minus, Plus, Trash2 } from 'lucide-react'
import Histogram from './Histogram'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import RichText from './RichText'
import {
  computeGrouped,
  groupedSections,
  intervalTex,
  parsePastedTable,
  validateGroups,
  type RawRow,
  type StatSection,
} from '@/lib/tools/statistics/grouped'

/**
 * Công cụ mẫu số liệu ghép nhóm (Toán 11 + 12).
 *
 * Tính lại NGAY khi sửa bảng: bấm +/− một tần số là thấy số trung bình, trung
 * vị và vạch trên biểu đồ dịch theo (nguyên tắc N3 — thao tác trực tiếp).
 *
 * Chế độ Tự làm hỏi "nhóm nào chứa trung vị / Q₁ / Q₃ / mốt" TRƯỚC khi hiện công
 * thức: chọn nhầm nhóm là lỗi hay gặp nhất của dạng này, và công thức nội suy
 * chỉ có nghĩa khi đã chọn đúng nhóm.
 */

interface Row extends RawRow {
  id: number
}

let nextId = 1
const withIds = (rows: RawRow[]): Row[] => rows.map((r) => ({ ...r, id: nextId++ }))

function evenTable(start: number, width: number, freqs: number[]): RawRow[] {
  return freqs.map((f, i) => ({ lo: String(start + i * width), hi: String(start + (i + 1) * width), freq: String(f) }))
}

const EXAMPLES: { label: string; hint: string; rows: RawRow[] }[] = [
  { label: 'Thời gian đến trường', hint: 'SGK Toán 11', rows: evenTable(15, 5, [7, 12, 5, 7, 3, 5, 1]) },
  { label: 'Cân nặng học sinh', hint: 'SGK Toán 11', rows: evenTable(40, 5, [7, 10, 20, 6, 2]) },
  { label: 'Chiều cao cây', hint: 'SGK Toán 12', rows: evenTable(30, 10, [4, 10, 14, 6, 4, 2]) },
]

type SectionKey = StatSection['key']

const LOCATE_NAMES: Partial<Record<SectionKey, string>> = {
  median: 'trung vị $M_e$',
  q1: 'tứ phân vị thứ nhất $Q_1$',
  q3: 'tứ phân vị thứ ba $Q_3$',
  mode: 'mốt $M_o$',
}

const TAB_LABEL: Record<SectionKey, string> = {
  mean: 'Trung bình',
  median: 'Trung vị',
  q1: 'Q₁',
  q3: 'Q₃',
  mode: 'Mốt',
  spread: 'Khoảng biến thiên',
  variance: 'Phương sai',
}

const cellClass =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export default function GroupedDataTool() {
  const [rows, setRows] = useState<Row[]>(() => withIds(EXAMPLES[0].rows))
  const [active, setActive] = useState<SectionKey>('median')
  const [mode, setMode] = useState<ToolMode>('guided')
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [gen, setGen] = useState({ start: '0', width: '10', count: '5' })

  const validation = validateGroups(rows)
  const dataKey = rows.map((r) => `${r.lo}|${r.hi}|${r.freq}`).join(';')
  // Bảng tối đa 20 nhóm: tính lại mỗi lần render rẻ hơn công giữ memo đúng.
  const stats = validation.ok ? computeGrouped(validation.rows) : null
  const sections = stats ? groupedSections(stats) : []
  const section = sections.find((s) => s.key === active) ?? sections[0]

  // Đáp án gắn với BẢNG SỐ LIỆU: sửa bảng là câu hỏi đổi, câu trả lời cũ bỏ.
  const answerKey = (key: SectionKey) => `${dataKey}#${key}`
  const selfMode = mode === 'self'
  // Mẫu có nhiều nhóm cùng tần số lớn nhất thì câu "nhóm nào chứa mốt" có nhiều đáp án — không hỏi.
  const locateName =
    section && !(section.key === 'mode' && stats?.modes.length !== 1) ? LOCATE_NAMES[section.key] : undefined
  const correctGroup = section && stats ? (section.key === 'mode' ? stats.modes[0]?.index : section.groups[0]) : undefined
  const pending = Boolean(selfMode && section && locateName && !(answerKey(section.key) in answers))

  function setRow(id: number, field: keyof RawRow, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function bump(id: number, delta: number) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r
        const v = Math.max(0, (Number.parseInt(r.freq, 10) || 0) + delta)
        return { ...r, freq: String(v) }
      }),
    )
  }

  function addRow() {
    setRows((rs) => {
      const last = rs[rs.length - 1]
      if (!last) return withIds([{ lo: '0', hi: '10', freq: '0' }])
      const lo = Number.parseFloat(last.lo.replace(',', '.'))
      const hi = Number.parseFloat(last.hi.replace(',', '.'))
      const w = Number.isFinite(lo) && Number.isFinite(hi) ? hi - lo : 1
      return [...rs, ...withIds([{ lo: last.hi, hi: String(Number.isFinite(hi) ? hi + w : ''), freq: '0' }])]
    })
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const parsed = parsePastedTable(e.clipboardData.getData('text'))
    if (!parsed) return
    e.preventDefault()
    setRows(withIds(parsed))
    setAnswers({})
  }

  function generate() {
    const start = Number.parseFloat(gen.start.replace(',', '.'))
    const width = Number.parseFloat(gen.width.replace(',', '.'))
    const count = Number.parseInt(gen.count, 10)
    if (!Number.isFinite(start) || !(width > 0) || !(count >= 1 && count <= 20)) return
    setRows(withIds(evenTable(start, width, Array.from({ length: count }, () => 0))))
    setAnswers({})
  }

  const markerShown = section && !pending ? section.marker : null
  const highlightShown = section && !pending ? section.groups : []

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ví dụ:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setRows(withIds(ex.rows))
                setAnswers({})
              }}
              title={ex.hint}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300"
            >
              {ex.label}
            </button>
          ))}
        </div>
        <ModeToggle mode={mode} onChange={(m) => { setMode(m); setAnswers({}) }} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start [&>*]:min-w-0">
        {/* ── Biểu đồ + tóm tắt ── */}
        <section aria-label="Biểu đồ tần số" className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20">
          {stats && section ? (
            <>
              <Histogram
                rows={stats.rows}
                highlight={highlightShown}
                marker={markerShown}
                title={`Biểu đồ tần số, ${stats.rows.length} nhóm, cỡ mẫu ${stats.n}`}
              />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                {(
                  [
                    ['n', String(stats.n), null],
                    ['x̄', stats.mean.toDecimal(2), 'mean'],
                    ['Me', stats.median.value.toDecimal(2), 'median'],
                    ['Q₁', stats.q1.value.toDecimal(2), 'q1'],
                    ['Q₃', stats.q3.value.toDecimal(2), 'q3'],
                  ] as const
                ).map(([label, v, key]) => {
                  // Tự làm: số của phần chưa làm được che lại, kẻo tóm tắt lộ đáp án.
                  const hidden = selfMode && key && LOCATE_NAMES[key] && !(answerKey(key) in answers)
                  const text = typeof v === 'string' ? v : `${v.exact ? '' : '≈ '}${v.text}`
                  return (
                    <div key={label} className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                      <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{hidden ? '?' : text}</dd>
                    </div>
                  )
                })}
              </dl>
            </>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Nhập bảng số liệu hợp lệ để vẽ biểu đồ.
            </div>
          )}
        </section>

        <div className="space-y-5">
          {/* ── Bảng số liệu ── */}
          <section aria-labelledby="gd-table" className="bento-tile p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="gd-table" className="text-base font-semibold text-slate-800 dark:text-white">
                Bảng số liệu ghép nhóm
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">dán được bảng từ đề vào ô bất kỳ</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-400">
                    <th className="pb-1 text-left font-medium">Nhóm</th>
                    <th className="pb-1 font-medium">Từ</th>
                    <th className="pb-1 font-medium">Đến</th>
                    <th className="pb-1 font-medium">Tần số</th>
                    <th className="pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={validation.ok || validation.row !== i ? '' : 'bg-rose-50 dark:bg-rose-950/30'}>
                      <td className="py-1 pr-2 text-xs font-semibold text-slate-400">{i + 1}</td>
                      <td className="px-1 py-1">
                        <input aria-label={`Nhóm ${i + 1}: đầu mút trái`} value={r.lo} onChange={(e) => setRow(r.id, 'lo', e.target.value)} onPaste={onPaste} inputMode="decimal" className={cellClass} />
                      </td>
                      <td className="px-1 py-1">
                        <input aria-label={`Nhóm ${i + 1}: đầu mút phải`} value={r.hi} onChange={(e) => setRow(r.id, 'hi', e.target.value)} onPaste={onPaste} inputMode="decimal" className={cellClass} />
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => bump(r.id, -1)} aria-label={`Giảm tần số nhóm ${i + 1}`} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <input aria-label={`Nhóm ${i + 1}: tần số`} value={r.freq} onChange={(e) => setRow(r.id, 'freq', e.target.value)} onPaste={onPaste} inputMode="numeric" className={`${cellClass} w-14`} />
                          <button type="button" onClick={() => bump(r.id, 1)} aria-label={`Tăng tần số nhóm ${i + 1}`} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                      <td className="py-1 pl-1">
                        <button
                          type="button"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
                          aria-label={`Xoá nhóm ${i + 1}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!validation.ok && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400" role="alert">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {validation.error}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= 20}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Thêm nhóm
              </button>
              <details className="text-sm">
                <summary className="cursor-pointer rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  Tạo các nhóm đều nhau
                </summary>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {(
                    [
                      ['start', 'Bắt đầu'],
                      ['width', 'Độ dài nhóm'],
                      ['count', 'Số nhóm'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="text-xs text-slate-600 dark:text-slate-300">
                      {label}
                      <input value={gen[k]} onChange={(e) => setGen((g) => ({ ...g, [k]: e.target.value }))} inputMode="decimal" className={`${cellClass} mt-1 block w-20`} />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={generate}
                    className="rounded-xl border border-teal-600 px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-300 dark:hover:bg-teal-950/40"
                  >
                    Tạo
                  </button>
                </div>
              </details>
            </div>
          </section>

          {/* ── Lời giải từng đại lượng ── */}
          {stats && section && (
            <section aria-labelledby="gd-steps" className="bento-tile p-4 sm:p-5">
              <h2 id="gd-steps" className="mb-3 text-base font-semibold text-slate-800 dark:text-white">
                Tính từng đại lượng
              </h2>
              <div className="scrollbar-hide -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Chọn đại lượng">
                {sections.map((s) => {
                  const done = selfMode && LOCATE_NAMES[s.key] && answerKey(s.key) in answers
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={s.key === section.key}
                      onClick={() => setActive(s.key)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        s.key === section.key
                          ? 'bg-teal-600 text-white dark:bg-teal-500'
                          : 'bg-slate-100 text-slate-600 hover:text-teal-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {TAB_LABEL[s.key]}
                      {done ? ' ✓' : ''}
                    </button>
                  )
                })}
              </div>

              <div aria-live="polite">
                <MathJax dynamic key={`${dataKey}-${mode}-${section.key}-${answers[answerKey(section.key)] ?? ''}`}>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{section.title}</h3>
                  {selfMode && locateName && correctGroup !== undefined && (
                    <div className="mt-3">
                      <PredictChoice
                        kicker="Em tự làm"
                        question={`Nhóm nào chứa ${locateName}?`}
                        options={stats.rows.map((r, i) => ({ id: String(i), label: `$${intervalTex(r.lo, r.hi)}$` }))}
                        correct={String(correctGroup)}
                        chosen={answerKey(section.key) in answers ? String(answers[answerKey(section.key)]) : null}
                        explain={
                          section.key === 'mode'
                            ? 'Nhóm chứa mốt là nhóm có tần số lớn nhất.'
                            : 'Tìm nhóm đầu tiên có tần số tích luỹ lớn hơn hoặc bằng vị trí cần tìm.'
                        }
                        onChoose={(id) =>
                          setAnswers((a) => (answerKey(section.key) in a ? a : { ...a, [answerKey(section.key)]: Number(id) }))
                        }
                      />
                    </div>
                  )}
                  {!pending && (
                    <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {section.lines.map((line, i) => (
                        <p key={i}>
                          <RichText text={line} />
                        </p>
                      ))}
                    </div>
                  )}
                </MathJax>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

