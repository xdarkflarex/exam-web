import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findRuleConflict, suggestTopic, suggestTopics } from './classify.ts'

/** Tên chủ đề viết đúng kiểu đang dùng trong database: có dấu, có chữ Đ hoa. */
const TOPICS = [
  { id: 't1', name: 'Nguyên hàm và tích phân' },
  { id: 't2', name: 'Đạo hàm và ứng dụng' },
  { id: 't3', name: 'Toạ độ trong không gian' },
  { id: 't4', name: 'Số phức' },
  { id: 't5', name: 'Xác suất và thống kê' },
]

test('bắt được nguyên hàm qua cả chữ lẫn lệnh LaTeX', () => {
  assert.equal(
    suggestTopic('Tìm nguyên hàm của hàm số $f(x) = x^2$', TOPICS)?.topicId,
    't1'
  )
  assert.equal(
    suggestTopic('Tính $\\int_0^1 (2x+1)\\,dx$', TOPICS)?.topicId,
    't1'
  )
})

/*
  Chủ đề bắt đầu bằng chữ "Đ" HOA. Đây là phép thử của việc bỏ dấu: nếu hạ chữ
  thường sau khi đổi `đ` thành `d` thì "Đạo hàm" fold ra "đao ham", không khớp
  từ khoá "dao ham", và cả mạch đạo hàm không bao giờ được gợi ý.
*/
test('khớp được chủ đề có chữ Đ hoa', () => {
  const suggestion = suggestTopic(
    'Cho hàm số $y = -x^3 + 3x^2 + 2$ đồng biến trên khoảng nào?',
    TOPICS
  )
  assert.equal(suggestion?.topicId, 't2')
  assert.equal(suggestion?.topicName, 'Đạo hàm và ứng dụng')
})

test('bắt được toạ độ không gian', () => {
  assert.equal(
    suggestTopic(
      'Trong không gian $Oxyz$, vectơ nào là vectơ pháp tuyến của mặt phẳng $(P): 2x - y + z + 3 = 0$?',
      TOPICS
    )?.topicId,
    't3'
  )
})

/*
  BẤT BIẾN QUAN TRỌNG NHẤT: không bao giờ bịa ra nhánh không có thật. Luật
  "Cấp số" khớp nội dung, nhưng danh sách chủ đề không có mạch đó — phải im
  lặng chứ không được gán bừa sang chủ đề gần nhất.
*/
test('luật khớp nhưng database không có chủ đề tương ứng thì không gợi ý', () => {
  const content = 'Cho cấp số nhân $(u_n)$ có công bội $q = -3$. Tính $u_3$.'
  assert.deepEqual(suggestTopics(content, TOPICS), [])
  assert.equal(suggestTopic(content, TOPICS), null)
})

test('không dấu hiệu nào thì không gợi ý', () => {
  assert.equal(suggestTopic('Mệnh đề nào sau đây sai?', TOPICS), null)
  assert.equal(suggestTopic('', TOPICS), null)
})

/*
  Hai mạch cùng điểm cao nhất -> trả `null`. Đoán bừa một trong hai chính là
  kiểu sai mà đợt phân loại lại này đang đi dọn.
*/
test('hai chủ đề ngang điểm thì không kết luận', () => {
  const content = 'Cho số phức $z$. Tính xác suất của biến cố đã cho.'
  const all = suggestTopics(content, TOPICS)
  assert.ok(all.length >= 2, 'phải nhận ra cả hai mạch')

  // Nếu hai mạch bằng điểm thì suggestTopic phải im lặng.
  if (all[0].score === all[1].score) {
    assert.equal(suggestTopic(content, TOPICS), null)
  }
})

test('nhiều dấu hiệu cùng mạch thì điểm cao hơn', () => {
  const yeu = suggestTopic('Tìm nguyên hàm của $f(x)$', TOPICS)
  const manh = suggestTopic(
    'Tính tích phân $\\int f(x)dx$ để tìm nguyên hàm và diện tích hình phẳng',
    TOPICS
  )
  assert.ok(manh && yeu && manh.score > yeu.score)
})

