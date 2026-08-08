/**
 * Thang điểm chính thức của Bộ GD&ĐT cho đề thi tốt nghiệp THPT môn Toán.
 *
 * VÌ SAO CẦN FILE NÀY
 * Trước 2026-08-06 mọi câu hỏi đều mang trọng số 1 điểm
 * (`src/app/admin/exams/create/page.tsx` hardcode `score: 1`). Vì điểm cuối là
 * `earned / max * 10`, một câu trắc nghiệm trong đề chuẩn 12 MC + 4 TF + 6 SA
 * được 10/22 = 0,4545đ thay vì 0,25đ — hào phóng 1,8 lần — còn một câu Đúng/Sai
 * cũng chỉ được 0,4545đ thay vì 1,0đ — khắt khe 2,2 lần.
 *
 * Đây là nguồn duy nhất cho phía TypeScript. Phía database có
 * `public.moet_true_false_score()` (migration `20260806_moet_scoring_scale.sql`)
 * phải cho cùng kết quả; `scoring.test.ts` kiểm bảng giá trị, postflight SQL
 * kiểm phía database.
 *
 * PHẠM VI ÁP DỤNG — đọc mục "Hồ sơ thang điểm" bên dưới trước khi dùng. Thang Bộ
 * chỉ bắt buộc với **đề thi thử**. Đề thi học kì do giáo viên tự cấu hình trọng
 * số, và bài tập kèm liên kết tri thức không dùng thang này.
 *
 * Xem `docs/SCORING.md` để biết toàn cảnh và lý do không tính lại điểm cũ.
 */

export type ObjectiveQuestionType = 'multiple_choice' | 'true_false' | 'short_answer'

/**
 * Hồ sơ thang điểm của một đề — cột `exams.scoring_profile`.
 *
 * VÌ SAO CẦN PHÂN BIỆT
 * Thang Bộ GD&ĐT là quy định của **kỳ thi tốt nghiệp THPT**. Áp nó cho mọi đề là
 * sai phạm vi: đề thi học kì do trường/giáo viên ra đề, ma trận điểm khác nhau
 * từng trường và từng khối, còn bài tập luyện theo liên kết tri thức thì không có
 * khái niệm thang chính thức nào cả.
 *
 * - `moet_standard`: bắt buộc trọng số 0,25 / 1,0 / 0,5, câu Đúng/Sai phải đúng
 *   4 ý, câu tự luận phải có rubric. Dùng cho **thi thử**.
 * - `custom`: giáo viên tự đặt trọng số từng câu. Không ràng buộc 4 ý, không
 *   ràng buộc tổng 10. Dùng cho **thi học kì** và mọi đề ngoài chuẩn.
 *
 * Bậc thang Đúng/Sai vẫn áp cho **cả hai** hồ sơ, chỉ khác chỗ trọng số: đề
 * custom đặt câu Đúng/Sai 2 điểm thì bậc thang thành 2,0 / 1,0 / 0,5 / 0,2 / 0.
 * Bậc thang là cách chấm, không phải cách phân bổ điểm.
 *
 * Bài tập về nhà (`homeworks` / `homework_questions`) **không có cột này** — toàn
 * bộ domain đó luôn là tự do cấu hình, xem `customDefaultScore()`.
 */
export type ScoringProfile = 'moet_standard' | 'custom'

/** Hồ sơ mặc định khi cột `exams.scoring_profile` là NULL (đề tạo trước
 *  2026-08-06). Chọn `custom` chứ không phải `moet_standard`: đề cũ mang trọng số
 *  1 mỗi câu, gọi nó là "theo thang Bộ" thì UI sẽ báo sai lệch trên dữ liệu mà
 *  không ai định sửa. */
export const DEFAULT_SCORING_PROFILE: ScoringProfile = 'custom'

/** Nhãn tiếng Việt cho hồ sơ thang điểm. Dùng chung để ba trang UI không mô tả
 *  cùng một hồ sơ bằng hai cách nói khác nhau. */
