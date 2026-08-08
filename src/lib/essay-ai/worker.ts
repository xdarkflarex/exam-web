/**
 * Worker chấm tự luận: nối hàng chờ trong database với provider AI.
 *
 * Đây là mắt xích cuối của pipeline. Trước module này, database đã có đường
 * ghi điểm (`ai_finalize_essay_answer`, migration 20260804) và source đã có
 * adapter provider cùng logic quyết định fail-closed — nhưng không có gì gọi
 * chúng. Module này gọi.
 *
 * Luồng cho mỗi bài:
 *   hàng chờ -> get_essay_grading_package -> redact + normalize
 *            -> grade() -> decideFinalization() -> ai_finalize_essay_answer
 *
 * Trước vòng lặp, khi auto-chốt đang bật, worker còn chạy cổng chặn theo mức
 * giáo viên chấm đè (`override-guard.ts`): vượt ngưỡng thì cả lượt chỉ ghi gợi
 * ý, không bài nào được tự chốt. Đây là kill-switch tự động mà
 * `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 7 yêu cầu.
 *
 * BA NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ:
 *
 * 1. Fail-closed. Mọi lỗi trong vòng lặp đều kết thúc bằng "để bài lại cho
 *    giáo viên", không bao giờ bằng một điểm đoán. Một bài hỏng không được
 *    làm hỏng cả batch.
 *
 * 2. Không định danh rời server. Payload gửi provider chỉ gồm đề, đáp án
 *    tham chiếu, rubric và bài làm đã redact. `assertNoIdentifiers` trong
 *    `grading-provider.ts` là chốt cuối; nếu nó throw thì lỗi ở đây.
 *
 * 3. Không lộ dữ liệu qua báo cáo. `BatchReport` chỉ mang số đếm và mã lý do.
 *    Nó đi vào response HTTP và log, nên không được chứa id bài làm, nội dung
 *    bài, hay message lỗi thô của provider.
 *
 * HẠN CHẾ ĐÃ BIẾT — `ESSAY_AI_AUTO_FINALIZE` đã bật từ 2026-08-06:
 * Từ 2026-08-07 worker đọc `essay_ocr_snapshots` và truyền nguồn gốc text vào
 * `decideFinalization`, nên ba chốt chặn chất lượng nhận dạng
 * (`low_ocr_confidence`, `ocr_warning`, `math_region_uncertain`) đã hoạt động,
 * và bài chụp ảnh không có bản ghi chất lượng bị chặn bằng
 * `ocr_snapshot_missing`.
 *
 * Hai điều còn lại phải biết:
 *
 * 1. Bài nộp TRƯỚC 2026-08-07 không có snapshot và không phân biệt được với
 *    bài gõ tay — dữ liệu ấy đã mất vĩnh viễn, nên chúng đi qua cổng OCR mà
 *    không bị kiểm gì. Số lượng nhỏ và cố định, nhưng đừng dùng chúng làm bằng
 *    chứng cho chất lượng nhận dạng.
 *
 * 2. Cờ bật không đồng nghĩa bài được tự chốt. `override-guard.ts` đòi 20 bài
 *    AI chấm đã được giáo viên duyệt lại (`ESSAY_AI_OVERRIDE_MIN_COMPARED`)
 *    trước khi mở; dưới mốc đó verdict là `insufficient_evidence` và mọi bài về
 *    `pending_review` với trigger `override_rate_exceeded`. 20 bài đầu do giáo
 *    viên chấm chính là benchmark trên bài thật.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { aggregateOcrEvidence, decideFinalization, type OcrProvenance } from './auto-finalize'
import {
  ProviderError,
  type GradeSuggestion,
  type OcrWarning,
  type ReviewTrigger,
} from './contracts'
import { createDeepSeekGradingProvider, type GradingProvider } from './grading-provider'
import { readEssayAiFlags, readGradingConfig, type EssayAiFlags } from './model-allowlist'
import { hashGradingInput, normalizeAnswerText } from './normalize'
import {
  evaluateOverrideGuard,
  readOverrideThresholds,
  type OverrideVerdict,
} from './override-guard'
import { computeOverrideStats, type TeacherReviewRow } from './override-stats'
import { redactPii } from './redaction'
import {
  clampLimit,
  mapPackageError,
  parsePackage,
  resolveConfidenceMin,
  rubricVersionMatches,
  type GradingPackage,
  type SkipReason,
} from './worker-logic'

// ---------------------------------------------------------------------------
// Kiểu công khai
// ---------------------------------------------------------------------------

export interface RunGradingBatchOptions {
  /** Số bài tối đa xử lý trong một lượt. */
  limit?: number
  /** Chỉ xử lý đúng các bài này (dùng khi chấm lại thủ công). */
  answerIds?: string[]
  /**
   * Chỉ xử lý bài tự luận của MỘT attempt.
   *
   * Dùng bởi `POST /api/essay-ai/grade-mine`: học sinh vừa bấm nộp và cần điểm
   * ngay, không chờ lượt cron kế tiếp. Giới hạn phạm vi ở đây thay vì để route
   * tự truy vấn rồi truyền `answerIds` là có lý do: mọi điều kiện an toàn của
   * `fetchQueue` (đúng `question_type`, đúng `grading_status`, attempt đã
   * `submitted`, đề `simulation`, text không rỗng) vẫn áp dụng nguyên vẹn. Route
   * không được phép tự chọn bài để chấm.
   */
  attemptId?: string
}

