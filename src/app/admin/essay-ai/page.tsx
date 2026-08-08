'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin'

/**
 * Bảng theo dõi worker chấm tự luận bằng AI.
 *
 * Trang này tồn tại để trả lời đúng một câu hỏi: **đã đủ bằng chứng để bật
 * ESSAY_AI_AUTO_FINALIZE chưa?** Vì thế chỉ số chấm đè (giáo viên phải sửa
 * điểm AI bao nhiêu lần, lệch bao nhiêu) được đặt ở vị trí nổi nhất, còn chi
 * phí — thứ dễ nhìn và dễ gây yên tâm sai — nằm dưới.
 *
 * Toàn bộ số liệu lấy từ `/api/admin/essay-ai/stats`. Trang không tự query
 * Supabase vì `essay_ai_usage` chỉ service_role đọc được: client anon key sẽ
 * nhận về 0 dòng và bảng sẽ trông như pipeline chưa từng chạy.
 */

interface StatsResponse {
  code: string
  windowDays: number
  truncated: boolean
  flags: {
    enabled: boolean
    autoFinalize: boolean
    monthlyCostCapUsd: number | null
    confidenceMin: number | null
  }
  cost: {
    monthToDateUsd: number | null
    monthToDateUnavailable: boolean
    capUsd: number | null
    windowTotalUsd: number
    avgPerCallUsd: number
    promptTokens: number
    completionTokens: number
  }
  volume: {
    rows: number
    providerCalls: number
    outcomes: Record<string, number>
    avgLatencyMs: number | null
    avgConfidence: number | null
  }
  triggers: Record<string, number>
  override: {
    compared: number
    changed: number
    serious: number
    avgAbsDiff: number | null
    partial: boolean
    seriousErrorRatio: number
  }
  /** Kill-switch tự động theo mức chấm đè. */
  overrideGuard: {
    blocked: boolean
    reason: string | null
    detail: string | null
    thresholds: {
      minCompared: number
      maxChangedRate: number
      maxSeriousRate: number
    }
  }
}

/** Nhãn tiếng Việt cho `essay_ai_usage.outcome`. */
const OUTCOME_LABELS: Record<string, string> = {
  auto_finalized: 'AI tự chốt điểm',
  pending_review: 'Chuyển về giáo viên',
  provider_error: 'Dịch vụ AI lỗi',
  skipped: 'Bỏ qua, không gọi AI',
}

/**
 * Nhãn cho `ReviewTrigger`. Giữ khớp với `TRIGGER_EXPLANATIONS` trong
 * `src/lib/essay-ai/auto-finalize.ts` — nếu thêm trigger mới ở đó, thêm cả ở
 * đây, nếu không bảng sẽ hiện tên máy.
 */
const TRIGGER_LABELS: Record<string, string> = {
  ai_disabled: 'Pipeline AI đang tắt',
  auto_finalize_disabled: 'Chế độ AI tự chốt đang tắt',
  low_ocr_confidence: 'Nhận dạng ảnh độ tin cậy thấp',
  ocr_warning: 'Nhận dạng ảnh có cảnh báo',
  math_region_uncertain: 'Có công thức toán không đọc chắc',
  low_grading_confidence: 'Gợi ý chấm độ tin cậy thấp',
  validator_rejected: 'Kết quả AI không qua kiểm tra',
  provider_error: 'Dịch vụ AI gặp lỗi',
  cost_cap_reached: 'Đã chạm trần chi phí tháng',
  suspected_prompt_injection: 'Bài làm có dấu hiệu điều khiển AI',
  model_requested_review: 'AI tự đề nghị người xem lại',
  override_rate_exceeded: 'Mức chấm đè vượt ngưỡng cho phép',
}

