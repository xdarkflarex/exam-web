import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  QUESTION_AUDIT_SCHEMA,
  combineTiers,
  hasApplicableFix,
  parseQuestionAuditResult,
  type AuditExpectation,
  type QuestionAuditResult,
} from './audit-contracts.ts'

const EXPECTED_MC: AuditExpectation = {
  questionId: 'q-1',
  questionType: 'multiple_choice',
  answerIds: ['a', 'b', 'c', 'd'],
  hasExplanation: true,
  hasSolution: true,
}

const OK_DE = { co_loi: false, mo_ta: null }
const OK_DAP_AN = { co_loi: false, mo_ta: null, dap_an_dung_moi: null }
const OK_LOI_GIAI = { co_loi: false, mo_ta: null, explanation_moi: null, solution_moi: null }

/**
 * Khuôn kết quả hợp lệ. Thứ tự khoá ở đây có ý nghĩa: phần model tự giải phải
 * đứng trước ba phần đánh giá (chống mồi, kế hoạch mục 5).
 */
function validResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: QUESTION_AUDIT_SCHEMA,
    question_id: 'q-1',
    loi_giai_tu_lam: 'Số trung bình bằng tổng chia cho số phần tử, ra $3$.',
    dap_an_tu_lam: '$3$',
    khong_kiem_duoc: false,
    ly_do_khong_kiem_duoc: null,
    danh_gia_de: OK_DE,
    danh_gia_dap_an: OK_DAP_AN,
    danh_gia_loi_giai: OK_LOI_GIAI,
    loi_latex: [],
    do_tin_cay: 0.9,
    ...overrides,
  }
}

function expectReject(raw: string | Record<string, unknown>, pattern: RegExp): void {
  assert.throws(() => parseQuestionAuditResult(raw, EXPECTED_MC), pattern)
}

test('câu sạch: ba phần đều không lỗi thì kết luận là "dung"', () => {
  const result = parseQuestionAuditResult(validResult(), EXPECTED_MC)
  assert.equal(result.ket_luan, 'dung')
  assert.equal(hasApplicableFix(result), false)
})

test('đọc được JSON bọc trong hàng rào markdown', () => {
  const raw = '```json\n' + JSON.stringify(validResult()) + '\n```'
  assert.equal(parseQuestionAuditResult(raw, EXPECTED_MC).ket_luan, 'dung')
})

test('không có JSON thì từ chối', () => {
  expectReject('Xin lỗi, tôi không chắc về câu này.', /Không tìm thấy JSON/)
})

test('sai schema thì từ chối', () => {
  expectReject(validResult({ schema: 'question-audit-result.v1' }), /Sai schema/)
})

test('trỏ sang câu khác thì từ chối, không sửa lại', () => {
  expectReject(validResult({ question_id: 'q-999' }), /không thuộc đúng câu hỏi/)
})

test('thiếu trường hoặc sai kiểu thì từ chối', () => {
  const missing = validResult()
  delete missing.do_tin_cay
  expectReject(missing, /do_tin_cay/)

  expectReject(validResult({ khong_kiem_duoc: 'false' }), /phải là boolean/)
  expectReject(validResult({ loi_latex: 'thiếu ngoặc' }), /danh sách chuỗi/)
  expectReject(validResult({ do_tin_cay: 1.5 }), /0\.\.1/)
  expectReject(validResult({ danh_gia_dap_an: null }), /danh_gia_dap_an phải là object/)
})

test('nhìn đáp án đang lưu trước khi tự giải thì từ chối', () => {
  // Cùng dữ liệu, chỉ khác THỨ TỰ khoá — model đã đánh giá trước khi tự giải.
  const primed = {
    schema: QUESTION_AUDIT_SCHEMA,
    question_id: 'q-1',
    danh_gia_de: OK_DE,
    danh_gia_dap_an: OK_DAP_AN,
    danh_gia_loi_giai: OK_LOI_GIAI,
    loi_giai_tu_lam: 'Số trung bình bằng $3$.',
    dap_an_tu_lam: '$3$',
    khong_kiem_duoc: false,
    ly_do_khong_kiem_duoc: null,
    loi_latex: [],
    do_tin_cay: 0.9,
  }
  expectReject(primed, /Sai thứ tự trường/)
})

// --- Ba phần độc lập -------------------------------------------------------

test('chỉ đáp án sai', () => {
  const result = parseQuestionAuditResult(
    validResult({
      danh_gia_dap_an: { co_loi: true, mo_ta: 'Đánh dấu B nhưng đúng là C.', dap_an_dung_moi: 'c' },
    }),
    EXPECTED_MC
  )
  assert.equal(result.ket_luan, 'dap_an_sai')
  assert.equal(result.danh_gia_dap_an.dap_an_dung_moi, 'c')
  assert.equal(hasApplicableFix(result), true)
})