/**
 * Kết quả một lượt chạy. CỐ Ý không chứa id bài làm hay nội dung: object này
 * đi thẳng vào response HTTP và log.
 */
export interface BatchReport {
  /** Số bài lấy từ hàng chờ. */
  picked: number
  /** Số bài AI đã chốt điểm. */
  autoFinalized: number
  /** Số bài để lại cho giáo viên sau khi đã gọi provider. */
  pendingReview: number
  /** Số bài bỏ qua trước khi gọi provider (không tốn tiền). */
  skipped: number
  /** Số bài gặp lỗi provider. */
  providerErrors: number
  /** Đếm theo lý do fail-closed, để biết pipeline đang bị chặn ở đâu. */
  triggerCounts: Partial<Record<ReviewTrigger, number>>
  /** Đếm theo lý do bỏ qua. */
  skipReasons: Partial<Record<SkipReason, number>>
  estimatedCostUsd: number
  monthToDateCostUsd: number
  flags: {
    enabled: boolean
    autoFinalize: boolean
  }
  /**
   * Cổng chặn theo mức chấm đè có đang chặn auto-chốt không. `false` khi cờ
   * auto-chốt đã tắt (không cần đánh giá) hoặc khi số liệu đã đạt ngưỡng.
   */
  overrideGuardBlocked: boolean
  /** Cảnh báo cấu hình dành cho người vận hành. Không chứa dữ liệu học sinh. */
  warnings: string[]
}

export type { SkipReason } from './worker-logic'

const MAX_PROVIDER_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [2_000, 8_000]

/**
 * Cửa sổ phân tích chấm đè, ngày. Giữ khớp với `OVERRIDE_WINDOW_DAYS` của
 * `GET /api/admin/essay-ai/stats`: hai bên lệch cửa sổ thì dashboard và worker
 * nói hai con số khác nhau về cùng một tình hình.
 */
const OVERRIDE_WINDOW_DAYS = 90
/** Trần số dòng đọc cho cổng chặn override. */
const OVERRIDE_MAX_ROWS = 5000

interface OverrideUsageRow {
  student_answer_id: string
  ai_score: number | string | null
  created_at: string
}

interface OverrideReviewRow {
  student_answer_id: string
  final_score: number | string | null
  created_at: string
}

/** numeric của Postgres về JS dưới dạng chuỗi khi vượt độ chính xác an toàn. */
function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// Điểm vào
// ---------------------------------------------------------------------------

