'use client'

import { useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, Lock, Sparkles } from 'lucide-react'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import ProbabilityTree, { type TreeFocus } from './ProbabilityTree'
import RichText from './RichText'
import { Frac } from '@/lib/tools/fraction'
import { formatPercent, parseProbability, solveBayes, trueFalseItems, type BayesSection } from '@/lib/tools/probability/bayes'
import { ALL_KEYS, KEY_GROUPS, LABEL_PLAIN, solveFromGivens, type Key } from '@/lib/tools/probability/givens'

/**
 * Công cụ xác suất có điều kiện và công thức Bayes (Toán 12, chương 6).
 *
 * Ba lớp, theo docs/STUDENT_TOOLS_ROADMAP.md mục 3.1:
 *  1. ĐOÁN TRƯỚC P(A | B) bằng thanh trượt — với bài xét nghiệm, đa số đoán gần
 *     99% trong khi đáp án là 50%. Cú sốc đó là lý do học sinh đọc lời giải.
 *  2. LUYỆN ĐÚNG/SAI — bốn mệnh đề kiểu Phần II của đề thi, mệnh đề sai dựng
 *     từ lỗi thật (nhầm P(A | B) với P(B | A), nhân như độc lập…).
 *  3. LỜI GIẢI TỪNG BƯỚC trên sơ đồ hình cây và bảng "trong N người".
 *
 * Chế độ Tự làm khoá lớp 3 (và các số ở lá cây) cho tới khi làm xong lớp 1–2.
 */

interface Preset {
  label: string
  eventA: string
  eventB: string
  /** Chỉ các ô đề cho; ô khác để trống (chờ). */
  given: Partial<Record<Key, string>>
  unit: string
}

const PRESETS: Preset[] = [
  {
    label: 'Xét nghiệm bệnh',
    eventA: 'Người được chọn mắc bệnh',
    eventB: 'Xét nghiệm cho kết quả dương tính',
    given: { A: '1%', 'B|A': '99%', 'B|nA': '1%' },
    unit: 'người',
  },
  {
    label: 'Hai dây chuyền',
    eventA: 'Sản phẩm do dây chuyền I làm ra',
    eventB: 'Sản phẩm bị lỗi',
    given: { A: '0,6', 'B|A': '0,02', 'B|nA': '0,05' },
    unit: 'sản phẩm',
  },
  {
    label: 'Cho P(A), P(B), P(A∩B)',
    eventA: 'Học sinh được chọn là nữ',
    eventB: 'Học sinh được chọn thích môn Toán',
    given: { A: '0,4', B: '0,35', AB: '0,15' },
    unit: 'học sinh',
  },
  {
    label: 'Hỏi ngược P(A)',
    eventA: 'Sản phẩm do dây chuyền I làm ra',
    eventB: 'Sản phẩm bị lỗi',
    given: { B: '0,032', 'B|A': '0,02', 'B|nA': '0,05' },
    unit: 'sản phẩm',
  },
]

const EMPTY_RAW = Object.fromEntries(ALL_KEYS.map((k) => [k, ''])) as Record<Key, string>
const rawOf = (p: Preset): Record<Key, string> => ({ ...EMPTY_RAW, ...p.given })

const FOCUS: Record<BayesSection['key'], TreeFocus> = {
  complement: 'level1',
  multiply: 'Bpaths',
  total: 'Bpaths',
  bayes: 'bayes',
  derive: 'none',
}

