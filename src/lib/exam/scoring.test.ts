/**
 * Test cho thang điểm Bộ GD&ĐT.
 *
 * Ba nhóm quan trọng nhất:
 * - Bậc thang Đúng/Sai phải là BẬC THANG, không phải tỷ lệ. Test khẳng định
 *   3/4 ý ra 0,5 và nói rõ 0,75 là giá trị của công thức cũ.
 * - Đề chuẩn 12 MC + 4 TF + 6 SA phải cộng đúng 10,0. Đây là bất biến khiến
 *   phép quy đổi thang 10 không đổi gì với đề chuẩn.
 * - Kết quả phải khớp `public.moet_true_false_score()` phía database; postflight
 *   của `20260806_moet_scoring_scale.sql` kiểm cùng bảng giá trị này.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CUSTOM_DEFAULT_SCORE,
  DEFAULT_SCORING_PROFILE,
  MOET_SCORE,
  RUBRIC_SCORE_TOLERANCE,
  SCORING_PROFILE_LABEL,
  TRUE_FALSE_LADDER,
  TRUE_FALSE_STATEMENT_COUNT,
  customDefaultScore,
  examTotalScore,
  initialQuestionScore,
  matchesRubricTotal,
  normalizeScoringProfile,
  questionScore,
  requiresMoetScale,
  rubricTotal,
  toScaleOfTen,
  trueFalseScore,
} from './scoring.ts'

// ---------------------------------------------------------------------------
// Trọng số theo loại câu
// ---------------------------------------------------------------------------

test('trọng số đúng thang Bộ cho ba loại khách quan', () => {
  assert.equal(MOET_SCORE.multiple_choice, 0.25)
  assert.equal(MOET_SCORE.true_false, 1.0)
  assert.equal(MOET_SCORE.short_answer, 0.5)
})

test('questionScore trả trọng số theo loại', () => {
  assert.equal(questionScore('multiple_choice'), 0.25)
  assert.equal(questionScore('true_false'), 1.0)
  assert.equal(questionScore('short_answer'), 0.5)
})

test('questionScore của tự luận là tổng rubric, không phải một hằng số', () => {
  assert.equal(questionScore('essay', 1.5), 1.5)
  assert.equal(questionScore('essay', 3), 3)
})

test('questionScore của tự luận trả null khi thiếu tổng rubric', () => {
  // Phải là null để phía gọi chặn tạo đề. Nếu ở đây trả một giá trị mặc định
  // thì lỗi chuyển sang lúc học sinh bấm nộp: submit_exam_attempt raise
  // ESSAY_GRADING_CONFIG_MISSING và bài làm không được chấm.
  assert.equal(questionScore('essay'), null)
  assert.equal(questionScore('essay', null), null)
  assert.equal(questionScore('essay', 0), null)
  assert.equal(questionScore('essay', -1), null)
  assert.equal(questionScore('essay', Number.NaN), null)
})

test('questionScore trả null cho loại câu không biết', () => {
  assert.equal(questionScore('matching'), null)
  assert.equal(questionScore(''), null)
})

// ---------------------------------------------------------------------------
// Hồ sơ thang điểm: thi thử theo thang Bộ, thi học kì tự cấu hình
// ---------------------------------------------------------------------------

test('chỉ moet_standard bắt buộc thang Bộ', () => {
  // Ranh giới trung tâm của thiết kế: thang Bộ là quy định của kỳ thi tốt nghiệp,
  // không phải quy định của mọi đề. Đề thi học kì do trường ra ma trận điểm riêng.
  assert.equal(requiresMoetScale('moet_standard'), true)
  assert.equal(requiresMoetScale('custom'), false)
})

test('đề không ghi hồ sơ được coi là custom', () => {
  // Đề tạo trước 2026-08-06 mang trọng số 1 mỗi câu. Coi chúng là moet_standard
  // thì trang cấu hình sẽ báo "sai thang Bộ" trên dữ liệu mà không ai định sửa.
  assert.equal(DEFAULT_SCORING_PROFILE, 'custom')
  assert.equal(normalizeScoringProfile(null), 'custom')
  assert.equal(normalizeScoringProfile(undefined), 'custom')
  assert.equal(normalizeScoringProfile('semester'), 'custom')
  assert.equal(normalizeScoringProfile(''), 'custom')
  assert.equal(normalizeScoringProfile(1), 'custom')
})

test('normalizeScoringProfile giữ nguyên hai giá trị hợp lệ', () => {
  assert.equal(normalizeScoringProfile('moet_standard'), 'moet_standard')
  assert.equal(normalizeScoringProfile('custom'), 'custom')
})

test('đề custom khởi tạo 1 điểm mỗi câu, không theo thang Bộ', () => {
  // 1 điểm mỗi câu khiến điểm sau quy đổi tỷ lệ đúng theo số câu đúng — mặc định
  // dễ đoán nhất cho giáo viên chưa muốn nghĩ về ma trận điểm.
  assert.equal(CUSTOM_DEFAULT_SCORE, 1)
  assert.equal(customDefaultScore('multiple_choice'), 1)
  assert.equal(customDefaultScore('true_false'), 1)
  assert.equal(customDefaultScore('short_answer'), 1)
})

test('câu tự luận vẫn phải bằng tổng rubric ở cả hai hồ sơ', () => {
  // Ràng buộc này của RPC chấm thi (ESSAY_RUBRIC_SCORE_MISMATCH), không phải của
  // thang Bộ, nên nó không được nới ra khi đề là custom.
  assert.equal(customDefaultScore('essay', 2.5), 2.5)
  assert.equal(customDefaultScore('essay'), null)
  assert.equal(customDefaultScore('essay', 0), null)
})

test('initialQuestionScore phân nhánh theo hồ sơ', () => {
  assert.equal(initialQuestionScore('moet_standard', 'multiple_choice'), 0.25)
  assert.equal(initialQuestionScore('custom', 'multiple_choice'), 1)
  assert.equal(initialQuestionScore('moet_standard', 'true_false'), 1.0)
  assert.equal(initialQuestionScore('custom', 'true_false'), 1)
  assert.equal(initialQuestionScore('moet_standard', 'short_answer'), 0.5)
  assert.equal(initialQuestionScore('custom', 'short_answer'), 1)
  assert.equal(initialQuestionScore('moet_standard', 'essay', 1.5), 1.5)
  assert.equal(initialQuestionScore('custom', 'essay', 1.5), 1.5)
})

test('đề chuẩn theo thang Bộ ra 10,0; cùng đề đó ở hồ sơ custom ra 22', () => {
  // Hai con số này là toàn bộ lý do phải phân biệt hồ sơ. 22 KHÔNG phải lỗi ở đề
  // custom: mọi câu 1 điểm rồi quy đổi thang 10 là cách chấm hợp lệ, chỉ không
  // phải cách chấm của Bộ.
  const structure = [
    ['multiple_choice', 12],
    ['true_false', 4],
    ['short_answer', 6],
  ] as const
  const totalFor = (profile: 'moet_standard' | 'custom') => examTotalScore(
    structure.flatMap(([type, count]) =>
      Array.from({ length: count }, () => initialQuestionScore(profile, type) ?? 0)
    )
  )
  assert.equal(totalFor('moet_standard'), 10)
  assert.equal(totalFor('custom'), 22)
})

test('nhãn hồ sơ có cho cả hai giá trị', () => {
  // Thiếu nhãn thì UI hiện "undefined" cho một loại đề hợp lệ.
  assert.equal(typeof SCORING_PROFILE_LABEL.moet_standard, 'string')
  assert.equal(typeof SCORING_PROFILE_LABEL.custom, 'string')
  assert.notEqual(SCORING_PROFILE_LABEL.moet_standard, SCORING_PROFILE_LABEL.custom)
})

// ---------------------------------------------------------------------------
// Bậc thang Đúng/Sai
// ---------------------------------------------------------------------------

test('bậc thang Đúng/Sai đúng bảng Bộ quy định', () => {
  // 4 ý → 1đ, 3 ý → 0,5, 2 ý → 0,25, 1 ý → 0,1, 0 ý → 0.
  assert.equal(trueFalseScore(1, 4, 4), 1.0)
  assert.equal(trueFalseScore(1, 3, 4), 0.5)
  assert.equal(trueFalseScore(1, 2, 4), 0.25)
  assert.equal(trueFalseScore(1, 1, 4), 0.1)
  assert.equal(trueFalseScore(1, 0, 4), 0)
})

test('bậc thang KHÔNG phải tỷ lệ tuyến tính', () => {
  // Đây là lỗi đang được sửa: công thức cũ round(max * correct / total, 4) cho
  // 3/4 ý ra 0,75 và 1/4 ra 0,25. Nếu test này fail thì bậc thang đã bị thay
  // bằng tỷ lệ ở đâu đó.
  assert.notEqual(trueFalseScore(1, 3, 4), 0.75)
  assert.notEqual(trueFalseScore(1, 1, 4), 0.25)
})

test('bậc thang dốc dần: mỗi ý thêm không đáng giá bằng nhau', () => {
  // Ý thứ tư đáng 0,5đ còn ý thứ nhất chỉ 0,1đ. Đó là chủ ý — nó khiến đoán bừa
  // gần như vô ích, khác với tỷ lệ tuyến tính nơi mỗi ý đều đáng 0,25đ.
  const gains = [1, 2, 3, 4].map((k) => trueFalseScore(1, k, 4) - trueFalseScore(1, k - 1, 4))
  assert.deepEqual(gains, [0.1, 0.15, 0.25, 0.5])
  for (let i = 1; i < gains.length; i += 1) {
    assert.ok(gains[i] > gains[i - 1], `bậc ${i} phải lớn hơn bậc ${i - 1}`)
  }
})

test('bậc thang giữ hình dạng khi trọng số câu khác 1', () => {
  // Giáo viên đặt trọng số 2 thì mọi bậc nhân đôi, tỷ lệ giữa các bậc không đổi.
  assert.equal(trueFalseScore(2, 4, 4), 2.0)
  assert.equal(trueFalseScore(2, 3, 4), 1.0)
  assert.equal(trueFalseScore(2, 2, 4), 0.5)
  assert.equal(trueFalseScore(2, 1, 4), 0.2)
  assert.equal(trueFalseScore(0.5, 3, 4), 0.25)
})

test('TRUE_FALSE_LADDER khớp với hàm và có đúng 5 bậc', () => {
  assert.equal(TRUE_FALSE_LADDER.length, TRUE_FALSE_STATEMENT_COUNT + 1)
  TRUE_FALSE_LADDER.forEach((expected, correct) => {
    assert.equal(trueFalseScore(1, correct, 4), expected)
  })
})

test('số ý khác 4 rơi về tỷ lệ tuyến tính thay vì ném lỗi', () => {
  // Nhánh này lẽ ra không tồn tại: trigger phía database chặn câu Đúng/Sai khác
  // 4 ý. Nhưng nếu dữ liệu cũ lọt qua, chấm theo tỷ lệ vẫn tốt hơn là làm mất
  // bài của học sinh giữa lúc nộp.
  assert.equal(trueFalseScore(1, 1, 2), 0.5)
  assert.equal(trueFalseScore(1, 2, 3), 0.6667)
  assert.equal(trueFalseScore(1, 3, 3), 1.0)
})

test('trueFalseScore chặn đầu vào vô nghĩa thay vì trả NaN', () => {
  assert.equal(trueFalseScore(1, 0, 0), 0)
  assert.equal(trueFalseScore(0, 4, 4), 0)
  assert.equal(trueFalseScore(-1, 4, 4), 0)
  assert.equal(trueFalseScore(Number.NaN, 4, 4), 0)
  assert.equal(trueFalseScore(1, 2.5, 4), 0)
  assert.equal(trueFalseScore(1, 4, -4), 0)
})

test('số ý đúng vượt tổng bị kẹp về tổng, không vượt trọng số', () => {
  assert.equal(trueFalseScore(1, 9, 4), 1.0)
  assert.equal(trueFalseScore(1, -3, 4), 0)
})

// ---------------------------------------------------------------------------
// Tổng điểm đề
// ---------------------------------------------------------------------------

/** Danh sách trọng số của một đề theo số câu mỗi loại. */
function buildExam(mc: number, tf: number, sa: number, essays: readonly number[] = []): number[] {
  return [
    ...Array.from({ length: mc }, () => MOET_SCORE.multiple_choice),
    ...Array.from({ length: tf }, () => MOET_SCORE.true_false),
    ...Array.from({ length: sa }, () => MOET_SCORE.short_answer),
    ...essays,
  ]
}