export async function runGradingBatch(
  options: RunGradingBatchOptions = {}
): Promise<BatchReport> {
  const limit = clampLimit(options.limit)
  const flags = readEssayAiFlags()

  const report: BatchReport = {
    picked: 0,
    autoFinalized: 0,
    pendingReview: 0,
    skipped: 0,
    providerErrors: 0,
    triggerCounts: {},
    skipReasons: {},
    estimatedCostUsd: 0,
    monthToDateCostUsd: 0,
    flags: { enabled: flags.enabled, autoFinalize: flags.autoFinalize },
    overrideGuardBlocked: false,
    warnings: [],
  }

  // Kill-switch chặn trước mọi thứ khác: tắt nghĩa là không chạm database,
  // không gọi provider, không tốn tiền.
  if (!flags.enabled) {
    report.warnings.push('ESSAY_AI_ENABLED đang tắt; không xử lý bài nào.')
    return report
  }

  // Cảnh báo cho người vận hành, không chặn.
  //
  // Bản trước của dòng này nói "hệ thống chưa lưu kết quả OCR nên các chốt chặn
  // chất lượng nhận dạng không hoạt động" — đúng vào tháng 8/2026 khi viết, SAI
  // từ `20260807` (bảng `essay_ocr_snapshots` + `aggregateOcrEvidence`). Nó nằm
  // lại trong report và làm người vận hành tin là các cổng OCR đang tắt. Sửa
  // 2026-08-07; giữ ghi chú này vì đây đúng là loại sai lệch khó phát hiện: một
  // câu cảnh báo cũ không bao giờ làm test đỏ.
  if (flags.autoFinalize) {
    report.warnings.push(
      'ESSAY_AI_AUTO_FINALIZE đang BẬT: điểm do AI chốt sẽ hiện với học sinh ' +
        'trước khi có người kiểm tra. Các cổng chất lượng OCR và cổng chấm đè ' +
        'vẫn chạy; xem triggerCounts để biết bài nào bị chặn và vì sao.'
    )
  }

  const admin = createAdminClient()

  // Đọc cấu hình provider sớm: thiếu key thì dừng cả batch ở đây thay vì để
  // từng bài throw riêng lẻ.
  let provider: GradingProvider
  let providerName: string
  let modelName: string
  try {
    const config = readGradingConfig()
    providerName = config.provider
    modelName = config.model
    provider = createDeepSeekGradingProvider(config)
  } catch (error) {
    report.warnings.push(
      error instanceof ProviderError
        ? error.message
        : 'Không đọc được cấu hình provider chấm.'
    )
    return report
  }

  report.monthToDateCostUsd = await readMonthToDateCost(admin)

  // Không đọc được chi phí đã dùng nghĩa là không có sổ chi phí — thường là
  // migration 20260805 chưa áp. Dừng cả batch: gọi provider mà không ghi được
  // chi phí là chạy không giới hạn ngân sách.
  if (report.monthToDateCostUsd < 0) {
    report.monthToDateCostUsd = 0
    report.warnings.push(
      'Không đọc được chi phí tháng (bảng essay_ai_usage đã áp chưa?). ' +
        'Dừng batch: không gọi provider khi chưa có sổ chi phí.'
    )
    return report
  }

  const queue = await fetchQueue(admin, limit, options.answerIds, options.attemptId)
  report.picked = queue.length

  // Cổng chặn theo mức chấm đè. Chỉ đọc số liệu khi auto-chốt đang bật: với cờ
  // tắt, mọi bài về hàng chờ giáo viên rồi, hai truy vấn này không đổi được gì.
  let overrideGuard: OverrideVerdict = { blocked: false }
  if (flags.autoFinalize && queue.length > 0) {
    overrideGuard = await evaluateOverrideForBatch(admin)
    if (overrideGuard.blocked) {
      report.warnings.push(
        `Auto-chốt bị chặn tự động: ${overrideGuard.detail} ` +
          'Bài vẫn được chấm và ghi gợi ý, nhưng điểm để giáo viên duyệt.'
      )
    }
  }
  report.overrideGuardBlocked = overrideGuard.blocked

  for (const item of queue) {
    await processOne({
      admin,
      provider,
      providerName,
      modelName,
      flags,
      overrideGuard,
      item,
      report,
    })
  }

  return report
}

/**
 * Đọc số liệu chấm đè trong cửa sổ phân tích và chạy cổng chặn.
 *
 * Dùng cùng `computeOverrideStats` với `GET /api/admin/essay-ai/stats`, nên con
 * số worker thực thi và con số dashboard hiển thị không thể lệch nhau.
 *
 * Bất kỳ truy vấn nào lỗi đều dẫn tới `partial` -> cổng chặn. Không đọc được
 * mình đang chấm lệch bao nhiêu không phải lý do để cho phép tự chốt điểm.
 */