function money(value: number | null): string {
  if (value === null) return '—'
  // 4 chữ số thập phân: mỗi bài chấm tốn cỡ phần nghìn đô, làm tròn 2 số là ra 0.00.
  return `$${value.toFixed(4)}`
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${((part / whole) * 100).toFixed(1)}%`
}

export default function AdminEssayAiPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/essay-ai/stats', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.error || 'Không tải được số liệu.')
        setStats(null)
        return
      }
      setStats(body as StatsResponse)
    } catch {
      setError('Không gọi được API số liệu. Kiểm tra kết nối mạng.')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const outcomeEntries = stats
    ? Object.entries(stats.volume.outcomes).sort((a, b) => b[1] - a[1])
    : []
  const triggerEntries = stats
    ? Object.entries(stats.triggers).sort((a, b) => b[1] - a[1])
    : []

  const capUsed =
    stats && stats.cost.capUsd && stats.cost.monthToDateUsd !== null
      ? Math.min(100, (stats.cost.monthToDateUsd / stats.cost.capUsd) * 100)
      : null

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminHeader
        title="Chấm tự luận bằng AI"
        subtitle="Chi phí, lý do chuyển về người, và mức độ giáo viên phải chấm đè"
      />

      <div className="mt-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {stats
              ? `Số liệu ${stats.windowDays} ngày gần nhất · ${stats.volume.rows} lượt ghi nhận`
              : 'Đang tải…'}
          </p>
          <button
            type="button"
            onClick={() => void fetchStats()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Tải lại
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && !stats && (
          <div className="flex items-center justify-center rounded-xl border border-slate-300 bg-slate-200 p-12 dark:border-slate-700 dark:bg-slate-800">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        )}

        {stats && (
          <>
            {/* Cờ điều khiển. Đặt trên cùng vì mọi con số dưới đây chỉ có nghĩa
                khi biết hai cờ này đang ở trạng thái nào. */}
            <section className="rounded-xl border border-slate-300 bg-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Cờ điều khiển đang áp dụng
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <FlagPill
                  label="ESSAY_AI_ENABLED"
                  on={stats.flags.enabled}
                  onText="Đang bật — AI có gọi provider"
                  offText="Đang tắt — không gọi provider, không tốn tiền"
                />
                <FlagPill
                  label="ESSAY_AI_AUTO_FINALIZE"
                  on={stats.flags.autoFinalize}
                  onText="ĐANG BẬT — điểm máy hiện ra với học sinh khi chưa ai kiểm tra"
                  offText="Đang tắt — mọi bài vẫn về hàng chờ giáo viên"
                  dangerWhenOn
                />
                <div className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    ESSAY_AI_MONTHLY_COST_CAP
                  </p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                    {stats.flags.monthlyCostCapUsd !== null
                      ? `$${stats.flags.monthlyCostCapUsd}`
                      : 'Chưa đặt trần'}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    ESSAY_AI_CONFIDENCE_MIN
                  </p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                    {stats.flags.confidenceMin !== null
                      ? stats.flags.confidenceMin
                      : 'Dùng mặc định'}
                  </p>
                </div>
              </div>

              {stats.flags.autoFinalize && (
                <div className="mt-3 flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
                  <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <p>
                    Hệ thống <strong>chưa lưu kết quả OCR</strong> nên ba cổng chặn theo chất lượng
                    nhận dạng ảnh (độ tin cậy thấp, cảnh báo, công thức toán không đọc chắc) không
                    hoạt động. Với môn Toán, OCR đọc nhầm một dấu âm là đủ đảo ngược kết luận mà
                    không ai phát hiện. Hãy tắt cờ này lại cho tới khi có bảng lưu OCR snapshot và
                    đã chạy benchmark.
                  </p>
                </div>
              )}
            </section>

            {/* Chấm đè — chỉ số quan trọng nhất, đặt ngay dưới cờ. */}
            <section className="rounded-xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/20">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-100">
                <UserCheck className="h-4 w-4" />
                Giáo viên chấm đè điểm AI
              </h2>
              <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
                So điểm AI đưa ra với điểm giáo viên chốt <strong>sau đó</strong>. Đây là thước đo
                duy nhất cho biết AI chấm đúng hay không — độ tin cậy AI tự báo không nói được điều
                đó.
              </p>

              {/* Trạng thái kill-switch tự động. Đặt trên các con số vì nó là
                  KẾT LUẬN, còn các con số bên dưới là bằng chứng. */}
              <div
                className={`mt-3 flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  stats.overrideGuard.blocked
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                }`}
              >
                {stats.overrideGuard.blocked ? (
                  <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                )}
                <div>
                  <p className="font-semibold">
                    {stats.overrideGuard.blocked
                      ? 'Cổng chặn tự động đang CHẶN auto-chốt'
                      : 'Cổng chặn tự động đã đạt ngưỡng'}
                  </p>
                  <p className="mt-1">
                    {stats.overrideGuard.blocked ? (
                      <>
                        {stats.overrideGuard.detail} Dù{' '}
                        <span className="font-mono text-xs">ESSAY_AI_AUTO_FINALIZE</span> có bật,
                        worker vẫn để mọi bài cho giáo viên duyệt.
                      </>
                    ) : (
                      <>
                        Số liệu chấm đè nằm trong ngưỡng, nên cổng này không chặn.{' '}
                        <strong>Đây không phải giấy phép bật auto-chốt</strong> — hai điều kiện
                        khác (lưu OCR snapshot và benchmark trên fixture thật) vẫn phải đạt.
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    Ngưỡng đang áp: tối thiểu {stats.overrideGuard.thresholds.minCompared} bài đối
                    chiếu · tỷ lệ sửa điểm ≤{' '}
                    {(stats.overrideGuard.thresholds.maxChangedRate * 100).toFixed(0)}% · sai
                    nghiêm trọng ≤{' '}
                    {(stats.overrideGuard.thresholds.maxSeriousRate * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {stats.override.compared === 0 ? (
                <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  Chưa có bài nào vừa được AI chấm vừa được giáo viên duyệt lại, nên chưa tính được
                  chỉ số này. <strong>Chưa đủ bằng chứng để bật auto-chốt.</strong>
                </p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricBox
                    label="Số bài so được"
                    value={String(stats.override.compared)}
                    hint="AI chấm rồi giáo viên duyệt lại"
                  />
                  <MetricBox
                    label="Tỷ lệ bị sửa điểm"
                    value={percent(stats.override.changed, stats.override.compared)}
                    hint={`${stats.override.changed} bài giáo viên đổi điểm`}
                  />
                  <MetricBox
                    label="Lệch trung bình"
                    value={
                      stats.override.avgAbsDiff !== null
                        ? `${stats.override.avgAbsDiff.toFixed(2)} điểm`
                        : '—'
                    }
                    hint="Trị tuyệt đối, tính trên mọi bài so được"
                  />
                  <MetricBox
                    label="Sai nghiêm trọng"
                    value={percent(stats.override.serious, stats.override.compared)}
                    hint={`${stats.override.serious} bài lệch quá ${(stats.override.seriousErrorRatio * 100).toFixed(0)}% thang điểm`}
                    danger={stats.override.serious > 0}
                  />
                </div>
              )}

              {stats.override.partial && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Một phần dữ liệu đối chiếu không đọc được, nên các con số trên đang thiếu. Đừng
                  coi đây là kết quả đầy đủ.
                </p>
              )}
            </section>

            {/* Chi phí. */}
            <section className="rounded-xl border border-slate-300 bg-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <DollarSign className="h-4 w-4" />
                Chi phí
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricBox
                  label="Tháng này"
                  value={money(stats.cost.monthToDateUsd)}
                  hint={
                    stats.cost.monthToDateUnavailable
                      ? 'Không đọc được — kiểm tra hàm essay_ai_month_to_date_cost'
                      : stats.cost.capUsd !== null
                        ? `Trần $${stats.cost.capUsd}${capUsed !== null ? ` · đã dùng ${capUsed.toFixed(0)}%` : ''}`
                        : 'Chưa đặt trần chi phí'
                  }
                  danger={capUsed !== null && capUsed >= 80}
                />
                <MetricBox
                  label={`Tổng ${stats.windowDays} ngày`}
                  value={money(stats.cost.windowTotalUsd)}
                  hint={`${stats.volume.providerCalls} lượt gọi provider`}
                />
                <MetricBox
                  label="Trung bình mỗi lượt gọi"
                  value={money(stats.cost.avgPerCallUsd)}
                  hint="Không tính các lượt bỏ qua"
                />
                <MetricBox
                  label="Token đã dùng"
                  value={`${(stats.cost.promptTokens + stats.cost.completionTokens).toLocaleString('vi-VN')}`}
                  hint={`vào ${stats.cost.promptTokens.toLocaleString('vi-VN')} · ra ${stats.cost.completionTokens.toLocaleString('vi-VN')}`}
                />
              </div>
            </section>

            {/* Kết quả và lý do. */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-300 bg-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Sparkles className="h-4 w-4" />
                  Kết quả mỗi lượt chấm
                </h2>
                {outcomeEntries.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Chưa có lượt chấm nào trong khoảng thời gian này.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {outcomeEntries.map(([key, count]) => (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm dark:bg-slate-900"
                      >
                        <span className="text-slate-700 dark:text-slate-200">
                          {OUTCOME_LABELS[key] || key}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {count} · {percent(count, stats.volume.rows)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricBox
                    label="Độ trễ trung bình"
                    value={
                      stats.volume.avgLatencyMs !== null
                        ? `${(stats.volume.avgLatencyMs / 1000).toFixed(1)}s`
                        : '—'
                    }
                    hint="Thời gian provider trả lời"
                    icon={Clock}
                  />
                  <MetricBox
                    label="Độ tin cậy AI tự báo"
                    value={
                      stats.volume.avgConfidence !== null
                        ? `${(stats.volume.avgConfidence * 100).toFixed(0)}%`
                        : '—'
                    }
                    hint="Chỉ tham khảo — không phải tỷ lệ chấm đúng"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-300 bg-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <AlertTriangle className="h-4 w-4" />
                  Lý do chuyển về giáo viên
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Một bài có thể có nhiều lý do, nên tổng ở đây lớn hơn số bài.
                </p>
                {triggerEntries.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Chưa ghi nhận lý do nào.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {triggerEntries.map(([key, count]) => (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm dark:bg-slate-900"
                      >
                        <span className="text-slate-700 dark:text-slate-200">
                          {TRIGGER_LABELS[key] || key}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {stats.truncated && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                Đã chạm trần số dòng đọc một lần, nên các con số chỉ tính trên phần dữ liệu mới
                nhất. Thu hẹp khoảng thời gian nếu cần số chính xác.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FlagPill({
  label,
  on,
  onText,
  offText,
  dangerWhenOn = false,
}: {
  label: string
  on: boolean
  onText: string
  offText: string
  /** Với cờ auto-chốt, "bật" là trạng thái cần cảnh báo chứ không phải trạng thái tốt. */
  dangerWhenOn?: boolean
}) {
  const tone = on
    ? dangerWhenOn
      ? 'border-rose-300 text-rose-900 dark:border-rose-800 dark:text-rose-100'
      : 'border-emerald-300 text-emerald-900 dark:border-emerald-800 dark:text-emerald-100'
    : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'

  return (
    <div className={`rounded-lg border bg-white p-3 text-sm dark:bg-slate-900 ${tone}`}>
      <p className="font-mono text-xs opacity-70">{label}</p>
      <p className="mt-1 font-semibold">{on ? 'true' : 'false'}</p>
      <p className="mt-1 text-xs opacity-80">{on ? onText : offText}</p>
    </div>
  )
}

function MetricBox({
  label,
  value,
  hint,
  danger = false,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  danger?: boolean
  icon?: typeof Clock
}) {
  return (
    <div className="rounded-lg bg-white p-3 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${
          danger
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}
