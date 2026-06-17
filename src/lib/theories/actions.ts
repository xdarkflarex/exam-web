'use client'

import { createClient } from '@/lib/supabase/client'
import type {
  Theory,
  TheoryFormData,
  TheoryEdge,
  EdgeRelationType,
  QuestionTheory,
  TheoryMastery,
  LatexTemplate,
  LatexTemplateFormData,
  KnowledgeBlock,
  KnowledgeBlockEdge,
  BlockType,
} from '@/types/theories'
import { resolveCognitiveLevel, CognitiveLevel } from './cognitive'

// ==============================================
// THEORIES CRUD
// ==============================================

/** Lấy danh sách theories theo section */
export async function getTheoriesBySection(sectionId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .select('*')
    .eq('section_id', sectionId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as Theory[]
}

/** Lấy danh sách theories đã publish theo section */
export async function getPublishedTheoriesBySection(sectionId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .select('*')
    .eq('section_id', sectionId)
    .eq('is_published', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as Theory[]
}

/** Lấy theory theo ID kèm thông tin đầy đủ */
export async function getTheoryById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .select(`
      *,
      sections!inner(
        id, name,
        categories!inner(
          id, name,
          topics!inner(id, name)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** Tạo theory mới */
export async function createTheory(formData: TheoryFormData) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .insert(formData)
    .select()
    .single()

  if (error) throw error
  return data as Theory
}

/** Cập nhật theory */
export async function updateTheory(id: string, formData: Partial<TheoryFormData>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Theory
}

/** Xóa theory */
export async function deleteTheory(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('theories')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/** Đếm tổng theories */
export async function countTheories() {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('theories')
    .select('*', { count: 'exact', head: true })

  if (error) throw error
  return count || 0
}

/** Đếm theories published */
export async function countPublishedTheories() {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('theories')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true)

  if (error) throw error
  return count || 0
}

// ==============================================
// THEORY EDGES (Đồ thị tiên quyết)
// ==============================================

/** Lấy danh sách edges của theory */
export async function getTheoryEdges(theoryId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theory_edges')
    .select(`
      *,
      from_theory:theories!theory_edges_from_theory_id_fkey(id, title, section_id),
      to_theory:theories!theory_edges_to_theory_id_fkey(id, title, section_id)
    `)
    .or(`from_theory_id.eq.${theoryId},to_theory_id.eq.${theoryId}`)

  if (error) throw error
  return data
}

/** Tạo edge mới */
export async function createTheoryEdge(
  fromTheoryId: string,
  toTheoryId: string,
  relationType: EdgeRelationType
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theory_edges')
    .insert({
      from_theory_id: fromTheoryId,
      to_theory_id: toTheoryId,
      relation_type: relationType,
    })
    .select()
    .single()

  if (error) throw error
  return data as TheoryEdge
}

/** Xóa edge */
export async function deleteTheoryEdge(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('theory_edges')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ==============================================
// KNOWLEDGE BLOCKS (Khối tri thức có kiểu)
// ==============================================

/** Lấy danh sách khối tri thức của một theory */
export async function getKnowledgeBlocks(theoryId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('knowledge_blocks')
    .select('*')
    .eq('theory_id', theoryId)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as KnowledgeBlock[]
}

/** Tạo một khối tri thức */
export async function createKnowledgeBlock(block: {
  theory_id: string
  block_type: BlockType
  title?: string | null
  body_md?: string | null
  order_index?: number
  external_id?: string | null
  cognitive_level?: CognitiveLevel | null
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('knowledge_blocks')
    .insert(block)
    .select()
    .single()

  if (error) throw error
  return data as KnowledgeBlock
}

/** Cập nhật khối tri thức (bao gồm cognitive_level). */
export async function updateKnowledgeBlock(
  id: string,
  patch: Partial<{
    block_type: BlockType
    title: string | null
    body_md: string | null
    order_index: number
    cognitive_level: CognitiveLevel | null
  }>
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('knowledge_blocks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as KnowledgeBlock
}

/** Tạo cạnh giữa hai khối tri thức */
export async function createKnowledgeBlockEdge(
  fromBlockId: string,
  toBlockId: string,
  relationType: EdgeRelationType
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('knowledge_block_edges')
    .upsert(
      {
        from_block_id: fromBlockId,
        to_block_id: toBlockId,
        relation_type: relationType,
      },
      { onConflict: 'from_block_id,to_block_id,relation_type' }
    )
    .select()
    .single()

  if (error) throw error
  return data as KnowledgeBlockEdge
}

/** Lấy toàn bộ khối + cạnh của một theory (cho mindmap) */
export async function getKnowledgeGraphForTheory(theoryId: string) {
  const supabase = createClient()
  const { data: blocks, error: bErr } = await supabase
    .from('knowledge_blocks')
    .select('*')
    .eq('theory_id', theoryId)
    .order('order_index', { ascending: true })
  if (bErr) throw bErr

  const blockIds = (blocks || []).map((b) => b.id)
  let edges: KnowledgeBlockEdge[] = []
  if (blockIds.length > 0) {
    const { data: edgeData, error: eErr } = await supabase
      .from('knowledge_block_edges')
      .select('*')
      .or(
        `from_block_id.in.(${blockIds.join(',')}),to_block_id.in.(${blockIds.join(',')})`
      )
    if (eErr) throw eErr
    edges = (edgeData || []) as KnowledgeBlockEdge[]
  }

  return { blocks: (blocks || []) as KnowledgeBlock[], edges }
}

// ==============================================
// QUESTION_THEORIES (Liên kết câu hỏi ↔ theory)
// ==============================================

/** Lấy danh sách theories liên kết với câu hỏi */
export async function getQuestionTheories(questionId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('question_theories')
    .select(`
      *,
      theory:theories(id, title, section_id)
    `)
    .eq('question_id', questionId)

  if (error) throw error
  return data
}

/** Liên kết câu hỏi với theory */
export async function mapQuestionToTheory(
  questionId: string,
  theoryId: string,
  weight: number = 1.0
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('question_theories')
    .upsert({
      question_id: questionId,
      theory_id: theoryId,
      weight,
    })
    .select()
    .single()

  if (error) throw error
  return data as QuestionTheory
}

/** Bỏ liên kết câu hỏi với theory */
export async function unmapQuestionFromTheory(questionId: string, theoryId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('question_theories')
    .delete()
    .eq('question_id', questionId)
    .eq('theory_id', theoryId)

  if (error) throw error
}

// ==============================================
// THEORY MASTERY (Thành thạo)
// ==============================================

/** Lấy mastery của học sinh cho theory */
export async function getStudentMastery(studentId: string, theoryId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theory_mastery')
    .select('*')
    .eq('student_id', studentId)
    .eq('theory_id', theoryId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data as TheoryMastery | null
}

/** Lấy top N theories yếu nhất của học sinh */
export async function getWeakTheories(studentId: string, limit: number = 3) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theory_mastery')
    .select(`
      *,
      theory:theories(id, title, section_id, difficulty_level)
    `)
    .eq('student_id', studentId)
    .gt('questions_attempted', 0)
    .order('mastery_score', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data
}

/** Cập nhật mastery sau khi nộp bài */
export async function updateMasteryAfterAttempt(
  studentId: string,
  theoryId: string,
  isCorrect: boolean
) {
  const supabase = createClient()

  // Lấy mastery hiện tại
  const { data: existing } = await supabase
    .from('theory_mastery')
    .select('*')
    .eq('student_id', studentId)
    .eq('theory_id', theoryId)
    .single()

  if (existing) {
    // Cập nhật
    const newAttempted = existing.questions_attempted + 1
    const newCorrect = existing.questions_correct + (isCorrect ? 1 : 0)
    const newScore = (newCorrect / newAttempted) * 100
    const newStreak = isCorrect ? existing.streak + 1 : 0

    const { error } = await supabase
      .from('theory_mastery')
      .update({
        questions_attempted: newAttempted,
        questions_correct: newCorrect,
        mastery_score: Math.round(newScore * 100) / 100,
        streak: newStreak,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) throw error
  } else {
    // Tạo mới
    const { error } = await supabase
      .from('theory_mastery')
      .insert({
        student_id: studentId,
        theory_id: theoryId,
        questions_attempted: 1,
        questions_correct: isCorrect ? 1 : 0,
        mastery_score: isCorrect ? 100 : 0,
        streak: isCorrect ? 1 : 0,
        last_attempt_at: new Date().toISOString(),
      })

    if (error) throw error
  }
}

/** Cập nhật mastery cho toàn bộ câu hỏi trong attempt */
export async function updateMasteryForAttempt(attemptId: string) {
  const supabase = createClient()

  // Lấy thông tin attempt
  const { data: attempt, error: attemptErr } = await supabase
    .from('exam_attempts')
    .select('student_id')
    .eq('id', attemptId)
    .single()

  if (attemptErr || !attempt) return

  // Lấy tất cả student_answers cho attempt này
  const { data: answers, error: answersErr } = await supabase
    .from('student_answers')
    .select('question_id, is_correct')
    .eq('attempt_id', attemptId)

  if (answersErr || !answers) return

  // Với mỗi câu trả lời, tìm theories liên kết và cập nhật mastery
  for (const answer of answers) {
    const { data: questionTheories } = await supabase
      .from('question_theories')
      .select('theory_id')
      .eq('question_id', answer.question_id)

    if (questionTheories) {
      for (const qt of questionTheories) {
        await updateMasteryAfterAttempt(
          attempt.student_id,
          qt.theory_id,
          answer.is_correct
        )
      }
    }
  }
}

// ==============================================
// THEORY MASTERY BY COGNITIVE LEVEL (Phần 5)
// ==============================================

/** Cập nhật mastery theo mức nhận thức cho 1 (HS × theory × level). */
export async function updateMasteryByLevelAfterAttempt(
  studentId: string,
  theoryId: string,
  level: CognitiveLevel,
  isCorrect: boolean
) {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('theory_mastery_by_level')
    .select('*')
    .eq('student_id', studentId)
    .eq('theory_id', theoryId)
    .eq('cognitive_level', level)
    .maybeSingle()

  if (existing) {
    const newAttempted = existing.questions_attempted + 1
    const newCorrect = existing.questions_correct + (isCorrect ? 1 : 0)
    const newScore = (newCorrect / newAttempted) * 100
    const { error } = await supabase
      .from('theory_mastery_by_level')
      .update({
        questions_attempted: newAttempted,
        questions_correct: newCorrect,
        mastery_score: Math.round(newScore * 100) / 100,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('theory_mastery_by_level')
      .insert({
        student_id: studentId,
        theory_id: theoryId,
        cognitive_level: level,
        questions_attempted: 1,
        questions_correct: isCorrect ? 1 : 0,
        mastery_score: isCorrect ? 100 : 0,
        last_attempt_at: new Date().toISOString(),
      })
    if (error) throw error
  }
}

/**
 * Cập nhật TOÀN BỘ mastery (tổng + theo mức) cho một attempt.
 * Gọi sau khi nộp bài. Không throw ra ngoài để không chặn flow nộp bài.
 */
export async function updateAllMasteryForAttempt(attemptId: string) {
  const supabase = createClient()
  try {
    const { data: attempt } = await supabase
      .from('exam_attempts')
      .select('student_id')
      .eq('id', attemptId)
      .single()
    if (!attempt) return

    const { data: answers } = await supabase
      .from('student_answers')
      .select('question_id, is_correct')
      .eq('attempt_id', attemptId)
    if (!answers || answers.length === 0) return

    const questionIds = [...new Set(answers.map(a => a.question_id))]

    // Lấy cognitive_level + difficulty của các câu hỏi
    const { data: questions } = await supabase
      .from('questions')
      .select('id, cognitive_level, difficulty')
      .in('id', questionIds)
    const qMap = new Map((questions || []).map(q => [q.id, q]))

    // Lấy liên kết câu hỏi ↔ theory
    const { data: qThList } = await supabase
      .from('question_theories')
      .select('question_id, theory_id')
      .in('question_id', questionIds)

    const theoriesByQuestion = new Map<string, string[]>()
    for (const qt of qThList || []) {
      const arr = theoriesByQuestion.get(qt.question_id) || []
      arr.push(qt.theory_id)
      theoriesByQuestion.set(qt.question_id, arr)
    }

    for (const answer of answers) {
      const theoryIds = theoriesByQuestion.get(answer.question_id) || []
      if (theoryIds.length === 0) continue
      const q = qMap.get(answer.question_id)
      const level = resolveCognitiveLevel(q?.cognitive_level, q?.difficulty)
      for (const theoryId of theoryIds) {
        await updateMasteryAfterAttempt(attempt.student_id, theoryId, answer.is_correct)
        await updateMasteryByLevelAfterAttempt(attempt.student_id, theoryId, level, answer.is_correct)
      }
    }
  } catch (err) {
    // Lỗi mastery không được chặn việc nộp bài
    console.error('updateAllMasteryForAttempt error:', err)
  }
}

/** Lấy mastery theo mức của 1 HS (toàn bộ hoặc theo theory). */
export async function getMasteryByLevel(studentId: string, theoryId?: string) {
  const supabase = createClient()
  let query = supabase
    .from('theory_mastery_by_level')
    .select('*')
    .eq('student_id', studentId)
  if (theoryId) query = query.eq('theory_id', theoryId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ==============================================
// LATEX TEMPLATES CRUD
// ==============================================

/** Lấy tất cả templates */
export async function getLatexTemplates() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('latex_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as LatexTemplate[]
}

/** Lấy template mặc định */
export async function getDefaultTemplate() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('latex_templates')
    .select('*')
    .eq('is_default', true)
    .single()

  if (error) throw error
  return data as LatexTemplate
}

/** Tạo template mới */
export async function createLatexTemplate(formData: LatexTemplateFormData) {
  const supabase = createClient()

  // Nếu đặt mặc định, bỏ mặc định các template khác
  if (formData.is_default) {
    await supabase
      .from('latex_templates')
      .update({ is_default: false })
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('latex_templates')
    .insert(formData)
    .select()
    .single()

  if (error) throw error
  return data as LatexTemplate
}

/** Cập nhật template */
export async function updateLatexTemplate(id: string, formData: Partial<LatexTemplateFormData>) {
  const supabase = createClient()

  // Nếu đặt mặc định, bỏ mặc định các template khác
  if (formData.is_default) {
    await supabase
      .from('latex_templates')
      .update({ is_default: false })
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('latex_templates')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as LatexTemplate
}

/** Xóa template */
export async function deleteLatexTemplate(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('latex_templates')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ==============================================
// TAXONOMY HELPERS (Dùng cho UI duyệt)
// ==============================================

/** Lấy toàn bộ taxonomy tree */
export async function getTaxonomyTree() {
  const supabase = createClient()

  const [topicsRes, categoriesRes, sectionsRes] = await Promise.all([
    supabase.from('topics').select('id, name, order_index').order('order_index'),
    supabase.from('categories').select('id, name, topic_id, order_index').order('order_index'),
    supabase.from('sections').select('id, name, category_id, topic_id, order_index').order('order_index'),
  ])

  if (topicsRes.error) throw topicsRes.error
  if (categoriesRes.error) throw categoriesRes.error
  if (sectionsRes.error) throw sectionsRes.error

  const topics = topicsRes.data || []
  const categories = categoriesRes.data || []
  const sections = sectionsRes.data || []

  return { topics, categories, sections }
}

/** Tìm kiếm theories */
export async function searchTheories(query: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('theories')
    .select('id, title, section_id, is_published, difficulty_level')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('title')
    .limit(20)

  if (error) throw error
  return data as Theory[]
}