test('chỉ lời giải sai, và biết viết lại ĐÚNG Ô nào', () => {
  const result = parseQuestionAuditResult(
    validResult({
      danh_gia_loi_giai: {
        co_loi: true,
        mo_ta: 'Bước cộng sai dấu.',
        explanation_moi: null,
        solution_moi: 'Cộng năm giá trị rồi chia cho $5$.',
      },
    }),
    EXPECTED_MC
  )
  assert.equal(result.ket_luan, 'loi_giai_sai')
  assert.equal(result.danh_gia_loi_giai.explanation_moi, null)
  assert.equal(result.danh_gia_loi_giai.solution_moi, 'Cộng năm giá trị rồi chia cho $5$.')
})

test('SAI CẢ HAI thì vẫn phải có đủ hai bản sửa — đây là lỗi v1 đã nuốt mất', () => {
  const result = parseQuestionAuditResult(
    validResult({
      danh_gia_dap_an: { co_loi: true, mo_ta: 'Đánh dấu sai.', dap_an_dung_moi: 'c' },
      danh_gia_loi_giai: {
        co_loi: true,
        mo_ta: 'Lời giải dẫn tới đáp án cũ, cũng sai.',
        explanation_moi: 'Giải thích viết lại.',
        solution_moi: null,
      },
    }),
    EXPECTED_MC
  )
  assert.equal(result.ket_luan, 'ca_hai_sai')
  assert.equal(result.danh_gia_dap_an.dap_an_dung_moi, 'c')
  assert.equal(result.danh_gia_loi_giai.explanation_moi, 'Giải thích viết lại.')
  assert.equal(hasApplicableFix(result), true)
})

test('đề bài sai thì không được đề xuất sửa gì', () => {
  const result = parseQuestionAuditResult(
    validResult({
      danh_gia_de: { co_loi: true, mo_ta: 'Dữ kiện mâu thuẫn: mẫu có 5 số nhưng liệt kê 4.' },
    }),
    EXPECTED_MC
  )
  assert.equal(result.ket_luan, 'de_sai')
  assert.equal(hasApplicableFix(result), false)

  expectReject(
    validResult({
      danh_gia_de: { co_loi: true, mo_ta: 'Thiếu dữ kiện.' },
      danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: 'c' },
    }),
    /Đề sai hoặc không kiểm được thì không được đề xuất đáp án mới/
  )
})

test('báo có lỗi thì bắt buộc nói sai ở đâu', () => {
  expectReject(
    validResult({ danh_gia_de: { co_loi: true, mo_ta: null } }),
    /Báo đề sai thì phải nói sai ở đâu/
  )
  expectReject(
    validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: null, dap_an_dung_moi: 'c' } }),
    /Báo đáp án sai thì phải nói sai ở đâu/
  )
})

test('báo đáp án sai mà không kèm đáp án mới thì từ chối', () => {
  expectReject(
    validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: null } }),
    /phải kèm đáp án đúng mới/
  )
})

test('báo lời giải sai mà không viết lại ô nào thì từ chối', () => {
  expectReject(
    validResult({
      danh_gia_loi_giai: {
        co_loi: true,
        mo_ta: 'Sai bước 2.',
        explanation_moi: null,
        solution_moi: null,
      },
    }),
    /phải kèm bản viết lại của ít nhất một ô/
  )
})

test('không báo lỗi mà vẫn kèm bản sửa thì từ chối', () => {
  expectReject(
    validResult({ danh_gia_dap_an: { co_loi: false, mo_ta: null, dap_an_dung_moi: 'c' } }),
    /Không báo đáp án sai thì không được đề xuất đáp án mới/
  )
  expectReject(
    validResult({
      danh_gia_loi_giai: {
        co_loi: false,
        mo_ta: null,
        explanation_moi: 'viết lại',
        solution_moi: null,
      },
    }),
    /Không báo lời giải sai thì không được đề xuất lời giải mới/
  )
})

test('không được điền vào ô lời giải đang trống — đó là viết mới, không phải sửa lỗi', () => {
  const onlyExplanation: AuditExpectation = { ...EXPECTED_MC, hasSolution: false }
  assert.throws(
    () =>
      parseQuestionAuditResult(
        validResult({
          danh_gia_loi_giai: {
            co_loi: true,
            mo_ta: 'Thiếu lời giải.',
            explanation_moi: null,
            solution_moi: 'Tôi viết hộ một lời giải.',
          },
        }),
        onlyExplanation
      ),
    /đang trống — công cụ chỉ sửa lời giải sai, không viết mới/
  )
})

// --- Không kiểm được -------------------------------------------------------

test('"khong_kiem_duoc" phải kèm lý do và không được đề xuất gì', () => {
  const result = parseQuestionAuditResult(
    validResult({
      loi_giai_tu_lam: '',
      dap_an_tu_lam: '',
      khong_kiem_duoc: true,
      ly_do_khong_kiem_duoc: 'Câu có hình nhưng không gửi kèm mã TikZ.',
    }),
    EXPECTED_MC
  )
  assert.equal(result.ket_luan, 'khong_kiem_duoc')
  assert.equal(hasApplicableFix(result), false)

  expectReject(
    validResult({ khong_kiem_duoc: true, ly_do_khong_kiem_duoc: null }),
    /phải nói vì sao/
  )
})

