import { createClient } from '@/lib/supabase/client'

/**
 * Câu hỏi đã đánh dấu để ôn lại.
 *
 * VÌ SAO FILE NÀY TỒN TẠI. Cho tới 2026-09-20, `question_bookmarks` chỉ được
 * ĐỌC (qua RPC `get_my_safe_bookmarks`) và XOÁ ở `/bookmarks`; không file nào
 * trong `src` insert vào bảng đó. Policy INSERT đã có sẵn từ
 * `database/ANNOUNCEMENTS_SCHEMA.sql:64`, tức hạ tầng đủ — chỉ thiếu đúng cái
 * nút. Kết quả: `/bookmarks` mở được từ menu nhưng luôn rỗng.
 * Ghi ở `docs/VIEC_DANG_MO.md` mục A16.
 *
 * KHÔNG ghi `note`. Cột đó có trên bảng và RPC đọc trả về, nhưng chưa có thiết
 * kế cho việc nhập ghi chú, và bản app điện thoại cũng không ghi. Thêm một ô
 * nhập ở đây mà bên kia không có là tạo ra dữ liệu chỉ một nửa hệ thống hiểu.
 */

export interface BookmarkResult {
  ok: boolean
  message: string
  /** Id dòng vừa lưu (hoặc dòng đã có sẵn) — để bỏ lưu được ngay, không phải tải lại. */
  bookmarkId?: string
}

export async function addBookmark(questionId: string): Promise<BookmarkResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Bạn cần đăng nhập để lưu câu hỏi.' }

  const { data, error } = await supabase
    .from('question_bookmarks')
    .insert({ user_id: user.id, question_id: questionId })
    .select('id')
    .maybeSingle()

  if (!error) {
    return { ok: true, message: 'Đã lưu câu hỏi.', bookmarkId: (data as { id: string } | null)?.id }
  }

  // 23505 = trùng UNIQUE(user_id, question_id): đã lưu từ trước, có thể từ app
  // điện thoại. Với người dùng thì "đã lưu rồi" và "vừa lưu xong" là một.
  if (error.code === '23505') {
    const { data: existing } = await supabase
      .from('question_bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle()
    return {
      ok: true,
      message: 'Câu này đã ở trong danh sách đã lưu.',
      bookmarkId: (existing as { id: string } | null)?.id,
    }
  }

  return { ok: false, message: 'Không lưu được câu hỏi. Vui lòng thử lại.' }
}

export async function removeBookmark(bookmarkId: string): Promise<BookmarkResult> {
  const supabase = createClient()
  const { error } = await supabase.from('question_bookmarks').delete().eq('id', bookmarkId)
  if (error) return { ok: false, message: 'Không bỏ lưu được. Vui lòng thử lại.' }
  return { ok: true, message: 'Đã bỏ lưu.' }
}

/**
 * Câu nào trong danh sách đã được lưu — trả `question_id` → `bookmark_id`.
 *
 * Đọc thẳng `question_bookmarks` ở đây an toàn: bảng chỉ chứa id, ghi chú và
 * thời gian, không có nội dung câu hỏi hay đáp án, và policy SELECT đã giới
 * hạn `user_id = auth.uid()`. Nội dung câu hỏi vẫn chỉ đến từ RPC
 * `get_my_safe_bookmarks`.
 */
export async function getBookmarkIdsByQuestion(
  questionIds: string[]
): Promise<Map<string, string>> {
  if (questionIds.length === 0) return new Map()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Map()

  const { data, error } = await supabase
    .from('question_bookmarks')
    .select('id, question_id')
    .eq('user_id', user.id)
    .in('question_id', questionIds)

  if (error || !data) return new Map()
  return new Map((data as { id: string; question_id: string }[]).map((r) => [r.question_id, r.id]))
}
