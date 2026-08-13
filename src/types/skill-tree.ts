/**
 * Kiểu dùng chung cho cây tri thức.
 *
 * Tách khỏi `SkillTree.tsx` ngày 2026-08-11, khi chế độ Sơ đồ (ReactFlow) bị
 * gỡ bỏ. Trước đó các kiểu này sống trong chính file component, nên `/learn`
 * và `LearningPath` phải import từ một component mà chúng không dùng tới —
 * kéo theo `@xyflow/react` và `dagre` vào cây phụ thuộc chỉ vì một dòng
 * `import type`.
 *
 * Đây là module thuần kiểu, không import gì từ React.
 */

import type { MasteryStatus } from '@/lib/analytics/knowledge-mastery'
import type { BlockType } from '@/types/theories'


/**
 * Trạng thái HOẠT ĐỘNG của bài học: học sinh đã làm bài tới đâu.
 *
 * Cố ý tách khỏi mức năng lực (`MasteryStatus`). Trước đây hai khái niệm này bị
 * trộn vào một trường: node đạt 100% số câu ĐÃ TRẢ LỜI được gắn nhãn
 * "Đã đạt 80%" màu xanh, kể cả khi sai toàn bộ.
 * Xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 2.1.
 */
export type SkillNodeStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'no_homework'

/**
 * Một bài tiên quyết, kèm đủ thông tin để ĐIỀU HƯỚNG tới nó.
 *
 * Trước đây trường này chỉ là `string[]` tên bài, đủ để đếm nhưng không đủ để
 * bấm. Chế độ Lộ trình cần chip "Cần: X" nhảy được tới node tương ứng
 * (docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.3), nên phải mang theo `id`.
 */
export interface SkillTreePrerequisite {
  id: string
  title: string
  /** Chuyên đề của bài tiên quyết — dùng để biết đây có phải quan hệ chéo chuyên đề. */
  group: string
  /**
   * Đã đủ vững chưa, theo `isMasteryAchieved`.
   *
   * `null` nghĩa là CHƯA CÓ BẰNG CHỨNG để kết luận (bài đó chưa được giao bài
   * tập nào). Cố ý tách khỏi `false` — nói "chưa đạt" khi chưa từng đo là dựng
   * ra một kết luận không có dữ liệu, đúng loại lỗi mà mục 2.1 mô tả.
   */
  met: boolean | null
}

export interface SkillTreeItem {
  id: string
  title: string
  group: string
  difficulty: number
  /** Tỷ lệ câu ĐÃ LÀM trên tổng số câu được giao. Không phải tỷ lệ đúng. */
  progress: number | null
  answered: number
  total: number
  /** Số câu đã làm nhưng giáo viên chưa mở đáp án nên chưa tính năng lực. */
  pending: number
  assignmentCount: number
  /** Số bài tập chưa quá hạn. Bằng 0 mà `assignmentCount > 0` nghĩa là hết hạn cả. */
  openAssignments: number
  /** Hạn nộp gần nhất trong các bài tập còn mở. ISO string, `null` khi không có. */
  nextDeadline: string | null
  /** Assignment ứng với `nextDeadline`, để nút "Làm bài" trỏ đúng chỗ. */
  nextAssignmentId: string | null
  status: SkillNodeStatus
  /** Mức năng lực dựa trên ĐỘ CHÍNH XÁC. `no_data` khi chưa có câu nào được chấm. */
  mastery: MasteryStatus
  /** Độ chính xác 0-100, `null` khi chưa có bằng chứng đã chấm. */
  accuracy: number | null
  /** Bài tiên quyết. Khóa mềm: vẫn vào được, chỉ để nhắc thứ tự nên học. */
  prerequisites: SkillTreePrerequisite[]
  /**
   * Có khớp bộ lọc/tìm kiếm hiện tại không.
   *
   * Node không khớp vẫn được vẽ, chỉ làm mờ. Bỏ node khỏi cây khi lọc sẽ làm bố
   * cục nhảy mỗi lần gõ phím — xem docs/STUDENT_SKILL_TREE_REDESIGN.md mục 3.3.
   */
  matched: boolean
}

export interface SkillTreeLink {
  source: string
  target: string
  relation: 'prerequisite' | 'related' | 'extension'
}

export interface SkillTreeBlock {
  id: string
  theory_id: string
  block_type: BlockType
  title?: string | null
  order_index: number
}

export interface SkillTreeBlockLink {
  source: string
  target: string
  relation: SkillTreeLink['relation']
}

