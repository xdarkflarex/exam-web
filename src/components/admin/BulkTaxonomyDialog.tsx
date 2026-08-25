'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { suggestTopic, type TopicLike } from '@/lib/questions/classify'

/**
 * Phân loại lại hàng loạt cho các câu đang được chọn ở `/admin/questions`.
 *
 * Hai chế độ, dùng cho hai tình huống khác nhau:
 *
 *  - GÁN THỦ CÔNG — người soạn đã biết chính xác nhánh đúng. Tất định tuyệt
 *    đối, nhanh nhất, và là đường nên đi khi đã biết mình muốn gì.
 *  - GỢI Ý TỰ ĐỘNG — máy đọc nội dung, đề xuất chủ đề theo bảng luật trong
 *    `src/lib/questions/classify.ts`. Dùng khi cần rà một mớ câu mà chưa biết
 *    câu nào sai.
 *
 * KHÔNG DÙNG AI. Đây là công cụ đi SỬA những câu mà AI đã phân loại sai; hỏi
 * lại cùng một mô hình phần lớn sẽ ra lại cùng kết quả sai. Luật thì đọc được
 * và sửa một lần là hết sai.
 *
 * MỌI THAY ĐỔI ĐỀU QUA MÀN XEM TRƯỚC. Ghi đè taxonomy hàng loạt không có
 * đường lùi tự động, nên số câu bị ảnh hưởng phải hiện ra trước khi bấm.
 */

interface Topic extends TopicLike {
  id: string
  name: string
}
interface Category {
  id: string
  name: string
  topic_id: string
}
interface Section {
  id: string
  name: string
  category_id: string
  topic_id: string
}
interface Subsection {
  id: string
  name: string
  section_id: string
}

export interface BulkQuestion {
  id: string
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
  questions: BulkQuestion[]
  topics: Topic[]
  categories: Category[]
  sections: Section[]
  subsections: Subsection[]
  /** Gọi sau khi ghi xong để trang tải lại danh sách. */
  onApplied: () => void
}

type Mode = 'manual' | 'auto'

/** Ghi theo lô: PostgREST có trần kích thước body, và lô nhỏ thì lỗi cũng nhỏ. */
const CHUNK = 200

