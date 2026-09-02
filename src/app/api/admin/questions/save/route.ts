import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import { json, requireAdmin } from '@/lib/questions/audit-server'
import { auditQuestionByRules, type AuditQuestionInput } from '@/lib/questions/audit-rules'

/**
 * POST /api/admin/questions/save
 *
 * Sửa một câu hỏi từ khu quản trị.
 *
 * ĐÂY LÀ MỘT NGOẠI LỆ CÓ CHỦ ĐÍCH. Trước file này, exam-web KHÔNG có đường ghi
 * nào vào `questions`/`answers` ngoài `apply_question_audit_finding` — mọi câu
 * hỏi sinh ra ở question-bank. Chủ dự án quyết định 2026-09-02 mở đường sửa
 * trực tiếp, vì công cụ rà soát tìm ra lỗi mà không tự áp được (đề sai, câu trả
 * lời ngắn nhiều dạng đáp án, câu tự luận) và bắt sang app khác để sửa từng câu
 * là quá chậm.
 *
 * BỐN CHỐT CHẶN
 *
 * 1. Lưu ra câu HỎNG bị từ chối. Dùng lại `auditQuestionByRules` — chính lớp
 *    luật của công cụ rà soát — nên trình sửa không thể tạo ra đúng loại lỗi mà
 *    công cụ kia sinh ra để dọn.
 * 2. Đổi thứ ảnh hưởng tới chấm điểm trên câu ĐÃ CÓ BÀI NỘP thì phải xác nhận
 *    bằng con số. Giống hệt ràng buộc của `apply_question_audit_finding`; một
 *    trình sửa tự do mà bỏ qua chốt này là mở lại đúng cái cửa vừa khoá.
 * 3. Id phương án CŨ không bao giờ bị sinh lại. `student_answers.selected_answer`
 *    lưu id phương án, nên đổi id là làm mọi bài đã chấm không tra ngược được nữa.
 * 4. Không đổi `question_type`. Đổi dạng câu là đổi cách chấm, và bài đã nộp
 *    được chấm theo dạng cũ. Muốn đổi dạng thì tạo câu mới.
 *
 * HẠN CHẾ ĐÃ BIẾT: PostgREST không cho gói nhiều lệnh vào một transaction. Toàn
 * bộ phương án được ghi bằng MỘT lệnh upsert — nên bất biến "đúng một đáp án
 * đúng" không bao giờ ở trạng thái dở dang. Lệnh xoá phương án thừa và lệnh cập
 * nhật `questions` là hai lệnh riêng sau đó; hỏng ở đó để lại dữ liệu cũ chứ
 * không để lại dữ liệu mâu thuẫn.
 */

export const dynamic = 'force-dynamic'

interface AnswerInput {
  /** Có id = phương án cũ, phải giữ nguyên id. Không có = phương án mới. */
  id?: unknown
  content?: unknown
  is_correct?: unknown
}

interface SaveBody {
  id?: unknown
  content?: unknown
  explanation?: unknown
  solution?: unknown
  answers?: unknown
  /** Số bài đã nộp mà người sửa ĐÃ NHÌN THẤY. Bắt buộc khi đụng tới chấm điểm. */
  confirmAttempts?: unknown
}

/**
 * Mã lỗi chặn hẳn việc lưu.
 *
 * Cố ý KHÔNG gồm `latex_vo`, `rac_ocr`, `noi_dung_nghi_cut`: đó là lỗi chất
 * lượng, và chặn lưu vì chúng sẽ khiến người soạn không sửa nổi một câu đang
 * hỏng sẵn — họ vào đây để sửa dần, không phải để sửa xong tất cả một lúc.
 * Những mã đó vẫn trả về dạng cảnh báo.
 *
 * Danh sách dưới đây chỉ gồm lỗi CẤU TRÚC: câu lưu ra sẽ chấm sai hoặc không
 * chấm được.
 */
