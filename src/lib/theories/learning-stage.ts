/**
 * Khâu học trong MỘT bài — trục thứ nhất của cây tri thức mới.
 *
 * Chín loại `BlockType` không phải nhãn phân loại tuỳ ý: hệ LaTeX
 * (`filechinh-lop{10,11,12}.ttk`) sinh ra chúng theo một trình tự học có thật,
 * và đó chính là thứ cây cũ bỏ lỡ —
 *
 *   ĐỊNH NGHĨA → ĐỊNH LÝ / TÍNH CHẤT / HỆ QUẢ → CÔNG THỨC
 *              → PHƯƠNG PHÁP → VÍ DỤ → BÀI TẬP
 *
 * Xem docs/DESIGN_OVERHAUL_2026-08-09.md mục 3b. Module thuần, không import
 * React, để test chạy được bằng `node --test`.
 *
 * CHÚ Ý cố ý KHÔNG phải một khâu. Nó là lời dặn kèm theo khâu đang đọc ("đừng
 * quên xét điều kiện xác định"), nên xếp nó thành khâu thứ mười sẽ dựng ra một
 * bước học không tồn tại và đẩy mọi cảnh báo ra khỏi chỗ chúng thuộc về.
 */

import type { BlockType } from '@/types/theories'

export type LearningStageKey =
  | 'khai_niem'
  | 'ket_qua'
  | 'cong_thuc'
  | 'phuong_phap'
  | 'vi_du'
  | 'bai_tap'

export interface LearningStage {
  key: LearningStageKey
  /** Số thứ tự khâu, 1..6. Dùng để hiển thị "Khâu 3/6". */
  step: number
  label: string
  /** Khâu này để LÀM GÌ. Một câu, nói việc của học sinh, không định nghĩa lại nhãn. */
  hint: string
  types: BlockType[]
}

/**
 * Sáu khâu, theo đúng thứ tự chuỗi ở đầu file.
 *
 * ĐỊNH LÝ, TÍNH CHẤT và HỆ QUẢ gộp làm MỘT khâu vì với người học chúng là cùng
 * một việc: nắm các kết quả đã được chứng minh. Tách ba khâu chỉ khác nhau ở
 * tên gọi toán học sẽ biến thanh tiến trình thành danh sách thuật ngữ.
 */
export const LEARNING_STAGES: readonly LearningStage[] = [
  {
    key: 'khai_niem',
    step: 1,
    label: 'Khái niệm',
    hint: 'Hiểu đối tượng đang nói tới là gì',
    types: ['dinh_nghia'],
  },
  {
    key: 'ket_qua',
    step: 2,
    label: 'Kết quả lý thuyết',
    hint: 'Những điều đã được chứng minh, dùng lại được',
    types: ['dinh_ly', 'tinh_chat', 'he_qua'],
  },
  {
    key: 'cong_thuc',
    step: 3,
    label: 'Công thức',
    hint: 'Phần phải thuộc để tính nhanh',
    types: ['cong_thuc'],
  },
  {
    key: 'phuong_phap',
    step: 4,
    label: 'Phương pháp',
    hint: 'Các bước làm cho một dạng bài',
    types: ['phuong_phap'],
  },
  {
    key: 'vi_du',
    step: 5,
    label: 'Ví dụ',
    hint: 'Xem lời giải mẫu trước khi tự làm',
    types: ['vi_du'],
  },
  {
    key: 'bai_tap',
    step: 6,
    label: 'Bài tập',
    hint: 'Tự làm để biết mình hiểu tới đâu',
    types: ['bai_tap'],
  },
] as const

export const LEARNING_STAGE_COUNT = LEARNING_STAGES.length

const STAGE_BY_TYPE = new Map<BlockType, LearningStage>(
  LEARNING_STAGES.flatMap(stage => stage.types.map(type => [type, stage] as const))
)

/** `null` cho `chu_y`: khối phụ thuộc khâu đang đọc, không mở khâu mới. */
export function stageOfBlock(type: BlockType): LearningStage | null {
  return STAGE_BY_TYPE.get(type) ?? null
}

/** Chỉ cần đúng hai trường này, nên nhận mọi thứ có chúng — kể cả `KnowledgeBlock`. */
interface BlockLike {
  block_type: BlockType
}

export interface StageRun<T extends BlockLike> {
  /** `null` khi bài mở đầu bằng CHÚ Ý, tức chưa có khâu nào để gắn vào. */
  stage: LearningStage | null
  blocks: T[]
}

/**
 * Cắt danh sách khối thành các đoạn liền nhau cùng khâu — GIỮ NGUYÊN thứ tự.
 *
 * Cố ý không gom tất cả khối cùng khâu về một chỗ. Thứ tự khối là thứ tự tác
 * giả viết bài, và một CHÚ Ý đặt ngay sau ví dụ thứ hai là lời dặn về đúng ví
 * dụ đó. Sắp xếp lại theo khâu sẽ đọc gọn hơn nhưng nói sai nội dung bài, nên
 * hàm này chỉ ĐÁNH DẤU trình tự chứ không tạo ra trình tự.
 *
 * Hệ quả có chủ đích: bài nào quay lại khâu cũ (ví dụ → phương pháp → ví dụ) sẽ
 * có hai đoạn cùng khâu. Đó là sự thật về bài viết, không phải lỗi hiển thị.
 */
export function splitIntoStageRuns<T extends BlockLike>(blocks: T[]): StageRun<T>[] {
  const runs: StageRun<T>[] = []

  for (const block of blocks) {
    const stage = stageOfBlock(block.block_type)
    const current = runs[runs.length - 1]

    // CHÚ Ý (`stage === null`) nhập vào đoạn đang mở. Chỉ khi nó đứng trước mọi
    // khối có khâu thì mới phải mở một đoạn không khâu.
    if (current && (stage === null || current.stage === stage)) {
      current.blocks.push(block)
      continue
    }

    runs.push({ stage, blocks: [block] })
  }

  return runs
}

export interface StagePresence {
  stage: LearningStage
  /** Số khối thuộc khâu. Không tính CHÚ Ý kèm theo — đó là chú thích, không phải nội dung khâu. */
  count: number
}

/**
 * Các khâu bài này CÓ, theo thứ tự chuẩn.
 *
 * Chỉ trả về khâu có mặt. Liệt kê cả khâu vắng kèm nhãn "chưa có" sẽ biến một
 * lựa chọn biên soạn của giáo viên (bài lý thuyết thuần thì không có BÀI TẬP)
 * thành một khoảng trống trông như lỗi hoặc như việc học sinh còn nợ — đúng loại
 * câu sai mà mục 7.1 của bản thiết kế cấm.
 */
export function summarizeStages<T extends BlockLike>(blocks: T[]): StagePresence[] {
  const counts = new Map<LearningStageKey, number>()

  for (const block of blocks) {
    const stage = stageOfBlock(block.block_type)
    if (!stage) continue
    counts.set(stage.key, (counts.get(stage.key) ?? 0) + 1)
  }

  return LEARNING_STAGES.filter(stage => counts.has(stage.key)).map(stage => ({
    stage,
    count: counts.get(stage.key) ?? 0,
  }))
}
