'use client'

import { createClient } from '@/lib/supabase/client'
import { getStudentHomeworkAssignments } from '@/lib/homework/actions'

export type CapabilityStatus =
  | 'no_data'
  | 'needs_work'
  | 'building'
  | 'stable'
  | 'mastered'

export interface CapabilityStat {
  id: string
  label: string
  correct: number
  total: number
  accuracy: number
  status: CapabilityStatus
  lastActivityAt: string | null
}

export interface HomeworkCapabilityItem {
  assignmentId: string
  homeworkId: string
  title: string
  deadline: string | null
  status: string | null
  answered: number
  total: number
  correct: number
  completionRate: number
  accuracy: number
  overdue: boolean
}

export interface StudentCapabilitySummary {
  student: {
    id: string
    name: string
    classId: string | null
    accessTier: string
    canViewAdvancedAnalytics: boolean
  }
  totals: {
    assigned: number
    submitted: number
    pending: number
    overdue: number
    answered: number
    totalQuestions: number
    correct: number
    completionRate: number
    accuracy: number
  }
  homeworks: HomeworkCapabilityItem[]
  levelStats: CapabilityStat[]
  knowledgeStats: CapabilityStat[]
  recommendedAction: {
    label: string
    detail: string
    href: string
    tone: 'teal' | 'amber' | 'rose' | 'slate'
  }
}

interface HomeworkAssignmentRow {
  id: string
  homework_id: string
  title: string | null
  deadline: string | null
  homeworks?: unknown
}

interface HomeworkAttemptRow {
  id: string
  assignment_id: string
  status: string | null
  answered_questions: number | null
  total_questions: number | null
  correct_answers: number | null
  submitted_at: string | null
  started_at?: string | null
}

interface HomeworkAnswerRow {
  attempt_id: string
  question_id: string
  is_correct: boolean | null
  answered_at: string | null
  questions?: unknown
}

interface QuestionLinkRow {
  question_id: string
  theory_id: string | null
  knowledge_block_id: string | null
}

const LEVEL_LABELS: Record<string, string> = {
  NB: 'Nhận biết',
  TH: 'Thông hiểu',
  VD: 'Vận dụng',
  VDC: 'Vận dụng cao',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function relationObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null
  return isRecord(value) ? value : null
}