const BLOCKING = new Set([
  'thieu_noi_dung',
  'khong_co_dap_an_dung',
  'nhieu_dap_an_dung',
  'true_false_khong_du_4_y',
  'thieu_phuong_an',
  'phuong_an_rong',
  'phuong_an_trung_nhau',
])

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard.ctx

  let body: SaveBody
  try {
    body = (await request.json()) as SaveBody
  } catch {
    return json({ error: 'Body không phải JSON.', code: 'BAD_REQUEST' }, 400)
  }

  const questionId = typeof body.id === 'string' ? body.id.trim() : ''
  if (!questionId) return json({ error: 'Thiếu mã câu hỏi.', code: 'BAD_REQUEST' }, 400)

  // --- Đọc trạng thái hiện tại ----------------------------------------------
  const { data: existing, error: readError } = await admin
    .from('questions')
    .select('id, question_type, content, explanation, solution, tikz_code, tikz_image_url, answers(id, content, is_correct, order_index)')
    .eq('id', questionId)
    .single()

  if (readError || !existing) {
    return json({ error: 'Không tìm thấy câu hỏi.', code: 'NOT_FOUND' }, 404)
  }

  const current = existing as unknown as {
    id: string
    question_type: string
    content: string
    explanation: string | null
    solution: string | null
    tikz_code: string | null
    tikz_image_url: string | null
    answers: Array<{ id: string; content: string; is_correct: boolean; order_index: number }> | null
  }
  const currentAnswers = current.answers ?? []
  const currentById = new Map(currentAnswers.map((answer) => [answer.id, answer]))

  // --- Chuẩn hoá phương án gửi lên ------------------------------------------
  const rawAnswers = Array.isArray(body.answers) ? (body.answers as AnswerInput[]) : []
  const answers = rawAnswers.map((answer, index) => {
    const id = typeof answer.id === 'string' && currentById.has(answer.id) ? answer.id : null
    return {
      // Id cũ giữ nguyên tuyệt đối (chốt 3). Id lạ do client bịa cũng bị coi là
      // phương án mới, không được nhận vào để ghi đè một dòng khác.
      id: id ?? randomUUID(),
      isNew: id === null,
      question_id: questionId,
      content: asString(answer.content),
      is_correct: answer.is_correct === true,
      order_index: index,
    }
  })

  // --- Chốt 1: không lưu ra câu hỏng ----------------------------------------
  const candidate: AuditQuestionInput = {
    id: questionId,
    content: asString(body.content),
    question_type: current.question_type as AuditQuestionInput['question_type'],
    explanation: asString(body.explanation) || null,
    solution: asString(body.solution) || null,
    tikz_code: current.tikz_code,
    tikz_image_url: current.tikz_image_url,
    answers: answers.map((answer) => ({
      id: answer.id,
      content: answer.content,
      is_correct: answer.is_correct,
    })),
  }
  const issues = auditQuestionByRules(candidate)
  const blocking = issues.filter((issue) => issue.severity === 'loi' && BLOCKING.has(issue.code))
  if (blocking.length > 0) {
    return json(
      {
        error: 'Chưa lưu được — câu hỏi còn lỗi cấu trúc.',
        code: 'INVALID_QUESTION',
        issues: blocking,
      },
      400
    )
  }

  // --- Chốt 2: câu đã có bài nộp --------------------------------------------
  // Chỉ hỏi xác nhận khi thay đổi ĐỘNG TỚI CHẤM ĐIỂM. Sửa mỗi lời giải hay câu
  // chữ trong đề thì không làm bài đã chấm sai đi, nên bắt xác nhận ở đó chỉ tạo
  // thói quen bấm bừa qua cảnh báo.
  const removedIds = currentAnswers
    .filter((answer) => !answers.some((item) => item.id === answer.id))
    .map((answer) => answer.id)

  const gradingChanged =
    removedIds.length > 0 ||
    answers.some((answer) => {
      const before = currentById.get(answer.id)
      if (!before) return true
      return before.is_correct !== answer.is_correct || before.content !== answer.content
    })

  let affected = 0
  if (gradingChanged) {
    const { data: count } = await admin.rpc('question_audit_affected_attempts', {
      p_question_id: questionId,
    })
    affected = typeof count === 'number' ? count : 0

    if (affected > 0 && body.confirmAttempts !== affected) {
      return json(
        {
          error: `Câu này có ${affected} bài đã nộp. Đổi đáp án làm bài đã chấm và bài chấm sau không cùng một chuẩn — xác nhận để tiếp tục.`,
          code: 'NEEDS_ATTEMPT_CONFIRM',
          affectedAttempts: affected,
        },
        409
      )
    }
  }

  // --- Ghi ------------------------------------------------------------------
  // Upsert TOÀN BỘ phương án trong một lệnh: bất biến "đúng một đáp án đúng"
  // không bao giờ ở trạng thái dở dang giữa hai lệnh.
  if (answers.length > 0) {
    const { error: upsertError } = await admin.from('answers').upsert(
      answers.map((answer) => ({
        id: answer.id,
        question_id: answer.question_id,
        content: answer.content,
        is_correct: answer.is_correct,
        order_index: answer.order_index,
      })),
      { onConflict: 'id' }
    )
    if (upsertError) {
      return json({ error: 'Không ghi được phương án.', code: 'WRITE_FAILED', detail: upsertError.message }, 500)
    }
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await admin.from('answers').delete().in('id', removedIds)
    if (deleteError) {
      return json(
        {
          error: 'Đã lưu phương án mới nhưng chưa xoá được phương án cũ. Mở lại câu để kiểm.',
          code: 'PARTIAL_WRITE',
          detail: deleteError.message,
        },
        500
      )
    }
  }

  const { error: questionError } = await admin
    .from('questions')
    .update({
      content: asString(body.content),
      explanation: asString(body.explanation) || null,
      solution: asString(body.solution) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId)

  if (questionError) {
    return json(
      {
        error: 'Đã lưu phương án nhưng chưa lưu được nội dung câu. Mở lại câu để kiểm.',
        code: 'PARTIAL_WRITE',
        detail: questionError.message,
      },
      500
    )
  }

  return json({
    code: 'OK',
    affectedAttempts: affected,
    /** Lỗi chất lượng còn lại — hiện để người soạn biết, không chặn lưu. */
    warnings: issues.filter((issue) => !BLOCKING.has(issue.code)),
  })
}
