'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Plus, ShieldAlert, Trash2, X } from 'lucide-react'

import MathContent from '@/components/MathContent'

/**
 * Sửa một câu hỏi ngay trong exam-web.
 *
 * VÌ SAO KHÔNG DÙNG `QuestionEditor` CÓ SẴN. Component đó khoá cứng bốn phương
 * án `option_a..option_d` và một `correct_answer: 'A'|'B'|'C'|'D'` — mô hình dữ
 * liệu của một phiên bản khác, không phải schema đang chạy. Schema thật có bảng
 * `answers` với N dòng, mỗi dòng một cờ `is_correct`. Nối nó vào chỉ sửa được
 * trắc nghiệm bốn phương án, và làm hỏng câu Đúng/Sai lẫn trả lời ngắn.
 *
 * BA DẠNG CÂU, BA HÌNH DẠNG KHÁC HẲN NHAU:
 *  - `multiple_choice` — N phương án, ĐÚNG MỘT cái đúng.
 *  - `true_false` — ĐÚNG BỐN ý, mỗi ý tự đúng hoặc sai, độc lập nhau.
 *  - `short_answer` — một giá trị đáp án.
 *
 * KHÔNG cho đổi dạng câu: đổi dạng là đổi cách chấm, mà bài đã nộp được chấm
 * theo dạng cũ. Muốn đổi dạng thì tạo câu mới.
 *
 * Mọi phép kiểm thật nằm ở `POST /api/admin/questions/save`; phần kiểm ở đây chỉ
 * để báo sớm cho đỡ mất công bấm.
 */

export interface EditableAnswer {
  id?: string
  content: string
  is_correct: boolean
}

export interface EditableQuestion {
  id: string
  content: string
  question_type: string
  explanation: string | null
  solution: string | null
  answers: EditableAnswer[]
  /**
   * Hình. CHỈ ĐỂ XEM — xem ghi chú ở `FigureBlock` về lý do không cho sửa.
   */
  tikz_code?: string | null
  tikz_image_url?: string | null
  solution_tikz_image_url?: string | null
  solution_tikz_image_url_2?: string | null
}

interface RuleIssue {
  code: string
  severity: string
  field: string
  message: string
}

