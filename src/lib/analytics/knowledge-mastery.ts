/**
 * Thang đo năng lực theo kiến thức — nguồn sự thật duy nhất.
 *
 * Module này CỐ Ý không import Supabase hay React: toàn bộ là hàm thuần,
 * nhận dữ liệu đã tải và trả về thống kê. Nhờ vậy có thể test không cần mạng.
 *
 * Hai lỗi ngữ nghĩa mà module này sửa (xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 2.1):
 *
 * 1. Đo bằng ĐỘ CHÍNH XÁC, không phải tỷ lệ đã trả lời. Trước đây `/learn`
 *    tính `answered / total` rồi gắn nhãn "Đã đạt 80%" — học sinh làm hết bài
 *    và sai toàn bộ vẫn thấy node xanh.
 *
 * 2. Chia tín nhiệm theo trọng số, không cộng nguyên cho mọi kiến thức liên
 *    quan. Một bài tập nhắm 3 chuyên đề trước đây làm sáng cả 3 node với
 *    nguyên tiến độ; giờ mỗi câu trả lời chỉ đóng góp tổng cộng 1 đơn vị
 *    bằng chứng, chia theo `weight` của các liên kết.
 */

/** Sáu mức năng lực. `collecting` là mức mới, chặn ca "1 câu đúng = Ổn định". */
export type MasteryStatus =
  | 'no_data'
  | 'collecting'
  | 'needs_work'
  | 'building'
  | 'stable'
  | 'mastered'

/**
 * Số bằng chứng tối thiểu để dám kết luận. Dưới ngưỡng này trạng thái là
 * `collecting` bất kể đúng/sai — tránh khoe "Thành thạo" sau một câu.
 */
export const MIN_EVIDENCE = 4

/** Ngưỡng bằng chứng để được coi là đã ổn định lâu dài. */
export const SOLID_EVIDENCE = 8

/** Ngưỡng độ chính xác. */
export const ACCURACY_NEEDS_WORK = 0.5
export const ACCURACY_GOOD = 0.8

/** Một liên kết từ câu hỏi tới kiến thức. `weight` null/thiếu coi như 1. */
export interface MasteryLink {
  theoryId: string | null
  blockId: string | null
  weight?: number | null
}

/** Một câu trả lời đã chấm, kèm các kiến thức nó làm bằng chứng cho. */
export interface MasteryAnswer {
  questionId: string
  isCorrect: boolean
  answeredAt: string | null
  links: MasteryLink[]
}

/** Thống kê năng lực cho một kiến thức (theory hoặc knowledge block). */
export interface MasteryStat {
  /** Khóa tổng hợp: `theory:<id>` hoặc `block:<id>`. */
  id: string
  theoryId: string | null
  blockId: string | null
  /** Tổng bằng chứng đã quy đổi theo trọng số. Có thể là số thập phân. */
  evidence: number
  /** Phần bằng chứng đến từ câu trả lời đúng. */
  correctEvidence: number
  /** Độ chính xác 0-100, làm tròn. */
  accuracy: number
  status: MasteryStatus
  /** Số câu đã đóng góp bằng chứng, không quy đổi trọng số. Dùng để hiển thị. */
  answeredCount: number
  correctCount: number
  lastActivityAt: string | null
}

/** Khóa tổng hợp cho một liên kết. Ưu tiên block vì cụ thể hơn theory. */
export function masteryKey(link: MasteryLink): string | null {
  if (link.blockId) return `block:${link.blockId}`
  if (link.theoryId) return `theory:${link.theoryId}`
  return null
}

/**
 * Xếp mức năng lực từ bằng chứng đã quy đổi.
 *
 * Thứ tự kiểm tra quan trọng: ngưỡng bằng chứng đứng TRƯỚC ngưỡng độ chính
 * xác, nên `1 đúng / 1 câu` ra `collecting` chứ không ra `stable`.
 */
