/**
 * Test cho phần thuần logic của worker chấm tự luận.
 *
 * Trọng tâm là các nhánh fail-closed: mỗi test dưới đây tương ứng với một cách
 * hệ thống có thể chấm sai mà không ai phát hiện. Nhánh "dữ liệu hợp lệ" chỉ
 * cần vài test; phần lớn file này kiểm dữ liệu méo bị TỪ CHỐI.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampLimit,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  mapPackageError,
  parsePackage,
  parseRubric,
  resolveConfidenceMin,
  rubricVersionMatches,
} from './worker-logic.ts'

/** Gói chấm hợp lệ tối thiểu. Từng test làm méo đúng một trường. */
function validPackage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    grading_ref: 'a'.repeat(64),
    rubric_version: 3,
    question: 'Giải phương trình $x^2 - 5x + 6 = 0$.',
    reference_answer: '$x = 2$ hoặc $x = 3$.',
    rubric: [
      { criterion_id: 'c1', title: 'Biến đổi', description: '', max_score: 0.5 },
      { criterion_id: 'c2', title: 'Kết luận', description: 'Nêu đủ nghiệm', max_score: 0.5 },
    ],
    student_answer: 'Ta có $\\Delta = 1$, suy ra $x = 2$ hoặc $x = 3$.',
    max_score: 1,
    ai_enabled: true,
    min_confidence: 0.8,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// clampLimit
// ---------------------------------------------------------------------------

test('clampLimit giữ giá trị hợp lệ', () => {
  assert.equal(clampLimit(1), 1)
  assert.equal(clampLimit(10), 10)
  assert.equal(clampLimit(MAX_LIMIT), MAX_LIMIT)
})

test('clampLimit chặn trần để một lượt cron không chạy vô hạn', () => {
  assert.equal(clampLimit(1000), MAX_LIMIT)
})

test('clampLimit đưa giá trị vô nghĩa về mặc định thay vì throw', () => {
  // Tham số sai không đáng làm hỏng cả lượt cron.
  assert.equal(clampLimit(undefined), DEFAULT_LIMIT)
  assert.equal(clampLimit(Number.NaN), DEFAULT_LIMIT)
  assert.equal(clampLimit(Number.POSITIVE_INFINITY), DEFAULT_LIMIT)
  assert.equal(clampLimit(0), 1)
  assert.equal(clampLimit(-5), 1)
  assert.equal(clampLimit(3.7), 3)
})

// ---------------------------------------------------------------------------
// resolveConfidenceMin — quy tắc "chỉ được siết, không được nới"
// ---------------------------------------------------------------------------

test('resolveConfidenceMin lấy ngưỡng chặt hơn giữa env và câu hỏi', () => {
  assert.equal(resolveConfidenceMin(0.75, 0.9), 0.9)
  assert.equal(resolveConfidenceMin(0.95, 0.8), 0.95)
})

test('resolveConfidenceMin: câu hỏi cấu hình lỏng KHÔNG nới được ngưỡng chung', () => {
  // Đây là nhánh quan trọng nhất của hàm. Nếu lấy min thay vì max, chỉ cần một
  // câu hỏi đặt minimum_confidence = 0 là vô hiệu hoá ngưỡng của cả hệ thống.
  assert.equal(resolveConfidenceMin(0.9, 0), 0.9)
  assert.equal(resolveConfidenceMin(0.9, 0.1), 0.9)
})

test('resolveConfidenceMin: thiếu cấu hình câu hỏi thì giữ nguyên ngưỡng env', () => {
  assert.equal(resolveConfidenceMin(0.85, null), 0.85)
})

// ---------------------------------------------------------------------------
// rubricVersionMatches
// ---------------------------------------------------------------------------

test('rubricVersionMatches: khớp thì cho chấm', () => {
  assert.equal(rubricVersionMatches(3, 3), true)
})

test('rubricVersionMatches: rubric đổi sau khi nộp thì chặn trước khi tốn tiền', () => {
  // ai_finalize_essay_answer sẽ raise RUBRIC_VERSION_MISMATCH, nhưng chỉ sau
  // khi đã trả tiền cho một lời gọi provider.
  assert.equal(rubricVersionMatches(4, 3), false)
})