export const SCORING_PROFILE_LABEL: Record<ScoringProfile, string> = {
  moet_standard: 'Thang Bộ GD&ĐT',
  custom: 'Tự cấu hình',
}

/** Chuẩn hoá giá trị đọc từ database. Nhận `unknown` vì không có generated
 *  Database types — `supabase.from()` trả `any` nên giá trị lạ vẫn qua được `tsc`. */
export function normalizeScoringProfile(value: unknown): ScoringProfile {
  return value === 'moet_standard' || value === 'custom' ? value : DEFAULT_SCORING_PROFILE
}

/**
 * Hồ sơ này có bắt buộc theo thang Bộ hay không.
 *
 * Ba ràng buộc đi kèm khi trả `true`: trọng số cố định theo loại câu, câu Đúng/Sai
 * phải đúng 4 ý, câu tự luận phải có rubric. Cả ba đều bị **chặn khi tạo đề** —
 * không chỉ cảnh báo.
 */
export function requiresMoetScale(profile: ScoringProfile): boolean {
  return profile === 'moet_standard'
}

/**
 * Trọng số mỗi câu theo loại. Tự luận KHÔNG có trong bảng này: điểm của câu tự
 * luận bằng tổng `max_score` các tiêu chí trong rubric
 * (`question_grading_configs.rubric`), và RPC chấm thi raise
 * `ESSAY_RUBRIC_SCORE_MISMATCH` khi hai giá trị lệch nhau quá 0,0001.
 */
export const MOET_SCORE: Record<ObjectiveQuestionType, number> = {
  multiple_choice: 0.25,
  true_false: 1.0,
  short_answer: 0.5,
}

/** Số ý của một câu Đúng/Sai theo cấu trúc đề của Bộ. Bậc thang bên dưới chỉ
 *  định nghĩa cho đúng 4 ý; đề `moet_standard` chặn câu khác 4 ý, đề `custom`
 *  cho qua và chấm theo tỷ lệ. */
export const TRUE_FALSE_STATEMENT_COUNT = 4

/** Nhãn tiếng Việt cho loại câu hỏi. Ở đây để ba trang cấu hình điểm gọi cùng một
 *  loại câu bằng cùng một tên — giáo viên đối chiếu hai trang mà thấy hai cách nói
 *  thì sẽ tưởng là hai thứ khác nhau. */
export const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

/**
 * Bậc thang điểm Đúng/Sai theo số ý đúng, tính trên thang 1 điểm.
 *
 * Đây là BẬC THANG, không phải tỷ lệ tuyến tính: đúng 3/4 ý được 0,5đ chứ không
 * phải 0,75đ. Bậc thang này cố ý dốc — nó khiến đoán bừa gần như không có lợi,
 * trong khi tỷ lệ tuyến tính thì đoán bừa 2/4 vẫn được nửa điểm.
 */
export const TRUE_FALSE_LADDER: readonly number[] = [0, 0.1, 0.25, 0.5, 1.0]

/**
 * Điểm của một câu Đúng/Sai.
 *
 * `maxScore` là trọng số của câu trong đề (`exam_questions.score`), thường 1,0.
 * Truyền vào thay vì giả định 1,0 để giáo viên đặt trọng số khác vẫn giữ đúng
 * hình dạng bậc thang.
 *
 * Khi `total` khác 4, hàm quay về tỷ lệ tuyến tính. Với đề `moet_standard` nhánh
 * đó lẽ ra không tồn tại — trigger `exam_questions_true_false_four_statements`
 * chặn từ lớp database. Với đề `custom` và bài tập về nhà thì nó là nhánh **hợp
 * lệ**: giáo viên được dùng câu Đúng/Sai 2 hoặc 3 ý, và chấm theo tỷ lệ là cách
 * hiểu duy nhất còn nghĩa khi bậc thang 4 bậc không áp được.
 */
export function trueFalseScore(maxScore: number, correct: number, total: number): number {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return 0
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0) return 0

  const clamped = Math.min(Math.max(correct, 0), total)

  if (total !== TRUE_FALSE_STATEMENT_COUNT) {
    return roundTo(maxScore * (clamped / total), 4)
  }
  return roundTo(maxScore * TRUE_FALSE_LADDER[clamped], 4)
}

