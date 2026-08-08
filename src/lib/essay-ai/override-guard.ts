/**
 * Cổng chặn auto-chốt theo mức độ giáo viên phải chấm đè điểm AI.
 *
 * VÌ SAO CẦN: `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 7 yêu cầu
 * `ESSAY_AI_AUTO_FINALIZE` phải **tự tắt** khi override rate vượt ngưỡng, và
 * mục 9 (GĐ 6) coi đây là điều kiện để mở cho lớp thật. Trước module này, một
 * lô bài chấm sai chỉ được phát hiện khi có người mở `/admin/essay-ai` đọc và
 * tự tắt cờ — nghĩa là cơ chế an toàn phụ thuộc vào việc ai đó tình cờ nhìn.
 *
 * NGUYÊN TẮC: đây là cổng CHỈ-SIẾT. Nó chỉ có thể chuyển `auto_finalize` thành
 * `pending_review`, không bao giờ ngược lại. Vì vậy nó không thể làm điểm máy
 * xuất hiện ở chỗ trước đó không có — chế độ hỏng tệ nhất của nó là chấm chậm,
 * không phải chấm sai.
 *
 * VÌ SAO KHÔNG CHỐT VÀO DATABASE: veto này tính lại mỗi lượt worker từ chính
 * `essay_ai_usage` + `essay_grading_reviews`, nên nó tự mở lại khi tỷ lệ tụt
 * xuống dưới ngưỡng. Đó là đánh đổi có ý thức: chốt cứng cần thêm một bảng
 * trạng thái và một migration nữa, mà hàng chờ migration hiện đã có hai file
 * chưa nạp. Hệ quả phải biết: quanh ngưỡng, auto-chốt có thể bật/tắt giữa các
 * lượt. `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 10 là chỗ chốt xem có cần
 * chuyển sang chốt cứng không.
 *
 * Module thuần logic, không I/O — người gọi đưa số liệu đã đếm vào.
 */

/**
 * Số liệu chấm đè trong cửa sổ phân tích. Trùng hình dạng với khối `override`
 * của `GET /api/admin/essay-ai/stats` một cách có chủ đích: worker và dashboard
 * phải nói cùng một con số, nếu không người vận hành đọc dashboard rồi quyết
 * định sai về cái worker đang thực sự làm.
 */
export interface OverrideStats {
  /** Số bài vừa được AI chấm vừa được giáo viên duyệt lại SAU đó. */
  compared: number
  /** Trong đó, số bài giáo viên đổi điểm (lệch > 0). */
  changed: number
  /** Số bài lệch quá `SERIOUS_ERROR_RATIO` của thang điểm câu đó. */
  serious: number
  /**
   * Một phần dữ liệu đối chiếu không đọc được. Số liệu vì thế đang THIẾU, tức
   * là tình hình có thể tệ hơn con số hiển thị — phải fail-closed.
   */
  partial: boolean
}

export interface OverrideThresholds {
  /**
   * Số bài đối chiếu tối thiểu trước khi được phép auto-chốt.
   *
   * `0` = KHÔNG đòi bằng chứng trước: bài đầu tiên cũng được AI chốt điểm ngay.
   * Chủ dự án chọn mức này ngày 2026-08-07 cho lớp học thêm — điểm không phải
   * điểm học bạ, và yêu cầu sản phẩm là học sinh nộp xong thấy điểm luôn, không
   * chờ ai duyệt. Đánh đổi phải hiểu rõ: với `compared = 0` thì "0% sai nghiêm
   * trọng" không phải bằng chứng gì cả, nên bài đầu tiên được chốt bằng NIỀM TIN
   * vào model, không bằng số liệu.
   *
   * Hai ngưỡng tỷ lệ bên dưới VẪN chạy ngay khi có bài đối chiếu đầu tiên, nên
   * phanh tự động không mất — nó chỉ không còn chặn lúc chưa có dữ liệu.
   */
  minCompared: number
  /** Tỷ lệ bài bị giáo viên đổi điểm, 0..1. Vượt là chặn. */
  maxChangedRate: number
  /**
   * Tỷ lệ bài lệch quá 20% thang điểm, 0..1. Đây là con số đo THIỆT HẠI chứ
   * không đo độ chính xác trung bình, nên ngưỡng của nó chặt hơn nhiều.
   */
  maxSeriousRate: number
}

