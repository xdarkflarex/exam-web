import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gradeOf, splitRegions } from './grade-ladder.ts'

/*
  Mọi câu trong file này lấy nguyên văn từ ngân hàng thật (1621 câu, đo
  2026-09-08) hoặc rút gọn từ đó, trừ vài ca dựng riêng để chốt một nhánh luật.
  Không có dữ liệu học sinh.
*/

test('lấy lớp CAO NHẤT, không lấy lớp của chương đang nằm', () => {
  // Đang nằm ở "Mệnh đề và tập hợp (Lớp 10)" chỉ vì đề có chữ "tập hợp".
  const verdict = gradeOf('Hàm số $y=-x^3+3x^2-4$ đồng biến trên tập hợp nào sau đây?')
  assert.equal(verdict.grade, 12)
})

test('lôgarit (11) cộng xét đơn điệu hàm hợp (12) ra lớp 12', () => {
  // Đang nằm ở "Hàm số, đồ thị và ứng dụng (Lớp 10)".
  const verdict = gradeOf('Cho hàm số $y=\\log_3(x^2-2x+3)$. Hàm số đồng biến trên khoảng nào?')
  assert.equal(verdict.grade, 12)
})

/* ------------------------------------------------------------------ *
   BẢNG CẶP — chỗ mà `max` của hai vế cho ra kết quả SAI
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
   HÀM BẬC HAI: LÝ THUYẾT LÀ LỚP 10, THỰC TẾ LÀ LỚP 12

   Quyết định của chủ dự án 2026-09-08. Cùng một công thức, hai lớp khác nhau,
   và cái phân biệt nằm ở bối cảnh đề chứ không ở việc phải làm. Nhóm phép thử
   này khoá cả hai chiều — chỉ khoá một chiều thì lần siết luật sau có thể kéo
   cả nhóm về một phía mà test vẫn xanh.
 * ------------------------------------------------------------------ */

test('hàm bậc hai LÝ THUYẾT: xét đơn điệu là lớp 10', () => {
  const verdict = gradeOf('Hàm số $y = -4x^2 + 16x + 2025$ nghịch biến trên khoảng nào sau đây?')
  assert.equal(verdict.grade, 10)
  assert.ok(verdict.units.some((unit) => unit.kind === 'cap'))
})

test('hàm bậc hai LÝ THUYẾT: tìm GTLN–GTNN là lớp 10', () => {
  const verdict = gradeOf(
    'Cho hàm số bậc hai $f(x) = ax^2 + bx + c$ có đồ thị $(P)$. Gọi $M$ là giá trị nhỏ nhất của hàm số.'
  )
  assert.equal(verdict.grade, 10)
})

test('hàm bậc hai LÝ THUYẾT: hỏi đỉnh, trục đối xứng là lớp 10', () => {
  assert.equal(gradeOf('Trục đối xứng của parabol $y = -x^2 + 5x + 3$ là đường thẳng').grade, 10)
  assert.equal(gradeOf('Cho parabol $(P): y = 3x^2 - 2x + 1$. Điểm nào là đỉnh của $(P)$?').grade, 10)
})

/* Hai câu thật trong ngân hàng. Chúng dùng đúng công thức parabol lớp 10 nhưng
   có bối cảnh đời sống, nên thuộc nhóm "ứng dụng … thực tiễn" của đề lớp 12. */
test('hàm bậc hai THỰC TẾ: bài cổng parabol là lớp 12', () => {
  const verdict = gradeOf(
    'Cổng Arch tại thành phố St Louis của Mỹ có hình dạng là một parabol. Biết khoảng cách ' +
      'giữa hai chân cổng bằng $162$ m. Trên thành cổng, người ta muốn đo chiều cao.'
  )
  assert.equal(verdict.grade, 12)
  assert.ok(verdict.units.some((unit) => unit.code === 'ham-bac-hai-thuc-te'))
})

