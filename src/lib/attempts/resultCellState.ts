/**
 * Trạng thái một ô trong bản đồ câu ở trang kết quả.
 *
 * Tách khỏi component (`src/components/result/ResultQuestionMap.tsx`) vì đây là
 * LOGIC CHÍNH SÁCH, không phải trình bày: nó quyết định khi nào bản đồ được
 * phép để lộ đúng/sai. Ở file thuần thì test chạy được bằng test runner của
 * Node (`npm test` không xử lý được JSX).
 */

import type { AttemptQuestionView } from './attemptView'

export type CellState = 'correct' | 'wrong' | 'unanswered' | 'pending' | 'hidden'

/**
 * Suy trạng thái hiển thị của một câu.
 *
 * BẤT BIẾN: khi `revealed === false`, hàm này KHÔNG BAO GIỜ trả `correct` hoặc
 * `wrong`. Bản đồ câu tô màu theo giá trị trả về, nên nếu để lọt thì màu của ô
 * trở thành một đường rò đáp án đi vòng qua `answer_key_revealed` — chính sách
 * mà `AGENTS.md` mục 4 bắt phải tôn trọng ("không gửi đáp án chuẩn xuống client
 * trước thời điểm chính sách cho phép"). Trạng thái `hidden` cố ý chỉ nói "đã
 * trả lời", không nói đúng hay sai.
 *
 * Câu tự luận đi nhánh riêng: `isCorrect` của nó chỉ có nghĩa sau khi giáo viên
 * duyệt (`approved`). Bài do AI chấm (`ai_graded`) hay đang chờ duyệt đều là
 * `pending` — điểm còn có thể đổi, nên tô xanh/đỏ là nói quá về dữ liệu.
 */
export function cellState(
  question: Pick<
    AttemptQuestionView,
    'questionType' | 'studentAnswerText' | 'isCorrect' | 'gradingStatus'
  >,
  revealed: boolean
): CellState {
  const answered =
    question.studentAnswerText !== null && question.studentAnswerText !== ''

  if (question.questionType === 'essay') {
    if (revealed && question.gradingStatus === 'approved') {
      return question.isCorrect === true ? 'correct' : 'wrong'
    }
    return answered ? 'pending' : 'unanswered'
  }

  if (!revealed) return answered ? 'hidden' : 'unanswered'
  if (!answered) return 'unanswered'
  return question.isCorrect ? 'correct' : 'wrong'
}

export const CELL_STATE_TEXT: Record<CellState, string> = {
  correct: 'đúng',
  wrong: 'sai',
  unanswered: 'chưa làm',
  pending: 'chờ chấm',
  hidden: 'đã trả lời',
}
