import type { SupabaseClient } from '@supabase/supabase-js'

export interface FetchedAnswer {
  id: string
  question_id: string
  content: string
  is_correct: boolean
  order_index: number
}

// Supabase trả về tối đa 1000 dòng mỗi request (mặc định).
// Đồng thời URL có giới hạn độ dài nên không thể đưa quá nhiều id vào .in().
// Helper này chia nhỏ question_id theo lô và phân trang để LẤY ĐỦ tất cả đáp án,
// tránh tình trạng mất đáp án (đặc biệt là đáp án có order_index cao) khi
// số lượng đáp án vượt quá 1000 dòng.
const QUESTION_ID_CHUNK = 150
const PAGE_SIZE = 1000

export async function fetchAllAnswers(
  supabase: SupabaseClient,
  questionIds: string[]
): Promise<FetchedAnswer[]> {
  const uniqueIds = Array.from(new Set(questionIds.filter(Boolean)))
  if (uniqueIds.length === 0) return []

  const all: FetchedAnswer[] = []

  for (let i = 0; i < uniqueIds.length; i += QUESTION_ID_CHUNK) {
    const chunk = uniqueIds.slice(i, i + QUESTION_ID_CHUNK)

    let from = 0
    // Phân trang trong từng lô để chắc chắn không bị cắt ở mốc 1000 dòng.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('answers')
        .select('id, question_id, content, is_correct, order_index')
        .in('question_id', chunk)
        .order('question_id', { ascending: true })
        .order('order_index', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        throw new Error(`Không thể tải đáp án: ${error.message}`)
      }

      const rows = (data || []) as FetchedAnswer[]
      all.push(...rows)

      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return all
}

// Tiện ích: gom đáp án theo question_id, đã sắp xếp theo order_index.
export function groupAnswersByQuestion(
  answers: FetchedAnswer[]
): Record<string, FetchedAnswer[]> {
  const map: Record<string, FetchedAnswer[]> = {}
  for (const a of answers) {
    ;(map[a.question_id] ||= []).push(a)
  }
  for (const id of Object.keys(map)) {
    map[id].sort((x, y) => x.order_index - y.order_index)
  }
  return map
}
