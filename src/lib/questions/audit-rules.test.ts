import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  auditQuestionByRules,
  auditQuestionsByRules,
  shouldSkipAiAudit,
  type AuditQuestionInput,
  type AuditRuleCode,
} from './audit-rules.ts'

/*
  Dữ liệu thử mô phỏng đúng những gì đợt nhập Thống kê bằng OCR đã sinh ra: công
  thức chưa đóng, phương án trùng, câu Đúng/Sai rụng mất một ý. Không dùng dữ
  liệu học sinh thật (AGENTS.md mục 5).
*/

function question(overrides: Partial<AuditQuestionInput> = {}): AuditQuestionInput {
  return {
    id: 'q1',
    content: 'Cho mẫu số liệu $1; 2; 3; 4; 5$. Tính số trung bình của mẫu.',
    question_type: 'multiple_choice',
    answers: [
      { id: 'a', content: '$2$', is_correct: false },
      { id: 'b', content: '$3$', is_correct: true },
      { id: 'c', content: '$4$', is_correct: false },
      { id: 'd', content: '$5$', is_correct: false },
    ],
    ...overrides,
  }
}

function codes(issues: ReturnType<typeof auditQuestionByRules>): AuditRuleCode[] {
  return issues.map((issue) => issue.code)
}

test('câu sạch thì không sinh issue nào', () => {
  assert.deepEqual(auditQuestionByRules(question()), [])
})

