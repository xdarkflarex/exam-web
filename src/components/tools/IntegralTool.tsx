'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, SkipForward } from 'lucide-react'
import IntegralPlot from './IntegralPlot'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import RichText from './RichText'
import { parsePolynomial } from '@/lib/tools/expression'
import { Frac } from '@/lib/tools/fraction'
import type { Poly } from '@/lib/tools/poly'
import { analyzeIntegral, MAX_RECTANGLES, type IntegralAnalysis, type ProblemKind } from '@/lib/tools/integral/analyze'
import { RIEMANN_LABEL, type RiemannKind } from '@/lib/tools/integral/integrate'
import { buildIntegralSteps, type IntPrediction, type IntStep } from '@/lib/tools/integral/steps'

/**
 * Công cụ tích phân (Toán 12, chương 4): ba kiểu bài của SGK trong một khu —
 * tổng Riemann, diện tích hình phẳng, quãng đường từ vận tốc.
 *
 * Móc thu hút (nguyên tắc N3): thanh trượt số hình chữ nhật — thấy tổng Riemann
 * bò dần về giá trị tích phân, và sai số co lại theo.
 *
 * Chế độ Tự làm hỏi trước ở đúng chỗ học sinh hay sai: tổng xấp xỉ thiếu hay
 * thừa, đồ thị nào nằm trên trên từng khúc, và cái bẫy lớn nhất của chương —
 * tính diện tích bằng MỘT tích phân khi hiệu hai hàm đổi dấu.
 */

interface Form {
  f: string
  g: string
  a: string
  b: string
  n: number
  rkind: RiemannKind
}

interface Problem {
  kind: ProblemKind
  label: string
  /** Nhãn ngắn cho nút chọn trên điện thoại. */
  short: string
  variable: 'x' | 't'
  /** Nhãn ô nhập hàm thứ nhất. */
  fLabel: string
  examples: { label: string; form: Form }[]
}

const form = (f: string, g = '', a = '', b = '', n = 8, rkind: RiemannKind = 'left'): Form => ({ f, g, a, b, n, rkind })

const PROBLEMS: Problem[] = [
  {
    kind: 'riemann',
    label: 'Tổng Riemann → tích phân',
    short: 'Tổng Riemann',
    variable: 'x',
    fLabel: 'f(x) =',
    examples: [
      { label: 'x² trên [0; 1]', form: form('x^2', '', '0', '1', 8, 'left') },
      { label: 'Parabol úp', form: form('4 - x^2', '', '0', '2', 8, 'mid') },
      { label: 'Có phần dưới trục', form: form('x^3', '', '-1', '1', 8, 'right') },
    ],
  },
  {
    kind: 'area',
    label: 'Diện tích hình phẳng',
    short: 'Diện tích',
    variable: 'x',
    fLabel: 'f(x) =',
    examples: [
      { label: 'Hai parabol', form: form('x^2', '2 - x^2') },
      { label: 'Cắt trục giữa đoạn', form: form('x^3 - 3x^2 + 2', '', '0', '2') },
      { label: 'Ba giao điểm', form: form('x^3', 'x') },
      { label: 'Giao điểm có căn', form: form('x^2', 'x + 1') },
    ],
  },
  {
    kind: 'motion',
    label: 'Quãng đường từ vận tốc',
    short: 'Quãng đường',
    variable: 't',
    fLabel: 'v(t) =',
    examples: [
      { label: 'Đổi chiều hai lần', form: form('t^2 - 4t + 3', '', '0', '4') },
      { label: 'Đi một chiều', form: form('2t + 1', '', '0', '3') },
      { label: 'Phanh rồi lùi', form: form('6 - 2t', '', '0', '5') },
    ],
  },
]

type Outcome =
  | { ok: true; analysis: IntegralAnalysis; steps: IntStep[]; key: string }
  | { ok: false; error: string }

function readBound(text: string, name: string): { ok: true; value: Frac | null } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: null }
  const v = Frac.parse(text)
  if (!v) return { ok: false, error: `${name} chưa đọc được — nhập số như 0, -1, 1/2 hoặc 0,5.` }
  return { ok: true, value: v }
}

