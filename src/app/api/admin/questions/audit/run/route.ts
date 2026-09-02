import { type NextRequest } from 'next/server'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'

/**
 * GET /api/admin/questions/audit/run
 *
 * Không có `runId`  -> danh sách lượt quét gần đây, để mở lại một lượt cũ.
 * Có `runId`        -> tiến trình + các dòng phát hiện của lượt đó.
 *
 * Trang quản trị KHÔNG tự query Supabase: hai bảng `question_audit_*` chỉ
 * `service_role` đọc được (migration 20260830), nên anon key sẽ nhận về lỗi
 * quyền chứ không phải dữ liệu. Đó là chủ ý — xem ghi chú phân quyền ở đầu file
 * migration.
 */

export const dynamic = 'force-dynamic'

/**
 * Số dòng trả về MỘT TRANG.
 *
 * Trước 2026-09-01 route trả tối đa 400 dòng một lần, mỗi dòng kèm nội dung câu
 * và toàn bộ phương án — rồi trang render tất cả bằng MathJax. Với một lượt quét
 * cả ngân hàng thì đó là vài trăm khối công thức dựng lại sau mỗi lô, và trình
 * duyệt đứng hình. Phân trang là bản sửa cho đúng chỗ đó.
 */
const PAGE_SIZE = 25

/** Trần cho phép đếm tổng hợp — chỉ đọc hai cột nên rẻ hơn nhiều. */
const MAX_SUMMARY_ROWS = 5000

const FINDING_COLUMNS =
  'id, question_id, question_type, nguon, ket_luan, khop_dap_an_dang_luu, ' +
  'loi_giai_tu_lam, dap_an_tu_lam, loi_de, mo_ta_dap_an, mo_ta_loi_giai, ' +
  'de_xuat_dap_an, de_xuat_explanation, de_xuat_solution, de_xuat_loi_giai, ' +
  'loi_latex, do_tin_cay, rule_issues, ghi_chu, affected_attempts, trang_thai, xu_ly_luc'

/**
 * Kết luận CÓ bản sửa để người duyệt bấm.
 *
 * `ca_hai_sai` nằm trong danh sách này từ 2026-08-30: v2 cho phép áp cả bản sửa
 * đáp án lẫn bản sửa lời giải trong một transaction. Trước đó nhóm này không đề
 * xuất gì và biến mất khỏi màn hình — đúng nhóm câu cần sửa nhất.
 *
 * `de_sai` cố ý KHÔNG nằm đây: nó có bộ lọc riêng vì hành động cần làm khác hẳn
 * (người soạn viết lại đề, không phải bấm một nút).
 */
const ACTIONABLE = ['dap_an_sai', 'loi_giai_sai', 'ca_hai_sai']

export async function GET(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard.ctx

  const runId = request.nextUrl.searchParams.get('runId')?.trim()

  if (!runId) {
    const { data } = await admin
      .from('question_audit_runs')
      .select(
        'id, scope_label, model, status, total_questions, processed, findings, errors, ' +
          'cost_usd, created_at, finished_at'
      )
      .order('created_at', { ascending: false })
      .limit(20)
    return json({ code: 'OK', runs: data ?? [] })
  }

  const { data: run, error: runError } = await admin
    .from('question_audit_runs')
    .select(
      'id, scope, scope_label, model, status, question_ids, next_index, total_questions, ' +
        'processed, skipped, findings, errors, prompt_tokens, completion_tokens, cost_usd, ' +
        'last_error, created_at, finished_at'
    )
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return json({ error: 'Không tìm thấy lượt quét.', code: 'RUN_NOT_FOUND' }, 404)
  }

  const filter = request.nextUrl.searchParams.get('filter') ?? 'can_sua'
  const rawOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0')
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0

  let query = admin
    .from('question_audit_findings')
    .select(FINDING_COLUMNS)
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
    // +1 để biết còn trang sau mà không phải chạy thêm một phép đếm.
    .range(offset, offset + PAGE_SIZE)

  if (filter === 'can_sua') query = query.in('ket_luan', ACTIONABLE)
  else if (filter === 'khong_kiem_duoc') query = query.eq('ket_luan', 'khong_kiem_duoc')
  else if (filter === 'de_sai') query = query.eq('ket_luan', 'de_sai')

  // Chồng lên bộ lọc kết luận, không thay thế nó: người duyệt vẫn đang xem một
  // nhóm, chỉ muốn giấu những dòng đã xử lý cho danh sách ngắn dần.
  if (request.nextUrl.searchParams.get('pending') === '1') {
    query = query.eq('trang_thai', 'cho_duyet')
  }

  const { data: findingRows } = await query
  // Chuỗi `select` ghép bằng `+` nên client không suy ra được kiểu dòng; ép về
  // hình dạng tối thiểu mà route này thật sự dùng.
  const fetched = (findingRows ?? []) as unknown as Array<Record<string, unknown>>
  const hasMore = fetched.length > PAGE_SIZE
  const findings = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched

  // Nội dung câu lấy riêng rồi ghép ở đây, không embed trong truy vấn trên:
  // `question_audit_findings` không có khoá ngoại tới `answers`, và một truy vấn
  // lồng ba tầng qua PostgREST khó đọc hơn nhiều so với hai lượt rõ ràng.
  const questionIds = [...new Set(findings.map((row) => String(row.question_id)))]
  const questions = new Map<string, unknown>()

  if (questionIds.length > 0) {
    const { data: questionRows } = await admin
      .from('questions')
      // Đủ để MỞ TRÌNH SỬA ngay tại đây, không phải nhảy sang trang khác:
      // dạng câu (quyết định hình dạng trình sửa) và cả bốn trường hình.
      .select(
        'id, content, question_type, explanation, solution, tikz_code, tikz_image_url, ' +
          'solution_tikz_image_url, solution_tikz_image_url_2, ' +
          'answers(id, content, is_correct, order_index)'
      )
      .in('id', questionIds)

    const typedRows = (questionRows ?? []) as unknown as Array<{
      id: string
      answers?: Array<{ order_index: number }> | null
    }>
    for (const row of typedRows) {
      if (Array.isArray(row.answers)) {
        row.answers.sort((left, right) => left.order_index - right.order_index)
      }
      questions.set(row.id, row)
    }
  }

  // Đếm theo kết luận trên TOÀN lượt, không phụ thuộc bộ lọc đang xem — nếu
  // không, người dùng lọc một nhánh rồi tưởng cả chương chỉ có bấy nhiêu.
  const { data: allConclusions } = await admin
    .from('question_audit_findings')
    .select('ket_luan, trang_thai')
    .eq('run_id', runId)
    .limit(MAX_SUMMARY_ROWS)

  const summary: Record<string, number> = {}
  let daXuLy = 0
  for (const row of allConclusions ?? []) {
    const key = String(row.ket_luan ?? 'khong_ro')
    summary[key] = (summary[key] ?? 0) + 1
    if (row.trang_thai !== 'cho_duyet') daXuLy++
  }

  return json({
    code: 'OK',
    run,
    summary,
    handled: daXuLy,
    filter,
    offset,
    pageSize: PAGE_SIZE,
    hasMore,
    findings: findings.map((row) => ({
      ...row,
      question: questions.get(String(row.question_id)) ?? null,
    })),
  })
}
