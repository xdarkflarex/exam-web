'use client'

import { createClient } from '@/lib/supabase/client'

export type LearningSignal =
  | 'needs_attention'
  | 'improving'
  | 'in_progress'
  | 'stable'
  | 'no_data'

export type HomeworkDataAccess = 'available' | 'restricted' | 'unavailable'

export interface ManagedClass {
  id: string
  name: string
  grade: number | null
  school: string | null
}

export interface StudentPerformanceOverview {
  id: string
  fullName: string
  email: string
  school: string | null
  classId: string | null
  className: string | null
  grade: number | null
  accessTier: string
  createdAt: string
  simulation: {
    completed: number
    averageScore: number | null
    trend: number | null
    pendingReview: number
  }
  practice: {
    completed: number
    accuracy: number | null
  }
  homework: {
    assigned: number
    started: number
    submitted: number
    overdue: number
    completionRate: number | null
    accuracy: number | null
  }
  lastActivityAt: string | null
  signal: LearningSignal
  signalReason: string
}

export interface StudentOverviewPayload {
  actorRole: string
  classes: ManagedClass[]
  students: StudentPerformanceOverview[]
  homeworkAccess: HomeworkDataAccess
  warnings: string[]
}

export interface AssessmentAttempt {
  id: string
  examId: string
  title: string
  mode: 'simulation' | 'practice'
  status: string
  gradingStatus: string
  pendingGradingCount: number
  score: number | null
  totalQuestions: number
  correctAnswers: number
  timeSpent: number
  occurredAt: string
}

export interface HomeworkActivity {
  attemptId: string | null
  assignmentId: string
  homeworkId: string
  title: string
  deadline: string | null
  status: string
  answeredQuestions: number
  totalQuestions: number
  correctAnswers: number
  score: number | null
  overdue: boolean
  occurredAt: string
}

export interface EvidenceStat {
  id: string
  label: string
  correct: number
  total: number
  accuracy: number
  simulationTotal: number
  practiceTotal: number
}

export interface StudentPerformanceDetail {
  actorRole: string
  homeworkAccess: HomeworkDataAccess
  warnings: string[]
  student: {
    id: string
    fullName: string
    email: string
    school: string | null
    classId: string | null
    className: string | null
    grade: number | null
    accessTier: string
    createdAt: string
  }
  attempts: AssessmentAttempt[]
  homeworkActivities: HomeworkActivity[]
  knowledgeStats: EvidenceStat[]
  cognitiveStats: EvidenceStat[]
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  school: string | null
  class_id: string | null
  grade: number | null
  access_tier: string | null
  created_at: string
}

interface ClassRow {
  id: string
  name: string
  grade: number | null
  school: string | null
}

interface ExamAttemptRow {
  id: string
  exam_id: string
  student_id: string
  score: number | string | null
  total_questions: number | null
  correct_answers: number | null
  time_spent: number | null
  status: string
  grading_status: string | null
  pending_grading_count: number | null
  submit_time: string | null
  graded_at: string | null
  created_at: string
  updated_at: string | null
  exams?: unknown
}

interface HomeworkAssignmentRow {
  id: string
  homework_id: string
  title: string | null
  deadline: string | null
  status: string
  created_at: string
  homeworks?: unknown
}

interface HomeworkRecipientRow {
  assignment_id: string
  class_id: string | null
  student_id: string | null
}

interface HomeworkAttemptRow {
  id: string
  assignment_id: string
  student_id: string
  status: string
  answered_questions: number | null
  total_questions: number | null
  correct_answers: number | null
  score: number | string | null
  started_at: string
  submitted_at: string | null
  updated_at: string | null
}

interface AnswerEvidenceRow {
  attempt_id: string
  question_id: string
  is_correct: boolean | null
}

interface QuestionRow {
  id: string
  cognitive_level: string | null
}