/**
 * Trọng số của một câu khi thêm vào **đề theo thang Bộ** (`moet_standard`).
 *
 * Tự luận cần tổng rubric nên phải truyền `essayRubricTotal`; thiếu thì trả
 * `null` để phía gọi chặn việc tạo đề. Đừng thay bằng giá trị mặc định: câu tự
 * luận không có rubric sẽ làm RPC raise `ESSAY_GRADING_CONFIG_MISSING` đúng lúc
 * học sinh bấm nộp, và lúc đó thì quá muộn.
 *
 * Đề `custom` và bài tập về nhà **không dùng hàm này** — chúng dùng
 * `customDefaultScore()` làm điểm khởi tạo rồi để giáo viên sửa.
 */
export function questionScore(
  questionType: string,
  essayRubricTotal?: number | null
): number | null {
  if (questionType === 'essay') {
    if (typeof essayRubricTotal !== 'number' || !Number.isFinite(essayRubricTotal) || essayRubricTotal <= 0) {
      return null
    }
    return essayRubricTotal
  }
  return MOET_SCORE[questionType as ObjectiveQuestionType] ?? null
}

/** Trọng số khởi tạo cho đề `custom` và bài tập về nhà: **1 điểm mỗi câu**.
 *
 *  Bằng `DEFAULT 1` của `exam_questions.score`/`homework_questions.score`, nên
 *  bỏ trắng cột hay ghi tường minh đều ra cùng kết quả — nhưng ghi tường minh để
 *  giá trị hiện ngay trên UI cấu hình, thay vì là con số vô hình trong schema.
 *
 *  Một điểm mỗi câu nghĩa là điểm sau quy đổi thang 10 tỷ lệ đúng theo số câu
 *  làm đúng: đúng 6/12 câu ra 5,0. Đó là mặc định dễ đoán nhất cho giáo viên
 *  chưa muốn nghĩ về ma trận điểm. */
export const CUSTOM_DEFAULT_SCORE = 1

/**
 * Trọng số khởi tạo của một câu trong đề `custom` hoặc bài tập về nhà.
 *
 * Câu tự luận vẫn phải bằng tổng rubric — ràng buộc đó là của **RPC chấm thi**
 * (`ESSAY_RUBRIC_SCORE_MISMATCH`), không phải của thang Bộ, nên nó áp cho mọi hồ
 * sơ. Trả `null` khi câu tự luận thiếu rubric để phía gọi chặn.
 */
export function customDefaultScore(
  questionType: string,
  essayRubricTotal?: number | null
): number | null {
  if (questionType === 'essay') {
    return typeof essayRubricTotal === 'number' && Number.isFinite(essayRubricTotal) && essayRubricTotal > 0
      ? essayRubricTotal
      : null
  }
  return CUSTOM_DEFAULT_SCORE
}

/**
 * Trọng số khởi tạo theo hồ sơ — điểm vào duy nhất cho UI tạo đề.
 *
 * Gộp hai hàm trên để trang tạo đề không phải tự phân nhánh; phân nhánh ở nhiều
 * nơi là cách chắc chắn nhất để hai trang hiểu cùng một hồ sơ theo hai kiểu.
 */
export function initialQuestionScore(
  profile: ScoringProfile,
  questionType: string,
  essayRubricTotal?: number | null
): number | null {
  return requiresMoetScale(profile)
    ? questionScore(questionType, essayRubricTotal)
    : customDefaultScore(questionType, essayRubricTotal)
}

/**
 * Tổng `max_score` của các tiêu chí trong `question_grading_configs.rubric`.
 *
 * Đây là trọng số của một câu tự luận — *"chấm rubric có thang điểm và tự cộng
 * lại được"*. Trả `null` khi rubric thiếu hoặc có tiêu chí không hợp lệ, để phía
 * gọi chặn thay vì đoán: RPC chấm thi raise `ESSAY_RUBRIC_SCORE_MISMATCH` khi
 * `exam_questions.score` lệch tổng này quá 0,0001.
 *
 * Nhận `unknown` vì rubric là cột `jsonb` — nội dung không được database ràng
 * buộc, nên phải kiểm từng tiêu chí ở đây.
 */