test('đề chuẩn 12 MC + 4 TF + 6 SA cộng đúng 10,0', () => {
  // Bất biến trung tâm: 12·0,25 + 4·1 + 6·0,5 = 3 + 4 + 3 = 10,0. Chính vì tổng
  // đã là 10 nên phép quy đổi thang 10 không làm méo điểm đề chuẩn.
  assert.equal(examTotalScore(buildExam(12, 4, 6)), 10.0)
})

test('đề chuẩn có tự luận 12 MC + 2 TF + 4 SA + rubric 3đ cũng ra 10,0', () => {
  assert.equal(examTotalScore(buildExam(12, 2, 4, [1, 1, 1])), 10.0)
})

test('examTotalScore bỏ qua giá trị không hợp lệ thay vì trả NaN', () => {
  assert.equal(examTotalScore([0.25, Number.NaN, 0.5]), 0.75)
  assert.equal(examTotalScore([]), 0)
})

// ---------------------------------------------------------------------------
// Tổng rubric của câu tự luận
// ---------------------------------------------------------------------------

test('rubricTotal cộng max_score các tiêu chí', () => {
  assert.equal(
    rubricTotal([
      { criterion_id: 'a', title: 'Bước 1', description: '', max_score: 0.5 },
      { criterion_id: 'b', title: 'Bước 2', description: '', max_score: 1 },
      { criterion_id: 'c', title: 'Kết luận', description: '', max_score: 1.5 },
    ]),
    3
  )
  // Sáu config trên Primary có tổng 1 / 1 / 1 / 1 / 1,5 / 0,5.
  assert.equal(rubricTotal([{ max_score: 0.25 }, { max_score: 0.25 }, { max_score: 0.5 }]), 1)
})