test('gợi ý kèm lý do để người duyệt biết vì sao', () => {
  const suggestion = suggestTopic('Tính $\\int_0^1 x\\,dx$', TOPICS)
  assert.ok(suggestion)
  assert.ok(suggestion.signals.length > 0)
  assert.ok(suggestion.signals[0].length > 0)
})

/* ==========================================================================
   BẢN SIẾT 2026-09-04 — mỗi test dưới đây khoá lại một lỗi ĐO ĐƯỢC trên ngân
   hàng thật (1621 câu), không phải một tình huống nghĩ ra.
   ========================================================================== */

/** Cây thật đang dùng: tên môn học nằm ở tầng CHƯƠNG, không phải tầng chủ đề. */
const CAY_THAT = {
  topics: [
    { id: 'dai-so', name: 'Đại số' },
    { id: 'thong-ke', name: 'Thống kê' },
    { id: 'giai-tich', name: 'MỘT SỐ YẾU TỐ GIẢI TÍCH' },
  ],
  categories: [
    { id: 'c-day-so', name: 'Dãy số', topic_id: 'dai-so' },
    { id: 'c-csc', name: 'Cấp số cộng', topic_id: 'dai-so' },
    { id: 'c-csn', name: 'Cấp số nhân', topic_id: 'dai-so' },
    { id: 'c-to-hop', name: 'Tổ hợp và nhị thức Newton (Lớp 10 + 11)', topic_id: 'dai-so' },
    { id: 'c-luong-giac', name: 'Lượng giác (Lớp 11)', topic_id: 'dai-so' },
    { id: 'c-tk-lien-tuc', name: 'Thống kê liên tục (Bảng số liệu ghép nhóm - Lớp 11 + 12)', topic_id: 'thong-ke' },
    { id: 'c-giai-tich', name: 'Một số yếu tố giải tích', topic_id: 'giai-tich' },
  ],
}