export default function BulkTaxonomyDialog({
  open,
  onClose,
  questions,
  topics,
  categories,
  sections,
  subsections,
  onApplied,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<Mode>('manual')
  const [topicId, setTopicId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subsectionId, setSubsectionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  /** Câu bị người dùng bỏ tick ở chế độ gợi ý. */
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const visibleCategories = useMemo(
    () => (topicId ? categories.filter((item) => item.topic_id === topicId) : []),
    [categories, topicId]
  )
  const visibleSections = useMemo(
    () => (categoryId ? sections.filter((item) => item.category_id === categoryId) : []),
    [sections, categoryId]
  )
  const visibleSubsections = useMemo(
    () => (sectionId ? subsections.filter((item) => item.section_id === sectionId) : []),
    [subsections, sectionId]
  )

  /** Gợi ý cho từng câu; `null` nghĩa là máy không đủ chắc và sẽ bỏ qua câu đó. */
  const proposals = useMemo(() => {
    if (mode !== 'auto') return []
    return questions.map((question) => ({
      question,
      suggestion: suggestTopic(question.content, topics),
    }))
  }, [mode, questions, topics])

  const applicable = proposals.filter(
    (item) => item.suggestion !== null && !skipped.has(item.question.id)
  )
  const unknown = proposals.filter((item) => item.suggestion === null)

  const manualReady = topicId !== ''
  const targetCount = mode === 'manual' ? questions.length : applicable.length

  async function apply() {
    setSaving(true)
    setError(null)

    /*
      Gán tới tầng nào thì XOÁ các tầng dưới.

      `question_taxonomy` là một đường đi trong cây. Đổi chủ đề mà giữ nguyên
      `section_id` cũ sẽ tạo ra một dòng mà section không thuộc topic — dữ liệu
      tự mâu thuẫn, và mọi bộ lọc theo cây sẽ đọc sai từ đó trở đi.
    */
    const rows =
      mode === 'manual'
        ? questions.map((question) => ({
            question_id: question.id,
            topic_id: topicId || null,
            category_id: categoryId || null,
            section_id: sectionId || null,
            subsection_id: subsectionId || null,
          }))
        : applicable.map((item) => ({
            question_id: item.question.id,
            topic_id: item.suggestion!.topicId,
            category_id: null,
            section_id: null,
            subsection_id: null,
          }))

    try {
      let written = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK)
        const { error: upsertError } = await supabase
          .from('question_taxonomy')
          .upsert(batch, { onConflict: 'question_id' })
        if (upsertError) throw upsertError
        written += batch.length
      }
      setDone(written)
      onApplied()
    } catch (caught) {
      console.error('Bulk taxonomy update failed:', caught)
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(
        `Không ghi được phân loại: ${message}. Nếu lỗi nhắc tới quyền (RLS), tài khoản của bạn có thể chưa đủ quyền ghi bảng question_taxonomy.`
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[var(--background-card)] shadow-2xl dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700">
          <div>
            <h2 className="font-baloo text-lg font-bold text-slate-800 dark:text-white">
              Phân loại lại {questions.length} câu đã chọn
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ghi đè phân loại hiện tại. Không có nút hoàn tác — xem kỹ số ở nút áp dụng.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done !== null ? (
          <div className="p-8 text-center">
            <Check className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-slate-800 dark:text-white">
              Đã cập nhật phân loại cho {done} câu.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="btn-action mt-5 rounded-xl bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700"
            >
              Xong
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b border-slate-200 px-5 pt-4 dark:border-slate-700">
              {(
                [
                  ['manual', 'Gán vào một nhánh'],
                  ['auto', 'Gợi ý theo nội dung'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === value
                      ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {mode === 'manual' ? (
                <div className="space-y-4">
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Chọn tới tầng nào thì các tầng dưới bị xoá. Ví dụ chỉ chọn Chủ đề thì
                    Chuyên đề / Mục / Mục con của các câu này sẽ trống — để nhánh cũ không
                    còn trỏ sang một chủ đề khác.
                  </p>

                  <Field label="Chủ đề" required>
                    <select
                      value={topicId}
                      onChange={(event) => {
                        setTopicId(event.target.value)
                        setCategoryId('')
                        setSectionId('')
                        setSubsectionId('')
                      }}
                      className={selectClass}
                    >
                      <option value="">— Chọn chủ đề —</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Chuyên đề">
                    <select
                      value={categoryId}
                      onChange={(event) => {
                        setCategoryId(event.target.value)
                        setSectionId('')
                        setSubsectionId('')
                      }}
                      disabled={!topicId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleCategories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Mục">
                    <select
                      value={sectionId}
                      onChange={(event) => {
                        setSectionId(event.target.value)
                        setSubsectionId('')
                      }}
                      disabled={!categoryId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleSections.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Mục con">
                    <select
                      value={subsectionId}
                      onChange={(event) => setSubsectionId(event.target.value)}
                      disabled={!sectionId}
                      className={selectClass}
                    >
                      <option value="">— Không đặt —</option>
                      {visibleSubsections.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                    <span>
                      Máy đọc nội dung và đối chiếu bảng luật — không gọi AI, nên chạy lại
                      luôn ra cùng kết quả. Chế độ này chỉ đặt <strong>Chủ đề</strong>; các
                      tầng dưới để trống.
                    </span>
                  </p>

                  {unknown.length > 0 && (
                    <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        {unknown.length} câu không đủ dấu hiệu để kết luận, sẽ được bỏ qua.
                        Máy không đoán bừa — những câu này cần gán tay.
                      </span>
                    </p>
                  )}

                  {applicable.length === 0 ? (
                    <p className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Không có câu nào máy đủ chắc để đề xuất.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {proposals
                        .filter((item) => item.suggestion !== null)
                        .map(({ question, suggestion }) => {
                          const isSkipped = skipped.has(question.id)
                          return (
                            <li key={question.id} className="flex items-start gap-3 py-3">
                              <input
                                type="checkbox"
                                checked={!isSkipped}
                                onChange={() =>
                                  setSkipped((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(question.id)) next.delete(question.id)
                                    else next.add(question.id)
                                    return next
                                  })
                                }
                                className="mt-1 h-4 w-4 accent-teal-600"
                                aria-label={`Áp dụng gợi ý cho câu ${question.id}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                                  {question.content.replace(/\s+/g, ' ').slice(0, 160)}
                                </p>
                                <p className="mt-1 text-xs">
                                  <span className="font-semibold text-teal-700 dark:text-teal-300">
                                    {suggestion!.topicName}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {' '}
                                    · {suggestion!.signals.join(', ')}
                                  </span>
                                </p>
                              </div>
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={saving || targetCount === 0 || (mode === 'manual' && !manualReady)}
                className="btn-action inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Áp dụng cho {targetCount} câu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-[var(--background-raised)] px-3 py-2.5 text-sm text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