interface QuestionKnowledgeLinkRow {
  question_id: string
  theory_id: string | null
  knowledge_block_id: string | null
  link_type: string
}

interface NamedRow {
  id: string
  title: string
}

interface MutableEvidenceStat {
  label: string
  correct: number
  total: number
  simulationTotal: number
  practiceTotal: number
}

const COGNITIVE_LABELS: Record<string, string> = {
  NB: 'Nhận biết',
  TH: 'Thông hiểu',
  VD: 'Vận dụng',
  VDC: 'Vận dụng cao',
  OTHER: 'Chưa phân loại',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null
  return isRecord(value) ? value : null
}

function relationString(value: unknown, key: string, fallback: string): string {
  const record = relationRecord(value)
  return typeof record?.[key] === 'string' ? record[key] : fallback
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function percentage(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest
    if (!latest) return value
    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  }, null)
}

function completedStatus(status: string): boolean {
  return status === 'submitted' || status === 'graded'
}

function finalScore(row: ExamAttemptRow): number | null {
  if (!completedStatus(row.status)) return null
  if (row.grading_status === 'pending_review' || row.grading_status === 'failed') return null
  return nullableNumber(row.score)
}

function examMode(row: ExamAttemptRow): 'simulation' | 'practice' | null {
  const mode = relationString(row.exams, 'exam_mode', '')
  return mode === 'simulation' || mode === 'practice' ? mode : null
}

function examOccurredAt(row: ExamAttemptRow): string {
  return row.graded_at || row.submit_time || row.updated_at || row.created_at
}

