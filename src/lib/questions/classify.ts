/**
 * Gợi ý phân loại cho câu hỏi Toán THPT, dựa trên dấu hiệu trong nội dung.
 *
 * VÌ SAO LUẬT CHỨ KHÔNG PHẢI AI. Chỗ này đang đi SỬA những câu mà AI phân loại
 * sai. Chạy lại cùng một mô hình trên cùng một câu phần lớn sẽ ra lại cùng một
 * kết quả sai, chỉ tốn thêm tiền và thêm một lượt chờ. Luật thì đọc được, sửa
 * được, và chạy lại cho ra đúng kết quả cũ — nên khi nó sai, sai một lần là sửa
 * được vĩnh viễn.
 *
 * BẤT BIẾN: hàm này KHÔNG BAO GIỜ tự nghĩ ra nhánh. Nó chỉ chọn trong danh sách
 * `topics`/`categories` có thật của database. Không khớp được thì trả `null` —
 * thà không gợi ý còn hơn gợi ý một nhánh không tồn tại rồi ghi hỏng dữ liệu.
 *
 * ==========================================================================
 * BẢN SIẾT NGÀY 2026-09-04 — ba lỗi đo được trên ngân hàng thật (1621 câu)
 * ==========================================================================
 *
 * 1. TẦNG LUẬT GẦN NHƯ CHẾT. `topicHints` chỉ được dò trong tên `topics`, mà
 *    cây đang dùng có topics là "Đại số", "Thống kê", "MỘT SỐ YẾU TỐ GIẢI
 *    TÍCH"... — tên môn học thật ("Cấp số cộng", "Lượng giác (Lớp 11)", "Tổ hợp
 *    và nhị thức Newton") nằm ở tầng CATEGORY. Nên hint 'cấp số' không tìm thấy
 *    topic nào, luật `continue`, và câu rơi thẳng xuống AI. Chỉ đúng một luật
 *    (Xác suất – Thống kê) từng khớp được.
 *
 *    Hệ quả đo được: 112 câu ghi thẳng "cấp số cộng", "công sai", "dãy số" bị
 *    AI xếp vào "Tổ hợp và nhị thức Newton" (52 câu) và "Thống kê liên tục"
 *    (36 câu). KHÔNG câu nào vào đúng chương.
 *
 *    Sửa: dò hint ở CẢ HAI tầng, và khớp ở tầng category thì thắng — nó cụ thể
 *    hơn, và trả về được luôn `categoryId` để người duyệt không phải chọn tay.
 *
 * 2. KHÔNG CÓ DẤU HIỆU PHỦ ĐỊNH. "Tổ hợp và nhị thức Newton" hút mọi câu có
 *    `u_n`, `n!`, `C_n^k` — kể cả câu cấp số nhân. Giờ mỗi luật có `exclude`:
 *    thấy dấu hiệu của mạch khác thì tự loại mình ra.
 *
 * 3. DẤU HIỆU QUÁ RỘNG. Luật Lượng giác cũ khớp `\sin` trần, mà `\sin` xuất
 *    hiện trong cả câu dãy số, câu đạo hàm, câu tích phân. Ký hiệu hàm KHÔNG
 *    còn tự nó đủ để kết luận; phải có từ chỉ chủ đề đi kèm.
 */

import { normalizeQuestion } from './normalize.ts'

export interface TopicLike {
  id: string
  name: string
}

/** Một chương trong cây. `topic_id` để suy ngược ra chủ đề cha. */
export interface CategoryLike {
  id: string
  name: string
  topic_id: string
}

export interface Suggestion {
  topicId: string
  topicName: string
  /** Chương, khi luật khớp được tới tầng đó. `null` khi chỉ ra tới chủ đề. */
  categoryId: string | null
  categoryName: string | null
  /** Các dấu hiệu đã bắt được, để người duyệt biết vì sao máy đề xuất thế. */
  signals: string[]
  /** Số dấu hiệu khớp. Càng nhiều càng chắc, nhưng KHÔNG phải xác suất. */
  score: number
}

