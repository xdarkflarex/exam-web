'use client'

import { useState } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, Lock, Sparkles } from 'lucide-react'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import ProbabilityTree, { type TreeFocus } from './ProbabilityTree'
import RichText from './RichText'
import { Frac } from '@/lib/tools/fraction'
import {
  bayesSections,
  formatPercent,
  parseProbability,
  solveBayes,
  trueFalseItems,
  type BayesInput,
  type BayesSection,
} from '@/lib/tools/probability/bayes'

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
  pA: string
  pBgivenA: string
  pBgivenNotA: string
  unit: string
}

const PRESETS: Preset[] = [
  {
    label: 'Xét nghiệm bệnh',
    eventA: 'Người được chọn mắc bệnh',
    eventB: 'Xét nghiệm cho kết quả dương tính',
    pA: '1%',
    pBgivenA: '99%',
    pBgivenNotA: '1%',
    unit: 'người',
  },
  {
    label: 'Hai dây chuyền',
    eventA: 'Sản phẩm do dây chuyền I làm ra',
    eventB: 'Sản phẩm bị lỗi',
    pA: '0,6',
    pBgivenA: '0,02',
    pBgivenNotA: '0,05',
    unit: 'sản phẩm',
  },
  {
    label: 'Lọc thư rác',
    eventA: 'Thư là thư rác',
    eventB: 'Thư có chữ “khuyến mãi”',
    pA: '0,3',
    pBgivenA: '0,6',
    pBgivenNotA: '0,05',
    unit: 'thư',
  },
]

const FOCUS: Record<BayesSection['key'], TreeFocus> = {
  complement: 'level1',
  multiply: 'Bpaths',
  total: 'Bpaths',
  bayes: 'bayes',
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export default function ConditionalProbabilityTool() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0])
  const [eventA, setEventA] = useState(PRESETS[0].eventA)
  const [eventB, setEventB] = useState(PRESETS[0].eventB)
  const [raw, setRaw] = useState({ pA: PRESETS[0].pA, pBgivenA: PRESETS[0].pBgivenA, pBgivenNotA: PRESETS[0].pBgivenNotA })
  const [mode, setMode] = useState<ToolMode>('guided')
  const [guess, setGuess] = useState(50)
  const [lockedGuess, setLockedGuess] = useState<number | null>(null)
  const [tf, setTf] = useState<Record<string, string>>({})
  const [sectionKey, setSectionKey] = useState<BayesSection['key']>('total')

  const parsed = {
    pA: parseProbability(raw.pA),
    pBgivenA: parseProbability(raw.pBgivenA),
    pBgivenNotA: parseProbability(raw.pBgivenNotA),
  }
  const input: BayesInput | null =
    parsed.pA.ok && parsed.pBgivenA.ok && parsed.pBgivenNotA.ok
      ? { pA: parsed.pA.value, pBgivenA: parsed.pBgivenA.value, pBgivenNotA: parsed.pBgivenNotA.value }
      : null
  const result = input ? solveBayes(input) : null
  const sections = input && result ? bayesSections(input, result) : []
  const section = sections.find((s) => s.key === sectionKey) ?? sections[0]
  const items = input && result ? trueFalseItems(input, result) : []

  // Mọi câu trả lời gắn với bộ số hiện tại: đổi số là làm lại từ đầu.
  const dataKey = `${raw.pA}|${raw.pBgivenA}|${raw.pBgivenNotA}`
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
    setRaw({ pA: p.pA, pBgivenA: p.pBgivenA, pBgivenNotA: p.pBgivenNotA })
    setSectionKey('total')
    reset()
  }

  function setField(k: keyof typeof raw, v: string) {
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
              aria-pressed={preset.label === p.label && raw.pA === p.pA}
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

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(
              [
                ['pA', 'P(A)'],
                ['pBgivenA', 'P(B | A)'],
                ['pBgivenNotA', 'P(B | Ā)'],
              ] as const
            ).map(([k, label]) => {
              const r = parsed[k]
              return (
                <label key={k} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span className="font-serif italic">{label}</span>
                  <input
                    value={raw[k]}
                    onChange={(e) => setField(k, e.target.value)}
                    inputMode="decimal"
                    aria-invalid={!r.ok}
                    className={`${fieldClass} mt-1 font-mono`}
                  />
                  {!r.ok && (
                    <span className="mt-1 flex items-start gap-1 text-xs font-normal text-rose-600 dark:text-rose-400">
                      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {r.error}
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          {input && (
            <label className="mt-4 block text-sm text-slate-600 dark:text-slate-300">
              Kéo để đổi <span className="font-serif italic">P(A)</span>:{' '}
              <strong className="tabular-nums text-slate-800 dark:text-slate-100">{formatPercent(input.pA)}</strong>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={Math.min(100, input.pA.toNumber() * 100)}
                onChange={(e) => setField('pA', `${e.target.value.replace('.', ',')}%`)}
                className="mt-2 w-full accent-teal-600"
              />
            </label>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nhập 0,02 hoặc 2% hoặc 1/50 đều được.</p>
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
            <p className="p-6 text-center text-sm text-slate-500">Nhập đủ ba xác suất hợp lệ để dựng sơ đồ.</p>
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
                      {i + 1}. {['Biến cố đối', 'Công thức nhân', 'Toàn phần', 'Bayes'][i]}
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