function homeworkOccurredAt(row: HomeworkAttemptRow | undefined, assignment: HomeworkAssignmentRow): string {
  return row?.submitted_at || row?.updated_at || row?.started_at || assignment.created_at
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function scoreTrend(rows: ExamAttemptRow[]): number | null {
  const scores = rows
    .filter((row) => examMode(row) === 'simulation')
    .map((row) => ({ score: finalScore(row), occurredAt: examOccurredAt(row) }))
    .filter((row): row is { score: number; occurredAt: string } => row.score !== null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  if (scores.length < 4) return null
  const recent = average(scores.slice(0, 3).map((row) => row.score))
  const previous = average(scores.slice(3, 6).map((row) => row.score))
  return recent !== null && previous !== null ? recent - previous : null
}

function learningSignal(input: {
  simulationCompleted: number
  simulationAverage: number | null
  trend: number | null
  homeworkAssigned: number
  homeworkStarted: number
  homeworkSubmitted: number
  homeworkOverdue: number
  homeworkAnswered: number
  homeworkAccuracy: number | null
}): { signal: LearningSignal; reason: string } {
  if (input.homeworkOverdue > 0) {
    return {
      signal: 'needs_attention',
      reason: `${input.homeworkOverdue} bài tập đã quá hạn`,
    }
  }
  if (
    input.simulationCompleted >= 2
    && input.simulationAverage !== null
    && input.simulationAverage < 5
  ) {
    return {
      signal: 'needs_attention',
      reason: `Điểm thi thử trung bình ${input.simulationAverage.toFixed(1)}`,
    }
  }
  if (
    input.homeworkAnswered >= 5
    && input.homeworkAccuracy !== null
    && input.homeworkAccuracy < 50
  ) {
    return {
      signal: 'needs_attention',
      reason: `Độ chính xác bài tập ${input.homeworkAccuracy}%`,
    }
  }
  if (input.trend !== null && input.trend >= 0.5) {
    return {
      signal: 'improving',
      reason: `Điểm 3 bài gần đây tăng ${input.trend.toFixed(1)}`,
    }
  }
  if (
    input.homeworkAssigned > input.homeworkSubmitted
    || input.homeworkStarted > input.homeworkSubmitted
  ) {
    return {
      signal: 'in_progress',
      reason: `${input.homeworkSubmitted}/${input.homeworkAssigned} bài tập đã nộp`,
    }
  }
  if (input.simulationCompleted > 0 || input.homeworkSubmitted > 0) {
    return {
      signal: 'stable',
      reason: 'Tiến độ hiện ổn định',
    }
  }
  return {
    signal: 'no_data',
    reason: 'Chưa đủ dữ liệu đã hoàn thành',
  }
}

function homeworkAssignmentSets(
  profiles: ProfileRow[],
  assignments: HomeworkAssignmentRow[],
  recipients: HomeworkRecipientRow[],
): Map<string, Set<string>> {
  const activeAssignmentIds = new Set(
    assignments
      .filter((assignment) => assignment.status !== 'draft')
      .map((assignment) => assignment.id),
  )
  const studentsByClass = new Map<string, string[]>()
  for (const profile of profiles) {
    if (!profile.class_id) continue
    studentsByClass.set(profile.class_id, [
      ...(studentsByClass.get(profile.class_id) || []),
      profile.id,
    ])
  }

  const result = new Map<string, Set<string>>()
  for (const profile of profiles) result.set(profile.id, new Set<string>())

  for (const recipient of recipients) {
    if (!activeAssignmentIds.has(recipient.assignment_id)) continue
    if (recipient.student_id && result.has(recipient.student_id)) {
      result.get(recipient.student_id)?.add(recipient.assignment_id)
    }
    if (recipient.class_id) {
      for (const studentId of studentsByClass.get(recipient.class_id) || []) {
        result.get(studentId)?.add(recipient.assignment_id)
      }
    }
  }
  return result
}

function buildStudentOverviews(input: {
  profiles: ProfileRow[]
  classes: ClassRow[]
  examAttempts: ExamAttemptRow[]
  homeworkAssignments: HomeworkAssignmentRow[]
  homeworkRecipients: HomeworkRecipientRow[]
  homeworkAttempts: HomeworkAttemptRow[]
  homeworkAccess: HomeworkDataAccess
}): StudentPerformanceOverview[] {
  const classMap = new Map(input.classes.map((row) => [row.id, row]))
  const examAttemptsByStudent = new Map<string, ExamAttemptRow[]>()
  for (const attempt of input.examAttempts) {
    examAttemptsByStudent.set(attempt.student_id, [
      ...(examAttemptsByStudent.get(attempt.student_id) || []),
      attempt,
    ])
  }

  const homeworkAssignmentMap = new Map(
    input.homeworkAssignments.map((assignment) => [assignment.id, assignment]),
  )
  const assignedByStudent = homeworkAssignmentSets(
    input.profiles,
    input.homeworkAssignments,
    input.homeworkRecipients,
  )
  const homeworkAttemptsByStudent = new Map<string, HomeworkAttemptRow[]>()
  for (const attempt of input.homeworkAttempts) {
    homeworkAttemptsByStudent.set(attempt.student_id, [
      ...(homeworkAttemptsByStudent.get(attempt.student_id) || []),
      attempt,
    ])
  }

  return input.profiles.map((profile) => {
    const examRows = examAttemptsByStudent.get(profile.id) || []
    const simulationRows = examRows.filter((row) => examMode(row) === 'simulation')
    const practiceRows = examRows.filter((row) => examMode(row) === 'practice')
    const simulationScores = simulationRows
      .map(finalScore)
      .filter((score): score is number => score !== null)
    const practiceCompletedRows = practiceRows.filter((row) => completedStatus(row.status))
    const practiceAnswered = practiceCompletedRows.reduce(
      (sum, row) => sum + (row.total_questions || 0),
      0,
    )
    const practiceCorrect = practiceCompletedRows.reduce(
      (sum, row) => sum + (row.correct_answers || 0),
      0,
    )
    const trend = scoreTrend(simulationRows)

    const assignmentIds = assignedByStudent.get(profile.id) || new Set<string>()
    const homeworkRows = homeworkAttemptsByStudent.get(profile.id) || []
    const relevantHomeworkRows = homeworkRows.filter((row) => assignmentIds.has(row.assignment_id))
    const attemptByAssignment = new Map(
      relevantHomeworkRows.map((row) => [row.assignment_id, row]),
    )
    const submitted = [...assignmentIds].filter((assignmentId) => {
      const attempt = attemptByAssignment.get(assignmentId)
      return attempt ? completedStatus(attempt.status) : false
    }).length
    const overdue = [...assignmentIds].filter((assignmentId) => {
      const assignment = homeworkAssignmentMap.get(assignmentId)
      const attempt = attemptByAssignment.get(assignmentId)
      if (!assignment?.deadline || (attempt && completedStatus(attempt.status))) return false
      return new Date(assignment.deadline).getTime() < Date.now()
    }).length
    const answered = relevantHomeworkRows.reduce(
      (sum, row) => sum + (row.answered_questions || 0),
      0,
    )
    const correct = relevantHomeworkRows.reduce(
      (sum, row) => sum + (row.correct_answers || 0),
      0,
    )
    const homeworkAccuracy = percentage(correct, answered)
    const signal = learningSignal({
      simulationCompleted: simulationScores.length,
      simulationAverage: average(simulationScores),
      trend,
      homeworkAssigned: assignmentIds.size,
      homeworkStarted: relevantHomeworkRows.length,
      homeworkSubmitted: submitted,
      homeworkOverdue: overdue,
      homeworkAnswered: answered,
      homeworkAccuracy,
    })
    const classRow = profile.class_id ? classMap.get(profile.class_id) : undefined

    return {
      id: profile.id,
      fullName: profile.full_name?.trim() || 'Chưa đặt tên',
      email: profile.email || '',
      school: profile.school || classRow?.school || null,
      classId: profile.class_id,
      className: classRow?.name || null,
      grade: profile.grade || classRow?.grade || null,
      accessTier: profile.access_tier || 'basic',
      createdAt: profile.created_at,
      simulation: {
        completed: simulationScores.length,
        averageScore: average(simulationScores),
        trend,
        pendingReview: simulationRows.filter(
          (row) => row.grading_status === 'pending_review',
        ).length,
      },
      practice: {
        completed: practiceCompletedRows.length,
        accuracy: percentage(practiceCorrect, practiceAnswered),
      },
      homework: {
        assigned: input.homeworkAccess === 'available' ? assignmentIds.size : 0,
        started: input.homeworkAccess === 'available' ? relevantHomeworkRows.length : 0,
        submitted: input.homeworkAccess === 'available' ? submitted : 0,
        overdue: input.homeworkAccess === 'available' ? overdue : 0,
        completionRate: input.homeworkAccess === 'available'
          ? percentage(submitted, assignmentIds.size)
          : null,
        accuracy: input.homeworkAccess === 'available' ? homeworkAccuracy : null,
      },
      lastActivityAt: latestTimestamp([
        ...examRows.map(examOccurredAt),
        ...relevantHomeworkRows.map(
          (row) => row.submitted_at || row.updated_at || row.started_at,
        ),
      ]),
      signal: signal.signal,
      signalReason: signal.reason,
    }
  })
}

async function getActorRole(): Promise<{ role: string; userId: string }> {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    throw new Error('Phiên đăng nhập không hợp lệ.')
  }
  const { data: actor, error: actorError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single()
  if (actorError || !actor?.role) {
    throw new Error(actorError?.message || 'Không đọc được quyền tài khoản.')
  }
  return { role: actor.role, userId: authData.user.id }
}

export async function fetchStudentPerformanceOverview(): Promise<StudentOverviewPayload> {
  const supabase = createClient()
  const actor = await getActorRole()
  const [profilesRes, classesRes, attemptsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, school, class_id, grade, access_tier, created_at')
      .eq('role', 'student')
      .order('full_name'),
    supabase
      .from('classes')
      .select('id, name, grade, school')
      .order('name'),
    supabase
      .from('exam_attempts')
      .select(`
        id, exam_id, student_id, score, total_questions, correct_answers,
        time_spent, status, grading_status, pending_grading_count,
        submit_time, graded_at, created_at, updated_at,
        exams!exam_id(exam_mode)
      `),
  ])

  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (classesRes.error) throw new Error(classesRes.error.message)
  if (attemptsRes.error) throw new Error(attemptsRes.error.message)

  const profiles = (profilesRes.data || []) as ProfileRow[]
  const classes = (classesRes.data || []) as ClassRow[]
  const examAttempts = (attemptsRes.data || []) as unknown as ExamAttemptRow[]
  const warnings: string[] = []
  let homeworkAccess: HomeworkDataAccess = actor.role === 'admin' ? 'available' : 'restricted'
  let homeworkAssignments: HomeworkAssignmentRow[] = []
  let homeworkRecipients: HomeworkRecipientRow[] = []
  let homeworkAttempts: HomeworkAttemptRow[] = []

  if (actor.role === 'admin') {
    const [assignmentsRes, recipientsRes, homeworkAttemptsRes] = await Promise.all([
      supabase
        .from('homework_assignments')
        .select('id, homework_id, title, deadline, status, created_at, homeworks!homework_id(title)'),
      supabase
        .from('homework_assignment_recipients')
        .select('assignment_id, class_id, student_id'),
      supabase
        .from('homework_attempts')
        .select(`
          id, assignment_id, student_id, status, answered_questions,
          total_questions, correct_answers, score, started_at, submitted_at, updated_at
        `),
    ])
    const homeworkError = assignmentsRes.error || recipientsRes.error || homeworkAttemptsRes.error
    if (homeworkError) {
      homeworkAccess = 'unavailable'
      warnings.push(`Chưa đọc được dữ liệu bài tập: ${homeworkError.message}`)
    } else {
      homeworkAssignments = (assignmentsRes.data || []) as unknown as HomeworkAssignmentRow[]
      homeworkRecipients = (recipientsRes.data || []) as HomeworkRecipientRow[]
      homeworkAttempts = (homeworkAttemptsRes.data || []) as HomeworkAttemptRow[]
    }
  } else {
    warnings.push('Dữ liệu bài tập hiện chỉ mở cho quản trị viên hệ thống theo RLS.')
  }

  return {
    actorRole: actor.role,
    classes: classes.map((row) => ({
      id: row.id,
      name: row.name,
      grade: row.grade,
      school: row.school,
    })),
    students: buildStudentOverviews({
      profiles,
      classes,
      examAttempts,
      homeworkAssignments,
      homeworkRecipients,
      homeworkAttempts,
      homeworkAccess,
    }),
    homeworkAccess,
    warnings,
  }
}

function toAssessmentAttempt(row: ExamAttemptRow): AssessmentAttempt | null {
  const mode = examMode(row)
  if (!mode) return null
  return {
    id: row.id,
    examId: row.exam_id,
    title: relationString(row.exams, 'title', mode === 'simulation' ? 'Đề thi' : 'Bài ôn tập'),
    mode,
    status: row.status,
    gradingStatus: row.grading_status || 'not_required',
    pendingGradingCount: row.pending_grading_count || 0,
    score: finalScore(row),
    totalQuestions: row.total_questions || 0,
    correctAnswers: row.correct_answers || 0,
    timeSpent: row.time_spent || 0,
    occurredAt: examOccurredAt(row),
  }
}

function buildEvidenceStats(input: {
  answers: AnswerEvidenceRow[]
  attempts: AssessmentAttempt[]
  questions: QuestionRow[]
  links: QuestionKnowledgeLinkRow[]
  theories: NamedRow[]
  blocks: NamedRow[]
}): { knowledgeStats: EvidenceStat[]; cognitiveStats: EvidenceStat[] } {
  const modeByAttempt = new Map(input.attempts.map((attempt) => [attempt.id, attempt.mode]))
  const levelByQuestion = new Map(
    input.questions.map((question) => [question.id, question.cognitive_level || 'OTHER']),
  )
  const linksByQuestion = new Map<string, QuestionKnowledgeLinkRow[]>()
  for (const link of input.links) {
    linksByQuestion.set(link.question_id, [
      ...(linksByQuestion.get(link.question_id) || []),
      link,
    ])
  }
  const theoryNames = new Map(input.theories.map((row) => [row.id, row.title]))
  const blockNames = new Map(input.blocks.map((row) => [row.id, row.title]))
  const knowledgeMap = new Map<string, MutableEvidenceStat>()
  const cognitiveMap = new Map<string, MutableEvidenceStat>()

  const addEvidence = (
    map: Map<string, MutableEvidenceStat>,
    id: string,
    label: string,
    correct: boolean,
    mode: 'simulation' | 'practice',
  ) => {
    const current = map.get(id) || {
      label,
      correct: 0,
      total: 0,
      simulationTotal: 0,
      practiceTotal: 0,
    }
    current.total += 1
    if (correct) current.correct += 1
    if (mode === 'simulation') current.simulationTotal += 1
    if (mode === 'practice') current.practiceTotal += 1
    map.set(id, current)
  }

  for (const answer of input.answers) {
    if (answer.is_correct === null) continue
    const mode = modeByAttempt.get(answer.attempt_id)
    if (!mode) continue
    const level = levelByQuestion.get(answer.question_id) || 'OTHER'
    addEvidence(
      cognitiveMap,
      level,
      COGNITIVE_LABELS[level] || level,
      answer.is_correct,
      mode,
    )

    const links = linksByQuestion.get(answer.question_id) || []
    const primary = links.find((link) => link.link_type === 'primary') || links[0]
    if (!primary) continue
    if (primary.knowledge_block_id) {
      addEvidence(
        knowledgeMap,
        `block:${primary.knowledge_block_id}`,
        blockNames.get(primary.knowledge_block_id) || 'Khối kiến thức',
        answer.is_correct,
        mode,
      )
    } else if (primary.theory_id) {
      addEvidence(
        knowledgeMap,
        `theory:${primary.theory_id}`,
        theoryNames.get(primary.theory_id) || 'Kiến thức',
        answer.is_correct,
        mode,
      )
    }
  }

  const finalize = (map: Map<string, MutableEvidenceStat>): EvidenceStat[] => (
    [...map.entries()]
      .map(([id, row]) => ({
        id,
        label: row.label,
        correct: row.correct,
        total: row.total,
        accuracy: percentage(row.correct, row.total) || 0,
        simulationTotal: row.simulationTotal,
        practiceTotal: row.practiceTotal,
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
  )

  return {
    knowledgeStats: finalize(knowledgeMap),
    cognitiveStats: finalize(cognitiveMap),
  }
}

async function fetchEvidence(
  attempts: AssessmentAttempt[],
): Promise<{ knowledgeStats: EvidenceStat[]; cognitiveStats: EvidenceStat[] }> {
  const completedAttemptIds = attempts
    .filter((attempt) => completedStatus(attempt.status))
    .map((attempt) => attempt.id)
  if (completedAttemptIds.length === 0) {
    return { knowledgeStats: [], cognitiveStats: [] }
  }

  const supabase = createClient()
  const { data: answerData, error: answersError } = await supabase
    .from('student_answers')
    .select('attempt_id, question_id, is_correct')
    .in('attempt_id', completedAttemptIds)
    .not('is_correct', 'is', null)
  if (answersError) throw new Error(answersError.message)

  const answers = (answerData || []) as AnswerEvidenceRow[]
  const questionIds = [...new Set(answers.map((answer) => answer.question_id))]
  if (questionIds.length === 0) {
    return { knowledgeStats: [], cognitiveStats: [] }
  }

  const [questionsRes, linksRes] = await Promise.all([
    supabase
      .from('questions')
      .select('id, cognitive_level')
      .in('id', questionIds),
    supabase
      .from('question_knowledge_links')
      .select('question_id, theory_id, knowledge_block_id, link_type')
      .in('question_id', questionIds),
  ])
  if (questionsRes.error) throw new Error(questionsRes.error.message)
  if (linksRes.error) throw new Error(linksRes.error.message)

  const links = (linksRes.data || []) as QuestionKnowledgeLinkRow[]
  const theoryIds = [
    ...new Set(links.map((link) => link.theory_id).filter((id): id is string => Boolean(id))),
  ]
  const blockIds = [
    ...new Set(
      links
        .map((link) => link.knowledge_block_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const [theoriesRes, blocksRes] = await Promise.all([
    theoryIds.length
      ? supabase.from('theories').select('id, title').in('id', theoryIds)
      : Promise.resolve({ data: [] as NamedRow[], error: null }),
    blockIds.length
      ? supabase.from('knowledge_blocks').select('id, title').in('id', blockIds)
      : Promise.resolve({ data: [] as NamedRow[], error: null }),
  ])
  if (theoriesRes.error) throw new Error(theoriesRes.error.message)
  if (blocksRes.error) throw new Error(blocksRes.error.message)

  return buildEvidenceStats({
    answers,
    attempts,
    questions: (questionsRes.data || []) as QuestionRow[],
    links,
    theories: (theoriesRes.data || []) as NamedRow[],
    blocks: (blocksRes.data || []) as NamedRow[],
  })
}

async function fetchHomeworkDetail(
  studentId: string,
  classId: string | null,
): Promise<{
  access: HomeworkDataAccess
  warning: string | null
  activities: HomeworkActivity[]
}> {
  const supabase = createClient()
  const recipientRequests = [
    supabase
      .from('homework_assignment_recipients')
      .select('assignment_id')
      .eq('student_id', studentId),
  ]
  if (classId) {
    recipientRequests.push(
      supabase
        .from('homework_assignment_recipients')
        .select('assignment_id')
        .eq('class_id', classId),
    )
  }

  const [recipientResults, attemptsRes] = await Promise.all([
    Promise.all(recipientRequests),
    supabase
      .from('homework_attempts')
      .select(`
        id, assignment_id, student_id, status, answered_questions,
        total_questions, correct_answers, score, started_at, submitted_at, updated_at
      `)
      .eq('student_id', studentId),
  ])
  const recipientError = recipientResults.find((result) => result.error)?.error
  if (recipientError || attemptsRes.error) {
    const error = recipientError || attemptsRes.error
    return {
      access: 'unavailable',
      warning: `Chưa đọc được dữ liệu bài tập: ${error?.message || 'Lỗi không xác định'}`,
      activities: [],
    }
  }

  const attempts = (attemptsRes.data || []) as HomeworkAttemptRow[]
  const assignmentIds = [
    ...new Set([
      ...recipientResults.flatMap((result) => (
        (result.data || []).map((row) => row.assignment_id as string)
      )),
      ...attempts.map((attempt) => attempt.assignment_id),
    ]),
  ]
  if (assignmentIds.length === 0) {
    return { access: 'available', warning: null, activities: [] }
  }

  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from('homework_assignments')
    .select('id, homework_id, title, deadline, status, created_at, homeworks!homework_id(title)')
    .in('id', assignmentIds)
  if (assignmentsError) {
    return {
      access: 'unavailable',
      warning: `Chưa đọc được danh sách bài tập: ${assignmentsError.message}`,
      activities: [],
    }
  }

  const assignments = (assignmentsData || []) as unknown as HomeworkAssignmentRow[]
  const attemptByAssignment = new Map(attempts.map((attempt) => [attempt.assignment_id, attempt]))
  const activities = assignments
    .filter((assignment) => assignment.status !== 'draft')
    .map((assignment): HomeworkActivity => {
      const attempt = attemptByAssignment.get(assignment.id)
      const done = attempt ? completedStatus(attempt.status) : false
      return {
        attemptId: attempt?.id || null,
        assignmentId: assignment.id,
        homeworkId: assignment.homework_id,
        title: assignment.title || relationString(assignment.homeworks, 'title', 'Bài tập'),
        deadline: assignment.deadline,
        status: attempt?.status || 'not_started',
        answeredQuestions: attempt?.answered_questions || 0,
        totalQuestions: attempt?.total_questions || 0,
        correctAnswers: attempt?.correct_answers || 0,
        score: nullableNumber(attempt?.score),
        overdue: Boolean(
          assignment.deadline
          && !done
          && new Date(assignment.deadline).getTime() < Date.now(),
        ),
        occurredAt: homeworkOccurredAt(attempt, assignment),
      }
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  return { access: 'available', warning: null, activities }
}

export async function fetchStudentPerformanceDetail(
  studentId: string,
): Promise<StudentPerformanceDetail | null> {
  const supabase = createClient()
  const actor = await getActorRole()
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, school, class_id, grade, access_tier, created_at')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profileData) return null

  const profile = profileData as ProfileRow
  const [classRes, attemptsRes] = await Promise.all([
    profile.class_id
      ? supabase
          .from('classes')
          .select('id, name, grade, school')
          .eq('id', profile.class_id)
          .maybeSingle()
      : Promise.resolve({ data: null as ClassRow | null, error: null }),
    supabase
      .from('exam_attempts')
      .select(`
        id, exam_id, student_id, score, total_questions, correct_answers,
        time_spent, status, grading_status, pending_grading_count,
        submit_time, graded_at, created_at, updated_at,
        exams!exam_id(title, exam_mode)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
  ])
  if (classRes.error) throw new Error(classRes.error.message)
  if (attemptsRes.error) throw new Error(attemptsRes.error.message)

  const attempts = ((attemptsRes.data || []) as unknown as ExamAttemptRow[])
    .map(toAssessmentAttempt)
    .filter((attempt): attempt is AssessmentAttempt => attempt !== null)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  const warnings: string[] = []
  const evidence = await fetchEvidence(attempts).catch((error: unknown) => {
    warnings.push(
      `Chưa tải được phân tích kiến thức: ${
        error instanceof Error ? error.message : 'Lỗi không xác định'
      }`,
    )
    return { knowledgeStats: [], cognitiveStats: [] }
  })

  let homeworkAccess: HomeworkDataAccess = 'restricted'
  let homeworkActivities: HomeworkActivity[] = []
  if (actor.role === 'admin') {
    const homework = await fetchHomeworkDetail(studentId, profile.class_id)
    homeworkAccess = homework.access
    homeworkActivities = homework.activities
    if (homework.warning) warnings.push(homework.warning)
  } else {
    warnings.push('Dữ liệu bài tập hiện chỉ mở cho quản trị viên hệ thống theo RLS.')
  }

  const classRow = classRes.data as ClassRow | null
  return {
    actorRole: actor.role,
    homeworkAccess,
    warnings,
    student: {
      id: profile.id,
      fullName: profile.full_name?.trim() || 'Chưa đặt tên',
      email: profile.email || '',
      school: profile.school || classRow?.school || null,
      classId: profile.class_id,
      className: classRow?.name || null,
      grade: profile.grade || classRow?.grade || null,
      accessTier: profile.access_tier || 'basic',
      createdAt: profile.created_at,
    },
    attempts,
    homeworkActivities,
    knowledgeStats: evidence.knowledgeStats,
    cognitiveStats: evidence.cognitiveStats,
  }
}
