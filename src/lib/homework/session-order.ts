import { COGNITIVE_LEVELS, type CognitiveLevel } from '../theories/cognitive.ts'

/**
 * Xếp thứ tự câu hỏi của một bài tập về nhà sao cho MỖI ĐOẠN đi từ dễ tới khó.
 *
 * YÊU CẦU GỐC (chủ dự án, 2026-09-03): "1 session 10 câu hỏi thì làm 10 câu độ
 * khó tăng dần theo level NB, TH, VD, VDC".
 *
 * VÌ SAO KHÔNG PHẢI LÀ `sort(theo level)` RỒI CẮT
 * Sắp cả bài theo độ khó rồi cắt thành từng đoạn 10 câu cho ra đoạn 1 toàn NB
 * và đoạn cuối toàn VDC. Học sinh làm đoạn cuối gặp mười câu vận dụng cao liên
 * tiếp và bỏ dở — đó là bài khó dần theo ĐOẠN, không phải theo CÂU. Cái được
 * yêu cầu là mỗi đoạn tự nó là một đường dốc: mở bằng câu nhận biết để vào
 * nhịp, đóng bằng câu vận dụng.
 *
 * CÁCH LÀM — hai bước, và thứ tự hai bước này là toàn bộ điểm mấu chốt
 *   1. CHIA đều mỗi mức nhận thức ra khắp các đoạn (`dealAcrossSessions`), để
 *      đoạn nào cũng có đủ bốn tầng chứ không dồn hết VDC vào một đoạn.
 *   2. Trong từng đoạn mới SẮP theo mức tăng dần.
 * Làm ngược lại (sắp trước, chia sau) thì quay về đúng chỗ hỏng ở trên.
 *
 * SỨC CHỨA CỦA ĐOẠN LÀ RÀNG BUỘC CỨNG. Giáo viên đặt `session_size = 10` thì
 * đoạn phải đúng 10 câu (đoạn cuối lấy phần dư). Nên phép chia ở bước 1 rải
 * theo TỶ LỆ LẤP ĐẦY chứ không chia đều tuyệt đối: bài 25 câu, cỡ đoạn 10, cho
 * ra 10/10/5 chứ không phải 9/8/8.
 *
 * ĐOẠN KIỂM TRA giữ nguyên vị trí cuối bài và KHÔNG bị chia lại — nó là một
 * khối do giáo viên chọn, không phải một lát cắt. Nhưng nó cũng được sắp tăng
 * dần trong khối, vì runner hiển thị nó như một đoạn và cùng lý lẽ sư phạm áp
 * dụng.
 *
 * TÍNH ỔN ĐỊNH. Hàm này thuần và tất định: cùng danh sách câu + cùng cỡ đoạn
 * luôn cho cùng thứ tự, nên học sinh tải lại trang giữa chừng thấy y nguyên bài
 * cũ. Điều KHÔNG được bảo đảm là thứ tự giữ nguyên qua các lần đổi bài: giáo
 * viên thêm/bớt một câu là cả bài xếp lại. Bài đang làm dở lúc deploy lần đầu
 * cũng xếp lại một lần — câu trả lời khoá theo `question_id` nên không mất dữ
 * liệu, chỉ là thứ tự khác lần trước.
 */

/** Thứ hạng độ khó. Chỉ số trong `COGNITIVE_LEVELS` chính là thứ hạng. */
function levelRank(level: CognitiveLevel): number {
  return COGNITIVE_LEVELS.indexOf(level)
}