/**
 * Bảng luật: mỗi mạch kiến thức gồm dấu hiệu nhận dạng của nó, dấu hiệu LOẠI
 * TRỪ, và các từ khoá dùng để tìm đúng nhánh trong `topics`/`categories`.
 *
 * `match` và `exclude` chạy trên nội dung ĐÃ CHUẨN HOÁ (thường, bỏ ký hiệu
 * phân định công thức, `\dfrac` đã về `\frac`) nên viết thường hết.
 */
interface Rule {
  /** Tên gọi của mạch, chỉ để hiển thị lý do. */
  label: string
  /** Dấu hiệu trong nội dung câu hỏi. */
  match: RegExp[]
  /**
   * Dấu hiệu KHIẾN LUẬT NÀY TỰ LOẠI. Thấy một cái là bỏ luôn, dù `match` khớp
   * bao nhiêu đi nữa.
   *
   * Đây là thứ chặn hiệu ứng "chương nam châm": trước khi có nó, "Tổ hợp và
   * nhị thức Newton" nhận 52 câu cấp số nhân chỉ vì chúng có `u_n` và luỹ thừa.
   */
  exclude?: RegExp[]
  /** Từ khoá dò tên CHƯƠNG. Ưu tiên hơn `topicHints` vì cụ thể hơn. */
  categoryHints?: string[]
  /** Từ khoá dò tên CHỦ ĐỀ. Dùng khi cây không có chương tương ứng. */
  topicHints?: string[]
}

/* Dấu hiệu của mạch dãy số / cấp số, dùng lại ở `exclude` của các luật khác.
   Gom vào một hằng để hai chỗ không lệch nhau khi sửa. */
const DAU_HIEU_DAY_SO: RegExp[] = [
  /dãy số/,
  /cấp số (cộng|nhân)/,
  /công sai/,
  /công bội/,
  /số hạng (đầu|tổng quát|thứ)/,
  /u_?\(?n\+1\)?\s*=/,
]