export function getMasteryStatus(correctEvidence: number, evidence: number): MasteryStatus {
  if (evidence <= 0) return 'no_data'
  if (evidence < MIN_EVIDENCE) return 'collecting'

  const score = correctEvidence / evidence
  if (score < ACCURACY_NEEDS_WORK) return 'needs_work'
  if (score < ACCURACY_GOOD) return 'building'
  if (evidence < SOLID_EVIDENCE) return 'stable'
  return 'mastered'
}

export function getMasteryStatusLabel(status: MasteryStatus): string {
  switch (status) {
    case 'collecting':
      return 'Đang thu thập'
    case 'needs_work':
      return 'Cần củng cố'
    case 'building':
      return 'Đang tiến bộ'
    case 'stable':
      return 'Ổn định'
    case 'mastered':
      return 'Thành thạo'
    default:
      return 'Chưa có dữ liệu'
  }
}

/**
 * Mô tả ngắn để đặt cạnh nhãn. Trạng thái phải đọc được không cần màu
 * (docs/DESIGN_SYSTEM.md).
 */
export function getMasteryStatusHint(status: MasteryStatus): string {
  switch (status) {
    case 'collecting':
      return `Cần thêm bài để kết luận (tối thiểu ${MIN_EVIDENCE} câu)`
    case 'needs_work':
      return 'Dưới một nửa số câu đúng'
    case 'building':
      return 'Đã đúng phần lớn, chưa vững'
    case 'stable':
      return 'Đúng từ 80% trở lên'
    case 'mastered':
      return 'Đúng từ 80% trở lên trên nhiều câu'
    default:
      return 'Chưa có câu trả lời nào'
  }
}

/** Thứ tự ưu tiên khi cần chọn "mảng nên củng cố trước". Nhỏ hơn = cấp hơn. */
const PRIORITY: Record<MasteryStatus, number> = {
  needs_work: 0,
  building: 1,
  collecting: 2,
  stable: 3,
  mastered: 4,
  no_data: 5,
}

export function masteryPriority(status: MasteryStatus): number {
  return PRIORITY[status]
}

/**
 * Đã đủ vững để coi là "học xong" bài tiên quyết chưa.
 *
 * Dùng cho khóa mềm ở `/learn`. Cố ý KHÔNG tính `collecting` là đạt: chưa đủ
 * bằng chứng thì chưa kết luận được, dù tỷ lệ đúng đang là 100%.
 */
export function isMasteryAchieved(status: MasteryStatus): boolean {
  return status === 'stable' || status === 'mastered'
}

/**
 * Chia một câu trả lời thành các phần bằng chứng theo trọng số liên kết.
 *
 * Tổng các phần luôn bằng 1 (nếu có ít nhất một liên kết hợp lệ), nên một câu
 * hỏi không thể "nhân bản" thành tích ra nhiều kiến thức. Trọng số âm hoặc
 * không phải số bị coi như 0; nếu tất cả trọng số đều bằng 0 thì chia đều.
 */
export function splitEvidence(links: MasteryLink[]): Map<string, number> {
  const valid: Array<{ key: string; weight: number }> = []

  for (const link of links) {
    const key = masteryKey(link)
    if (!key) continue
    const raw = Number(link.weight)
    const weight = Number.isFinite(raw) && raw > 0 ? raw : 0
    valid.push({ key, weight })
  }

  const shares = new Map<string, number>()
  if (valid.length === 0) return shares

  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0)
  const useEqual = totalWeight <= 0

  for (const item of valid) {
    const share = useEqual ? 1 / valid.length : item.weight / totalWeight
    // Trọng số 0 cạnh một trọng số dương nghĩa là giáo viên đã cố ý loại liên
    // kết đó. Bỏ hẳn thay vì tạo một bucket bằng chứng bằng 0 — bucket rỗng sẽ
    // hiện ra như "Chưa có dữ liệu" dù đã có câu trả lời, gây hiểu sai.
    if (share <= 0) continue
    shares.set(item.key, (shares.get(item.key) || 0) + share)
  }

  return shares
}

