/**
 * THANG LỚP — suy ra một câu hỏi thuộc lớp mấy, từ kiến thức nó bắt buộc phải dùng.
 *
 * HỢP ĐỒNG: `docs/CLASSIFICATION_RULES.md` mục 5 (D1–D5). Đọc trước khi sửa.
 *
 * ==========================================================================
 * NGUYÊN TẮC, GỌN LẠI TRONG MỘT CÂU
 *
 *   lớp(câu) = lớp CAO NHẤT trong mọi đơn vị kiến thức câu đó bắt buộc dùng.
 *
 * Không phải lớp của chương nó đang nằm. Không phải lớp của bài học người soạn
 * lấy đề từ đó. Một câu "nhìn sơ tưởng lớp 10" nhưng phải dùng kiến thức lớp 11
 * mới giải được thì **nó là câu lớp 11** — kiến thức là điều kiện cần, mà điều
 * kiện cần thì lấy `max`.
 * ==========================================================================
 *
 * CÁI KHÓ THẬT SỰ: MỘT DẤU HIỆU ĐƠN LẺ THƯỜNG KHÔNG QUYẾT ĐƯỢC LỚP NÀO CẢ.
 *
 * `phương sai` của mẫu số liệu RỜI RẠC là lớp 10; của mẫu GHÉP NHÓM là lớp 12.
 * `đồng biến` có ở cả ba lớp — parabol (10), `y = \sin x` (11), hàm tổng quát
 * qua đạo hàm (12). Lấy riêng từng từ khoá rồi cộng lại là sai từ gốc.
 *
 * Nên ở đây có ba loại đơn vị, và loại thứ ba nuốt hai loại đầu:
 *
 *   ĐỐI TƯỢNG   câu thao tác trên vật gì   (hàm bậc hai, mẫu ghép nhóm…)
 *   VIỆC        phải làm gì với vật đó     (xét đơn điệu, tìm phương sai…)
 *   CẶP         (đối tượng × việc) cụ thể, có lớp RIÊNG khác `max` của hai vế
 *
 * Bắt được cặp thì hai thành phần bị **loại khỏi phép `max`** — cặp cụ thể hơn,
 * nên nó thắng. Đó chính là "taxonomy phân cấp": luật chi tiết nuốt luật thô.
 *
 * ==========================================================================
 * CHẾ ĐỘ HIỆN TẠI: CHỈ BÁO CÁO
 *
 * Module này KHÔNG ghi vào database. Chưa có cột `question_taxonomy.grade`, và
 * theo mục 10 bước 7 thì cột đó chỉ được thêm sau khi chủ dự án chốt bốn dòng
 * còn treo ở mục 11. `scripts/grade-ladder-report.mjs` là chỗ dùng nó.
 *
 * KHÔNG suy được thì trả `null`, và `null` nghĩa là "chưa biết", KHÔNG phải
 * "lớp 12". Điền mặc định là đúng nguyên nhân của lỗi `profiles.grade` mà
 * `AGENTS.md` đã ghi: một cột NULL bị đoán bừa thành giá trị là lập tức giấu dữ
 * liệu khỏi người đáng được thấy.
 */

import { normalizeQuestion } from './normalize.ts'

export type Grade = 10 | 11 | 12

/** Vùng văn bản mà dấu hiệu được bắt ở đó. `docs/CLASSIFICATION_RULES.md` B1. */
export type Region = 'de' | 'y' | 'hinh'

export interface KnowledgeUnit {
  kind: 'doi-tuong' | 'viec' | 'cap'
  /** Mã đọc được, để người duyệt biết máy dựa vào cái gì. */
  code: string
  grade: Grade
  region: Region
}

export interface GradeVerdict {
  /** `null` = chưa đủ dấu hiệu. KHÔNG được hiểu là lớp 12. */
  grade: Grade | null
  /** Mọi đơn vị đã tính vào `max`. Cặp đã nuốt thành phần thì thành phần biến mất. */
  units: KnowledgeUnit[]
  /**
   * Có một CẶP đáng lẽ hạ lớp xuống, nhưng dạng hàm không nhận ra được là dạng
   * đơn giản — nên máy giữ lớp cao.
   *
   * Đây là danh sách cần người xem, không phải lỗi: `y = \sqrt{1+\sin x}` tìm
   * GTLN chặn được bằng `-1 ≤ sin x ≤ 1` (lớp 11) hay phải đạo hàm (lớp 12) là
   * câu hỏi về chương trình, không phải về code. Mục 11 của hợp đồng đang chờ
   * chủ dự án chốt.
   */
  uncertain: boolean
  notes: string[]
}

