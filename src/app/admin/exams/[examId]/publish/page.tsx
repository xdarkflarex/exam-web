'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import GlobalHeader from '@/components/GlobalHeader'
import {
  isPracticeExam,
  toLocalDateInput,
  toLocalDateTimeInput,
  fromDateInput,
  fromDateTimeInput,
} from '@/lib/exam/exam-schedule'

interface ExamConfig {
  id: string
  title: string
  description: string | null
  duration: number
  start_time: string | null
  end_time: string | null
  max_attempts: number
  show_results_immediately: boolean
  allow_review: boolean
  is_published: boolean
  exam_mode: 'practice' | 'simulation'
}

/**
 * HAI LOẠI ĐỀ, HAI CÁCH ĐẶT THỜI GIAN — và đây là chỗ trước nay trộn chúng làm một.
 *
 * `simulation` (thi thử, thi học kì) cần ĐỒNG HỒ ĐẾM NGƯỢC: `duration` phút kể
 * từ lúc học sinh bấm bắt đầu. `practice` (ôn tập theo chương) thì không — bài
 * ôn tập chỉ cần một KHUNG NGÀY để thúc học sinh làm xong, còn làm bao lâu là
 * việc của học sinh.
 *
 * Runtime đã hiểu đúng chuyện này từ đầu: `duration = 0` nghĩa là không giới hạn
 * (`src/app/exam/prepare/[examId]/page.tsx`), và trigger chốt hạn nộp phía server
 * (`20260722`) chỉ chạy khi `exam_mode = 'simulation'`. Trang tạo đề cũng ghi
 * đúng `duration: mode === 'practice' ? 0 : duration`.
 *
 * CHÍNH TRANG NÀY LÀM HỎNG. Ba lỗi cùng một chỗ:
 *   1. `setDuration(data.duration || 90)` — `0` là giá trị falsy, nên đề ôn tập
 *      lưu đúng 0 vẫn hiện thành 90 trên form;
 *   2. ô "Thời gian làm bài" hiện cho cả đề ôn tập;
 *   3. `handleSave` ghi `duration: duration` vô điều kiện.
 * Hệ quả: giáo viên tạo đề ôn tập (0 phút, đúng), rồi mở trang này để xuất bản —
 * bắt buộc phải mở — và cú lưu đó biến nó thành đề 90 phút có đếm ngược. Không
 * có thông báo nào, vì về mặt kỹ thuật không có gì sai.
 *
 * Đề ôn tập đã lỡ dính 90 phút trước bản sửa này thì dọn bằng
 * `supabase/migrations/20260905_practice_exams_no_timer.sql`.
 *
 * Phần quy đổi ngày/giờ nằm ở `src/lib/exam/exam-schedule.ts` — hàm thuần, có
 * test, vì lệch múi giờ là loại lỗi vẫn hiện ra một con số trông hợp lý.
 */

