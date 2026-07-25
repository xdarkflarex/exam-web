export interface Homework {
  id: string
  title: string
  description?: string | null
  grade?: number | null
  session_size: number
  created_by?: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface HomeworkAssignment {
  id: string
  homework_id: string
  assigned_by?: string | null
  title?: string | null
  deadline?: string | null
  status: 'draft' | 'published' | 'closed'
  created_at: string
  updated_at: string
}

export interface HomeworkAttempt {
  id: string
  assignment_id: string
  student_id: string
  status: 'in_progress' | 'submitted' | 'graded' | 'abandoned'
  started_at: string
  submitted_at?: string | null
  current_session_index: number
  total_questions: number
  answered_questions: number
  correct_answers: number
  score?: number | null
}