test('hàm bậc hai THỰC TẾ: bài ném bóng là lớp 12', () => {
  const verdict = gradeOf(
    'Nữ vận động viên bóng chuyền đánh một quả bóng sang phần sân đối phương với vị trí ban ' +
      'đầu từ độ cao $4$ ft. Quỹ đạo quả bóng là parabol $y = -x^2 + 4x + 1$. Tìm độ cao lớn nhất.'
  )
  assert.equal(verdict.grade, 12)
})

test('hàm bậc hai THỰC TẾ: bài chi phí sản xuất là lớp 12', () => {
  const verdict = gradeOf(
    'Một doanh nghiệp sản xuất $x$ sản phẩm với chi phí $C(x) = x^2 - 40x + 500$ (triệu đồng). ' +
      'Tìm $x$ để chi phí nhỏ nhất.'
  )
  assert.equal(verdict.grade, 12)
})

/*
  ĐƠN VỊ ĐO ĐƠN THUẦN KHÔNG BIẾN MỘT CÂU THÀNH CÂU THỰC TẾ.

  Nếu lấy "có số kèm cm/m" làm dấu hiệu thì mọi bài hình học đều thành bài thực
  tế. Phải có CHỦ THỂ hoặc ĐẠI LƯỢNG đời sống.
*/
test('đơn vị đo một mình không đủ để thành câu thực tế', () => {
  const verdict = gradeOf('Cho parabol $(P): y = x^2 - 4x$ cắt trục hoành tại hai điểm cách nhau $4$ cm.')
  assert.equal(verdict.grade, 10)
  assert.ok(!verdict.units.some((unit) => unit.code === 'ham-bac-hai-thuc-te'))
})

test('GTNN của $y = 2\\sin x + 5$ là lớp 11 — chặn được, không cần đạo hàm', () => {
  const verdict = gradeOf('Giá trị nhỏ nhất của hàm số $y = 2\\sin x + 5$ là')
  assert.equal(verdict.grade, 11)
})

test('$y = \\sin x$ đồng biến trên khoảng nào là lớp 11 — đọc đồ thị', () => {
  assert.equal(gradeOf('Hàm số $y = \\sin x$ đồng biến trên khoảng').grade, 11)
})

/*
  ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA CẢ FILE.

  Cùng "GTLN của một biểu thức chứa sin", nhưng dạng hàm khác nhau. Máy KHÔNG
  được im lặng hạ lớp câu dưới xuống 11 chỉ vì nó thấy `\sin` — nếu thật sự phải
  đạo hàm thì đó là bài lớp 12, và hạ lớp nghĩa là giao bài lớp 12 cho học sinh
  lớp 11. Chưa nhận ra dạng đơn giản thì giữ lớp cao VÀ báo `uncertain`.
*/
test('dạng hàm không nhận ra được thì giữ lớp cao và báo cần người xem', () => {
  const verdict = gradeOf(
    'Giá trị lớn nhất và giá trị nhỏ nhất của hàm số $y = \\sqrt{1 + \\sin x} - 3$ lần lượt là $M$, $m$.'
  )
  assert.equal(verdict.grade, 12)
  assert.equal(verdict.uncertain, true)
})

test('phương sai một mình không quyết được lớp — mẫu quyết định', () => {
  const roiRac = gradeOf('Tính phương sai của mẫu số liệu sau: $2; 4; 6; 8$.')
  assert.equal(roiRac.grade, 10)

  const ghepNhom = gradeOf('Tính phương sai của mẫu số liệu ghép nhóm sau.')
  assert.equal(ghepNhom.grade, 12)

  const trungViGhepNhom = gradeOf('Số trung vị của mẫu số liệu ghép nhóm này là')
  assert.equal(trungViGhepNhom.grade, 11)
})

test('thể tích khối chóp là 11, thể tích bằng tích phân là 12', () => {
  assert.equal(gradeOf('Tính thể tích của khối chóp $S.ABCD$ có đáy là hình vuông.').grade, 11)
  assert.equal(
    gradeOf('Sử dụng tích phân để tính thể tích của khối tròn xoay tạo bởi hình phẳng.').grade,
    12
  )
})

