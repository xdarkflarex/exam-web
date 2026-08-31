/**
 * Worker rà soát: xử lý MỘT lô nhỏ của một lượt quét rồi trả tiến trình về.
 *
 * VÌ SAO CHIA LÔ THAY VÌ MỘT REQUEST DÀI
 * Kế hoạch mục 6 nói "đừng gọi vài trăm lượt API trong một request HTTP của
 * trình duyệt", và mọi nền tảng đều có trần thời gian cho một request. Nhưng
 * chủ dự án cần NHÌN THẤY tiến trình, mà một job chạy nền trên serverless thì
 * không có gì bảo đảm nó sống sót sau khi response đã trả.
 *
 * Cách ở đây: mỗi lời gọi `/step` xử lý vài câu rồi ghi con trỏ (`next_index`)
 * xuống database. Trang quản trị gọi lại cho tới khi xong. Đóng tab giữa chừng
 * thì lượt quét dừng đúng chỗ đó và mở lại là chạy tiếp — con trỏ nằm ở
 * database chứ không ở bộ nhớ tiến trình.
 *
 * FAIL-CLOSED: mọi lỗi của MỘT câu chỉ làm hỏng câu đó. Một câu hỏng không được
 * làm hỏng cả lượt, và không có nhánh nào biến lỗi thành một đề xuất sửa.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ProviderError } from '@/lib/essay-ai/contracts'
import type { QuestionAuditFlags } from './audit-config.ts'
import { hasApplicableFix } from './audit-contracts.ts'
import {
  auditQuestionByRules,
  shouldSkipAiAudit,
  type AuditQuestionInput,
} from './audit-rules.ts'
import { createDeepSeekAuditProvider, type QuestionAuditProvider } from './audit-provider.ts'

/** Dạng câu công cụ này nhận. `essay` chấm theo rubric, không có đáp án đánh dấu. */
type AuditableType = 'multiple_choice' | 'true_false' | 'short_answer'

export interface RunProgress {
  runId: string
  status: 'dang_chay' | 'xong' | 'loi' | 'da_huy'
  total: number
  processed: number
  skipped: number
  findings: number
  errors: number
  costUsd: number
  promptTokens: number
  completionTokens: number
  done: boolean
  lastError: string | null
}

interface RunRow {
  id: string
  status: RunProgress['status']
  question_ids: string[]
  next_index: number
  total_questions: number
  processed: number
  skipped: number
  findings: number
  errors: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number | string
  last_error: string | null
}

interface QuestionRow {
  id: string
  content: string
  question_type: string
  explanation: string | null
  solution: string | null
  tikz_code: string | null
  tikz_image_url: string | null
  answers: Array<{ id: string; content: string; is_correct: boolean; order_index: number }> | null
}

const RUN_COLUMNS =
  'id, status, question_ids, next_index, total_questions, processed, skipped, findings, errors, prompt_tokens, completion_tokens, cost_usd, last_error'

/** Message lỗi vào database bị cắt: nó hiện trên trang và đi vào log. */
const MAX_NOTE_LENGTH = 400

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function progressOf(run: RunRow): RunProgress {
  return {
    runId: run.id,
    status: run.status,
    total: run.total_questions,
    processed: run.processed,
    skipped: run.skipped,
    findings: run.findings,
    errors: run.errors,
    costUsd: toNumber(run.cost_usd),
    promptTokens: run.prompt_tokens,
    completionTokens: run.completion_tokens,
    done: run.status !== 'dang_chay',
    lastError: run.last_error,
  }
}

/** Chi phí đã dùng trong tháng dương lịch hiện tại, gộp mọi lượt quét. */
async function monthToDateCost(admin: SupabaseClient): Promise<number> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data } = await admin
    .from('question_audit_runs')
    .select('cost_usd')
    .gte('created_at', monthStart)
  return (data ?? []).reduce((sum, row) => sum + toNumber(row.cost_usd as number | string), 0)
}

async function affectedAttempts(admin: SupabaseClient, questionId: string): Promise<number> {
  const { data, error } = await admin.rpc('question_audit_affected_attempts', {
    p_question_id: questionId,
  })
  // Không đếm được thì trả 0 KÈM ghi chú ở tầng trên chứ không đoán một số lớn:
  // số này chỉ để cảnh báo người duyệt, và RPC áp dụng sẽ kiểm lại lần nữa
  // trong cùng transaction trước khi ghi.
  if (error) return 0
  return typeof data === 'number' ? data : 0
}

