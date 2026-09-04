/**
 * Đổi lỗi của `start_exam_attempt` thành câu tiếng Việt cho học sinh.
 *
 * VÌ SAO CẦN FILE NÀY
 * `handleStartPractice` bắt lỗi rồi `console.error` và dừng — không hiện gì cả.
 * Học sinh bấm "Bắt đầu", nút đổi thành "Đang mở...", rồi trở lại như cũ. Nhìn
 * từ ngoài: nút hỏng, bấm không ăn. Thực ra server đã trả lời rất rõ ràng, chỉ
 * là câu trả lời đó rơi vào console mà không ai mở console ra xem.
 *
 * `start_exam_attempt` (`20260722`) có TÁM cổng chặn, mỗi cổng một tình huống
 * khác hẳn nhau: chưa tới ngày mở, đã quá hạn, đề của lớp khác, gói quyền không
 * có tính năng... Gộp hết thành "Có lỗi xảy ra" là vứt đi toàn bộ thông tin mà
 * lớp bảo mật đã cất công phân biệt — và biến một câu trả lời được thành một
 * cuộc gọi điện cho thầy.
 *
 * ĐỪNG ĐỔI THÀNH LỜI XIN LỖI CHUNG CHUNG. Mỗi câu dưới đây nói học sinh cần làm
 * gì tiếp theo. Đó là toàn bộ giá trị của file này.
 */

/** Mã lỗi `start_exam_attempt` ném ra, kèm câu hiện cho học sinh. */
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED:
    'Phiên đăng nhập đã hết hạn. Em đăng nhập lại rồi thử lại nhé.',
  EXAM_NOT_AVAILABLE:
    'Đề này chưa mở hoặc đã bị gỡ. Em thử tải lại trang xem còn không.',
  STUDENT_ROLE_REQUIRED:
    'Tài khoản này không phải tài khoản học sinh nên không làm bài được.',
  FEATURE_NOT_AVAILABLE:
    'Gói quyền của em chưa mở phần này. Em nhắn thầy cô để được mở nhé.',
  EXAM_NOT_ASSIGNED_TO_STUDENT_CLASS:
    'Đề này dành cho lớp khác. Nếu em nghĩ mình bị xếp nhầm lớp thì báo thầy cô nhé.',
  EXAM_NOT_STARTED:
    'Chưa tới ngày mở đề. Em quay lại sau nhé.',
  EXAM_ENDED:
    'Đã quá hạn làm đề này rồi.',
  MAX_ATTEMPTS_REACHED:
    'Em đã dùng hết số lượt làm của đề này.',
  UNSUPPORTED_EXAM_MODE:
    'Đề này đang có cấu hình không hợp lệ. Em báo thầy cô giúp nhé.',
}

/**
 * Rút mã lỗi ra khỏi một lỗi bất kỳ của supabase-js.
 *
 * Lỗi PostgREST mang câu `RAISE EXCEPTION` ở trường `message`, nhưng hình dạng
 * đối tượng thì tuỳ đường đi (RPC, REST, lỗi mạng). Nên dò theo NỘI DUNG thay vì
 * tin vào một hình dạng cố định — hình dạng là thứ đổi khi nâng thư viện, còn mã
 * lỗi là thứ chính migration của mình định nghĩa.
 */
export function readAttemptErrorCode(error: unknown): string | null {
  if (!error) return null
  const text = typeof error === 'string'
    ? error
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : ''
  if (!text) return null
  for (const code of Object.keys(MESSAGES)) {
    if (text.includes(code)) return code
  }
  return null
}

/**
 * Câu hiện cho học sinh, ứng với một lỗi bất kỳ.
 *
 * Mã lạ hoặc lỗi mạng rơi về câu mặc định — nhưng câu mặc định vẫn phải nói được
 * việc tiếp theo, chứ không phải "Đã xảy ra lỗi".
 */
export function describeAttemptError(error: unknown): string {
  const code = readAttemptErrorCode(error)
  if (code) return MESSAGES[code]
  return 'Không mở được bài. Em kiểm tra mạng rồi thử lại; vẫn không được thì báo thầy cô nhé.'
}
