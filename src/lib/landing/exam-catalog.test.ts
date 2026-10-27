/**
 * Test phân loại đề ở trang chủ.
 *
 * Hai ca quan trọng nhất không phải "lọc có chạy không" mà là hai ca ĐÃ TỪNG
 * LÀM HỎNG SẢN PHẨM: đề `grade = NULL` biến mất khỏi mọi tab, và cột `grade`
 * chưa được cấp quyền cho khách.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countByGrade,
  countByMode,
  examBadges,
  filterCatalog,
  filterHref,
  normalize,
  readGradeFilter,
  readModeFilter,
  type CatalogExam,
} from './exam-catalog.ts'

const CATALOG: CatalogExam[] = [
  { id: 'a', title: 'Đề thi thử TN THPT 2026 — Lần 1', subject: 'Toán', duration: 90, exam_mode: 'simulation', grade: 12 },
  { id: 'b', title: 'Đề giữa kì 1 — Lớp 11', subject: 'Toán', duration: 90, exam_mode: 'simulation', grade: 11 },
  { id: 'c', title: 'Đề cuối kì 1 — Lớp 10', subject: 'Toán', duration: 90, exam_mode: 'simulation', grade: 10 },
  { id: 'd', title: 'Đề thi thử TN THPT 2025 — Lần 3', subject: 'Toán', duration: 90, exam_mode: 'simulation', grade: null },
  { id: 'e', title: 'Ôn tập Tích phân', subject: 'Toán', duration: 0, exam_mode: 'practice', grade: 12 },
]

test('đề "mọi lớp" (grade NULL) hiện ở MỌI tab lớp, không biến mất', () => {
  for (const grade of [10, 11, 12] as const) {
    const ids = filterCatalog(CATALOG, { grade }).map((exam) => exam.id)
    assert.ok(ids.includes('d'), `tab lớp ${grade} phải còn đề mọi lớp`)
  }
  assert.deepEqual(filterCatalog(CATALOG, { grade: 11 }).map((e) => e.id), ['b', 'd'])
})

test('lọc theo loại đề', () => {
  assert.deepEqual(filterCatalog(CATALOG, { mode: 'practice' }).map((e) => e.id), ['e'])
  assert.equal(filterCatalog(CATALOG, { mode: 'simulation' }).length, 4)
})

test('lọc lớp và loại đề cộng dồn', () => {
  assert.deepEqual(filterCatalog(CATALOG, { grade: 12, mode: 'practice' }).map((e) => e.id), ['e'])
  assert.deepEqual(filterCatalog(CATALOG, { grade: 10, mode: 'practice' }).map((e) => e.id), [])
})

test('tìm kiếm bỏ dấu và không phân biệt hoa thường', () => {
  assert.deepEqual(filterCatalog(CATALOG, { query: 'tich phan' }).map((e) => e.id), ['e'])
  assert.deepEqual(filterCatalog(CATALOG, { query: 'GIỮA KÌ' }).map((e) => e.id), ['b'])
  assert.equal(normalize('Đề thi thử'), 'de thi thu')
})

test('chưa cấp quyền đọc cột grade: không lọc theo lớp, không bịa nhãn', () => {
  // Đúng hình dạng dữ liệu khi `anon` chưa có `SELECT (grade)`: cột vắng mặt.
  const khongCoGrade: CatalogExam[] = CATALOG.map((exam) => {
    const copy = { ...exam }
    delete copy.grade
    return copy
  })
  // Lọc lớp 12 không được giấu đề nào — không biết lớp thì không phân loại.
  assert.equal(filterCatalog(khongCoGrade, { grade: 12 }).length, khongCoGrade.length)
  assert.equal(examBadges(khongCoGrade[0]).grade, null)
})

test('đếm theo lớp và theo loại khớp đúng số đề sẽ hiện', () => {
  const byGrade = countByGrade(CATALOG)
  assert.deepEqual(byGrade, { 10: 2, 11: 2, 12: 3 })
  assert.deepEqual(countByMode(CATALOG), { simulation: 4, practice: 1 })
  // Đếm trong một tab lớp phải tính luôn ràng buộc loại đề.
  assert.deepEqual(countByGrade(CATALOG, 'practice'), { 10: 0, 11: 0, 12: 1 })
})

test('nhãn trên card', () => {
  assert.deepEqual(examBadges(CATALOG[0]), { grade: 'Lớp 12', mode: 'Thi thử', note: null })
  assert.deepEqual(examBadges(CATALOG[3]), { grade: 'Mọi lớp', mode: 'Thi thử', note: null })
  assert.deepEqual(examBadges(CATALOG[4]), { grade: 'Lớp 12', mode: 'Ôn tập', note: 'Không bấm giờ' })
})

test('đọc tham số URL, giá trị lạ thì bỏ qua chứ không nổ', () => {
  assert.equal(readGradeFilter('12'), 12)
  assert.equal(readGradeFilter('9'), null)
  assert.equal(readGradeFilter('<script>'), null)
  assert.equal(readGradeFilter(undefined), null)
  assert.equal(readModeFilter('on-tap'), 'practice')
  assert.equal(readModeFilter('THI-THU'), 'simulation')
  assert.equal(readModeFilter('abc'), null)
})

test('chip giữ nguyên bộ lọc khác và luôn neo về #exams', () => {
  assert.equal(filterHref({ q: 'tích phân' }, { lop: '12' }), '/?q=t%C3%ADch+ph%C3%A2n&lop=12#exams')
  assert.equal(filterHref({ lop: '12', kieu: 'on-tap' }, { lop: null }), '/?kieu=on-tap#exams')
  assert.equal(filterHref({}, {}), '/#exams')
})