export function rubricTotal(rubric: unknown): number | null {
  if (!Array.isArray(rubric) || rubric.length === 0) return null

  let sum = 0
  for (const criterion of rubric) {
    if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)) return null
    const maxScore = (criterion as { max_score?: unknown }).max_score
    if (typeof maxScore !== 'number' || !Number.isFinite(maxScore) || maxScore <= 0) return null
    sum += maxScore
  }
  return roundTo(sum, 4)
}

/** Ngưỡng lệch cho phép giữa điểm câu tự luận và tổng rubric — đúng ngưỡng của
 *  `ESSAY_RUBRIC_SCORE_MISMATCH` trong `20260721_essay_assisted_grading.sql:676`. */
export const RUBRIC_SCORE_TOLERANCE = 0.0001

/** Điểm câu tự luận có khớp tổng rubric trong ngưỡng RPC chấp nhận hay không.
 *
 *  Làm tròn hiệu về 6 chữ số trước khi so sánh. Không có bước đó thì
 *  `Math.abs(3 - 3.0001)` ra 0,000100000000000211 — lớn hơn ngưỡng, nên đúng ở
 *  mốc biên JS lại chặn trong khi Postgres `numeric` cho qua. Lệch nhau ở đúng
 *  chỗ này nghĩa là UI báo lỗi cho một cấu hình mà RPC vẫn chấm được. */
export function matchesRubricTotal(score: number, total: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(total)) return false
  return roundTo(Math.abs(score - total), 6) <= RUBRIC_SCORE_TOLERANCE
}

/**
 * Quy đổi điểm thô về thang 10 — cùng công thức với
 * `round(v_earned_points / v_max_points * 10, 2)` trong các RPC chấm.
 *
 * Đề chuẩn (12 MC + 4 TF + 6 SA) có tổng thô đúng 10,0 nên phép quy đổi không
 * đổi gì. Đề một chương chỉ 12 MC có tổng thô 3,0; quy đổi cho phép làm đúng hết
 * vẫn được 10đ.
 */
export function toScaleOfTen(earnedPoints: number, maxPoints: number): number {
  if (!Number.isFinite(earnedPoints) || !Number.isFinite(maxPoints) || maxPoints <= 0) return 0
  return roundTo((earnedPoints / maxPoints) * 10, 2)
}

/** Tổng điểm thô của đề, dùng cho `exams.total_score` và bảng tổng kết khi tạo đề. */
export function examTotalScore(scores: readonly number[]): number {
  return roundTo(scores.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0), 4)
}

/**
 * Đọc số điểm giáo viên nhập vào ô cấu hình trọng số.
 *
 * Nhận cả dấu phẩy thập phân vì bàn phím tiếng Việt gõ "0,25" là chuyện thường;
 * không nhận thì người dùng tưởng ô nhập bị lỗi. Trả `null` khi không phải số
 * dương — phía gọi chặn lưu, không tự đoán. Số dương là ràng buộc thật của
 * database: `CHECK (score > 0)` trên cả `exam_questions` và `homework_questions`.
 */
export function parseScoreInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!normalized) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/** Hiện điểm cho ô nhập: bỏ số 0 đuôi để "1.00" thành "1", vì giáo viên sửa một
 *  chuỗi có đuôi 0 hay gõ chèn vào giữa rồi ra số khác ý muốn. */
export function formatScoreInput(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(4)))
}

/**
 * Làm tròn nửa lên trên giá trị tuyệt đối, khớp với `round()` của Postgres trên
 * numeric. `toFixed` của JS làm tròn theo nhị phân nên 1,005 ra 1,00; cách này
 * cho 1,01 giống database. Điểm học sinh không được lệch giữa hai lớp.
 */
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  const scaled = value * factor
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON)
  return rounded / factor
}
