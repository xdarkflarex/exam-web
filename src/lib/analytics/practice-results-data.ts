/**
 * Tải dữ liệu cho `/admin/practice-results`. Phần TÍNH nằm ở
 * `practice-results.ts` (có test); file này chỉ đọc database.
 *
 * PHÂN TRANG LÀ BẮT BUỘC. PostgREST của Supabase trả tối đa 1000 dòng mỗi câu
 * truy vấn và CẮT IM LẶNG phần còn lại — không lỗi, không cảnh báo. Ôn tập cho
 * làm lại tuỳ ý nên số lượt tăng nhanh: một lớp 40 em × 10 đề × vài lượt là đã
 * vượt 1000. Không phân trang thì trang này sẽ báo "chưa làm" cho những em đã
 * làm, đúng lúc người ta bắt đầu tin vào nó.
 *
 * Quyền: đọc bằng session của người đang xem, RLS quyết định thấy gì — admin
 * thấy hết, giáo viên thấy phần RLS cho phép. Giống `/admin/students`.
 */

import { createClient } from '@/lib/supabase/client'
import type { PracticeAttemptRow } from './practice-results'

export interface PracticeExam {
  id: string
  title: string
  grade: number | null
  is_published: boolean | null
  created_at: string | null
}

export interface PracticeStudent {
  id: string
  full_name: string | null
  email: string | null
  class_id: string | null
}

export interface PracticeClass {
  id: string
  name: string
  grade: number | null
}

export interface PracticeResultsData {
  exams: PracticeExam[]
  attempts: PracticeAttemptRow[]
  students: PracticeStudent[]
  classes: PracticeClass[]
  /** attemptId → số câu đã trả lời, chỉ cho lượt đang làm dở. */
  answeredCounts: Map<string, number>
  warnings: string[]
}

const PAGE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Đọc hết mọi trang. `build(from, to)` phải có `.order(...)` để các trang không chồng nhau. */
async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

/** Chạy tối đa `limit` việc cùng lúc — đếm từng lượt dở mà không dội cả trăm request. */
async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function fetchPracticeResultsData(): Promise<PracticeResultsData> {
  const supabase = createClient()
  const warnings: string[] = []

  const [exams, students, classesRes] = await Promise.all([
    fetchAll<PracticeExam>((from, to) =>
      supabase
        .from('exams')
        .select('id, title, grade, is_published, created_at')
        .eq('exam_mode', 'practice')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    ),
    fetchAll<PracticeStudent>((from, to) =>
      supabase
        .from('profiles')
        .select('id, full_name, email, class_id')
        .eq('role', 'student')
        .order('id')
        .range(from, to)
    ),
    supabase.from('classes').select('id, name, grade').order('name'),
  ])

  if (classesRes.error) {
    // Không chặn cả trang vì danh sách lớp: chỉ mất bộ lọc theo lớp.
    warnings.push('Không đọc được danh sách lớp — bộ lọc theo lớp tạm thời không dùng được.')
  }

  const examIds = exams.map((exam) => exam.id)
  const attempts = examIds.length
    ? await fetchAll<PracticeAttemptRow>((from, to) =>
        supabase
          .from('exam_attempts')
          .select('id, exam_id, student_id, status, score, total_questions, correct_answers, start_time, submit_time')
          .in('exam_id', examIds)
          .order('id')
          .range(from, to)
      )
    : []

  // Lượt đang làm dở: đếm số câu đã tự lưu. Đếm bằng `head: true` nên không kéo
  // nội dung bài làm nào về trình duyệt.
  const open = attempts.filter((attempt) => attempt.status === 'in_progress')
  const answeredCounts = new Map<string, number>()
  let countFailed = false
  await mapLimit(open, 8, async (attempt) => {
    const { count, error } = await supabase
      .from('student_answers')
      .select('id', { count: 'exact', head: true })
      .eq('attempt_id', attempt.id)
    if (error) countFailed = true
    else answeredCounts.set(attempt.id, count ?? 0)
  })
  if (countFailed) {
    warnings.push('Không đếm được số câu đã làm của vài lượt đang dở — các lượt đó hiện 0 câu.')
  }

  return {
    exams,
    attempts,
    students,
    classes: (classesRes.data ?? []) as PracticeClass[],
    answeredCounts,
    warnings,
  }
}
