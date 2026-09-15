/**
 * Prompt gợi ý phân loại — `docs/QUESTION_AUDIT_PLAN.md` mục 8.
 *
 * GỬI THEO LÔ, KHÔNG PHẢI TỪNG CÂU. Cây taxonomy phải nằm trong mọi lời gọi
 * (AI chỉ được chọn trong danh sách có thật), và cây thì dài hơn câu hỏi nhiều
 * lần. Gửi từng câu một nghĩa là trả tiền cho cả cây 297 lần. Gộp 10 câu một
 * lô chia chi phí đó cho 10.
 *
 * Không có dữ liệu học sinh trong payload: chỉ ĐỀ BÀI, CÁC Ý, LỜI GIẢI của
 * người soạn, và tên các nhánh trong cây. Cả ba đều là tài liệu do giáo viên
 * viết ra, không phải bài làm hay hồ sơ của học sinh — `AGENTS.md` mục 5 cấm
 * gửi profile, email, lớp hoặc định danh học sinh, và không có thứ nào ở đây.
 *
 * LỜI GIẢI được thêm 2026-09-10. Lý do đo được: 159 câu mà lớp luật chịu trên
 * đề bài thì quyết được khi đọc thêm lời giải — chữ quyết định ("cấp số cộng")
 * nhiều khi chỉ nằm ở đó, không nằm trong đề.
 */

import { CLASSIFY_SCHEMA, type TaxonomyTree } from './classify-ai.ts'
import { HUONG_DAN_DOC_DE } from './classify.ts'

export interface ClassifyPromptQuestion {
  id: string
  content: string
  /** Các Ý — chỉ có với `true_false`/`short_answer`, xem hợp đồng mục B2. */
  answers?: readonly string[]
  /** Lời giải của người soạn. Xem `classificationText` và hợp đồng mục B2. */
  solution?: string | null
}

export interface ClassifyPromptInput {
  questions: ClassifyPromptQuestion[]
  tree: TaxonomyTree
}

/** Cắt nội dung câu trong prompt: phân loại chỉ cần phần đầu để nhận dạng. */
const MAX_CONTENT_LENGTH = 600

/**
 * Trần riêng cho LỜI GIẢI.
 *
 * Lời giải là trường dài nhất trong ngân hàng — trung bình 522 ký tự nhưng p99
 * lên 3817 và dài nhất 8306. Không cắt thì một lô 10 câu nặng có thể nuốt hơn
 * 60 000 ký tự, và phần đuôi lời giải gần như chỉ là số học, không còn dấu hiệu
 * chủ đề nào. 800 ký tự phủ p90 (1444) tới quá nửa và giữ lô ở mức đoán được.
 */
const MAX_SOLUTION_LENGTH = 800

/** Trần cho phần Ý gộp lại. Chúng ngắn (p90 = 248 ký tự) nên hiếm khi chạm. */
const MAX_ANSWERS_LENGTH = 500

/**
 * Cây dạng thụt đầu dòng, kèm id.
 *
 * Dạng thụt gọn hơn JSON đáng kể trên cùng một nội dung, và model đọc quan hệ
 * cha–con từ thụt lề tốt hơn từ khoá lồng nhau. Id phải đi kèm vì đó là thứ
 * model bắt buộc phải trả về — mô tả cây chỉ bằng tên thì nó sẽ trả về tên, và
 * tên thì trùng nhau giữa các lớp.
 */
function renderTree(tree: TaxonomyTree): string {
  const lines: string[] = []

  for (const topic of tree.topics) {
    lines.push(`- topic ${topic.id} :: ${topic.name}`)

    for (const category of tree.categories.filter((item) => item.topic_id === topic.id)) {
      lines.push(`  - category ${category.id} :: ${category.name}`)

      for (const section of tree.sections.filter((item) => item.category_id === category.id)) {
        lines.push(`    - section ${section.id} :: ${section.name}`)

        for (const subsection of tree.subsections.filter((item) => item.section_id === section.id)) {
          lines.push(`      - subsection ${subsection.id} :: ${subsection.name}`)
        }
      }
    }
  }

  return lines.join('\n')
}

export function buildClassifyPrompt(input: ClassifyPromptInput): string {
  const questionBlock = input.questions
    .map((question, index) => {
      /* Nhãn rõ ràng cho từng phần. Model phải phân biệt được đâu là đề, đâu là
         Ý, đâu là lời giải — ba thứ có trọng lượng khác nhau khi chọn mạch, và
         gộp chúng thành một khối văn bản là vứt mất thông tin đó. */
      const lines = [
        `[${index + 1}] question_id=${question.id}`,
        `ĐỀ: ${question.content.slice(0, MAX_CONTENT_LENGTH).trim()}`,
      ]
      const answers = (question.answers ?? []).filter(Boolean).join(' | ')
      if (answers) lines.push(`CÁC Ý: ${answers.slice(0, MAX_ANSWERS_LENGTH).trim()}`)
      if (question.solution) {
        lines.push(`LỜI GIẢI: ${question.solution.slice(0, MAX_SOLUTION_LENGTH).trim()}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')

  return `Bạn là giáo viên Toán THPT Việt Nam đang xếp câu hỏi vào cây chuyên đề của một ngân hàng đề.

CÂY CHUYÊN ĐỀ — bạn CHỈ được chọn id có trong danh sách này:
${renderTree(input.tree)}

LUẬT BẮT BUỘC
1. Chỉ dùng id xuất hiện nguyên văn ở trên. TUYỆT ĐỐI không tự nghĩ ra id mới,
   không đoán id theo tên, không ghép id từ nhiều dòng.
2. Đường đi phải đúng quan hệ cha–con: category phải thuộc topic đã chọn,
   section phải thuộc category đã chọn, subsection phải thuộc section đã chọn.
   Sai quan hệ thì cả lô bị loại bỏ.
3. Không nhảy cóc tầng. Muốn có section thì phải có category trước.
4. Gợi ý NÔNG là hợp lệ và được khuyến khích khi bạn không chắc. Chỉ tới topic
   cũng được; để category/section/subsection là null. Đi sâu mà đoán bừa còn tệ
   hơn nhiều so với dừng ở tầng bạn thật sự chắc.
5. Không tìm được nhánh nào hợp thì để **topic_id = null** và cả ba tầng dưới
   cũng null. Đây là câu trả lời hợp lệ và hãy dùng nó thật — cây này không nhất
   thiết phủ hết mọi câu trong ngân hàng.

${HUONG_DAN_DOC_DE}

CÁC CÂU CẦN XẾP
${questionBlock}

ĐỊNH DẠNG TRẢ VỀ
Chỉ trả về đúng MỘT object JSON, không Markdown, không giải thích ngoài JSON.
Mỗi câu ở trên đúng MỘT mục, giữ nguyên question_id.

{
  "schema": "${CLASSIFY_SCHEMA}",
  "ket_qua": [
    {
      "question_id": "giữ nguyên từ đề bài",
      "ly_do": "một câu ngắn: dấu hiệu nào trong đề dẫn tới nhánh này",
      "topic_id": "id hoặc null",
      "category_id": "id hoặc null",
      "section_id": "id hoặc null",
      "subsection_id": "id hoặc null",
      "do_tin_cay": 0.0
    }
  ]
}

"ly_do" bắt buộc có khi topic_id khác null. "do_tin_cay" là số thực 0..1, phản
ánh mức chắc của tầng SÂU NHẤT bạn đã chọn.`
}
