/**
 * Loại bỏ dữ liệu định danh trước khi nội dung rời server.
 *
 * Vì sao module này là BẮT BUỘC, không phải tuỳ chọn:
 * `docs/ESSAY_GRADING.md` ghi nhận một lỗ hổng đã biết — gói chấm chứa nguyên
 * văn bài làm, và nếu học sinh tự viết tên/lớp trong bài thì hệ thống không tự
 * xoá. Với luồng thủ công, giáo viên là người kiểm tra trước khi paste sang AI.
 * Với luồng tự động thì KHÔNG AI KIỂM TRA. Lỗ hổng chấp nhận được trước đây
 * trở thành đường rò rỉ PII có hệ thống.
 *
 * Giới hạn phải hiểu rõ: đây là lưới lọc heuristic, không phải bảo đảm.
 *
 * Thiết kế cố ý ưu tiên KHÔNG PHÁ NỘI DUNG TOÁN hơn là phủ hết PII. Các mẫu
 * số định danh (CCCD, số điện thoại) chỉ kích hoạt khi có nhãn đi kèm
 * ("SĐT: 09..."), vì phiên bản heuristic số thuần đã ẩn nhầm
 * "Diện tích là 123456789 mét vuông" và "0.123456789" trong test 2026-08-03.
 * Bài bị bóp méo sẽ được AI chấm sai mà không ai phát hiện, nên đó là thiệt
 * hại lớn hơn việc lọt một chuỗi số.
 *
 * Hệ quả: module này KHÔNG bắt được số định danh viết trần không nhãn, tên
 * rời rạc giữa câu văn, biệt danh, hay thông tin gián tiếp. Không dùng nó để
 * biện minh cho việc gửi dữ liệu nhạy cảm hơn mức cần thiết, và không coi
 * "đã chạy redaction" là bằng chứng payload sạch PII.
 */

export interface RedactionResult {
  text: string
  /** Số lần thay thế theo từng loại; dùng để theo dõi, không log nội dung. */
  counts: Record<RedactionKind, number>
  /** True nếu có bất kỳ thay thế nào — tín hiệu đáng ghi vào audit. */
  redacted: boolean
}

export type RedactionKind =
  | 'labeled_name'
  | 'email'
  | 'phone'
  | 'class_code'
  | 'national_id'
  | 'student_code'

const PLACEHOLDER: Record<RedactionKind, string> = {
  labeled_name: '[ĐÃ ẨN TÊN]',
  email: '[ĐÃ ẨN EMAIL]',
  phone: '[ĐÃ ẨN SĐT]',
  class_code: '[ĐÃ ẨN LỚP]',
  national_id: '[ĐÃ ẨN CCCD]',
  student_code: '[ĐÃ ẨN MÃ HS]',
}

/**
 * Nhãn thường gặp ở đầu bài làm tiếng Việt. Bắt cả biến thể có dấu và không
 * dấu vì học sinh gõ trên máy tính thường bỏ dấu.
 */
const NAME_LABELS =
  '(?:họ\\s*(?:và\\s*)?tên|ho\\s*(?:va\\s*)?ten|hovaten|tên\\s*(?:học\\s*sinh|hs)|ten\\s*(?:hoc\\s*sinh|hs)|name)'

const CLASS_LABELS = '(?:lớp|lop|class)'

/**
 * Nhãn đứng trước số định danh. Bắt buộc phải có nhãn mới ẩn số.
 *
 * Vì sao không dùng heuristic số thuần: đây là ứng dụng môn Toán, bài làm đầy
 * số. Test ngày 2026-08-03 cho thấy mẫu "9 hoặc 12 chữ số" ẩn nhầm
 * "Diện tích là 123456789 mét vuông", và mẫu số điện thoại nuốt cả
 * "0.123456789" thành "[ĐÃ ẨN SĐT]". Một bài bị bóp méo như vậy sẽ được AI
 * chấm sai mà không ai biết. Neo theo nhãn đánh đổi độ phủ lấy độ an toàn:
 * bỏ sót số định danh viết trần, nhưng không phá nội dung toán.
 */
const ID_LABELS = '(?:cccd|cmnd|căn\\s*cước|can\\s*cuoc|chứng\\s*minh|chung\\s*minh)'
const PHONE_LABELS =
  '(?:sđt|sdt|số\\s*điện\\s*thoại|so\\s*dien\\s*thoai|điện\\s*thoại|dien\\s*thoai|phone|tel)'

interface Rule {
  kind: RedactionKind
  pattern: RegExp
}

/**
 * Thứ tự có ý nghĩa: mẫu neo nhãn chạy trước mẫu tự do, để nhãn không bị mẫu
 * khác cắt mất trước khi tới lượt nó.
 */
