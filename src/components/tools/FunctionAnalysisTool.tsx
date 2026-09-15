'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, SkipForward } from 'lucide-react'
import FunctionPlot from './FunctionPlot'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import RichText from './RichText'
import VariationTable from './VariationTable'
import { Frac } from '@/lib/tools/fraction'
import { analyze, UnsupportedError, type Analysis } from '@/lib/tools/function-analysis/analyze'
import {
  classify,
  coefOf,
  coefSlots,
  functionInput,
  functionTex,
  KIND_LABEL,
  KIND_TEMPLATE_TEX,
  parseFunction,
  withCoef,
  type FunctionKind,
  type Rat,
} from '@/lib/tools/function-analysis/parse'
import { buildSteps, type FnPrediction, type FnStep } from '@/lib/tools/function-analysis/steps'

/**
 * Công cụ khảo sát hàm số (Toán 12, chương 1): nhập hàm → đi từng bước theo sơ đồ
 * SGK → bảng biến thiên và đồ thị lập dần theo lời giải.
 *
 * Móc thu hút (nguyên tắc N3): nút +/− từng hệ số — bảng biến thiên và đồ thị đổi
 * cùng lúc, thấy hai cực trị nhập làm một rồi biến mất khi Δ của y′ đổi dấu.
 *
 * Chế độ Tự làm hỏi trước ở bốn chỗ học sinh hay sai: số nghiệm y′ = 0, dấu y′ trên
 * từng khoảng, điểm cực trị, giới hạn tại +∞. Đường cong chỉ hiện ở bước cuối.
 */

const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Bậc ba', text: 'x^3 - 3x^2 + 2' },
  { label: 'Cực trị có căn', text: 'x^3 - 3x^2 - 3x + 1' },
  { label: 'Không có cực trị', text: '-x^3 + 3x^2 - 3x + 2' },
  { label: 'Trùng phương', text: '-x^4 + 2x^2 + 3' },
  { label: 'Phân thức bậc nhất', text: '(2x - 1)/(x + 1)' },
  { label: 'Bậc hai trên bậc nhất', text: '(x^2 - x + 1)/(x - 1)' },
]

type Outcome = { ok: true; analysis: Analysis; steps: FnStep[]; key: string } | { ok: false; error: string }