/**
 * Mặc định thận trọng, CHƯA được xác nhận bằng dữ liệu thật.
 *
 * `docs/ESSAY_AUTO_GRADING_PLAN.md` mục 10 mục 1 vẫn đang chờ chủ dự án chốt
 * hai con số này. Chúng ở đây để cổng chặn có hành vi xác định ngay từ đầu,
 * không phải vì đã có bằng chứng 30%/5% là mức đúng. Đổi bằng env, và khi đã
 * có benchmark thật thì cập nhật cả kế hoạch.
 */
export const DEFAULT_OVERRIDE_THRESHOLDS: Readonly<OverrideThresholds> = {
  minCompared: 0,
  maxChangedRate: 0.3,
  maxSeriousRate: 0.05,
}

export type OverrideVerdict =
  | { blocked: false }
  | { blocked: true; reason: OverrideBlockReason; detail: string }

export type OverrideBlockReason =
  | 'insufficient_evidence'
  | 'changed_rate_exceeded'
  | 'serious_rate_exceeded'
  | 'stats_unavailable'

/**
 * Quyết định có chặn auto-chốt hay không.
 *
 * Thứ tự kiểm cố ý: thiếu dữ liệu -> thiếu bằng chứng -> sai nghiêm trọng ->
 * tỷ lệ sửa điểm. Lý do nghiêm trọng hơn được báo trước để người vận hành đọc
 * đúng vấn đề, thay vì thấy "tỷ lệ sửa điểm cao" khi vấn đề thật là AI chấm
 * lệch nửa thang điểm.
 *
 * `null` cho `stats` nghĩa là không đọc được số liệu — chặn, không cho qua.
 * Không biết mình đang chấm sai bao nhiêu không phải lý do để cho phép chấm.
 */
export function evaluateOverrideGuard(
  stats: OverrideStats | null,
  thresholds: OverrideThresholds = DEFAULT_OVERRIDE_THRESHOLDS
): OverrideVerdict {
  if (!stats) {
    return {
      blocked: true,
      reason: 'stats_unavailable',
      detail:
        'Không đọc được số liệu chấm đè, nên không biết AI đang chấm lệch bao nhiêu.',
    }
  }

  // Chưa có bài đối chiếu nào. Khi `minCompared = 0` thì đây là trạng thái được
  // chấp nhận có ý thức (xem `OverrideThresholds.minCompared`), và phải xử lý
  // TRƯỚC hai phép chia bên dưới: `0 / 0` cho `NaN`, mà `NaN > ngưỡng` luôn false
  // nên cổng sẽ "mở" như một tác dụng phụ của số học thay vì như một quyết định.
  // Dựa vào NaN là kiểu đúng-tình-cờ, và đúng-tình-cờ thì hỏng lúc nào không biết.
  if (stats.compared === 0) {
    if (thresholds.minCompared === 0) {
      return { blocked: false }
    }
    return {
      blocked: true,
      reason: 'insufficient_evidence',
      detail:
        `Chưa có bài nào được giáo viên duyệt lại để so (cần ${thresholds.minCompared}).`,
    }
  }

  // Dữ liệu thiếu một phần: con số nhìn thấy là mức TỐI THIỂU của vấn đề, nên
  // không dùng nó để cấp phép được.
  if (stats.partial) {
    return {
      blocked: true,
      reason: 'stats_unavailable',
      detail:
        'Số liệu chấm đè đang thiếu một phần, tình hình thật có thể tệ hơn con số đọc được.',
    }
  }

  if (stats.compared < thresholds.minCompared) {
    return {
      blocked: true,
      reason: 'insufficient_evidence',
      detail:
        `Mới có ${stats.compared}/${thresholds.minCompared} bài được giáo viên duyệt lại ` +
        'để so, chưa đủ bằng chứng cho phép AI tự chốt.',
    }
  }

  const seriousRate = stats.serious / stats.compared
  if (seriousRate > thresholds.maxSeriousRate) {
    return {
      blocked: true,
      reason: 'serious_rate_exceeded',
      detail:
        `Tỷ lệ sai nghiêm trọng ${formatRate(seriousRate)} vượt ngưỡng ` +
        `${formatRate(thresholds.maxSeriousRate)} (lệch quá 20% thang điểm).`,
    }
  }

  const changedRate = stats.changed / stats.compared
  if (changedRate > thresholds.maxChangedRate) {
    return {
      blocked: true,
      reason: 'changed_rate_exceeded',
      detail:
        `Tỷ lệ giáo viên phải sửa điểm ${formatRate(changedRate)} vượt ngưỡng ` +
        `${formatRate(thresholds.maxChangedRate)}.`,
    }
  }

  return { blocked: false }
}

