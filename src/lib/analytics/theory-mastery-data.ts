'use client'

/**
 * Adapter tải dữ liệu năng lực theo bài học cho `/learn`.
 *
 * Tách khỏi `knowledge-mastery.ts` một cách có chủ đích: file kia là hàm thuần
 * và test được không cần mạng; file này chỉ làm truy vấn rồi đưa dữ liệu sang.
 *
 * Nguồn bằng chứng: CHỈ homework do giáo viên giao (quyết định ở
 * docs/STUDENT_SKILL_TREE_REDESIGN.md mục 1). Không tự sinh bài luyện.
 */

import { createClient } from '@/lib/supabase/client'
import {
  aggregateMastery,
  rollUpByTheory,
  type MasteryAnswer,
  type MasteryLink,
  type MasteryStat,
} from '@/lib/analytics/knowledge-mastery'

export interface TheoryAssignmentInfo {
  id: string
  homeworkId: string
  title: string | null
  homeworkTitle: string
  deadline: string | null
  /** Học sinh đã mở bài này chưa. */
  started: boolean
}

export interface TheoryProgress {
  /** Số câu đã trả lời thuộc các bài tập nhắm tới bài học này. */
  answered: number
  /** Tổng số câu của các bài tập nhắm tới bài học này. */
  total: number
  /** Số câu đã trả lời nhưng chưa biết đúng/sai (giáo viên chưa mở đáp án). */
  pending: number
  assignmentCount: number
}

export interface TheoryMasteryData {
  /** Năng lực đã quy đổi, theo theory id. Chỉ có key khi có bằng chứng đã chấm. */
  masteryByTheory: Map<string, MasteryStat>
  /** Thống kê chi tiết tới từng khối tri thức, dùng cho panel bên phải. */
  blockStats: MasteryStat[]
  /** Tiến độ làm bài, tách biệt khỏi năng lực. */
  progressByTheory: Map<string, TheoryProgress>
  assignmentsByTheory: Map<string, TheoryAssignmentInfo[]>
}

interface AnswerMetadataRow {
  attempt_id: string
  question_id: string
  is_correct: boolean | null
  answered_at: string | null
}

interface QuestionMetadataRow {
  homework_id: string
  question_id: string
}

interface TargetRow {
  homework_id: string
  theory_id: string
  knowledge_block_id: string | null
  weight: number | null
}

interface LinkRow {
  question_id: string
  theory_id: string | null
  knowledge_block_id: string | null
  weight: number | null
}

/** Trả về bản mới mỗi lần: caller giữ các Map này trong React state. */
function emptyData(): TheoryMasteryData {
  return {
    masteryByTheory: new Map(),
    blockStats: [],
    progressByTheory: new Map(),
    assignmentsByTheory: new Map(),
  }
}

