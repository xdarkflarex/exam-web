'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import { MathJax } from 'better-react-mathjax'
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, SkipForward } from 'lucide-react'
import ModeToggle, { type ToolMode } from './ModeToggle'
import PredictChoice from './PredictChoice'
import RichText from './RichText'
import SpacePlot from './SpacePlot'
import { analyzeDistance, analyzeLine, analyzePlane, analyzeSphere, type SpaceAnalysis, type SpaceKind } from '@/lib/tools/space/analyze'
import { lineThrough, type Vec3 } from '@/lib/tools/space/geometry'
import { parsePlane, parsePoint, parseSphereEquation, sphereFromCenterRadius } from '@/lib/tools/space/parse'
import { buildSpaceSteps, type SpacePrediction, type SpaceStep } from '@/lib/tools/space/steps'
import { Frac } from '@/lib/tools/fraction'

/**
 * Công cụ hình học toạ độ Oxyz (Toán 12, chương 5): bốn kiểu bài của SGK, hình
 * **kéo để xoay** đi kèm từng bước lời giải.
 *
 * Móc thu hút (nguyên tắc N3): xoay hình. Hình tĩnh hay làm học sinh đọc sai vị
 * trí tương đối — "trông như cắt" mà thật ra song song; xoay nửa vòng là thấy.
 *
 * Chế độ Tự làm hỏi trước ở đúng chỗ học sinh hay sai: tìm vectơ pháp tuyến bằng
 * phép nào, ý nghĩa của u·n = 0, vectơ chỉ phương của đường vuông góc, và mặt
 * phẳng cắt hay tiếp xúc mặt cầu.
 */

interface Form {
  A: string
  B: string
  C: string
  D: string
  M: string
  plane: string
  lineBy: 'points' | 'vector'
  u: string
  sphereBy: 'center' | 'equation'
  I: string
  R: string
  sphereEq: string
}

const BASE: Form = {
  A: '1; 0; 0',
  B: '0; 2; 0',
  C: '0; 0; 3',
  D: '',
  M: '1; -2; 3',
  plane: '2x - 2y + z + 3 = 0',
  lineBy: 'vector',
  u: '1; 1; 1',
  sphereBy: 'center',
  I: '1; 2; 3',
  R: '3',
  sphereEq: 'x^2 + y^2 + z^2 - 2x - 4y - 6z + 5 = 0',
}

interface Problem {
  kind: SpaceKind
  label: string
  short: string
  examples: { label: string; form: Partial<Form> }[]
}

const PROBLEMS: Problem[] = [
  {
    kind: 'plane',
    label: 'Mặt phẳng qua ba điểm',
    short: 'Mặt phẳng',
    examples: [
      { label: 'Ba điểm trên ba trục', form: { A: '1; 0; 0', B: '0; 2; 0', C: '0; 0; 3', D: '' } },
      { label: 'Có điểm thứ tư', form: { A: '1; 0; 0', B: '0; 2; 0', C: '0; 0; 3', D: '1; 2; 3' } },
      { label: 'Bốn điểm đồng phẳng', form: { A: '0; 0; 0', B: '1; 0; 0', C: '0; 1; 0', D: '2; 3; 0' } },
      { label: 'Toạ độ lẻ', form: { A: '1; 2; -1', B: '2; -1; 3', C: '-1; 1; 1', D: '' } },
    ],
  },
  {
    kind: 'distance',
    label: 'Khoảng cách · hình chiếu · điểm đối xứng',
    short: 'Khoảng cách',
    examples: [
      { label: 'Drone và mặt sàn', form: { M: '1; -2; 3', plane: '2x - 2y + z + 3 = 0' } },
      { label: 'Khoảng cách có căn', form: { M: '1; 1; 1', plane: 'x + y + z = 0' } },
      { label: 'Điểm nằm trên mặt phẳng', form: { M: '1; 1; 1', plane: 'x + y + z - 3 = 0' } },
    ],
  },
  {
    kind: 'line',
    label: 'Đường thẳng và mặt phẳng',
    short: 'Đường thẳng',
    examples: [
      { label: 'Tia sáng vuông góc', form: { A: '1; 0; 0', lineBy: 'vector', u: '1; 1; 1', plane: 'x + y + z - 3 = 0' } },
      { label: 'Cắt xiên', form: { A: '0; 0; 2', lineBy: 'vector', u: '1; 2; -1', plane: '2x - y + z - 1 = 0' } },
      { label: 'Cáp treo song song', form: { A: '0; 0; 1', lineBy: 'vector', u: '1; -1; 0', plane: 'x + y - 1 = 0' } },
      { label: 'Qua hai điểm', form: { A: '1; 0; 0', B: '2; 1; 1', lineBy: 'points', plane: '2x - 2y + z + 3 = 0' } },
    ],
  },
  {
    kind: 'sphere',
    label: 'Mặt cầu và mặt phẳng',
    short: 'Mặt cầu',
    examples: [
      { label: 'Cắt theo đường tròn', form: { sphereBy: 'center', I: '1; 2; 3', R: '3', plane: '2x - 2y + z + 3 = 0' } },
      { label: 'Tiếp xúc', form: { sphereBy: 'center', I: '0; 0; 0', R: '1', plane: 'x - 1 = 0' } },
      { label: 'Không có điểm chung', form: { sphereBy: 'center', I: '0; 0; 0', R: '1/2', plane: 'x - 1 = 0' } },
      { label: 'Cho bằng phương trình', form: { sphereBy: 'equation', plane: 'x + 2y - 2z + 1 = 0' } },
    ],
  },
]

