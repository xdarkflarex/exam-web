/**
 * Tính số liệu chấm đè từ các hàng đã đọc được. Thuần logic, không I/O.
 *
 * VÌ SAO TÁCH RA: hai chỗ cần đúng con số này và chúng có vai trò khác nhau —
 * `GET /api/admin/essay-ai/stats` HIỂN THỊ để người vận hành quyết định, còn
 * `worker.ts` THỰC THI cổng chặn auto-chốt. Nếu mỗi bên tự tính, chúng sẽ lệch
 * nhau ở đúng những chỗ khó thấy nhất (bản duyệt nào là mới nhất, bản duyệt
 * trước lần chấm AI có tính không, lấy thang điểm ở đâu) — và khi đó dashboard
 * nói "an toàn" trong lúc worker chặn, hoặc tệ hơn là ngược lại.
 *
 * Ba quy tắc dễ làm sai, gom về đây một lần:
 *
 * 1. Chỉ tính bản duyệt của giáo viên xảy ra SAU lần chấm AI. Giáo viên chấm
 *    trước rồi AI chấm sau không phải "chấm đè" — tính vào là bịa ra sai số.
 * 2. Mỗi bài chỉ là MỘT điểm dữ liệu: lấy bản duyệt mới nhất, và lấy lần AI
 *    chấm mới nhất. Một bài được chấm lại ba lần rồi sửa điểm ba lần vẫn là một
 *    điểm dữ liệu, không phải chín.
 * 3. "Sai nghiêm trọng" đo theo thang điểm của CHÍNH câu đó. Lệch 0,5 điểm
 *    trên câu 1 điểm khác hoàn toàn lệch 0,5 trên câu 5 điểm; thiếu thang điểm
 *    thì không kết luận được, và thiếu là `partial`, không phải "không sao".
 */

import type { OverrideStats } from './override-guard'

/** Lệch quá 20% thang điểm coi là sai nghiêm trọng (kế hoạch mục 7). */
export const SERIOUS_ERROR_RATIO = 0.2

/** Một lần AI chấm, đã lọc bỏ các dòng không có điểm. */
export interface UsageScoreRow {
  studentAnswerId: string
  aiScore: number
  /** Thời điểm AI chấm, ISO. Dùng để loại bản duyệt xảy ra trước đó. */
  createdAt: string
}

/** Một bản duyệt của giáo viên. */
export interface TeacherReviewRow {
  studentAnswerId: string
  finalScore: number
  createdAt: string
}

export interface ComputeOverrideStatsInput {
  usage: UsageScoreRow[]
  /** Chỉ gồm bản duyệt `actor_kind = 'teacher'`. */
  reviews: TeacherReviewRow[]
  /** `student_answers.max_score` theo id. Thiếu id nào thì bài đó không xét được. */
  maxScores: Map<string, number>
  /**
   * Một truy vấn nguồn đã lỗi. Người gọi truyền vào để kết quả mang theo cờ
   * `partial` — cổng chặn coi `partial` là lý do chặn.
   */
  sourceIncomplete?: boolean
}

/** Kết quả gồm cả tổng lệch, để dashboard tính được lệch trung bình. */
export interface OverrideStatsDetail extends OverrideStats {
  /** Tổng trị tuyệt đối chênh lệch, trên các bài so được. */
  absDiffSum: number
  /** Lệch trung bình, `null` khi chưa so được bài nào. */
  avgAbsDiff: number | null
}

export function computeOverrideStats(
  input: ComputeOverrideStatsInput
): OverrideStatsDetail {
  const latestReview = new Map<string, TeacherReviewRow>()
  for (const review of input.reviews) {
    const current = latestReview.get(review.studentAnswerId)
    // So mốc thời gian thay vì tin thứ tự người gọi truyền vào: một hàm thuần
    // không nên phụ thuộc vào việc caller có nhớ ORDER BY hay không.
    if (!current || Date.parse(review.createdAt) > Date.parse(current.createdAt)) {
      latestReview.set(review.studentAnswerId, review)
    }
  }

  // Quy tắc 2, nửa còn lại: gộp cả phía AI. Một bài chấm lại nhiều lượt có
  // nhiều dòng trong `essay_ai_usage`, và tất cả đều khớp cùng một bản duyệt —
  // không gộp thì một bài bị đếm thành nhiều, làm cỡ mẫu phồng lên giả tạo và
  // đẩy `compared` qua ngưỡng minCompared bằng số liệu trùng.
  const latestGrade = new Map<string, UsageScoreRow>()
  for (const row of input.usage) {
    const current = latestGrade.get(row.studentAnswerId)
    if (!current || Date.parse(row.createdAt) > Date.parse(current.createdAt)) {
      latestGrade.set(row.studentAnswerId, row)
    }
  }

  let compared = 0
  let changed = 0
  let serious = 0
  let absDiffSum = 0
  let missingMaxScore = false

  for (const row of latestGrade.values()) {
    const review = latestReview.get(row.studentAnswerId)
    if (!review) continue

    // Quy tắc 1: bản duyệt phải xảy ra sau lần chấm AI.
    const reviewAt = Date.parse(review.createdAt)
    const gradedAt = Date.parse(row.createdAt)
    if (!Number.isFinite(reviewAt) || !Number.isFinite(gradedAt)) {
      // Mốc thời gian không đọc được thì không kết luận được thứ tự.
      missingMaxScore = true
      continue
    }
    if (reviewAt < gradedAt) continue

    const diff = Math.abs(review.finalScore - row.aiScore)
    compared += 1
    absDiffSum += diff
    if (diff > 0) changed += 1

    const maxScore = input.maxScores.get(row.studentAnswerId)
    if (maxScore === undefined || !(maxScore > 0)) {
      // Quy tắc 3: không có thang điểm thì không xét được "nghiêm trọng". Đánh
      // dấu thiếu thay vì im lặng bỏ qua — bỏ qua âm thầm làm tỷ lệ sai
      // nghiêm trọng nhỏ đi một cách sai lệch, đúng chiều nguy hiểm.
      missingMaxScore = true
      continue
    }
    if (diff > maxScore * SERIOUS_ERROR_RATIO) serious += 1
  }

  return {
    compared,
    changed,
    serious,
    absDiffSum,
    avgAbsDiff: compared > 0 ? absDiffSum / compared : null,
    partial: input.sourceIncomplete === true || missingMaxScore,
  }
}