const RULES: Rule[] = [
  {
    // Email đứng riêng vẫn an toàn: định dạng đặc thù, không đụng nội dung toán.
    kind: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    // "CCCD: 001234567890" — chỉ ẩn khi có nhãn đi kèm.
    kind: 'national_id',
    pattern: new RegExp(`(${ID_LABELS})\\s*[:：]?\\s*\\d[\\d\\s.-]{7,15}\\d`, 'gi'),
  },
  {
    // "SĐT: 0912345678" hoặc "điện thoại 0912 345 678".
    kind: 'phone',
    pattern: new RegExp(
      `(${PHONE_LABELS})\\s*[:：]?\\s*(?:\\+?84|0)[\\d\\s.-]{8,13}\\d`,
      'gi'
    ),
  },
  {
    // "Họ và tên: Nguyễn Văn A" — chỉ lấy phần sau nhãn tới hết dòng.
    kind: 'labeled_name',
    pattern: new RegExp(`(${NAME_LABELS})\\s*[:：]\\s*[^\\n\\r]{1,80}`, 'gi'),
  },
  {
    // "Lớp: 12A3" hoặc "lop 12A3". Yêu cầu dạng <số><chữ> để không nuốt
    // "lớp 12" trong câu văn thông thường về khối lớp.
    kind: 'class_code',
    pattern: new RegExp(`(${CLASS_LABELS})\\s*[:：]?\\s*\\d{1,2}\\s*[A-Za-z]\\d{0,2}\\b`, 'gi'),
  },
  {
    // Mã học sinh dạng HS12345, SBD123456 — có tiền tố chữ nên an toàn.
    kind: 'student_code',
    pattern: /\b(?:HS|SBD|MSHS)[\s.-]?\d{3,10}\b/gi,
  },
]

/**
 * Vùng công thức LaTeX. Nội dung bên trong không bao giờ bị redact: một số bị
 * thay bằng placeholder giữa công thức sẽ làm hỏng cả bài chấm.
 */
const MATH_REGION = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g

/**
 * Ẩn PII trong text trước khi gửi provider bên ngoài.
 *
 * Với các mẫu neo nhãn, nhãn được giữ lại để bài làm vẫn đọc được ngữ cảnh —
 * chỉ giá trị bị thay. AI không cần biết tên để chấm Toán.
 *
 * Vùng công thức LaTeX được tách ra và ghép lại nguyên vẹn: redact bên trong
 * công thức làm hỏng bài chấm nghiêm trọng hơn là để lọt một chuỗi số.
 */
export function redactPii(input: string): RedactionResult {
  const counts: Record<RedactionKind, number> = {
    labeled_name: 0,
    email: 0,
    phone: 0,
    class_code: 0,
    national_id: 0,
    student_code: 0,
  }

  const applyRules = (segment: string): string => {
    let result = segment
    for (const rule of RULES) {
      result = result.replace(rule.pattern, (match, label?: string) => {
        counts[rule.kind] += 1
        // Giữ nhãn ("Họ và tên:") để câu không bị đứt nghĩa.
        return typeof label === 'string'
          ? `${label}: ${PLACEHOLDER[rule.kind]}`
          : PLACEHOLDER[rule.kind]
      })
    }
    return result
  }

  // Tách theo vùng công thức; phần tử lẻ trong mảng split là vùng đã capture.
  const segments = input.split(MATH_REGION)
  const text = segments
    .map((segment, index) => (index % 2 === 1 ? segment : applyRules(segment)))
    .join('')

  const redacted = Object.values(counts).some((count) => count > 0)
  return { text, counts, redacted }
}

/**
 * Kiểm tra một payload sắp gửi provider không chứa khoá định danh.
 *
 * Đây là chốt chặn cuối, chạy ngay trước lời gọi mạng. Nếu nó throw thì có
 * nghĩa một chỗ nào đó phía trên đã lắp sai dữ liệu — sửa chỗ đó, đừng nới
 * danh sách khoá ở đây.
 */
const FORBIDDEN_KEYS = [
  'student_id',
  'studentid',
  'user_id',
  'userid',
  'attempt_id',
  'attemptid',
  'email',
  'full_name',
  'fullname',
  'class_id',
  'classid',
  'phone',
  'profile',
]

export function assertNoIdentifiers(payload: unknown, path = 'payload'): void {
  if (payload === null || typeof payload !== 'object') return

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertNoIdentifiers(item, `${path}[${index}]`))
    return
  }

  for (const [key, value] of Object.entries(payload)) {
    const normalized = key.toLowerCase().replace(/[^a-z_]/g, '')
    if (FORBIDDEN_KEYS.includes(normalized)) {
      throw new Error(
        `Payload gửi provider chứa trường định danh "${path}.${key}". Loại bỏ trước khi gửi.`
      )
    }
    assertNoIdentifiers(value, `${path}.${key}`)
  }
}
