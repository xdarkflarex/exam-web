'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, ArrowLeft, CheckCircle, XCircle, Loader2, Download, Lock, RotateCcw, Save } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'
import MathContent, { MathProvider } from '@/components/MathContent'
import { buildExBlocksOrdered, ExportQuestion } from '@/lib/export/questionToLatex'
import { downloadTextFile } from '@/lib/export/download'
import { fetchAllAnswers } from '@/lib/answers/fetchAnswers'
import {
  MOET_SCORE,
  QUESTION_TYPE_LABEL,
  RUBRIC_SCORE_TOLERANCE,
  SCORING_PROFILE_LABEL,
  TRUE_FALSE_STATEMENT_COUNT,
  examTotalScore,
  formatScoreInput,
  initialQuestionScore,
  matchesRubricTotal,
  normalizeScoringProfile,
  parseScoreInput,
  requiresMoetScale,
  rubricTotal,
} from '@/lib/exam/scoring'
import type { ScoringProfile } from '@/lib/exam/scoring'

interface Answer {
  id: string
  content: string
  is_correct: boolean
  order_index: number
}

/** Một tiêu chí rubric, chỉ những trường cần để hiện bảng cho giáo viên nhìn mà
 *  đặt điểm. Tổng điểm vẫn tính bằng `rubricTotal()` để UI và RPC dùng chung một
 *  cách cộng — không cộng lại ở đây. */
interface RubricCriterionView {
  criterion_id: string
  title: string
  max_score: number
}

interface Question {
  id: string
  content: string
  question_type: string
  solution: string | null
  tikz_code: string | null
  part_number: number
  order_in_part: number
  answers: Answer[]
  /** Trọng số đang lưu trong `exam_questions.score`. */
  score: number
  /** Tiêu chí rubric để hiện, chỉ có ở câu tự luận. */
  rubricCriteria: RubricCriterionView[]
  /** Tổng thang điểm rubric — trọng số đúng của câu tự luận. null khi rubric
   *  thiếu hoặc có tiêu chí không hợp lệ. */
  rubricSum: number | null
}

interface ExamInfo {
  title: string
  subject: string
  is_published: boolean | null
  /** `exams.scoring_profile` đã chuẩn hoá. Quyết định trang này ràng buộc trọng số
   *  theo thang Bộ hay để giáo viên tự đặt. Đề tạo trước 2026-08-06 không có cột
   *  này → `normalizeScoringProfile()` cho `custom`, xem ghi chú của
   *  `DEFAULT_SCORING_PROFILE`. */
  scoringProfile: ScoringProfile
}

interface GradingConfigRelation {
  rubric: unknown
}

interface QuestionRelation {
  id: string
  content: string
  question_type: string
  solution: string | null
  tikz_code: string | null
  question_grading_configs: GradingConfigRelation | GradingConfigRelation[] | null
}

interface ExamQuestionRow {
  part_number: number
  order_in_part: number
  question_id: string
  score: number | null
  questions: QuestionRelation | QuestionRelation[] | null
}

/** Một vấn đề khiến không lưu được trọng số. Giữ `questionId` để chỉ ra đúng câu. */
interface ScoreIssue {
  questionId: string
  message: string
}

const partLabel: Record<number, string> = {
  1: 'Phần I — Trắc nghiệm',
  2: 'Phần II — Đúng / Sai',
  3: 'Phần III — Trả lời ngắn / Tự luận',
}

/** Thứ tự hiển thị trong bảng tổng kết điểm — theo thứ tự phần của đề thi. */
const scoreTableOrder = ['multiple_choice', 'true_false', 'short_answer', 'essay'] as const

/**
 * Chuẩn hoá `question_grading_configs.rubric` (cột jsonb, không được database
 * ràng buộc nội dung) thành danh sách hiển thị được. Bỏ qua tiêu chí không đọc
 * được — phần chặn lưu dựa vào `rubricTotal()`, hàm đó trả null khi có tiêu chí
 * xấu, nên bỏ qua ở đây không làm mất cảnh báo.
 */
