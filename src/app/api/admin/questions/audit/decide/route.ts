import { type NextRequest } from 'next/server'
import { json, requireAuditAdmin } from '@/lib/questions/audit-server'

/**
 * POST /api/admin/questions/audit/decide
 *
 * Áp dụng hoặc bỏ qua MỘT đề xuất. Đây là đường ghi duy nhất của công cụ, và nó
 * chỉ chạy khi người duyệt bấm.
 *
 * `ap_dung` không tự UPDATE gì ở đây: nó gọi `apply_question_audit_finding`.
 * Ba lý do việc ghi phải nằm trong database (chi tiết ở đầu migration 20260830):
 * câu Đúng/Sai cần đổi bốn dòng cùng lúc, hai tab cùng bấm phải bị chặn, và số
 * attempt bị ảnh hưởng phải được kiểm lại trong cùng transaction với lệnh ghi.
 *
 * `expectedAttempts` là con số người duyệt ĐÃ NHÌN THẤY trên màn hình. RPC so nó
 * với thực tế và huỷ nếu lệch — giữa lúc nhìn và lúc bấm có thể có thêm học sinh
 * nộp bài, và khi đó quyết định họ vừa cân nhắc không còn dựa trên sự thật nữa.
 */

export const dynamic = 'force-dynamic'

interface DecideBody {
  findingId?: unknown
  action?: unknown
  expectedAttempts?: unknown
}

/** Mã lỗi của RPC -> câu tiếng Việt cho người duyệt đọc. */
const RPC_ERRORS: ReadonlyArray<readonly [string, string]> = [
  ['FINDING_NOT_FOUND', 'Không tìm thấy đề xuất này.'],
  ['FINDING_ALREADY_HANDLED', 'Đề xuất này đã được xử lý rồi.'],
  [
    'ATTEMPTS_CHANGED',
    'Số bài đã nộp có câu này vừa thay đổi. Tải lại trang rồi cân nhắc lại trước khi áp dụng.',
  ],
  [
    'SHORT_ANSWER_MULTIPLE_ROWS',
    'Câu trả lời ngắn này có nhiều dòng đáp án (nhiều dạng viết được chấp nhận). Sửa tay để không xoá mất các dạng còn lại.',
  ],
  ['ANSWER_ID_NOT_IN_QUESTION', 'Đề xuất trỏ tới phương án không thuộc câu này.'],
  ['MULTIPLE_CHOICE_NEEDS_EXACTLY_ONE_ANSWER', 'Trắc nghiệm một lựa chọn phải có đúng một đáp án đúng.'],
  ['NOTHING_TO_APPLY', 'Kết luận này không có gì để áp dụng.'],
  ['NO_ANSWER_FIX', 'Đề xuất thiếu đáp án mới.'],
  ['NO_SOLUTION_FIX', 'Đề xuất thiếu lời giải mới.'],
]

function translateRpcError(message: string): string {
  for (const [code, text] of RPC_ERRORS) {
    if (message.includes(code)) return text
  }
  return 'Không áp dụng được đề xuất.'
}

export async function POST(request: NextRequest) {
  const guard = await requireAuditAdmin()
  if (!guard.ok) return guard.response
  const { admin, userId } = guard.ctx

  let body: DecideBody
  try {
    body = (await request.json()) as DecideBody
  } catch {
    return json({ error: 'Body không phải JSON.', code: 'BAD_REQUEST' }, 400)
  }

  const findingId = typeof body.findingId === 'string' ? body.findingId.trim() : ''
  const action = body.action
  if (!findingId || (action !== 'ap_dung' && action !== 'bo_qua')) {
    return json({ error: 'Thiếu findingId hoặc action.', code: 'BAD_REQUEST' }, 400)
  }

  if (action === 'bo_qua') {
    const { error } = await admin
      .from('question_audit_findings')
      .update({ trang_thai: 'da_bo_qua', xu_ly_boi: userId, xu_ly_luc: new Date().toISOString() })
      .eq('id', findingId)
      .eq('trang_thai', 'cho_duyet')
    if (error) return json({ error: 'Không ghi được trạng thái.', code: 'UPDATE_FAILED' }, 500)
    return json({ code: 'OK', trangThai: 'da_bo_qua' })
  }

  const expectedAttempts = Number(body.expectedAttempts)
  if (!Number.isInteger(expectedAttempts) || expectedAttempts < 0) {
    return json(
      { error: 'Thiếu số bài đã nộp bị ảnh hưởng.', code: 'ATTEMPTS_REQUIRED' },
      400
    )
  }

  const { data, error } = await admin.rpc('apply_question_audit_finding', {
    p_finding_id: findingId,
    p_actor: userId,
    p_expected_attempts: expectedAttempts,
  })

  if (error) {
    const message = error.message ?? ''

    /*
      `ATTEMPTS_CHANGED` mà không trả về số MỚI là một ngõ cụt vĩnh viễn.

      Trang gửi lên con số đã lưu trong dòng finding (chụp lúc quét). RPC so với
      số thực tế. Lệch thì từ chối — đúng, vì người duyệt phải cân nhắc lại. Nhưng
      con số đã lưu KHÔNG BAO GIỜ tự đổi, nên tải lại trang rồi bấm lại vẫn gửi
      đúng số cũ và vẫn lệch. Dòng đó không bao giờ áp dụng được nữa.

      Cách thoát: đọc lại số hiện tại, cập nhật vào dòng finding, và trả về cho
      trang để người duyệt thấy con số THẬT rồi quyết định lần nữa. Cổng an toàn
      vẫn còn — họ vẫn phải bấm lại sau khi nhìn số mới — chỉ không còn kẹt.
    */
    if (message.includes('ATTEMPTS_CHANGED')) {
      const { data: row } = await admin
        .from('question_audit_findings')
        .select('question_id')
        .eq('id', findingId)
        .single()

      let current: number | null = null
      if (row?.question_id) {
        const { data: fresh } = await admin.rpc('question_audit_affected_attempts', {
          p_question_id: row.question_id,
        })
        current = typeof fresh === 'number' ? fresh : null
        if (current !== null) {
          await admin
            .from('question_audit_findings')
            .update({ affected_attempts: current })
            .eq('id', findingId)
        }
      }

      return json(
        {
          error:
            current === null
              ? 'Số bài đã nộp có câu này vừa thay đổi. Tải lại trang rồi cân nhắc lại.'
              : `Số bài đã nộp có câu này giờ là ${current} (lúc quét hiển thị ${expectedAttempts}). Đã cập nhật — bấm Áp dụng lần nữa nếu vẫn muốn đổi.`,
          code: 'ATTEMPTS_CHANGED',
          currentAttempts: current,
          detail: message,
        },
        409
      )
    }

    return json(
      { error: translateRpcError(message), code: 'APPLY_FAILED', detail: message },
      409
    )
  }

  return json({ code: 'OK', trangThai: 'da_ap_dung', result: data })
}