test('rubricTotal trả null khi rubric không dùng được', () => {
  // Phải là null để phía tạo đề chặn: câu tự luận thiếu rubric làm
  // submit_exam_attempt raise ESSAY_GRADING_CONFIG_MISSING lúc học sinh nộp.
  assert.equal(rubricTotal(null), null)
  assert.equal(rubricTotal(undefined), null)
  assert.equal(rubricTotal([]), null)
  assert.equal(rubricTotal('1.5'), null)
  assert.equal(rubricTotal({ max_score: 1 }), null)
})

test('rubricTotal trả null khi một tiêu chí có điểm không hợp lệ', () => {
  // Một tiêu chí xấu làm cả tổng vô nghĩa; cộng phần còn lại sẽ ra trọng số
  // thiếu và mọi lần nộp sau raise ESSAY_RUBRIC_SCORE_MISMATCH.
  assert.equal(rubricTotal([{ max_score: 1 }, { max_score: 0 }]), null)
  assert.equal(rubricTotal([{ max_score: 1 }, { max_score: -0.5 }]), null)
  assert.equal(rubricTotal([{ max_score: 1 }, { max_score: '0.5' }]), null)
  assert.equal(rubricTotal([{ max_score: 1 }, {}]), null)
  assert.equal(rubricTotal([{ max_score: 1 }, null]), null)
  assert.equal(rubricTotal([{ max_score: 1 }, { max_score: Number.NaN }]), null)
})

