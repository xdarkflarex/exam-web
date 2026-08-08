'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Question, ExamData, QuestionType } from '@/types'
import MathContent, { MathProvider } from './MathContent'
import ConfirmModal from './ConfirmModal'
import ExamSidebar from './ExamSidebar'
import QuestionImage from './QuestionImage'
import { useLoading } from '@/contexts/LoadingContext'
import { useExamAntiCheat } from '@/hooks/useExamAntiCheat'

interface StudentAnswer {
  questionId: string
  questionType: QuestionType
  selectedAnswer?: string
  selectedAnswers?: Record<string, boolean>
  textAnswer?: string
}

interface ExamRunnerProps {
  attemptId: string
  examData: ExamData
  studentId: string
  startTime: string
}

interface OcrUiState {
  status: 'working' | 'done' | 'error'
  message: string
  warnings?: string[]
}

/** Một ảnh học sinh đã nộp cho một câu, dùng để hiện danh sách và nút xoá. */
interface UploadedImage {
  uploadId: string
  pageIndex: number
  /** URL blob cục bộ để xem lại ngay, không cần tải lại từ Storage. */
  previewUrl: string
  /**
   * Text máy đọc được từ ĐÚNG ảnh này. KHÔNG hiện cho học sinh (quyết định của
   * chủ dự án 2026-08-07: OCR chạy ngầm, học sinh chỉ nộp ảnh).
   *
   * Giữ theo từng ảnh chứ không nối vào một chuỗi chung, vì như vậy xoá ảnh thì
   * xoá được đúng phần text của nó. Bản trước nối thẳng vào ô nhập nên xoá ảnh
   * không gỡ được text — chấp nhận được khi học sinh đã đọc và sửa text đó, nhưng
   * bây giờ họ không thấy nó nữa, nên để lại text của một ảnh đã xoá là ghi vào
   * bài làm thứ học sinh không hề biết.
   *
   * `null` = OCR chưa xong hoặc đã thất bại. Ảnh vẫn được lưu để giáo viên đọc.
   */
  ocrText: string | null
}