function readTitle(value: unknown, fallback: string): string {
  const record = relationObject(value)
  return typeof record?.title === 'string' ? record.title : fallback
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export function getCapabilityStatus(correct: number, total: number): CapabilityStatus {
  if (total === 0) return 'no_data'
  const score = correct / total
  if (total >= 5 && score < 0.5) return 'needs_work'
  if (score < 0.8) return 'building'
  if (total < 8) return 'stable'
  return 'mastered'
}

export function getCapabilityStatusLabel(status: CapabilityStatus): string {
  switch (status) {
    case 'needs_work':
      return 'Cần củng cố'
    case 'building':
      return 'Đang tiến bộ'
    case 'stable':
      return 'Ổn định'
    case 'mastered':
      return 'Thành thạo'
    default:
      return 'Chưa có dữ liệu'
  }
}

export function canViewAdvancedAnalytics(accessTier: string | null | undefined): boolean {
  return accessTier === 'full'
}

function aggregateStat(
  map: Map<string, { label: string; correct: number; total: number; lastActivityAt: string | null }>,
  id: string,
  label: string,
  isCorrect: boolean,
  answeredAt: string | null
) {
  const current = map.get(id) || { label, correct: 0, total: 0, lastActivityAt: null }
  current.total += 1
  if (isCorrect) current.correct += 1
  if (answeredAt && (!current.lastActivityAt || answeredAt > current.lastActivityAt)) {
    current.lastActivityAt = answeredAt
  }
  map.set(id, current)
}

function toCapabilityStats(
  map: Map<string, { label: string; correct: number; total: number; lastActivityAt: string | null }>
): CapabilityStat[] {
  return Array.from(map.entries())
    .map(([id, item]) => ({
      id,
      label: item.label,
      correct: item.correct,
      total: item.total,
      accuracy: percent(item.correct, item.total),
      status: getCapabilityStatus(item.correct, item.total),
      lastActivityAt: item.lastActivityAt,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
}

export async function getStudentCapabilitySummary(studentId: string): Promise<StudentCapabilitySummary> {
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, class_id, access_tier')
    .eq('id', studentId)
    .maybeSingle()

  const classId = profile?.class_id || null
  const accessTier = profile?.access_tier || 'basic'
  const assignments = (await getStudentHomeworkAssignments(studentId, classId)) as HomeworkAssignmentRow[]
  const assignmentIds = assignments.map((row) => row.id)
  const homeworkIds = [...new Set(assignments.map((row) => row.homework_id))]

  const [questionsRes, attemptsRes, targetsRes] = await Promise.all([
    homeworkIds.length
      ? supabase.rpc('get_my_homework_question_metadata')
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase
          .from('homework_attempts')
          .select('id, assignment_id, status, answered_questions, total_questions, correct_answers, submitted_at, started_at')
          .eq('student_id', studentId)
          .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] }),
    homeworkIds.length
      ? supabase
          .from('homework_knowledge_targets')
          .select('homework_id, theory_id, knowledge_block_id')
          .in('homework_id', homeworkIds)
      : Promise.resolve({ data: [] }),
  ])

  const questionRows = (questionsRes.data || []) as Array<{
    homework_id: string
    question_id: string
    cognitive_level: string | null
  }>
  const attempts = (attemptsRes.data || []) as HomeworkAttemptRow[]
  const targets = (targetsRes.data || []) as Array<{
    homework_id: string
    theory_id: string
    knowledge_block_id: string | null
  }>

  const homeworkQuestions = new Map<string, Set<string>>()
  const questionLevel = new Map<string, string>()
  for (const row of questionRows.filter((item) => homeworkIds.includes(item.homework_id))) {
    const set = homeworkQuestions.get(row.homework_id) || new Set<string>()
    set.add(row.question_id)
    homeworkQuestions.set(row.homework_id, set)
    questionLevel.set(row.question_id, row.cognitive_level || 'NB')
  }

  const attemptByAssignment = new Map(attempts.map((row) => [row.assignment_id, row]))
  let answers: HomeworkAnswerRow[] = []
  if (attempts.length) {
    const attemptIds = new Set(attempts.map((row) => row.id))
    const { data } = await supabase.rpc('get_my_homework_answer_metadata')
    answers = ((data || []) as HomeworkAnswerRow[])
      .filter((row) => attemptIds.has(row.attempt_id))
  }

  const answerByAttempt = new Map<string, HomeworkAnswerRow[]>()
  for (const answer of answers) {
    answerByAttempt.set(answer.attempt_id, [...(answerByAttempt.get(answer.attempt_id) || []), answer])
  }

  const questionIds = [...new Set(answers.map((row) => row.question_id))]
  let questionLinks: QuestionLinkRow[] = []
  if (questionIds.length) {
    const { data } = await supabase
      .from('question_knowledge_links')
      .select('question_id, theory_id, knowledge_block_id')
      .in('question_id', questionIds)
    questionLinks = (data || []) as QuestionLinkRow[]
  }

  const theoryIds = [
    ...new Set([
      ...targets.map((row) => row.theory_id).filter(Boolean),
      ...questionLinks.map((row) => row.theory_id).filter(Boolean),
    ]),
  ]
  const blockIds = [
    ...new Set([
      ...targets.map((row) => row.knowledge_block_id).filter(Boolean),
      ...questionLinks.map((row) => row.knowledge_block_id).filter(Boolean),
    ]),
  ]

  const [theoryRes, blockRes] = await Promise.all([
    theoryIds.length ? supabase.from('theories').select('id, title').in('id', theoryIds) : Promise.resolve({ data: [] }),
    blockIds.length ? supabase.from('knowledge_blocks').select('id, title').in('id', blockIds) : Promise.resolve({ data: [] }),
  ])
  const theoryTitle = new Map(((theoryRes.data || []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]))
  const blockTitle = new Map(((blockRes.data || []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]))

  const linksByQuestion = new Map<string, QuestionLinkRow[]>()
  for (const link of questionLinks) {
    linksByQuestion.set(link.question_id, [...(linksByQuestion.get(link.question_id) || []), link])
  }
  const targetsByHomework = new Map<string, QuestionLinkRow[]>()
  for (const target of targets) {
    targetsByHomework.set(target.homework_id, [
      ...(targetsByHomework.get(target.homework_id) || []),
      {
        question_id: '',
        theory_id: target.theory_id,
        knowledge_block_id: target.knowledge_block_id,
      },
    ])
  }

  const homeworkByAttempt = new Map<string, string>()
  for (const assignment of assignments) {
    const attempt = attemptByAssignment.get(assignment.id)
    if (attempt) homeworkByAttempt.set(attempt.id, assignment.homework_id)
  }

  const levelMap = new Map<string, { label: string; correct: number; total: number; lastActivityAt: string | null }>()
  const knowledgeMap = new Map<string, { label: string; correct: number; total: number; lastActivityAt: string | null }>()
  for (const answer of answers) {
    const isCorrect = answer.is_correct === true
    const level = questionLevel.get(answer.question_id) || 'OTHER'
    aggregateStat(levelMap, level, LEVEL_LABELS[level] || level, isCorrect, answer.answered_at)

    const directLinks = linksByQuestion.get(answer.question_id) || []
    const fallbackLinks = targetsByHomework.get(homeworkByAttempt.get(answer.attempt_id) || '') || []
    const links = directLinks.length ? directLinks : fallbackLinks
    for (const link of links) {
      const id = link.knowledge_block_id
        ? `block:${link.knowledge_block_id}`
        : link.theory_id
          ? `theory:${link.theory_id}`
          : ''
      if (!id) continue
      const label = link.knowledge_block_id
        ? blockTitle.get(link.knowledge_block_id) || 'Khối kiến thức'
        : theoryTitle.get(link.theory_id || '') || 'Kiến thức'
      aggregateStat(knowledgeMap, id, label, isCorrect, answer.answered_at)
    }
  }

  const now = Date.now()
  const homeworks: HomeworkCapabilityItem[] = assignments.map((assignment) => {
    const attempt = attemptByAssignment.get(assignment.id)
    const answerRows = attempt ? answerByAttempt.get(attempt.id) || [] : []
    const answered = attempt?.answered_questions ?? answerRows.length
    const correct = attempt?.correct_answers ?? answerRows.filter((row) => row.is_correct === true).length
    const total = homeworkQuestions.get(assignment.homework_id)?.size || attempt?.total_questions || 0
    const homework = readTitle(assignment.homeworks, 'Bài tập')
    const done = attempt?.status === 'submitted' || attempt?.status === 'graded'
    return {
      assignmentId: assignment.id,
      homeworkId: assignment.homework_id,
      title: assignment.title || homework,
      deadline: assignment.deadline,
      status: attempt?.status || null,
      answered,
      total,
      correct,
      completionRate: percent(answered, total),
      accuracy: percent(correct, answered),
      overdue: Boolean(assignment.deadline && new Date(assignment.deadline).getTime() < now && !done),
    }
  })

  const submitted = homeworks.filter((row) => row.status === 'submitted' || row.status === 'graded').length
  const pending = homeworks.length - submitted
  const answered = homeworks.reduce((sum, row) => sum + row.answered, 0)
  const totalQuestions = homeworks.reduce((sum, row) => sum + row.total, 0)
  const correct = homeworks.reduce((sum, row) => sum + row.correct, 0)
  const overdue = homeworks.filter((row) => row.overdue).length
  const weakest = toCapabilityStats(knowledgeMap)[0]
  const firstOverdue = homeworks.find((row) => row.overdue)
  const firstPending = homeworks.find((row) => row.status !== 'submitted' && row.status !== 'graded')

  const recommendedAction = firstOverdue
    ? {
        label: 'Hoàn thành bài quá hạn',
        detail: firstOverdue.title,
        href: `/homework/prepare/${firstOverdue.assignmentId}`,
        tone: 'rose' as const,
      }
    : firstPending
      ? {
          label: firstPending.answered > 0 ? 'Làm tiếp bài đang mở' : 'Bắt đầu bài được giao',
          detail: firstPending.title,
          href: `/homework/prepare/${firstPending.assignmentId}`,
          tone: 'amber' as const,
        }
      : weakest && weakest.status === 'needs_work'
        ? {
            label: 'Củng cố mảng còn yếu',
            detail: weakest.label,
            href: '/learn',
            tone: 'teal' as const,
          }
        : {
            label: 'Duy trì nhịp học',
            detail: homeworks.length ? 'Hoàn thành tốt các bài được giao.' : 'Chưa có bài được giao mới.',
            href: '/student/practice',
            tone: 'slate' as const,
          }

  return {
    student: {
      id: studentId,
      name: profile?.full_name || 'Học sinh',
      classId,
      accessTier,
      canViewAdvancedAnalytics: canViewAdvancedAnalytics(accessTier),
    },
    totals: {
      assigned: homeworks.length,
      submitted,
      pending,
      overdue,
      answered,
      totalQuestions,
      correct,
      completionRate: percent(submitted, homeworks.length),
      accuracy: percent(correct, answered),
    },
    homeworks,
    levelStats: toCapabilityStats(levelMap),
    knowledgeStats: toCapabilityStats(knowledgeMap),
    recommendedAction,
  }
}
