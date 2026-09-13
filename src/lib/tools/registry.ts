/**
 * Danh sách công cụ học tập cho học sinh (`/student/tools`).
 *
 * Thêm công cụ mới = thêm một phần tử ở đây + một route con dưới
 * `src/app/(student)/student/tools/<slug>/`. Trang danh sách đọc thẳng mảng này,
 * nên không có chỗ thứ hai phải sửa.
 *
 * Công cụ chạy HOÀN TOÀN ở trình duyệt, không đọc/ghi database: học sinh gõ đề
 * của chính mình, không có dữ liệu cá nhân nào rời máy.
 */

export interface StudentTool {
  slug: string
  title: string
  /** Một câu: công cụ làm gì cho học sinh. */
  summary: string
  /** Bài học tương ứng trong chương trình, để học sinh biết dùng lúc nào. */
  lesson: string
  grade: 10 | 11 | 12
}

export const STUDENT_TOOLS: readonly StudentTool[] = [
  {
    slug: 'inequality-region',
    title: 'Vẽ miền nghiệm hệ bất phương trình',
    summary:
      'Nhập hệ bất phương trình bậc nhất hai ẩn, xem từng bước: vẽ bờ, chọn điểm thử, gạch bỏ nửa mặt phẳng — rồi tìm đỉnh và GTLN, GTNN.',
    lesson: 'Chương 2 · Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    grade: 10,
  },
]