async function evaluateOverrideForBatch(
  admin: SupabaseClient
): Promise<OverrideVerdict> {
  const thresholds = readOverrideThresholds()
  const since = new Date(Date.now() - OVERRIDE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const { data: usageData, error: usageError } = await admin
    .from('essay_ai_usage')
    .select('student_answer_id, ai_score, created_at')
    .not('ai_score', 'is', null)
    .gte('created_at', since.toISOString())
    .limit(OVERRIDE_MAX_ROWS)

  if (usageError) {
    console.error('[essay-ai worker] override usage query failed:', usageError.message)
    return evaluateOverrideGuard(null, thresholds)
  }

  const usage = ((usageData ?? []) as OverrideUsageRow[])
    .map((row) => ({
      studentAnswerId: row.student_answer_id,
      aiScore: toFiniteNumber(row.ai_score),
      createdAt: row.created_at,
    }))
    .filter((row): row is { studentAnswerId: string; aiScore: number; createdAt: string } =>
      row.aiScore !== null
    )

  if (usage.length === 0) {
    // Chưa có bài nào AI chấm: cổng vẫn chặn vì `compared = 0` không đạt
    // `minCompared`. Gọi hàm để lý do và câu giải thích do một chỗ sinh ra.
    return evaluateOverrideGuard(
      { compared: 0, changed: 0, serious: 0, partial: false },
      thresholds
    )
  }

  const answerIds = Array.from(new Set(usage.map((row) => row.studentAnswerId)))

  const { data: reviewData, error: reviewError } = await admin
    .from('essay_grading_reviews')
    .select('student_answer_id, final_score, created_at')
    .in('student_answer_id', answerIds)
    .eq('actor_kind', 'teacher')
    .limit(OVERRIDE_MAX_ROWS)

  if (reviewError) {
    console.error('[essay-ai worker] override review query failed:', reviewError.message)
    return evaluateOverrideGuard(null, thresholds)
  }

  const reviews: TeacherReviewRow[] = []
  for (const row of (reviewData ?? []) as OverrideReviewRow[]) {
    const finalScore = toFiniteNumber(row.final_score)
    if (finalScore === null) continue
    reviews.push({
      studentAnswerId: row.student_answer_id,
      finalScore,
      createdAt: row.created_at,
    })
  }

  const { data: answerData, error: answerError } = await admin
    .from('student_answers')
    .select('id, max_score')
    .in('id', answerIds)

  const maxScores = new Map<string, number>()
  if (answerError) {
    console.error('[essay-ai worker] override max_score query failed:', answerError.message)
  } else {
    for (const row of (answerData ?? []) as { id: string; max_score: number | string | null }[]) {
      const value = toFiniteNumber(row.max_score)
      if (value !== null && value > 0) maxScores.set(row.id, value)
    }
  }

  const stats = computeOverrideStats({
    usage,
    reviews,
    maxScores,
    sourceIncomplete: answerError !== null,
  })

  return evaluateOverrideGuard(stats, thresholds)
}

// ---------------------------------------------------------------------------
// Xử lý một bài
// ---------------------------------------------------------------------------

interface QueueItem {
  studentAnswerId: string
  attemptId: string
  questionId: string
  /** Snapshot lúc nộp. `ai_finalize_essay_answer` so với chính giá trị này. */
  gradingRubricVersion: number | null
}

interface ProcessContext {
  admin: SupabaseClient
  provider: GradingProvider
  providerName: string
  modelName: string
  flags: EssayAiFlags
  /**
   * Cổng chặn theo mức chấm đè, tính MỘT LẦN cho cả lượt. Không tính lại theo
   * từng bài: số liệu là mức tổng hợp của 90 ngày, nên nó không đổi giữa hai
   * bài trong cùng lượt, và tính lại chỉ thêm truy vấn.
   */
  overrideGuard: OverrideVerdict
  item: QueueItem
  report: BatchReport
}

async function processOne(ctx: ProcessContext): Promise<void> {
  const { admin, item, report } = ctx

  const pkg = await fetchPackage(admin, item.studentAnswerId)
  if (!pkg.ok) {
    recordSkip(report, pkg.reason)
    return
  }

  const pack = pkg.value

  // Cờ AI theo từng câu hỏi. Giáo viên tắt ở đây nghĩa là câu này phải do
  // người chấm, bất kể cờ toàn cục.
  if (!pack.aiEnabled) {
    recordSkip(report, 'ai_disabled_for_question')
    return
  }

  // Rubric đổi sau khi học sinh nộp: `ai_finalize_essay_answer` sẽ raise
  // RUBRIC_VERSION_MISMATCH. Bắt ở đây để không trả tiền cho một lời gọi
  // provider chắc chắn bị từ chối khi ghi.
  if (!rubricVersionMatches(pack.rubricVersion, item.gradingRubricVersion)) {
    recordSkip(report, 'rubric_version_changed')
    return
  }

  // Thứ tự redact-rồi-normalize khớp với `ocr-provider.ts`: redact chạy trên
  // text còn nguyên nhãn ("Họ và tên:"), normalize sinh hash của text cuối.
  const redaction = redactPii(pack.studentAnswer)
  const normalized = normalizeAnswerText(redaction.text)

  const inputHash = hashGradingInput({
    answerHash: pack.gradingRef,
    rubricVersion: pack.rubricVersion,
    questionId: item.questionId,
    model: ctx.modelName,
  })

  // Chống gọi trùng. Cùng bài + cùng rubric + cùng model đã chấm rồi thì
  // không trả tiền lần nữa; kết quả cũ vẫn còn nguyên trong nhật ký.
  if (await usageExists(admin, inputHash)) {
    recordSkip(report, 'already_graded_same_input')
    return
  }

  const graded = await callProvider(ctx, pack, normalized.text)

  if (graded.error) {
    report.providerErrors += 1
  }

  const grade = graded.value
  report.estimatedCostUsd += grade?.estimatedCostUsd ?? 0

  // Ngưỡng confidence: lấy giá trị CHẶT HƠN giữa cấu hình toàn cục và cấu hình
  // riêng của câu hỏi. Mỗi nguồn đều được phép siết; không nguồn nào được nới.
  const confidenceMin = resolveConfidenceMin(ctx.flags.confidenceMin, pack.minConfidence)

  const decision = decideFinalization({
    flags: { ...ctx.flags, confidenceMin },
    ocr: await fetchOcrProvenance(admin, item.attemptId, item.questionId),
    grade,
    injectionSignals: normalized.injectionSignals,
    truncatedChars: normalized.truncatedChars,
    monthToDateCostUsd: report.monthToDateCostUsd + report.estimatedCostUsd,
    overrideGuard: ctx.overrideGuard,
  })

  let outcome: UsageOutcome =
    decision.action === 'auto_finalize'
      ? 'auto_finalized'
      : graded.error
        ? 'provider_error'
        : 'pending_review'

  if (decision.action === 'auto_finalize' && grade) {
    const finalized = await finalizeScore(ctx, pack, grade)
    if (!finalized.ok) {
      // RPC từ chối (bài đã được giáo viên duyệt trong lúc worker chạy, hash
      // lệch...). Ghi nhận là pending: không có điểm nào được công bố.
      outcome = 'pending_review'
      recordTrigger(report, 'validator_rejected')
      report.pendingReview += 1
    } else {
      report.autoFinalized += 1
    }
  } else {
    report.pendingReview += 1
    for (const trigger of decision.triggers) recordTrigger(report, trigger)
  }

  // Ghi nhật ký LUÔN LUÔN, kể cả khi provider lỗi. Đây là nguồn duy nhất tính
  // trần chi phí; bỏ qua nhánh lỗi thì trần đếm thiếu và không bao giờ chạm.
  await writeUsage(ctx, {
    inputHash,
    outcome,
    grade,
    triggers: decision.triggers,
  })
}

// ---------------------------------------------------------------------------
// Gọi provider, có retry
// ---------------------------------------------------------------------------

interface ProviderOutcome {
  value: GradeSuggestion | null
  error: boolean
}

async function callProvider(
  ctx: ProcessContext,
  pack: GradingPackage,
  studentAnswer: string
): Promise<ProviderOutcome> {
  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    try {
      const value = await ctx.provider.grade({
        gradingRef: pack.gradingRef,
        rubricVersion: pack.rubricVersion,
        questionId: ctx.item.questionId,
        question: pack.question,
        referenceAnswer: pack.referenceAnswer,
        studentAnswer,
        answerHash: pack.gradingRef,
        rubric: pack.rubric,
        maxScore: pack.maxScore,
      })
      return { value, error: false }
    } catch (error) {
      const retryable =
        error instanceof ProviderError &&
        error.retryable &&
        attempt < MAX_PROVIDER_ATTEMPTS

      if (!retryable) {
        // Chỉ log message đã được ProviderError viết sẵn cho an toàn; không log
        // error gốc vì nó có thể mang theo fragment của request.
        console.error(
          '[essay-ai worker] provider failed:',
          error instanceof ProviderError ? error.kind : 'unknown'
        )
        return { value: null, error: true }
      }

      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 8_000)
    }
  }

  return { value: null, error: true }
}

