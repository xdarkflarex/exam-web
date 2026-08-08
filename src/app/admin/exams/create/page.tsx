'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, FileText, Loader2, Plus } from 'lucide-react'
import { nanoid } from 'nanoid'
import GlobalHeader from '@/components/GlobalHeader'
import { createClient } from '@/lib/supabase/client'
import {
  QUESTION_TYPE_LABEL,
  TRUE_FALSE_STATEMENT_COUNT,
  examTotalScore,
  initialQuestionScore,
  requiresMoetScale,
  rubricTotal,
} from '@/lib/exam/scoring'
import type { ScoringProfile } from '@/lib/exam/scoring'
import type { ExamMode } from '@/types'

/**
 * Ba loại đề giáo viên tạo được. Đây là **một lựa chọn cho người dùng** nhưng ghi
 * xuống **hai cột độc lập** — và đó là chỗ dễ hiểu sai nhất của trang này:
 *
 * - `exam_mode` trả lời "làm bài kiểu gì": `simulation` là bài thi có giờ,
 *   `practice` là ôn tập không giới hạn thời gian.
 * - `scoring_profile` trả lời "chấm theo thang nào": `moet_standard` bắt buộc
 *   trọng số của Bộ, `custom` để giáo viên tự đặt.
 *
 * Thi thử và thi học kì **cùng** `exam_mode = 'simulation'` nhưng khác hồ sơ điểm.
 * Vì vậy không nơi nào được suy hồ sơ từ mode — bảng này là chỗ duy nhất hai cột
 * được nối với nhau.
 */
const EXAM_KIND = {
  thi_thu: {
    label: 'Thi thử',
    mode: 'simulation',
    profile: 'moet_standard',
    hint: 'Theo thang Bộ GD&ĐT: trắc nghiệm 0,25 — Đúng/Sai 1,0 — trả lời ngắn 0,5. '
      + 'Câu Đúng/Sai phải đủ 4 ý. Đề chuẩn cộng đúng 10,00.',
  },
  hoc_ki: {
    label: 'Thi học kì',
    mode: 'simulation',
    profile: 'custom',
    hint: 'Giáo viên tự đặt ma trận điểm. Khởi tạo 1 điểm mỗi câu, sửa từng câu ở '
      + 'trang cấu hình điểm của đề. Không bắt buộc tổng 10 và không bắt buộc 4 ý.',
  },
  on_tap: {
    label: 'Ôn tập',
    mode: 'practice',
    profile: 'custom',
    hint: 'Không giới hạn thời gian, tự đặt trọng số. Bản pilot chưa hỗ trợ câu tự luận.',
  },
} as const satisfies Record<string, {
  label: string
  mode: ExamMode
  profile: ScoringProfile
  hint: string
}>

type ExamKind = keyof typeof EXAM_KIND

const examKindOrder = ['thi_thu', 'hoc_ki', 'on_tap'] as const satisfies readonly ExamKind[]

/** Một câu của đề gốc, đã chuẩn hoá từ PostgREST. Tách khỏi việc tính điểm để đổi
 *  loại đề không phải gọi lại database. */
interface SourceQuestion {
  id: string
  questionType: string
  /** Số ý của câu Đúng/Sai (số dòng `answers`). */
  statementCount: number
  /** Tổng thang điểm rubric của câu tự luận; `null` khi chưa cấu hình. */
  essayRubricTotal: number | null
}