/**
 * Đọc ngưỡng từ biến môi trường.
 *
 * Quy tắc giống `readEssayAiFlags`: giá trị sai hoặc thiếu KHÔNG làm cổng nới
 * ra — nó về mặc định thận trọng. Một typo trong env không được biến thành
 * "cho phép auto-chốt thoải mái".
 */
export function readOverrideThresholds(
  env: Record<string, string | undefined> = process.env
): OverrideThresholds {
  return {
    // `readNonNegativeInt` chứ không phải `readPositiveInt`: 0 là giá trị HỢP LỆ
    // và có nghĩa ("không đòi bằng chứng trước"), không phải giá trị sai cần bỏ
    // về mặc định.
    minCompared: readNonNegativeInt(
      env.ESSAY_AI_OVERRIDE_MIN_COMPARED,
      DEFAULT_OVERRIDE_THRESHOLDS.minCompared
    ),
    maxChangedRate: readRate(
      env.ESSAY_AI_OVERRIDE_MAX_CHANGED_RATE,
      DEFAULT_OVERRIDE_THRESHOLDS.maxChangedRate
    ),
    maxSeriousRate: readRate(
      env.ESSAY_AI_OVERRIDE_MAX_SERIOUS_RATE,
      DEFAULT_OVERRIDE_THRESHOLDS.maxSeriousRate
    ),
  }
}

/**
 * Biến môi trường rỗng hoặc chỉ có khoảng trắng nghĩa là CHƯA ĐẶT, không phải
 * số 0 — `Number('')` bằng 0, nên không lọc ở đây thì `ESSAY_AI_OVERRIDE_MAX_
 * SERIOUS_RATE=` (bỏ trống trong .env) sẽ âm thầm thành "không cho phép sai một
 * bài nào" và chặn auto-chốt vĩnh viễn mà không ai hiểu vì sao.
 */
function isBlank(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === ''
}

/**
 * Đọc số nguyên >= 0. Chỉ dùng cho `minCompared`, nơi 0 mang nghĩa thật là "không
 * đòi bằng chứng trước" chứ không phải là lỗi cấu hình.
 *
 * Giá trị âm hoặc không phải số nguyên vẫn về mặc định — quy tắc "typo không được
 * nới cổng" giữ nguyên; ở đây chỉ mở rộng miền hợp lệ xuống tới 0.
 */
function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (isBlank(raw)) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) return fallback
  // Không kẹp trần: đặt minCompared cao là siết, và siết thì luôn được phép.
  return value
}

function readRate(raw: string | undefined, fallback: number): number {
  if (isBlank(raw)) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 1) return fallback
  return value
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}
