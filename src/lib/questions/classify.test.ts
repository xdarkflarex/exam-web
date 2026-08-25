import assert from 'node:assert/strict'
import { test } from 'node:test'

import { suggestTopic, suggestTopics } from './classify.ts'

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
