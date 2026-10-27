/**
 * Phân loại đề cho khối "Đề thi có sẵn" ở trang chủ.
 *
 * VÌ SAO CẦN: trang chủ là chỗ DUY NHẤT người lạ nhìn thấy đề trước khi có tài
 * khoản. Trước bản này nó đổ ra một danh sách phẳng — không lớp, không loại đề
 * — nên một học sinh lớp 11 phải đọc hết tên từng đề để đoán đề nào dành cho
 * mình. Phần "phân loại" duy nhất đang có là dải màu bên trái card, băm từ
 * `exams.subject`; mà cả ngân hàng chỉ có môn Toán, nên MỌI đề ra cùng một màu.
 * Tức là: có code phân loại, không có phân loại.
 *
 * RÀNG BUỘC QUYẾT ĐỊNH THIẾT KẾ FILE NÀY — vai trò `anon` chỉ đọc được vài cột.
 * `20260722:3339` cấp cho `anon` đúng `(id, title, subject, duration,
 * is_published, exam_mode, created_at)`. **`grade` và `description` KHÔNG nằm
 * trong đó**, và grant theo cột của Postgres từ chối CẢ CÂU khi chạm cột chưa
 * cấp — thêm `grade` vào câu select của trang chủ mà chưa nạp migration là khối
 * đề biến mất sạch khỏi trang chủ, im lặng, với mọi khách.
 *
 * Nên mọi hàm ở đây phải chạy được ở CẢ HAI trạng thái: có `grade` (sau khi nạp
 * `20261027_landing_exam_catalog.sql`) và không có. Thiếu `grade` thì bộ lọc
 * theo lớp tự ẩn, phần còn lại vẫn chạy.
 */

export interface CatalogExam {
  id: string
  title: string
  subject?: string | null
  duration: number
  exam_mode?: string | null
  /** `undefined` = chưa cấp quyền đọc cột; `null` = đề cho MỌI lớp. */
  grade?: number | null
  description?: string | null
  question_count?: number
}

export type GradeFilter = 10 | 11 | 12 | null
export type ModeFilter = 'simulation' | 'practice' | null

export const GRADES = [10, 11, 12] as const

/** `?lop=12` → 12. Giá trị lạ coi như không lọc, không báo lỗi. */
export function readGradeFilter(raw?: string | null): GradeFilter {
  const value = Number((raw || '').trim())
  return (GRADES as readonly number[]).includes(value) ? (value as 10 | 11 | 12) : null
}

/** `?kieu=on-tap` → `'practice'`. Dùng chữ không dấu cho URL gửi qua Zalo. */
export function readModeFilter(raw?: string | null): ModeFilter {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'thi-thu' || value === 'simulation') return 'simulation'
  if (value === 'on-tap' || value === 'practice') return 'practice'
  return null
}

/** Bỏ dấu để "toan" khớp "Toán" — học sinh gõ tìm kiếm thường không bỏ dấu. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
}

/**
 * Lọc theo lớp + loại đề + từ khoá.
 *
 * `grade = null` nghĩa là **đề cho mọi lớp**, nên nó hiện ở MỌI tab lớp — cùng
 * luật với `AssessmentListPage`. Lọc kiểu `grade === 12` sẽ giấu luôn những đề
 * chưa gán lớp khỏi tất cả các tab, im lặng; đó đúng là lỗi đã gặp ở trang
 * danh sách đề của học sinh (xem `VIEC_DANG_MO.md` mục C13).
 */
export function filterCatalog(
  exams: readonly CatalogExam[],
  options: { grade?: GradeFilter; mode?: ModeFilter; query?: string } = {}
): CatalogExam[] {
  const needle = normalize((options.query || '').trim())
  return exams.filter((exam) => {
    if (options.mode && (exam.exam_mode || 'simulation') !== options.mode) return false
    if (options.grade && exam.grade !== null && exam.grade !== undefined && exam.grade !== options.grade) {
      return false
    }
    if (needle && !normalize(`${exam.title || ''} ${exam.subject || ''}`).includes(needle)) return false
    return true
  })
}

/** Số đề mỗi tab sẽ hiện — đếm theo đúng luật của `filterCatalog`. */
export function countByGrade(exams: readonly CatalogExam[], mode: ModeFilter = null): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const grade of GRADES) counts[grade] = filterCatalog(exams, { grade, mode }).length
  return counts
}

export function countByMode(exams: readonly CatalogExam[], grade: GradeFilter = null) {
  return {
    simulation: filterCatalog(exams, { mode: 'simulation', grade }).length,
    practice: filterCatalog(exams, { mode: 'practice', grade }).length,
  }
}

export interface ExamBadges {
  /** `null` khi chưa đọc được cột `grade` — không bịa "Mọi lớp" từ chỗ không biết. */
  grade: string | null
  mode: string
  /** Câu bán hàng ngắn, chỉ nói điều suy ra được từ dữ liệu thật. */
  note: string | null
}

/**
 * Nhãn hiện trên card.
 *
 * Đề ôn tập có `duration = 0` (`20260905`) và `max_attempts = 0` (`20260906`).
 * `max_attempts` không được cấp cho `anon` nên KHÔNG hứa "làm lại tuỳ ý" từ
 * suy đoán; chỉ nói "không bấm giờ", điều mà cột `duration` chứng minh được.
 */
export function examBadges(exam: CatalogExam): ExamBadges {
  const mode = (exam.exam_mode || 'simulation') === 'practice' ? 'Ôn tập' : 'Thi thử'
  const grade =
    exam.grade === undefined ? null : exam.grade === null ? 'Mọi lớp' : `Lớp ${exam.grade}`
  const note = mode === 'Ôn tập' && exam.duration === 0 ? 'Không bấm giờ' : null
  return { grade, mode, note }
}

/** Đường dẫn của một chip lọc, giữ nguyên các bộ lọc khác đang bật. */
export function filterHref(current: { q?: string; lop?: string; kieu?: string }, patch: { lop?: string | null; kieu?: string | null }): string {
  const params = new URLSearchParams()
  const next = { ...current, ...patch }
  if (next.q) params.set('q', next.q)
  if (next.lop) params.set('lop', next.lop)
  if (next.kieu) params.set('kieu', next.kieu)
  const search = params.toString()
  return `/${search ? `?${search}` : ''}#exams`
}
