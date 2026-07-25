// ==============================================
// Types cho Hệ Thống Lý Thuyết (Theories)
// ==============================================

/** Bài lý thuyết gắn vào Section */
export interface Theory {
  id: string
  section_id: string
  title: string
  slug: string
  description?: string | null
  content_md?: string | null
  difficulty_level: number
  order_index: number
  is_published: boolean
  created_at: string
  updated_at: string
}

/** Theory kèm thông tin section/category/topic */
export interface TheoryWithTaxonomy extends Theory {
  section_name?: string
  category_name?: string
  topic_name?: string
}

/** Loại khối tri thức (đồng bộ với tri-thuc.sty) */
export type BlockType =
  | 'dinh_nghia'
  | 'dinh_ly'
  | 'tinh_chat'
  | 'he_qua'
  | 'cong_thuc'
  | 'phuong_phap'
  | 'chu_y'
  | 'vi_du'
  | 'bai_tap'

/** Khối tri thức con của một Theory */
export interface KnowledgeBlock {
  id: string
  theory_id: string
  block_type: BlockType
  title?: string | null
  body_md?: string | null
  order_index: number
  external_id?: string | null
  cognitive_level?: 'NB' | 'TH' | 'VD' | 'VDC' | null
  created_at: string
  updated_at: string
}

/** Cạnh giữa các khối tri thức */
export interface KnowledgeBlockEdge {
  id: string
  from_block_id: string
  to_block_id: string
  relation_type: EdgeRelationType
  created_at: string
}

/** Loại quan hệ tiên quyết */
export type EdgeRelationType = 'prerequisite' | 'related' | 'extension'

/** Cạnh đồ thị tiên quyết giữa các theories */
export interface TheoryEdge {
  id: string
  from_theory_id: string
  to_theory_id: string
  relation_type: EdgeRelationType
  created_at: string
}

/** Cạnh kèm thông tin theory */
export interface TheoryEdgeWithDetails extends TheoryEdge {
  from_theory?: { id: string; title: string; section_id: string }
  to_theory?: { id: string; title: string; section_id: string }
}

/** Liên kết câu hỏi ↔ theory */
export interface QuestionTheory {
  question_id: string
  theory_id: string
  weight: number
}

/** Loại liên kết câu hỏi ↔ tri thức */
export type KnowledgeLinkType = 'primary' | 'supporting' | 'prerequisite'

/** Nguồn tạo liên kết */
export type KnowledgeLinkSource = 'manual' | 'taxonomy_rule' | 'import'

/** Liên kết chi tiết câu hỏi ↔ theory/knowledge block (Phase 1) */
export interface QuestionKnowledgeLink {
  id: string
  question_id: string
  theory_id: string
  knowledge_block_id?: string | null
  link_type: KnowledgeLinkType
  weight: number
  source: KnowledgeLinkSource
  confidence?: number | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

/** Báo cáo coverage số câu hỏi đã map cho theory */
export interface TheoryQuestionCoverage {
  theory_id: string
  theory_title: string
  section_id: string
  mapped_questions: number
  block_mapped_questions: number
}

/** Báo cáo coverage số câu hỏi đã map cho knowledge block */
export interface BlockQuestionCoverage {
  knowledge_block_id: string
  theory_id: string
  block_title?: string | null
  block_type: BlockType
  mapped_questions: number
}

/** Evidence nguyên tử dùng để tính mastery, idempotent theo student answer + target. */
export interface MasteryEvidence {
  id: string
  student_id: string
  attempt_id: string
  student_answer_id: string
  question_id: string
  theory_id: string
  knowledge_block_id?: string | null
  cognitive_level: 'NB' | 'TH' | 'VD' | 'VDC'
  is_correct: boolean
  earned_score: number
  max_score: number
  weight: number
  source_link_id?: string | null
  occurred_at: string
  created_at: string
  updated_at: string
}

/** Mastery của học sinh tại một knowledge block. */
export interface KnowledgeBlockMastery {
  id: string
  student_id: string
  knowledge_block_id: string
  mastery_score: number
  questions_attempted: number
  questions_correct: number
  evidence_count: number
  confidence_score: number
  last_activity_at?: string | null
  created_at: string
  updated_at: string
}

/** Mức độ thành thạo theo học sinh */
export interface TheoryMastery {
  id: string
  student_id: string
  theory_id: string
  mastery_score: number
  questions_attempted: number
  questions_correct: number
  last_attempt_at?: string | null
  streak: number
  created_at: string
  updated_at: string
}

/** Mastery kèm thông tin theory */
export interface TheoryMasteryWithDetails extends TheoryMastery {
  theory?: Theory
}

/** Template LaTeX */
export interface LatexTemplate {
  id: string
  name: string
  description?: string | null
  is_default: boolean
  template_text: string
  created_at: string
  updated_at: string
}

/** Dữ liệu tạo/sửa theory */
export interface TheoryFormData {
  section_id: string
  title: string
  slug: string
  description?: string
  content_md?: string
  difficulty_level?: number
  order_index?: number
  is_published?: boolean
}

/** Dữ liệu tạo/sửa LaTeX template */
export interface LatexTemplateFormData {
  name: string
  description?: string
  is_default?: boolean
  template_text: string
}

/** Taxonomy cho UI duyệt */
export interface TaxonomyItem {
  id: string
  name: string
  order_index: number
}

export interface TopicWithCategories extends TaxonomyItem {
  categories: CategoryWithSections[]
}

export interface CategoryWithSections extends TaxonomyItem {
  topic_id: string
  sections: SectionWithTheoryCount[]
}

export interface SectionWithTheoryCount extends TaxonomyItem {
  category_id: string
  topic_id: string
  theory_count: number
}