type Outcome = { ok: true; analysis: SpaceAnalysis; steps: SpaceStep[]; key: string } | { ok: false; error: string }

function run(problem: Problem, f: Form): Outcome {
  const readPoint = (text: string, name: string): { ok: true; value: Vec3 } | { ok: false; error: string } =>
    parsePoint(text, name)

  const finish = (r: ReturnType<typeof analyzePlane>, key: string): Outcome =>
    r.ok ? { ok: true, analysis: r.analysis, steps: buildSpaceSteps(r.analysis), key } : r

  if (problem.kind === 'plane') {
    const A = readPoint(f.A, 'Điểm A')
    if (!A.ok) return A
    const B = readPoint(f.B, 'Điểm B')
    if (!B.ok) return B
    const C = readPoint(f.C, 'Điểm C')
    if (!C.ok) return C
    let D: Vec3 | null = null
    if (f.D.trim()) {
      const parsed = readPoint(f.D, 'Điểm D')
      if (!parsed.ok) return parsed
      D = parsed.value
    }
    return finish(analyzePlane(A.value, B.value, C.value, D), `plane|${f.A}|${f.B}|${f.C}|${f.D}`)
  }

  const plane = parsePlane(f.plane)
  if (!plane.ok) return plane

  if (problem.kind === 'distance') {
    const M = readPoint(f.M, 'Điểm M')
    if (!M.ok) return M
    return finish(analyzeDistance(M.value, plane.value), `distance|${f.M}|${f.plane}`)
  }

  if (problem.kind === 'line') {
    const A = readPoint(f.A, 'Điểm A')
    if (!A.ok) return A
    if (f.lineBy === 'points') {
      const B = readPoint(f.B, 'Điểm B')
      if (!B.ok) return B
      const line = lineThrough(A.value, B.value)
      if (!line) return { ok: false, error: 'Hai điểm trùng nhau nên chưa xác định được đường thẳng.' }
      return finish(analyzeLine(line, plane.value, [A.value, B.value]), `line|${f.A}|${f.B}|${f.plane}`)
    }
    const u = readPoint(f.u, 'Vectơ chỉ phương')
    if (!u.ok) return u
    if (u.value.isZero()) return { ok: false, error: 'Vectơ chỉ phương không được bằng vectơ 0.' }
    return finish(analyzeLine({ A: A.value, u: u.value }, plane.value, null), `line|${f.A}|${f.u}|${f.plane}`)
  }

  if (f.sphereBy === 'equation') {
    const S = parseSphereEquation(f.sphereEq)
    if (!S.ok) return S
    return finish(analyzeSphere(S.value, plane.value), `sphere|${f.sphereEq}|${f.plane}`)
  }
  const I = readPoint(f.I, 'Tâm I')
  if (!I.ok) return I
  const R = Frac.parse(f.R)
  if (!R) return { ok: false, error: 'Bán kính chưa đọc được — nhập số như 3, 1/2 hoặc 2,5.' }
  const S = sphereFromCenterRadius(I.value, R)
  if (!S.ok) return S
  return finish(analyzeSphere(S.value, plane.value), `sphere|${f.I}|${f.R}|${f.plane}`)
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-24 shrink-0 font-mono text-[15px] text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={fieldClass}
      />
    </div>
  )
}