/* ------------------------------------------------------------------ *
   VÙNG VĂN BẢN — mục B1
 * ------------------------------------------------------------------ */

test('tách được chú thích hình ra khỏi thân đề', () => {
  const parts = splitRegions('Cho hàm số $y=f(x)$. [HÌNH: đồ thị hình chóp nhọn]')
  assert.ok(!parts.de.includes('hình chóp'))
  assert.ok(parts.hinh.includes('hình chóp'))
})

/*
  Câu thật, đang bị xếp vào "Hình học không gian Euclid (Lớp 11)" vì chú thích
  hình có chữ "hình chóp". Chú thích chỉ mô tả bức tranh — nó không được biến
  một câu khảo sát hàm số thành câu hình không gian.
*/
test('chú thích hình không kéo câu sang mạch khác', () => {
  const verdict = gradeOf(
    'Cho hàm số $y = f(x)$ có đồ thị như hình vẽ. Hàm số đồng biến trên khoảng nào dưới đây? ' +
      '[HÌNH: đồ thị hình chóp nhọn]'
  )
  // Chú thích vẫn được ghi nhận là ĐỐI TƯỢNG, nhưng ở vùng `hinh`…
  const hinhUnits = verdict.units.filter((unit) => unit.region === 'hinh')
  assert.ok(hinhUnits.every((unit) => unit.kind === 'doi-tuong'))
  // …và không có VIỆC nào được đọc từ chú thích.
  assert.ok(!verdict.units.some((unit) => unit.region === 'hinh' && unit.kind === 'viec'))
})

test('bỏ tiền tố nguồn đề trước khi đọc', () => {
  const parts = splitRegions('(THPT Lê Thánh Tông - HCM 2025) Cho hàm số $y=x^2$.')
  assert.ok(!parts.de.includes('THPT'))
})

/* ------------------------------------------------------------------ *
   KHỚP THEO TOKEN — mục B3
 * ------------------------------------------------------------------ */

test('"kilogam" không phải lôgarit', () => {
  // Câu thật: bài quy hoạch tuyến tính lớp 10, có chữ "kilogam thịt bò".
  const verdict = gradeOf(
    'Một gia đình cần ít nhất $1200$ đơn vị protein mỗi ngày. Mỗi kilogam thịt bò chứa $800$ ' +
      'đơn vị protein. Tìm miền nghiệm của hệ bất phương trình.'
  )
  assert.ok(!verdict.units.some((unit) => unit.code === 'mu-log'))
  assert.equal(verdict.grade, 10)
})

/* ------------------------------------------------------------------ *
   KHÔNG BIẾT THÌ NÓI KHÔNG BIẾT — mục D5
 * ------------------------------------------------------------------ */

test('không đủ dấu hiệu thì trả null, KHÔNG trả 12', () => {
  const verdict = gradeOf('Chọn khẳng định đúng.')
  assert.equal(verdict.grade, null)
  assert.deepEqual(verdict.units, [])
})

test('các Ý chỉ được ghép cho true_false và short_answer', () => {
  const de = 'Cho hàm số $y=f(x)$ có đồ thị như hình vẽ.'
  const answers = ['Hàm số nghịch biến trên $(0;2)$.', 'Đồ thị có tiệm cận đứng $x=1$.']

  const dungSai = gradeOf(de, { questionType: 'true_false', answers })
  assert.equal(dungSai.grade, 12)

  // Trắc nghiệm: ba trên bốn phương án là đáp án SAI, thường là công thức của
  // mạch khác. Ghép vào là để cái bẫy của đề quyết định lớp.
  const tracNghiem = gradeOf(de, { questionType: 'multiple_choice', answers })
  assert.equal(tracNghiem.grade, null)
})

test('bằng chứng đi kèm phán quyết, không chỉ có con số', () => {
  const verdict = gradeOf('Số trung vị của mẫu số liệu ghép nhóm này là')
  assert.ok(verdict.units.length > 0)
  assert.ok(verdict.units.some((unit) => unit.kind === 'cap'))
  assert.ok(verdict.notes.length > 0)
})
