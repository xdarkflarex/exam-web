/**
 * Hợp đồng kiểu dữ liệu cho pipeline chấm tự luận tự động.
 *
 * TRẠNG THÁI: lớp logic thuần, chưa được nối vào luồng chạy thật. Không có
 * migration, worker, storage hay lời gọi provider đi kèm module này.
 *
 * Ranh giới tin cậy (xem `AGENTS.md` mục 4):
 * - Text OCR và output AI là dữ liệu KHÔNG đáng tin cậy, ngang hàng với bài
 *   làm học sinh. Mọi giá trị đi qua đây phải được validate lại phía server.
 * - Không type nào trong file này được mang định danh học sinh. Nếu cần thêm
 *   trường mới, hỏi trước: "provider bên ngoài có được thấy trường này không?"
 */

import type { EssayGradingSuggestion } from '@/lib/essay-grading/prompt'

/** Lý do một bài phải về tay người thay vì để AI chốt. */
export type ReviewTrigger =
  | 'ai_disabled'
  | 'auto_finalize_disabled'
  | 'low_ocr_confidence'
  | 'ocr_warning'
  | 'math_region_uncertain'
  | 'low_grading_confidence'
  | 'validator_rejected'
  | 'provider_error'
  | 'cost_cap_reached'
  | 'suspected_prompt_injection'
  | 'model_requested_review'
  /**
   * Giáo viên đang phải chấm đè quá nhiều, hoặc chưa đủ bài đối chiếu để biết
   * AI chấm đúng hay sai. Đây là kill-switch tự động của kế hoạch mục 7: nó
   * chặn auto-chốt mà không cần ai tắt cờ bằng tay.
   */
  | 'override_rate_exceeded'
  /**
   * Bài được nhập bằng cách chụp ảnh nhưng không tìm thấy bản ghi chất lượng
   * OCR tương ứng (`essay_ocr_snapshots`). Khác hẳn "học sinh gõ tay": ở đây
   * CÓ một lượt máy đọc, ta chỉ không biết nó đọc tốt hay tệ.
   *
   * Trước 2026-08-07 hai trường hợp này cùng được biểu diễn bằng `ocr: null`
   * và nhánh `if (ocr)` cho qua cả hai — nghĩa là bài chụp ảnh đi thẳng tới
   * auto-chốt mà không cổng OCR nào chạy. Tách ra để nhánh mất dấu vết chặn
   * được, đúng nguyên tắc fail-closed của module.
   */
  | 'ocr_snapshot_missing'
  /**
   * Hai lần chụp trở lên cho ra text giống hệt nhau (trùng `text_hash`).
   *
   * `ExamRunner` NỐI text của mỗi lần OCR vào ô trả lời thay vì ghi đè, nên
   * chụp trùng nghĩa là bài nộp chứa cùng một đoạn hai lần. AI chấm một bài
   * bị lặp như vậy cho ra điểm không dùng được, mà nó không có cách nào biết
   * phần lặp là thao tác thừa chứ không phải học sinh cố ý viết vậy.
   *
   * Dấu hiệu này chỉ đọc được từ `text_hash` của `essay_ocr_snapshots` — đó
   * là công việc mà cột ấy được tạo ra để làm.
   */
  | 'ocr_duplicate_capture'

/** Kết quả OCR sau khi đã chuẩn hoá. Không chứa định danh học sinh. */
export interface OcrResult {
  /** Text đã chuẩn hoá, sẵn sàng đưa vào prompt chấm. */
  normalizedText: string
  /** Hash của `normalizedText`; dùng để phát hiện lệch phiên bản. */
  textHash: string
  /** 0..1. Thấp thì ép về người duyệt bất kể AI nói gì. */
  confidence: number
  /** Tên provider đã dùng, để audit và so sánh benchmark. */
  provider: string
  /** Model đã dùng; phải nằm trong allowlist. */
  model: string
  /**
   * Cảnh báo ở mức vùng nội dung. Với môn Toán, vùng chứa ký hiệu toán đọc
   * không chắc là chế độ hỏng nguy hiểm nhất — một dấu âm sai đủ đảo ngược
   * kết luận, nên cảnh báo loại này phải chặn auto-chốt.
   */
  warnings: OcrWarning[]
}

export interface OcrWarning {
  kind: 'low_confidence_region' | 'math_unreadable' | 'page_skipped' | 'truncated'
  detail: string
}

