/**
 * Danh sách công cụ học tập cho học sinh (`/student/tools`).
 *
 * Mọi công cụ nằm chung MỘT khu làm việc: `tools/layout.tsx` dựng đầu trang và
 * thanh tab từ mảng này, mỗi công cụ là một route con. Thêm công cụ mới = thêm
 * một phần tử ở đây + một thư mục `src/app/(student)/student/tools/<slug>/`
 * + một mục trong `components/tools/clients.tsx`.
 *
 * Công cụ chạy HOÀN TOÀN ở trình duyệt, không đọc/ghi database: học sinh gõ đề
 * của chính mình, không có dữ liệu cá nhân nào rời máy.
 *
 * Lộ trình và lý do chọn công cụ: docs/STUDENT_TOOLS_ROADMAP.md.
 */

export type ToolIcon = 'region' | 'tree' | 'histogram' | 'curve' | 'integral'

export interface StudentTool {
  slug: string
  title: string
  /** Nhãn trên tab — ngắn để vừa màn hình điện thoại. */
  short: string
  icon: ToolIcon
  /** Một câu: công cụ làm gì cho học sinh. */
  summary: string
  /** Bài học tương ứng trong chương trình, để học sinh biết dùng lúc nào. */
  lesson: string
  grade: string
}

export const STUDENT_TOOLS: readonly StudentTool[] = [
  {
    // Đứng đầu vì là chỗ học sinh luyện nhiều nhất: 45% ngân hàng câu hỏi (roadmap mục 1.2).
    slug: 'function-analysis',
    title: 'Khảo sát hàm số',
    short: 'Khảo sát',
    icon: 'curve',
    summary:
      'Nhập hàm bậc ba, trùng phương hoặc phân thức; đi từng bước đạo hàm, xét dấu, cực trị, tiệm cận — bảng biến thiên và đồ thị lập dần theo lời giải.',
    lesson: 'Chương 1 · Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    grade: 'Lớp 12',
  },
  {
    // Đề có 4 câu nguyên hàm – tích phân, nhiều ngang Oxyz (roadmap mục 1.1).
    slug: 'integral',
    title: 'Tích phân',
    short: 'Tích phân',
    icon: 'integral',
    summary:
      'Tổng Riemann tiến tới tích phân, diện tích hình phẳng giữa hai đồ thị, quãng đường đi được từ vận tốc — từng bước, phân số chính xác.',
    lesson: 'Chương 4 · Nguyên hàm và tích phân',
    grade: 'Lớp 12',
  },
  {
    slug: 'inequality-region',
    title: 'Vẽ miền nghiệm hệ bất phương trình',
    short: 'Miền nghiệm',
    icon: 'region',
    summary:
      'Nhập hệ bất phương trình bậc nhất hai ẩn, xem hoặc tự làm từng bước: vẽ bờ, chọn điểm thử, gạch bỏ — rồi tìm đỉnh và GTLN, GTNN.',
    lesson: 'Chương 2 · Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    grade: 'Lớp 10',
  },
  {
    slug: 'grouped-data',
    title: 'Mẫu số liệu ghép nhóm',
    short: 'Ghép nhóm',
    icon: 'histogram',
    summary:
      'Nhập bảng ghép nhóm, tính số trung bình, trung vị, tứ phân vị, mốt, phương sai từng bước — và tự tìm nhóm chứa trung vị trước khi xem.',
    lesson: 'Các số đặc trưng của mẫu số liệu ghép nhóm',
    grade: 'Lớp 11 · 12',
  },
  {
    slug: 'conditional-probability',
    title: 'Xác suất có điều kiện · Công thức Bayes',
    short: 'Bayes',
    icon: 'tree',
    summary:
      'Dựng sơ đồ hình cây, tính xác suất toàn phần và Bayes từng bước, đoán trước kết quả và luyện câu đúng/sai kiểu đề thi.',
    lesson: 'Chương 6 · Xác suất có điều kiện',
    grade: 'Lớp 12',
  },
]

export function findTool(pathname: string): StudentTool | undefined {
  return STUDENT_TOOLS.find((t) => pathname === `/student/tools/${t.slug}` || pathname.startsWith(`/student/tools/${t.slug}/`))
}