function run(problem: Problem, f0: Form): Outcome {
  const fp = parsePolynomial(f0.f, problem.variable)
  if (!fp.ok) return fp
  let g: Poly | null = null
  if (problem.kind === 'area' && f0.g.trim()) {
    const gp = parsePolynomial(f0.g, problem.variable)
    if (!gp.ok) return { ok: false, error: `Đường thứ hai: ${gp.error}` }
    g = gp.poly
  }
  const a = readBound(f0.a, 'Cận dưới')
  if (!a.ok) return a
  const b = readBound(f0.b, 'Cận trên')
  if (!b.ok) return b
  if (problem.kind !== 'area' && (a.value === null || b.value === null)) {
    return { ok: false, error: 'Nhập đủ hai cận.' }
  }

  const result = analyzeIntegral({
    kind: problem.kind,
    f: fp.poly,
    g,
    a: a.value,
    b: b.value,
    n: f0.n,
    rkind: f0.rkind,
  })
  if (!result.ok) return result
  const steps = buildIntegralSteps(result.analysis)
  const key = `${problem.kind}|${f0.f}|${f0.g}|${f0.a}|${f0.b}|${f0.n}|${f0.rkind}`
  return { ok: true, analysis: result.analysis, steps, key }
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
const boundClass = `${fieldClass} text-center`

export default function IntegralTool() {
  const [kind, setKind] = useState<ProblemKind>('riemann')
  const [forms, setForms] = useState<Record<ProblemKind, Form>>({
    riemann: PROBLEMS[0].examples[0].form,
    area: PROBLEMS[1].examples[0].form,
    motion: PROBLEMS[2].examples[0].form,
  })
  const [stepIndex, setStepIndex] = useState(0)
  const [mode, setMode] = useState<ToolMode>('guided')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const problem = PROBLEMS.find((p) => p.kind === kind)!
  const current = forms[kind]
  const outcome = useMemo(() => run(problem, current), [problem, current])

  // Giữ kết quả hợp lệ gần nhất để hình không nháy trắng khi đang gõ dở.
  const [lastGood, setLastGood] = useState<Extract<Outcome, { ok: true }> | null>(null)
  if (outcome.ok && outcome.key !== lastGood?.key) setLastGood(outcome)
  const shown = outcome.ok ? outcome : lastGood?.key.startsWith(`${kind}|`) ? lastGood : null

  const selfMode = mode === 'self'
  const steps = shown?.steps ?? []
  const answerKey = (s: IntStep, p: IntPrediction) => `${shown?.key}#${s.key}:${p.id}`
  const unanswered = (s: IntStep) => s.predicts.filter((p) => !(answerKey(s, p) in answers))
  const firstPending = selfMode ? steps.findIndex((s) => unanswered(s).length > 0) : -1
  const reachable = (i: number) => firstPending === -1 || i <= firstPending
  const lastIndex = Math.max(0, steps.length - 1)
  const index = Math.min(stepIndex, lastIndex, firstPending === -1 ? lastIndex : firstPending)
  const step = steps[index]
  const pending = Boolean(selfMode && step && unanswered(step).length > 0)

  const signStep = steps.find((s) => s.key === 'sign')
  // Khúc chưa trả lời thì chưa tô — tô sẵn là lộ đáp án của chính câu đang hỏi.
  const hiddenPieces = new Set<number>(
    selfMode && signStep ? unanswered(signStep).map((p) => p.piece ?? -1) : [],
  )
  const stage = step ? (pending && step.key !== 'sign' ? (step.preStage ?? step.stage) : step.stage) : null

  const predictAll = steps.flatMap((s) => s.predicts.map((p) => ({ s, p })))
  const predictRight = predictAll.filter(({ s, p }) => answers[answerKey(s, p)] === p.correct).length

  function update(patch: Partial<Form>) {
    setForms((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }))
  }

  function loadExample(next: Form) {
    setForms((all) => ({ ...all, [kind]: next }))
    setStepIndex(0)
  }

  function switchKind(next: ProblemKind) {
    setKind(next)
    setStepIndex(0)
  }

  function go(i: number) {
    const target = Math.max(0, Math.min(lastIndex, i))
    if (reachable(target)) setStepIndex(target)
  }

  function onStepsKey(e: KeyboardEvent<HTMLElement>) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT') return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (!pending) go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  const exampleKey = (f: Form) => `${f.f}|${f.g}|${f.a}|${f.b}|${f.n}|${f.rkind}`
  const sameAsCurrent = (f: Form) => exampleKey(f) === exampleKey(current)

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn kiểu bài">
          {PROBLEMS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => switchKind(p.kind)}
              aria-pressed={p.kind === kind}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                p.kind === kind
                  ? 'border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500'
                  : 'border-slate-300 text-slate-600 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300'
              }`}
            >
              {p.short}
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
        {/* ── Nhập đề ── */}
        <section aria-labelledby="int-input" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
          <h2 id="int-input" className="text-base font-semibold text-slate-800 dark:text-white">
            {problem.label}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ví dụ:</span>
            {problem.examples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => loadExample(ex.form)}
                aria-pressed={sameAsCurrent(ex.form)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  sameAsCurrent(ex.form)
                    ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                    : 'border-slate-300 text-slate-600 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="int-f" className="w-16 shrink-0 font-mono text-[15px] text-slate-500 dark:text-slate-400">
                {problem.fLabel}
              </label>
              <input
                id="int-f"
                value={current.f}
                onChange={(e) => update({ f: e.target.value })}
                placeholder={problem.variable === 't' ? 't^2 - 4t + 3' : 'x^2'}
                aria-invalid={!outcome.ok}
                aria-describedby="int-feedback"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={fieldClass}
              />
            </div>

            {kind === 'area' && (
              <div className="flex items-center gap-2">
                <label htmlFor="int-g" className="w-16 shrink-0 font-mono text-[15px] text-slate-500 dark:text-slate-400">
                  g(x) =
                </label>
                <input
                  id="int-g"
                  value={current.g}
                  onChange={(e) => update({ g: e.target.value })}
                  placeholder="để trống = trục hoành"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={fieldClass}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                {kind === 'motion' ? 'Thời gian' : 'Cận'}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="int-a" className="sr-only">
                  Cận dưới
                </label>
                <input
                  id="int-a"
                  value={current.a}
                  onChange={(e) => update({ a: e.target.value })}
                  placeholder="a"
                  inputMode="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${boundClass} w-20`}
                />
                <span className="text-slate-400" aria-hidden="true">
                  →
                </span>
                <label htmlFor="int-b" className="sr-only">
                  Cận trên
                </label>
                <input
                  id="int-b"
                  value={current.b}
                  onChange={(e) => update({ b: e.target.value })}
                  placeholder="b"
                  inputMode="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${boundClass} w-20`}
                />
              </div>
              {kind === 'area' && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Bỏ trống cả hai để lấy hoành độ giao điểm làm cận.
                </span>
              )}
            </div>
          </div>

          <div id="int-feedback" className="mt-2 min-h-[1.5rem] text-sm">
            {!outcome.ok && (
              <p className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {outcome.error}
              </p>
            )}
          </div>

          {kind === 'riemann' && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <label htmlFor="int-n" className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                Số hình chữ nhật
                <span className="font-mono text-sm tabular-nums text-slate-800 dark:text-slate-100">n = {current.n}</span>
              </label>
              <input
                id="int-n"
                type="range"
                min={1}
                max={MAX_RECTANGLES}
                value={current.n}
                onChange={(e) => update({ n: Number(e.target.value) })}
                className="mt-2 w-full accent-teal-600 dark:accent-teal-400"
              />
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Chiều cao lấy tại">
                {(['left', 'mid', 'right'] as RiemannKind[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => update({ rkind: r })}
                    aria-pressed={current.rkind === r}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      current.rkind === r
                        ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                        : 'border-slate-300 text-slate-600 hover:border-teal-500 dark:border-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {RIEMANN_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Gõ <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">x^3</code> cho x³,{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">(x-1)(x+2)</code> cho tích. Chỉ nhận đa thức; dán được công thức
            LaTeX từ đề.
          </p>
        </section>

        {/* ── Hình ── */}
        <section aria-label="Hình minh hoạ" className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          {shown && stage ? (
            <div className={outcome.ok ? '' : 'opacity-50'}>
              <IntegralPlot
                analysis={shown.analysis}
                stage={stage}
                hiddenPieces={hiddenPieces}
                title={`${problem.label}: ${shown.analysis.f.toInput(shown.analysis.variable)} trên đoạn từ ${shown.analysis.from.toPlain()} đến ${shown.analysis.to.toPlain()}, bước ${index + 1} trên ${steps.length}`}
              />
            </div>
          ) : (
            <div className="flex aspect-[7/5] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Nhập đề hợp lệ để xem hình.
            </div>
          )}
          {shown && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-600 dark:text-slate-400">
              <li className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded bg-teal-600 dark:bg-teal-400" aria-hidden="true" />
                {kind === 'motion' ? 'v(t)' : 'f(x)'}
              </li>
              {shown.analysis.g && (
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-5 rounded bg-violet-600 dark:bg-violet-400" aria-hidden="true" /> g(x)
                </li>
              )}
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded bg-emerald-500/40" aria-hidden="true" />
                {kind === 'motion' ? 'đi theo chiều dương' : 'phần dương'}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded bg-rose-500/40" aria-hidden="true" />
                {kind === 'motion' ? 'đi ngược lại' : 'phần âm'}
              </li>
              {kind === 'riemann' && (
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded border border-amber-600 bg-amber-400/30" aria-hidden="true" /> hình chữ nhật
                </li>
              )}
            </ul>
          )}
        </section>

        {/* ── Từng bước ── */}
        {shown && step && (
          <section aria-labelledby="int-steps" onKeyDown={onStepsKey} className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="int-steps" className="text-base font-semibold text-slate-800 dark:text-white">
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
                          onChoose={(id) => setAnswers((all) => (answerKey(step, p) in all ? all : { ...all, [answerKey(step, p)]: id }))}
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
                      Em trả lời đúng{' '}
                      <strong className="tabular-nums">
                        {predictRight}/{predictAll.length}
                      </strong>{' '}
                      câu ngay lần đầu.{' '}
                      {predictRight === predictAll.length
                        ? 'Nắm chắc rồi — đổi đề hoặc chuyển sang kiểu bài khác nhé.'
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