test('rubricVersionMatches: thiếu snapshot lúc nộp cũng là không khớp', () => {
  // Không có gì để đối chiếu thì không được auto-chốt.
  assert.equal(rubricVersionMatches(3, null), false)
})

// ---------------------------------------------------------------------------
// mapPackageError
// ---------------------------------------------------------------------------

test('mapPackageError nhận diện mã lỗi của RPC', () => {
  assert.equal(
    mapPackageError('P0001: GRADING_CONFIG_MISSING'),
    'grading_config_missing'
  )
  assert.equal(mapPackageError('ANSWER_NOT_PENDING'), 'answer_no_longer_pending')
  assert.equal(mapPackageError('ATTEMPT_NOT_SUBMITTED'), 'answer_no_longer_pending')
})

test('mapPackageError: lỗi lạ về package_unavailable', () => {
  assert.equal(mapPackageError('connection reset'), 'package_unavailable')
  assert.equal(mapPackageError(''), 'package_unavailable')
})

// ---------------------------------------------------------------------------
// parsePackage — dữ liệu hợp lệ
// ---------------------------------------------------------------------------

test('parsePackage nhận gói hợp lệ và giữ nguyên nội dung toán', () => {
  const result = parsePackage(validPackage())
  assert.ok(result)
  assert.equal(result.rubricVersion, 3)
  assert.equal(result.maxScore, 1)
  assert.equal(result.aiEnabled, true)
  assert.equal(result.minConfidence, 0.8)
  assert.equal(result.rubric.length, 2)
  // Công thức LaTeX phải qua nguyên vẹn.
  assert.match(result.studentAnswer, /\\Delta/)
})

test('parsePackage: min_confidence thiếu hoặc sai kiểu -> null', () => {
  // null nghĩa là "câu hỏi không đặt ngưỡng riêng", để resolveConfidenceMin
  // dùng ngưỡng env. Không được bịa ra một số.
  assert.equal(parsePackage(validPackage({ min_confidence: null }))?.minConfidence, null)
  assert.equal(parsePackage(validPackage({ min_confidence: 'cao' }))?.minConfidence, null)
  assert.equal(parsePackage(validPackage({ min_confidence: 1.5 }))?.minConfidence, null)
  assert.equal(parsePackage(validPackage({ min_confidence: -0.1 }))?.minConfidence, null)
})

test('parsePackage: ai_enabled chỉ bật khi đúng boolean true', () => {
  // Fail-closed, giống readBooleanFlag: chuỗi "true" KHÔNG đủ để bật.
  assert.equal(parsePackage(validPackage({ ai_enabled: true }))?.aiEnabled, true)
  assert.equal(parsePackage(validPackage({ ai_enabled: 'true' }))?.aiEnabled, false)
  assert.equal(parsePackage(validPackage({ ai_enabled: 1 }))?.aiEnabled, false)
  assert.equal(parsePackage(validPackage({ ai_enabled: false }))?.aiEnabled, false)
  assert.equal(parsePackage(validPackage({ ai_enabled: undefined }))?.aiEnabled, false)
})

// ---------------------------------------------------------------------------
// parsePackage — dữ liệu méo phải bị từ chối
// ---------------------------------------------------------------------------

test('parsePackage từ chối giá trị không phải object', () => {
  assert.equal(parsePackage(null), null)
  assert.equal(parsePackage(undefined), null)
  assert.equal(parsePackage('{}'), null)
  assert.equal(parsePackage(42), null)
  assert.equal(parsePackage([]), null)
})

test('parsePackage từ chối grading_ref rỗng hoặc sai kiểu', () => {
  // grading_ref là answer_hash; ai_finalize_essay_answer so chính giá trị này.
  // Rỗng nghĩa là không xác định được bài, không được chấm.
  assert.equal(parsePackage(validPackage({ grading_ref: '' })), null)
  assert.equal(parsePackage(validPackage({ grading_ref: null })), null)
  assert.equal(parsePackage(validPackage({ grading_ref: 123 })), null)
})