export default function ExamRunner({ attemptId, examData, startTime }: ExamRunnerProps) {
  const router = useRouter()
  const supabase = createClient()
  const { showLoading, hideLoading } = useLoading()
  
  // ============================================
  // ANTI-CHEAT TRACKING
  // Monitors suspicious activity during exam (observational only, no logout)
  // ============================================
  useExamAntiCheat({ attemptId, enabled: true })
  
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [currentPart, setCurrentPart] = useState(1)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | undefined>()
  
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showTimeUpModal, setShowTimeUpModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ============================================
  // ẢNH BÀI TỰ LUẬN + OCR
  //
  // Luồng ba bước (đổi từ 2026-08-06, migration 20260809):
  //   1. Thu nhỏ + xoá EXIF + băm ngay trên máy học sinh (`client-image.ts`).
  //   2. Xin signed URL ở /api/essay-ai/upload-url rồi đưa byte THẲNG lên bucket
  //      private. Ảnh không đi qua serverless function — vừa tránh giới hạn body
  //      vừa không trả tiền băng thông hai lần.
  //   3. Gọi /api/essay-ai/ocr với `uploadId`; server tự tải ảnh về, gọi Gemini
  //      bằng key server-only và ghi bản ghi chất lượng gắn với đúng tấm ảnh đó.
  //
  // ẢNH ĐƯỢC LƯU LẠI, khác bản trước. Ảnh là bản gốc của hồ sơ; text OCR chỉ là
  // bản dẫn xuất do học sinh xác nhận. Học sinh sửa/xoá được cho tới khi nộp;
  // sau khi nộp chỉ xem lại.
  //
  // Text nhận dạng được NỐI vào ô trả lời để học sinh tự kiểm tra và sửa trước
  // khi nộp — OCR chữ viết tay môn Toán không đáng tin tuyệt đối.
  // ============================================
  const [ocrState, setOcrState] = useState<Record<string, OcrUiState>>({})
  const [uploads, setUploads] = useState<Record<string, UploadedImage[]>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Nạp lại ảnh đã nộp khi mở/tải lại trang.
  //
  // `uploads` là state, nên F5 giữa giờ thi làm mất sạch — trong khi ảnh vẫn nằm
  // trên Storage. Không có effect này, học sinh tải lại trang sẽ thấy phần ảnh
  // TRỐNG dù họ đã chụp, rồi chụp lại từ đầu (tốn quota, tốn tiền OCR), và
  // `recoverMissingOcrText` cũng không có gì để vá vì nó duyệt trên state.
  //
  // `ocrText` cố ý để `null`: bảng snapshot KHÔNG lưu text bài làm (quyết định
  // của 20260807), nên text đã đọc không lấy lại được từ database. Đó chính là
  // lý do phải OCR lại lúc nộp.
  useEffect(() => {
    let cancelled = false

    const loadExistingUploads = async () => {
      const { data, error } = await supabase
        .from('essay_answer_uploads')
        .select('id, question_id, page_index, storage_path')
        .eq('attempt_id', attemptId)
        .is('deleted_at', null)
        .order('page_index', { ascending: true })

      if (cancelled || error || !data || data.length === 0) return

      const grouped: Record<string, UploadedImage[]> = {}

      for (const row of data) {
        const { data: signed } = await supabase.storage
          .from('essay-uploads')
          .createSignedUrl(String(row.storage_path), 3600)

        if (!signed?.signedUrl) continue

        const questionId = String(row.question_id)
        grouped[questionId] = grouped[questionId] ?? []
        grouped[questionId].push({
          uploadId: String(row.id),
          pageIndex: Number(row.page_index),
          previewUrl: signed.signedUrl,
          ocrText: null,
        })
      }

      // Gộp thay vì ghi đè: học sinh có thể đã chụp thêm ảnh trong lúc truy vấn
      // này chạy, và ghi đè sẽ xoá mất ảnh vừa chụp cùng text OCR của nó.
      if (!cancelled) {
        setUploads((prev) => {
          const merged = { ...prev }
          for (const [questionId, images] of Object.entries(grouped)) {
            const existing = merged[questionId] ?? []
            const existingIds = new Set(existing.map((image) => image.uploadId))
            merged[questionId] = [
              ...existing,
              ...images.filter((image) => !existingIds.has(image.uploadId)),
            ].sort((a, b) => a.pageIndex - b.pageIndex)
          }
          return merged
        })
      }
    }

    void loadExistingUploads()

    return () => {
      cancelled = true
    }
  }, [attemptId, supabase])

  const setOcrFor = (questionId: string, next: OcrUiState) => {
    setOcrState((prev) => ({ ...prev, [questionId]: next }))
  }

  const handleImageSelected = async (questionId: string, file: File | null) => {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setOcrFor(questionId, { status: 'error', message: 'Hãy chọn một tệp ảnh.' })
      return
    }

    let previewUrl: string | null = null

    try {
      setOcrFor(questionId, { status: 'working', message: 'Đang xử lý ảnh...' })

      // Bước 1. Cả ba việc (thu nhỏ, xoá EXIF/GPS, băm) làm trên máy học sinh.
      const { prepareImageForUpload } = await import('@/lib/essay-ai/client-image')
      const prepared = await prepareImageForUpload(file)

      // Bước 2a. Xin chỗ ghi. Server đặt đường dẫn và chỉ số trang, không phải
      // client — đường dẫn là thứ policy Storage dùng để kiểm quyền.
      setOcrFor(questionId, { status: 'working', message: 'Đang tải ảnh lên...' })

      const initResponse = await fetch('/api/essay-ai/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          questionId,
          mimeType: prepared.mimeType,
          byteSize: prepared.byteSize,
          contentHash: prepared.contentHash,
        }),
      })

      const init = (await initResponse.json()) as {
        uploadId?: string
        path?: string
        token?: string
        pageIndex?: number
        error?: string
      }

      if (!initResponse.ok || !init.uploadId || !init.path || !init.token) {
        setOcrFor(questionId, {
          status: 'error',
          message: init.error || 'Không chuẩn bị được chỗ lưu ảnh. Bạn có thể gõ tay bài làm.',
        })
        return
      }

      // Bước 2b. Byte đi thẳng từ điện thoại tới Storage.
      const { error: uploadError } = await supabase.storage
        .from('essay-uploads')
        .uploadToSignedUrl(init.path, init.token, prepared.blob, {
          contentType: prepared.mimeType,
        })

      if (uploadError) {
        setOcrFor(questionId, {
          status: 'error',
          message: 'Không tải được ảnh lên. Kiểm tra kết nối rồi thử lại.',
        })
        return
      }

      // Ảnh đã lưu an toàn từ đây. Kể cả OCR đổ ở bước 3, giáo viên vẫn đọc được
      // ảnh bằng mắt — nên hiện nó vào danh sách NGAY, trước khi gọi OCR.
      previewUrl = URL.createObjectURL(prepared.blob)
      const stored: UploadedImage = {
        uploadId: init.uploadId,
        pageIndex: init.pageIndex ?? 0,
        previewUrl,
        ocrText: null,
      }
      setUploads((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] ?? []), stored],
      }))

      // Bước 3. Nhận dạng.
      setOcrFor(questionId, { status: 'working', message: 'Đang nhận dạng chữ viết...' })

      const ocrResponse = await fetch('/api/essay-ai/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, uploadId: init.uploadId }),
      })

      const payload = (await ocrResponse.json()) as {
        text?: string
        warnings?: string[]
        snapshotWritten?: boolean
        error?: string
      }

      if (!ocrResponse.ok || typeof payload.text !== 'string') {
        // Ảnh vẫn còn trên Storage và vẫn trong danh sách — nói rõ điều đó, đừng
        // để học sinh tưởng mất công chụp.
        setOcrFor(questionId, {
          status: 'error',
          message:
            (payload.error || 'Không nhận dạng được ảnh.') +
            ' Ảnh vẫn được lưu và giáo viên sẽ đọc; bạn cũng có thể gõ tay bài làm.',
        })
        return
      }

      // Gắn text vào ĐÚNG ảnh vừa đọc, KHÔNG đổ vào ô nhập. Học sinh không thấy
      // text này; nó chỉ được ghép vào bài làm lúc nộp (`buildEssayAnswerText`).
      const recognizedText = payload.text
      setUploads((prev) => ({
        ...prev,
        [questionId]: (prev[questionId] ?? []).map((image) =>
          image.uploadId === init.uploadId ? { ...image, ocrText: recognizedText } : image
        ),
      }))

      // `snapshotWritten === false` không chặn bài làm — học sinh vẫn nộp
      // được — nhưng đáng nói ra: thiếu bản ghi nghĩa là bài này sẽ luôn về
      // tay giáo viên duyệt, không phụ thuộc AI chấm có tự tin đến đâu.
      //
      // Cảnh báo OCR (`warnings`) cố ý KHÔNG hiện nữa: chúng chỉ có ích khi học
      // sinh đọc lại được text để sửa, mà giờ họ không thấy text. Hiện "có công
      // thức đọc không chắc" mà không cho cách sửa chỉ làm họ lo giữa giờ thi.
      // Cảnh báo vẫn được lưu trong `essay_ocr_snapshots` và vẫn chặn auto-chốt.
      setOcrFor(questionId, {
        status: 'done',
        message:
          payload.snapshotWritten === false
            ? 'Đã nhận ảnh. (Hệ thống không lưu được bản ghi chất lượng cho lần chụp này; bài sẽ được giáo viên chấm.)'
            : 'Đã nhận ảnh và đọc xong bài làm.',
      })
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setOcrFor(questionId, {
        status: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Không xử lý được ảnh. Bạn có thể gõ tay bài làm.',
      })
    } finally {
      // Reset input để chọn lại đúng tệp đó vẫn kích hoạt onChange.
      const input = fileInputRefs.current[questionId]
      if (input) input.value = ''
    }
  }

  /**
   * Xoá một ảnh. Đi qua route thay vì gọi `storage.remove()` trực tiếp: xoá mềm
   * dòng metadata và xoá tệp phải cùng xảy ra, và chỉ server làm được cả hai.
   *
   * Text OCR của ảnh đó mất theo, vì nó nằm trong chính object `UploadedImage`.
   * Đây là hành vi đúng từ khi OCR chạy ngầm: học sinh chưa từng thấy text ấy nên
   * không có sửa chữa nào của họ bị mất, và giữ lại text của một ảnh đã xoá là
   * đưa vào bài làm thứ họ không hề biết.
   */
  const handleDeleteUpload = async (questionId: string, uploadId: string) => {
    const before = uploads[questionId] ?? []
    const target = before.find((item) => item.uploadId === uploadId)

    // Bỏ khỏi UI ngay: học sinh đang giữa giờ thi, chờ round-trip mới thấy phản
    // hồi làm họ bấm lại nhiều lần.
    setUploads((prev) => ({
      ...prev,
      [questionId]: before.filter((item) => item.uploadId !== uploadId),
    }))

    try {
      const response = await fetch('/api/essay-ai/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, uploadId }),
      })

      if (!response.ok) {
        // Khôi phục danh sách: hiện sai trạng thái còn tệ hơn hiện lỗi, vì học
        // sinh sẽ tin là ảnh đã xoá trong khi giáo viên vẫn thấy nó.
        setUploads((prev) => ({ ...prev, [questionId]: before }))
        setOcrFor(questionId, {
          status: 'error',
          message: 'Không xoá được ảnh. Hãy thử lại.',
        })
        return
      }

      if (target) URL.revokeObjectURL(target.previewUrl)
    } catch {
      setUploads((prev) => ({ ...prev, [questionId]: before }))
      setOcrFor(questionId, {
        status: 'error',
        message: 'Không xoá được ảnh. Kiểm tra kết nối rồi thử lại.',
      })
    }
  }

  const allQuestions = [...examData.part1, ...examData.part2, ...examData.part3]
  const totalQuestions = allQuestions.length

  // Nguồn duy nhất cho tab điều hướng phần và các panel câu hỏi: trước đây ba
  // nút và ba lần gọi renderPart lặp cùng thông tin ở hai nơi, nên thêm/bớt phần
  // phải sửa hai chỗ mới khớp.
  const PARTS = [
    { number: 1, questions: examData.part1, label: 'Phần 1', title: 'Phần 1: Trắc nghiệm nhiều lựa chọn', startIndex: 0 },
    { number: 2, questions: examData.part2, label: 'Phần 2', title: 'Phần 2: Đúng / Sai', startIndex: examData.part1.length },
    { number: 3, questions: examData.part3, label: 'Phần 3', title: 'Phần 3: Trả lời ngắn và tự luận', startIndex: examData.part1.length + examData.part2.length },
  ] as const

  const getAnsweredQuestionIds = (): Set<string> => {
    const answered = new Set<string>()
    Object.keys(answers).forEach(qId => {
      const ans = answers[qId]
      if (ans.questionType === 'multiple_choice' && ans.selectedAnswer) {
        answered.add(qId)
      } else if (ans.questionType === 'true_false' && ans.selectedAnswers && Object.keys(ans.selectedAnswers).length > 0) {
        answered.add(qId)
      } else if ((ans.questionType === 'short_answer' || ans.questionType === 'essay') && ans.textAnswer?.trim()) {
        answered.add(qId)
      }
    })

    // Câu tự luận nộp bằng ẢNH mà không gõ chữ nào vẫn là đã làm. Thiếu vòng này
    // thì sidebar báo "chưa làm" và modal nộp bài đếm sai — học sinh chụp đủ ảnh
    // vẫn thấy cảnh báo bỏ trống, đúng loại lỗi làm người ta mất bình tĩnh giữa
    // giờ thi.
    Object.keys(uploads).forEach((questionId) => {
      if ((uploads[questionId]?.length ?? 0) > 0) answered.add(questionId)
    })

    return answered
  }

  const handleMultipleChoiceAnswer = (questionId: string, answerId: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        questionType: 'multiple_choice',
        selectedAnswer: answerId
      }
    }))
  }

  const handleTrueFalseAnswer = (questionId: string, statementIndex: number, value: boolean) => {
    setAnswers(prev => {
      const existing = prev[questionId]?.selectedAnswers || {}
      return {
        ...prev,
        [questionId]: {
          questionId,
          questionType: 'true_false',
          selectedAnswers: {
            ...existing,
            [statementIndex]: value
          }
        }
      }
    })
  }

  /**
   * Bài làm cuối của một câu tự luận = phần học sinh GÕ + text OCR của các ảnh
   * còn lại, theo thứ tự trang.
   *
   * Ghép ở đây, lúc nộp, thay vì đổ vào ô nhập ngay khi đọc xong ảnh. Hệ quả cần
   * biết: học sinh không đọc lại được bản máy đọc, nên không ai sửa được lỗi OCR
   * trước khi chấm. Cổng `low_ocr_confidence` / `math_region_uncertain` trong
   * `auto-finalize.ts` là lớp bảo vệ duy nhất còn lại cho phần đó.
   *
   * Ảnh có `ocrText === null` (OCR chưa xong hoặc đã lỗi) bị bỏ qua ở đây, nhưng
   * dòng `essay_answer_uploads` của nó vẫn tồn tại — nên `fetchOcrProvenance` sẽ
   * thấy "có ảnh mà không có bản ghi chất lượng dùng được" và trả
   * `scanned_snapshot_missing`, tức bài về tay giáo viên. Đó là hướng đúng: thà
   * chậm hơn là chấm một bài thiếu mất một trang.
   */
  /**
   * Đọc lại OCR cho những ảnh có trên Storage mà state không có text.
   *
   * VÌ SAO CẦN. `ocrText` chỉ nằm trong React state. Học sinh tải lại trang giữa
   * giờ thi (F5, mất mạng rồi vào lại, điện thoại kill tab) thì state mất sạch
   * trong khi ảnh vẫn nằm nguyên trên Storage. Và vì OCR chạy ngầm — họ không
   * thấy text bao giờ — nên họ KHÔNG BIẾT là đã mất. Nộp xong câu đó
   * `text_answer` rỗng, `fetchQueue` loại nó ra, bài không được chấm, còn học
   * sinh tin là đã nộp đủ.
   *
   * Trước khi OCR chạy ngầm thì lỗi này vô hại: text nằm trong ô nhập, mất là
   * thấy ngay. Chính việc giấu text biến nó thành lỗi âm thầm.
   *
   * Chạy lúc nộp chứ không lúc mở lại trang: nộp là thời điểm duy nhất bắt buộc
   * phải có đủ text, và làm ở đây thì không tốn lời gọi OCR nào cho ảnh mà học
   * sinh sẽ xoá đi.
   *
   * Trả về map `uploadId -> text` cho phần vá; KHÔNG ghi vào state vì `setState`
   * là bất đồng bộ và `buildEssayAnswerText` chạy ngay sau đó sẽ đọc phải giá
   * trị cũ.
   */
  const recoverMissingOcrText = async (): Promise<Record<string, string>> => {
    const recovered: Record<string, string> = {}

    // Chỉ những ảnh đang thiếu text. Ảnh đã có text thì không đọc lại — vừa tốn
    // tiền vừa sinh thêm một dòng snapshot cho cùng một ảnh.
    const missing = Object.values(uploads)
      .flat()
      .filter((image) => image.ocrText === null)

    if (missing.length === 0) return recovered

    // Tuần tự, không song song: provider OCR có giới hạn tần suất, và bắn 12 lời
    // gọi cùng lúc lúc nộp bài là cách chắc chắn nhất để dính 429.
    for (const image of missing) {
      try {
        const response = await fetch('/api/essay-ai/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, uploadId: image.uploadId }),
        })
        const payload = (await response.json()) as { text?: string }
        if (response.ok && typeof payload.text === 'string') {
          recovered[image.uploadId] = payload.text
        }
      } catch {
        // Đọc lại hỏng thì bỏ qua ảnh đó. Bài vẫn nộp được, và worker sẽ thấy
        // "có ảnh mà không có bản ghi chất lượng dùng được" rồi đẩy về giáo
        // viên — đúng hướng an toàn. Chặn nộp bài vì OCR hỏng thì tệ hơn nhiều.
      }
    }

    return recovered
  }

  const buildEssayAnswerText = (
    questionId: string,
    recovered: Record<string, string> = {}
  ): string => {
    const typed = (answers[questionId]?.textAnswer ?? '').trim()

    const recognized = (uploads[questionId] ?? [])
      .slice()
      .sort((a, b) => a.pageIndex - b.pageIndex)
      // `recovered` là text vừa đọc lại cho ảnh mất text sau khi tải lại trang.
      // Ưu tiên `ocrText` sẵn có; `recovered` chỉ lấp chỗ trống.
      .map((image) => (image.ocrText ?? recovered[image.uploadId] ?? '').trim())
      .filter((text) => text.length > 0)

    return [typed, ...recognized].filter((part) => part.length > 0).join('\n\n').slice(0, 20000)
  }

  const handleTextAnswer = (questionId: string, questionType: 'short_answer' | 'essay', text: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        questionId,
        questionType,
        textAnswer: text
      }
    }))
  }

  const handleQuestionClick = (questionId: string, partNumber: number) => {
    setCurrentPart(partNumber)
    setCurrentQuestionId(questionId)
    
    setTimeout(() => {
      const element = questionRefs.current[questionId]
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  const handleTimeUp = () => {
    setShowTimeUpModal(true)
  }

  const handleSubmitClick = () => {
    setShowSubmitModal(true)
  }

  const handleSubmit = async () => {
    if (submitting) return
    
    setSubmitting(true)
    setShowSubmitModal(false)
    showLoading('Đang nộp bài thi...')

    try {
      // Vá text OCR bị mất do tải lại trang, TRƯỚC khi dựng payload nộp bài.
      // Không có bước này, ảnh vẫn còn mà bài làm rỗng — và học sinh không biết
      // vì họ chưa từng thấy text.
      const hasEssayQuestion = allQuestions.some((q) => q.question_type === 'essay')
      let recoveredOcr: Record<string, string> = {}

      if (hasEssayQuestion) {
        showLoading('Đang đọc lại ảnh bài làm...')
        recoveredOcr = await recoverMissingOcrText()
        showLoading('Đang nộp bài thi...')
      }

      const submissionPayload = allQuestions.map((question) => {
        const studentAnswer = answers[question.id]

        // Câu tự luận: ghép phần gõ tay với text OCR của ảnh ngay tại đây. Đây là
        // chỗ DUY NHẤT hai nguồn gặp nhau, nên cũng là chỗ duy nhất phải nhớ khi
        // đổi luồng ảnh về sau.
        const textAnswer =
          question.question_type === 'essay'
            ? buildEssayAnswerText(question.id, recoveredOcr) || null
            : studentAnswer?.textAnswer || null

        return {
          question_id: question.id,
          selected_answer: studentAnswer?.selectedAnswer || null,
          selected_answers: studentAnswer?.selectedAnswers || null,
          text_answer: textAnswer,
        }
      })

      const { error: submitError } = await supabase.rpc('submit_exam_attempt', {
        p_attempt_id: attemptId,
        p_answers: submissionPayload,
      })

      if (submitError) {
        console.error('Server-side submit error:', submitError.message)
        hideLoading()
        setErrorMessage(
          submitError.message.includes('submit_exam_attempt')
            ? 'Chức năng chấm tự luận chưa được cài đặt trên cơ sở dữ liệu.'
            : 'Không thể nộp bài. Vui lòng kiểm tra lại và thử lại.'
        )
        setShowErrorModal(true)
        setSubmitting(false)
        return
      }

      // Chấm tự luận NGAY, không chờ lượt cron kế tiếp: học sinh nộp xong phải
      // thấy điểm. `grade-mine` chỉ chấm attempt của chính người gọi và đi qua
      // đúng `runGradingBatch` như cron, nên không có cổng an toàn nào bị bỏ.
      const hasEssay = allQuestions.some((question) => question.question_type === 'essay')

      if (hasEssay) {
        showLoading('Đang chấm bài tự luận...')

        // Lỗi ở đây KHÔNG được chặn học sinh xem kết quả: bài đã nộp an toàn rồi,
        // và cron sẽ chấm ở lượt sau. Vì vậy không có nhánh nào set lỗi — chỉ ghi
        // log rồi đi tiếp. Trang kết quả tự hiển thị "đang chờ chấm" cho câu chưa
        // có điểm, nên trạng thái vẫn đúng với thực tế.
        try {
          const response = await fetch('/api/essay-ai/grade-mine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId }),
          })
          if (!response.ok) {
            console.warn('[ExamRunner] chấm ngay không thành công:', response.status)
          }
        } catch (gradeError) {
          console.warn(
            '[ExamRunner] không gọi được chấm ngay:',
            gradeError instanceof Error ? gradeError.message : 'unknown'
          )
        }
      }

      hideLoading()
      router.push(`/result/${attemptId}`)
    } catch (err) {
      console.error('Submit error:', err)
      hideLoading()
      setErrorMessage('Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.')
      setShowErrorModal(true)
      setSubmitting(false)
    }
  }

  const renderQuestion = (question: Question, globalIndex: number) => {
    return (
      <div 
        key={question.id} 
        id={`question-${question.id}`}
        ref={(el) => { questionRefs.current[question.id] = el }}
        className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 sm:p-6 mb-3 sm:mb-4 border border-slate-300 dark:border-slate-700 scroll-mt-20 sm:scroll-mt-24 shadow-sm"
      >
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          <span className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xs sm:text-sm font-bold">
            {globalIndex}
          </span>
          <div className="flex-1 min-w-0">
            <MathContent 
              content={question.content} 
              className="text-slate-800 dark:text-slate-200 text-sm sm:text-base"
            />
            {question.tikz_image_url && (
              <QuestionImage 
                src={question.tikz_image_url} 
                alt="Question diagram"
                className="mt-3 sm:mt-4 max-w-full"
              />
            )}
          </div>
        </div>

        {question.question_type === 'multiple_choice' && question.answers && (
          <div className="space-y-2 ml-0 sm:ml-10">
            {question.answers.map((answer, idx) => {
              const isSelected = answers[question.id]?.selectedAnswer === answer.id
              const optionLabel = String.fromCharCode(65 + idx)
              
              return (
                <button
                  key={answer.id}
                  type="button"
                  onClick={() => handleMultipleChoiceAnswer(question.id, answer.id)}
                  /* Trạng thái đã chọn trước đây chỉ có màu viền/nền. Thêm
                     aria-pressed để bàn phím và screen reader biết đáp án nào
                     đang chọn. */
                  aria-pressed={isSelected}
                  className={`w-full text-left p-2.5 sm:p-3 rounded-lg border transition-all flex items-center gap-2 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 ${
                    isSelected
                      ? 'border-teal-500 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isSelected
                      ? 'bg-teal-600 dark:bg-teal-500 text-white'
                      : 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                  }`}>
                    {optionLabel}
                  </span>
                  <MathContent
                    content={answer.content}
                    className="text-slate-700 dark:text-slate-300 text-sm sm:text-base"
                  />
                </button>
              )
            })}
          </div>
        )}

        {question.question_type === 'true_false' && (
          <div className="space-y-2 sm:space-y-3 ml-0 sm:ml-10">
            {(question.answers?.length ? question.answers : [0, 1, 2, 3].map((order_index) => ({
              id: `${question.id}-${order_index}`,
              question_id: question.id,
              content: '',
              is_correct: false,
              order_index,
            }))).map((statement, fallbackIndex) => {
              const statementIdx = statement.order_index ?? fallbackIndex
              const currentValue = answers[question.id]?.selectedAnswers?.[statementIdx]
              
              return (
                <div key={statementIdx} className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-lg bg-slate-100 dark:bg-slate-700">
                  <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 w-5 sm:w-6">
                    {String.fromCharCode(97 + statementIdx)})
                  </span>
                  <div className="min-w-0 flex-1">
                    {statement.content && (
                      <MathContent content={statement.content} className="mb-2 text-sm text-slate-700 dark:text-slate-200" />
                    )}
                    <div className="flex gap-1.5 sm:gap-2" role="group" aria-label={`Ý ${String.fromCharCode(97 + statementIdx)}`}>
                    <button
                      type="button"
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, true)}
                      aria-pressed={currentValue === true}
                      className={`px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-700 ${
                        currentValue === true
                          ? 'bg-green-500 text-white'
                          : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
                      }`}
                    >
                      Đúng
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTrueFalseAnswer(question.id, statementIdx, false)}
                      aria-pressed={currentValue === false}
                      className={`px-2.5 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-700 ${
                        currentValue === false
                          ? 'bg-red-500 text-white'
                          : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500'
                      }`}
                    >
                      Sai
                    </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {question.question_type === 'short_answer' && (
          <div className="ml-0 sm:ml-10">
            <input
              type="text"
              value={answers[question.id]?.textAnswer || ''}
              onChange={(e) => handleTextAnswer(question.id, 'short_answer', e.target.value)}
              placeholder="Nhập đáp án..."
              className="w-full p-2.5 sm:p-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900 outline-none transition-all text-sm sm:text-base"
            />
          </div>
        )}

        {question.question_type === 'essay' && (
          <div className="ml-0 space-y-2 sm:ml-10">
            <textarea
              value={answers[question.id]?.textAnswer || ''}
              onChange={(event) => handleTextAnswer(question.id, 'essay', event.target.value.slice(0, 20000))}
              placeholder="Trình bày lời giải, lập luận và kết luận của bạn..."
              rows={10}
              className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:focus:ring-teal-900 sm:text-base"
            />

            {/* Chụp ảnh bài làm -> upload -> OCR NGẦM. Text không hiện ra ô trên. */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/50">
              <input
                ref={(element) => {
                  fileInputRefs.current[question.id] = element
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  void handleImageSelected(question.id, event.target.files?.[0] ?? null)
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[question.id]?.click()}
                  disabled={ocrState[question.id]?.status === 'working'}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-600 dark:disabled:text-slate-400"
                >
                  {ocrState[question.id]?.status === 'working' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Đang nhận dạng...
                    </>
                  ) : (
                    <>📷 Chụp ảnh bài làm</>
                  )}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ảnh được thu nhỏ rồi lưu lại để giáo viên đối chiếu khi chấm.
                  Bạn xoá hoặc chụp lại được cho tới khi nộp bài; sau khi nộp chỉ
                  xem lại. Ảnh tự xoá sau 12 tháng.
                </span>
              </div>

              {/* Ảnh đã lưu cho câu này. Hiện luôn cả khi OCR đổ: ảnh vẫn là
                  bằng chứng giáo viên đọc được bằng mắt. */}
              {(uploads[question.id]?.length ?? 0) > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {uploads[question.id]?.map((image) => (
                    <li
                      key={image.uploadId}
                      className="relative h-24 w-20 overflow-hidden rounded-md border border-slate-300 dark:border-slate-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.previewUrl}
                        alt={`Ảnh bài làm trang ${image.pageIndex + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void handleDeleteUpload(question.id, image.uploadId)}
                        aria-label={`Xoá ảnh trang ${image.pageIndex + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-xs font-bold text-white transition-colors hover:bg-red-600"
                      >
                        ×
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 bg-slate-900/70 py-0.5 text-center text-[10px] text-white">
                        Trang {image.pageIndex + 1}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {ocrState[question.id] && (
                <div
                  role="status"
                  className={`mt-2 rounded-md p-2 text-xs ${
                    ocrState[question.id].status === 'error'
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                      : ocrState[question.id].status === 'done'
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <p>{ocrState[question.id].message}</p>
                  {(ocrState[question.id].warnings?.length ?? 0) > 0 && (
                    <ul className="mt-1 list-inside list-disc">
                      {ocrState[question.id].warnings?.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                Bài chỉ lưu khi nộp; đừng tải lại trang. Bạn có thể gõ ở ô trên,
                chụp ảnh bài viết tay, hoặc làm cả hai — cả hai đều được tính.
              </span>
              <span>{answers[question.id]?.textAnswer?.length || 0}/20.000</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderPart = (questions: Question[], partNumber: number, partTitle: string, startIndex: number) => {
    if (questions.length === 0) return null

    const isActive = currentPart === partNumber

    return (
      <div
        key={`part-${partNumber}`}
        role="tabpanel"
        id={`exam-part-panel-${partNumber}`}
        aria-labelledby={`exam-part-tab-${partNumber}`}
        /* Panel ẩn dùng `hidden` thay vì chỉ class CSS: nội dung câu hỏi của phần
           không xem vẫn nằm trong DOM (giữ câu trả lời đã nhập), nhưng phải nằm
           ngoài thứ tự tab và cây a11y — nếu không, Tab sẽ chạy qua hàng chục ô
           đáp án vô hình. */
        hidden={!isActive}
        className={isActive ? 'block' : 'hidden'}
      >
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{partTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{questions.length} câu hỏi</p>
        </div>
        {questions.map((q, idx) => renderQuestion(q, startIndex + idx + 1))}
      </div>
    )
  }

  return (
    <MathProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-20 lg:pb-0">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-300 dark:border-slate-700 px-4 sm:px-6 py-3 sm:py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="font-bold text-slate-800 dark:text-white text-base sm:text-lg line-clamp-1">{examData.examMeta.title}</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{examData.examMeta.subject}</p>
          </div>
        </div>

        {/* Responsive Layout */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Left: Questions */}
            <div className="flex-1 min-w-0">
              {/* Part Navigation - Scrollable on mobile.
                  Dùng semantics tab: ba nút này chuyển giữa các panel câu hỏi
                  cùng cấp, nên screen reader cần biết cái nào đang mở thay vì
                  chỉ nghe ba nút rời rạc cùng tên. */}
              <div
                className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide"
                role="tablist"
                aria-label="Các phần của đề thi"
              >
                {PARTS.map(({ number, questions, label }) => {
                  if (questions.length === 0) return null
                  const isActive = currentPart === number

                  return (
                    <button
                      key={number}
                      type="button"
                      role="tab"
                      id={`exam-part-tab-${number}`}
                      aria-selected={isActive}
                      aria-controls={`exam-part-panel-${number}`}
                      onClick={() => setCurrentPart(number)}
                      className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                        isActive
                          ? 'bg-teal-600 dark:bg-teal-600 text-white'
                          : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {label}
                      <span className="ml-1.5 text-xs opacity-70">{questions.length}</span>
                    </button>
                  )
                })}
              </div>

              {/* Questions */}
              {PARTS.map(({ number, questions, title, startIndex }) =>
                renderPart(questions, number, title, startIndex)
              )}
            </div>

            {/* Right: Sidebar */}
            <ExamSidebar
              examTitle={examData.examMeta.title}
              duration={examData.examMeta.duration}
              questions={allQuestions}
              answeredQuestions={getAnsweredQuestionIds()}
              currentQuestionId={currentQuestionId}
              onQuestionClick={handleQuestionClick}
              onSubmit={handleSubmitClick}
              onTimeUp={handleTimeUp}
              submitting={submitting}
              startTime={new Date(startTime)}
            />
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        <ConfirmModal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          onConfirm={handleSubmit}
          title="Xác nhận nộp bài"
          message={`Bạn đã làm ${getAnsweredQuestionIds().size}/${totalQuestions} câu. Bạn có chắc chắn muốn nộp bài?`}
          confirmText="Nộp bài"
          cancelText="Tiếp tục làm"
          type="warning"
        />

        {/* Time Up Modal */}
        <ConfirmModal
          isOpen={showTimeUpModal}
          onClose={() => {}}
          onConfirm={handleSubmit}
          title="Hết giờ làm bài!"
          message="Thời gian làm bài đã kết thúc. Bài làm của bạn sẽ được nộp tự động."
          confirmText="Xem kết quả"
          type="danger"
          showCancel={false}
        />

        {/* Error Modal */}
        <ConfirmModal
          isOpen={showErrorModal}
          onClose={() => setShowErrorModal(false)}
          onConfirm={() => setShowErrorModal(false)}
          title="Có lỗi xảy ra"
          message={errorMessage}
          confirmText="Đóng"
          type="danger"
          showCancel={false}
        />
      </div>
    </MathProvider>
  )
}