interface Props {
  question: EditableQuestion | null
  onClose: () => void
  /** Gọi sau khi lưu xong để trang tải lại. */
  onSaved: () => void
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm một lựa chọn',
  true_false: 'Đúng / Sai (4 ý)',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

export default function QuestionEditModal({ question, onClose, onSaved }: Props) {
  const [content, setContent] = useState('')
  const [explanation, setExplanation] = useState('')
  const [solution, setSolution] = useState('')
  const [answers, setAnswers] = useState<EditableAnswer[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<RuleIssue[]>([])
  const [warnings, setWarnings] = useState<RuleIssue[]>([])
  /** Số bài đã nộp server báo về; phải gửi lại đúng số này để xác nhận. */
  const [pendingAttempts, setPendingAttempts] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!question) return
    setContent(question.content ?? '')
    setExplanation(question.explanation ?? '')
    setSolution(question.solution ?? '')
    setAnswers(
      (question.answers ?? []).map((answer) => ({
        id: answer.id,
        content: answer.content ?? '',
        is_correct: Boolean(answer.is_correct),
      }))
    )
    setError(null)
    setIssues([])
    setWarnings([])
    setPendingAttempts(null)
    setDone(false)
  }, [question])

  const type = question?.question_type ?? ''
  const isTrueFalse = type === 'true_false'
  const isShortAnswer = type === 'short_answer'
  const correctCount = answers.filter((answer) => answer.is_correct).length

  /** Cảnh báo tại chỗ, để không phải bấm Lưu mới biết mình sai. */
  const localWarning = useMemo(() => {
    if (isShortAnswer) return null
    if (isTrueFalse) {
      if (answers.length !== 4) return `Câu Đúng/Sai phải có đúng 4 ý, hiện có ${answers.length}.`
      return null
    }
    if (correctCount === 0) return 'Chưa đánh dấu phương án nào là đáp án đúng.'
    if (correctCount > 1) return `Trắc nghiệm một lựa chọn chỉ được có 1 đáp án đúng, hiện có ${correctCount}.`
    return null
  }, [answers.length, correctCount, isShortAnswer, isTrueFalse])

  if (!question) return null

  /**
   * Chọn đáp án đúng.
   *
   * Trắc nghiệm là chọn MỘT: bấm ý này thì các ý khác tự bỏ. Đúng/Sai là bốn
   * phán quyết ĐỘC LẬP nên chỉ lật đúng ý được bấm. Gộp hai hành vi này làm một
   * là cách chắc chắn để hỏng một trong hai dạng.
   */
  function toggleCorrect(index: number) {
    setAnswers((prev) =>
      prev.map((answer, i) => {
        if (isTrueFalse || isShortAnswer) {
          return i === index ? { ...answer, is_correct: !answer.is_correct } : answer
        }
        return { ...answer, is_correct: i === index }
      })
    )
  }

  async function save(confirmAttempts?: number) {
    setSaving(true)
    setError(null)
    setIssues([])
    try {
      const response = await fetch('/api/admin/questions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: question!.id,
          content,
          explanation,
          solution,
          answers,
          confirmAttempts,
        }),
      })
      const data = await response.json()

      if (response.status === 409 && data.code === 'NEEDS_ATTEMPT_CONFIRM') {
        setPendingAttempts(data.affectedAttempts as number)
        setError(data.error as string)
        return
      }
      if (!response.ok) {
        setError(data.error ?? 'Không lưu được.')
        setIssues(Array.isArray(data.issues) ? data.issues : [])
        return
      }

      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setDone(true)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không gọi được server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[var(--background-card)] shadow-2xl dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="font-baloo text-lg font-bold text-slate-800 dark:text-white">
              Sửa câu hỏi
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {TYPE_LABEL[type] ?? type} ·{' '}
              <span className="font-mono text-xs">{question.id}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <Check className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-slate-800 dark:text-white">Đã lưu.</p>
            {warnings.length > 0 && (
              <ul className="mx-auto mt-4 max-w-lg space-y-1 text-left text-sm text-amber-700 dark:text-amber-300">
                {warnings.map((issue, index) => (
                  <li key={index}>
                    [{issue.field}] {issue.message}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-action mt-5 rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
            >
              Xong
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <Field label="Nội dung đề" preview={content}>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={5}
                  className={inputClass}
                />
              </Field>

              <FigureBlock
                label="Hình của đề"
                images={[question.tikz_image_url]}
                tikzCode={question.tikz_code}
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {isShortAnswer ? 'Đáp án' : isTrueFalse ? 'Bốn ý Đúng/Sai' : 'Phương án'}
                  </label>
                  {!isShortAnswer && (
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => [...prev, { content: '', is_correct: false }])
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-300"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm {isTrueFalse ? 'ý' : 'phương án'}
                    </button>
                  )}
                </div>

                {localWarning && (
                  <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    {localWarning}
                  </p>
                )}

                <ul className="space-y-2">
                  {answers.map((answer, index) => (
                    <li key={answer.id ?? `moi-${index}`} className="flex items-start gap-2">
                      {!isShortAnswer && (
                        <button
                          type="button"
                          onClick={() => toggleCorrect(index)}
                          className={`mt-1 flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            answer.is_correct
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                          title={isTrueFalse ? 'Đúng / Sai cho ý này' : 'Đặt làm đáp án đúng'}
                        >
                          {isTrueFalse ? (answer.is_correct ? 'Đúng' : 'Sai') : answer.is_correct ? '✓' : '—'}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <textarea
                          value={answer.content}
                          onChange={(event) =>
                            setAnswers((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, content: event.target.value } : item
                              )
                            )
                          }
                          rows={2}
                          className={inputClass}
                        />
                        {answer.content.trim() && (
                          <div className="mt-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-900/50">
                            <MathContent content={answer.content} />
                          </div>
                        )}
                      </div>
                      {!isShortAnswer && (
                        <button
                          type="button"
                          onClick={() => setAnswers((prev) => prev.filter((_, i) => i !== index))}
                          aria-label="Xoá phương án"
                          className="mt-1 flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <Field label='Ô "Giải thích" (explanation)' preview={explanation}>
                <textarea
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </Field>

              <Field label='Ô "Lời giải" (solution)' preview={solution}>
                <textarea
                  value={solution}
                  onChange={(event) => setSolution(event.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </Field>

              <FigureBlock
                label="Hình của lời giải"
                images={[
                  question.solution_tikz_image_url,
                  question.solution_tikz_image_url_2,
                ]}
              />

              {error && (
                <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  <p>{error}</p>
                  {issues.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {issues.map((issue, index) => (
                        <li key={index}>
                          [{issue.field}] {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              {pendingAttempts !== null && (
                <span className="mr-auto inline-flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {pendingAttempts} bài đã nộp có câu này. Bài cũ KHÔNG được tự chấm lại.
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void save(pendingAttempts ?? undefined)}
                disabled={saving}
                className={`btn-action inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  pendingAttempts !== null ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {pendingAttempts !== null ? 'Vẫn lưu' : 'Lưu'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-[var(--background-raised)] px-3 py-2.5 font-mono text-sm text-slate-800 dark:border-slate-600 dark:text-slate-100'

/**
 * Hình của câu hỏi, CHỈ ĐỂ XEM.
 *
 * VÌ SAO KHÔNG CHO SỬA. Ảnh hiển thị (`*_tikz_image_url`) là SVG dựng sẵn từ
 * `tikz_code` bằng `scripts/render-tikz-svg.mjs`. Cho sửa `tikz_code` ngay đây
 * mà không dựng lại ảnh sẽ khiến mã và hình nói hai chuyện khác nhau — mà cái
 * học sinh nhìn thấy là HÌNH, nên sai lệch đó không lộ ra ở đâu cả. Sửa hình
 * thì sửa ở question-bank rồi dựng lại.
 *
 * Vẫn hiện mã TikZ để đối chiếu và để chép sang question-bank: khi lời giải
 * nhắc tới một điểm hay một cạnh trên hình, không nhìn được hình thì không sửa
 * nổi lời giải.
 */
function FigureBlock({
  label,
  images,
  tikzCode,
}: {
  label: string
  images: Array<string | null | undefined>
  tikzCode?: string | null
}) {
  const shown = images.filter((url): url is string => Boolean(url && url.trim()))
  const code = (tikzCode ?? '').trim()
  if (shown.length === 0 && !code) return null

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {label} <span className="font-normal text-slate-400">· chỉ xem</span>
      </p>

      {shown.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {shown.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={label}
              className="max-h-64 max-w-full rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600"
            />
          ))}
        </div>
      )}

      {shown.length === 0 && code && (
        <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Có mã TikZ nhưng chưa có ảnh dựng sẵn — học sinh sẽ không thấy hình này.
        </p>
      )}

      {code && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
            Xem mã TikZ (sửa hình thì sửa ở question-bank rồi dựng lại ảnh)
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {code}
          </pre>
        </details>
      )}
    </div>
  )
}

/** Ô nhập kèm bản render — lỗi LaTeX chỉ nhìn ra trên bản đã dựng. */
function Field({
  label,
  preview,
  children,
}: {
  label: string
  preview: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {children}
      {preview.trim() && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
          <MathContent content={preview} />
        </div>
      )}
    </div>
  )
}
