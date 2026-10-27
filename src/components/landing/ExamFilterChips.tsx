/**
 * Hàng chip lọc đề ở trang chủ: theo LỚP và theo LOẠI ĐỀ.
 *
 * Là `<Link>` chứ không phải nút JS, có ba lý do và cả ba đều quan trọng cho
 * việc quảng bá:
 *   1. Chạy cả khi JS chưa tải xong — trang chủ là thứ người lạ gặp đầu tiên,
 *      thường trên 3G và máy yếu.
 *   2. Mỗi bộ lọc là một ĐƯỜNG DẪN GỬI ĐƯỢC: thầy cô dán
 *      `minhmath.../?lop=12#exams` vào nhóm Zalo lớp 12 là học sinh mở ra thấy
 *      đúng đề của mình, không phải tự lọc.
 *   3. Không thêm một hòn đảo client nào vào trang vốn là Server Component.
 *
 * Chip chỉ hiện khi CÓ gì để chọn: một lớp duy nhất thì hàng lọc lớp là nhiễu,
 * và chưa có đề ôn tập công khai thì tab "Ôn tập" là một lời hứa trống.
 */

import Link from 'next/link'
import {
  GRADES,
  countByGrade,
  countByMode,
  filterCatalog,
  filterHref,
  type CatalogExam,
  type GradeFilter,
  type ModeFilter,
} from '@/lib/landing/exam-catalog'

interface ExamFilterChipsProps {
  /** Toàn bộ danh mục đã lấy về, KHÔNG phải phần đang hiện — để đếm cho đúng. */
  exams: readonly CatalogExam[]
  grade: GradeFilter
  mode: ModeFilter
  current: { q?: string; lop?: string; kieu?: string }
  /** Từ khoá đang tìm — số trên chip phải đếm TRONG phần đang tìm, nếu không
      thì bấm vào chip ra khác hẳn con số vừa đọc. */
  query?: string
  /**
   * `false` khi `anon` chưa được cấp quyền đọc cột `exams.grade`
   * (`20261027_landing_exam_catalog.sql` chưa nạp). Khi đó hàng lọc theo lớp
   * tự ẩn — không ai được phân loại bằng dữ liệu mình không đọc nổi.
   */
  classified: boolean
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors'
const CHIP_OFF =
  'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-300'
const CHIP_ON = 'bg-teal-600 dark:bg-teal-500 text-white'

function Chip({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={active ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'}>{count}</span>
      )}
    </Link>
  )
}

export default function ExamFilterChips({
  exams,
  grade,
  mode,
  current,
  query,
  classified,
}: ExamFilterChipsProps) {
  // Đếm trên đúng tập đang xét: từ khoá tìm kiếm luôn áp, các bộ lọc KHÁC
  // hàng đang vẽ cũng áp. Có vậy con số trên chip mới bằng số đề hiện ra sau
  // khi bấm nó.
  const inSearch = filterCatalog(exams, { query })
  const byGrade = countByGrade(inSearch, mode)
  const byMode = countByMode(inSearch, grade)
  const allGradesCount = filterCatalog(inSearch, { mode }).length
  const allModesCount = filterCatalog(inSearch, { grade }).length

  const gradesWithExams = GRADES.filter((value) => byGrade[value] > 0)
  const showGrades = classified && gradesWithExams.length > 1
  const showModes = byMode.simulation > 0 && byMode.practice > 0

  if (!showGrades && !showModes) return null

  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      {showGrades && (
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Lọc đề theo lớp">
          <Chip
            href={filterHref(current, { lop: null })}
            active={grade === null}
            label="Tất cả lớp"
            count={allGradesCount}
          />
          {gradesWithExams.map((value) => (
            <Chip
              key={value}
              href={filterHref(current, { lop: String(value) })}
              active={grade === value}
              label={`Lớp ${value}`}
              count={byGrade[value]}
            />
          ))}
        </nav>
      )}

      {showModes && (
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Lọc theo loại đề">
          <Chip
            href={filterHref(current, { kieu: null })}
            active={mode === null}
            label="Tất cả"
            count={allModesCount}
          />
          <Chip
            href={filterHref(current, { kieu: 'thi-thu' })}
            active={mode === 'simulation'}
            label="Thi thử"
            count={byMode.simulation}
          />
          <Chip
            href={filterHref(current, { kieu: 'on-tap' })}
            active={mode === 'practice'}
            label="Ôn tập"
            count={byMode.practice}
          />
        </nav>
      )}
    </div>
  )
}