function run(text: string): Outcome {
  const parsed = parseFunction(text)
  if (!parsed.ok) return parsed
  try {
    const analysis = analyze(parsed.fn)
    return { ok: true, analysis, steps: buildSteps(analysis), key: functionTex(parsed.fn) }
  } catch (e) {
    if (e instanceof UnsupportedError) {
      return { ok: false, error: 'Không giải chính xác được y′ = 0 cho hàm này (cần nghiệm dạng căn bậc hai). Thử hàm bậc ba hoặc trùng phương.' }
    }
    throw e
  }
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

export default function FunctionAnalysisTool() {
  const [text, setText] = useState(EXAMPLES[0].text)
  // Dạng + hệ số cho các nút +/−. Giữ riêng với ô nhập: bấm tới c = 0 thì hàm hết là
  // phân thức (báo lỗi) nhưng các nút vẫn còn để bấm ngược lại.
  const [template, setTemplate] = useState<{ kind: FunctionKind; rat: Rat } | null>(() => {
    const p = parseFunction(EXAMPLES[0].text)
    return p.ok ? { kind: p.fn.kind, rat: p.fn } : null
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [mode, setMode] = useState<ToolMode>('guided')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const outcome = useMemo(() => run(text), [text])
  // Giữ kết quả hợp lệ gần nhất để hình không nháy trắng khi đang gõ dở.
  const [lastGood, setLastGood] = useState<Extract<Outcome, { ok: true }> | null>(null)
  if (outcome.ok && outcome.key !== lastGood?.key) setLastGood(outcome)
  const shown = outcome.ok ? outcome : lastGood

  const selfMode = mode === 'self'
  const answerKey = (s: FnStep, p: FnPrediction) => `${shown?.key}#${s.key}:${p.id}`
  const unanswered = (s: FnStep) => s.predicts.filter((p) => !(answerKey(s, p) in answers))
  const steps = shown?.steps ?? []
  const firstPending = selfMode ? steps.findIndex((s) => unanswered(s).length > 0) : -1
  const reachable = (i: number) => firstPending === -1 || i <= firstPending
  const lastIndex = Math.max(0, steps.length - 1)
  // Sửa hàm trong chế độ Tự làm là câu hỏi mới: không cho đứng ở bước chưa tới được.
  const index = Math.min(stepIndex, lastIndex, firstPending === -1 ? lastIndex : firstPending)
  const step = steps[index]
  const pending = Boolean(selfMode && step && unanswered(step).length > 0)

  const signStep = steps.find((s) => s.key === 'sign')
  const hiddenSigns = new Set<number>(
    selfMode && signStep ? unanswered(signStep).map((p) => p.interval ?? -1) : [],
  )
  // Bước xét dấu lộ từng khoảng theo câu đã trả lời; các bước khác chờ trả lời xong mới lộ.
  const stage = step ? (pending && step.key !== 'sign' ? (step.preStage ?? step.stage) : step.stage) : null

  const predictAll = steps.flatMap((s) => s.predicts.map((p) => ({ s, p })))
  const predictRight = predictAll.filter(({ s, p }) => answers[answerKey(s, p)] === p.correct).length

  function load(next: string) {
    setText(next)
    const p = parseFunction(next)
    if (p.ok) setTemplate({ kind: p.fn.kind, rat: p.fn })
    setStepIndex(0)
  }

  function onType(next: string) {
    setText(next)
    const p = parseFunction(next)
    if (p.ok) setTemplate({ kind: p.fn.kind, rat: p.fn })
  }

  function bump(slotIndex: number, delta: number) {
    if (!template) return
    const slot = coefSlots(template.kind)[slotIndex]
    const rat = withCoef(template.rat, slot, coefOf(template.rat, slot).add(Frac.of(delta)))
    setTemplate({ kind: template.kind, rat })
    setText(functionInput(rat))
  }

  function go(i: number) {
    const target = Math.max(0, Math.min(lastIndex, i))
    if (reachable(target)) setStepIndex(target)
  }

  function onStepsKey(e: KeyboardEvent<HTMLElement>) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (!pending) go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  const slots = template ? coefSlots(template.kind) : []
  const templateValid = template ? classify(template.rat).ok : false

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ví dụ:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => load(ex.text)}
              aria-pressed={text === ex.text}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                text === ex.text
                  ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                  : 'border-slate-300 text-slate-600 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300'
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>
        <ModeToggle
          mode={mode}
          onChange={(m) => {
            setMode(m)
            setAnswers({})
            setStepIndex(0)
          }}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start [&>*]:min-w-0">
        {/* ── Nhập hàm số ── */}
        <section aria-labelledby="fa-input" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
          <label htmlFor="fa-text" id="fa-input" className="text-base font-semibold text-slate-800 dark:text-white">
            Nhập hàm số
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 font-mono text-[15px] text-slate-500 dark:text-slate-400">y =</span>
            <input
              id="fa-text"
              value={text}
              onChange={(e) => onType(e.target.value)}
              placeholder="x^3 - 3x^2 + 2"
              aria-invalid={!outcome.ok}
              aria-describedby="fa-feedback"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={fieldClass}
            />
          </div>

          <div id="fa-feedback" className="mt-2 min-h-[1.75rem] text-sm">
            {outcome.ok ? (
              <MathJax dynamic key={`preview-${outcome.key}`}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700 dark:text-slate-300">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {KIND_LABEL[outcome.analysis.fn.kind]}
                  </span>
                  {/* Một khối không ngắt dòng: MathJax ngắt công thức giữa chừng khi hết chỗ ("+ 3" rơi xuống dòng). */}
                  <span className="inline-block max-w-full overflow-x-auto whitespace-nowrap">{`$\\displaystyle y = ${outcome.key}$`}</span>
                </p>
              </MathJax>
            ) : (
              <p className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {outcome.error}
              </p>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Gõ <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">x^3</code> cho x³,{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">(2x+1)/(x-1)</code> cho phân thức. Dán được công thức LaTeX từ đề.
          </p>

          {template && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <MathJax dynamic key={`tpl-${template.kind}`}>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Đổi hệ số, xem bảng và đồ thị đổi theo:{' '}
                  <span className="inline-block whitespace-nowrap">{`$${KIND_TEMPLATE_TEX[template.kind]}$`}</span>
                </p>
              </MathJax>
              <div className="mt-2 flex flex-wrap gap-2">
                {slots.map((slot, i) => {
                  const value = coefOf(template.rat, slot)
                  return (
                    <div key={slot.name} className="inline-flex items-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => bump(i, -1)}
                        aria-label={`Giảm ${slot.name} đi 1`}
                        className="rounded-l-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-800"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="min-w-[3.5rem] px-1 text-center font-mono text-sm tabular-nums text-slate-800 dark:text-slate-100" aria-live="polite">
                        <i className="font-serif">{slot.name}</i> = {value.toString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => bump(i, 1)}
                        aria-label={`Tăng ${slot.name} thêm 1`}
                        className="rounded-r-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-800"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
              {!templateValid && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Hệ số này làm hàm đổi dạng — bấm ngược lại để quay về.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Đồ thị ── */}
        <section aria-label="Đồ thị hàm số" className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          {shown && stage ? (
            <div className={outcome.ok ? '' : 'opacity-50'}>
              <FunctionPlot
                analysis={shown.analysis}
                stage={stage}
                showCurve={!selfMode || stage.curve}
                title={`Đồ thị y = ${functionInput(shown.analysis.fn)}, bước ${index + 1} trên ${steps.length}`}
              />
            </div>
          ) : (
            <div className="flex aspect-[14/11] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Nhập một hàm số hợp lệ để vẽ đồ thị.
            </div>
          )}
          {shown && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-600 dark:text-slate-400">
              <li className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded bg-teal-600 dark:bg-teal-400" aria-hidden="true" /> đồ thị
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-2 border-dashed border-amber-600" aria-hidden="true" /> tiệm cận
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-800 dark:bg-white" aria-hidden="true" /> cực trị
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-600" aria-hidden="true" /> giao với trục
              </li>
            </ul>
          )}
        </section>

        {/* ── Bảng biến thiên ── */}
        {shown && stage && (
          <section aria-labelledby="fa-table" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-2">
            <h2 id="fa-table" className="mb-3 text-base font-semibold text-slate-800 dark:text-white">
              Bảng biến thiên
            </h2>
            <VariationTable analysis={shown.analysis} level={stage.table} hiddenSigns={hiddenSigns} />
          </section>
        )}

        {/* ── Từng bước ── */}
        {shown && step && (
          <section aria-labelledby="fa-steps" onKeyDown={onStepsKey} className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="fa-steps" className="text-base font-semibold text-slate-800 dark:text-white">
                Từng bước
              </h2>
              <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                Bước {index + 1}/{steps.length}
              </span>
            </div>

            <div className="mb-4 flex gap-1" role="group" aria-label="Chọn bước">
              {steps.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(i)}
                  disabled={!reachable(i)}
                  aria-label={s.title.replace(/\$/g, '')}
                  aria-current={i === index ? 'step' : undefined}
                  className={`h-2 flex-1 rounded-full bg-teal-600 transition-opacity dark:bg-teal-400 ${i <= index ? 'opacity-100' : 'opacity-25'} ${
                    i === index ? 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-800' : ''
                  }`}
                />
              ))}
            </div>

            <div aria-live="polite">
              <MathJax
                dynamic
                key={`step-${shown.key}-${mode}-${step.key}-${step.predicts.map((p) => answers[answerKey(step, p)] ?? '').join('|')}`}
              >
                <div className="border-l-4 border-teal-600 pl-3 dark:border-teal-400">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                    <RichText text={step.title} />
                  </h3>
                  {selfMode && step.predicts.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {step.predicts.map((p) => (
                        <PredictChoice
                          key={p.id}
                          kicker="Em tự làm"
                          question={p.question}
                          options={p.options}
                          correct={p.correct}
                          chosen={answers[answerKey(step, p)] ?? null}
                          explain={p.explain}
                          onChoose={(id) => setAnswers((a) => (answerKey(step, p) in a ? a : { ...a, [answerKey(step, p)]: id }))}
                        />
                      ))}
                    </div>
                  )}
                  {!pending && (
                    <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {step.lines.map((line, i) => (
                        <p key={`${step.key}-${i}`}>
                          <RichText text={line} />
                        </p>
                      ))}
                    </div>
                  )}
                  {selfMode && index === lastIndex && predictAll.length > 0 && (
                    <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                      Em trả lời đúng <strong className="tabular-nums">{predictRight}/{predictAll.length}</strong> câu ngay lần đầu.{' '}
                      {predictRight === predictAll.length
                        ? 'Nắm chắc sơ đồ khảo sát rồi — bấm +/− đổi một hệ số và làm lại nhé.'
                        : 'Xem lại các bước sai bằng thanh tiến độ phía trên.'}
                    </p>
                  )}
                </div>
              </MathJax>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Trước
              </button>
              {index < lastIndex ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(index + 1)}
                    disabled={pending}
                    className="btn-action inline-flex items-center gap-1 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400"
                  >
                    Bước tiếp
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {pending ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {step.predicts.length > 1 ? 'Trả lời hết các câu để đi tiếp.' : 'Chọn một đáp án để đi tiếp.'}
                    </span>
                  ) : (
                    !selfMode && (
                      <button
                        type="button"
                        onClick={() => go(lastIndex)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <SkipForward className="h-4 w-4" aria-hidden="true" />
                        Xem kết quả
                      </button>
                    )
                  )}
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
      </div>
    </>
  )
}