export default function ExamPublishPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const supabase = createClient()

  const [exam, setExam] = useState<ExamConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(90)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [showResultsImmediately, setShowResultsImmediately] = useState(true)
  const [allowReview, setAllowReview] = useState(true)
  const [isPublished, setIsPublished] = useState(false)

  useEffect(() => {
    if (examId) {
      fetchExam()
    }
  }, [examId])

  const fetchExam = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select(`
          id,
          title,
          description,
          duration,
          start_time,
          end_time,
          max_attempts,
          show_results_immediately,
          allow_review,
          is_published,
          exam_mode
        `)
        .eq('id', examId)
        .single()

      if (error) {
        console.error('Fetch exam error:', error)
        setError('Không thể tải thông tin bài thi')
        setLoading(false)
        return
      }

      setExam(data)

      // Pre-fill form fields
      const practice = isPracticeExam(data.exam_mode)
      setTitle(data.title || '')
      setDescription(data.description || '')
      /* `?? 90` chứ KHÔNG `|| 90`: `duration = 0` là "không giới hạn", một giá
         trị hợp lệ và có nghĩa, nhưng nó falsy nên `||` nuốt mất. Đề ôn tập ép
         về 0 luôn — ô nhập không hiện thì không có gì để giữ. */
      setDuration(practice ? 0 : (data.duration ?? 90))
      /* Hai ô này đổi KIỂU theo loại đề: đề ôn tập dùng `type="date"`, đề thi
         dùng `type="datetime-local"`. `exam_mode` không sửa được ở trang này nên
         kiểu đã chọn lúc tải là cố định trong suốt vòng đời trang — nhưng mọi
         chỗ đọc/ghi hai biến này đều phải hỏi lại `practice`, đừng đoán. */
      setStartTime(practice ? toLocalDateInput(data.start_time) : toLocalDateTimeInput(data.start_time))
      setEndTime(practice ? toLocalDateInput(data.end_time) : toLocalDateTimeInput(data.end_time))
      setMaxAttempts(data.max_attempts || 1)
      setShowResultsImmediately(data.show_results_immediately ?? true)
      setAllowReview(data.allow_review ?? true)
      setIsPublished(data.is_published ?? false)
      
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Vui lòng nhập tên bài thi')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const practice = isPracticeExam(exam?.exam_mode)
      const updateData: any = {
        title: title.trim(),
        description: description.trim() || null,
        /* Đề ôn tập LUÔN ghi 0. Không lấy từ `duration` state — kể cả khi state
           đúng là 0, đọc qua state là để ngỏ đường cho một lần sửa sau vô tình
           nối lại ô nhập rồi ghi 90 vào đây. Hằng số ở đây nói rõ ý định. */
        duration: practice ? 0 : duration,
        start_time: practice ? fromDateInput(startTime, 'start') : fromDateTimeInput(startTime),
        end_time: practice ? fromDateInput(endTime, 'end') : fromDateTimeInput(endTime),
        max_attempts: maxAttempts,
        show_results_immediately: showResultsImmediately,
        allow_review: allowReview,
        is_published: isPublished
      }

      const { error } = await supabase
        .from('exams')
        .update(updateData)
        .eq('id', examId)

      if (error) {
        console.error('Update exam error:', error)
        setError('Không thể lưu cấu hình: ' + error.message)
        setSaving(false)
        return
      }

      setSuccess('Đã lưu cấu hình thành công!')
      setSaving(false)
      
      // Refresh exam data
      fetchExam()
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setSaving(false)
    }
  }

  const handlePublishToggle = async () => {
    const newPublishState = !isPublished
    setIsPublished(newPublishState)
    
    // Auto-save when toggling publish state
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase
        .from('exams')
        .update({ is_published: newPublishState })
        .eq('id', examId)

      if (error) {
        console.error('Publish toggle error:', error)
        setError('Không thể thay đổi trạng thái xuất bản')
        setIsPublished(!newPublishState) // Revert
        setSaving(false)
        return
      }

      // Auto-create announcement when publishing
      if (newPublishState && title && exam?.exam_mode === 'simulation') {
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + 7) // Show for 7 days
        
        await supabase
          .from('announcements')
          .insert({
            title: `Đề thi mới: ${title}`,
            content: description || 'Đề thi mới đã được xuất bản. Đăng nhập để làm bài ngay!',
            type: 'new_exam',
            link_url: `/exam/prepare/${examId}`,
            link_text: 'Làm bài ngay',
            is_active: true,
            end_date: endDate.toISOString()
          })
      }

      setSuccess(newPublishState ? 'Đã xuất bản bài thi!' : 'Đã hủy xuất bản bài thi!')
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('Lỗi kết nối')
      setIsPublished(!newPublishState) // Revert
      setSaving(false)
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins} phút`
  }

  const practiceExam = isPracticeExam(exam?.exam_mode)

  /* So bằng chuỗi 'YYYY-MM-DD' được vì định dạng đó sắp theo thứ tự từ điển
     trùng với thứ tự thời gian. Chỉ cảnh báo, không chặn lưu: giáo viên có thể
     đang sửa dở và sẽ đổi nốt ô kia. */
  const dateRangeInvalid = practiceExam && !!startTime && !!endTime && endTime < startTime

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Cấu hình bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-slate-500 dark:text-slate-400">Đang tải cấu hình...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !exam) {
    return (
      <div className="min-h-screen bg-sky-50">
        <GlobalHeader title="Cấu hình bài thi" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Lỗi</h1>
            <p className="text-slate-500 dark:text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50">
      <GlobalHeader title="Cấu hình bài thi" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Cấu hình & Xuất bản</h1>
            <p className="text-slate-600 dark:text-slate-300">{exam?.title}</p>
          </div>
          <button
            onClick={() => router.push(`/admin/exams/${examId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-100 space-y-8">
          
          {/* Basic Info */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Thông tin cơ bản</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Tên bài thi <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Nhập tên bài thi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Mô tả bài thi
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Mô tả chi tiết về bài thi (tùy chọn)"
                />
              </div>
            </div>
          </div>

          {/* Time Settings */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {practiceExam ? 'Hạn làm bài' : 'Cài đặt thời gian'}
            </h2>

            {practiceExam ? (
              /* Đề ôn tập: KHÔNG có ô "thời gian làm bài". Ôn tập theo chương mà
                 bấm giờ như đề thi thì học sinh bỏ dở giữa chừng — cái cần ở đây
                 là một khung ngày để thúc, không phải đồng hồ đếm ngược. Ô nhập
                 dùng `type="date"`: giờ phút không có nghĩa gì với hạn nộp, mà
                 hiện ra thì lại mời người dùng đặt một con số vô nghĩa. */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Mở từ ngày
                    </label>
                    <input
                      type="date"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Để trống = mở ngay khi xuất bản
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Hạn cuối
                    </label>
                    <input
                      type="date"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Hết ngày này (23:59) là đóng. Để trống = không hạn.
                    </p>
                  </div>
                </div>
                {dateRangeInvalid && (
                  <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
                    Hạn cuối đang trước ngày mở — học sinh sẽ không có ngày nào làm được bài.
                  </p>
                )}
                <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-600 dark:text-slate-300">
                  Đề ôn tập <strong>không đếm ngược</strong>. Học sinh làm bao lâu tuỳ ý, miễn
                  là xong trước hạn cuối; làm dở thoát ra vẫn vào lại được.
                </p>
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Thời gian làm bài (phút)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                    min={10}
                    max={300}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{formatDuration(duration)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Thời gian bắt đầu
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Để trống = không giới hạn</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Thời gian kết thúc
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Để trống = không giới hạn</p>
                </div>
              </div>
            )}
          </div>

          {/* Attempt & Result Rules */}
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Quy tắc làm bài & kết quả</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Số lần làm tối đa
                </label>
                <input
                  type="number"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
                  min={1}
                  max={10}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showResultsImmediately}
                    onChange={(e) => setShowResultsImmediately(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 border-slate-300 dark:border-slate-600 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Hiện kết quả ngay</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Học sinh thấy điểm sau khi nộp bài</p>
                  </div>
                </label>
              </div>
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowReview}
                    onChange={(e) => setAllowReview(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 border-slate-300 dark:border-slate-600 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cho phép xem lại</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Học sinh có thể xem lại bài làm</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Publish Section */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Trạng thái xuất bản</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {isPublished ? 'Bài thi đã được xuất bản và học sinh có thể làm bài' : 'Bài thi đang ở trạng thái nháp'}
                </p>
              </div>
              <button
                onClick={handlePublishToggle}
                disabled={saving}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  isPublished
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPublished ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
                {isPublished ? 'Hủy xuất bản' : 'Xuất bản bài thi'}
              </button>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Lưu cấu hình
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
