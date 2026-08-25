import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findDuplicates } from './duplicates.ts'
import { compareKey, skeletonOf } from './normalize.ts'

/*
  Dữ liệu thử lấy từ đề thi thật (đề khảo sát Toán 2026 trên 9study), gõ lại
  theo hai kiểu LaTeX khác nhau — đúng cái xảy ra khi cùng một câu được nhập từ
  hai nguồn.
*/

const NGUYEN_HAM_A = 'Câu 1: Tìm nguyên hàm của hàm số $f(x) = x^2 + \\dfrac{2}{x^2}$.'
const NGUYEN_HAM_B = 'Tìm nguyên hàm của hàm số \\(f(x)=x^{2}+\\frac{2}{x^{2}}\\)'

const CAP_SO_NHAN_2 =
  'Cho cấp số nhân $(u_n)$ có số hạng đầu $u_1 = 2$ và công bội $q = -3$. Tính $u_3$.'
const CAP_SO_NHAN_5 =
  'Cho cấp số nhân $(u_n)$ có số hạng đầu $u_1 = 5$ và công bội $q = 2$. Tính $u_3$.'

const VECTO_PHAP_TUYEN =
  'Trong không gian $Oxyz$, vectơ nào sau đây là một vectơ pháp tuyến của mặt phẳng $(P): 2x - y + z + 3 = 0$?'
const PHUONG_TRINH_MU = 'Nghiệm của phương trình $2^{x+1} = 16$ là'

const DONG_BIEN =
  'Cho hàm số $y = -x^3 + 3x^2 + 2$ đồng biến trên khoảng nào trong các khoảng sau?'
const NGHICH_BIEN =
  'Cho hàm số $y = -x^3 + 3x^2 + 2$ nghịch biến trên khoảng nào trong các khoảng sau?'

test('chuẩn hoá: hai cách gõ LaTeX của cùng một câu cho cùng một khoá', () => {
  assert.equal(compareKey(NGUYEN_HAM_A), compareKey(NGUYEN_HAM_B))
})

test('chuẩn hoá: khoảng trắng quanh toán tử không tạo ra câu mới', () => {
  assert.equal(compareKey('$f(x) = x^2 + 1$'), compareKey('$f(x)=x^2+1$'))
})

test('bộ xương: hai câu chỉ khác con số thì cùng một dạng', () => {
  assert.equal(skeletonOf(CAP_SO_NHAN_2), skeletonOf(CAP_SO_NHAN_5))
  // Nhưng khoá so sánh thì phải KHÁC — chúng là hai câu khác nhau.
  assert.notEqual(compareKey(CAP_SO_NHAN_2), compareKey(CAP_SO_NHAN_5))
})

test('gom nhóm trùng hệt', () => {
  const report = findDuplicates([
    { id: 'a', content: NGUYEN_HAM_A },
    { id: 'b', content: NGUYEN_HAM_B },
    { id: 'c', content: PHUONG_TRINH_MU },
  ])
  assert.equal(report.exact.length, 1)
  assert.deepEqual([...report.exact[0].questionIds].sort(), ['a', 'b'])
  assert.equal(report.scanned, 3)
})

test('gom nhóm cùng dạng, và không báo lại nhóm đã bắt ở mức trùng hệt', () => {
  const report = findDuplicates([
    { id: 'a', content: NGUYEN_HAM_A },
    { id: 'b', content: NGUYEN_HAM_B },
    { id: 'x', content: CAP_SO_NHAN_2 },
    { id: 'y', content: CAP_SO_NHAN_5 },
  ])

  assert.equal(report.exact.length, 1, 'a và b trùng hệt')
  assert.equal(report.sameTemplate.length, 1, 'x và y cùng dạng')
  assert.deepEqual([...report.sameTemplate[0].questionIds].sort(), ['x', 'y'])

  // a/b đã bị bắt ở `exact`; bộ xương của chúng cũng giống nhau, nhưng báo lại
  // ở `sameTemplate` chỉ làm người soạn phải đọc hai lần cùng một phát hiện.
  for (const cluster of report.sameTemplate) {
    assert.ok(!cluster.questionIds.includes('a'))
  }
})

/*
  Phép thử chống DƯƠNG-TÍNH-GIẢ. Đây mới là thứ quyết định công cụ có dùng được
  không: một công cụ báo trùng lung tung thì người soạn tắt nó sau ngày đầu.
*/
test('hai câu khác chủ đề thì không bị báo trùng ở bất kỳ mức nào', () => {
  const report = findDuplicates([
    { id: 'p', content: VECTO_PHAP_TUYEN },
    { id: 'q', content: PHUONG_TRINH_MU },
  ])
  assert.equal(report.exact.length, 0)
  assert.equal(report.sameTemplate.length, 0)
  assert.equal(report.near.length, 0)
})

/*
  "Đồng biến" và "nghịch biến" trên CÙNG một hàm số là hai câu hỏi ngược nhau.
  Chúng nhìn gần như y hệt, nên đây là chỗ một công cụ ẩu sẽ gộp nhầm — và gộp
  nhầm ở đây là xoá mất một trong hai câu đối lập.
*/
test('cùng hàm số nhưng hỏi ngược nhau thì KHÔNG phải trùng hệt hay cùng dạng', () => {
  const report = findDuplicates([
    { id: 'd1', content: DONG_BIEN },
    { id: 'd2', content: NGHICH_BIEN },
  ])
  assert.equal(report.exact.length, 0)
  assert.equal(report.sameTemplate.length, 0)
})

test('gần giống: bắt được câu chỉ thêm vài chữ ở cuối', () => {
  const goc =
    'Cho hình chóp $S.ABCD$ có đáy là hình chữ nhật, cạnh $BA = a$, $BC = 2a$, $SA = 3a$. Biết $SA \\perp (ABCD)$. Thể tích của khối chóp $S.ABCD$ bằng'
  const them = goc + ' bao nhiêu'

  const report = findDuplicates([
    { id: 'g', content: goc },
    { id: 'h', content: them },
    { id: 'k', content: PHUONG_TRINH_MU },
  ])

  assert.equal(report.near.length, 1)
  assert.deepEqual([report.near[0].aId, report.near[0].bId].sort(), ['g', 'h'])
  assert.ok(report.near[0].similarity >= 0.85)
})

test('ngưỡng gần giống điều chỉnh được', () => {
  const chat = findDuplicates(
    [
      { id: 'd1', content: DONG_BIEN },
      { id: 'd2', content: NGHICH_BIEN },
    ],
    { nearThreshold: 0.99 }
  )
  assert.equal(chat.near.length, 0)

  const long = findDuplicates(
    [
      { id: 'd1', content: DONG_BIEN },
      { id: 'd2', content: NGHICH_BIEN },
    ],
    { nearThreshold: 0.5 }
  )
  assert.equal(long.near.length, 1)
})

test('đầu vào rỗng hoặc một câu thì không vỡ', () => {
  assert.deepEqual(findDuplicates([]), {
    exact: [],
    sameTemplate: [],
    near: [],
    scanned: 0,
  })

  const one = findDuplicates([{ id: 'a', content: PHUONG_TRINH_MU }])
  assert.equal(one.exact.length, 0)
  assert.equal(one.near.length, 0)
})

test('nội dung rỗng không gom thành một nhóm trùng khổng lồ', () => {
  const report = findDuplicates([
    { id: 'e1', content: '' },
    { id: 'e2', content: '   ' },
    { id: 'e3', content: PHUONG_TRINH_MU },
  ])
  assert.equal(report.exact.length, 0, 'câu rỗng bị bỏ qua, không phải "trùng nhau"')
})