/** Kết quả kiểm cấu hình điểm của đề gốc, tính trước khi cho bấm "Tạo đề". */
interface ScorePlan {
  /** Hồ sơ đã dùng để tính kế hoạch này. */
  profile: ScoringProfile
  /** Tổng điểm của đề nếu tạo — đề thi thử chuẩn phải ra đúng 10,0. */
  totalScore: number
  /** Trọng số từng câu, khoá theo `questions.id`. */
  scoreByQuestion: Record<string, number>
  /** Số câu theo loại, kể cả câu bị chặn. */
  countByType: Record<string, number>
  /** Tổng điểm theo loại; thiếu khoá khi mọi câu loại đó đều bị chặn. */
  subtotalByType: Record<string, number>
  /** Câu tự luận chưa có rubric dùng được → chặn tạo đề ở **mọi** loại đề, vì đây
   *  là ràng buộc của RPC chấm thi chứ không phải của thang Bộ. */
  essayWithoutRubric: string[]
  /** Câu Đúng/Sai không đúng 4 ý, kèm số ý thực tế → chỉ chặn đề **thi thử**. */
  trueFalseWrongStatementCount: { questionId: string; statementCount: number }[]
}

/** Thứ tự hiển thị trong bảng tổng kết điểm — theo thứ tự phần của đề thi. */
const scoreTableOrder = ['multiple_choice', 'true_false', 'short_answer', 'essay'] as const

/**
 * Tính trọng số và các lỗi chặn tạo đề, theo hồ sơ điểm.
 *
 * Hàm thuần, không gọi database: đổi loại đề chỉ tính lại tại chỗ. Hai lỗi bị chặn
 * đều là loại "phát hiện muộn thì quá muộn" — câu tự luận thiếu rubric làm
 * `submit_exam_attempt` raise `ESSAY_GRADING_CONFIG_MISSING` đúng lúc học sinh nộp
 * bài, còn câu Đúng/Sai khác 4 ý bị trigger
 * `exam_questions_true_false_four_statements` chặn giữa lúc INSERT.
 */
function buildScorePlan(questions: SourceQuestion[], profile: ScoringProfile): ScorePlan {
  const scoreByQuestion: Record<string, number> = {}
  const countByType: Record<string, number> = {}
  const scoresByType: Record<string, number[]> = {}
  const essayWithoutRubric: string[] = []
  const trueFalseWrongStatementCount: { questionId: string; statementCount: number }[] = []

  for (const question of questions) {
    countByType[question.questionType] = (countByType[question.questionType] ?? 0) + 1

    const score = initialQuestionScore(profile, question.questionType, question.essayRubricTotal)
    if (score === null) {
      if (question.questionType === 'essay') essayWithoutRubric.push(question.id)
      continue
    }
    scoreByQuestion[question.id] = score
    const bucket = scoresByType[question.questionType] ?? []
    bucket.push(score)
    scoresByType[question.questionType] = bucket

    // Hàng rào 4 ý chỉ áp cho đề theo thang Bộ. Đề học kì được dùng câu Đúng/Sai
    // 2 hay 3 ý — chấm theo tỷ lệ, xem `trueFalseScore()`.
    if (
      requiresMoetScale(profile)
      && question.questionType === 'true_false'
      && question.statementCount !== TRUE_FALSE_STATEMENT_COUNT
    ) {
      trueFalseWrongStatementCount.push({
        questionId: question.id,
        statementCount: question.statementCount,
      })
    }
  }

  const subtotalByType: Record<string, number> = {}
  for (const [type, scores] of Object.entries(scoresByType)) {
    subtotalByType[type] = examTotalScore(scores)
  }

  return {
    profile,
    totalScore: examTotalScore(Object.values(scoreByQuestion)),
    scoreByQuestion,
    countByType,
    subtotalByType,
    essayWithoutRubric,
    trueFalseWrongStatementCount,
  }
}

