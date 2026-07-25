'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Clipboard, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  buildEssayGradingPrompt,
  EssayGradingSuggestion,
  EssayRubricCriterion,
  parseEssayGradingSuggestion,
} from '@/lib/essay-grading/prompt'

interface EssayGradingPanelProps {
  studentAnswerId: string
  question: string
  studentAnswer: string
  referenceAnswer: string
  rubric: EssayRubricCriterion[]
  rubricVersion: number
  maxScore: number
  answerHash: string
  gradingStatus: string
  currentScore: number | null
  currentFeedback: string | null
  onApproved: () => Promise<void> | void
}

export default function EssayGradingPanel({
  studentAnswerId,
  question,
  studentAnswer,
  referenceAnswer,
  rubric,
  rubricVersion,
  maxScore,
  answerHash,
  gradingStatus,
  currentScore,
  currentFeedback,
  onApproved,
}: EssayGradingPanelProps) {
  const supabase = useMemo(() => createClient(), [])
  const [rawAiResult, setRawAiResult] = useState('')
  const [suggestion, setSuggestion] = useState<EssayGradingSuggestion | null>(null)
  const [finalScore, setFinalScore] = useState(currentScore ?? 0)
  const [finalFeedback, setFinalFeedback] = useState(currentFeedback || '')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const prompt = useMemo(() => buildEssayGradingPrompt({
    gradingRef: answerHash,
    rubricVersion,
    question,
    referenceAnswer,
    studentAnswer,
    rubric,
    maxScore,
  }), [answerHash, maxScore, question, referenceAnswer, rubric, rubricVersion, studentAnswer])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setMessage('Đã sao chép gói chấm ẩn danh. Hãy gửi cho AI rồi dán JSON trả về bên dưới.')
    } catch {
      setMessage('Không thể dùng clipboard. Hãy sao chép thủ công từ ô gói chấm.')
    }
  }

  const readSuggestion = () => {
    try {
      const parsed = parseEssayGradingSuggestion(rawAiResult, {
        gradingRef: answerHash,
        rubricVersion,
        rubric,
        maxScore,
      })
      setSuggestion(parsed)
      setFinalScore(parsed.suggested_score)
      setFinalFeedback(parsed.overall_feedback_vi)
      setMessage(parsed.outcome === 'needs_human_review'
        ? 'AI yêu cầu xem kỹ. Giáo viên cần tự đối chiếu rubric trước khi chốt.'
        : 'Đã đọc gợi ý AI. Hãy kiểm tra từng tiêu chí và chỉnh điểm nếu cần.')
    } catch (error) {
      setSuggestion(null)
      setMessage(error instanceof Error ? error.message : 'JSON AI không hợp lệ.')
    }
  }

  const approve = async () => {
    if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > maxScore) {
      setMessage(`Điểm cuối phải nằm trong 0..${maxScore}.`)
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.rpc('review_essay_answer', {
      p_student_answer_id: studentAnswerId,
      p_answer_hash: answerHash,
      p_rubric_version: rubricVersion,
      p_final_score: finalScore,
      p_final_feedback: finalFeedback.trim() || null,
      p_ai_score: suggestion?.suggested_score ?? null,
      p_ai_confidence: suggestion?.confidence ?? null,
      p_ai_feedback: suggestion?.overall_feedback_vi ?? null,
      p_ai_breakdown: suggestion?.criteria ?? null,
      p_ai_model: suggestion ? 'manual-ai-paste' : null,
    })

    if (error) {
      console.error('Review essay answer error:', error.message)
      setMessage(`Không thể chốt điểm: ${error.message}`)
      setSaving(false)
      return
    }

    setMessage('Đã chốt điểm. Tổng điểm bài thi đã được tính lại trên server.')
    setSaving(false)
    await onApproved()
  }

  return (
    <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 font-semibold text-indigo-900 dark:text-indigo-100">
            <Sparkles className="h-4 w-4" /> AI hỗ trợ chấm — giáo viên duyệt
          </h4>
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Trạng thái: {gradingStatus === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'} · tối đa {maxScore} điểm
          </p>
        </div>
        <button
          type="button"
          onClick={copyPrompt}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Clipboard className="h-4 w-4" /> Sao chép gói chấm AI
        </button>
      </div>

      <details className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-800 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Xem gói chấm ẩn danh</summary>
        <textarea readOnly value={prompt} rows={10} className="mt-3 w-full rounded-lg border p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950" />
      </details>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Dán JSON do AI trả về</label>
        <textarea
          value={rawAiResult}
          onChange={(event) => setRawAiResult(event.target.value)}
          rows={7}
          placeholder='{"schema_version":"essay-grade-result.v1", ...}'
          className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
        />
        <button type="button" onClick={readSuggestion} disabled={!rawAiResult.trim()} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-40 dark:border-indigo-700 dark:text-indigo-300">
          Kiểm tra gợi ý AI
        </button>
      </div>

      {suggestion && (
        <div className="space-y-2 rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <strong>Gợi ý: {suggestion.suggested_score}/{maxScore}</strong>
            <span>Độ tin cậy {(suggestion.confidence * 100).toFixed(0)}%</span>
          </div>
          {suggestion.criteria.map((criterion) => {
            const rubricCriterion = rubric.find((item) => item.criterion_id === criterion.criterion_id)
            return (
              <div key={criterion.criterion_id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <div className="font-medium">{rubricCriterion?.title}: {criterion.awarded_points}/{rubricCriterion?.max_score}</div>
                <p className="text-slate-600 dark:text-slate-300">{criterion.feedback}</p>
                {criterion.evidence && <p className="mt-1 text-xs text-slate-500">Bằng chứng: {criterion.evidence}</p>}
              </div>
            )
          })}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <label className="space-y-1">
          <span className="text-sm font-medium">Điểm cuối</span>
          <input
            type="number"
            min={0}
            max={maxScore}
            step={0.25}
            value={finalScore}
            onChange={(event) => setFinalScore(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Nhận xét cuối của giáo viên</span>
          <textarea
            value={finalFeedback}
            onChange={(event) => setFinalFeedback(event.target.value.slice(0, 4000))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {message && <p className="rounded-lg bg-white p-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</p>}

      <button
        type="button"
        onClick={approve}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {gradingStatus === 'approved' ? 'Cập nhật điểm đã duyệt' : 'Duyệt và chốt điểm'}
      </button>
    </div>
  )
}