export default function SpaceTool() {
  const [kind, setKind] = useState<SpaceKind>('plane')
  const [form, setForm] = useState<Form>(BASE)
  const [stepIndex, setStepIndex] = useState(0)
  const [mode, setMode] = useState<ToolMode>('guided')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const problem = PROBLEMS.find((p) => p.kind === kind)!
  const outcome = useMemo(() => run(problem, form), [problem, form])

  const [lastGood, setLastGood] = useState<Extract<Outcome, { ok: true }> | null>(null)
  if (outcome.ok && outcome.key !== lastGood?.key) setLastGood(outcome)
  const shown = outcome.ok ? outcome : lastGood?.key.startsWith(`${kind}|`) ? lastGood : null

  const selfMode = mode === 'self'
  const steps = shown?.steps ?? []
  const answerKey = (s: SpaceStep, p: SpacePrediction) => `${shown?.key}#${s.key}:${p.id}`
  const unanswered = (s: SpaceStep) => s.predicts.filter((p) => !(answerKey(s, p) in answers))
  const firstPending = selfMode ? steps.findIndex((s) => unanswered(s).length > 0) : -1
  const reachable = (i: number) => firstPending === -1 || i <= firstPending
  const lastIndex = Math.max(0, steps.length - 1)
  const index = Math.min(stepIndex, lastIndex, firstPending === -1 ? lastIndex : firstPending)
  const step = steps[index]
  const pending = Boolean(selfMode && step && unanswered(step).length > 0)
  // Chưa trả lời thì hình dừng ở mức trước — hiện sẵn là lộ đáp án của chính câu đang hỏi.
  const reveal = step ? (pending ? (step.preReveal ?? step.reveal) : step.reveal) : 0

  const predictAll = steps.flatMap((s) => s.predicts.map((p) => ({ s, p })))
  const predictRight = predictAll.filter(({ s, p }) => answers[answerKey(s, p)] === p.correct).length

  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  function loadExample(patch: Partial<Form>) {
    setForm((f) => ({ ...f, ...patch }))
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

  const matches = (patch: Partial<Form>) => Object.entries(patch).every(([k, v]) => form[k as keyof Form] === v)

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn kiểu bài">
          {PROBLEMS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => {
                setKind(p.kind)
                setStepIndex(0)
              }}
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
        <section aria-labelledby="sp-input" className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-1">
          <h2 id="sp-input" className="text-base font-semibold text-slate-800 dark:text-white">
            {problem.label}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ví dụ:</span>
            {problem.examples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => loadExample(ex.form)}
                aria-pressed={matches(ex.form)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  matches(ex.form)
                    ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                    : 'border-slate-300 text-slate-600 hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-teal-300'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {kind === 'plane' && (
              <>
                <Field id="sp-a" label="A(" value={form.A} onChange={(A) => update({ A })} placeholder="1; 0; 0" />
                <Field id="sp-b" label="B(" value={form.B} onChange={(B) => update({ B })} placeholder="0; 2; 0" />
                <Field id="sp-c" label="C(" value={form.C} onChange={(C) => update({ C })} placeholder="0; 0; 3" />
                <Field id="sp-d" label="D(" value={form.D} onChange={(D) => update({ D })} placeholder="để trống nếu đề không cho" />
              </>
            )}

            {kind === 'distance' && (
              <>
                <Field id="sp-m" label="M(" value={form.M} onChange={(M) => update({ M })} placeholder="1; -2; 3" />
                <Field id="sp-p" label="(P):" value={form.plane} onChange={(plane) => update({ plane })} placeholder="2x - 2y + z + 3 = 0" />
              </>
            )}

            {kind === 'line' && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cách cho đường thẳng">
                  {(
                    [
                      ['vector', 'Điểm và vectơ chỉ phương'],
                      ['points', 'Qua hai điểm'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ lineBy: id })}
                      aria-pressed={form.lineBy === id}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        form.lineBy === id
                          ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                          : 'border-slate-300 text-slate-600 hover:border-teal-500 dark:border-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Field id="sp-a2" label="A(" value={form.A} onChange={(A) => update({ A })} placeholder="1; 0; 0" />
                {form.lineBy === 'points' ? (
                  <Field id="sp-b2" label="B(" value={form.B} onChange={(B) => update({ B })} placeholder="2; 1; 1" />
                ) : (
                  <Field id="sp-u" label="u(" value={form.u} onChange={(u) => update({ u })} placeholder="1; 1; 1" />
                )}
                <Field id="sp-p2" label="(P):" value={form.plane} onChange={(plane) => update({ plane })} placeholder="x + y + z - 3 = 0" />
              </>
            )}

            {kind === 'sphere' && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cách cho mặt cầu">
                  {(
                    [
                      ['center', 'Tâm và bán kính'],
                      ['equation', 'Phương trình'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ sphereBy: id })}
                      aria-pressed={form.sphereBy === id}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        form.sphereBy === id
                          ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                          : 'border-slate-300 text-slate-600 hover:border-teal-500 dark:border-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.sphereBy === 'center' ? (
                  <>
                    <Field id="sp-i" label="I(" value={form.I} onChange={(I) => update({ I })} placeholder="1; 2; 3" />
                    <Field id="sp-r" label="R =" value={form.R} onChange={(R) => update({ R })} placeholder="3" />
                  </>
                ) : (
                  <Field id="sp-eq" label="(S):" value={form.sphereEq} onChange={(sphereEq) => update({ sphereEq })} placeholder="x^2 + y^2 + z^2 - 2x + 4y - 6z + 5 = 0" />
                )}
                <Field id="sp-p3" label="(P):" value={form.plane} onChange={(plane) => update({ plane })} placeholder="2x - 2y + z + 3 = 0" />
              </>
            )}
          </div>

          <div className="mt-2 min-h-[1.5rem] text-sm">
            {!outcome.ok && (
              <p className="flex items-start gap-1.5 text-rose-600 dark:text-rose-400" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <RichText text={outcome.error} />
              </p>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Toạ độ cách nhau bằng <strong>dấu chấm phẩy</strong> như SGK: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">1; -2; 0,5</code>.
            Mặt phẳng gõ nguyên phương trình, đã khai triển hết ngoặc.
          </p>
        </section>

        {/* ── Hình ── */}
        <section aria-label="Hình không gian" className="bento-tile p-3 sm:p-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          {shown ? (
            <div className={outcome.ok ? '' : 'opacity-50'}>
              <SpacePlot
                scene={shown.analysis.scene}
                reveal={reveal}
                title={`${problem.label}, bước ${index + 1} trên ${steps.length}`}
              />
            </div>
          ) : (
            <div className="flex aspect-[13/11] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Nhập đề hợp lệ để xem hình.
            </div>
          )}
          <p className="mt-3 px-1 text-xs text-slate-600 dark:text-slate-400">
            <strong>Kéo để xoay hình</strong> — hoặc bấm vào hình rồi dùng phím mũi tên, phím R để về góc nhìn ban đầu.
          </p>
        </section>

        {/* ── Từng bước ── */}
        {shown && step && (
          <section aria-labelledby="sp-steps" onKeyDown={onStepsKey} className="bento-tile p-4 sm:p-5 lg:col-start-2 lg:row-start-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="sp-steps" className="text-base font-semibold text-slate-800 dark:text-white">
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
                    <span className="text-xs text-slate-500 dark:text-slate-400">Chọn một đáp án để đi tiếp.</span>
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
