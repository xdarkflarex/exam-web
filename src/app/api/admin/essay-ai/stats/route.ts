import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  evaluateOverrideGuard,
  readOverrideThresholds,
} from '@/lib/essay-ai/override-guard'
import {
  computeOverrideStats,
  SERIOUS_ERROR_RATIO,
  type TeacherReviewRow,
} from '@/lib/essay-ai/override-stats'

/**
 * GET /api/admin/essay-ai/stats
 *
 * Số liệu vận hành của worker chấm tự luận: chi phí, lý do fail-closed, và
 * mức độ giáo viên phải chấm đè điểm AI.
 *
 * BẢO MẬT
 * - Chỉ `role === 'admin'` (so khớp chính xác, không phải `!== 'student'`).
 *   Kiểm qua session cookie; `/api/*` không đi qua middleware nên route tự làm.
 * - Đọc `essay_ai_usage` bằng service_role vì bảng đó không có policy nào —
 *   đúng chủ ý: nó chứa `ai_score` gắn với bài cụ thể.
 * - Phản hồi CHỈ chứa số tổng hợp. Không có `student_answer_id`, `attempt_id`,
 *   tên học sinh, hay nội dung bài. Một dashboard chi phí không phải chỗ để rò
 *   điểm của từng em ra ngoài.
 *
 * CHỈ SỐ QUAN TRỌNG NHẤT là `override`: tỷ lệ và độ lớn chênh lệch giữa điểm
 * AI và điểm giáo viên chốt sau đó. `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 8
 * lấy chính con số này làm điều kiện để được phép bật ESSAY_AI_AUTO_FINALIZE.
 *
 * Phần tính toán nằm ở `src/lib/essay-ai/override-stats.ts`, dùng CHUNG với
 * worker. Route này không được tự tính lại: worker lấy đúng con số đó để chặn
 * auto-chốt, nên hai bên lệch nhau nghĩa là dashboard nói một đằng và hệ thống
 * làm một nẻo.
 */

export const dynamic = 'force-dynamic'

/** Cửa sổ phân tích override, tính bằng ngày. */
const OVERRIDE_WINDOW_DAYS = 90
/** Trần số dòng đọc một lần — chặn truy vấn phình to khi dữ liệu tích luỹ. */
const MAX_ROWS = 5000

interface UsageRow {
  student_answer_id: string
  outcome: string
  triggers: string[] | null
  estimated_cost_usd: number | string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
  ai_score: number | string | null
  ai_confidence: number | string | null
  created_at: string
}

interface ReviewRow {
  student_answer_id: string
  final_score: number | string | null
  created_at: string
}