test('luật khớp được tới tầng CHƯƠNG, không dừng ở chủ đề', () => {
  // Trước bản siết: hint 'cấp số' chỉ dò trong `topics`, mà không topic nào tên
  // như vậy — luật chết, câu rơi xuống AI. 112 câu đã đi nhầm đường vì chuyện này.
  const s = suggestTopic(
    'Cho cấp số cộng $(u_n)$ có $u_1 = -3$, công sai $d = 2$. Tìm $u_5$.',
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.equal(s?.categoryId, 'c-csc')
  assert.equal(s?.topicId, 'dai-so')
})

test('dãy số và cấp số là hai mạch khác nhau', () => {
  const daySo = suggestTopic(
    'Cho dãy số $(u_n)$ với $u_n = 2^{n-1}$. Tìm số hạng thứ $10$ của dãy số đã cho.',
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.equal(daySo?.categoryId, 'c-day-so')

  const capSo = suggestTopic(
    'Trong các dãy số sau, dãy số nào là cấp số nhân?',
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.equal(capSo?.categoryId, 'c-csn', 'có "cấp số nhân" thì phải về cấp số nhân, không phải dãy số')
})

test('chương nam châm không nuốt được câu của mạch khác', () => {
  // Đo được: 52 câu cấp số nhân bị xếp vào "Tổ hợp và nhị thức Newton".
  const s = suggestTopic(
    'Cho cấp số nhân $(u_n)$ có công bội $q = 2$. Tính tổng $n$ số hạng đầu.',
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.equal(s?.categoryId, 'c-csn')
  assert.notEqual(s?.categoryId, 'c-to-hop')
})

test('hàm lượng giác KHÔNG làm câu giải tích thành câu lượng giác', () => {
  // "Tìm GTLN của $y=\sqrt{1+\sin x}$" là bài GTLN–GTNN, việc phải làm là đạo hàm.
  const s = suggestTopic(
    'Giá trị lớn nhất và giá trị nhỏ nhất của hàm số $y = \\sqrt{1 + \\sin x} - 3$ lần lượt là $M$, $m$.',
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.notEqual(s?.categoryId, 'c-luong-giac')
})

test('nhiều chương cùng khớp thì KHÔNG chọn bừa chương nào', () => {
  /*
    Hai chương cùng khớp hint của luật Xác suất – Thống kê. Bản đầu lấy chương
    đầu tiên trong mảng — tức chọn theo thứ tự database trả về. Hậu quả đo được:
    hàng rào báo mâu thuẫn 43% số câu đã phân loại, phần lớn là oan.
  */
  const cats = [
    ...CAY_THAT.categories,
    { id: 'c-xac-suat', name: 'Biến cố và xác suất cổ điển (Lớp 10 + 11)', topic_id: 'thong-ke' },
  ]
  const s = suggestTopic('Tính phương sai của mẫu số liệu ghép nhóm sau.', CAY_THAT.topics, cats)
  // Không kết luận được chương, nhưng hai chương cùng một chủ đề nên chủ đề vẫn chắc.
  assert.equal(s?.categoryId, null)
  assert.equal(s?.topicId, 'thong-ke')
})

test('HÀNG RÀO bắt được gợi ý mâu thuẫn với bằng chứng hiển nhiên', () => {
  // Đúng ca thật: câu cấp số cộng bị AI xếp vào "Thống kê liên tục".
  const why = findRuleConflict(
    'Cho cấp số cộng $(u_n)$ có số hạng đầu $u_1 = -3$, công sai $d = 2$.',
    { topicId: 'thong-ke', categoryId: 'c-tk-lien-tuc' },
    CAY_THAT.topics,
    CAY_THAT.categories,
  )
  assert.ok(why, 'phải từ chối')
  assert.ok(why.includes('Cấp số cộng'), why)
})

test('HÀNG RÀO im lặng khi gợi ý khớp với luật', () => {
  assert.equal(
    findRuleConflict(
      'Cho cấp số cộng $(u_n)$ có công sai $d = 2$.',
      { topicId: 'dai-so', categoryId: 'c-csc' },
      CAY_THAT.topics,
      CAY_THAT.categories,
    ),
    null,
  )
})

test('HÀNG RÀO im lặng khi luật không đủ chắc', () => {
  /*
    Chỉ TỪ CHỐI, không bao giờ đoán hộ. Câu không có dấu hiệu nào thì luật không
    có tư cách phản đối — để AI và người duyệt quyết.
  */
  assert.equal(
    findRuleConflict(
      'Tính giá trị của biểu thức $A = 2 + 3 \\times 4$.',
      { topicId: 'dai-so', categoryId: 'c-to-hop' },
      CAY_THAT.topics,
      CAY_THAT.categories,
    ),
    null,
  )
})

test('HÀNG RÀO không đụng tới gợi ý rỗng', () => {
  // `topic_id === null` là câu trả lời hợp lệ của AI: "cây không có nhánh nào hợp".
  assert.equal(
    findRuleConflict(
      'Cho cấp số cộng $(u_n)$ có công sai $d = 2$.',
      { topicId: null, categoryId: null },
      CAY_THAT.topics,
      CAY_THAT.categories,
    ),
    null,
  )
})

test('không có `categories` thì vẫn chạy như bản cũ, không nổ', () => {
  // Call-site cũ chỉ truyền `topics`. Phải còn dùng được, chỉ là kém chính xác hơn.
  const s = suggestTopic('Tính $\\int_0^1 x\\,dx$', [{ id: 't1', name: 'Nguyên hàm và tích phân' }])
  assert.equal(s?.topicId, 't1')
  assert.equal(s?.categoryId, null)
})