// ---------------------------------------------------------------------------
// Ghi điểm
// ---------------------------------------------------------------------------

async function finalizeScore(
  ctx: ProcessContext,
  pack: GradingPackage,
  grade: GradeSuggestion
): Promise<{ ok: boolean }> {
  const { error } = await ctx.admin.rpc('ai_finalize_essay_answer', {
    p_student_answer_id: ctx.item.studentAnswerId,
    p_answer_hash: pack.gradingRef,
    p_rubric_version: pack.rubricVersion,
    p_ai_score: grade.suggestion.suggested_score,
    p_ai_confidence: grade.suggestion.confidence,
    p_ai_feedback: grade.suggestion.overall_feedback_vi,
    p_ai_breakdown: grade.suggestion.criteria,
    p_ai_model: `${grade.provider}:${grade.model}`,
  })

  if (error) {
    // Mã lỗi của RPC (ANSWER_NOT_PENDING, RUBRIC_VERSION_MISMATCH...) không
    // chứa dữ liệu học sinh nên log được.
    console.error('[essay-ai worker] finalize rejected:', error.message)
    return { ok: false }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Truy vấn database
// ---------------------------------------------------------------------------

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!url || !serviceKey) {
    throw new ProviderError({
      provider: 'config',
      kind: 'config',
      message: 'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_KEY.',
      retryable: false,
    })
  }

  // service_role: bắt buộc, vì cả ba RPC chấm điểm đều đã REVOKE khỏi
  // authenticated một cách có chủ đích (migration 20260804).
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface QueueRow {
  id: string
  attempt_id: string
  question_id: string
  grading_rubric_version: number | null
}

async function fetchQueue(
  admin: SupabaseClient,
  limit: number,
  answerIds?: string[],
  attemptId?: string
): Promise<QueueItem[]> {
  let query = admin
    .from('student_answers')
    .select(
      'id, attempt_id, question_id, grading_rubric_version, ' +
        'exam_attempts!inner(status, exams!inner(exam_mode))'
    )
    .eq('question_type', 'essay')
    .eq('grading_status', 'pending_review')
    .not('text_answer', 'is', null)
    .neq('text_answer', '')
    .eq('exam_attempts.status', 'submitted')
    .eq('exam_attempts.exams.exam_mode', 'simulation')
    // Bài chờ lâu nhất được chấm trước. Sắp theo `answered_at` của chính
    // student_answers chứ không theo `exam_attempts.submit_time`: PostgREST
    // `order` trên bảng nhúng chỉ sắp thứ tự các hàng con bên trong mỗi hàng
    // cha, không sắp hàng cha — với embed to-one nó không có tác dụng gì.
    .order('answered_at', { ascending: true })
    .limit(limit)

  if (answerIds && answerIds.length > 0) {
    query = query.in('id', answerIds)
  }

  // Thu hẹp thêm, KHÔNG thay thế: các điều kiện an toàn ở trên vẫn áp dụng.
  if (attemptId) {
    query = query.eq('attempt_id', attemptId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[essay-ai worker] queue query failed:', error.message)
    return []
  }

  return ((data ?? []) as unknown as QueueRow[]).map((row) => ({
    studentAnswerId: row.id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    gradingRubricVersion: row.grading_rubric_version,
  }))
}

type PackageResult =
  | { ok: true; value: GradingPackage }
  | { ok: false; reason: SkipReason }

async function fetchPackage(
  admin: SupabaseClient,
  studentAnswerId: string
): Promise<PackageResult> {
  const { data, error } = await admin.rpc('get_essay_grading_package', {
    p_student_answer_id: studentAnswerId,
  })

  if (error) {
    const reason = mapPackageError(error.message ?? '')
    if (reason === 'package_unavailable') {
      console.error('[essay-ai worker] package fetch failed:', error.message)
    }
    return { ok: false, reason }
  }

  const parsed = parsePackage(data)
  return parsed ? { ok: true, value: parsed } : { ok: false, reason: 'package_unavailable' }
}

async function readMonthToDateCost(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc('essay_ai_month_to_date_cost')

  // -1 nghĩa là "không đọc được", để người gọi dừng batch. Không trả 0: 0 là
  // một giá trị hợp lệ ("tháng này chưa tốn gì") và sẽ mở khoá trần chi phí.
  if (error) return -1

  return typeof data === 'number' && Number.isFinite(data) && data >= 0 ? data : 0
}

async function usageExists(admin: SupabaseClient, inputHash: string): Promise<boolean> {
  const { data, error } = await admin
    .from('essay_ai_usage')
    .select('id')
    .eq('input_hash', inputHash)
    .maybeSingle()

  // Lỗi truy vấn -> coi như chưa có. UNIQUE (input_hash) vẫn chặn ở tầng
  // database nếu thực ra đã tồn tại.
  if (error) return false
  return data !== null
}

type UsageOutcome = 'auto_finalized' | 'pending_review' | 'provider_error' | 'skipped'

/**
 * Tra chất lượng nhận dạng của một bài làm.
 *
 * Nối bằng (attempt_id, question_id) chứ không bằng student_answer_id: lúc học
 * sinh bấm OCR thì bài chưa nộp, dòng `student_answers` chưa tồn tại, nên
 * snapshot không thể mang khoá đó.
 *
 * FAIL-CLOSED Ở MỌI NHÁNH KHÔNG CHẮC CHẮN. Chỉ có đúng MỘT đường dẫn tới
 * `typed` — nhánh duy nhất đi tiếp mà không kiểm chất lượng gì thêm — và nó đòi
 * bằng chứng dương: bài này CHƯA TỪNG có ảnh nào. Mọi thứ khác (lỗi truy vấn,
 * có ảnh nhưng không có bản ghi chất lượng dùng được, snapshot thiếu
 * `upload_id`) đều về `scanned_snapshot_missing`.
 *
 * Trả `typed` khi database lỗi nghĩa là biến một sự cố hạ tầng thành giấy phép
 * auto-chốt — đúng kiểu fail-open mà cả module này sinh ra để tránh.
 *
 * ĐỌC HẾT, KHÔNG LẤY DÒNG MỚI NHẤT. Một bài thường có nhiều lần chụp và
 * `ExamRunner` nối text của từng lần vào cùng một ô, nên chất lượng của bài
 * phải gộp từ tất cả (`aggregateOcrEvidence`). Bản trước dùng
 * `.order(created_at desc).limit(1)` và vì thế đánh giá cả bài bằng đúng tấm
 * ảnh cuối — một trang mờ chụp trước đó không cổng nào thấy.
 *
 * CHỈ TÍNH ẢNH CÒN SỐNG (từ `20260809`). Học sinh được xoá ảnh trong giờ thi, và
 * ảnh đã xoá không nằm trong bài được nộp — chấm chất lượng theo nó là chấm theo
 * thứ không tồn tại. Hai truy vấn riêng rồi lọc trong TypeScript thay vì một
 * embedded join của PostgREST: client Supabase của dự án không có generated
 * types nên kiểu trả về của join bị suy thành union có `GenericStringError`, và
 * lọc ở đây còn đọc được rõ hơn.
 *
 * Bài nộp TRƯỚC `20260807` không có snapshot nào và cũng không có dòng upload
 * nào, nên bị xếp là `typed`. Không có cách nào phân biệt chúng với bài gõ tay —
 * dữ liệu đó đã mất vĩnh viễn. Số lượng nhỏ và cố định; đừng dùng chúng làm bằng
 * chứng cho chất lượng nhận dạng.
 */
async function fetchOcrProvenance(
  admin: SupabaseClient,
  attemptId: string,
  questionId: string
): Promise<OcrProvenance> {
  // Ảnh trước: kết quả của nó quyết định nghĩa của "không có snapshot nào".
  const { data: uploadRows, error: uploadError } = await admin
    .from('essay_answer_uploads')
    .select('id, deleted_at')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)

  if (uploadError) {
    console.error('[essay-ai worker] upload lookup failed:', uploadError.message)
    return { kind: 'scanned_snapshot_missing' }
  }

  const uploads = uploadRows ?? []

  // Chưa từng có ảnh nào cho bài này -> học sinh gõ bằng bàn phím. Đây là bằng
  // chứng dương duy nhất cho phép đi nhánh `typed`.
  if (uploads.length === 0) return { kind: 'typed' }

  const liveUploadIds = new Set(
    uploads.filter((row) => row.deleted_at === null).map((row) => String(row.id))
  )

  const { data: snapshotRows, error: snapshotError } = await admin
    .from('essay_ocr_snapshots')
    .select('confidence, warning_kinds, warning_details, text_hash, provider, model, upload_id')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    // Tăng dần để `textHashes` giữ đúng thứ tự học sinh đã chụp, khớp với thứ
    // tự các đoạn được nối vào ô trả lời.
    .order('created_at', { ascending: true })

  if (snapshotError) {
    // Bảng chưa tồn tại (migration chưa nạp) cũng rơi vào đây. Chặn, không cho qua.
    console.error('[essay-ai worker] ocr snapshot lookup failed:', snapshotError.message)
    return { kind: 'scanned_snapshot_missing' }
  }

  // `upload_id` null = dòng ghi trước `20260809`: có một lần máy đọc mà không
  // biết nó đọc ảnh nào. Mất dấu vết, phải chặn — không được lọc bỏ im lặng, vì
  // lọc bỏ sẽ biến nó thành "bài không có snapshot" và đi tiếp.
  if ((snapshotRows ?? []).some((row) => row.upload_id === null)) {
    return { kind: 'scanned_snapshot_missing' }
  }

  const evidence = aggregateOcrEvidence(
    (snapshotRows ?? [])
      .filter((row) => liveUploadIds.has(String(row.upload_id)))
      .map((row) => ({
        confidence: Number(row.confidence),
        // Hai mảng song song, ghép lại theo chỉ số ở hàm gộp. `detail` thiếu thì
        // để rỗng — `kind` mới là thứ quyết định chặn, `detail` chỉ để người đọc.
        warningKinds: (row.warning_kinds ?? []) as OcrWarning['kind'][],
        warningDetails: (row.warning_details ?? []) as string[],
        textHash: row.text_hash,
        provider: row.provider,
        model: row.model,
      }))
  )

  // Có ảnh nhưng không có bản ghi chất lượng nào của ảnh CÒN SỐNG. Ví dụ: OCR đổ
  // ở mọi lần chụp, hoặc học sinh đã xoá đúng những ảnh đã OCR. Có một bước máy
  // đọc ở đây mà ta không kiểm chứng được -> hỏi người.
  if (!evidence) return { kind: 'scanned_snapshot_missing' }

  return { kind: 'scanned', evidence }
}

async function writeUsage(
  ctx: ProcessContext,
  params: {
    inputHash: string
    outcome: UsageOutcome
    grade: GradeSuggestion | null
    triggers: ReviewTrigger[]
  }
): Promise<void> {
  const { grade } = params

  const { error } = await ctx.admin.from('essay_ai_usage').insert({
    student_answer_id: ctx.item.studentAnswerId,
    attempt_id: ctx.item.attemptId,
    provider: grade?.provider ?? ctx.providerName,
    model: grade?.model ?? ctx.modelName,
    input_hash: params.inputHash,
    response_hash: grade?.responseHash ?? null,
    prompt_tokens: grade?.promptTokens ?? 0,
    completion_tokens: grade?.completionTokens ?? 0,
    estimated_cost_usd: grade?.estimatedCostUsd ?? 0,
    latency_ms: grade?.latencyMs ?? null,
    outcome: params.outcome,
    triggers: params.triggers,
    ai_score: grade?.suggestion.suggested_score ?? null,
    ai_confidence: grade?.suggestion.confidence ?? null,
  })

  if (error) {
    // Không throw: bài đã được xử lý xong, mất một dòng nhật ký không đáng để
    // hỏng cả batch. Nhưng phải báo, vì trần chi phí dựa vào bảng này.
    console.error('[essay-ai worker] usage insert failed:', error.message)
    ctx.report.warnings.push('Không ghi được một dòng nhật ký chi phí.')
  }
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

function recordTrigger(report: BatchReport, trigger: ReviewTrigger): void {
  report.triggerCounts[trigger] = (report.triggerCounts[trigger] ?? 0) + 1
}

function recordSkip(report: BatchReport, reason: SkipReason): void {
  report.skipped += 1
  report.skipReasons[reason] = (report.skipReasons[reason] ?? 0) + 1
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
