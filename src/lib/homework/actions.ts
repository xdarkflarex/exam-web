'use client'

import { createClient } from '@/lib/supabase/client'

export async function getStudentHomeworkAssignments(studentId: string, classId?: string | null) {
  const supabase = createClient()
  const filters = classId
    ? `student_id.eq.${studentId},class_id.eq.${classId}`
    : `student_id.eq.${studentId}`
  const { data: recipients, error } = await supabase
    .from('homework_assignment_recipients')
    .select('assignment_id')
    .or(filters)
  if (error) throw error
  const assignmentIds = [...new Set((recipients || []).map(row => row.assignment_id))]
  if (assignmentIds.length === 0) return []

  const { data, error: assignmentError } = await supabase
    .from('homework_assignments')
    .select(`
      id, homework_id, title, deadline, status, created_at,
      homeworks!inner(id, title, description, grade, session_size, is_published)
    `)
    .in('id', assignmentIds)
    .eq('status', 'published')
    .eq('homeworks.is_published', true)
    .order('deadline', { ascending: true, nullsFirst: false })
  if (assignmentError) throw assignmentError
  return data || []
}

export async function getOrCreateHomeworkAttempt(
  assignmentId: string,
  studentId: string
) {
  const supabase = createClient()
  const { data: existing, error: existingError } = await supabase
    .from('homework_attempts')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing.id as string

  const { data, error } = await supabase
    .from('homework_attempts')
    .insert({
      assignment_id: assignmentId,
      student_id: studentId,
      status: 'in_progress',
      current_session_index: 0,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
