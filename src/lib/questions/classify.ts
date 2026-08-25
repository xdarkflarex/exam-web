/**
 * Gợi ý chủ đề cho câu hỏi Toán THPT, dựa trên dấu hiệu trong nội dung.
 *
 * VÌ SAO LUẬT CHỨ KHÔNG PHẢI AI. Chỗ này đang đi SỬA những câu mà AI phân loại
 * sai. Chạy lại cùng một mô hình trên cùng một câu phần lớn sẽ ra lại cùng một
 * kết quả sai, chỉ tốn thêm tiền và thêm một lượt chờ. Luật thì đọc được, sửa
 * được, và chạy lại cho ra đúng kết quả cũ — nên khi nó sai, sai một lần là sửa
 * được vĩnh viễn.
 *
 * BẤT BIẾN: hàm này KHÔNG BAO GIỜ tự nghĩ ra chủ đề. Nó chỉ chọn trong danh
 * sách `topics` có thật của database. Không khớp được thì trả `null` — thà
 * không gợi ý còn hơn gợi ý một nhánh không tồn tại rồi ghi hỏng dữ liệu.
 */

import { normalizeQuestion } from './normalize.ts'

export interface TopicLike {
  id: string
  name: string
}

export interface Suggestion {
  topicId: string
  topicName: string
  /** Các dấu hiệu đã bắt được, để người duyệt biết vì sao máy đề xuất thế. */
  signals: string[]
  /** Số dấu hiệu khớp. Càng nhiều càng chắc, nhưng KHÔNG phải xác suất. */
  score: number
}

/**
 * Bảng luật: mỗi mạch kiến thức gồm các từ khoá nhận dạng của nó, và các từ
 * khoá dùng để tìm đúng chủ đề tương ứng trong bảng `topics`.
 *
 * `match` chạy trên nội dung ĐÃ CHUẨN HOÁ (thường, bỏ dấu câu, `\dfrac` đã về
 * `\frac`) nên viết thường hết và dùng đúng dạng LaTeX đã quy chuẩn.
 */
interface Rule {
  /** Tên gọi của mạch, chỉ để hiển thị lý do. */
  label: string
  /** Dấu hiệu trong nội dung câu hỏi. */
  match: RegExp[]
  /** Từ khoá để dò tên chủ đề trong database. */
  topicHints: string[]
}

const RULES: readonly Rule[] = [
  {
    label: 'Nguyên hàm – Tích phân',
    match: [/\\int/, /nguyên hàm/, /tích phân/, /diện tích hình phẳng/, /thể tích vật thể tròn xoay/],
    topicHints: ['nguyên hàm', 'tích phân'],
  },
  {
    label: 'Ứng dụng đạo hàm',
    match: [/đồng biến/, /nghịch biến/, /cực (đại|tiểu|trị)/, /tiệm cận/, /bảng biến thiên/, /giá trị (lớn|nhỏ) nhất/],
    topicHints: ['đạo hàm', 'khảo sát', 'hàm số'],
  },
  {
    label: 'Toạ độ trong không gian',
    match: [/oxyz/, /vectơ pháp tuyến/, /mặt phẳng \(p\)/, /phương trình mặt cầu/],
    topicHints: ['toạ độ', 'tọa độ', 'không gian', 'oxyz'],
  },
  {
    label: 'Hình học không gian',
    match: [/hình chóp/, /lăng trụ/, /khối (chóp|lăng trụ|nón|trụ|cầu)/, /góc giữa hai mặt phẳng/, /khoảng cách từ điểm/],
    topicHints: ['không gian', 'hình học', 'khối'],
  },
  {
    label: 'Mũ – Logarit',
    match: [/logarit/, /\\log/, /\\ln/, /phương trình mũ/, /bất phương trình mũ/],
    topicHints: ['mũ', 'logarit'],
  },
  {
    label: 'Cấp số',
    match: [/cấp số (cộng|nhân)/, /công bội/, /công sai/],
    topicHints: ['cấp số', 'dãy số'],
  },
  {
    label: 'Xác suất – Thống kê',
    match: [/xác suất/, /biến cố/, /phương sai/, /độ lệch chuẩn/, /trung vị/, /tứ phân vị/],
    topicHints: ['xác suất', 'thống kê'],
  },
  {
    label: 'Số phức',
    match: [/số phức/, /phần thực/, /phần ảo/, /mô ?đun của số phức/],
    topicHints: ['số phức'],
  },
  {
    label: 'Giới hạn',
    match: [/\\lim/, /giới hạn của dãy/, /liên tục tại/],
    topicHints: ['giới hạn', 'liên tục'],
  },
  {
    label: 'Lượng giác',
    match: [/lượng giác/, /\\sin/, /\\cos/, /\\tan/, /\\cot/],
    topicHints: ['lượng giác'],
  },
]

/** Bỏ dấu tiếng Việt để so tên chủ đề chịu được cách gõ khác nhau. */
function foldVietnamese(text: string): string {
  return (
    text
      // Hạ chữ thường TRƯỚC. Nếu đổi `đ` -> `d` trước rồi mới hạ chữ thường thì
      // `Đ` HOA sót lại: "Đạo hàm" fold ra "đao ham" chứ không phải "dao ham",
      // và luật "đạo hàm" không bao giờ khớp được tên chủ đề trong database.
      .toLowerCase()
      .normalize('NFD')
      // U+0300–U+036F: dải dấu tổ hợp mà NFD vừa tách ra khỏi nguyên âm.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd')
  )
}


/**
 * Gợi ý chủ đề cho một câu.
 *
 * Trả về danh sách đã sắp theo độ chắc giảm dần; rỗng nghĩa là không có luật
 * nào khớp, HOẶC luật khớp nhưng database không có chủ đề tương ứng.
 */
export function suggestTopics(content: string, topics: TopicLike[]): Suggestion[] {
  const text = normalizeQuestion(content)
  if (!text) return []

  const folded = topics.map((topic) => ({ topic, folded: foldVietnamese(topic.name) }))
  const suggestions: Suggestion[] = []

  for (const rule of RULES) {
    const hits = rule.match.filter((pattern) => pattern.test(text)).length
    if (hits === 0) continue

    // Tìm chủ đề THẬT khớp gợi ý. Không có thì bỏ luật này — không bịa nhánh.
    const hints = rule.topicHints.map(foldVietnamese)
    const target = folded.find((entry) => hints.some((hint) => entry.folded.includes(hint)))
    if (!target) continue

    const existing = suggestions.find((item) => item.topicId === target.topic.id)
    if (existing) {
      existing.score += hits
      existing.signals.push(rule.label)
      continue
    }

    suggestions.push({
      topicId: target.topic.id,
      topicName: target.topic.name,
      signals: [rule.label],
      score: hits,
    })
  }

  return suggestions.sort((left, right) => right.score - left.score)
}

/**
 * Gợi ý DUY NHẤT, hoặc `null` khi máy không đủ chắc.
 *
 * Trả `null` khi hai chủ đề khác nhau cùng điểm cao nhất: một câu hình chóp
 * đặt trong `Oxyz` khớp cả hai mạch, và đoán bừa một trong hai chính là kiểu
 * sai mà đợt phân loại này đang đi dọn. Không chắc thì để người soạn quyết.
 */
export function suggestTopic(content: string, topics: TopicLike[]): Suggestion | null {
  const all = suggestTopics(content, topics)
  if (all.length === 0) return null
  if (all.length > 1 && all[0].score === all[1].score) return null
  return all[0]
}