interface Bucket {
  theoryId: string | null
  blockId: string | null
  evidence: number
  correctEvidence: number
  answeredCount: number
  correctCount: number
  lastActivityAt: string | null
}

/**
 * Tổng hợp danh sách câu trả lời thành thống kê theo từng kiến thức.
 *
 * Câu trả lời không có liên kết kiến thức nào bị bỏ qua — nó không nói gì về
 * một kiến thức cụ thể, và bịa ra một quy gán sẽ tái tạo đúng lỗi cũ.
 */
export function aggregateMastery(answers: MasteryAnswer[]): MasteryStat[] {
  const buckets = new Map<string, Bucket>()

  for (const answer of answers) {
    const shares = splitEvidence(answer.links)
    if (shares.size === 0) continue

    for (const [key, share] of shares) {
      const link = answer.links.find((item) => masteryKey(item) === key)
      const bucket = buckets.get(key) || {
        theoryId: link?.theoryId ?? null,
        blockId: link?.blockId ?? null,
        evidence: 0,
        correctEvidence: 0,
        answeredCount: 0,
        correctCount: 0,
        lastActivityAt: null,
      }

      bucket.evidence += share
      bucket.answeredCount += 1
      if (answer.isCorrect) {
        bucket.correctEvidence += share
        bucket.correctCount += 1
      }
      if (answer.answeredAt && (!bucket.lastActivityAt || answer.answeredAt > bucket.lastActivityAt)) {
        bucket.lastActivityAt = answer.answeredAt
      }

      buckets.set(key, bucket)
    }
  }

  return Array.from(buckets.entries())
    .map(([id, bucket]) => {
      const evidence = round2(bucket.evidence)
      const correctEvidence = round2(bucket.correctEvidence)
      return {
        id,
        theoryId: bucket.theoryId,
        blockId: bucket.blockId,
        evidence,
        correctEvidence,
        accuracy: evidence > 0 ? Math.round((correctEvidence / evidence) * 100) : 0,
        status: getMasteryStatus(correctEvidence, evidence),
        answeredCount: bucket.answeredCount,
        correctCount: bucket.correctCount,
        lastActivityAt: bucket.lastActivityAt,
      }
    })
    .sort(
      (a, b) =>
        masteryPriority(a.status) - masteryPriority(b.status) ||
        a.accuracy - b.accuracy ||
        b.evidence - a.evidence
    )
}

/** Tra cứu nhanh theo theory id. Một theory có thể có nhiều block con. */
export function rollUpByTheory(stats: MasteryStat[]): Map<string, MasteryStat> {
  const byTheory = new Map<string, Bucket>()

  for (const stat of stats) {
    if (!stat.theoryId) continue
    const bucket = byTheory.get(stat.theoryId) || {
      theoryId: stat.theoryId,
      blockId: null,
      evidence: 0,
      correctEvidence: 0,
      answeredCount: 0,
      correctCount: 0,
      lastActivityAt: null,
    }
    bucket.evidence += stat.evidence
    bucket.correctEvidence += stat.correctEvidence
    bucket.answeredCount += stat.answeredCount
    bucket.correctCount += stat.correctCount
    if (stat.lastActivityAt && (!bucket.lastActivityAt || stat.lastActivityAt > bucket.lastActivityAt)) {
      bucket.lastActivityAt = stat.lastActivityAt
    }
    byTheory.set(stat.theoryId, bucket)
  }

  const result = new Map<string, MasteryStat>()
  for (const [theoryId, bucket] of byTheory) {
    const evidence = round2(bucket.evidence)
    const correctEvidence = round2(bucket.correctEvidence)
    result.set(theoryId, {
      id: `theory:${theoryId}`,
      theoryId,
      blockId: null,
      evidence,
      correctEvidence,
      accuracy: evidence > 0 ? Math.round((correctEvidence / evidence) * 100) : 0,
      status: getMasteryStatus(correctEvidence, evidence),
      answeredCount: bucket.answeredCount,
      correctCount: bucket.correctCount,
      lastActivityAt: bucket.lastActivityAt,
    })
  }
  return result
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