/**
 * Một dòng `essay_ocr_snapshots` — chất lượng của MỘT lần học sinh bấm chụp.
 *
 * Cố ý không có `normalizedText`: bảng không lưu text bài làm, chỉ hash và chỉ
 * số (`20260807`, mục "KHÔNG LƯU ẢNH và KHÔNG LƯU TEXT BÀI LÀM").
 */
export interface OcrSnapshotRow {
  confidence: number
  warningKinds: OcrWarning['kind'][]
  warningDetails: string[]
  /** SHA-256 của text mà máy đọc được ở LẦN CHỤP NÀY, không phải của cả bài. */
  textHash: string
  provider: string
  model: string
}

/**
 * Chất lượng nhận dạng của CẢ BÀI, gộp từ mọi lần chụp.
 *
 * Vì sao cần một kiểu riêng thay vì dùng `OcrResult`: một bài tự luận thường
 * là nhiều ảnh (nhiều trang, hoặc chụp lại vì mờ), và `ExamRunner` nối text
 * của từng lần vào cùng một ô trả lời. Không có một `OcrResult` nào mô tả
 * đúng bài đó — mỗi `OcrResult` chỉ nói về một tấm ảnh.
 *
 * Trước bản sửa này worker mượn `OcrResult` cho mục đích ấy và phải nhồi
 * `normalizedText: ''` vì nó không có text, tức là kiểu dữ liệu nói dối về
 * thứ nó chứa. Nặng hơn: worker chỉ đọc snapshot MỚI NHẤT, nên chất lượng của
 * cả bài bị đánh giá bằng đúng tấm ảnh cuối cùng.
 */
export interface OcrEvidence {
  /**
   * Confidence THẤP NHẤT trong các lần chụp, không phải trung bình hay lần
   * cuối. Bài nộp là hợp của mọi lần chụp, nên nó không thể đáng tin hơn trang
   * tệ nhất góp mặt trong đó.
   */
  confidence: number
  /** Hợp của cảnh báo mọi lần chụp, đã khử trùng lặp theo `kind` + `detail`. */
  warnings: OcrWarning[]
  /** Số lần chụp tìm được. Luôn >= 1. */
  captureCount: number
  /** Số lần chụp có `textHash` trùng một lần chụp trước đó. */
  duplicateCaptures: number
  /** Hash từng lần chụp theo thứ tự thời gian; phục vụ audit và benchmark. */
  textHashes: string[]
  /** Provider/model của lần chụp TỆ NHẤT — lần quyết định các cổng chặn. */
  provider: string
  model: string
}

/** Gợi ý chấm đã qua validator, kèm metadata provider để audit. */
export interface GradeSuggestion {
  suggestion: EssayGradingSuggestion
  provider: string
  model: string
  /** Hash của input đã gửi provider; phục vụ idempotency và audit. */
  inputHash: string
  /** Hash của response thô; chứng minh không bị sửa sau khi nhận. */
  responseHash: string
  promptTokens: number
  completionTokens: number
  /** Chi phí ước tính, đơn vị USD. Dùng cho cost cap. */
  estimatedCostUsd: number
  latencyMs: number
}

/**
 * Lỗi provider. Cố ý KHÔNG mang theo request/response thô: log lỗi là một
 * trong những đường rò rỉ key và nội dung bài làm phổ biến nhất.
 */
export class ProviderError extends Error {
  readonly provider: string
  readonly kind: ProviderErrorKind
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(params: {
    provider: string
    kind: ProviderErrorKind
    message: string
    retryable: boolean
    statusCode?: number
  }) {
    super(params.message)
    this.name = 'ProviderError'
    this.provider = params.provider
    this.kind = params.kind
    this.retryable = params.retryable
    this.statusCode = params.statusCode
  }
}

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'content_rejected'
  | 'network'
  | 'config'
  | 'unknown'

/** Quyết định cuối: chốt điểm hay đẩy về giáo viên. */
export interface FinalizeDecision {
  action: 'auto_finalize' | 'pending_review'
  /** Chỉ có giá trị khi action === 'auto_finalize'. */
  score: number | null
  /** Luôn có ít nhất một mục khi action === 'pending_review'. */
  triggers: ReviewTrigger[]
  /** Câu giải thích tiếng Việt cho giáo viên đọc trong hàng chờ. */
  explanation: string
}
