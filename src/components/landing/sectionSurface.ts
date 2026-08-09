/**
 * Nhịp nền giữa các section của landing page.
 *
 * Vì sao cần một lớp riêng thay vì viết thẳng class ở từng section: thứ tự
 * section do admin cấu hình (`landing.sections_config`) và một số section tự ẩn
 * khi không có dữ liệu. Nếu mỗi component tự quyết "tôi có nền hay không" thì
 * chỉ cần admin đổi thứ tự là hai section cùng nền nằm cạnh nhau, và cả trang
 * đọc thành một dải phẳng — đúng cái bệnh mà `docs/DESIGN_OVERHAUL_2026-08-09.md`
 * mục 2 nêu ra.
 *
 * Nên nền được TÍNH ở `src/app/page.tsx` theo vị trí thực tế của section trong
 * danh sách sẽ render, rồi truyền xuống. Component chỉ việc dán class.
 *
 * Chỉ có hai cấp, cố ý: `plain` (nền trang) và `alt` (`.section-alt` trong
 * `globals.css`). Ba cấp trở lên thì mắt không còn đọc ra được nhịp.
 */
export type SectionSurface = 'plain' | 'alt'

/** Class nền cho một section. `plain` trả chuỗi rỗng để không thêm rác vào DOM. */
export function surfaceClass(surface: SectionSurface = 'plain'): string {
  return surface === 'alt' ? 'section-alt' : ''
}