/** Thứ tự ổn định giữa hai câu CÙNG mức: giữ đúng thứ tự giáo viên đã đặt. */
function byTeacherOrder(left: OrderableQuestion, right: OrderableQuestion): number {
  if (left.order_index !== right.order_index) return left.order_index - right.order_index
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** Phần tối thiểu hàm này cần biết về một câu hỏi. */
export interface OrderableQuestion {
  id: string
  order_index: number
  level: CognitiveLevel
  /** Thiếu = 'practice', khớp với `DEFAULT 'practice'` của cột `phase`. */
  phase?: 'practice' | 'test'
}

/**
 * HIỆU CHỈNH THEO NĂNG LỰC HỌC SINH — chưa làm, và đây là ghi chú về chỗ làm.
 *
 * Khi đã có dữ liệu năng lực, việc "bài dễ hơn cho học sinh yếu" là THÊM/BỎ câu
 * chứ không phải đổi thứ tự: học sinh khá bỏ bớt NB và kéo dài phần VD/VDC, học
 * sinh yếu thì ngược lại. Việc đó thuộc bước CHỌN câu lúc giao bài (ghi vào
 * `homework_questions`), không thuộc hàm này. Hàm này giữ đúng một trách nhiệm:
 * đã có tập câu thì xếp thế nào — và trách nhiệm đó không đổi khi tập câu được
 * chọn thông minh hơn.
 *
 * Nguồn dữ liệu năng lực: `src/lib/analytics/student-capability.ts`.
 */
export interface ArrangeOptions {
  /** Số câu mỗi đoạn luyện, lấy từ `homeworks.session_size`. */
  sessionSize: number
}

/**
 * Rải các câu cùng một mức ra khắp các đoạn, không làm tràn đoạn nào.
 *
 * Mỗi câu đi vào đoạn đang có TỶ LỆ lấp đầy thấp nhất trong số các đoạn còn
 * chỗ. Dùng tỷ lệ chứ không dùng số tuyệt đối vì đoạn cuối thường ngắn hơn:
 * so bằng số tuyệt đối sẽ nhồi cho đoạn cuối đầy trước rồi mới quay lại các
 * đoạn dài, làm lệch phân bố độ khó về cuối bài.
 */
function dealAcrossSessions<T extends OrderableQuestion>(
  items: T[],
  capacities: number[]
): T[][] {
  const buckets: T[][] = capacities.map(() => [])
  for (const item of items) {
    let target = -1
    let bestRatio = Number.POSITIVE_INFINITY
    for (let i = 0; i < capacities.length; i++) {
      if (buckets[i].length >= capacities[i]) continue
      const ratio = buckets[i].length / capacities[i]
      if (ratio < bestRatio) {
        bestRatio = ratio
        target = i
      }
    }
    // Không còn chỗ ở đâu cả thì tổng sức chứa nhỏ hơn số câu — không xảy ra vì
    // `capacities` được tính từ chính số câu. Dồn vào đoạn cuối còn hơn mất câu.
    if (target === -1) target = capacities.length - 1
    buckets[target].push(item)
  }
  return buckets
}

/**
 * Trả về danh sách câu đã xếp lại, phẳng, theo đúng thứ tự runner sẽ cắt đoạn.
 *
 * Runner (`HomeworkRunner`) cắt mảng này thành từng `sessionSize` câu cho phần
 * luyện, và gom toàn bộ câu `test` thành một đoạn cuối — nên thứ tự phẳng ở đây
 * đủ để quyết định nội dung từng đoạn.
 */
export function arrangeHomeworkSessions<T extends OrderableQuestion>(
  questions: T[],
  { sessionSize }: ArrangeOptions
): T[] {
  const practice = questions.filter(question => question.phase !== 'test')
  const test = questions.filter(question => question.phase === 'test')

  const size = Math.max(1, Math.floor(sessionSize) || 1)
  const sessionCount = Math.ceil(practice.length / size)

  const capacities: number[] = []
  for (let i = 0; i < sessionCount; i++) {
    capacities.push(Math.min(size, practice.length - i * size))
  }

  // Rải từng mức một, theo thứ tự NB -> VDC. Rải theo mức chứ không rải cả tập
  // một lượt: có thế mỗi mức mới trải đều, và đó là điều kiện để mỗi đoạn có đủ
  // bốn tầng.
  const dealt: T[][] = capacities.map(() => [])
  for (const level of COGNITIVE_LEVELS) {
    const ofLevel = practice.filter(question => question.level === level).sort(byTeacherOrder)
    const spread = dealAcrossSessions(ofLevel, capacities.map((cap, i) => cap - dealt[i].length))
    spread.forEach((chunk, i) => dealt[i].push(...chunk))
  }

  const out: T[] = []
  for (const session of dealt) {
    session.sort((left, right) => {
      const delta = levelRank(left.level) - levelRank(right.level)
      return delta !== 0 ? delta : byTeacherOrder(left, right)
    })
    out.push(...session)
  }

  test.sort((left, right) => {
    const delta = levelRank(left.level) - levelRank(right.level)
    return delta !== 0 ? delta : byTeacherOrder(left, right)
  })
  out.push(...test)

  return out
}
