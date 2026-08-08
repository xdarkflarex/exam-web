'use client'

import { useEffect, useMemo, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Ảnh bài làm tự luận của một câu, chỉ để XEM LẠI.
 *
 * Dùng ở hai chỗ với cùng một code: trang kết quả của học sinh và màn chấm của
 * giáo viên. Không có nút xoá — sửa/xoá chỉ xảy ra trong lúc làm bài, ở
 * `ExamRunner`. Ranh giới đó là bất biến của `20260809`, và cách giữ nó rẻ nhất
 * là component này không có đường nào để ghi.
 *
 * VÌ SAO CẦN COMPONENT NÀY. Trước nó, ảnh chỉ tồn tại trong lúc học sinh làm bài;
 * sau khi nộp thì cả học sinh và giáo viên đều chỉ thấy text OCR. Nghĩa là lợi
 * ích chính của việc lưu ảnh — mở bài viết tay ra đối chiếu khi điểm có vấn đề —
 * chưa đến được người cần. Với `ESSAY_AI_AUTO_FINALIZE=true`, người cần nó nhất
 * là giáo viên xem lại một điểm mà AI đã công bố.
 *
 * QUYỀN. Bucket `essay-uploads` là private và bảng có RLS thật, nên component
 * không tự kiểm quyền: học sinh chỉ đọc được dòng của mình
 * (`essay_answer_uploads_student_select`), admin đọc được tất cả
 * (`essay_answer_uploads_admin_all`), và signed URL chỉ cấp được nếu policy
 * `SELECT` trên `storage.objects` cho qua. Người không có quyền thấy danh sách
 * rỗng, không thấy lỗi — đúng ý muốn, vì "có ảnh nhưng bạn không được xem" là
 * một thông tin.
 */

/** Signed URL sống đủ lâu để đọc kỹ một trang, không lâu hơn. */
const SIGNED_URL_TTL_SECONDS = 600

interface EssayImage {
  uploadId: string
  pageIndex: number
  url: string | null
  /** Ảnh đã hết hạn lưu và bị job TTL dọn — khác hẳn với ảnh lỗi. */
  purged: boolean
}

interface EssayAnswerImagesProps {
  attemptId: string
  questionId: string
  /** Nhãn cho khối. Giáo viên và học sinh cần câu khác nhau. */
  label?: string
}

export default function EssayAnswerImages({
  attemptId,
  questionId,
  label = 'Ảnh bài làm đã nộp',
}: EssayAnswerImagesProps) {
  const supabase = useMemo(() => createClient(), [])

  /**
   * Kết quả mang theo `key` của lần tải sinh ra nó.
   *
   * Nhờ vậy `loading` được SUY RA khi render (`result.key !== key`) thay vì đặt
   * bằng `setLoading(true)` ở đầu effect. Hai lý do: setState đồng bộ trong effect
   * gây render dây chuyền (eslint `react-hooks/set-state-in-effect` chặn), và cách
   * này không có khoảnh khắc nào hiện ảnh của câu trước cho câu sau khi props đổi.
   */
  const [result, setResult] = useState<{
    key: string
    images: EssayImage[]
    failed: boolean
  } | null>(null)

  const key = `${attemptId}::${questionId}`

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // `deleted_at IS NULL`: ảnh học sinh đã bỏ trong giờ thi không phải bài làm
      // của họ. Chúng vẫn ở trong bảng làm dấu vết, nhưng không hiện ở đây.
      const { data, error } = await supabase
        .from('essay_answer_uploads')
        .select('id, page_index, storage_path, purged_at')
        .eq('attempt_id', attemptId)
        .eq('question_id', questionId)
        .is('deleted_at', null)
        .order('page_index', { ascending: true })

      if (cancelled) return

      if (error) {
        setResult({ key, images: [], failed: true })
        return
      }

      // Signed URL từng ảnh. Không dùng `createSignedUrls` gộp: một ảnh lỗi ở đó
      // làm cả lô không có URL, mà ở đây một trang đọc được vẫn hơn không trang nào.
      const resolved = await Promise.all(
        (data ?? []).map(async (row): Promise<EssayImage> => {
          const base = {
            uploadId: String(row.id),
            pageIndex: Number(row.page_index),
            purged: row.purged_at !== null,
          }

          if (base.purged) return { ...base, url: null }

          const { data: signed, error: signError } = await supabase.storage
            .from('essay-uploads')
            .createSignedUrl(String(row.storage_path), SIGNED_URL_TTL_SECONDS)

          if (signError) {
            // Storage trả "Object not found" cho CẢ HAI trường hợp "tệp không có"
            // và "không có quyền" — cố ý, để không tiết lộ sự tồn tại. Nghĩa là
            // message ở đây không phân biệt được nguyên nhân; log lại `code` để
            // lần sau chẩn đoán không phải dựng script riêng như ngày 2026-08-07.
            //
            // KHÔNG log `storage_path`: nó chứa attempt_id và question_id.
            console.warn(
              `[EssayAnswerImages] không tạo được signed URL cho trang ${base.pageIndex + 1}:`,
              signError.message
            )
          }

          return { ...base, url: signed?.signedUrl ?? null }
        })
      )

      if (!cancelled) setResult({ key, images: resolved, failed: false })
    }

    void run()

    // Props đổi giữa lúc đang tải (giáo viên bấm sang câu khác) thì bỏ kết quả cũ.
    return () => {
      cancelled = true
    }
  }, [attemptId, questionId, key, supabase])

  const loading = result?.key !== key
  const failed = result?.failed ?? false
  const images = result?.key === key ? result.images : []

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải ảnh bài làm...
      </div>
    )
  }

  if (failed) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Không tải được ảnh bài làm. Text bên trên vẫn là bài đã nộp; hãy thử lại
        hoặc chấm theo text.
      </div>
    )
  }

  // Bài gõ bằng bàn phím thì không có ảnh, và đó là trường hợp phổ biến nhất.
  // Hiện một khối trống với dòng "không có ảnh" chỉ làm trang dài ra vô ích.
  if (images.length === 0) return null

  return (
    <div>
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label} ({images.length} trang)
      </span>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Ảnh là bản gốc; text bên trên là bản máy đọc mà học sinh đã xác nhận. Lệch
        nhau thì tin ảnh.
      </p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {images.map((image) => (
          <li key={image.uploadId}>
            {image.purged || !image.url ? (
              <div className="flex h-32 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 p-2 text-center text-[10px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <ImageOff className="h-5 w-5" />
                {image.purged ? 'Đã hết hạn lưu' : 'Không mở được'}
                <span>Trang {image.pageIndex + 1}</span>
              </div>
            ) : (
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={`Mở ảnh trang ${image.pageIndex + 1} ở cỡ đầy đủ`}
              >
                <span className="relative block h-32 w-24 overflow-hidden rounded-md border border-slate-300 transition-colors hover:border-teal-500 dark:border-slate-600">
                  {/* Ảnh nằm sau signed URL ngắn hạn nên tối ưu hoá của
                      next/image không dùng được: URL đổi mỗi lần tải và host
                      Storage không nằm trong allowlist remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`Ảnh bài làm trang ${image.pageIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-slate-900/70 py-0.5 text-center text-[10px] text-white">
                    Trang {image.pageIndex + 1}
                  </span>
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