test('không phương án nào được đánh dấu đúng', () => {
  const issues = auditQuestionByRules(
    question({
      answers: [
        { id: 'a', content: '$2$', is_correct: false },
        { id: 'b', content: '$3$', is_correct: false },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['khong_co_dap_an_dung'])
  assert.equal(issues[0].severity, 'loi')
})

test('trắc nghiệm một lựa chọn mà có hai đáp án đúng', () => {
  const issues = auditQuestionByRules(
    question({
      answers: [
        { id: 'a', content: '$2$', is_correct: true },
        { id: 'b', content: '$3$', is_correct: true },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['nhieu_dap_an_dung'])
  assert.deepEqual(issues[0].answerIds, ['a', 'b'])
})

test('câu Đúng/Sai thiếu ý', () => {
  const issues = auditQuestionByRules(
    question({
      question_type: 'true_false',
      answers: [
        { id: 'a', content: 'Số trung bình bằng $3$.', is_correct: true },
        { id: 'b', content: 'Trung vị bằng $3$.', is_correct: true },
        { id: 'c', content: 'Mốt bằng $1$.', is_correct: false },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['true_false_khong_du_4_y'])
})

test('câu Đúng/Sai cả bốn ý đều Sai chỉ là cảnh báo, không phải lỗi', () => {
  const issues = auditQuestionByRules(
    question({
      question_type: 'true_false',
      answers: [
        { id: 'a', content: 'Số trung bình bằng $9$.', is_correct: false },
        { id: 'b', content: 'Trung vị bằng $9$.', is_correct: false },
        { id: 'c', content: 'Mốt bằng $9$.', is_correct: false },
        { id: 'd', content: 'Phương sai bằng $9$.', is_correct: false },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['khong_co_dap_an_dung'])
  assert.equal(issues[0].severity, 'canh_bao')
})

test('hai phương án trùng nội dung dù gõ LaTeX khác nhau', () => {
  const issues = auditQuestionByRules(
    question({
      answers: [
        { id: 'a', content: '$x = 1$', is_correct: true },
        { id: 'b', content: '\\(x=1\\)', is_correct: false },
        { id: 'c', content: '$x = 2$', is_correct: false },
        { id: 'd', content: '$x = 3$', is_correct: false },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['phuong_an_trung_nhau'])
  assert.deepEqual(issues[0].answerIds, ['a', 'b'])
})

test('phương án rỗng', () => {
  const issues = auditQuestionByRules(
    question({
      answers: [
        { id: 'a', content: '$2$', is_correct: true },
        { id: 'b', content: '   ', is_correct: false },
      ],
    })
  )
  assert.deepEqual(codes(issues), ['phuong_an_rong'])
})

test('LaTeX: dấu $ lẻ', () => {
  const issues = auditQuestionByRules(
    question({ content: 'Cho mẫu số liệu $1; 2; 3; 4; 5. Tính số trung bình của mẫu.' })
  )
  assert.deepEqual(codes(issues), ['latex_vo'])
  assert.match(issues[0].message, /lẻ/)
})

test('LaTeX: $$ ... $$ không bị coi là lẻ', () => {
  assert.deepEqual(
    auditQuestionByRules(question({ content: 'Tính giá trị của $$\\sum_{i=1}^{5} x_i$$ trong mẫu.' })),
    []
  )
})

test('LaTeX: ký tự thoát \\$ không bị đếm là dấu phân định', () => {
  assert.deepEqual(
    auditQuestionByRules(question({ content: 'Một món hàng giá \\$5 được giảm giá bao nhiêu phần trăm?' })),
    []
  )
})

test('LaTeX: ngoặc nhọn chưa đóng', () => {
  const issues = auditQuestionByRules(
    question({ content: 'Tính $\\frac{1}{2$ theo mẫu số liệu đã cho ở trên.' })
  )
  assert.ok(codes(issues).includes('latex_vo'))
})

test('LaTeX: \\begin không có \\end', () => {
  const issues = auditQuestionByRules(
    question({ content: 'Cho bảng $\\begin{array}{c} 1 \\\\ 2 \\end{matrix}$ của mẫu số liệu.' })
  )
  const messages = issues.filter((issue) => issue.code === 'latex_vo').map((issue) => issue.message)
  assert.ok(messages.some((message) => message.includes('array')))
})

test('LaTeX: \\left thiếu \\right', () => {
  const issues = auditQuestionByRules(
    question({ content: 'Tính $\\left( 1 + 2 $ theo mẫu số liệu đã cho ở trên.' })
  )
  const messages = issues.filter((issue) => issue.code === 'latex_vo').map((issue) => issue.message)
  assert.ok(messages.some((message) => message.includes('\\left')))
})

test('nội dung cụt giữa chừng', () => {
  const issues = auditQuestionByRules(
    question({ content: 'Cho mẫu số liệu gồm năm giá trị. Số trung bình của mẫu bằng +' })
  )
  assert.deepEqual(codes(issues), ['noi_dung_nghi_cut'])
  assert.equal(issues[0].severity, 'canh_bao')
})

test('đề kết thúc bằng "là" KHÔNG bị coi là cụt', () => {
  // Đây là hình dạng của gần như mọi câu trắc nghiệm; bắt nó là tự huỷ công cụ.
  assert.deepEqual(
    auditQuestionByRules(question({ content: 'Số trung bình của mẫu số liệu $1; 2; 3$ là' })),
    []
  )
})

test('rác OCR: ký tự thay thế', () => {
  const issues = auditQuestionByRules(
    question({ content: `Cho mẫu số liệu ${String.fromCharCode(0xfffd)} gồm năm giá trị khác nhau.` })
  )
  assert.deepEqual(codes(issues), ['rac_ocr'])
  assert.equal(issues[0].severity, 'loi')
})

test('rác OCR: chữ Kirin lẫn vào', () => {
  // `а` dưới đây là U+0430 (Kirin), không phải `a` Latin.
  const issues = auditQuestionByRules(
    question({ content: 'Cho mẫu số liệu gồm năm giа trị. Tính số trung bình.' })
  )
  assert.deepEqual(codes(issues), ['rac_ocr'])
  assert.equal(issues[0].severity, 'canh_bao')
})

test('nội dung quá ngắn', () => {
  const issues = auditQuestionByRules(question({ content: 'Tính.' }))
  assert.ok(codes(issues).includes('thieu_noi_dung'))
})

test('câu có ảnh nhưng không có mã TikZ thì không kiểm được bằng văn bản', () => {
  const issues = auditQuestionByRules(
    question({ tikz_image_url: 'https://example.test/hinh.svg' })
  )
  assert.deepEqual(codes(issues), ['khong_kiem_duoc_bang_van_ban'])
  assert.equal(issues[0].severity, 'canh_bao')
})

test('có mã TikZ thì không cảnh báo, dù cũng có ảnh', () => {
  assert.deepEqual(
    auditQuestionByRules(
      question({
        tikz_image_url: 'https://example.test/hinh.svg',
        tikz_code: '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}',
      })
    ),
    []
  )
})

test('câu tự luận không bị áp luật phương án', () => {
  assert.deepEqual(
    auditQuestionByRules(
      question({
        question_type: 'essay',
        content: 'Chứng minh rằng số trung bình của mẫu không vượt quá giá trị lớn nhất.',
        answers: [],
      })
    ),
    []
  )
})

test('lời giải kết thúc bằng dấu = không bị coi là cụt', () => {
  // Chỉ soi rác OCR ở đề và phương án; lời giải hay dừng giữa một biến đổi.
  assert.deepEqual(
    auditQuestionByRules(question({ explanation: 'Số trung bình $\\frac{1+2+3+4+5}{5}$ =' })),
    []
  )
})

test('báo cáo lô: đếm theo mã và giữ mẫu số', () => {
  const report = auditQuestionsByRules([
    question({ id: 'sach' }),
    question({
      id: 'thieu-dap-an',
      answers: [
        { id: 'a', content: '$2$', is_correct: false },
        { id: 'b', content: '$3$', is_correct: false },
      ],
    }),
    question({ id: 'co-hinh', tikz_image_url: 'https://example.test/hinh.svg' }),
  ])

  assert.equal(report.scanned, 3)
  assert.equal(report.reports.length, 2)
  assert.equal(report.withErrors, 1)
  assert.deepEqual(report.byCode, {
    khong_co_dap_an_dung: 1,
    khong_kiem_duoc_bang_van_ban: 1,
  })
})

test('câu vỡ LaTeX hoặc thiếu hình thì không gửi cho model', () => {
  const broken = auditQuestionByRules(
    question({ content: 'Cho mẫu số liệu $1; 2; 3; 4; 5. Tính số trung bình của mẫu.' })
  )
  assert.deepEqual(shouldSkipAiAudit(broken), { skip: true, reasons: ['latex_vo'] })

  const imageOnly = auditQuestionByRules(question({ tikz_image_url: 'https://example.test/h.svg' }))
  assert.equal(shouldSkipAiAudit(imageOnly).skip, true)
})

test('câu chỉ sai đáp án vẫn được gửi cho model — đó chính là việc của model', () => {
  const issues = auditQuestionByRules(
    question({
      answers: [
        { id: 'a', content: '$2$', is_correct: false },
        { id: 'b', content: '$3$', is_correct: false },
      ],
    })
  )
  assert.deepEqual(shouldSkipAiAudit(issues), { skip: false, reasons: [] })
})