export async function runAuditStep(
  admin: SupabaseClient,
  flags: QuestionAuditFlags,
  runId: string,
  provider: QuestionAuditProvider = createDeepSeekAuditProvider()
): Promise<RunProgress> {
  const { data: runRaw, error: runError } = await admin
    .from('question_audit_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .single()

  if (runError || !runRaw) throw new Error('Không tìm thấy lượt quét.')
  const run = runRaw as unknown as RunRow

  if (run.status !== 'dang_chay') return progressOf(run)

  // Trần chi phí kiểm TRƯỚC mỗi lô, không phải một lần lúc bắt đầu: một lượt
  // quét 300 câu có thể tự nó vượt trần giữa chừng.
  if (flags.monthlyCostCapUsd > 0) {
    const spent = await monthToDateCost(admin)
    if (spent >= flags.monthlyCostCapUsd) {
      const stopped = {
        ...run,
        status: 'loi' as const,
        last_error: `Đã chạm trần chi phí tháng (${spent.toFixed(4)}/${flags.monthlyCostCapUsd} USD).`,
      }
      await admin
        .from('question_audit_runs')
        .update({
          status: stopped.status,
          last_error: stopped.last_error,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
      return progressOf(stopped)
    }
  }

  const ids = run.question_ids.slice(run.next_index, run.next_index + flags.batchSize)

  if (ids.length === 0) {
    await admin
      .from('question_audit_runs')
      .update({
        status: 'xong',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return progressOf({ ...run, status: 'xong' })
  }

  const { data: questionRows } = await admin
    .from('questions')
    .select(
      'id, content, question_type, explanation, solution, tikz_code, tikz_image_url, ' +
        'answers(id, content, is_correct, order_index)'
    )
    .in('id', ids)

  const byId = new Map<string, QuestionRow>(
    ((questionRows ?? []) as unknown as QuestionRow[]).map((row) => [row.id, row])
  )

  let processed = 0
  let skipped = 0
  let findings = 0
  let errors = 0
  let promptTokens = 0
  let completionTokens = 0
  let costUsd = 0
  let lastError: string | null = run.last_error

  for (const questionId of ids) {
    processed++
    const row = byId.get(questionId)

    if (!row) {
      // Câu bị xoá sau khi lượt quét đã chụp danh sách. Không phải lỗi của công
      // cụ, nhưng phải đếm để tổng vẫn khớp.
      errors++
      lastError = 'Có câu đã bị xoá sau khi bắt đầu lượt quét.'
      continue
    }

    const answers = (row.answers ?? [])
      .slice()
      .sort((left, right) => left.order_index - right.order_index)

    const input: AuditQuestionInput = {
      id: row.id,
      content: row.content,
      question_type: row.question_type as AuditQuestionInput['question_type'],
      explanation: row.explanation,
      solution: row.solution,
      tikz_code: row.tikz_code,
      tikz_image_url: row.tikz_image_url,
      answers,
    }

    const ruleIssues = auditQuestionByRules(input)

    // `essay` không thuộc phạm vi công cụ; lọc ở truy vấn rồi nhưng kiểm lại ở
    // đây để một thay đổi ở tầng truy vấn không âm thầm đẩy câu tự luận vào model.
    const unsupportedType = !['multiple_choice', 'true_false', 'short_answer'].includes(
      row.question_type
    )
    const gate = shouldSkipAiAudit(ruleIssues)

    if (unsupportedType || gate.skip) {
      skipped++
      const reason = unsupportedType
        ? `Dạng câu "${row.question_type}" không thuộc phạm vi công cụ.`
        : `Lớp luật chặn: ${gate.reasons.join(', ')}. Sửa những lỗi này trước rồi quét lại.`
      await admin.from('question_audit_findings').upsert(
        {
          run_id: runId,
          question_id: row.id,
          question_type: row.question_type,
          nguon: 'luat',
          ket_luan: 'khong_kiem_duoc',
          rule_issues: ruleIssues,
          ghi_chu: reason.slice(0, MAX_NOTE_LENGTH),
          affected_attempts: 0,
        },
        { onConflict: 'run_id,question_id' }
      )
      if (ruleIssues.length > 0) findings++
      continue
    }

    try {
      const call = await provider.audit({
        questionId: row.id,
        questionType: row.question_type as AuditableType,
        content: row.content,
        tikzCode: row.tikz_code,
        explanation: row.explanation,
        solution: row.solution,
        answers: answers.map((answer) => ({
          id: answer.id,
          content: answer.content,
          is_correct: answer.is_correct,
        })),
      })

      promptTokens += call.promptTokens
      completionTokens += call.completionTokens
      costUsd += call.estimatedCostUsd

      const verdict = call.result
      const suggestsChange = hasApplicableFix(verdict)

      await admin.from('question_audit_findings').upsert(
        {
          run_id: runId,
          question_id: row.id,
          question_type: row.question_type,
          nguon: 'ai',
          ket_luan: verdict.ket_luan,
          // v2 không còn cờ "khớp" riêng: nó chính là phủ định của
          // `danh_gia_dap_an.co_loi`. Vẫn ghi để lượt quét cũ và mới đọc chung
          // được một cột.
          khop_dap_an_dang_luu: !verdict.danh_gia_dap_an.co_loi,
          loi_giai_tu_lam: verdict.loi_giai_tu_lam,
          dap_an_tu_lam: verdict.dap_an_tu_lam,

          loi_de: verdict.danh_gia_de.co_loi ? verdict.danh_gia_de.mo_ta : null,
          mo_ta_dap_an: verdict.danh_gia_dap_an.co_loi ? verdict.danh_gia_dap_an.mo_ta : null,
          mo_ta_loi_giai: verdict.danh_gia_loi_giai.co_loi ? verdict.danh_gia_loi_giai.mo_ta : null,

          de_xuat_dap_an: verdict.danh_gia_dap_an.dap_an_dung_moi,
          de_xuat_explanation: verdict.danh_gia_loi_giai.explanation_moi,
          de_xuat_solution: verdict.danh_gia_loi_giai.solution_moi,

          loi_latex: verdict.loi_latex,
          do_tin_cay: verdict.do_tin_cay,
          rule_issues: ruleIssues,
          ghi_chu: verdict.ly_do_khong_kiem_duoc,
          // Chỉ đếm attempt khi thật sự có bản sửa để áp — mỗi lần đếm là một
          // lượt gọi database, và với câu "dung" thì con số đó không dùng vào đâu.
          affected_attempts: suggestsChange ? await affectedAttempts(admin, row.id) : 0,
        },
        { onConflict: 'run_id,question_id' }
      )

      if (verdict.ket_luan !== 'dung') findings++
    } catch (caught) {
      errors++
      const message =
        caught instanceof ProviderError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'Lỗi không xác định.'
      lastError = message.slice(0, MAX_NOTE_LENGTH)

      // Ghi lại thành một dòng "không kiểm được" thay vì bỏ im: người soạn phải
      // thấy câu nào chưa được kiểm, nếu không họ sẽ tưởng cả chương đã sạch.
      await admin.from('question_audit_findings').upsert(
        {
          run_id: runId,
          question_id: row.id,
          question_type: row.question_type,
          nguon: 'ai',
          ket_luan: 'khong_kiem_duoc',
          rule_issues: ruleIssues,
          ghi_chu: lastError,
          affected_attempts: 0,
        },
        { onConflict: 'run_id,question_id' }
      )
    }
  }

  const nextIndex = run.next_index + ids.length
  const finished = nextIndex >= run.question_ids.length

  const updated: RunRow = {
    ...run,
    next_index: nextIndex,
    status: finished ? 'xong' : 'dang_chay',
    processed: run.processed + processed,
    skipped: run.skipped + skipped,
    findings: run.findings + findings,
    errors: run.errors + errors,
    prompt_tokens: run.prompt_tokens + promptTokens,
    completion_tokens: run.completion_tokens + completionTokens,
    cost_usd: toNumber(run.cost_usd) + costUsd,
    last_error: lastError,
  }

  await admin
    .from('question_audit_runs')
    .update({
      next_index: updated.next_index,
      status: updated.status,
      processed: updated.processed,
      skipped: updated.skipped,
      findings: updated.findings,
      errors: updated.errors,
      prompt_tokens: updated.prompt_tokens,
      completion_tokens: updated.completion_tokens,
      cost_usd: updated.cost_usd,
      last_error: updated.last_error,
      updated_at: new Date().toISOString(),
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq('id', runId)

  return progressOf(updated)
}

export async function readRunProgress(
  admin: SupabaseClient,
  runId: string
): Promise<RunProgress | null> {
  const { data } = await admin
    .from('question_audit_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .single()
  return data ? progressOf(data as unknown as RunRow) : null
}