/** Giá trị suy ra hiện mờ trong ô trống: `= 0,375`, `≈ 0,4286`. */
function hint(f: Frac): string {
  const d = f.toDecimal(4)
  return `${d.exact ? '=' : '≈'} ${d.text}`
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export default function ConditionalProbabilityTool() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0])
  const [eventA, setEventA] = useState(PRESETS[0].eventA)
  const [eventB, setEventB] = useState(PRESETS[0].eventB)
  // Mọi đại lượng là một ô CHỜ: đề cho ô nào thì điền ô đó (yêu cầu chủ dự án 2026-09-15).
  const [raw, setRaw] = useState<Record<Key, string>>(() => rawOf(PRESETS[0]))
  const [mode, setMode] = useState<ToolMode>('guided')
  const [guess, setGuess] = useState(50)
  const [lockedGuess, setLockedGuess] = useState<number | null>(null)
  const [tf, setTf] = useState<Record<string, string>>({})
  const [sectionKey, setSectionKey] = useState<BayesSection['key']>('total')

  const parsed = Object.fromEntries(
    ALL_KEYS.filter((k) => raw[k].trim()).map((k) => [k, parseProbability(raw[k])]),
  ) as Partial<Record<Key, ReturnType<typeof parseProbability>>>
  const hasParseError = Object.values(parsed).some((r) => r && !r.ok)
  const given = Object.fromEntries(
    (Object.entries(parsed) as [Key, ReturnType<typeof parseProbability>][]).flatMap(([k, r]) => (r.ok ? [[k, r.value]] : [])),
  ) as Partial<Record<Key, Frac>>
  const outcome = hasParseError ? null : solveFromGivens(given)
  const solved = outcome?.status === 'ok' ? outcome : null
  const input = solved?.input ?? null
  const result = input ? solveBayes(input) : null
  const sections = solved?.sections ?? []
  const section = sections.find((s) => s.key === sectionKey) ?? sections[0]
  const items = input && result ? trueFalseItems(input, result) : []
  // Giá trị hiện mờ trong các ô trống.
  const derived: Partial<Record<Key, Frac | null>> =
    solved?.values ?? (outcome?.status === 'under' ? outcome.known : {})
  const givenCount = Object.keys(parsed).length

  // Mọi câu trả lời gắn với bộ số hiện tại: đổi số là làm lại từ đầu.
  const dataKey = ALL_KEYS.map((k) => raw[k].trim()).join('|')
  const tfKey = (k: string) => `${dataKey}#${k}`
  const selfMode = mode === 'self'
  const tfDone = items.length > 0 && items.every((it) => tfKey(it.key) in tf)
  const guessDone = lockedGuess !== null
  const unlocked = !selfMode || (guessDone && tfDone)

  function reset() {
    setLockedGuess(null)
    setTf({})
  }

  function applyPreset(p: Preset) {
    setPreset(p)
    setEventA(p.eventA)
    setEventB(p.eventB)
    setRaw(rawOf(p))
    setSectionKey('total')
    reset()
  }

  function clearAll() {
    setPreset({ label: '', eventA: '', eventB: '', given: {}, unit: 'trường hợp' })
    setEventA('')
    setEventB('')
    setRaw(EMPTY_RAW)
    reset()
  }

  function setField(k: Key, v: string) {
    setRaw((r) => ({ ...r, [k]: v }))
    reset()
  }

  const actualPct = result?.pAgivenB ? result.pAgivenB.toNumber() * 100 : null

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Bài mẫu:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={preset.label === p.label}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300"
            >
              {p.label}
            </button>
          ))}
        </div>
        <ModeToggle
          mode={mode}
          onChange={(m) => {
            setMode(m)
            reset()
          }}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start [&>*]:min-w-0">
        {/* ── Dữ kiện ── */}
        <section aria-labelledby="cp-input" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
          <h2 id="cp-input" className="mb-3 text-base font-semibold text-slate-800 dark:text-white">
            Dữ kiện
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Biến cố <em className="font-serif">A</em>
              <input value={eventA} onChange={(e) => setEventA(e.target.value)} className={`${fieldClass} mt-1`} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">
              Biến cố <em className="font-serif">B</em>
              <input value={eventB} onChange={(e) => setEventB(e.target.value)} className={`${fieldClass} mt-1`} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Đề cho xác suất nào thì điền ô đó, <strong>còn lại để trống</strong>.
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
            >
              Xoá hết, nhập đề mới
            </button>
          </div>

          <div className="mt-2 space-y-3">
            {KEY_GROUPS.map((group) => (
              <fieldset key={group.title}>
                <legend className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{group.title}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {group.keys.map((k) => {
                    const r = parsed[k]
                    const filled = Boolean(raw[k].trim())
                    const d = derived[k]
                    const placeholder = selfMode || !d ? 'chờ' : hint(d)
                    const errId = `cp-err-${k.replace('|', '-')}`
                    return (
                      <label key={k} className="min-w-0 text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span className="font-serif text-sm italic">{LABEL_PLAIN[k]}</span>
                        <input
                          value={raw[k]}
                          onChange={(e) => setField(k, e.target.value)}
                          placeholder={placeholder}
                          inputMode="decimal"
                          aria-invalid={r ? !r.ok : undefined}
                          aria-describedby={r && !r.ok ? errId : undefined}
                          className={`${fieldClass} mt-0.5 px-2 py-1.5 font-mono text-sm placeholder:italic placeholder:text-slate-400 ${
                            filled ? 'border-teal-500 bg-teal-50/60 dark:border-teal-500 dark:bg-teal-950/30' : ''
                          }`}
                        />
                        {r && !r.ok && (
                          <span id={errId} className="mt-0.5 flex items-start gap-1 font-normal text-rose-600 dark:text-rose-400">
                            <AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                            {r.error}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <GivenStatus outcome={outcome} count={givenCount} hasParseError={hasParseError} />

          {solved && raw.A.trim() && parsed.A?.ok && (
            <label className="mt-4 block text-sm text-slate-600 dark:text-slate-300">
              Kéo để đổi <span className="font-serif italic">P(A)</span>:{' '}
              <strong className="tabular-nums text-slate-800 dark:text-slate-100">{formatPercent(parsed.A.value)}</strong>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={Math.min(100, parsed.A.value.toNumber() * 100)}
                onChange={(e) => setField('A', `${e.target.value.replace('.', ',')}%`)}
                className="mt-2 w-full accent-teal-600"
              />
            </label>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Nhập 0,02 hoặc 2% hoặc 1/50 đều được.{!selfMode && ' Ô trống hiện mờ giá trị suy ra được.'}
          </p>
        </section>

        {/* ── Sơ đồ hình cây + bảng tần số tự nhiên ── */}
        <section
          aria-label="Sơ đồ hình cây"
          className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1"
        >
          {input && result ? (
            <>
              <ProbabilityTree input={input} result={result} focus={unlocked && section ? FOCUS[section.key] : 'none'} showLeaves={unlocked} />
              <dl className="mt-2 space-y-1 px-1 text-sm text-slate-600 dark:text-slate-300">
                <div>
                  <dt className="inline font-serif font-semibold italic">A</dt>: <dd className="inline">{eventA || '—'}</dd>
                </div>
                <div>
                  <dt className="inline font-serif font-semibold italic">B</dt>: <dd className="inline">{eventB || '—'}</dd>
                </div>
              </dl>

              {unlocked ? (
                <div className="mt-4 overflow-x-auto">
                  <p className="mb-2 px-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Hình dung với {result.population.size.toLocaleString('vi-VN')} {preset.unit}
                    {result.population.exact ? '' : ' (đã làm tròn)'}:
                  </p>
                  <table className="w-full text-center text-sm tabular-nums">
                    <thead>
                      <tr className="text-xs text-slate-500 dark:text-slate-400">
                        <th />
                        <th className="pb-1 font-serif font-semibold italic">B</th>
                        <th className="pb-1 font-serif font-semibold italic">B̄</th>
                        <th className="pb-1 font-medium">Tổng</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700 dark:text-slate-200">
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <th className="py-1.5 font-serif italic">A</th>
                        <td className="bg-amber-50 font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{result.population.AB}</td>
                        <td>{result.population.AnotB}</td>
                        <td>{result.population.AB + result.population.AnotB}</td>
                      </tr>
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <th className="py-1.5 font-serif italic">Ā</th>
                        <td className="bg-amber-50/50 dark:bg-amber-950/20">{result.population.notAB}</td>
                        <td>{result.population.notAnotB}</td>
                        <td>{result.population.notAB + result.population.notAnotB}</td>
                      </tr>
                      <tr className="border-t border-slate-300 font-semibold dark:border-slate-600">
                        <th className="py-1.5 text-xs font-medium">Tổng</th>
                        <td>{result.population.AB + result.population.notAB}</td>
                        <td>{result.population.AnotB + result.population.notAnotB}</td>
                        <td>{result.population.size}</td>
                      </tr>
                    </tbody>
                  </table>
                  {result.pAgivenB && (
                    <p className="mt-2 px-1 text-sm text-slate-600 dark:text-slate-300">
                      Trong <strong>{result.population.AB + result.population.notAB}</strong> {preset.unit} có <em className="font-serif">B</em>, chỉ{' '}
                      <strong>{result.population.AB}</strong> có <em className="font-serif">A</em> — đó chính là{' '}
                      <span className="font-serif italic">P(A | B)</span> ≈ {formatPercent(result.pAgivenB)}.
                    </p>
                  )}
                </div>
              ) : (
                <LockedNote />
              )}
            </>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Điền đủ dữ kiện của đề để dựng sơ đồ hình cây.</p>
          )}
        </section>

        {/* ── Đoán trước + đúng/sai ── */}
        {input && result && (
          <div className="space-y-5 lg:col-start-2 lg:row-start-2">
            {result.pAgivenB && actualPct !== null && (
              <section aria-labelledby="cp-guess" className="bento-tile p-4 sm:p-5">
                <h2 id="cp-guess" className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-white">
                  <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  Đoán trước khi tính
                </h2>
                <p className="mt-1 text-[15px] text-slate-700 dark:text-slate-300">
                  Biết <em>{eventB.toLowerCase() || 'B xảy ra'}</em>. Khả năng <em>{eventA.toLowerCase() || 'A xảy ra'}</em> là bao nhiêu?
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={guess}
                    disabled={guessDone}
                    onChange={(e) => setGuess(Number(e.target.value))}
                    aria-label="Dự đoán P(A | B), phần trăm"
                    className="w-full accent-amber-500"
                  />
                  <span className="w-12 text-right text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{guess}%</span>
                </div>
                {guessDone ? (
                  <GuessResult guess={lockedGuess!} actual={actualPct} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLockedGuess(guess)}
                    className="btn-action mt-3 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
                  >
                    Chốt dự đoán
                  </button>
                )}
              </section>
            )}

            <section aria-labelledby="cp-tf" className="bento-tile p-4 sm:p-5">
              <h2 id="cp-tf" className="text-base font-semibold text-slate-800 dark:text-white">
                Luyện câu đúng/sai (Phần II của đề)
              </h2>
              <MathJax dynamic key={`tf-${dataKey}-${mode}-${Object.keys(tf).length}`}>
                <ol className="mt-3 space-y-3">
                  {items.map((it, i) => (
                    <li key={it.key}>
                      <PredictChoice
                        kicker={`Mệnh đề ${'abcd'[i]})`}
                        question={it.statement}
                        options={[
                          { id: 'true', label: 'Đúng' },
                          { id: 'false', label: 'Sai' },
                        ]}
                        correct={it.correct ? 'true' : 'false'}
                        chosen={tf[tfKey(it.key)] ?? null}
                        explain={it.explain}
                        onChoose={(id) => setTf((t) => (tfKey(it.key) in t ? t : { ...t, [tfKey(it.key)]: id }))}
                      />
                    </li>
                  ))}
                </ol>
              </MathJax>
              {tfDone && (
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Đúng{' '}
                  <strong className="tabular-nums">
                    {items.filter((it) => tf[tfKey(it.key)] === (it.correct ? 'true' : 'false')).length}/{items.length}
                  </strong>{' '}
                  mệnh đề.
                </p>
              )}
            </section>
          </div>
        )}

        {/* ── Lời giải ── */}
        {input && result && section && (
          <section aria-labelledby="cp-steps" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-3">
            <h2 id="cp-steps" className="mb-3 text-base font-semibold text-slate-800 dark:text-white">
              Lời giải từng bước
            </h2>
            {unlocked ? (
              <>
                <div className="scrollbar-hide -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Chọn bước">
                  {sections.map((s, i) => (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={s.key === section.key}
                      onClick={() => setSectionKey(s.key)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        s.key === section.key
                          ? 'bg-teal-600 text-white dark:bg-teal-500'
                          : 'bg-slate-100 text-slate-600 hover:text-teal-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {i + 1}. {s.short}
                    </button>
                  ))}
                </div>
                <div aria-live="polite">
                  <MathJax dynamic key={`sec-${dataKey}-${section.key}`}>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{section.title}</h3>
                    <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {section.lines.map((line, i) => (
                        <p key={i}>
                          <RichText text={line} />
                        </p>
                      ))}
                    </div>
                  </MathJax>
                </div>
              </>
            ) : (
              <LockedNote detail={`${guessDone ? '✓' : '○'} Chốt dự đoán · ${tfDone ? '✓' : '○'} Trả lời 4 mệnh đề đúng/sai`} />
            )}
          </section>
        )}
      </div>
    </>
  )
}

function GivenStatus({
  outcome,
  count,
  hasParseError,
}: {
  outcome: ReturnType<typeof solveFromGivens> | null
  count: number
  hasParseError: boolean
}) {
  let tone = 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'
  let text: string
  if (hasParseError || !outcome) {
    tone = 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
    text = 'Có ô nhập chưa đúng dạng số — sửa ô báo đỏ.'
  } else if (outcome.status === 'empty') {
    text = 'Chưa có dữ kiện. Đọc đề, điền từng xác suất đề cho vào đúng ô.'
  } else if (outcome.status === 'under') {
    tone = 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
    text = `Đã điền ${count} ô — **cần thêm ${outcome.missing} dữ kiện** nữa (không suy ra được từ các ô đã có) mới dựng được cây.`
  } else if (outcome.status === 'contradiction' || outcome.status === 'degenerate') {
    tone = 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
    text = outcome.reason
  } else {
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
    text = `✓ Đủ dữ kiện (${count} ô). Mọi xác suất còn lại đã xác định.`
  }
  return (
    <div role="status" className={`mt-3 rounded-xl border px-3 py-2 text-sm ${tone}`}>
      <MathJax dynamic key={text}>
        <RichText text={text} />
      </MathJax>
    </div>
  )
}

function LockedNote({ detail }: { detail?: string }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span>
        Chế độ Tự làm: lời giải và các số ở lá cây mở ra sau khi em đoán và trả lời xong phần đúng/sai.
        {detail && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{detail}</span>}
      </span>
    </p>
  )
}

function GuessResult({ guess, actual }: { guess: number; actual: number }) {
  const diff = Math.abs(guess - actual)
  const actualText = `${Frac.of(Math.round(actual * 10), 10).toDecimal(1).text}%`
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      {/* Hai vạch trên cùng một thang: đoán và thực tế. */}
      <div className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
        <span className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded bg-amber-500" style={{ left: `calc(${guess}% - 2px)` }} />
        <span className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded bg-teal-600" style={{ left: `calc(${Math.min(100, actual)}% - 2px)` }} />
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        Em đoán <strong className="text-amber-700 dark:text-amber-400">{guess}%</strong>, thực tế{' '}
        <strong className="text-teal-700 dark:text-teal-300">{actualText}</strong>.{' '}
        {diff <= 5
          ? 'Rất sát — trực giác xác suất tốt!'
          : diff <= 20
            ? 'Khá gần. Xem lời giải để thấy phần chênh đến từ đâu.'
            : 'Lệch khá xa — đây đúng là chỗ công thức Bayes làm trực giác bất ngờ. Nhìn bảng tần số bên cạnh để thấy vì sao.'}
      </p>
    </div>
  )
}