export async function loadTheoryMastery(userId: string): Promise<TheoryMasteryData> {
  const supabase = createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('class_id')
    .eq('id', userId)
    .maybeSingle()

  const recipientFilter = profile?.class_id
    ? `student_id.eq.${userId},class_id.eq.${profile.class_id}`
    : `student_id.eq.${userId}`

  const { data: recipients } = await supabase
    .from('homework_assignment_recipients')
    .select('assignment_id')
    .or(recipientFilter)

  const assignmentIds = [...new Set((recipients || []).map((row) => row.assignment_id))]
  if (!assignmentIds.length) return emptyData()

  const { data: assignmentRows } = await supabase
    .from('homework_assignments')
    .select('id, homework_id, title, deadline, homeworks!inner(title, is_published)')
    .in('id', assignmentIds)
    .eq('status', 'published')
    .eq('homeworks.is_published', true)

  const active = assignmentRows || []
  if (!active.length) return emptyData()

  const homeworkIds = [...new Set(active.map((row) => row.homework_id))]

  const [targetsRes, questionsRes, attemptsRes] = await Promise.all([
    supabase
      .from('homework_knowledge_targets')
      .select('homework_id, theory_id, knowledge_block_id, weight')
      .in('homework_id', homeworkIds),
    supabase.rpc('get_my_homework_question_metadata'),
    supabase
      .from('homework_attempts')
      .select('id, assignment_id')
      .eq('student_id', userId)
      .in('assignment_id', assignmentIds),
  ])

  const targets = (targetsRes.data || []) as TargetRow[]
  const questionRows = ((questionsRes.data || []) as QuestionMetadataRow[]).filter((row) =>
    homeworkIds.includes(row.homework_id)
  )
  const attempts = (attemptsRes.data || []) as Array<{ id: string; assignment_id: string }>

  const attemptIds = new Set(attempts.map((row) => row.id))
  let answers: AnswerMetadataRow[] = []
  if (attempts.length) {
    const { data } = await supabase.rpc('get_my_homework_answer_metadata')
    answers = ((data || []) as AnswerMetadataRow[]).filter((row) => attemptIds.has(row.attempt_id))
  }

  // Liên kết trực tiếp câu hỏi → kiến thức. Đây là nguồn quy gán chính xác nhất.
  const answeredQuestionIds = [...new Set(answers.map((row) => row.question_id))]
  let links: LinkRow[] = []
  if (answeredQuestionIds.length) {
    const { data } = await supabase
      .from('question_knowledge_links')
      .select('question_id, theory_id, knowledge_block_id, weight')
      .in('question_id', answeredQuestionIds)
    links = (data || []) as LinkRow[]
  }

  const questionsByHomework = new Map<string, Set<string>>()
  for (const row of questionRows) {
    const set = questionsByHomework.get(row.homework_id) || new Set<string>()
    set.add(row.question_id)
    questionsByHomework.set(row.homework_id, set)
  }

  const targetsByHomework = new Map<string, MasteryLink[]>()
  const theoriesByHomework = new Map<string, Set<string>>()
  for (const target of targets) {
    targetsByHomework.set(target.homework_id, [
      ...(targetsByHomework.get(target.homework_id) || []),
      { theoryId: target.theory_id, blockId: target.knowledge_block_id, weight: target.weight },
    ])
    const set = theoriesByHomework.get(target.homework_id) || new Set<string>()
    set.add(target.theory_id)
    theoriesByHomework.set(target.homework_id, set)
  }

  const linksByQuestion = new Map<string, MasteryLink[]>()
  for (const link of links) {
    if (!link.theory_id && !link.knowledge_block_id) continue
    linksByQuestion.set(link.question_id, [
      ...(linksByQuestion.get(link.question_id) || []),
      { theoryId: link.theory_id, blockId: link.knowledge_block_id, weight: link.weight },
    ])
  }

  const homeworkByAttempt = new Map<string, string>()
  const attemptByAssignment = new Map(attempts.map((row) => [row.assignment_id, row.id]))
  for (const assignment of active) {
    const attemptId = attemptByAssignment.get(assignment.id)
    if (attemptId) homeworkByAttempt.set(attemptId, assignment.homework_id)
  }

  // Quy gán bằng chứng.
  //
  // `is_correct === null` nghĩa là giáo viên chưa cho xem đáp án — CHƯA BIẾT
  // đúng hay sai. Coi nó là sai sẽ đẩy học sinh xuống "Cần củng cố" oan, nên
  // các câu này bị loại khỏi bằng chứng và chỉ được đếm vào `pending`.
  const masteryAnswers: MasteryAnswer[] = []
  const pendingByTheory = new Map<string, number>()

  for (const answer of answers) {
    const homeworkId = homeworkByAttempt.get(answer.attempt_id) || ''
    const direct = linksByQuestion.get(answer.question_id) || []
    const answerLinks = direct.length ? direct : targetsByHomework.get(homeworkId) || []
    if (!answerLinks.length) continue

    if (answer.is_correct === null) {
      for (const link of answerLinks) {
        if (!link.theoryId) continue
        pendingByTheory.set(link.theoryId, (pendingByTheory.get(link.theoryId) || 0) + 1)
      }
      continue
    }

    masteryAnswers.push({
      questionId: answer.question_id,
      isCorrect: answer.is_correct === true,
      answeredAt: answer.answered_at,
      links: answerLinks,
    })
  }

  const stats = aggregateMastery(masteryAnswers)
  const masteryByTheory = rollUpByTheory(stats)
  const blockStats = stats.filter((stat) => stat.blockId)

  // Tiến độ làm bài: đếm theo từng bài tập, không cộng nguyên cho mọi bài học.
  const answeredByAttempt = new Map<string, Set<string>>()
  for (const answer of answers) {
    const set = answeredByAttempt.get(answer.attempt_id) || new Set<string>()
    set.add(answer.question_id)
    answeredByAttempt.set(answer.attempt_id, set)
  }

  const progressByTheory = new Map<string, TheoryProgress>()
  const assignmentsByTheory = new Map<string, TheoryAssignmentInfo[]>()

  for (const assignment of active) {
    const theoryIds = theoriesByHomework.get(assignment.homework_id) || new Set<string>()
    const questionIds = questionsByHomework.get(assignment.homework_id) || new Set<string>()
    const attemptId = attemptByAssignment.get(assignment.id)
    const answeredIds = attemptId ? answeredByAttempt.get(attemptId) || new Set<string>() : new Set<string>()
    const answeredCount = [...questionIds].filter((id) => answeredIds.has(id)).length
    const homework = assignment.homeworks as unknown as { title: string }

    for (const theoryId of theoryIds) {
      const current = progressByTheory.get(theoryId) || { answered: 0, total: 0, pending: 0, assignmentCount: 0 }
      progressByTheory.set(theoryId, {
        answered: current.answered + answeredCount,
        total: current.total + questionIds.size,
        pending: current.pending,
        assignmentCount: current.assignmentCount + 1,
      })
      assignmentsByTheory.set(theoryId, [
        ...(assignmentsByTheory.get(theoryId) || []),
        {
          id: assignment.id,
          homeworkId: assignment.homework_id,
          title: assignment.title,
          homeworkTitle: homework?.title || 'Bài tập',
          deadline: assignment.deadline,
          started: Boolean(attemptId),
        },
      ])
    }
  }

  for (const [theoryId, pending] of pendingByTheory) {
    const current = progressByTheory.get(theoryId)
    if (current) progressByTheory.set(theoryId, { ...current, pending })
  }

  return { masteryByTheory, blockStats, progressByTheory, assignmentsByTheory }
}