/* ==========================================================================
   TÁCH VÙNG VĂN BẢN — mục B1

   Chú thích hình mô tả BỨC TRANH, không mô tả KIẾN THỨC. Đo được: 10 câu có từ
   khoá hình học chỉ nằm trong chú thích, và một câu khảo sát hàm số đã bị xếp
   vào Hình học không gian vì chú thích viết "đồ thị hình chóp nhọn".

   Nên chú thích chỉ được đóng góp ĐỐI TƯỢNG, không được đóng góp VIỆC. Việc là
   thứ đề bài yêu cầu; một bức tranh không yêu cầu gì cả.
   ========================================================================== */

const FIGURE_BLOCK = /\[HÌNH:[^\]]*\]/gi

/** Tiền tố nguồn đề: `(THPT Lê Thánh Tông - HCM 2025)`, `(Mã 110 - 2017)`… */
const SOURCE_PREFIX = /^\s*\([^)]{0,80}\d{4}\)\s*/

export interface SplitText {
  /** Thân đề, đã gỡ chú thích hình và tiền tố nguồn. */
  de: string
  /** Chú thích hình gộp lại. */
  hinh: string
}

export function splitRegions(content: string): SplitText {
  const raw = content ?? ''
  const hinh = (raw.match(FIGURE_BLOCK) ?? []).join(' ')
  const de = raw.replace(FIGURE_BLOCK, ' ').replace(SOURCE_PREFIX, '')
  return { de, hinh }
}

/* ==========================================================================
   CÂU THỰC TẾ hay CÂU LÝ THUYẾT

   Quyết định của chủ dự án 2026-09-08: **hàm bậc hai lý thuyết là lớp 10, hàm
   bậc hai thực tế là lớp 12.** Cùng một đối tượng toán học, hai lớp khác nhau,
   và cái phân biệt không nằm ở công thức mà ở việc đề có bối cảnh đời sống hay
   không.

   Điều đó khớp với chính cây taxonomy: có hẳn chương "Ứng dụng đạo hàm để giải
   quyết một số vấn đề liên quan đến thực tiễn" với 80 câu, trong đó 67 câu là
   bài toán kinh tế. Bài parabol ném bóng, cổng Arch, chi phí sản xuất — chúng
   dùng đúng công thức lớp 10 nhưng được hỏi ở đề lớp 12.

   NGƯỠNG BẰNG CHỨNG. Phải có **chủ thể hoặc đại lượng đời sống**; đơn vị đo
   ĐƠN THUẦN không tính. Lý do: "Cho hình chóp $S.ABC$ có $SA = 3$ cm" đầy đơn
   vị mà vẫn là bài hình học thuần tuý. Ngược lại, "Một doanh nghiệp sản xuất
   $x$ sản phẩm" thì không cần đơn vị nào cũng đã là bài thực tế.
   ========================================================================== */

/** Chủ thể đời sống đứng làm chủ ngữ của đề. */
const CHU_THE_DOI_SONG: readonly RegExp[] = [
  /một (doanh nghiệp|công ty|nhà máy|xí nghiệp|trang trại|nông trại|cửa hàng|xưởng|hộ|gia đình|khách sạn|siêu thị|hợp tác xã|đại lý)/,
  /một (người|bạn|học sinh|công nhân|nông dân|kỹ sư|vận động viên|thợ|bác|chú|anh|chị)/,
  /(ông|bà|bạn|anh|chị|em) [a-zà-ỹ]+ (dự định|muốn|cần|có|mua|bán|xây|gửi|vay|làm|chạy|sử dụng)/,
  /vận động viên/,
  /người ta (muốn|cần|dự định|xây|làm|thiết kế|đo)/,
  /theo thống kê/,
]