const RULES: readonly Rule[] = [
  {
    label: 'Nguyên hàm – Tích phân',
    match: [/\\int/, /nguyên hàm/, /tích phân/, /diện tích hình phẳng/, /thể tích vật thể tròn xoay/],
    categoryHints: ['nguyên hàm', 'tích phân'],
    topicHints: ['nguyên hàm', 'tích phân'],
  },
  {
    label: 'Ứng dụng đạo hàm',
    match: [/đồng biến/, /nghịch biến/, /cực (đại|tiểu|trị)/, /tiệm cận/, /bảng biến thiên/, /giá trị (lớn|nhỏ) nhất/],
    /* Dãy số cũng "tăng/giảm", cũng có "giá trị lớn nhất", nên phải loại trừ —
       nếu không, mạch đạo hàm nuốt câu về tính đơn điệu của dãy. */
    exclude: [/cấp số (cộng|nhân)/, /công sai/, /công bội/, /dãy số/],
    categoryHints: ['giải tích', 'đạo hàm'],
    topicHints: ['đạo hàm', 'khảo sát', 'hàm số'],
  },
  {
    label: 'Toạ độ trong không gian',
    match: [/oxyz/, /vectơ pháp tuyến/, /mặt phẳng \(p\)/, /phương trình mặt cầu/],
    categoryHints: ['toạ độ không gian', 'tọa độ không gian'],
    topicHints: ['toạ độ', 'tọa độ', 'không gian', 'oxyz'],
  },
  {
    label: 'Hình học không gian',
    match: [/hình chóp/, /lăng trụ/, /khối (chóp|lăng trụ|nón|trụ|cầu)/, /góc giữa hai mặt phẳng/, /khoảng cách từ điểm/],
    categoryHints: ['hình học không gian'],
    topicHints: ['không gian', 'hình học', 'khối'],
  },
  {
    label: 'Mũ – Logarit',
    match: [/logarit/, /\\log/, /\\ln/, /phương trình mũ/, /bất phương trình mũ/],
    /* Cấp số nhân đầy luỹ thừa, và lời giải hay dùng `\log` để tìm `n`. Không
       loại trừ thì luật này nuốt luôn mạch cấp số. */
    exclude: [/cấp số (cộng|nhân)/, /công bội/, /công sai/],
    categoryHints: ['mũ và lôgarit', 'mũ và logarit'],
    topicHints: ['mũ', 'logarit'],
  },
  {
    /* TÁCH RIÊNG KHỎI "Cấp số". Dãy số là một bài riêng trong SGK, và cây cũ giờ
       có chương "Dãy số" riêng (`20260910`). Gộp chung thì câu về số hạng tổng
       quát / tính bị chặn của dãy bị đẩy sang cấp số cộng. */
    label: 'Dãy số',
    match: [/dãy số/, /số hạng (đầu|tổng quát|thứ)/, /dãy.*(tăng|giảm|bị chặn)/],
    // Có "cấp số cộng/nhân" thì đó là bài cấp số, không phải bài dãy số.
    exclude: [/cấp số (cộng|nhân)/, /công sai/, /công bội/],
    categoryHints: ['dãy số'],
    topicHints: ['dãy số'],
  },
  {
    label: 'Cấp số cộng',
    match: [/cấp số cộng/, /công sai/],
    exclude: [/cấp số nhân/, /công bội/],
    categoryHints: ['cấp số cộng'],
    topicHints: ['cấp số', 'dãy số'],
  },
  {
    label: 'Cấp số nhân',
    match: [/cấp số nhân/, /công bội/],
    exclude: [/cấp số cộng/, /công sai/],
    categoryHints: ['cấp số nhân'],
    topicHints: ['cấp số', 'dãy số'],
  },
  {
    label: 'Tổ hợp – Nhị thức Newton',
    match: [/tổ hợp/, /chỉnh hợp/, /hoán vị/, /nhị thức newton/, /quy tắc đếm/],
    /* CHƯƠNG NAM CHÂM. Trước khi có `exclude`, chương này nhận 52 câu cấp số
       nhân — chúng có `u_n`, có luỹ thừa, và đôi khi cả `C_n^k`. */
    exclude: DAU_HIEU_DAY_SO,
    categoryHints: ['tổ hợp'],
    topicHints: ['tổ hợp'],
  },
  {
    label: 'Xác suất – Thống kê',
    match: [/xác suất/, /biến cố/, /phương sai/, /độ lệch chuẩn/, /trung vị/, /tứ phân vị/, /số liệu ghép nhóm/],
    /* "Thống kê liên tục" cũng là nam châm: nó nhận 36 câu dãy số, có lẽ vì cả
       hai đều nói tới "bảng", "số liệu", "giá trị thứ n". */
    exclude: DAU_HIEU_DAY_SO,
    categoryHints: ['thống kê', 'xác suất'],
    topicHints: ['xác suất', 'thống kê'],
  },
  {
    label: 'Số phức',
    match: [/số phức/, /phần thực/, /phần ảo/, /mô ?đun của số phức/],
    categoryHints: ['số phức'],
    topicHints: ['số phức'],
  },
  {
    label: 'Giới hạn',
    match: [/\\lim/, /giới hạn của dãy/, /liên tục tại/],
    categoryHints: ['giới hạn', 'liên tục'],
    topicHints: ['giới hạn', 'liên tục'],
  },
  {
    label: 'Lượng giác',
    /* SIẾT: `\sin` trần KHÔNG còn đủ để kết luận.

       Ký hiệu hàm lượng giác xuất hiện trong câu đạo hàm, tích phân, giới hạn,
       thậm chí dãy số — lấy nó làm dấu hiệu là mời mọi mạch khác vào đây. Giờ
       phải có TỪ CHỈ CHỦ ĐỀ ("lượng giác"), hoặc một cấu trúc chỉ mạch này mới
       có (phương trình lượng giác, giá trị lượng giác của một góc cụ thể). */
    match: [
      /lượng giác/,
      /phương trình.*(\\sin|\\cos|\\tan|\\cot)/,
      /(\\sin|\\cos|\\tan|\\cot)\s*\(?\s*(\\alpha|\\beta|x\b)/,
      /cung.*(lượng giác|góc)/,
    ],
    /* HÀM lượng giác không làm câu hỏi thành BÀI lượng giác. "Tìm giá trị lớn
       nhất của $y=\sqrt{1+\sin x}$" là bài GTLN–GTNN, chỉ mượn hàm sin; việc
       phải làm là đạo hàm, không phải công thức lượng giác.

       Đo được: bỏ nhóm loại trừ này thì hàng rào đòi chuyển 9 câu giải tích
       sang lượng giác, trong đó quá nửa là bắt oan đúng kiểu trên. */
    exclude: [
      ...DAU_HIEU_DAY_SO,
      /giá trị (lớn|nhỏ) nhất/,
      /đạo hàm/,
      /nguyên hàm/,
      /tích phân/,
      /đồng biến/,
      /nghịch biến/,
      /cực (đại|tiểu|trị)/,
      /tiệm cận/,
    ],
    categoryHints: ['lượng giác'],
    topicHints: ['lượng giác'],
  },
  {
    label: 'Mệnh đề – Tập hợp',
    match: [/phủ định của mệnh đề/, /tập con/, /phần bù/, /giao của hai tập/, /hợp của hai tập/, /tập hợp/],
    /* "Mệnh đề nào sau đây đúng?" là CÁCH HỎI, không phải chủ đề — nó có ở mọi
       mạch, nên KHÔNG được dùng làm dấu hiệu. Chỉ tính là mạch này khi câu nói
       VỀ mệnh đề/tập hợp, và loại ngay khi thấy dấu hiệu của mạch khác. */
    exclude: [
      ...DAU_HIEU_DAY_SO,
      /lượng giác/,
      /đạo hàm/,
      /tích phân/,
      /nguyên hàm/,
      /xác suất/,
      /hình chóp/,
      /oxyz/,
      /số phức/,
    ],
    categoryHints: ['mệnh đề'],
    topicHints: ['mệnh đề'],
  },
]

/** Bỏ dấu tiếng Việt để so tên nhánh chịu được cách gõ khác nhau. */
function foldVietnamese(text: string): string {
  return (
    text
      // Hạ chữ thường TRƯỚC. Nếu đổi `đ` -> `d` trước rồi mới hạ chữ thường thì
      // `Đ` HOA sót lại: "Đạo hàm" fold ra "đao ham" chứ không phải "dao ham",
      // và luật "đạo hàm" không bao giờ khớp được tên chủ đề trong database.
      .toLowerCase()
      .normalize('NFD')
      // U+0300–U+036F: dải dấu tổ hợp mà NFD vừa tách ra khỏi nguyên âm.
      .replace(/[[\u0300-\u036f]-[\u0300-\u036f]]/g, '')
      .replace(/\u0111/g, 'd')
  )
}

/** Luật có bị dấu hiệu phủ định loại ra không. */
function isExcluded(rule: Rule, text: string): boolean {
  return (rule.exclude ?? []).some((pattern) => pattern.test(text))
}

/**
 * Gợi ý phân loại cho một câu.
 *
 * Trả về danh sách đã sắp theo độ chắc giảm dần; rỗng nghĩa là không có luật
 * nào khớp, HOẶC luật khớp nhưng database không có nhánh tương ứng.
 *
 * `categories` là tuỳ chọn để không phá call-site cũ, nhưng THIẾU NÓ thì phần
 * lớn luật không khớp được với cây hiện tại — tên môn học thật nằm ở tầng
 * chương. Xem khối chú thích đầu file.
 */
export function suggestTopics(
  content: string,
  topics: TopicLike[],
  categories: CategoryLike[] = [],
): Suggestion[] {
  const text = normalizeQuestion(content)
  if (!text) return []

  const foldedTopics = topics.map((topic) => ({ topic, folded: foldVietnamese(topic.name) }))
  const foldedCategories = categories.map((category) => ({
    category,
    folded: foldVietnamese(category.name),
  }))
  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const suggestions: Suggestion[] = []

  for (const rule of RULES) {
    if (isExcluded(rule, text)) continue
    const hits = rule.match.filter((pattern) => pattern.test(text)).length
    if (hits === 0) continue

    /* Tìm nhánh THẬT khớp gợi ý — chương trước, chủ đề sau. Chương cụ thể hơn
       nên nó thắng: gợi ý tới tận chương thì người duyệt chỉ việc tick, còn gợi
       ý tới chủ đề thì vẫn phải tự tìm chương. */
    let topicId: string | null = null
    let topicName = ''
    let categoryId: string | null = null
    let categoryName: string | null = null

    /*
      NHIỀU CHƯƠNG CÙNG KHỚP THÌ KHÔNG CHỌN CHƯƠNG NÀO.

      Bản đầu dùng `.find()` — lấy chương ĐẦU TIÊN khớp bất kỳ hint nào. Thứ tự
      mảng `categories` là thứ tự database trả về, tức tuỳ ý, nên đó là chọn bừa.

      Đo được hậu quả trên 1324 câu đã phân loại: hàng rào báo mâu thuẫn 43%, mà
      dòng đầu bảng là 309 câu "Một số yếu tố giải tích" bị đòi đổi sang "Đạo hàm
      (Lớp 11)" — hai chương đều khớp (`giải tích` và `đạo hàm`), và cái nào đứng
      trước trong mảng thì thắng. Tương tự 71 câu Thống kê bị đòi đổi sang Xác
      suất vì rule có cả hai hint.

      Khớp nhiều nghĩa là luật KHÔNG phân biệt được — đúng lúc phải im lặng, chứ
      không phải lúc đoán. Rơi xuống tầng chủ đề; chủ đề cũng nhập nhằng thì bỏ
      hẳn luật này.
    */
    const catHints = (rule.categoryHints ?? []).map(foldVietnamese)
    const catMatches = catHints.length
      ? foldedCategories.filter((entry) => catHints.some((hint) => entry.folded.includes(hint)))
      : []
    const catHit = catMatches.length === 1 ? catMatches[0] : undefined

    if (catHit) {
      const parent = topicById.get(catHit.category.topic_id)
      // Chương mồ côi (chủ đề cha không có trong danh sách) thì bỏ qua: ghi một
      // `category_id` mà không có `topic_id` là để lại dữ liệu nửa vời.
      if (parent) {
        topicId = parent.id
        topicName = parent.name
        categoryId = catHit.category.id
        categoryName = catHit.category.name
      }
    }

    if (!topicId) {
      /* Cùng lý do như ở tầng chương: khớp nhiều chủ đề là không phân biệt được.
         Ngoại lệ DUY NHẤT — nhiều chương cùng khớp nhưng chúng CÙNG một chủ đề
         thì chủ đề vẫn chắc chắn, chỉ là chưa biết chương nào. */
      const parentsOfMatches = new Set(catMatches.map((entry) => entry.category.topic_id))
      if (catMatches.length > 1 && parentsOfMatches.size === 1) {
        const parent = topicById.get([...parentsOfMatches][0])
        if (parent) {
          topicId = parent.id
          topicName = parent.name
        }
      }
    }

    if (!topicId) {
      const topHints = (rule.topicHints ?? []).map(foldVietnamese)
      const topMatches = topHints.length
        ? foldedTopics.filter((entry) => topHints.some((hint) => entry.folded.includes(hint)))
        : []
      if (topMatches.length !== 1) continue
      topicId = topMatches[0].topic.id
      topicName = topMatches[0].topic.name
    }

    const existing = suggestions.find((item) => item.topicId === topicId && item.categoryId === categoryId)
    if (existing) {
      existing.score += hits
      existing.signals.push(rule.label)
      continue
    }

    suggestions.push({ topicId, topicName, categoryId, categoryName, signals: [rule.label], score: hits })
  }

  /* Gợi ý có chương xếp trên gợi ý chỉ có chủ đề khi điểm bằng nhau: cùng độ
     chắc thì cái cụ thể hơn có ích hơn. */
  return suggestions.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return Number(Boolean(right.categoryId)) - Number(Boolean(left.categoryId))
  })
}