function toRubricCriteria(rubric: unknown): RubricCriterionView[] {
  if (!Array.isArray(rubric)) return []
  const criteria: RubricCriterionView[] = []
  rubric.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const record = item as { criterion_id?: unknown; title?: unknown; max_score?: unknown }
    criteria.push({
      criterion_id: typeof record.criterion_id === 'string' ? record.criterion_id : `tieu-chi-${index + 1}`,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : `Tiêu chí ${index + 1}`,
      max_score: typeof record.max_score === 'number' && Number.isFinite(record.max_score) ? record.max_score : Number.NaN,
    })
  })
  return criteria
}

export default function ExamQuestionsPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = useMemo(() => createClient(), [])

  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Bản nháp điểm đang sửa, khoá theo `questions.id`, giữ nguyên chuỗi người
   *  dùng gõ để họ xoá hết ký tự được mà ô không tự nhảy về "1". */
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({})
  /** `can_edit_exam_question_links` — null nghĩa là chưa biết, chưa hỏi xong. */
  const [canEditScores, setCanEditScores] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Fetch exam info
      const { data: exam, error: examError } = await supabase
        .from('exams')
        .select('title, subject, is_published, scoring_profile')
        .eq('id', examId)
        .single()

      if (examError) {
        setError('Không tìm thấy bài thi')
        setLoading(false)
        return
      }

      setExamInfo({
        title: exam.title,
        subject: exam.subject,
        is_published: exam.is_published,
        scoringProfile: normalizeScoringProfile(exam.scoring_profile),
      })

      // PHASE B: Fetch exam questions via exam_questions with proper JOIN
      // This query follows the specified structure for preview without creating attempts
      // `score` là trọng số của câu trong đề này. Với đề `moet_standard` nó phải là
      // 0,25 / 1,0 / 0,5 (tự luận = tổng rubric); với đề `custom` là con số giáo
      // viên tự đặt. Trước 2026-08-06 trang này không đọc nó nên giáo viên không
      // có cách nào thấy đề đang chấm mỗi câu bao nhiêu điểm.
      const { data: examQuestions, error: eqError } = await supabase
        .from('exam_questions')
        .select(`
          part_number,
          order_in_part,
          question_id,
          score,
          questions!inner (
            id,
            content,
            question_type,
            solution,
            tikz_code,
            question_grading_configs (
              rubric
            )
          )
        `)
        .eq('exam_id', examId)
        .order('part_number', { ascending: true })
        .order('order_in_part', { ascending: true })

      if (eqError) {
        console.error('Exam questions fetch error:', eqError)
        setError('Không thể tải câu hỏi')
        setLoading(false)
        return
      }

      // Get question IDs for fetching answers
      const questionRows = examQuestions as unknown as ExamQuestionRow[]
      const questionIds = questionRows
        .map((eq) => Array.isArray(eq.questions) ? eq.questions[0]?.id : eq.questions?.id)
        .filter((id): id is string => Boolean(id))

      if (questionIds.length === 0) {
        setQuestions([])
        setScoreDraft({})
        setLoading(false)
        return
      }

      // Fetch all answers for the questions (phân trang tránh cắt 1000 dòng)
      const allAnswers = await fetchAllAnswers(supabase, questionIds)

      // Build answers map
      const answersByQuestion: Record<string, Answer[]> = {}
      for (const answer of allAnswers) {
        if (!answersByQuestion[answer.question_id]) {
          answersByQuestion[answer.question_id] = []
        }
        answersByQuestion[answer.question_id].push(answer)
      }

      // Build questions array - PHASE B: Read-only preview data
      const formattedQuestions: Question[] = questionRows.flatMap((eq) => {
        const q = Array.isArray(eq.questions) ? eq.questions[0] : eq.questions
        if (!q) return []
        // question_grading_configs là quan hệ 1-1 nhưng PostgREST trả mảng hoặc
        // object tuỳ suy luận khoá; xử lý cả hai để không phụ thuộc vào đó.
        const configs = q.question_grading_configs
        const config = Array.isArray(configs) ? configs[0] : configs
        return [{
          id: q.id,
          content: q.content,
          question_type: q.question_type,
          solution: q.solution,
          tikz_code: q.tikz_code,
          part_number: eq.part_number,
          order_in_part: eq.order_in_part,
          answers: answersByQuestion[q.id] || [],
          score: typeof eq.score === 'number' ? eq.score : 0,
          rubricCriteria: q.question_type === 'essay' ? toRubricCriteria(config?.rubric) : [],
          rubricSum: q.question_type === 'essay' ? rubricTotal(config?.rubric) : null,
        }]
      })

      setQuestions(formattedQuestions)
      setScoreDraft(Object.fromEntries(
        formattedQuestions.map(question => [question.id, formatScoreInput(question.score)])
      ))
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }, [examId, supabase])

  useEffect(() => {
    if (!examId) return
    const timeoutId = window.setTimeout(() => {
      void fetchData()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [examId, fetchData])

  // Hỏi database xem có được sửa trọng số hay không, thay vì suy từ `is_published`.
  // `can_edit_exam_question_links` là chính hàm mà policy
  // `staff_update_draft_exam_question_links` dùng (20260722:3164-3174), nên hỏi nó
  // là cách duy nhất chắc chắn UI và RLS nói cùng một câu. Suy đoán ở client rồi
  // để giáo viên bấm Lưu và nhận lỗi RLS là hành vi tệ hơn nhiều.
  useEffect(() => {
    if (!examId) return
    let cancelled = false
    const probe = async () => {
      const { data, error: rpcError } = await supabase
        .rpc('can_edit_exam_question_links', { p_exam_id: examId })
      if (cancelled) return
      if (rpcError) {
        console.error('can_edit_exam_question_links:', rpcError)
        // Không đọc được quyền → coi như không sửa được. Chặn oan còn hơn mở ô
        // nhập rồi hỏng ở bước lưu.
        setCanEditScores(false)
        return
      }
      setCanEditScores(data === true)
    }
    void probe()
    return () => { cancelled = true }
  }, [examId, supabase])

  /** Điểm nháp đã phân tích được của từng câu; null = chưa dùng được. */
  const parsedScores = useMemo(() => {
    const parsed = new Map<string, number | null>()
    for (const question of questions) {
      parsed.set(question.id, parseScoreInput(scoreDraft[question.id] ?? ''))
    }
    return parsed
  }, [questions, scoreDraft])

  /**
   * Vấn đề chặn lưu. Hai loại, cả hai đều là lỗi mà nếu để lọt thì nó nổ đúng lúc
   * học sinh bấm nộp bài:
   * - điểm không phải số dương → `exam_questions_positive_score` (20260722:200-205)
   *   chặn ở UPDATE, và `submit_practice_attempt` raise `INVALID_EXAM_QUESTION_SCORE`.
   * - điểm câu tự luận lệch tổng rubric quá 0,0001 → `submit_exam_attempt` raise
   *   `ESSAY_RUBRIC_SCORE_MISMATCH` (20260721:665-678).
   */
  const scoreIssues = useMemo<ScoreIssue[]>(() => {
    const issues: ScoreIssue[] = []
    for (const question of questions) {
      const value = parsedScores.get(question.id) ?? null
      if (value === null) {
        issues.push({ questionId: question.id, message: 'Điểm phải là một số lớn hơn 0.' })
        continue
      }
      if (question.question_type !== 'essay') continue
      if (question.rubricSum === null) {
        issues.push({
          questionId: question.id,
          message: 'Câu tự luận chưa có hướng dẫn chấm rubric dùng được, nên chưa xác định được điểm câu.',
        })
        continue
      }
      if (!matchesRubricTotal(value, question.rubricSum)) {
        issues.push({
          questionId: question.id,
          message: `Điểm câu tự luận phải bằng tổng thang điểm rubric (${question.rubricSum.toFixed(2)}), `
            + `lệch quá ${RUBRIC_SCORE_TOLERANCE} là lúc nộp bài sẽ lỗi ESSAY_RUBRIC_SCORE_MISMATCH.`,
        })
      }
    }
    return issues
  }, [questions, parsedScores])

  const issueByQuestion = useMemo(() => {
    const map = new Map<string, string>()
    for (const issue of scoreIssues) {
      if (!map.has(issue.questionId)) map.set(issue.questionId, issue.message)
    }
    return map
  }, [scoreIssues])

  /** Hồ sơ thang điểm của đề. `custom` khi chưa đọc xong — mặc định an toàn hơn:
   *  nó không hiện ràng buộc thang Bộ trên một đề có thể là đề học kì. */
  const scoringProfile = examInfo?.scoringProfile ?? 'custom'
  const isMoetExam = requiresMoetScale(scoringProfile)

  /** Số câu Đúng/Sai không đúng 4 ý — chỉ là vấn đề với đề theo thang Bộ. Bậc thang
   *  của Bộ chỉ định nghĩa cho 4 ý; các câu này được `moet_true_false_score` chấm
   *  theo tỷ lệ tuyến tính. Với đề học kì đó là nhánh **hợp lệ**, nên không cảnh
   *  báo — báo động trên một cấu hình đúng chỉ làm giáo viên bỏ qua mọi cảnh báo. */
  const trueFalseWrongStatementCount = useMemo(
    () => (isMoetExam
      ? questions.filter(question =>
        question.question_type === 'true_false' && question.answers.length !== TRUE_FALSE_STATEMENT_COUNT
      )
      : []),
    [questions, isMoetExam]
  )

  const savedTotal = useMemo(
    () => examTotalScore(questions.map(question => question.score)),
    [questions]
  )
  const draftTotal = useMemo(
    () => examTotalScore(questions.map(question => parsedScores.get(question.id) ?? 0)),
    [questions, parsedScores]
  )
  const changedQuestions = useMemo(
    () => questions.filter((question) => {
      const value = parsedScores.get(question.id) ?? null
      return value !== null && value !== question.score
    }),
    [questions, parsedScores]
  )

  const setDraft = (questionId: string, raw: string) => {
    setScoreDraft(current => ({ ...current, [questionId]: raw }))
    setSaveError(null)
    setSaveNotice(null)
  }

  /** Đặt lại toàn bộ trọng số về giá trị khởi tạo của hồ sơ: thang Bộ với đề thi
   *  thử, 1 điểm mỗi câu với đề học kì. Câu tự luận lấy tổng rubric ở cả hai hồ sơ
   *  — cùng nguồn với `initialQuestionScore()`, không copy số ở đây. */
  const applyProfileScale = () => {
    setScoreDraft(Object.fromEntries(questions.map((question) => {
      const target = initialQuestionScore(scoringProfile, question.question_type, question.rubricSum)
      return [question.id, target === null ? (scoreDraft[question.id] ?? '') : formatScoreInput(target)]
    })))
    setSaveError(null)
    setSaveNotice(null)
  }

  const resetDraft = () => {
    setScoreDraft(Object.fromEntries(questions.map(q => [q.id, formatScoreInput(q.score)])))
    setSaveError(null)
    setSaveNotice(null)
  }

  const saveScores = async () => {
    if (scoreIssues.length > 0 || changedQuestions.length === 0) return
    setSaving(true)
    setSaveError(null)
    setSaveNotice(null)

    // Mỗi câu một UPDATE. Không dùng upsert: upsert trên exam_questions phải đi
    // qua policy INSERT (`can_attach_question_to_exam`) và có thể tạo dòng mới nếu
    // khoá lệch — sửa trọng số không được phép thêm câu vào đề.
    for (const question of changedQuestions) {
      const value = parsedScores.get(question.id)
      if (value === undefined || value === null) continue
      const { error: updateError } = await supabase
        .from('exam_questions')
        .update({ score: value })
        .eq('exam_id', examId)
        .eq('question_id', question.id)
      if (updateError) {
        console.error('Update exam_question score:', updateError)
        setSaveError(
          updateError.message.includes('TRUE_FALSE_MUST_HAVE_FOUR_STATEMENTS')
            ? `Câu ${question.id} là Đúng/Sai nhưng không có đúng ${TRUE_FALSE_STATEMENT_COUNT} ý. Sửa câu hỏi cho đủ 4 ý trước.`
            : `Không lưu được điểm câu ${question.id}: ${updateError.message}`
        )
        setSaving(false)
        // Dừng ngay. Chạy tiếp sẽ để đề ở trạng thái nửa cũ nửa mới mà không ai
        // biết dòng nào đã đổi.
        await fetchData()
        return
      }
    }

    // `exams.total_score` không dùng để chấm (điểm lấy từ SUM(exam_questions.score)
    // lúc nộp) nhưng là con số giáo viên nhìn. Lệch nhau là nguồn của mọi báo cáo
    // "điểm hiển thị sai".
    const newTotal = examTotalScore(questions.map(question => parsedScores.get(question.id) ?? question.score))
    const { error: totalError } = await supabase
      .from('exams')
      .update({ total_score: newTotal })
      .eq('id', examId)
    if (totalError) {
      console.error('Update exams.total_score:', totalError)
      setSaveError(
        'Đã lưu trọng số từng câu nhưng không cập nhật được tổng điểm đề: '
        + `${totalError.message}. Tổng hiển thị sẽ lệch tổng thật cho tới khi sửa được.`
      )
      setSaving(false)
      await fetchData()
      return
    }

    setSaveNotice(`Đã lưu ${changedQuestions.length} câu. Tổng điểm đề: ${newTotal.toFixed(2)}.`)
    setSaving(false)
    await fetchData()
  }

  const handleExportTex = () => {
    if (questions.length === 0) return
    const items = questions.map(q => ({
      part_number: q.part_number,
      question: {
        content: q.content,
        question_type: q.question_type,
        tikz_code: q.tikz_code,
        answers: q.answers.map(a => ({
          content: a.content,
          is_correct: a.is_correct,
          order_index: a.order_index
        }))
      } as ExportQuestion
    }))
    const tex = buildExBlocksOrdered(items)
    const safeTitle = (examInfo?.title || 'de-thi').replace(/[^a-zA-Z0-9-_]+/g, '-')
    downloadTextFile(`${safeTitle}.tex`, tex)
  }

  const getQuestionTypeLabel = (type: string) => QUESTION_TYPE_LABEL[type] ?? type

  const getQuestionTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'multiple_choice': return 'bg-blue-100 text-blue-800'
      case 'true_false': return 'bg-purple-100 text-purple-800'
      case 'short_answer': return 'bg-green-100 text-green-800'
      case 'essay': return 'bg-amber-100 text-amber-800'
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-slate-500 dark:text-slate-400">Đang tải câu hỏi...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Lỗi</h1>
            <p className="text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Danh sách câu hỏi" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Danh sách câu hỏi</h1>
              <p className="text-slate-600 dark:text-slate-300">{examInfo?.title} • {questions.length} câu hỏi</p>
            </div>
            <button
              onClick={() => router.push(`/admin/exams/${examId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
            <button
              onClick={handleExportTex}
              disabled={questions.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              title="Xuất câu hỏi của đề thi ra file .tex"
            >
              <Download className="w-4 h-4" />
              Xuất .tex
            </button>
          </div>

          {/* Cấu hình điểm — ràng buộc tuỳ hồ sơ thang điểm của đề */}
          <section className="mb-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-lg">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                  Cấu hình điểm
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isMoetExam ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}>
                    {SCORING_PROFILE_LABEL[scoringProfile]}
                  </span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isMoetExam ? (
                    <>
                      Thang Bộ GD&amp;ĐT: trắc nghiệm {MOET_SCORE.multiple_choice.toFixed(2)}đ, Đúng/Sai{' '}
                      {MOET_SCORE.true_false.toFixed(2)}đ (bậc thang theo số ý đúng: 4 ý 1,00 — 3 ý 0,50 — 2 ý
                      0,25 — 1 ý 0,10), trả lời ngắn {MOET_SCORE.short_answer.toFixed(2)}đ, tự luận bằng tổng
                      thang điểm rubric.
                    </>
                  ) : (
                    <>
                      Đề này tự cấu hình: đặt trọng số từng câu theo ma trận điểm của bạn, không bắt buộc
                      tổng 10 và không bắt buộc câu Đúng/Sai đủ 4 ý. Câu Đúng/Sai vẫn chấm theo bậc thang
                      trên trọng số của nó (trọng số 2 → 2,0 / 1,0 / 0,5 / 0,2 / 0); câu tự luận vẫn phải
                      bằng tổng thang điểm rubric.
                    </>
                  )}
                </p>
              </div>
              {canEditScores && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={applyProfileScale}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {isMoetExam ? 'Đặt lại theo thang Bộ' : 'Đặt lại 1 điểm mỗi câu'}
                  </button>
                  <button
                    onClick={resetDraft}
                    disabled={saving || changedQuestions.length === 0}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Hoàn tác
                  </button>
                  <button
                    onClick={saveScores}
                    disabled={saving || changedQuestions.length === 0 || scoreIssues.length > 0}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Lưu {changedQuestions.length > 0 ? `(${changedQuestions.length})` : ''}
                  </button>
                </div>
              )}
            </div>

            {canEditScores === false && (
              <p className="mb-4 flex gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 p-3 text-sm text-slate-700 dark:text-slate-200">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Chỉ xem, không sửa được trọng số.{' '}
                  {examInfo?.is_published
                    ? 'Đề đã publish, và'
                    : 'Đề chưa publish nhưng đã có học sinh làm —'}{' '}
                  sửa trọng số lúc này sẽ làm điểm của bài đã nộp và bài nộp sau không so sánh được
                  với nhau. Muốn đổi thang điểm thì tạo đề mới.
                </span>
              </p>
            )}

            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Loại câu</th>
                  <th className="pb-2 text-right font-medium">Số câu</th>
                  <th className="pb-2 text-right font-medium">Tổng điểm</th>
                </tr>
              </thead>
              <tbody>
                {scoreTableOrder.map((type) => {
                  const rows = questions.filter(question => question.question_type === type)
                  if (rows.length === 0) return null
                  const subtotal = examTotalScore(rows.map(q => parsedScores.get(q.id) ?? q.score))
                  return (
                    <tr key={type} className="border-t border-slate-100">
                      <td className="py-1.5">{getQuestionTypeLabel(type)}</td>
                      <td className="py-1.5 text-right tabular-nums">{rows.length}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{subtotal.toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold">
                  <td className="py-1.5" colSpan={2}>Tổng điểm đề</td>
                  <td className="py-1.5 text-right tabular-nums">{draftTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {changedQuestions.length > 0 && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Chưa lưu: {changedQuestions.length} câu. Tổng đang lưu {savedTotal.toFixed(2)} → sẽ thành{' '}
                <span className="font-semibold tabular-nums">{draftTotal.toFixed(2)}</span>.
              </p>
            )}

            {scoreIssues.length > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {scoreIssues.length} câu chưa lưu được
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {scoreIssues.map(issue => (
                    <li key={issue.questionId}>{issue.questionId}: {issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {trueFalseWrongStatementCount.length > 0 && (
              <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {trueFalseWrongStatementCount.length} câu Đúng/Sai không có đúng{' '}
                  {TRUE_FALSE_STATEMENT_COUNT} ý ({trueFalseWrongStatementCount.map(q => `${q.id} (${q.answers.length} ý)`).join(', ')}).
                  Đề này chấm theo thang Bộ, mà bậc thang của Bộ chỉ định nghĩa cho câu 4 ý, nên những câu
                  này được chấm theo tỷ lệ tuyến tính — không đúng thang Bộ. Sửa câu hỏi cho đủ 4 ý.
                </span>
              </p>
            )}

            {scoreIssues.length === 0 && questions.length > 0 && isMoetExam && draftTotal !== 10 && (
              <p className="mt-3 flex gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-600 dark:text-slate-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Tổng {draftTotal.toFixed(2)} điểm, không phải 10,00 — đề không theo cấu trúc chuẩn
                  (12 trắc nghiệm + 4 Đúng/Sai + 6 trả lời ngắn). Điểm học sinh vẫn được quy đổi về thang
                  10, làm đúng hết là 10,00.
                </span>
              </p>
            )}

            {saveError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
            {saveNotice && <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{saveNotice}</p>}
          </section>

          {/* Questions List */}
          <div className="space-y-6">
            {questions.map((question, index) => (
              <div key={question.id} className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-100">
                {/* Question Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-bold text-indigo-600">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQuestionTypeBadgeColor(question.question_type)}`}>
                        {getQuestionTypeLabel(question.question_type)}
                      </span>
                      <span className="text-xs text-slate-400">{partLabel[question.part_number] || `Phần ${question.part_number}`}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {canEditScores ? (
                          <>
                            <label htmlFor={`score-${question.id}`} className="text-xs text-slate-500 dark:text-slate-400">Điểm</label>
                            <input
                              id={`score-${question.id}`}
                              type="number"
                              step={0.05}
                              min={0.05}
                              value={scoreDraft[question.id] ?? ''}
                              onChange={e => setDraft(question.id, e.target.value)}
                              className={`w-24 rounded-lg border px-2 py-1 text-right text-sm tabular-nums ${
                                issueByQuestion.has(question.id) ? 'border-red-400 bg-red-50' : 'border-slate-200 dark:border-slate-700'
                              }`}
                            />
                          </>
                        ) : (
                          <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
                            {question.score.toFixed(2)}đ
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="prose max-w-none">
                      <MathContent content={question.content} />
                    </div>
                    {issueByQuestion.has(question.id) && (
                      <p className="mt-2 text-sm text-red-600">{issueByQuestion.get(question.id)}</p>
                    )}
                  </div>
                </div>

                {/* Hướng dẫn chấm rubric — nguồn của điểm câu tự luận.
                    "chấm rubric có thang điểm và tự cộng lại được hoặc giáo viên
                    nhìn rubric set điểm được": bảng này là phần "nhìn rubric". */}
                {question.question_type === 'essay' && (
                  <div className="ml-12 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-2 text-sm font-medium text-amber-900">Hướng dẫn chấm (rubric)</div>
                    {question.rubricCriteria.length === 0 ? (
                      <p className="text-sm text-amber-800">
                        Chưa có rubric dùng được. Thêm hướng dẫn chấm ở <span className="font-mono text-xs">/admin/questions/essay/new</span>{' '}
                        trước khi công bố đề — thiếu rubric thì lúc học sinh nộp bài, hàm chấm báo lỗi
                        ESSAY_GRADING_CONFIG_MISSING và bài không được chấm.
                      </p>
                    ) : (
                      <>
                        <table className="w-full text-left text-sm text-amber-900">
                          <tbody>
                            {question.rubricCriteria.map(criterion => (
                              <tr key={criterion.criterion_id} className="border-t border-amber-200/70">
                                <td className="py-1.5">{criterion.title}</td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {Number.isFinite(criterion.max_score) ? criterion.max_score.toFixed(2) : '—'}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-amber-300 font-semibold">
                              <td className="py-1.5">Tổng thang điểm rubric</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {question.rubricSum !== null ? question.rubricSum.toFixed(2) : '—'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="mt-2 text-xs text-amber-800">
                          Điểm câu phải bằng đúng tổng này (sai số cho phép {RUBRIC_SCORE_TOLERANCE}).
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Answers */}
                {question.answers.length > 0 && (
                  <div className="ml-12 space-y-2">
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Các đáp án:</div>
                    {question.answers.map((answer, ansIndex) => (
                      <div
                        key={answer.id}
                        className={`p-3 rounded-lg border ${
                          answer.is_correct
                            ? 'bg-green-50 border-green-200'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {String.fromCharCode(65 + ansIndex)}.
                          </span>
                          <div className="flex-1">
                            <MathContent content={answer.content} />
                          </div>
                          {answer.is_correct && (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Solution */}
                {question.solution && (
                  <div className="ml-12 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm font-medium text-blue-800 mb-2">Lời giải:</div>
                    <div className="text-blue-700">
                      <MathContent content={question.solution} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MathProvider>
  )
}