/** Đại lượng đời sống — kinh tế, vật lí, dân số, nông nghiệp. */
const DAI_LUONG_DOI_SONG: readonly RegExp[] = [
  // Kinh tế
  /chi phí/, /doanh thu/, /lợi nhuận/, /giá (bán|thành|vốn|mỗi)/, /tiền lãi/, /lãi suất/,
  /sản phẩm/, /thu nhập/, /triệu đồng/, /tỉ đồng/, /tỷ đồng/, /đô la/, /vốn đầu tư/,
  // Vật lí – chuyển động
  /vận tốc/, /quãng đường/, /gia tốc/, /độ cao (so với|của|ban đầu)/, /nhiệt độ/,
  /thời điểm/, /chuyển động/,
  // Đời sống khác
  /dân số/, /diện tích (mảnh|khu|rừng|đất|vườn|sân|mặt bằng)/,
  /thể tích (bể|thùng|hộp|bình)/, /hàng rào/, /chu vi (mảnh|khu|vườn)/,
  /(bài toán|vấn đề) (thực tiễn|thực tế|kinh tế|tối ưu)/,
  /trong thực (tế|tiễn)/,
]

/**
 * Đề có bối cảnh đời sống không.
 *
 * Xuất ra ngoài để dùng lại: cây taxonomy có sẵn nhánh "Ứng dụng … thực tiễn",
 * nên phép phân biệt này còn dùng cho việc chọn mạch chứ không riêng thang lớp.
 */
export function laCauThucTe(normalizedText: string): boolean {
  return (
    CHU_THE_DOI_SONG.some((pattern) => pattern.test(normalizedText)) ||
    DAI_LUONG_DOI_SONG.some((pattern) => pattern.test(normalizedText))
  )
}

/* ==========================================================================
   BẢNG D1 — LỚP CỦA ĐỐI TƯỢNG
   ========================================================================== */

interface Signal {
  code: string
  grade: Grade
  patterns: RegExp[]
  /**
   * Dấu hiệu khiến đơn vị này TỰ LOẠI, dù `patterns` khớp.
   *
   * Cần cho đúng một chuyện, nhưng chuyện đó quan trọng: nhận ra hàm bậc hai
   * phải dựa vào `x^2` viết thẳng trong đề (`y = -4x^2 + 16x + 2025` không hề
   * nói chữ "parabol"), mà `x^2` cũng có trong hàm bậc ba, trong
   * `\log_3(x^2-2x+3)`, trong `\sqrt{x^2+1}`. Thiếu nhóm loại trừ thì cả ba
   * nhóm đó bị hạ xuống lớp 10.
   */
  exclude?: RegExp[]
}