test('rubricTotal khớp questionScore của tự luận', () => {
  const rubric = [{ max_score: 1 }, { max_score: 2 }]
  assert.equal(questionScore('essay', rubricTotal(rubric)), 3)
})

test('matchesRubricTotal dùng đúng ngưỡng của ESSAY_RUBRIC_SCORE_MISMATCH', () => {
  // Ngưỡng 0,0001 là của RPC (20260721:676). Client validate cùng ngưỡng để lỗi
  // hiện lúc cấu hình đề, không phải lúc học sinh nộp bài.
  assert.equal(RUBRIC_SCORE_TOLERANCE, 0.0001)
  assert.ok(matchesRubricTotal(3, 3))
  assert.ok(matchesRubricTotal(3, 3.0001))
  assert.ok(!matchesRubricTotal(3, 3.001))
  assert.ok(!matchesRubricTotal(3, 2.5))
  assert.ok(!matchesRubricTotal(Number.NaN, 3))
})

// ---------------------------------------------------------------------------
// Quy đổi thang 10
// ---------------------------------------------------------------------------

test('đề chuẩn làm đúng hết được 10,0', () => {
  const max = examTotalScore(buildExam(12, 4, 6))
  assert.equal(toScaleOfTen(max, max), 10.0)
})

test('đề một chương chỉ 12 MC vẫn quy đổi về thang 10', () => {
  // Tổng thô 3,0. Làm đúng hết là 10đ, đúng 6/12 là 5đ — đây là quyết định giữ
  // nguyên phép quy đổi cho đề không theo cấu trúc chuẩn.
  const max = examTotalScore(buildExam(12, 0, 0))
  assert.equal(max, 3.0)
  assert.equal(toScaleOfTen(max, max), 10.0)
  assert.equal(toScaleOfTen(1.5, max), 5.0)
})

test('điểm một attempt cụ thể trên đề chuẩn', () => {
  // 10 MC đúng, một câu Đ/S 3 ý, một câu Đ/S 2 ý, hai câu Đ/S sai hết, 4 SA đúng.
  const earned =
    10 * MOET_SCORE.multiple_choice + trueFalseScore(1, 3, 4) + trueFalseScore(1, 2, 4) + 4 * MOET_SCORE.short_answer
  assert.equal(earned, 5.25)
  assert.equal(toScaleOfTen(earned, examTotalScore(buildExam(12, 4, 6))), 5.25)
})

test('toScaleOfTen làm tròn 2 chữ số như round() của Postgres', () => {
  assert.equal(toScaleOfTen(1, 3), 3.33)
  assert.equal(toScaleOfTen(2, 3), 6.67)
  // 6,5/21 là attempt thật duy nhất có điểm trên Primary, tính theo công thức cũ
  // (mọi câu 1 điểm) ra 3,1. Giữ ở đây để đối chiếu: công thức quy đổi không đổi,
  // chỉ trọng số đầu vào đổi.
  assert.equal(toScaleOfTen(6.5, 21), 3.1)
})

test('toScaleOfTen trả 0 khi tổng điểm không dương thay vì chia cho 0', () => {
  assert.equal(toScaleOfTen(5, 0), 0)
  assert.equal(toScaleOfTen(5, -1), 0)
  assert.equal(toScaleOfTen(Number.NaN, 10), 0)
})