test('parsePackage từ chối rubric_version không phải số nguyên', () => {
  assert.equal(parsePackage(validPackage({ rubric_version: '3' })), null)
  assert.equal(parsePackage(validPackage({ rubric_version: 3.5 })), null)
  assert.equal(parsePackage(validPackage({ rubric_version: null })), null)
})

test('parsePackage từ chối bài làm rỗng hoặc toàn khoảng trắng', () => {
  // Bài trống phải đi đường BLANK_ESSAY_ALREADY_FINAL của database, không được
  // gửi sang provider để nhận về một điểm bịa.
  assert.equal(parsePackage(validPackage({ student_answer: '' })), null)
  assert.equal(parsePackage(validPackage({ student_answer: '   \n\t ' })), null)
  assert.equal(parsePackage(validPackage({ student_answer: null })), null)
})

test('parsePackage từ chối đề bài rỗng', () => {
  // Không có đề thì model chấm theo cái gì?
  assert.equal(parsePackage(validPackage({ question: '' })), null)
  assert.equal(parsePackage(validPackage({ question: '  ' })), null)
})

test('parsePackage từ chối max_score không dương', () => {
  // max_score <= 0 làm mọi so sánh điểm mất nghĩa.
  assert.equal(parsePackage(validPackage({ max_score: 0 })), null)
  assert.equal(parsePackage(validPackage({ max_score: -1 })), null)
  assert.equal(parsePackage(validPackage({ max_score: '1' })), null)
  assert.equal(parsePackage(validPackage({ max_score: Number.NaN })), null)
})

test('parsePackage chấp nhận reference_answer rỗng', () => {
  // Đáp án tham chiếu rỗng vẫn chấm được nếu rubric đủ chi tiết; RPC đã chặn
  // trường hợp NULL bằng GRADING_CONFIG_MISSING.
  assert.ok(parsePackage(validPackage({ reference_answer: '' })))
})

// ---------------------------------------------------------------------------
// parseRubric
// ---------------------------------------------------------------------------

test('parseRubric nhận rubric hợp lệ và điền description mặc định', () => {
  const rubric = parseRubric([
    { criterion_id: 'c1', title: 'Bước 1', max_score: 0.5 },
    { criterion_id: 'c2', title: 'Bước 2', description: 'Có lập luận', max_score: 0.5 },
  ])
  assert.ok(rubric)
  assert.equal(rubric.length, 2)
  assert.equal(rubric[0].description, '')
  assert.equal(rubric[1].description, 'Có lập luận')
})

test('parseRubric từ chối rubric rỗng', () => {
  // Không có tiêu chí nào nghĩa là không có thang điểm; để model tự nghĩ ra
  // thang điểm là chế độ hỏng tệ nhất.
  assert.equal(parseRubric([]), null)
  assert.equal(parseRubric(null), null)
  assert.equal(parseRubric({}), null)
})

test('parseRubric từ chối criterion_id trùng nhau', () => {
  // parseEssayGradingSuggestion kiểm "mỗi tiêu chí đúng một lần" dựa trên
  // rubric này; id trùng làm phép kiểm đó sai.
  assert.equal(
    parseRubric([
      { criterion_id: 'c1', title: 'A', max_score: 0.5 },
      { criterion_id: 'c1', title: 'B', max_score: 0.5 },
    ]),
    null
  )
})

test('parseRubric từ chối tiêu chí thiếu trường hoặc sai kiểu', () => {
  assert.equal(parseRubric([{ title: 'Thiếu id', max_score: 1 }]), null)
  assert.equal(parseRubric([{ criterion_id: 'c1', max_score: 1 }]), null)
  assert.equal(parseRubric([{ criterion_id: 'c1', title: 'A', max_score: '1' }]), null)
  assert.equal(parseRubric([{ criterion_id: '', title: 'A', max_score: 1 }]), null)
  assert.equal(parseRubric(['c1']), null)
  assert.equal(parseRubric([null]), null)
})

test('parseRubric từ chối max_score không dương', () => {
  assert.equal(parseRubric([{ criterion_id: 'c1', title: 'A', max_score: 0 }]), null)
  assert.equal(parseRubric([{ criterion_id: 'c1', title: 'A', max_score: -1 }]), null)
})