const OBJECTS: readonly Signal[] = [
  // --- Lớp 10 ---
  {
    code: 'menh-de-tap-hop',
    grade: 10,
    patterns: [/phủ định của mệnh đề/, /tập con/, /phần bù/, /(giao|hợp) của hai tập/],
  },
  {
    code: 'bpt-bac-nhat-hai-an',
    grade: 10,
    /* `hệ bất phương trình` trần PHẢI có mặt: đề thật viết "Cho hệ bất phương
       trình $\begin{cases}…$", không ai gõ đủ chữ "bậc nhất hai ẩn". Thiếu nó
       thì cả nhóm quy hoạch tuyến tính lớp 10 chỉ còn lại dấu hiệu "giá trị lớn
       nhất" và bị đẩy lên lớp 12. */
    patterns: [/miền nghiệm/, /bất phương trình bậc nhất hai ẩn/, /hệ bất phương trình/],
    /* …nhưng chỉ khi hệ đó THẬT SỰ bậc nhất. Có luỹ thừa, lôgarit hay hàm lượng
       giác thì đây là mạch khác mượn chữ "hệ bất phương trình". */
    exclude: [/x\^[2-9]/, /\\log/, /\\ln\b/, /\\(sin|cos|tan|cot)\b/, /\\sqrt/],
  },
  {
    code: 'ham-bac-hai',
    grade: 10,
    /* Đề lớp 10 thường KHÔNG nói chữ "parabol" hay "bậc hai"; nó viết thẳng
       `y = -4x^2 + 16x + 2025`, `(P)`, hoặc nói "đỉnh I". Thiếu dạng viết đó thì
       cả nhóm câu lớp 10 vô hình với thang lớp. */
    patterns: [/parabol/, /tam thức/, /hàm số bậc hai/, /đỉnh i\(/, /x\^2/],
    /* `x^2` một mình KHÔNG có nghĩa là hàm bậc hai — nó có trong hàm bậc ba
       (`-x^3+3x^2-4`), trong `\log_3(x^2-2x+3)`, trong `\sqrt{x^2+1}`, trong
       phương trình mặt cầu. Nhận là bậc hai chỉ khi KHÔNG có bậc cao hơn và
       KHÔNG có hàm nào bọc ngoài. */
    exclude: [
      /x\^[3-9]/,
      /\\sqrt/,
      /\\log/,
      /\\ln\b/,
      /\\(sin|cos|tan|cot)\b/,
      /\\int/,
      /\\lim/,
      /oxyz/,
      /mặt cầu/,
    ],
  },
  {
    code: 'he-thuc-luong-tam-giac',
    grade: 10,
    patterns: [/định lí (sin|cosin)/, /hệ thức lượng trong tam giác/],
  },
  {
    code: 'toa-do-phang',
    grade: 10,
    patterns: [/tích vô hướng/, /phương trình đường tròn/, /vectơ chỉ phương của đường thẳng/],
  },
  { code: 'ba-duong-conic', grade: 10, patterns: [/elip/, /hypebol/, /đường conic/] },
  {
    code: 'to-hop',
    grade: 10,
    /* KNTT xếp tổ hợp ở lớp 10. Tên chương trong cây ghi "(Lớp 10 + 11)" nên
       đây là một trong bốn dòng chờ chủ dự án chốt — mục 11. */
    patterns: [/hoán vị/, /chỉnh hợp/, /tổ hợp chập/, /nhị thức newton/, /quy tắc (cộng|nhân)\b/],
  },

  // --- Lớp 11 ---
  {
    code: 'luong-giac',
    grade: 11,
    /* Ở ĐÂY `\sin` trần LÀ đủ, khác hẳn lớp luật chọn mạch.
       Lý do: chỗ này hỏi "câu dùng vật gì", và `\sin` đúng là hàm lượng giác —
       kiến thức lớp 11 — bất kể câu hỏi bảo làm gì với nó. Còn lớp luật hỏi
       "câu thuộc mạch nào", và ở đó `\sin` không đủ vì mạch do VIỆC quyết định.
       Hai câu hỏi khác nhau nên hai ngưỡng bằng chứng khác nhau. */
    patterns: [
      /lượng giác/,
      /\\(sin|cos|tan|cot)\b/,
      /hàm (sin|cosin|cos|tang|cotang)/,
      /đường tròn lượng giác/,
    ],
  },
  {
    code: 'cap-so',
    grade: 11,
    patterns: [/cấp số (cộng|nhân)/, /công sai/, /công bội/],
  },
  { code: 'day-so', grade: 11, patterns: [/dãy số/, /số hạng (đầu|tổng quát|thứ)/] },
  { code: 'gioi-han', grade: 11, patterns: [/\\lim/, /liên tục tại/, /hàm số liên tục/] },
  {
    code: 'mu-log',
    grade: 11,
    /* Neo vào DẠNG LỆNH LaTeX chứ không phải chuỗi trần — mục B3. Đo được: 6
       câu chứa chuỗi "log" mà không liên quan lôgarit (`kilogam`, `logo`,
       `logistic`). */
    patterns: [/\\log/, /\\ln\b/, /logarit/, /lôgarit/, /hàm số mũ/, /phương trình mũ/],
  },
  {
    code: 'dao-ham',
    grade: 11,
    patterns: [/đạo hàm/, /f'\(/, /tiếp tuyến của đồ thị/],
  },
  {
    code: 'hinh-khong-gian-11',
    grade: 11,
    patterns: [/hình chóp/, /lăng trụ/, /hình hộp/, /góc nhị diện/, /giao tuyến của hai mặt phẳng/],
  },
  { code: 'mau-ghep-nhom', grade: 11, patterns: [/ghép nhóm/] },
  {
    code: 'xac-suat-11',
    grade: 11,
    patterns: [/biến cố (độc lập|đối|hợp|giao)/, /quy tắc (cộng|nhân) xác suất/],
  },

  // --- Lớp 12 ---
  {
    code: 'ham-tong-quat',
    grade: 12,
    /* CHỈ những dạng chắc chắn là lớp 12. "Cho hàm số y=f(x) có đồ thị như hình
       vẽ" KHÔNG nằm ở đây: đọc đồ thị là việc có từ lớp 10, và dùng nó làm dấu
       hiệu lớp 12 sẽ kéo cả nhóm câu lớp 10 lên. */
    patterns: [/bảng biến thiên/, /y ?= ?ax\^3/, /ax\^3 ?\+ ?bx\^2/],
    /* `bảng biến thiên` KHÔNG phải của riêng lớp 12 — SGK 10 lập bảng biến
       thiên cho parabol ngay trong bài Hàm số bậc hai. Đo được: một câu
       "Cho hàm số bậc hai $y=ax^2+bx+c$ có đồ thị $(P)$…" bị đẩy lên lớp 12 chỉ
       vì một Ý của nó nhắc bảng biến thiên. */
    exclude: [/hàm số bậc hai/, /parabol/, /ax\^2/, /tam thức/],
  },
  {
    code: 'nguyen-ham-tich-phan',
    grade: 12,
    patterns: [/nguyên hàm/, /tích phân/, /\\int/],
  },
  {
    code: 'toa-do-khong-gian',
    grade: 12,
    patterns: [/oxyz/, /phương trình mặt phẳng/, /mặt cầu/, /vectơ pháp tuyến/],
  },
  {
    code: 'xac-suat-co-dieu-kien',
    grade: 12,
    patterns: [/xác suất có điều kiện/, /\bbayes\b/, /xác suất toàn phần/],
  },
  {
    code: 'bien-ngau-nhien',
    grade: 12,
    patterns: [/biến ngẫu nhiên rời rạc/, /kì vọng/],
  },
  {
    code: 'chuyen-de-12',
    grade: 12,
    patterns: [/lãi (kép|đơn|suất)/, /vay nợ/, /quy hoạch tuyến tính/],
  },
]

/* ==========================================================================
   BẢNG D2 — LỚP CỦA VIỆC
   ========================================================================== */

const TASKS: readonly Signal[] = [
  { code: 'xet-don-dieu', grade: 12, patterns: [/đồng biến/, /nghịch biến/, /đơn điệu/] },
  { code: 'tim-cuc-tri', grade: 12, patterns: [/cực (đại|tiểu|trị)/] },
  { code: 'tim-gtln-gtnn', grade: 12, patterns: [/giá trị (lớn|nhỏ) nhất/] },
  { code: 'tim-tiem-can', grade: 12, patterns: [/tiệm cận/] },
  { code: 'tinh-tich-phan', grade: 12, patterns: [/\\int/, /tính.{0,20}tích phân/] },
  { code: 'tinh-the-tich', grade: 11, patterns: [/thể tích/] },
  { code: 'tinh-xac-suat', grade: 10, patterns: [/tính xác suất/, /xác suất (của|để|bằng)/] },
  {
    code: 'so-dac-trung-xu-the',
    grade: 10,
    patterns: [/số trung bình/, /trung vị/, /tứ phân vị/, /\bmốt\b/],
  },
  {
    code: 'so-dac-trung-phan-tan',
    grade: 10,
    patterns: [/phương sai/, /độ lệch chuẩn/, /khoảng biến thiên/, /khoảng tứ phân vị/],
  },
]

/* ==========================================================================
   BẢNG D3 — CẶP (ĐỐI TƯỢNG × VIỆC)

   Chỉ liệt kê những cặp mà lớp KHÁC `max` của hai vế. Cặp nào không có ở đây
   thì `max` là đúng, và không cần một dòng để nói điều đó.
   ========================================================================== */

interface Pair {
  object: string
  task: string
  grade: Grade
  /**
   * Cặp chỉ hạ lớp khi dạng hàm nhận ra được là ĐƠN GIẢN.
   *
   * `y = \sin x` xét đồng biến là đọc đồ thị, lớp 11. `y = \log_3(x^2-2x+3)`
   * xét đồng biến là đạo hàm hàm hợp, lớp 12 — cùng một cặp mã, hai lớp khác
   * nhau, và cái phân biệt chúng là DẠNG chứ không phải từ khoá.
   *
   * Không nhận ra dạng đơn giản thì KHÔNG hạ, và đánh dấu `uncertain` để người
   * soạn xem. Im lặng hạ lớp một câu hàm hợp là giao bài lớp 12 cho học sinh
   * lớp 11.
   */
  simpleForm?: RegExp
  note?: string
}

/** `y = 2\sin x + 5`, `y = -\cos x`, `y = 1 + 3\sin(2x - \pi/4)`. */
const DANG_LUONG_GIAC_DON_GIAN =
  /y ?= ?[-+]? ?\d* ?[-+]? ?\d* ?\\(sin|cos|tan|cot) ?\(?\s*[-+]? ?\d* ?x/

/**
 * `y = \log_a x`, `y = a^x` — cơ số và biến, KHÔNG có biểu thức lồng bên trong.
 *
 * Phần `(?![\^(0-9a-z])` là thứ phân biệt `y = \log_3 x` (lớp 11) với
 * `y = \log_3(x^2-2x+3)` (lớp 12). Không có nó thì `[^ ]{0,6}` nuốt luôn `3(x^2-`
 * rồi vẫn tìm được một chữ `x` phía sau, và câu hàm hợp bị hạ xuống lớp 11.
 */
const DANG_MU_LOG_DON_GIAN = /y ?= ?\\log_?[a-z0-9]{0,3} ?x(?![\^(0-9a-z])|y ?= ?[a-z0-9]\^x\b/

const PAIRS: readonly Pair[] = [
  /* Hai cặp bậc hai KHÔNG cần `simpleForm`: nhóm `exclude` của đối tượng
     `ham-bac-hai` đã đảm bảo đây là bậc hai thật, không phải `x^2` nằm trong
     một hàm khác. Kiểm hai lần ở hai chỗ là để hai chỗ đó lệch nhau. */
  /*
    HAI CẶP BẬC HAI Ở LỚP 10 — nhưng chỉ khi đề là LÝ THUYẾT.

    Chủ dự án chốt lại 2026-09-08 (bản sau, thay bản trước cùng ngày): cái phân
    biệt không phải VIỆC mà là đề có bối cảnh đời sống hay không. Nên hai cặp
    này quay về lớp 10, và câu thực tế được tách ra thành một đối tượng riêng
    (`ham-bac-hai-thuc-te`, lớp 12) — mã khác nên hai cặp dưới đây không khớp
    được với nó, và `max` cho ra 12.

    Tách bằng MÃ ĐỐI TƯỢNG chứ không bằng một cờ trong cặp là có lý do: bằng
    chứng in ra cho người duyệt sẽ ghi thẳng `ham-bac-hai-thuc-te=12`, đọc là
    hiểu ngay vì sao câu này lên lớp 12.
  */
  {
    object: 'ham-bac-hai',
    task: 'xet-don-dieu',
    grade: 10,
    note: 'Đọc từ đỉnh parabol — SGK 10, bài Hàm số bậc hai.',
  },
  {
    object: 'ham-bac-hai',
    task: 'tim-gtln-gtnn',
    grade: 10,
    note: 'Giá trị tại đỉnh — SGK 10.',
  },
  {
    object: 'luong-giac',
    task: 'tim-gtln-gtnn',
    grade: 11,
    simpleForm: DANG_LUONG_GIAC_DON_GIAN,
    note: 'Chặn bằng -1 ≤ sin x ≤ 1, không cần đạo hàm.',
  },
  {
    object: 'luong-giac',
    task: 'xet-don-dieu',
    grade: 11,
    simpleForm: DANG_LUONG_GIAC_DON_GIAN,
    note: 'Đọc từ đồ thị hàm lượng giác — SGK 11.',
  },
  {
    object: 'mu-log',
    task: 'xet-don-dieu',
    grade: 11,
    simpleForm: DANG_MU_LOG_DON_GIAN,
    note: 'Suy từ cơ số — SGK 11.',
  },
  {
    /* QUY HOẠCH TUYẾN TÍNH — ô sai nhiều nhất khi chưa có cặp này.
       "Tìm giá trị lớn nhất của $F = x - y + 2024$ trên miền nghiệm của hệ bất
       phương trình" là bài LỚP 10 (SGK 10, bài Hệ bất phương trình bậc nhất hai
       ẩn): xét giá trị tại các đỉnh của miền đa giác, không có đạo hàm nào cả.
       Đo được: thiếu cặp này thì 6 câu lớp 10 bị đẩy lên lớp 12 — và lớp luật
       chọn mạch cũng mắc đúng lỗi đó, nó đòi kéo 7 câu sang giải tích. */
    object: 'bpt-bac-nhat-hai-an',
    task: 'tim-gtln-gtnn',
    grade: 10,
    note: 'GTLN–GTNN của biểu thức bậc nhất trên miền đa giác — SGK 10.',
  },
  {
    object: 'mau-ghep-nhom',
    task: 'so-dac-trung-xu-the',
    grade: 11,
    note: 'Trung bình / trung vị / mốt / tứ phân vị của mẫu ghép nhóm — SGK 11.',
  },
  {
    object: 'mau-ghep-nhom',
    task: 'so-dac-trung-phan-tan',
    grade: 12,
    note: 'Khoảng biến thiên / phương sai của mẫu ghép nhóm — SGK 12.',
  },
  {
    object: 'hinh-khong-gian-11',
    task: 'tinh-the-tich',
    grade: 11,
    note: 'Thể tích khối chóp / lăng trụ — SGK 11.',
  },
  {
    object: 'nguyen-ham-tich-phan',
    task: 'tinh-the-tich',
    grade: 12,
    note: 'Thể tích bằng tích phân — SGK 12.',
  },
]

/**
 * `text` là vùng đang xét; `scope` là TOÀN BỘ đề + các ý.
 *
 * Dấu hiệu bắt theo vùng (để biết nó đến từ đâu), nhưng LOẠI TRỪ xét trên toàn
 * câu. Lý do đo được: một câu mở đầu "Cho hàm số bậc hai $y=ax^2+bx+c$…" có một
 * Ý nhắc "bảng biến thiên". Xét loại trừ theo từng vùng thì vùng Ý không thấy
 * chữ "hàm số bậc hai" ở đề, nên nó vẫn kết luận "hàm tổng quát lớp 12" và đẩy
 * cả câu lên lớp 12. Loại trừ là phát biểu về CẢ CÂU, không phải về một mẩu.
 */
function detect(
  signals: readonly Signal[],
  text: string,
  scope: string,
  region: Region,
  kind: 'doi-tuong' | 'viec'
) {
  const found: KnowledgeUnit[] = []
  for (const signal of signals) {
    if ((signal.exclude ?? []).some((pattern) => pattern.test(scope))) continue
    if (signal.patterns.some((pattern) => pattern.test(text))) {
      found.push({ kind, code: signal.code, grade: signal.grade, region })
    }
  }
  return found
}

/**
 * Suy lớp cho một câu.
 *
 * `answers` chỉ được ghép cho `true_false` và `short_answer` — mục B2. Với
 * `multiple_choice`, ba trên bốn phương án là đáp án SAI, thường là công thức
 * của mạch khác cố tình đặt vào để gây nhiễu; ghép chúng vào là mời chính cái
 * bẫy của đề đi quyết định lớp.
 */
export function gradeOf(
  content: string,
  options: { questionType?: string | null; answers?: readonly string[] } = {}
): GradeVerdict {
  const regions = splitRegions(content ?? '')
  const de = normalizeQuestion(regions.de)
  const hinh = normalizeQuestion(regions.hinh)

  const mergeAnswers =
    options.questionType === 'true_false' || options.questionType === 'short_answer'
  const y = mergeAnswers ? normalizeQuestion((options.answers ?? []).filter(Boolean).join(' ')) : ''

  /** Phạm vi xét LOẠI TRỪ: đề + các ý. Chú thích hình không tham gia. */
  const scope = y ? `${de} ${y}` : de

  const units: KnowledgeUnit[] = [
    ...detect(OBJECTS, de, scope, 'de', 'doi-tuong'),
    ...detect(TASKS, de, scope, 'de', 'viec'),
    ...(y
      ? [...detect(OBJECTS, y, scope, 'y', 'doi-tuong'), ...detect(TASKS, y, scope, 'y', 'viec')]
      : []),
    // Chú thích hình: ĐỐI TƯỢNG thôi. Xem khối chú thích ở phần tách vùng.
    ...(hinh ? detect(OBJECTS, hinh, `${scope} ${hinh}`, 'hinh', 'doi-tuong') : []),
  ]

  // Gộp trùng: cùng một mã bắt được ở hai vùng vẫn là một đơn vị kiến thức.
  const byCode = new Map<string, KnowledgeUnit>()
  for (const unit of units) {
    if (!byCode.has(unit.code)) byCode.set(unit.code, unit)
  }

  /*
    HÀM BẬC HAI THỰC TẾ LÀ LỚP 12 — quyết định của chủ dự án 2026-09-08.

    Cùng công thức lớp 10, nhưng bài parabol ném bóng, cổng Arch, chi phí sản
    xuất được hỏi ở đề lớp 12; cây taxonomy có hẳn chương "Ứng dụng đạo hàm để
    giải quyết một số vấn đề liên quan đến thực tiễn" cho nhóm đó.

    Đổi hẳn MÃ chứ không chỉ nâng số lớp: mã mới không khớp hai cặp bậc hai ở
    bảng D3 (vốn giữ chúng ở lớp 10), nên phép `max` tự cho ra 12 mà không cần
    một trường hợp ngoại lệ nào trong vòng lặp ghép cặp.
  */
  const bacHai = byCode.get('ham-bac-hai')
  if (bacHai && laCauThucTe(scope)) {
    byCode.delete('ham-bac-hai')
    byCode.set('ham-bac-hai-thuc-te', { ...bacHai, code: 'ham-bac-hai-thuc-te', grade: 12 })
  }

  const notes: string[] = []
  let uncertain = false
  const consumed = new Set<string>()
  const pairUnits: KnowledgeUnit[] = []
  /** Nhận dạng công thức chạy trên cùng phạm vi với loại trừ: đề + các ý. */
  const formText = scope

  for (const pair of PAIRS) {
    if (!byCode.has(pair.object) || !byCode.has(pair.task)) continue

    if (pair.simpleForm && !pair.simpleForm.test(formText)) {
      /* Cặp có thể áp dụng nhưng dạng hàm không nhận ra được là đơn giản. Giữ
         lớp cao và ghi lại — đây là danh sách người soạn cần xem, không phải
         lỗi. */
      if (pair.grade < byCode.get(pair.task)!.grade) {
        uncertain = true
        notes.push(
          `Có (${pair.object} × ${pair.task}) nhưng không nhận ra dạng đơn giản — giữ lớp ${
            byCode.get(pair.task)!.grade
          }, cần người xem.`
        )
      }
      continue
    }

    consumed.add(pair.object)
    consumed.add(pair.task)
    pairUnits.push({
      kind: 'cap',
      code: `${pair.object} × ${pair.task}`,
      grade: pair.grade,
      region: 'de',
    })
    if (pair.note) notes.push(pair.note)
  }

  const finalUnits = [
    ...[...byCode.values()].filter((unit) => !consumed.has(unit.code)),
    ...pairUnits,
  ]

  if (finalUnits.length === 0) {
    return { grade: null, units: [], uncertain: false, notes: ['Không đủ dấu hiệu.'] }
  }

  const grade = Math.max(...finalUnits.map((unit) => unit.grade)) as Grade

  /*
    CHỈ CÓ VIỆC, KHÔNG CÓ ĐỐI TƯỢNG NÀO → CHƯA CHẮC.

    Cả bảng D3 nói một điều: việc không tự quyết được lớp, đối tượng mới quyết.
    "Tìm giá trị lớn nhất" đứng một mình có thể là parabol lớp 10, là đọc đồ thị
    lớp 10, hay là đạo hàm lớp 12 — không đọc được từ đâu ra.

    Vẫn trả lớp (lớp nền của việc, tức lớp cao) chứ không trả `null`: một câu có
    "tìm cực trị" thì gần như chắc không phải lớp 10. Nhưng phải nói rõ là máy
    đang đoán ở mức yếu, để nó nằm trong danh sách người soạn xem.
  */
  if (!finalUnits.some((unit) => unit.kind !== 'viec')) {
    uncertain = true
    notes.push('Chỉ bắt được VIỆC, không bắt được đối tượng nào — bằng chứng yếu.')
  }

  return { grade, units: finalUnits, uncertain, notes }
}