test('kết luận khác "khong_kiem_duoc" mà không tự giải thì từ chối', () => {
  expectReject(
    validResult({ loi_giai_tu_lam: '   ', dap_an_tu_lam: '' }),
    /phải tự giải trước khi kết luận/
  )
})

// --- Hình dạng đáp án đề xuất ----------------------------------------------

test('đáp án đề xuất phải là phương án có thật của đúng câu đó', () => {
  expectReject(
    validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: 'z' } }),
    /không phải một phương án của câu này/
  )
})

test('câu Đúng/Sai: đề xuất là danh sách id các ý phải mang Đúng', () => {
  const expected: AuditExpectation = {
    questionId: 'q-1',
    questionType: 'true_false',
    answerIds: ['y1', 'y2', 'y3', 'y4'],
    hasExplanation: true,
    hasSolution: false,
  }
  const wrongAnswer = (fix: string) =>
    validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: fix } })

  assert.equal(
    parseQuestionAuditResult(wrongAnswer('y1, y3'), expected).danh_gia_dap_an.dap_an_dung_moi,
    'y1, y3'
  )
  // Chuỗi rỗng có nghĩa thật: cả bốn ý đều Sai.
  assert.equal(
    parseQuestionAuditResult(wrongAnswer(''), expected).danh_gia_dap_an.dap_an_dung_moi,
    ''
  )
  assert.throws(() => parseQuestionAuditResult(wrongAnswer('y1, y9'), expected), /không thuộc câu này/)
  assert.throws(() => parseQuestionAuditResult(wrongAnswer('y1, y1'), expected), /id lặp lại/)
})

test('câu trả lời ngắn: đáp án đề xuất là giá trị, không phải id', () => {
  const expected: AuditExpectation = {
    questionId: 'q-1',
    questionType: 'short_answer',
    answerIds: ['a'],
    hasExplanation: true,
    hasSolution: true,
  }
  const result = parseQuestionAuditResult(
    validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: '3,5' } }),
    expected
  )
  assert.equal(result.danh_gia_dap_an.dap_an_dung_moi, '3,5')
})

test('công cụ không nhận câu tự luận', () => {
  assert.throws(
    () =>
      parseQuestionAuditResult(
        validResult({ danh_gia_dap_an: { co_loi: true, mo_ta: 'Sai.', dap_an_dung_moi: 'a' } }),
        {
          questionId: 'q-1',
          questionType: 'essay',
          answerIds: ['a'],
          hasExplanation: true,
          hasSolution: true,
        }
      ),
    /không nằm trong phạm vi/
  )
})

// --- Gộp hai tầng model ----------------------------------------------------

function resultWith(
  conclusion: QuestionAuditResult['ket_luan'],
  answerFix: string | null
): QuestionAuditResult {
  return {
    schema: QUESTION_AUDIT_SCHEMA,
    question_id: 'q-1',
    loi_giai_tu_lam: 'x',
    dap_an_tu_lam: 'x',
    khong_kiem_duoc: false,
    ly_do_khong_kiem_duoc: null,
    danh_gia_de: { co_loi: false, mo_ta: null },
    danh_gia_dap_an: {
      co_loi: answerFix !== null,
      mo_ta: answerFix !== null ? 'Sai.' : null,
      dap_an_dung_moi: answerFix,
    },
    danh_gia_loi_giai: { co_loi: false, mo_ta: null, explanation_moi: null, solution_moi: null },
    loi_latex: [],
    do_tin_cay: 0.8,
    ket_luan: conclusion,
  }
}

test('một tầng thì không bao giờ được áp dụng hàng loạt', () => {
  assert.deepEqual(combineTiers(resultWith('dap_an_sai', 'c'), null), {
    agreement: 'mot_tang',
    canBulkApply: false,
  })
})

test('hai tầng cùng nói đáp án sai và cùng bản sửa thì gần chắc', () => {
  assert.deepEqual(combineTiers(resultWith('dap_an_sai', 'c'), resultWith('dap_an_sai', 'c')), {
    agreement: 'gan_chac',
    canBulkApply: true,
  })
})

test('cùng kết luận nhưng khác bản sửa vẫn là bất đồng', () => {
  assert.deepEqual(combineTiers(resultWith('dap_an_sai', 'c'), resultWith('dap_an_sai', 'd')), {
    agreement: 'hai_model_khong_dong_y',
    canBulkApply: false,
  })
})

test('hai tầng khác kết luận thì không cho áp dụng hàng loạt', () => {
  assert.deepEqual(combineTiers(resultWith('dap_an_sai', 'c'), resultWith('dung', null)), {
    agreement: 'hai_model_khong_dong_y',
    canBulkApply: false,
  })
})

test('hai tầng cùng nói câu đúng thì đồng ý nhưng không có gì để áp dụng', () => {
  assert.deepEqual(combineTiers(resultWith('dung', null), resultWith('dung', null)), {
    agreement: 'hai_tang_dong_y',
    canBulkApply: false,
  })
})