export default function CreateExamPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [sources, setSources] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(90)
  const [grade, setGrade] = useState(12)
  const [kind, setKind] = useState<ExamKind>('thi_thu')
  const [sourceQuestions, setSourceQuestions] = useState<SourceQuestion[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { mode, profile } = EXAM_KIND[kind]

  // Tính lại tại chỗ khi đổi loại đề, không gọi lại database — trọng số là hàm
  // thuần của (câu hỏi, hồ sơ).
  const scorePlan = useMemo(
    () => (sourceQuestions ? buildScorePlan(sourceQuestions, profile) : null),
    [sourceQuestions, profile]
  )

  const essayCount = scorePlan?.countByType.essay ?? 0
  const unsupportedEssayPractice = mode === 'practice' && essayCount > 0
  const blockedByScoreConfig = Boolean(
    scorePlan
    && (scorePlan.essayWithoutRubric.length > 0 || scorePlan.trueFalseWrongStatementCount.length > 0)
  )

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('questions').select('source_exam').not('source_exam', 'is', null).order('source_exam')
      setSources([...new Set((data || []).map(row => row.source_exam).filter(Boolean))] as string[])
      setLoading(false)
    }
    void load()
  }, [supabase])

  useEffect(() => {
    if (!source) return
    let cancelled = false
    const load = async () => {
      const { data, error: loadError } = await supabase.from('questions')
        .select(`
          id,
          question_type,
          answers ( id ),
          question_grading_configs ( rubric )
        `)
        .eq('source_exam', source)
        .order('created_at')
      if (cancelled) return
      if (loadError || !data) {
        setSourceQuestions(null)
        setError(loadError?.message || null)
        return
      }
      setSourceQuestions(data.map((row) => {
        // question_grading_configs là quan hệ 1-1 nhưng PostgREST trả về mảng
        // hoặc object tuỳ suy luận khoá; xử lý cả hai để không phụ thuộc vào đó.
        const configs = row.question_grading_configs
        const config = Array.isArray(configs) ? configs[0] : configs
        return {
          id: row.id,
          questionType: row.question_type,
          statementCount: row.answers?.length ?? 0,
          essayRubricTotal: rubricTotal(config?.rubric),
        }
      }))
    }
    void load()
    return () => { cancelled = true }
  }, [source, supabase])

  const create = async () => {
    if (!title.trim() || !source) return
    if (unsupportedEssayPractice) {
      setError('Bản thử tự luận mới hỗ trợ đề thi thử/kiểm tra, chưa áp dụng cho chế độ ôn tập.')
      return
    }
    if (!scorePlan) {
      setError('Chưa đọc được cấu hình điểm của đề gốc. Tải lại trang rồi thử lại.')
      return
    }
    if (scorePlan.essayWithoutRubric.length > 0) {
      setError(
        `Câu tự luận chưa có hướng dẫn chấm rubric: ${scorePlan.essayWithoutRubric.join(', ')}. `
        + 'Điểm câu tự luận lấy từ tổng thang điểm rubric ở mọi loại đề, nên phải thêm rubric ở '
        + '/admin/questions/essay/new trước khi đưa câu vào đề.'
      )
      return
    }
    if (scorePlan.trueFalseWrongStatementCount.length > 0) {
      setError(
        'Đề thi thử chấm theo bậc thang của Bộ nên câu Đúng/Sai phải có đúng 4 ý: '
        + scorePlan.trueFalseWrongStatementCount
          .map(item => `${item.questionId} (${item.statementCount} ý)`)
          .join(', ')
        + '. Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại "Thi học kì" nếu muốn giữ số ý hiện tại.'
      )
      return
    }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: questions, error: questionError } = await supabase.from('questions')
      .select('id, question_type').eq('source_exam', source).order('created_at')
    if (questionError || !questions?.length) {
      setError(questionError?.message || 'Đề gốc không có câu hỏi.')
      setSaving(false)
      return
    }
    // Trọng số lấy từ scorePlan đã kiểm ở trên, không tính lại tại đây — tính hai
    // lần theo hai đường là cách chắc chắn nhất để hai con số lệch nhau.
    const missingScore = questions.filter(question => scorePlan.scoreByQuestion[question.id] === undefined)
    if (missingScore.length > 0) {
      setError(
        'Đề gốc đã đổi kể từ lúc kiểm cấu hình điểm '
        + `(${missingScore.length} câu chưa có trọng số). Tải lại trang rồi thử lại.`
      )
      setSaving(false)
      return
    }
    const totalScore = examTotalScore(questions.map(question => scorePlan.scoreByQuestion[question.id]))
    const examId = nanoid()
    const { error: examError } = await supabase.from('exams').insert({
      id: examId,
      title: title.trim(),
      subject: 'Toán',
      duration: mode === 'practice' ? 0 : duration,
      total_score: totalScore,
      passing_score: 5,
      is_published: false,
      source_exam: source,
      grade,
      exam_mode: mode,
      // Chỉ ghi được lúc INSERT: `20260806` cố ý không grant UPDATE cho cột này,
      // vì đổi hồ sơ của đề đã có câu hỏi làm mọi trọng số hiện có thành sai thang.
      scoring_profile: profile,
      session_size: 10,
      created_by: user?.id || null,
    })
    if (examError) {
      setError(examError.message)
      setSaving(false)
      return
    }
    const orderByPart: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    const examQuestions = questions.map((question) => {
      const partNumber = question.question_type === 'multiple_choice'
        ? 1
        : question.question_type === 'true_false' ? 2 : 3
      orderByPart[partNumber] += 1
      return {
        exam_id: examId,
        question_id: question.id,
        question_type: question.question_type,
        part_number: partNumber,
        order_in_part: orderByPart[partNumber],
        score: scorePlan.scoreByQuestion[question.id],
      }
    })
    const { error: linkError } = await supabase.from('exam_questions').insert(examQuestions)
    if (linkError) {
      await supabase.from('exams').delete().eq('id', examId)
      setError(
        linkError.message.includes('TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS')
          ? 'Có câu Đúng/Sai không đúng 4 ý. Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại '
            + '"Thi học kì" — hàng rào 4 ý chỉ áp cho đề thi thử.'
          : linkError.message
      )
      setSaving(false)
      return
    }
    router.push(`/admin/exams/${examId}`)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <GlobalHeader title="Tạo đề thi hoặc bài ôn tập" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section className="space-y-5 rounded-2xl border bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <label className="mb-2 block text-sm font-medium">Đề gốc</label>
            <select value={source} onChange={e => { setSource(e.target.value); setSourceQuestions(null); setError(null) }} className="w-full rounded-xl border px-4 py-3 dark:bg-slate-900">
              <option value="">-- Chọn đề gốc --</option>
              {sources.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {/* Loại đề đặt TRƯỚC bảng điểm: nó quyết định mọi con số trong bảng đó. */}
          <div>
            <label className="mb-2 block text-sm font-medium">Loại đề</label>
            <div className="grid grid-cols-3 gap-3">
              {examKindOrder.map((item) => (
                <button
                  key={item}
                  onClick={() => { setKind(item); setError(null) }}
                  className={`rounded-xl border p-3 font-medium ${
                    kind === item ? 'border-teal-600 bg-teal-600 text-white' : ''
                  }`}
                >
                  {EXAM_KIND[item].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{EXAM_KIND[kind].hint}</p>
          </div>

          {scorePlan && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <p className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4" />{sourceQuestions?.length ?? 0} câu hỏi
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                {Object.entries(scorePlan.countByType).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-800">
                    {QUESTION_TYPE_LABEL[type] || type}: {count}
                  </span>
                ))}
              </div>
              {essayCount > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  Có {essayCount} câu tự luận: AI đề xuất, giáo viên bắt buộc duyệt trước khi có điểm cuối.
                </p>
              )}
              {unsupportedEssayPractice && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  Hãy chọn “Thi thử” hoặc “Thi học kì” để dùng câu tự luận trong bản pilot này.
                </p>
              )}
            </div>
          )}

          {scorePlan && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="font-semibold">
                {requiresMoetScale(scorePlan.profile)
                  ? 'Điểm theo thang Bộ GD&ĐT'
                  : 'Điểm khởi tạo — giáo viên tự cấu hình'}
              </p>
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-1 font-medium">Loại câu</th>
                    <th className="pb-1 text-right font-medium">Số câu</th>
                    <th className="pb-1 text-right font-medium">Điểm / câu</th>
                    <th className="pb-1 text-right font-medium">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreTableOrder.map((type) => {
                    const count = scorePlan.countByType[type] || 0
                    if (count === 0) return null
                    // Tự luận: mỗi câu một tổng rubric riêng nên không có
                    // "điểm/câu" chung. Trọng số các loại còn lại lấy từ đúng hàm
                    // mà lúc tạo đề dùng, không viết lại con số ở đây.
                    const unit = type === 'essay' ? null : initialQuestionScore(scorePlan.profile, type)
                    const subtotal = scorePlan.subtotalByType[type]
                    return (
                      <tr key={type} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5">{QUESTION_TYPE_LABEL[type]}</td>
                        <td className="py-1.5 text-right tabular-nums">{count}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {unit !== null ? unit.toFixed(2) : 'theo rubric'}
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {subtotal === undefined ? '—' : subtotal.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                    <td className="py-1.5" colSpan={3}>Tổng điểm đề</td>
                    <td className="py-1.5 text-right tabular-nums">{scorePlan.totalScore.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {scorePlan.essayWithoutRubric.length > 0 && (
                <p className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {scorePlan.essayWithoutRubric.length} câu tự luận chưa có hướng dẫn chấm rubric
                    ({scorePlan.essayWithoutRubric.join(', ')}). Điểm câu tự luận lấy từ tổng thang điểm
                    rubric ở mọi loại đề, nên phải thêm rubric trước khi đưa vào đề — nếu không, học sinh
                    nộp bài sẽ gặp lỗi và bài không được chấm.
                  </span>
                </p>
              )}

              {scorePlan.trueFalseWrongStatementCount.length > 0 && (
                <p className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Đề thi thử chấm theo bậc thang của Bộ nên câu Đúng/Sai phải có đúng{' '}
                    {TRUE_FALSE_STATEMENT_COUNT} ý:{' '}
                    {scorePlan.trueFalseWrongStatementCount
                      .map(item => `${item.questionId} (${item.statementCount} ý)`)
                      .join(', ')}
                    . Sửa câu hỏi cho đủ 4 ý, hoặc chọn loại “Thi học kì” để giữ số ý hiện tại.
                  </span>
                </p>
              )}

              {!blockedByScoreConfig && requiresMoetScale(scorePlan.profile) && scorePlan.totalScore !== 10 && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Tổng {scorePlan.totalScore.toFixed(2)} điểm, không phải 10,00 — đề không theo cấu trúc
                    chuẩn (12 trắc nghiệm + 4 Đúng/Sai + 6 trả lời ngắn). Vẫn tạo được: điểm học sinh được
                    quy đổi về thang 10, làm đúng hết vẫn là 10,00.
                  </span>
                </p>
              )}

              {!blockedByScoreConfig && !requiresMoetScale(scorePlan.profile) && (
                <p className="rounded-lg bg-slate-50 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Đề này không dùng thang Bộ nên tổng {scorePlan.totalScore.toFixed(2)} điểm là hợp lệ —
                  điểm học sinh luôn được quy đổi về thang 10. Sửa trọng số từng câu ở trang cấu hình điểm
                  của đề, khi đề còn nháp và chưa có ai làm.
                </p>
              )}
            </div>
          )}

          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên đề" className="w-full rounded-xl border px-4 py-3 dark:bg-slate-900" />
          <div className="grid grid-cols-2 gap-3">
            <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="rounded-xl border px-4 py-3 dark:bg-slate-900">
              <option value={10}>Lớp 10</option><option value={11}>Lớp 11</option><option value={12}>Lớp 12</option>
            </select>
            {mode === 'simulation' && (
              <label className="flex items-center gap-2 rounded-xl border px-4">
                <Clock className="h-4 w-4" />
                <input type="number" min={10} max={300} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-transparent py-3 outline-none" />
                <span className="text-sm text-slate-500">phút</span>
              </label>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button onClick={create} disabled={saving || !title.trim() || !source || unsupportedEssayPractice || blockedByScoreConfig} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Tạo đề
          </button>
        </section>
      </main>
    </div>
  )
}