function toNumber(value: number | string | null | undefined): number | null {
  // numeric của Postgres về JS dưới dạng chuỗi khi vượt độ chính xác an toàn.
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return json({ error: 'Chưa đăng nhập.', code: 'UNAUTHENTICATED' }, 401)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return json({ error: 'Không có quyền.', code: 'FORBIDDEN' }, 403)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    return json({ error: 'Hệ thống chưa sẵn sàng.', code: 'SERVER_CONFIG_ERROR' }, 503)
  }
  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Trần chi phí đọc từ env chứ không từ database: đây là cấu hình runtime của
  // worker, và dashboard phải phản ánh đúng cái worker đang dùng.
  const rawCap = Number(process.env.ESSAY_AI_MONTHLY_COST_CAP)
  const monthlyCostCapUsd = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : null

  const { data: monthCostRaw, error: costError } = await admin.rpc(
    'essay_ai_month_to_date_cost'
  )
  const monthToDateCostUsd = costError ? null : toNumber(monthCostRaw as number | string)

  const since = new Date(Date.now() - OVERRIDE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  // Chuỗi select phải là literal một dòng: supabase-js suy kiểu từ chính chuỗi
  // đó, nối bằng `+` là mất kiểu và biến kết quả thành GenericStringError[].
  const { data: usageData, error: usageError } = await admin
    .from('essay_ai_usage')
    .select('student_answer_id, outcome, triggers, estimated_cost_usd, prompt_tokens, completion_tokens, latency_ms, ai_score, ai_confidence, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (usageError) {
    // Bảng chưa được áp migration là trường hợp thường gặp nhất ở đây. Nói rõ
    // thay vì trả 0 như thể pipeline chưa từng chạy.
    console.error('[essay-ai stats] usage query failed:', usageError.message)
    return json(
      {
        error: 'Không đọc được nhật ký chấm AI. Kiểm tra migration 20260805_essay_ai_usage.',
        code: 'USAGE_UNAVAILABLE',
      },
      503
    )
  }

  const usage = (usageData || []) as UsageRow[]

  const outcomes: Record<string, number> = {}
  const triggerCounts: Record<string, number> = {}
  let totalCostWindow = 0
  let promptTokens = 0
  let completionTokens = 0
  let latencySum = 0
  let latencyCount = 0
  let confidenceSum = 0
  let confidenceCount = 0
  let providerCalls = 0

  for (const row of usage) {
    outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1
    for (const trigger of row.triggers || []) {
      triggerCounts[trigger] = (triggerCounts[trigger] ?? 0) + 1
    }
    totalCostWindow += toNumber(row.estimated_cost_usd) ?? 0
    promptTokens += row.prompt_tokens ?? 0
    completionTokens += row.completion_tokens ?? 0

    const latency = row.latency_ms
    if (typeof latency === 'number' && Number.isFinite(latency)) {
      latencySum += latency
      latencyCount += 1
    }
    // `skipped` không gọi provider, nên không được tính vào chi phí trung bình
    // mỗi lượt gọi — nếu tính, con số bị pha loãng và trông rẻ hơn thực tế.
    if (row.outcome !== 'skipped') providerCalls += 1

    const confidence = toNumber(row.ai_confidence)
    if (confidence !== null) {
      confidenceSum += confidence
      confidenceCount += 1
    }
  }

  // --- Chấm đè: so điểm AI với điểm giáo viên chốt SAU đó ---------------------
  // Việc tính nằm ở `computeOverrideStats`, dùng chung với worker. Ở đây chỉ
  // đọc dữ liệu và chuyển kiểu.
  const scored = usage
    .map((row) => ({
      studentAnswerId: row.student_answer_id,
      aiScore: toNumber(row.ai_score),
      createdAt: row.created_at,
    }))
    .filter(
      (row): row is { studentAnswerId: string; aiScore: number; createdAt: string } =>
        row.aiScore !== null
    )
  const answerIds = Array.from(new Set(scored.map((row) => row.studentAnswerId)))

  let overrideStats = computeOverrideStats({
    usage: [],
    reviews: [],
    maxScores: new Map(),
  })

  if (answerIds.length > 0) {
    const { data: reviewData, error: reviewError } = await admin
      .from('essay_grading_reviews')
      .select('student_answer_id, final_score, created_at')
      .in('student_answer_id', answerIds)
      .eq('actor_kind', 'teacher')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)

    if (reviewError) {
      console.error('[essay-ai stats] review query failed:', reviewError.message)
      overrideStats = { ...overrideStats, partial: true }
    } else {
      const reviews: TeacherReviewRow[] = []
      for (const row of (reviewData || []) as ReviewRow[]) {
        const finalScore = toNumber(row.final_score)
        if (finalScore === null) continue
        reviews.push({
          studentAnswerId: row.student_answer_id,
          finalScore,
          createdAt: row.created_at,
        })
      }

      // Điểm tối đa của từng câu để tính "lệch quá 20% thang điểm". Không lấy
      // từ essay_ai_usage vì bảng đó cố ý không lưu max_score.
      const maxScores = new Map<string, number>()
      const { data: answerData, error: answerError } = await admin
        .from('student_answers')
        .select('id, max_score')
        .in('id', answerIds.slice(0, MAX_ROWS))

      if (answerError) {
        console.error('[essay-ai stats] max_score query failed:', answerError.message)
      } else {
        for (const row of answerData || []) {
          const value = toNumber(row.max_score as number | string)
          if (value !== null && value > 0) maxScores.set(row.id as string, value)
        }
      }

      overrideStats = computeOverrideStats({
        usage: scored,
        reviews,
        maxScores,
        sourceIncomplete: answerError !== null,
      })
    }
  }

  // Cùng cổng chặn worker dùng, để dashboard nói đúng trạng thái hệ thống đang
  // thực thi thay vì để người vận hành tự suy từ mấy con số thô.
  const thresholds = readOverrideThresholds()
  const guard = evaluateOverrideGuard(overrideStats, thresholds)

  const rawConfidenceMin = Number(process.env.ESSAY_AI_CONFIDENCE_MIN)
  const flags = {
    enabled: process.env.ESSAY_AI_ENABLED === 'true',
    autoFinalize: process.env.ESSAY_AI_AUTO_FINALIZE === 'true',
    monthlyCostCapUsd,
    confidenceMin:
      Number.isFinite(rawConfidenceMin) && rawConfidenceMin > 0 ? rawConfidenceMin : null,
  }

  return json({
    code: 'OK',
    windowDays: OVERRIDE_WINDOW_DAYS,
    truncated: usage.length >= MAX_ROWS,
    flags,
    cost: {
      monthToDateUsd: monthToDateCostUsd,
      monthToDateUnavailable: monthToDateCostUsd === null,
      capUsd: monthlyCostCapUsd,
      windowTotalUsd: totalCostWindow,
      avgPerCallUsd: providerCalls > 0 ? totalCostWindow / providerCalls : 0,
      promptTokens,
      completionTokens,
    },
    volume: {
      rows: usage.length,
      providerCalls,
      outcomes,
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
      avgConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : null,
    },
    triggers: triggerCounts,
    override: {
      compared: overrideStats.compared,
      changed: overrideStats.changed,
      serious: overrideStats.serious,
      avgAbsDiff: overrideStats.avgAbsDiff,
      partial: overrideStats.partial,
      seriousErrorRatio: SERIOUS_ERROR_RATIO,
    },
    // Trạng thái kill-switch tự động. `blocked: true` nghĩa là dù
    // ESSAY_AI_AUTO_FINALIZE có bật, worker vẫn không tự chốt bài nào.
    overrideGuard: {
      blocked: guard.blocked,
      reason: guard.blocked ? guard.reason : null,
      detail: guard.blocked ? guard.detail : null,
      thresholds,
    },
  })
}

export function POST() {
  return json({ error: 'Phương thức không được hỗ trợ.', code: 'METHOD_NOT_ALLOWED' }, 405)
}