/**
 * Gợi ý DUY NHẤT, hoặc `null` khi máy không đủ chắc.
 *
 * Trả `null` khi hai nhánh khác nhau cùng điểm cao nhất: một câu hình chóp đặt
 * trong `Oxyz` khớp cả hai mạch, và đoán bừa một trong hai chính là kiểu sai mà
 * đợt phân loại này đang đi dọn. Không chắc thì để người soạn quyết.
 */
export function suggestTopic(
  content: string,
  topics: TopicLike[],
  categories: CategoryLike[] = [],
): Suggestion | null {
  const all = suggestTopics(content, topics, categories)
  if (all.length === 0) return null
  if (all.length > 1 && all[0].score === all[1].score && !all[0].categoryId) return null
  if (all.length > 1 && all[0].score === all[1].score && all[1].categoryId) return null
  return all[0]
}

/**
 * HÀNG RÀO CHẶN AI: gợi ý của model có mâu thuẫn với bằng chứng hiển nhiên không.
 *
 * Trả về câu giải thích khi mâu thuẫn, `null` khi không có gì để nói.
 *
 * VÌ SAO CẦN, TRONG KHI ĐÃ CÓ "LUẬT CHẠY TRƯỚC". Luật chỉ chặn được câu mà nó
 * kết luận CHẮC CHẮN; câu nào luật trả `null` vẫn đi xuống AI, và ở đó model
 * tự do chọn bất cứ nhánh nào trong cây. Đo trên ngân hàng thật: câu ghi thẳng
 * "cấp số cộng, công sai d = 2" bị xếp vào "Thống kê liên tục". Không có tầng
 * nào nói "không" với chuyện đó.
 *
 * Hàng rào này KHÔNG cố sửa gợi ý — nó chỉ TỪ CHỐI. Sửa hộ model là đoán thay
 * nó, mà đoán chính là thứ đang hỏng; từ chối thì câu rơi về nhóm "máy chịu" và
 * người soạn quyết, đúng như thiết kế.
 */
export function findRuleConflict(
  content: string,
  chosen: { topicId: string | null; categoryId: string | null },
  topics: TopicLike[],
  categories: CategoryLike[] = [],
): string | null {
  if (!chosen.topicId) return null

  const best = suggestTopics(content, topics, categories)[0]
  if (!best) return null

  /* Chỉ chặn khi luật CHẮC CHẮN. Một dấu hiệu đơn lẻ có thể là trùng hợp; từ
     hai dấu hiệu trở lên, hoặc một dấu hiệu ở tầng chương, thì nội dung đã nói
     rõ nó thuộc mạch nào. */
  const confident = best.score >= 2 || Boolean(best.categoryId)
  if (!confident) return null

  if (best.categoryId && chosen.categoryId && chosen.categoryId !== best.categoryId) {
    return `Luật đọc ra mạch "${best.signals.join(', ')}" (chương "${best.categoryName}"), khác với chương AI chọn.`
  }
  if (chosen.topicId !== best.topicId) {
    return `Luật đọc ra mạch "${best.signals.join(', ')}" thuộc chủ đề "${best.topicName}", khác với chủ đề AI chọn.`
  }
  return null
}
